import { assertCreationFacts, assertTaskPackingMode, assertTaskWrite, constrainTaskDecision, taskOutcome, type TaskDecision, type TaskState } from './task.ts';
import { coreInstructions } from './instructions.ts';
import { planningSkills, loadPlanningSkill } from './skills.ts';
import { createAgentRuntime } from './agent.ts';
import { offTopicResponse } from './topic-boundary.ts';

function assert(value: unknown, message = 'Assertion failed'): asserts value { if (!value) throw new Error(message); }
function throws(fn: () => void) { let failed = false; try { fn(); } catch { failed = true; } assert(failed, 'Expected rejection'); }
export function decision(overrides: Partial<TaskDecision> = {}): TaskDecision {
  return { includeRoundTripTransport: true, objective: 'Plan a hike', mode: 'execute', domain: null, domainQuote: null, authorizationUnconfirmed: false, fullHikingPlan: false, activeHoursPerDay: null, continuation: false, authorizationQuote: 'save',
    operations: ['add_itinerary_items'], requiredOperations: ['add_itinerary_items'], destination: 'Hangzhou',
    plannedDate: '2026-09-09', dateUndecided: false, days: 1, derivedDays: null, trackAttachmentName: null,
    packingMode: 'none', constraints: [], ...overrides };
}
function state(overrides: Partial<TaskState> = {}): TaskState {
  return { runId: 'run', journeyId: 'journey', decision: decision(), outcome: null, ...overrides };
}

Deno.test('off-topic requests cannot resume pending writes or enter full planning', () => {
  const prior = state({ outcome: { status: 'waiting', pendingQuestion: 'When?', draft: null, missingOperations: ['add_itinerary_items'] } });
  const rejected = constrainTaskDecision(decision({ offTopic: true, continuation: true,
    authorizationQuote: '生成', fullHikingPlan: true, packingMode: 'full',
  }), '生成一个骑自行车的鹅鹅的 SVG', prior, 'journey', { hasBoundTrack: true, intent: 'plan_journey' });
  assert(rejected.mode === 'discuss' && rejected.offTopic);
  assert(!rejected.continuation && !rejected.fullHikingPlan && rejected.packingMode === 'none');
  assert(rejected.operations.length === 0 && rejected.requiredOperations.length === 0);
  throws(() => assertTaskWrite(state({ decision: rejected }), 'add_itinerary_items', 'journey'));
  // Even an unnormalized task must fail the write boundary.
  throws(() => assertTaskWrite(state({ decision: decision({ offTopic: true }) }), 'add_itinerary_items', 'journey'));
  for (const locale of ['zh', 'en']) {
    const reply = offTopicResponse(locale);
    assert(reply.draft === null && reply.pendingQuestion === null);
    assert(reply.quickReplies.length === 3 && reply.quickReplies.every(item => item.action === undefined));
    assert(taskOutcome(state({ decision: rejected }), reply, []).status === 'completed');
  }
});

Deno.test('older persisted tasks keep their supported execution behavior', () => {
  const supported = constrainTaskDecision(decision(), 'save', null, 'journey');
  assert(supported.offTopic === false && supported.mode === 'execute');
});

Deno.test('five total trip days can complete with two hiking boundaries', () => {
  const task = state({ decision: decision({ days: 5, fullHikingPlan: true,
    operations: ['add_itinerary_items', 'set_itinerary_group_endpoints'],
    requiredOperations: ['add_itinerary_items', 'set_itinerary_group_endpoints'] }) });
  const result = taskOutcome(task, { draft: null, pendingQuestion: null }, [
    { toolName: 'add_itinerary_items', status: 'completed' },
    { toolName: 'set_itinerary_group_endpoints', status: 'completed', output: { coverage: { groupCount: 2, requiredGroupCount: 2, reachesTrackEnd: true } } },
  ]);
  assert(result.status === 'completed', 'transport days must not require hiking boundaries');
});

Deno.test('discussion and stop cannot gain writes even with requested operations', () => {
  for (const mode of ['discuss', 'stop'] as const) {
    const task = state({ decision: constrainTaskDecision(decision({ mode }), 'save', null, 'journey') });
    assert(task.decision.operations.length === 0);
    throws(() => assertTaskWrite(task, 'add_itinerary_items', 'journey'));
  }
  throws(() => assertTaskWrite(undefined, 'add_gear'));
});

Deno.test('execution requires current evidence or an unanswered same-journey clarification', () => {
  assert(constrainTaskDecision(decision(), 'only discuss', null, 'journey').mode === 'discuss');
  const prior = state({ outcome: { status: 'waiting', pendingQuestion: 'When?', draft: null, missingOperations: ['add_itinerary_items'] } });
  const followup = decision({ continuation: true, authorizationQuote: '', operations: ['add_itinerary_items', 'delete_itinerary_items'] });
  const allowed = constrainTaskDecision(followup, 'Tomorrow', prior, 'journey');
  assert(allowed.mode === 'execute' && allowed.operations.join() === 'add_itinerary_items');
  assert(constrainTaskDecision(followup, 'Tomorrow', prior, 'other').mode === 'discuss');
  prior.outcome!.status = 'completed';
  assert(constrainTaskDecision(followup, 'Tomorrow', prior, 'journey').mode === 'discuss');
});

Deno.test('execution guard cannot cross journey or operation boundaries', () => {
  assertTaskWrite(state(), 'add_itinerary_items', 'journey');
  throws(() => assertTaskWrite(state(), 'add_itinerary_items', 'other'));
  throws(() => assertTaskWrite(state(), 'delete_itinerary_items', 'journey'));
  assertTaskWrite(undefined, 'search_routes');
});

Deno.test('packing execution cannot expand incremental scope or bypass full validation', () => {
  for (const mode of ['full', 'incremental'] as const) {
    const task = state({ decision: decision({ packingMode: mode }) });
    assertTaskPackingMode(task, mode);
    throws(() => assertTaskPackingMode(task, mode === 'full' ? 'incremental' : 'full'));
  }
  throws(() => assertTaskPackingMode(state(), 'incremental'));
  throws(() => assertTaskPackingMode(undefined, 'full'));
});

Deno.test('answering a partial task continues its pending scope without granting unrelated writes', () => {
  const prior = state({ outcome: { status: 'partial', pendingQuestion: 'Which station?', draft: null, missingOperations: ['add_itinerary_items'] } });
  const answer = decision({ continuation: true, authorizationQuote: '', requiredOperations: [], operations: ['add_itinerary_items', 'delete_itinerary_items'] });
  const next = constrainTaskDecision(answer, 'Shanghai Hongqiao', prior, 'journey');
  assert(next.mode === 'execute', 'Partial task clarification lost execution scope');
  assert(next.operations.join() === 'add_itinerary_items');
  assert(next.requiredOperations.join() === 'add_itinerary_items', 'Unfinished deliverables were lost');
  prior.outcome!.pendingQuestion = null;
  assert(constrainTaskDecision(answer, 'Shanghai Hongqiao', prior, 'journey').mode === 'discuss');
});

Deno.test('an empty required list cannot make an unexecuted write look completed', () => {
  const constrained = constrainTaskDecision(decision({ requiredOperations: [] }), 'save', null, 'journey');
  const result = taskOutcome(state({ decision: constrained }), { pendingQuestion: null, draft: null }, []);
  assert(result.status === 'partial', 'Missing requiredOperations bypassed receipt checks');
  assert(result.missingOperations.includes('add_itinerary_items'));
  const empty = decision({ operations: [], requiredOperations: [] });
  assert(taskOutcome(state({ decision: empty }), { pendingQuestion: null, draft: null }, []).status !== 'completed');
});

Deno.test('creation validates normalized facts instead of matching words in history', () => {
  const task = state({ journeyId: null });
  assertCreationFacts(task, { plannedDate: '2026-09-09', days: 1 });
  throws(() => assertCreationFacts(task, { plannedDate: '2026-09-10', days: 1 }));
  throws(() => assertCreationFacts(task, { plannedDate: '2026-09-09', days: 2 }));
  task.decision.plannedDate = null;
  // An undated trip may still create its journey: the plan is not blocked on an
  // unknown date, and a date the task does not carry is still rejected.
  assertCreationFacts(task, { days: 1 });
  throws(() => assertCreationFacts(task, { plannedDate: '2026-09-09', days: 1 }));
  task.decision.dateUndecided = true;
  assertCreationFacts(task, { days: 1 });
  task.decision.trackAttachmentName = 'route.gpx';
  throws(() => assertCreationFacts(task, { days: 1 }));
  assertCreationFacts(task, { days: 1, trackAttachmentName: 'route.gpx' });
  throws(() => constrainTaskDecision(decision({ plannedDate: '2026-02-30' }), 'save', null, null));
});

Deno.test('outcome requires receipts for requested deliverables and preserves draft identity', () => {
  const task = state({ decision: decision({ requiredOperations: ['add_itinerary_items', 'add_packing_items'] }) });
  const output = { pendingQuestion: null, draft: null };
  assert(taskOutcome(task, output, [{ toolName: 'add_itinerary_items', status: 'completed' }]).status === 'partial');
  assert(taskOutcome(task, output, [{ toolName: 'add_itinerary_items', status: 'completed' }, { toolName: 'add_packing_items', status: 'completed' }]).status === 'completed');
  assert(taskOutcome(task, { ...output, pendingQuestion: 'When?' }, []).status === 'waiting');
  const draft = taskOutcome(state({ decision: decision({ mode: 'discuss', operations: [], requiredOperations: [] }) }),
    { pendingQuestion: null, draft: { title: 'Route', body: 'A proposed route', assumptions: [], unverified: [] } }, []);
  assert(draft.status === 'draft' && draft.draft?.id === 'run');
});

Deno.test('skills are discoverable but not eagerly injected; runtime hides denied writes', async () => {
  // Reserve 300 additional characters for the topic boundary, including mixed
  // requests that remain on the conversational path. Keep skill bodies lazy.
  assert(coreInstructions.length < 5000, 'Core prompt grew beyond its budget');
  for (const [name, skill] of Object.entries(planningSkills)) {
    assert(coreInstructions.includes(name) && !coreInstructions.includes(skill.body));
    const loaded = await loadPlanningSkill.invoke({} as never, JSON.stringify({ name }));
    assert(JSON.stringify(loaded).includes('instructions'));
  }
  const runtime = createAgentRuntime({ model: 'test', apiKey: 'test', baseUrl: 'https://example.test' }, true, state());
  const names = runtime.agent.tools.map(tool => tool.name);
  assert(names.includes('add_itinerary_items') && names.includes('load_planning_skill'));
  assert(!names.includes('add_packing_items') && !names.includes('delete_itinerary_items'));
});

Deno.test('five-day plan with an unresolved blocker stays partial even after successful writes', () => {
  const task = state({ decision: decision({ days: 5, operations: ['set_itinerary_group_endpoints'], requiredOperations: ['set_itinerary_group_endpoints'] }) });
  const result = taskOutcome(task, { pendingQuestion: null, draft: null, blocker: 'Day 4 camp and water are unresolved' },
    [{ toolName: 'set_itinerary_group_endpoints', status: 'completed' }]);
  assert(result.status === 'partial', 'saving the trail finish cannot hide an unresolved overnight plan');
  assert(task.decision.days === 5, 'validation must not change the user duration');
});

Deno.test('full five-day request cannot complete after only the final boundary was saved', () => {
  const task = state({ decision: decision({ days: 5, operations: ['add_itinerary_items', 'set_itinerary_group_endpoints'],
    requiredOperations: ['add_itinerary_items', 'set_itinerary_group_endpoints'] }) });
  const receipts = [{ toolName: 'add_itinerary_items', status: 'completed' },
    { toolName: 'set_itinerary_group_endpoints', status: 'completed', output: { coverage: { groupCount: 1, reachesTrackEnd: true } } }];
  assert(taskOutcome(task, { draft: null, pendingQuestion: null }, receipts).status === 'partial');
  receipts[1].output!.coverage.groupCount = 5;
  assert(taskOutcome(task, { draft: null, pendingQuestion: null }, receipts).status === 'completed');
  receipts[1].output!.coverage.reachesTrackEnd = false;
  assert(taskOutcome(task, { draft: null, pendingQuestion: null }, receipts).status === 'partial');
});

Deno.test('full tracked app planning exposes and requires endpoints even with undecided days', () => {
  const task = state({ decision: constrainTaskDecision(decision({ days: null, packingMode: 'full',
    operations: ['add_itinerary_items', 'add_packing_items'], requiredOperations: ['add_itinerary_items', 'add_packing_items'],
  }), 'save', null, 'journey', { hasBoundTrack: true, intent: 'plan_journey' }) });
  assert(task.decision.operations.includes('set_itinerary_group_endpoints'));
  assert(task.decision.requiredOperations.includes('set_itinerary_group_endpoints'));
  const runtime = createAgentRuntime({ model: 'test', apiKey: 'test', baseUrl: 'https://example.test' }, true, task);
  assert(runtime.agent.tools.some(tool => tool.name === 'set_itinerary_group_endpoints'));
  const calls = [{ toolName: 'add_itinerary_items', status: 'completed' }, { toolName: 'add_packing_items', status: 'completed' },
    { toolName: 'update_journey_schedule', status: 'completed' }, { toolName: 'set_journey_map_location', status: 'completed' }];
  assert(taskOutcome(task, { draft: null, pendingQuestion: null }, calls).status === 'partial');
  for (const groupCount of [1, 6, 7]) {
    const result = taskOutcome(task, { draft: null, pendingQuestion: null }, [...calls, {
      toolName: 'set_itinerary_group_endpoints', status: 'completed', output: { coverage: { groupCount, requiredGroupCount: 7, reachesTrackEnd: true } },
    }]);
    assert(result.status === (groupCount === 7 ? 'completed' : 'partial'));
  }
  assert(task.decision.days === null, 'Suggested days became a user commitment');
});

Deno.test('endpoint dependency does not expand transport, discussion, packing-only or untracked tasks', () => {
  for (const patch of [{ mode: 'discuss' as const }, { packingMode: 'none' as const }, { operations: ['add_packing_items'] as const }]) {
    const input = decision({ packingMode: 'full', ...patch, operations: patch.operations ? [...patch.operations] : ['add_itinerary_items'] });
    assert(!constrainTaskDecision(input, 'save', null, 'journey', { hasBoundTrack: true, intent: 'plan_journey' }).operations.includes('set_itinerary_group_endpoints'));
  }
  assert(!constrainTaskDecision(decision({ fullHikingPlan: true }), 'save', null, 'journey', { hasBoundTrack: false }).operations.includes('set_itinerary_group_endpoints'));
  assert(constrainTaskDecision(decision({ fullHikingPlan: true }), 'save', null, 'journey', { hasBoundTrack: true }).operations.includes('set_itinerary_group_endpoints'));
});

Deno.test('an authorization quote differing only in punctuation or spacing still authorizes', () => {
  // The interpreter is asked to quote the user verbatim, but "帮我规划一下。" or
  // "帮我规划 一下" for "帮我规划一下，" is the same authorization; treating it
  // as a paraphrase silently turned an explicit plan request into a chat that
  // saved nothing.
  const message = '我准备去党岭三湖连穿徒步，天数还没确定，帮我规划一下';
  const planned = {
    objective: '规划徒步', mode: 'execute', continuation: false, authorizationQuote: '帮我规划一下。',
    operations: ['create_journey', 'add_itinerary_items'], requiredOperations: ['add_itinerary_items'],
    fullHikingPlan: true, destination: '党岭三湖连穿', plannedDate: null, dateUndecided: false,
    days: null, derivedDays: null, trackAttachmentName: null, packingMode: 'none', constraints: [],
    domain: null, domainQuote: null, authorizationUnconfirmed: false, activeHoursPerDay: null,
  } as TaskDecision;
  const kept = constrainTaskDecision(planned, message, null, null, { hasBoundTrack: false });
  assert(kept.mode === 'execute', `a formatting-only quote difference must keep execution, got ${kept.mode}`);
  assert(kept.operations.includes('create_journey'), 'the authorized writes survive');

  // A paraphrase is not the user's authorization and must still degrade.
  const paraphrased = constrainTaskDecision({ ...planned, authorizationQuote: '帮我规划徒步行程' }, message, null, null, { hasBoundTrack: false });
  assert(paraphrased.mode === 'discuss', 'a paraphrase must stay a discussion');
  assert(paraphrased.operations.length === 0, 'a discussion carries no authorized writes');
  const absent = constrainTaskDecision({ ...planned, authorizationQuote: '' }, message, null, null, { hasBoundTrack: false });
  assert(absent.mode === 'discuss', 'an empty quote must stay a discussion');
});

Deno.test('a paraphrased authorization is flagged for confirmation instead of silently discussing', () => {
  const message = '我准备去党岭三湖连穿徒步，天数还没确定，帮我规划一下';
  const planned = {
    objective: '规划徒步', mode: 'execute', continuation: false, authorizationQuote: '帮我规划徒步行程',
    operations: ['create_journey', 'add_itinerary_items'], requiredOperations: ['add_itinerary_items'],
    fullHikingPlan: true, destination: '党岭三湖连穿', plannedDate: null, dateUndecided: false,
    days: null, derivedDays: null, trackAttachmentName: null, packingMode: 'none', constraints: [],
    domain: null, domainQuote: null, authorizationUnconfirmed: false, activeHoursPerDay: null,
  } as TaskDecision;
  // The paraphrase still cannot authorize writes, but the turn must say so
  // rather than look like a plain discussion.
  const flag = constrainTaskDecision(planned, message, null, null, { hasBoundTrack: false });
  assert(flag.mode === 'discuss', 'a paraphrase must not authorize writes');
  assert(flag.authorizationUnconfirmed === true, 'an unverifiable execution request must be flagged');
  // A verified quote clears it, and a genuine question never sets it.
  const quoted = constrainTaskDecision({ ...planned, authorizationQuote: '帮我规划一下' }, message, null, null, { hasBoundTrack: false });
  assert(quoted.mode === 'execute' && quoted.authorizationUnconfirmed === false, 'a verified quote executes without the flag');
  const asked = constrainTaskDecision({ ...planned, mode: 'discuss', authorizationQuote: '' }, message, null, null, { hasBoundTrack: false });
  assert(asked.authorizationUnconfirmed === false, 'a question is not an unconfirmed execution request');
});

Deno.test('full hiking execution deterministically requires schedule and map writes without a track', () => {
  for (const patch of [{ fullHikingPlan: true }, { fullHikingPlan: false }] as const) {
    const result = constrainTaskDecision(decision(patch), 'save', null, 'journey', { hasBoundTrack: false, intent: 'plan_journey' });
    for (const operation of ['update_journey_schedule', 'set_journey_map_location'] as const) {
      assert(result.operations.includes(operation) && result.requiredOperations.includes(operation), `${operation} must be required`);
    }
  }
  const full = constrainTaskDecision(decision({ fullHikingPlan: true }), 'save', null, 'journey');
  assert(full.requiredOperations.includes('update_journey_schedule') && full.requiredOperations.includes('set_journey_map_location'));
  const undecided = constrainTaskDecision(decision({ fullHikingPlan: true }), 'save，天数还没确定，不需要问我，装备不用添加', null, 'journey');
  assert(undecided.operations.includes('update_journey_schedule') && undecided.operations.includes('set_journey_map_location'));
  const single = constrainTaskDecision(decision(), 'save', null, 'journey');
  assert(!single.operations.includes('update_journey_schedule') && !single.operations.includes('set_journey_map_location'));
});

Deno.test('full planning respects explicit schedule/map exclusions and discussion never gains writes', () => {
  for (const message of ['save，不要修改日期和天数，不用设置地图定位', 'save，日期不要改，地图不需要动', "save, don't change dates, no map updates"]) {
    const result = constrainTaskDecision(decision({ fullHikingPlan: true,
      operations: ['add_itinerary_items', 'update_journey_schedule', 'set_journey_map_location'],
    }), message, null, 'journey', { hasBoundTrack: true, intent: 'plan_journey' });
    assert(!result.operations.includes('update_journey_schedule') && !result.requiredOperations.includes('update_journey_schedule'));
    assert(!result.operations.includes('set_journey_map_location') && !result.requiredOperations.includes('set_journey_map_location'));
  }
  const result = constrainTaskDecision(decision({ mode: 'discuss', fullHikingPlan: true }), 'save', null, 'journey', { hasBoundTrack: true, intent: 'plan_journey' });
  assert(result.operations.length === 0 && result.requiredOperations.length === 0);
});

Deno.test('authorized full planning fills missing full-packing write permissions', () => {
  for (const context of [undefined, { hasBoundTrack: false, intent: 'plan_journey' }]) {
    const result = constrainTaskDecision(decision({ fullHikingPlan: true, packingMode: 'full' }), 'save', null, null, context);
    assert(result.operations.includes('add_packing_items') && result.requiredOperations.includes('add_packing_items'));
    assertTaskPackingMode(state({ decision: result }), 'full');
    assertTaskWrite(state({ decision: result }), 'add_packing_items', 'journey');
  }
  for (const patch of [{ domain: 'transport' }, { fullHikingPlan: false }, { mode: 'discuss' }, { packingMode: 'incremental' }] as const) {
    const result = constrainTaskDecision(decision({ fullHikingPlan: true, packingMode: 'full', ...patch }), 'save', null, 'journey');
    assert(!result.operations.includes('add_packing_items'), `unexpected packing permission: ${JSON.stringify(patch)}`);
  }
});

Deno.test('full planning respects packing already arranged or explicitly unwanted', () => {
  for (const message of ['save，装备不用添加', 'save，不需要装备清单', 'save，装备已经准备好了', 'save，装备已安排好', 'save，装备已经安排了', 'save，装备已备齐', 'save，不想要装备清单', "save, no packing", "save, don't generate packing", 'save, packing already arranged', 'save, packing is not wanted']) {
    const result = constrainTaskDecision(decision({ fullHikingPlan: true, packingMode: 'full', operations: ['add_itinerary_items', 'add_packing_items'] }), message, null, null);
    assert(result.packingMode === 'none' && !result.operations.includes('add_packing_items') && !result.requiredOperations.includes('add_packing_items'), `exclusion ignored: ${message}`);
  }
});

Deno.test('a verified unchanged schedule satisfies the task without a fabricated write receipt', () => {
  const task = state({ decision: decision({ requiredOperations: ['add_itinerary_items', 'update_journey_schedule'] }) });
  const calls = [{ toolName: 'add_itinerary_items', status: 'completed' }];
  const output = { pendingQuestion: null, draft: null };
  assert(taskOutcome(task, output, calls).status === 'partial');
  assert(taskOutcome(task, output, calls, ['update_journey_schedule']).status === 'completed');
});
