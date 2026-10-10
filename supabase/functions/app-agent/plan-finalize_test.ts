// finalizePlan is the shared post-processing for every plan-shaped output
// (single-shot, skeleton and chunked merge). These tests pin the behaviors
// the chunked-plan fallback depends on: deterministic duration fill, the
// strict/non-strict journey-null guard and endpoint-gap disclosure.
import { endpointDaysWithUnknownRoute, fallbackPlan, finalizePlan, planDegradeReason, reconcileCandidateDays, runPlan, runRespond, STAGE_BUDGETS, type PipelineDeps } from './pipeline.ts';
import { planDocumentModelSchema, planDocumentSchema, researchBriefSchema, saveOperations, transportPlanSchema } from './plan-document.ts';
import { assertCreationFacts, taskDecisionSchema, taskOutcome, type TaskDecision } from './task.ts';
import { mergeMainTransportItems, mainTransportSchema } from './main-transport.ts';
import { renderTaskResponse } from './response-presentation.ts';

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
    includeRoundTripTransport: false,
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
  const candidate = { journey: journeyStub(3), itineraryItems: [{ day: 'Day 2', title: '徒步', kind: 'activity' }, { day: 'Day 1', title: '去程', kind: 'custom' }], endpoints: [] };
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
  // Itinerary items without a journey are still nothing saved: every write is
  // journey-scoped. This is the case that reported a completed run after
  // writing zero rows.
  const orphanItems = { journey: null, itineraryItems: [{ day: 'Day 1', title: '徒步' }] } as never;
  assert(planDegradeReason(orphanItems) != null, 'items without a journey must degrade');
  assert(planDegradeReason(orphanItems as never, true) === null, 'a replan into an existing journey is not degraded');
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

Deno.test('an endpoint on another route of the same trip is kept and measured there', () => {
  // One trip walks route A then route B; each day's distance restarts on its
  // own track, so both endpoints must survive.
  const research = researchBriefSchema.parse({ routes: [
    { name: '党岭', routeId: 'trk008' },
    { name: '雅拉', routeId: 'trk065' },
  ] });
  const plan = finalizePlan({
    journey: { name: '两条路线', region: '', days: 4, routeId: 'trk008' },
    itineraryItems: [
      { day: 'Day 1', title: '党岭', routeId: 'trk008' },
      { day: 'Day 2', title: '党岭', routeId: 'trk008' },
      { day: 'Day 3', title: '雅拉', routeId: 'trk065' },
      { day: 'Day 4', title: '雅拉', routeId: 'trk065' },
    ],
    endpoints: [
      { day: 'Day 2', trackFinish: true, routeId: 'trk008' },
      { day: 'Day 4', trackFinish: true, routeId: 'trk065' },
    ],
  }, pipelineOf(decisionOf({})), research, null, 4);
  assert(plan.endpoints.length === 2, `both routes keep their endpoint, got ${JSON.stringify(plan.endpoints)}`);
  assert(plan.unverified.some(item => item.includes('没有核对到的路线')) === false, 'a known route is not disclosed as a gap');
});

Deno.test('an endpoint tagged with a route nothing matched is dropped and disclosed', () => {
  const research = researchBriefSchema.parse({ routes: [{ name: '党岭', routeId: 'trk008' }] });
  const plan = finalizePlan({
    journey: { name: '党岭', region: '', days: 2, routeId: 'trk008' },
    itineraryItems: [{ day: 'Day 1', title: '党岭', routeId: 'trk008' }],
    endpoints: [
      { day: 'Day 1', trackFinish: true, routeId: 'trk008' },
      { day: 'Day 2', waypointIndex: 12, routeId: 'trk999' },
    ],
  }, pipelineOf(decisionOf({})), research, null, 2);
  assert(plan.endpoints.length === 1 && plan.endpoints[0].day === 'Day 1', `only the known route survives, got ${JSON.stringify(plan.endpoints)}`);
  const gap = plan.unverified.find(item => item.includes('没有核对到的路线'));
  assert(gap?.includes('Day 2') === true, `the dropped day must be disclosed, got ${gap}`);
});

Deno.test('an untagged endpoint is never treated as unknown', () => {
  const plan = { journey: { routeId: 'trk008' }, itineraryItems: [], endpoints: [{ day: 'Day 1', endDistanceKm: 4 }] };
  assert(endpointDaysWithUnknownRoute(plan as never, null).length === 0, 'an endpoint without a route id resolves on the bound track');
  const untagged = { journey: null, itineraryItems: [], endpoints: [{ day: 'Day 1', endDistanceKm: 4 }] };
  assert(endpointDaysWithUnknownRoute(untagged as never, null).length === 0, 'a journey with no route keeps its untagged endpoints');
});

function roundTripCandidate() {
  return {
    journey: { name: '党岭', region: '四川', days: 5 },
    itineraryItems: [
      { day: 'Day 1', title: '南宁至登山口', kind: 'custom' },
      { day: 'Day 2', title: '徒步', kind: 'activity' },
      { day: 'Day 3', title: '徒步', kind: 'activity' },
      { day: 'Day 5', title: '返回南宁', kind: 'custom' },
    ],
    transport: {
      origin: '南宁', returnDestination: '南宁', trailStart: '党岭村', trailFinish: '党岭村',
      hikeStart: 480, hikeEnd: 2400, arrivalBuffer: 60, departureBuffer: 60,
      outbound: [{ from: '南宁', to: '党岭村', mode: 'carpool', departure: -1440, arrival: -60, bufferBefore: 60, verified: false, sourceUrl: null, fallback: '包车' }],
      inbound: [{ from: '党岭村', to: '南宁', mode: 'carpool', departure: 4320, arrival: 5400, bufferBefore: 60, verified: false, sourceUrl: null, fallback: '包车' }],
    },
  };
}

Deno.test('full journey requires travel unless explicitly excluded', () => {
  const candidate = { journey: journeyStub(5), itineraryItems: [{ day: 'Day 2', title: '徒步' }] };
  const full = decisionOf({ fullHikingPlan: true, days: 5, includeRoundTripTransport: true });
  assert(finalizePlan(candidate, pipelineOf(full), null, null, 5).pendingQuestion?.includes('城市'), 'missing origin must be asked');
  const excluded = { ...full, includeRoundTripTransport: false };
  assert(!finalizePlan(candidate, pipelineOf(excluded), null, null, 5).pendingQuestion, 'explicit travel exclusion allows hike-only planning');
});

Deno.test('travel uses total trip days while review times use first hiking day', () => {
  const task = decisionOf({ fullHikingPlan: true, days: 5, includeRoundTripTransport: true });
  const candidate = roundTripCandidate();
  const within = finalizePlan(candidate, pipelineOf(task), null, null, 5);
  assert(!within.blocker && !within.pendingQuestion, 'five-day journey with two hiking days and travel fits');
  candidate.transport.inbound[0].arrival = 6000;
  const outside = finalizePlan(candidate, pipelineOf(task), null, null, 5);
  assert(outside.blocker?.includes('全程日期范围'), 'return outside the total trip must be flagged');
});

Deno.test('a missing return leg cannot complete a full journey', () => {
  const candidate = roundTripCandidate();
  candidate.transport.inbound = [];
  const plan = finalizePlan(candidate, pipelineOf(decisionOf({ fullHikingPlan: true, days: 5, includeRoundTripTransport: true })), null, null, 5);
  assert(plan.blocker?.includes('往返交通链路'), 'outbound-only plan must stay incomplete');
});

Deno.test('total duration estimate includes travel and remains distinct from user days', () => {
  const task = decisionOf({ fullHikingPlan: true, days: null, includeRoundTripTransport: true });
  const plan = finalizePlan(roundTripCandidate(), pipelineOf(task), null, null, null);
  assert(plan.journey?.days === 5 && task.days === null && task.derivedDays === 5, 'planner total estimate should pass the creation guard without becoming user-provided days');
});

function plannerHarness(outputs: unknown[], decision: Partial<TaskDecision> = {}) {
  const calls: Array<{ input: unknown; options: Parameters<PipelineDeps['invoke']>[2] }> = [];
  const pipeline = pipelineOf(decisionOf({ days: 1, ...decision }));
  Object.assign(pipeline, {
    userInput: '帮我安排', flashModel: 'fake',
    stageAgent: (options: unknown) => options,
    invoke: (_agent: unknown, input: unknown, options: Parameters<PipelineDeps['invoke']>[2]) => {
      calls.push({ input, options });
      const output = outputs[Math.min(calls.length - 1, outputs.length - 1)];
      if (output instanceof Error) return Promise.reject(output);
      return Promise.resolve(structuredClone(output));
    },
  });
  return { pipeline, calls, run: () => runPlan(pipeline, new AbortController().signal, null, false, null) };
}

const pastDeparturePlan = {
  journey: { ...journeyStub(1), plannedDate: '2000-01-01' },
  itineraryItems: [{ day: 'Day 1', title: '高铁 G123', kind: 'custom', timeStart: '08:00', timeEnd: '10:00' }],
};

Deno.test('past departure is re-asked once then disclosed with persisted feasibility', async () => {
  const h = plannerHarness([pastDeparturePlan]);
  const before = Date.now();
  const plan = await h.run();
  assert(h.calls.length === 2, 'persistent blockers get exactly one repair');
  const issue = plan.feasibility?.issues.find(issue => issue.code === 'past_departure');
  assert(issue && plan.blocker && plan.unverified.includes(issue.message), 'past departure must remain blocked and disclosed');
  assert(String(h.calls[1].input).includes(issue.message), 'repair must receive the concrete issue');
  assert(h.calls[1].options.maxTurns === 1 && h.calls[1].options.session === h.calls[0].options.session, 'repair must reuse evidence in one turn');
  const archived = planDocumentSchema.parse(JSON.parse(JSON.stringify(plan)));
  assert(archived.feasibility?.issues[0].code === 'past_departure', 'measurement must survive artifact round-trip');
  assert(Date.parse(archived.feasibility.checkedAt) >= before && Date.parse(archived.feasibility.checkedAt) <= Date.now(), 'check timestamp must use the current time');
  assert(!JSON.stringify(saveOperations(plan)).includes('feasibility'), 'measurement must never reach save tools');
  assert(!('feasibility' in planDocumentModelSchema.shape), 'measurement must stay out of the provider schema');
});

Deno.test('warning-only plan is disclosed without blocker, duplicates or a repair', async () => {
  const message = '当天徒步和交通合计11小时，安排过重，请减少行程。';
  const h = plannerHarness([{
    journey: journeyStub(1), unverified: [message],
    itineraryItems: [{ day: 'Day 1', title: '徒步', kind: 'activity', timeStart: '06:00', timeEnd: '17:00' }],
  }]);
  const plan = await h.run();
  assert(h.calls.length === 1 && !plan.blocker, 'warnings must not re-ask or block');
  assert(plan.feasibility?.issues.length === 1 && plan.feasibility.issues[0].severity === 'warning', 'warning must be measured');
  assert(plan.unverified.filter(value => value === message).length === 1, 'warning disclosure must be deduplicated');
});

Deno.test('feasibility repair can correct an excessive day instead of retaining its blocker', async () => {
  const overloaded = { journey: journeyStub(1), itineraryItems: [{ day: 'Day 1', title: '徒步', kind: 'activity', timeStart: '06:00', timeEnd: '21:00' }] };
  const repaired = { ...overloaded, itineraryItems: [{ ...overloaded.itineraryItems[0], timeEnd: '14:00' }] };
  const h = plannerHarness([overloaded, repaired]);
  const plan = await h.run();
  assert(h.calls.length === 2 && !plan.blocker && !plan.unverified.length && !plan.feasibility?.issues.length, 'corrected plan must be rechecked without stale issues');
  assert(String(h.calls[1].input).includes('合计15小时'), 'repair must identify the excessive day');
});

Deno.test('a failed feasibility repair retains the system blocker and model caveat', async () => {
  const h = plannerHarness([{ ...pastDeparturePlan, blocker: '原有阻塞原因。' }, new Error('repair unavailable')]);
  const plan = await h.run();
  assert(h.calls.length === 2 && plan.blocker?.includes('可行性冲突') && plan.unverified[0] === '原有阻塞原因。', 'repair failure must preserve the hard blocker and disclose the model caveat');
  assert(plan.itineraryItems.length === 1 && plan.unverified.some(value => value.includes('开始时间已过')), 'repair failure must preserve usable content and concrete disclosure');
});

Deno.test('feasibility skips repair once the plan reserve is reached', async () => {
  const h = plannerHarness([pastDeparturePlan]);
  const originalNow = Date.now;
  let now = originalNow();
  const invoke = h.pipeline.invoke;
  Date.now = () => now;
  h.pipeline.invoke = (...args) => {
    now += STAGE_BUDGETS.plan - 8_000;
    return invoke(...args);
  };
  try {
    const plan = await h.run();
    assert(h.calls.length === 1 && plan.blocker && plan.unverified.some(value => value.includes('开始时间已过')), 'no time means immediate disclosure without repair');
  } finally { Date.now = originalNow; }
});

Deno.test('provider-only past departures are checked without changing itinerary items', async () => {
  const candidate = { journey: journeyStub(1), itineraryItems: [{ day: 'Day 1', title: '休整', kind: 'custom' }] };
  const h = plannerHarness([candidate], { plannedDate: '2000-01-01' });
  const transport = transportPlanSchema.parse({ mainTravel: { request: {}, itineraryItems: pastDeparturePlan.itineraryItems } });
  const original = JSON.stringify(transport);
  const plan = await runPlan(h.pipeline, new AbortController().signal, null, false, transport);
  assert(h.calls.length === 2 && plan.blocker && plan.feasibility?.issues.some(issue => issue.code === 'past_departure'), 'provider row must cause rejection and disclosure');
  assert(plan.itineraryItems.length === 1 && plan.itineraryItems[0].title === '休整', 'checking must not merge provider rows into the artifact');
  assert(JSON.stringify(transport) === original, 'checking must not mutate provider receipts');
});

Deno.test('chunked merge records and discloses feasibility blockers', async () => {
  const h = plannerHarness([
    { journey: pastDeparturePlan.journey },
    { itineraryItems: pastDeparturePlan.itineraryItems },
  ]);
  const plan = await h.run();
  assert(h.calls.length === 2, 'empty single-shot must refine in one day chunk');
  assert(plan.blocker && plan.feasibility?.issues.some(issue => issue.code === 'past_departure'), 'merged chunks must be checked');
  assert(plan.unverified.some(value => value.includes('开始时间已过')), 'chunk blockers must be disclosed');
});

Deno.test('archived plans without feasibility still parse with a default', () => {
  const archived = planDocumentSchema.parse(pastDeparturePlan);
  assert(archived.feasibility === null && archived.itineraryItems.length === 1, 'old artifacts must parse without a fabricated check');
});

Deno.test('an undecided-duration candidate discloses planner caveats and passes the creation guard', () => {
  const task = decisionOf({ fullHikingPlan: true, destination: '党岭', includeRoundTripTransport: true });
  const candidate = { ...roundTripCandidate(), blocker: '防火期开放状态未确认', pendingQuestion: '是否接受候选安排？' };
  const plan = finalizePlan(candidate, pipelineOf(task), null, null, null);
  assert(plan.journey?.days === 5 && task.derivedDays === 5 && task.days === null, 'candidate estimate must authorize creation');
  assert(plan.blocker === null && plan.pendingQuestion === null && plan.followUpSuggestion === candidate.pendingQuestion, 'planner caveats must not block completion');
  assert(plan.unverified[0] === candidate.blocker, 'planner blocker must lead the caveats');
  assert(plan.assumptions.some(value => value.includes('候选方案') && value.includes('5 天') && value.includes('并非用户已指定')), 'candidate estimate must be disclosed');
  assert(saveOperations(plan)[0].tool === 'create_journey', 'candidate must reach creation');
});

Deno.test('missing origin overrides planner questions and prevents candidate creation', () => {
  for (const days of [null, 5]) {
    const task = decisionOf({ fullHikingPlan: true, days, includeRoundTripTransport: true });
    const candidate = { ...roundTripCandidate(), transport: { ...roundTripCandidate().transport, origin: null }, blocker: '开放状态待核实', pendingQuestion: '是否接受建议？' };
    const plan = finalizePlan(candidate, pipelineOf(task), null, null, days);
    assert(plan.journey === null && task.derivedDays === null, 'missing origin must not permit a new journey');
    assert(plan.pendingQuestion?.includes('哪个城市'), 'server must ask the prerequisite question');
  }
});

Deno.test('an empty blocked plan stays unsaved while its skeleton survives until chunks fill it', () => {
  const task = decisionOf({ fullHikingPlan: true });
  const candidate = { journey: journeyStub(5), blocker: '接驳班次待核实' };
  const empty = finalizePlan(candidate, pipelineOf(task), null, null, null);
  assert(empty.journey === null && task.derivedDays === null, 'no items must not become a candidate');
  const skeleton = finalizePlan(candidate, pipelineOf(task), null, null, null, { skeleton: true });
  assert(skeleton.journey?.days === 5 && task.derivedDays === null, 'outline must retain the frame without authorizing creation');
  const merged = finalizePlan({ ...skeleton, itineraryItems: [{ day: 'Day 1', title: '徒步起点' }] }, pipelineOf(task), null, null, null);
  assert(merged.journey?.days === 5 && Number(task.derivedDays) === 5, 'filled chunks become a candidate');
});

Deno.test('placeholder disclosures normalize before duration and transport logic', () => {
  for (const placeholder of ['无', '无。', '暂无', 'none', 'null', 'N/A', '  ', '\n\t', ' NONE ']) {
    const task = decisionOf({ fullHikingPlan: true, includeRoundTripTransport: true });
    const candidate = { ...roundTripCandidate(), pendingQuestion: placeholder, blocker: placeholder };
    const plan = finalizePlan(candidate, pipelineOf(task), null, null, null);
    assert(plan.journey?.days === 5 && plan.pendingQuestion === null && plan.blocker === null, `placeholder survived: ${placeholder}`);
    const missing = finalizePlan({ journey: journeyStub(null), pendingQuestion: placeholder }, pipelineOf(decisionOf({})), null, null, null);
    assert(missing.pendingQuestion?.includes('总天数'), 'placeholder must not suppress the missing-duration question');
    const origin = finalizePlan({ ...candidate, transport: null }, pipelineOf(task), null, null, null);
    assert(origin.journey === null && origin.pendingQuestion?.includes('哪个城市'), 'placeholder must not suppress origin intake');
  }
});

Deno.test('chunked full planning retains a skeleton caveat and saves its filled candidate', async () => {
  const candidate = roundTripCandidate();
  const h = plannerHarness([
    new Error('single-shot unavailable'),
    new Error('single-shot repair unavailable'),
    { journey: candidate.journey, transport: candidate.transport, blocker: '接驳班次尚未核实' },
    { itineraryItems: candidate.itineraryItems },
  ], { fullHikingPlan: true, days: null, includeRoundTripTransport: true });
  const result = await h.run();
  assert(h.calls.length === 4 && result.journey?.days === 5 && result.itineraryItems.length === 4, 'chunked candidate must retain journey');
  assert(result.blocker === null && result.unverified[0] === '接驳班次尚未核实' && h.pipeline.task.decision.derivedDays === 5, 'chunked candidate must disclose caveats and retain duration');
});

Deno.test('queried return day extends only an undecided candidate and updates its creation facts', () => {
  const main = mainTransportSchema.parse({ request: {}, suggestedDays: 13, itineraryItems: [
    { day: 'Day 13', title: '航班 CZ3242 返回南宁', kind: 'custom', timeStart: '23:20', timeEnd: '00:30', location: { name: '天府机场' } },
    { day: 'Day 14', title: '抵达吴圩机场 · CZ3242', kind: 'custom', location: { name: '吴圩机场', incomingMode: 'flight' } },
  ] });
  const task = decisionOf({ fullHikingPlan: true, destination: '党岭' });
  const pipeline = pipelineOf(task);
  const plan = planDocumentSchema.parse({ journey: { name: '党岭', days: 12 }, schedule: { totalDays: 12, dayAssignments: [{ from: 'Day 12', toDay: 12 }] },
    itineraryItems: [{ day: 'Day 1', title: '进山' }], assumptions: ['全程建议 12 天，含往返交通；这是候选方案的规划估算，并非用户已指定的天数。'] });
  plan.itineraryItems = mergeMainTransportItems(plan.itineraryItems, main);
  reconcileCandidateDays(plan, pipeline);
  assert(plan.journey?.days === 13 && plan.schedule?.totalDays === 13 && task.derivedDays === 13, 'all candidate day counts must match');
  assert(plan.schedule.dayAssignments[0].toDay === 12, 'existing day assignments must not be invented');
  assert(plan.assumptions[0].includes('13 天') && !plan.assumptions.some(value => value.includes('全程建议 12 天')), 'estimate must be replaced');
  assertCreationFacts({ runId: 'run', journeyId: null, outcome: null, decision: task }, { days: 13 });
  reconcileCandidateDays(plan, pipeline);
  assert(plan.assumptions.filter(value => value.includes('全程建议')).length === 1, 'repeated reconciliation must be idempotent');
  const specified = decisionOf({ fullHikingPlan: true, destination: '党岭', days: 12 });
  const fixed = planDocumentSchema.parse({ journey: { name: '党岭', days: 12 }, schedule: { totalDays: 12, dayAssignments: [] }, itineraryItems: main.itineraryItems });
  reconcileCandidateDays(fixed, pipelineOf(specified));
  assert(fixed.journey?.days === 12 && fixed.schedule?.totalDays === 12 && specified.derivedDays === null, 'user days must not change');
});

Deno.test('system prerequisites stay hard and transport review mismatch is a Chinese caveat', () => {
  const task = decisionOf({ fullHikingPlan: true, days: 5, includeRoundTripTransport: true });
  const candidate = roundTripCandidate();
  candidate.transport.inbound[0].from = '另一个地点';
  const plan = finalizePlan({ ...candidate, blocker: '营地许可待核实', pendingQuestion: '是否接受？' }, pipelineOf(task), null, null, 5);
  assert(plan.blocker === null && plan.pendingQuestion === null && plan.followUpSuggestion === '是否接受？', 'model caveats must be demoted');
  assert(plan.unverified[0] === '营地许可待核实' && plan.unverified.some(value => value.includes('衔接尚需核对')), 'review mismatch must be a caveat');
  assert(!plan.unverified.some(value => value.includes('Return:')) && plan.transport?.reviewIssues.some(value => value.includes('Return:')), 'English review issues must remain internal');
  const incomplete = finalizePlan({ ...candidate, transport: { ...candidate.transport, inbound: [] }, blocker: '营地许可待核实' }, pipelineOf(task), null, null, 5);
  assert(incomplete.blocker?.includes('往返交通链路'), 'missing return leg must remain hard');
  const origin = finalizePlan({ ...candidate, transport: null, pendingQuestion: '是否接受？' }, pipelineOf(task), null, null, 5);
  assert(origin.journey === null && origin.pendingQuestion?.includes('哪个城市'), 'missing origin must remain a hard question');
});

Deno.test('fully saved candidate completes with caveats and follow-up last; missing endpoints do not', async () => {
  const decision = decisionOf({ fullHikingPlan: true, destination: '党岭', days: null, derivedDays: 5,
    requiredOperations: ['create_journey', 'add_itinerary_items', 'set_itinerary_group_endpoints', 'add_packing_items', 'update_journey_schedule'] });
  const pipeline = pipelineOf(decision);
  const plan = finalizePlan({ ...roundTripCandidate(), blocker: '接驳待核实', pendingQuestion: '请确认是否接受候选安排。' }, pipeline, null, null, 5);
  const coverage = { groupCount: 2, requiredGroupCount: 2, reachesTrackEnd: true };
  const save = { journeyId: 'j', saved: [{ tool: 'create_journey' }, { tool: 'add_itinerary_items' },
    { tool: 'set_itinerary_group_endpoints', output: { coverage } }], satisfied: ['update_journey_schedule' as const], failed: [], skipped: [] };
  const packing = { status: 'committed' as const, issues: [], revision: 1, itemCount: 10 };
  const reply = await runRespond(pipeline, new AbortController().signal, { plan, save, packing }) as { text: string; blocker: string | null; pendingQuestion: string | null; followUpSuggestion: string };
  assert(reply.text.startsWith('候选行程已保存') && reply.text.endsWith('请确认是否接受候选安排。'), 'candidate lead and follow-up order');
  assert(reply.blocker === null && reply.pendingQuestion === null, 'follow-up must not be a blocker or pending question');
  const calls = [...save.saved.map(entry => ({ toolName: entry.tool, status: 'completed', output: entry.output })),
    { toolName: 'add_packing_items', status: 'completed' }];
  const task = { runId: 'run', journeyId: 'j', outcome: null, decision };
  const outcome = taskOutcome(task, { ...reply, draft: null }, calls, save.satisfied);
  assert(outcome.status === 'completed' && renderTaskResponse({ ...reply, draft: null }, outcome, 'zh').startsWith('候选行程已保存'), 'saved candidate must render through completion');
  const incompleteSave = { ...save, saved: save.saved.map(entry => entry.tool === 'set_itinerary_group_endpoints'
    ? { ...entry, output: { coverage: { ...coverage, groupCount: 1 } } } : entry) };
  const incomplete = await runRespond(pipeline, new AbortController().signal, { plan, save: incompleteSave, packing }) as typeof reply;
  assert(!incomplete.text.startsWith('候选行程已保存'), 'incomplete boundaries must not claim completion');
  const partialCalls = [...incompleteSave.saved.map(entry => ({ toolName: entry.tool, status: 'completed', output: entry.output })), calls.at(-1)!];
  const partial = taskOutcome(task, { ...incomplete, draft: null }, partialCalls, save.satisfied);
  assert(partial.status === 'partial' && renderTaskResponse({ ...incomplete, draft: null }, partial, 'zh', '党岭').endsWith('请确认是否接受候选安排。'), 'incomplete boundaries remain partial with follow-up');
});
