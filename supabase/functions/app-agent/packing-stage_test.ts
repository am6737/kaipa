// The packing stage's two halves are tested against a small in-memory
// PostgREST: the draft tools, the versioned context RPCs and the checklist
// write all run for real, so "the prewarm never commits items" is an observed
// fact rather than a claim about which function the stage calls. The last two
// tests drive the whole pipeline for the same reason: that an official plan's
// checklist is drafted beside the transport query, and for the length the
// timetable may still turn out to need, is a measured timing, not a code review.
import { bindRunClient, releaseRunClient } from './tools.ts';
import { bindPackingDraftStore, releasePackingDraftStore } from './packing-draft-store.ts';
import { prewarmPackingDraft, runPackingStage } from './packing-stage.ts';
import { mockDb } from './mock-postgrest.ts';
import { runPipeline, runRespond, type PipelineDeps } from './pipeline.ts';
import { planDocumentSchema } from './plan-document.ts';
import type { TaskDecision, TaskState } from './task.ts';
import type { AgentContext } from './types.ts';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const VERSIONS = { journey: 'v1', track: 'v1', itinerary: 'v1', packing: 'v1', gear: 'g1' };
// The journey row deliberately holds a shorter trip than the plan will save:
// a draft sized for the plan must be judged against the plan, not against it.
const JOURNEY = { id: 'j1', user_id: 'user', participant_permissions: null, days: 2, total_days: 2, dist: '', asc_: '', deleted_at: null, tracks: { duration_ms: 8 * 3_600_000 } };


// A checklist that clears every category the unknown profile requires; the two
// food rows carry the internal energy estimates the nutrition gate reads.
function item(name: string, extra: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return { name, attributes: null, categoryName: null, quantity: 1, weightKg: 0.2, weightEstimated: true, carryStatus: 'packed', estimatedEnergyKcalPerUnit: null, ...extra };
}
function proposal(): unknown {
  return {
    planProfile: null,
    items: [
      item('登山背包'), item('徒步鞋', { carryStatus: 'worn' }), item('速干T恤', { carryStatus: 'worn' }),
      item('水壶', { attributes: [{ name: '容量', value: '1.5L' }] }),
      item('矿泉水', { attributes: [{ name: '容量', value: '500ml' }], quantity: 2, carryStatus: 'consumable' }),
      item('手机'), item('充电宝', { attributes: [{ name: '容量', value: '20000mAh' }] }),
      item('头灯'), item('冲锋衣'), item('防晒霜'), item('碘伏棉棒'), item('创可贴'),
      item('医用胶带'), item('防磨贴'), item('救生哨'),
      item('能量棒', { attributes: [{ name: '单份净重', value: '50g/根' }], quantity: 8, weightKg: 0.05, carryStatus: 'consumable', estimatedEnergyKcalPerUnit: 250 }),
      item('牛肉干', { attributes: [{ name: '单份净重', value: '100g/袋' }], quantity: 4, weightKg: 0.1, carryStatus: 'consumable', estimatedEnergyKcalPerUnit: 260 }),
    ],
  };
}

function decision(overrides: Partial<TaskDecision> = {}): TaskDecision {
  return {
    objective: '规划党岭四天徒步', mode: 'execute', domain: 'hiking', domainQuote: null, authorizationUnconfirmed: false, activeHoursPerDay: null, continuation: false,
    authorizationQuote: '帮我规划党岭徒步并生成完整装备清单', operations: ['add_itinerary_items', 'add_packing_items'], requiredOperations: ['add_itinerary_items', 'add_packing_items'],
    fullHikingPlan: true, destination: '党岭', plannedDate: null, dateUndecided: true, days: 4, derivedDays: null, trackAttachmentName: null,
    packingMode: 'full', constraints: [], ...overrides,
  };
}

// The versioned context RPCs the pipeline and the packing stage both read.
function journeyRpc(calls: Array<{ name: string; params: Record<string, any> }>) {
  return async (name: string, params: Record<string, any>) => {
    calls.push({ name, params });
    if (name === 'agent_context_versions') return { data: VERSIONS, error: null };
    if (name === 'read_agent_journey_sections') return { data: { versions: VERSIONS, journey: JOURNEY, trackSummary: null, itinerary: [], itineraryGroups: [{ name: 'Day 1' }], packingLists: [] }, error: null };
    if (name === 'read_agent_gear') return { data: { version: VERSIONS.gear, items: [] }, error: null };
    if (name === 'apply_agent_journey_change') return { data: { output: params.p_output, versions: VERSIONS }, error: null };
    return { data: null, error: null };
  };
}

function packingHarness(options: { generate?: () => Promise<unknown>; plannedDays?: number | null } = {}) {
  const runId = crypto.randomUUID();
  const state: TaskState = { runId, journeyId: 'j1', decision: decision(), outcome: null };
  const context: AgentContext = { userId: 'user', threadId: `thread-${runId}`, runId, originalUserMessage: '帮我规划党岭徒步', task: state, currentJourneyId: 'j1' };
  const calls: Array<{ name: string; params: Record<string, any> }> = [];
  const { client, tables } = mockDb({ journeys: [{ ...JOURNEY }], companions: [{ id: 'c1', journey_id: 'j1', user_id: 'user', is_self: true, sort_order: 0 }], user_planning_profiles: [{ user_id: 'user', height_cm: 175, weight_kg: 70, age_years: 35, dietary_restrictions: '' }] }, journeyRpc(calls));
  bindRunClient(runId, client);
  bindPackingDraftStore(runId, client);
  const deps = {
    client, context, signal: new AbortController().signal,
    planProfile: null,
    planInput: '帮我规划党岭徒步并生成完整装备清单',
    plannedDays: options.plannedDays ?? null,
    generate: options.generate ?? (async () => proposal()),
    repair: async () => { throw new Error('repair must not be needed'); },
  };
  const toolNames = () => (tables.agent_tool_calls || []).map(row => String(row.tool_name));
  const draft = () => (tables.agent_packing_drafts || [])[0]?.state ?? null;
  const disposed = () => { releaseRunClient(runId); releasePackingDraftStore(runId); };
  return { ...deps, context, tables, calls, toolNames, draft, disposed };
}

Deno.test('the pre-save generation writes the draft without touching the checklist', async () => {
  const h = packingHarness({ plannedDays: 4 });
  try {
    await prewarmPackingDraft(h);
    assert(h.draft(), 'the durable draft must exist after the prewarm');
    assert(h.draft().plannedDays === 4, `the draft must remember the planned length, got ${h.draft().plannedDays}`);
    assert(!h.toolNames().includes('add_packing_items'), 'a prewarm may never write checklist items');
    assert(!h.toolNames().includes('commit_packing_draft'), 'a prewarm may never commit the draft');
    assert(!(h.tables.journey_packing_items || []).length && !(h.tables.journey_packing_lists || []).length, 'no checklist row may appear before the save');
  } finally { h.disposed(); }
});

Deno.test('the prewarm sizes the draft for the planned length, not the stored journey', async () => {
  const h = packingHarness({ plannedDays: 4 });
  try {
    await prewarmPackingDraft(h);
    const estimate = (h.tables.agent_tool_calls || []).find(row => row.tool_name === 'estimate_personal_packing_needs');
    assert(estimate?.arguments?.plannedDays === 4, `the estimate must carry the planned length, got ${JSON.stringify(estimate?.arguments)}`);
    assert((estimate?.output as { trip: { days: number } }).trip.days === 4, 'quantities are judged against the planned length');
  } finally { h.disposed(); }
});

Deno.test('the packing stage commits the prewarmed draft instead of generating again', async () => {
  const h = packingHarness({ plannedDays: 4 });
  let generated = 0;
  try {
    await prewarmPackingDraft(h);
    const revision = h.draft().revision;
    const artifact = await runPackingStage({ ...h, plannedDays: null, generate: async () => { generated += 1; return proposal(); } });
    assert(generated === 0, 'an existing draft is repaired, never regenerated');
    assert(artifact.status === 'committed' && (artifact.itemCount ?? 0) > 0, `unexpected artifact: ${JSON.stringify(artifact)}`);
    assert(artifact.revision === revision, 'the commit must reuse the prewarmed revision');
    // The stage re-estimates against the draft's own length, not the shorter
    // journey row the timetable may have left behind, so the repair prompt and
    // the nutrition gate agree with each other.
    const estimate = (h.tables.agent_tool_calls || []).filter(row => row.tool_name === 'estimate_personal_packing_needs').at(-1);
    assert(estimate?.arguments?.plannedDays === 4, `the stage must size needs from the draft, got ${JSON.stringify(estimate?.arguments)}`);
    assert(h.toolNames().filter(name => name === 'add_packing_items').length === 1, `items must be written once: ${h.toolNames().join(',')}`);
    const written = h.calls.filter(call => call.name === 'apply_agent_journey_change').at(-1)!;
    assert(written.params.p_journey_id === 'j1', 'the checklist write targets the bound journey');
  } finally { h.disposed(); }
});

Deno.test('a weight in the name and an oversized food list are fixed without a repair call', async () => {
  const base = proposal() as { planProfile: null; items: Array<Record<string, unknown>> };
  const items = base.items.map(row => row.name === '能量棒' ? { ...row, quantity: 60 } : row);
  items.push(item('保温杯（约 300g）', { weightKg: 0 }));
  // The harness's repair runner throws, so any issue left for the model would
  // surface as a partial commit instead of a clean one.
  const h = packingHarness({ plannedDays: 4, generate: async () => ({ planProfile: null, items }) });
  try {
    const artifact = await runPackingStage(h);
    assert(artifact.status === 'committed' && artifact.issues.length === 0, `expected a clean commit: ${JSON.stringify(artifact)}`);
    const cup = h.draft().items.find((row: { value: { name: string } }) => row.value.name === '保温杯');
    assert(cup?.value.weightKg === 0.3, `the cup weight belongs in weightKg: ${JSON.stringify(cup)}`);
    const bars = h.draft().items.find((row: { value: { name: string } }) => row.value.name === '能量棒');
    assert(bars.value.quantity < 60, `the food list must be sized down, got ${bars.value.quantity}`);
  } finally { h.disposed(); }
});

Deno.test('a repair in the provider shape, null for every unchanged field, is applied', async () => {
  const base = proposal() as { planProfile: null; items: Array<Record<string, unknown>> };
  const items = base.items.map(row => row.name === '矿泉水' ? { ...row, name: '饮用水' } : row);
  const id = `item-${items.findIndex(row => row.name === '饮用水') + 1}`;
  let repairs = 0;
  const h = packingHarness({ plannedDays: 4, generate: async () => ({ planProfile: null, items }) });
  try {
    const artifact = await runPackingStage({ ...h, repair: async () => {
      repairs += 1;
      return { revision: 1, additions: [], removals: [], changes: [{ id, patch: {
        name: '瓶装矿泉水', attributes: null, categoryName: null, quantity: null, weightKg: null, weightEstimated: null, carryStatus: null, estimatedEnergyKcalPerUnit: null,
      } }] };
    } });
    assert(repairs === 1, `one patch should clear the issue, took ${repairs}: ${JSON.stringify(artifact.issues)}`);
    assert(artifact.status === 'committed' && artifact.issues.length === 0, `expected a clean commit: ${JSON.stringify(artifact)}`);
    const water = h.draft().items.find((row: { id: string }) => row.id === id);
    assert(water.value.name === '瓶装矿泉水' && water.value.quantity === 2, `nulls must leave fields unchanged: ${JSON.stringify(water)}`);
  } finally { h.disposed(); }
});

Deno.test('a draft that cannot pass validation still keeps its usable rows', async () => {
  const h = packingHarness({ generate: async () => ({ planProfile: null, items: [{ ...item('急救包') }] }) });
  try {
    const artifact = await runPackingStage(h);
    assert(artifact.status !== 'failed', `a bad proposal must not fail the run: ${JSON.stringify(artifact)}`);
    assert(artifact.issues.length > 0, 'the un-repaired issues must be reported');
  } finally { h.disposed(); }
});

Deno.test('a failed generation reports the packing failure without losing the saved plan', async () => {
  const h = packingHarness({ generate: async () => { throw new Error('provider unavailable'); } });
  try {
    const artifact = await runPackingStage(h);
    assert(artifact.status === 'failed', `expected a failed artifact, got ${JSON.stringify(artifact)}`);
    assert(!h.toolNames().includes('add_packing_items'), 'nothing may be written from a generation that never returned');
    // The plan the save stage wrote is unaffected: the response still reports
    // it as saved, and only says the checklist is missing.
    const savedDocument = planDocumentSchema.parse({ itineraryItems: [{ day: 'Day 1', title: '党岭村出发' }] });
    const reply = await runRespond({ context: h.context, task: h.context.task } as unknown as PipelineDeps, new AbortController().signal, {
      plan: savedDocument,
      save: { journeyId: 'j1', saved: [{ tool: 'add_itinerary_items', output: { ok: true } }], failed: [], skipped: [], satisfied: [] },
      packing: artifact,
    }) as { text: string; blocker: string };
    assert(reply.blocker === '装备清单尚未完整生成。', `unexpected blocker: ${reply.blocker}`);
    assert(!reply.text.startsWith('旅程规划已完成并保存'), 'a missing checklist cannot be reported as a finished plan');
  } finally { h.disposed(); }
});

// The whole pipeline against the same in-memory PostgREST, so the overlap
// between an official plan's checklist work and its transport query is an
// observed timing rather than a claim about where the prewarm sits in
// runPipeline. The two model calls get different durations, which is what makes
// both serial orderings distinguishable from real concurrency. The run is
// cancelled exactly where the save would start: everything the ordering depends
// on happens before it, and no later stage can hide a regression.
function officialRunHarness(options: { access?: boolean; seeded?: boolean } = {}) {
  const runId = crypto.randomUUID();
  const events: Array<{ name: string; at: number }> = [];
  const started = performance.now();
  const mark = (name: string) => { events.push({ name, at: performance.now() - started }); };
  // The run stops at the save, and the checklist prewarm it started may still
  // be in its model call; the test waits these out so no timer outlives it.
  const timers: Promise<unknown>[] = [];
  const wait = (ms: number) => { const timer = new Promise(resolve => setTimeout(resolve, ms)); timers.push(timer); return timer; };
  const calls: Array<{ name: string; params: Record<string, any> }> = [];
  const shuttle = (from: string, to: string, position: 'start' | 'end') =>
    ({ from, to, mode: 'charter', duration: '约 3 小时', costRef: null, booking: null, position });
  const published = {
    id: 'p1', version: 1, route_id: 'r1', is_default: true, status: 'published',
    payload: { name: '三湖连穿', summary: '党岭三日', notes: ['带足保暖'],
      // A plan with an access block fixes where and when the shared ride leaves,
      // so it is expected to start on the arrival day and only the timetable can
      // add the day it fails to make.
      access: options.access ? { town: '丹巴', meetingPoint: '客运站', arriveBy: '07:30', stations: [{ name: '丹巴' }] } : null,
      exit: null, days: [
      { kind: 'access_in', title: '丹巴 → 党岭村', transfers: [shuttle('丹巴', '党岭村', 'start')], stay: { name: '党岭村' }, tip: null },
      { kind: 'hike', title: '党岭村 → 葫芦海 → 卓雍措营地', transfers: [], stay: { name: '卓雍措营地' }, tip: null },
      { kind: 'hike', title: '卓雍措营地 → 卡尔杂村', transfers: [shuttle('卡尔杂村', '丹巴', 'end')], stay: null, tip: null },
    ] },
  };
  const { client, tables } = mockDb({
    agent_runs: [{ id: runId, user_id: 'user', status: 'running', stage: null }],
    agent_stages: [
      { run_id: runId, user_id: 'user', attempt: 1, stage: 'interpret', status: 'completed', artifact: {}, error: null },
      { run_id: runId, user_id: 'user', attempt: 1, stage: 'research', status: 'completed', artifact: { destination: '党岭', routes: [] }, error: null },
    ],
    routes: [{ id: 'r1', name: '党岭三湖', track_elevation: null, track_waypoints: null }],
    route_itineraries: [published],
    journeys: [{ ...JOURNEY, route_id: 'r1', lng: 103.5, lat: 36.5 }],
    companions: [{ id: 'c1', journey_id: 'j1', user_id: 'user', is_self: true, sort_order: 0 }],
    user_planning_profiles: [{ user_id: 'user', height_cm: 175, weight_kg: 70, age_years: 35, dietary_restrictions: '' }],
    // The seeded city is the one the decision travels from, so a run with this
    // table present can settle the boarding station without asking a model.
    ...(options.seeded ? { rail_station_directory: [
      { station_name: '成都东', city: '成都', hub_rank: 1 },
      { station_name: '成都南', city: '成都', hub_rank: 2 },
      { station_name: '成都', city: '成都', hub_rank: 3 },
    ] } : {}),
  }, journeyRpc(calls));
  const admin = {
    from: (table: string) => {
      const chain: any = client.from(table);
      if (table === 'agent_stages') {
        const upsert = chain.upsert;
        chain.upsert = (values: any, options?: { onConflict?: string }) => { mark(`stage:${values.stage}:${values.status}`); return upsert(values, options); };
      }
      if (table === 'agent_runs') {
        const update = chain.update;
        chain.update = (values: any) => {
          if (values.stage === 'save') for (const row of tables.agent_runs) row.status = 'cancelled';
          return update(values);
        };
      }
      return chain;
    },
    rpc: (name: string, params: Record<string, any>) => client.rpc(name, params),
  };
  const state: TaskState = {
    runId, journeyId: 'j1', outcome: null,
    decision: decision({ days: null, travelRequest: { origin: '成都', returnDestination: '成都', modes: ['rail'], adults: 1, originQuote: '从成都出发', modesQuote: '坐高铁' } }),
  };
  const context: AgentContext = { userId: 'user', threadId: `thread-${runId}`, runId, originalUserMessage: '帮我规划党岭徒步并生成完整装备清单', task: state, currentJourneyId: 'j1', locale: 'zh' };
  const pipeline = {
    admin, client, context, task: state, runId, userId: 'user', attempt: 1,
    signal: new AbortController().signal, userInput: context.originalUserMessage, agentInput: null,
    model: 'test', flashModel: 'test',
    stageAgent: (config: any) => config,
    invoke: async (agent: any) => {
      if (agent.name === 'Kaipa Main Transport Endpoints') {
        mark('transport:query');
        await wait(300);
        mark('transport:answered');
        return { endpoints: [], unresolved: ['测试环境不查询班次。'] };
      }
      if (agent.name === 'Kaipa Packing Planner') {
        mark('packing:generate');
        await wait(80);
        mark('packing:drafted');
        return proposal();
      }
      throw new Error(`unexpected stage agent ${agent.name}`);
    },
  } as unknown as PipelineDeps;
  bindRunClient(runId, client, admin);
  bindPackingDraftStore(runId, admin);
  return {
    run: () => runPipeline(pipeline),
    events,
    at: (name: string) => events.find(event => event.name === name)?.at ?? Number.NaN,
    derivedDays: () => state.decision.derivedDays,
    toolNames: () => (tables.agent_tool_calls || []).map(row => String(row.tool_name)),
    queriedStations: () => (tables.agent_tool_calls || [])
      .filter(row => row.tool_name === 'search_transport')
      .map(row => `${String(row.arguments?.origin)}→${String(row.arguments?.destination)}`),
    draft: () => (tables.agent_packing_drafts || [])[0]?.state ?? null,
    disposed: async () => { await Promise.all(timers); releaseRunClient(runId); releasePackingDraftStore(runId); },
  };
}

Deno.test('an official plan drafts the checklist while the transport query is still open', async () => {
  const h = officialRunHarness();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => { throw new Error('offline test'); }) as unknown as typeof fetch;
  try {
    const result = await h.run();
    assert(result.aborted, 'the harness stops the run where the plan would be saved');
    const query = h.at('transport:query');
    const drafted = h.at('packing:drafted');
    const answered = h.at('transport:answered');
    const log = JSON.stringify(h.events);
    assert(drafted > query, `transport must not wait for the checklist to be drafted: ${log}`);
    assert(drafted < answered, `the checklist must be drafted beside the transport query: ${log}`);
    assert(h.draft()?.plannedDays === 4, `the prewarmed draft must remember the planned length, got ${JSON.stringify(h.draft())}`);
    assert(!h.toolNames().includes('add_packing_items'), `nothing may reach the checklist before the save: ${h.toolNames().join(',')}`);
  } finally {
    globalThis.fetch = originalFetch;
    await h.disposed();
  }
});

Deno.test('a plan that fixes its meeting point sizes the draft for the day the timetable may add', async () => {
  const h = officialRunHarness({ access: true });
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => { throw new Error('offline test'); }) as unknown as typeof fetch;
  try {
    const result = await h.run();
    assert(result.aborted, 'the harness stops the run where the plan would be saved');
    // The plan is three walking days that expect to start on the arrival day, so
    // the trip only becomes four days when the timetable fails to make the
    // meeting point: the draft is sized for that fourth day before the answer.
    assert(h.at('packing:drafted') < h.at('transport:answered'), 'the draft must be written before the timetable answers');
    assert(h.derivedDays() === 4, `the trip gained the travel day, got ${h.derivedDays()}`);
    assert(h.draft()?.plannedDays === 4, `the draft must cover the added day, got ${JSON.stringify(h.draft())}`);
  } finally {
    globalThis.fetch = originalFetch;
    await h.disposed();
  }
});

Deno.test('a seeded station directory boards the train without asking the endpoints model', async () => {
  const h = officialRunHarness({ access: true, seeded: true });
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => { throw new Error('offline test'); }) as unknown as typeof fetch;
  try {
    const result = await h.run();
    assert(result.aborted, 'the harness stops the run where the plan would be saved');
    const log = JSON.stringify(h.events);
    assert(!h.events.some(event => event.name === 'transport:query'),
      `the boarding station is looked up, not asked: ${log}`);
    // 成都 has several stations and the directory ranks 成都东 first, which is
    // exactly the decision the model used to spend ~15 s on.
    assert(h.queriedStations().some(route => route.startsWith('成都东→')),
      `the settled station must be the one queried, got ${h.queriedStations().join(',')}`);
    assert(h.toolNames().includes('search_transport'), `the timetable is still consulted: ${h.toolNames().join(',')}`);
    assert(h.events.some(event => event.name === 'stage:transport:completed'), `the stage still finishes: ${log}`);
    assert(h.events.some(event => event.name === 'packing:generate'), `the checklist is still drafted beside the query: ${log}`);
    assert(h.derivedDays() === 4, `the offline timetable still adds the travel day, got ${h.derivedDays()}`);
  } finally {
    globalThis.fetch = originalFetch;
    await h.disposed();
  }
});
