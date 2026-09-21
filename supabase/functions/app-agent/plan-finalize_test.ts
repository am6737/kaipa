// finalizePlan is the shared post-processing for every plan-shaped output
// (single-shot, skeleton and chunked merge). These tests pin the behaviors
// the chunked-plan fallback depends on: deterministic duration fill, the
// strict/non-strict journey-null guard and endpoint-gap disclosure.
import { endpointDaysOffBoundRoute, fallbackPlan, finalizePlan, planDegradeReason, type PipelineDeps } from './pipeline.ts';
import { researchBriefSchema } from './plan-document.ts';
import { taskDecisionSchema, type TaskDecision } from './task.ts';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function throws(fn: () => unknown, message: string) {
  let threw = false;
  try { fn(); } catch { threw = true; }
  assert(threw, message);
}

function decisionOf(patch: Partial<TaskDecision>): TaskDecision {
  return taskDecisionSchema.parse({
    objective: '任务', mode: 'execute', continuation: false, authorizationQuote: '帮我安排',
    operations: [], requiredOperations: [], fullHikingPlan: false, destination: null, plannedDate: null,
    dateUndecided: false, days: null, derivedDays: null, trackAttachmentName: null, packingMode: 'none', constraints: [],
    ...patch,
  });
}

function pipelineOf(decision: TaskDecision, snapshots: Record<string, unknown> = {}): PipelineDeps {
  return {
    context: { currentJourneyId: Object.keys(snapshots).length ? 'j1' : null, task: null, dataContext: { snapshots } },
    task: { decision },
  } as unknown as PipelineDeps;
}

const journeyStub = (days: number | null) => ({ name: '稻城亚丁徒步', region: '', days });

Deno.test('fills a missing journey duration from the pinned task facts before parsing', () => {
  const plan = finalizePlan({
    journey: journeyStub(null),
    itineraryItems: [{ day: 'Day 1', title: '徒步起点出发', timeStart: null }],
  }, pipelineOf(decisionOf({})), null, null, 7);
  assert(plan.journey?.days === 7, `pinned days must fill the journey, got ${plan.journey?.days}`);
  assert('timeStart' in (plan.itineraryItems[0] as Record<string, unknown>) === false, 'null optional fields must be stripped for the persisted document');
});

Deno.test('a missing duration without task facts degrades to a pending question instead of failing', () => {
  const plan = finalizePlan({ journey: journeyStub(null) }, pipelineOf(decisionOf({})), null, null, null);
  assert(plan.journey === null, 'an underivable journey must not be invented');
  assert(plan.pendingQuestion?.includes('总天数') === true, `must ask for the missing duration, got ${plan.pendingQuestion}`);
});

Deno.test('strict mode turns an unexplained null journey into a re-ask issue', () => {
  throws(() => finalizePlan({ journey: null }, pipelineOf(decisionOf({})), null, null, 7), 'a null journey with pinned facts must raise a re-ask issue');
});

Deno.test('non-strict mode records a pending question instead of discarding the assembled content', () => {
  const plan = finalizePlan({ journey: null, itineraryItems: [{ day: 'Day 1', title: '已编排内容' }] }, pipelineOf(decisionOf({})), null, null, 7, { strictJourney: false });
  assert(plan.journey === null, 'the journey stays null');
  assert(plan.pendingQuestion != null && plan.pendingQuestion.length > 0, 'the failure must degrade to a pending question');
  assert(plan.itineraryItems.length === 1, 'the assembled content must be kept');
});

Deno.test('a null journey with a stated blocker passes without a re-ask', () => {
  const plan = finalizePlan({ journey: null, blocker: '轨迹缺失，无法编排' }, pipelineOf(decisionOf({})), null, null, 7);
  assert(plan.blocker === '轨迹缺失，无法编排', 'the blocker must be kept');
  assert(plan.pendingQuestion == null, 'a blocker already explains the gap');
});

Deno.test('a research day estimate is annotated as an assumption exactly once', () => {
  const research = researchBriefSchema.parse({ suggestedDays: 5, durationBasis: '路线徒步 5 天，无中转' });
  const plan = finalizePlan({ journey: journeyStub(5) }, pipelineOf(decisionOf({})), research, null, 5);
  const estimates = plan.assumptions.filter(item => item.includes('系统按路线徒步时长'));
  assert(estimates.length === 1, `the estimate must be annotated once, got ${estimates.length}`);
});

Deno.test('endpoint gap disclosure follows the option and the full-hike gate', () => {
  const decision = decisionOf({ fullHikingPlan: true });
  const trackSnapshots = { 'j1:track': { data: { trackSummary: { waypoints: [] } } } };
  const candidate = { journey: journeyStub(3), endpoints: [] };
  const disclosed = finalizePlan(candidate, pipelineOf(decision, trackSnapshots), null, null, 3);
  assert(disclosed.unverified.some(item => item.includes('徒步日终点')) === true, 'a full hike with a bound track must disclose the endpoint gap');
  const skipped = finalizePlan(candidate, pipelineOf(decision, trackSnapshots), null, null, 3, { endpointGap: false });
  assert(skipped.unverified.some(item => item.includes('徒步日终点')) === false, 'the skeleton round must not disclose a gap before chunks fill endpoints');
  const notFullHike = finalizePlan(candidate, pipelineOf(decisionOf({}), trackSnapshots), null, null, 3);
  assert(notFullHike.unverified.length === 0, 'a non-full-hike plan has no endpoint disclosure');
});

Deno.test('the deterministic fallback never repeats an internal failure to the user', () => {
  const plan = fallbackPlan(pipelineOf(decisionOf({ destination: '漓江' })), null, 1);
  assert(plan.itineraryItems.length === 0, 'the fallback carries no itinerary');
  assert(plan.blocker != null, 'the fallback states the blocker');
  const text = JSON.stringify(plan);
  for (const leak of ['Zod', 'zod', 'JSON Schema', 'Upstream helper', 'AbortError', 'Request was aborted', 'undefined']) {
    assert(!text.includes(leak), `the fallback must not repeat "${leak}" to the user: ${text}`);
  }
});

Deno.test('a plan without itinerary items is reported as degraded, a filled one is not', () => {
  const empty = finalizePlan({ journey: journeyStub(3) }, pipelineOf(decisionOf({})), null, null, 3);
  assert(planDegradeReason(empty) != null, 'an empty itinerary must degrade the plan stage');
  const filled = finalizePlan({ journey: journeyStub(3), itineraryItems: [{ day: 'Day 1', title: '徒步' }] }, pipelineOf(decisionOf({})), null, null, 3);
  assert(planDegradeReason(filled) === null, 'a plan with itinerary items must stay completed');
  const journeyOnly = finalizePlan({ journey: null, blocker: '轨迹缺失' }, pipelineOf(decisionOf({})), null, null, 3);
  assert(planDegradeReason(journeyOnly) != null, 'a fallback without a journey must degrade too');
  // Stopping to ask the user is still an incomplete plan stage, but it is not a
  // failure, and the recorded reason must say which one happened.
  const waiting = finalizePlan({ journey: journeyStub(null) }, pipelineOf(decisionOf({})), null, null, null);
  const waitingReason = planDegradeReason(waiting);
  assert(waitingReason?.includes('stopped to ask') === true, `a question-only plan must be recorded as waiting, got ${waitingReason}`);
  assert(planDegradeReason(empty)?.includes('worker log') === true, 'a fallback must point operators at the log');
});

Deno.test('endpoint entries the track cannot locate are dropped, never sent to a write', () => {
  const plan = finalizePlan({
    journey: journeyStub(6),
    endpoints: [
      { day: 'Day 1', waypointIndex: 54 },
      { day: 'Day 2' },
      { day: 'Day 3', locationName: '某营地' },
      { day: 'Day 4', trackFinish: true },
      { day: 'Day 5', endDistanceKm: 12.5 },
    ],
  }, pipelineOf(decisionOf({})), null, null, 6);
  assert(plan.endpoints.length === 3, `only locatable endpoints may be kept, got ${JSON.stringify(plan.endpoints)}`);
  assert(plan.endpoints.map(entry => entry.day).join() === 'Day 1,Day 4,Day 5', 'the located days are kept in order');
  const gap = plan.unverified.find(item => item.includes('未保存'));
  assert(gap?.includes('Day 2') === true && gap?.includes('Day 3') === true, `the dropped days must be disclosed, got ${gap}`);
});

Deno.test('a plan whose endpoints are all locatable is not annotated', () => {
  const plan = finalizePlan({ journey: journeyStub(2), endpoints: [{ day: 'Day 1', waypointIndex: 3 }, { day: 'Day 2', trackFinish: true }] }, pipelineOf(decisionOf({})), null, null, 2);
  assert(plan.endpoints.length === 2, 'located endpoints survive');
  assert(plan.unverified.some(item => item.includes('未保存')) === false, 'no gap note without dropped days');
});

Deno.test('endpoints on a route the journey did not bind are dropped and disclosed', () => {
  // The bound track is the first route's; days 5 and 6 belong to the other two
  // routes, and their waypoint indices would read as a decreasing sequence on
  // that track, which is what failed the whole save.
  const plan = finalizePlan({
    journey: { name: '三路线', region: '', days: 6, routeId: 'trk008' },
    itineraryItems: [
      { day: 'Day 1', title: '党岭', routeId: 'trk008' },
      { day: 'Day 2', title: '党岭', routeId: 'trk008' },
      { day: 'Day 3', title: '接驳', kind: 'transport' },
      { day: 'Day 5', title: '雅拉', routeId: 'trk065' },
      { day: 'Day 6', title: '桑措', routeId: 'trk043' },
    ],
    endpoints: [
      { day: 'Day 2', waypointIndex: 104 },
      { day: 'Day 5', waypointIndex: 12 },
      { day: 'Day 6', waypointIndex: 3 },
    ],
  }, pipelineOf(decisionOf({})), null, null, 6);
  assert(plan.endpoints.length === 1 && plan.endpoints[0].day === 'Day 2', `only the bound route keeps an endpoint, got ${JSON.stringify(plan.endpoints)}`);
  const gap = plan.unverified.find(item => item.includes('未绑定轨迹'));
  assert(gap?.includes('Day 5') === true && gap?.includes('Day 6') === true, `the off-route days must be disclosed, got ${gap}`);
});

Deno.test('a single-route plan keeps every endpoint it located', () => {
  const plan = finalizePlan({
    journey: { name: '党岭', region: '', days: 2, routeId: 'trk008' },
    itineraryItems: [{ day: 'Day 1', title: '党岭', routeId: 'trk008' }, { day: 'Day 2', title: '党岭', routeId: 'trk008' }],
    endpoints: [{ day: 'Day 1', waypointIndex: 54 }, { day: 'Day 2', trackFinish: true }],
  }, pipelineOf(decisionOf({})), null, null, 2);
  assert(plan.endpoints.length === 2, 'a bound single-route plan keeps every endpoint');
  assert(plan.unverified.some(item => item.includes('未绑定轨迹')) === false, 'no off-route note without off-route days');
});

Deno.test('a day with no route-tagged item is never treated as off-route', () => {
  const plan = { journey: { routeId: 'trk008' }, itineraryItems: [{ day: 'Day 3', title: '接驳', routeId: null }], endpoints: [{ day: 'Day 3', endDistanceKm: 4 }] };
  assert(endpointDaysOffBoundRoute(plan as never).length === 0, 'transport-only days must not be dropped');
  const unbound = { journey: null, itineraryItems: [{ day: 'Day 1', title: 'x', routeId: 'trk065' }], endpoints: [{ day: 'Day 1', waypointIndex: 2 }] };
  assert(endpointDaysOffBoundRoute(unbound as never).length === 0, 'without a bound route nothing is off-route');
});
