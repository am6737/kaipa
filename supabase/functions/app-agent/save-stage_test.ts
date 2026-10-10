import { bindRunClient, releaseRunClient } from './tools.ts';
import { runSaveStage } from './save-stage.ts';
import { planDocumentSchema, type PlanDocument } from './plan-document.ts';
import type { TaskDecision, TaskState } from './task.ts';
import type { AgentContext } from './types.ts';
import { runRespond, runSave, type PipelineDeps } from './pipeline.ts';
import { assertCreationFacts } from './task.ts';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const VERSIONS = { journey: 'v1', track: 'v1', itinerary: 'v1', packing: 'v1', gear: 'v1' };
const JOURNEY = { id: 'j1', user_id: 'user', participant_permissions: null, total_days: 5, dist: '' };

function decision(operations: TaskDecision['operations']): TaskDecision {
  return {
    objective: '规划两天徒步', mode: 'execute', domain: 'hiking', domainQuote: null, authorizationUnconfirmed: false, activeHoursPerDay: null, continuation: false,
    authorizationQuote: '帮我规划两天徒步', operations, requiredOperations: operations, fullHikingPlan: true,
    destination: '党岭', plannedDate: null, dateUndecided: true, days: 2, derivedDays: null, trackAttachmentName: null,
    packingMode: 'none', constraints: [],
  };
}

// Mirrors the parts of the data layer the save stage touches: the journal with
// its (run, tool, arguments_hash) uniqueness, the versioned context RPCs and
// the atomic write transaction. Receipts recorded by one pass are returned by
// the next, so replay is exercised for real instead of being stubbed out.
function saveHarness(options: { operations?: TaskDecision['operations']; fail?: string[]; error?: unknown; existing?: boolean; groups?: string[] } = {}) {
  const runId = crypto.randomUUID();
  const state: TaskState = { runId, journeyId: null, decision: decision(options.operations || ['create_journey', 'add_itinerary_items', 'set_itinerary_group_endpoints', 'set_journey_map_location']), outcome: null };
  const context: AgentContext = { userId: 'user', threadId: 'thread', runId, originalUserMessage: '帮我规划两天徒步', task: state };
  if (options.existing) { state.journeyId = 'j1'; context.currentJourneyId = 'j1'; }
  let journey = { ...JOURNEY, planned_date: null as string | null };
  let groups = options.groups || [];
  let versions = { ...VERSIONS };
  const changes: Array<Record<string, any>> = [];
  const reads: string[][] = [];
  const fail = new Set(options.fail || []);
  const journal = new Map<string, { id: string; tool_name: string; status: string; output: unknown }>();
  const executed: string[] = [];
  const byCallId = new Map<string, string>();
  let sequence = 0;

  const chainFor = (table: string) => {
    const filters: Array<[string, unknown]> = [];
    const chain: Record<string, unknown> = {};
    const self = () => chain;
    let pendingUpdate: Record<string, unknown> | null = null;
    Object.assign(chain, {
      select: self, eq: (column: string, value: unknown) => { filters.push([column, value]); return chain; },
      neq: self, in: self, ilike: self, limit: self, order: self, is: self, not: self,
      upsert: (value: Record<string, unknown>) => {
        if (table === 'agent_tool_calls') {
          const id = `call-${++sequence}`;
          byCallId.set(id, String(value.tool_name));
          journal.set(`${value.tool_name}`, { id, tool_name: String(value.tool_name), status: 'running', output: null });
          executed.push(String(value.tool_name));
          return { ...chain, select: () => ({ single: async () => ({ data: { id }, error: null }) }) };
        }
        return chain;
      },
      update: (value: Record<string, unknown>) => { if (table === 'agent_tool_calls') pendingUpdate = value; return chain; },
      maybeSingle: async () => {
        if (table === 'agent_tool_calls') {
          const tool = String(filters.find(([column]) => column === 'tool_name')?.[1]);
          const row = journal.get(tool);
          return { data: row && row.status === 'completed' ? { status: row.status, output: row.output } : null, error: null };
        }
        return { data: null, error: null };
      },
      single: async () => {
        if (table === 'journeys') return { data: journey, error: null };
        if (table === 'agent_threads') return { data: { current_journey_id: null }, error: null };
        if (table === 'profiles') return { data: { nick: '我' }, error: null };
        return { data: null, error: null };
      },
      then: (resolve: (value: unknown) => unknown) => {
        if (table === 'agent_tool_calls' && pendingUpdate) {
          const id = filters.find(([column]) => column === 'id')?.[1];
          for (const row of journal.values()) if (id === undefined || row.id === id) Object.assign(row, pendingUpdate);
          pendingUpdate = null;
        }
        return Promise.resolve({ data: [], error: null }).then(resolve);
      },
    });
    return chain;
  };

  const client = {
    from: (table: string) => chainFor(table),
    rpc: async (name: string, params: Record<string, unknown>) => {
      if (name === 'agent_context_versions') return { data: versions, error: null };
      if (name === 'read_agent_journey_sections') {
        reads.push(params.p_sections as string[]);
        return { data: { versions, journey, trackSummary: null, itinerary: [], itineraryGroups: groups.map(name => ({ name })) }, error: null };
      }
      if (name === 'create_agent_journey') {
        if (fail.has('create_journey')) return { data: null, error: { message: '创建旅程失败：缺少已确认的出发日期' } };
        journey = { ...journey, ...(params.p_journey as typeof journey), id: 'j1' };
        return { data: { ...journey, name: '党岭三湖连穿', region: '四川' }, error: null };
      }
      if (name === 'apply_agent_journey_change') {
        const tool = byCallId.get(String(params.p_call_id)) || '';
        if (fail.has(tool)) return { data: null, error: options.error ?? { message: `校验失败：${tool}` } };
        const change = params.p_change as Record<string, any>;
        changes.push({ tool, ...change });
        if (tool === 'add_itinerary_items') {
          groups = [...new Set([...groups, ...change.rows.map((item: { day: string }) => item.day)])];
          versions = { ...versions, itinerary: `${versions.itinerary}+1` };
        }
        if (tool === 'update_journey_schedule') {
          const assignments = change.dayAssignments as Array<{ from: string; toDay: number }>;
          if (assignments.length !== groups.length || groups.some(name => !assignments.some(entry => entry.from === name))
            || new Set(assignments.map(entry => entry.toDay)).size !== groups.length) {
            return { data: null, error: { code: 'P0001', message: 'Provide each existing day/group exactly once with a distinct day within totalDays' } };
          }
          journey = { ...journey, total_days: change.totalDays, planned_date: change.plannedDate ?? journey.planned_date };
          versions = { ...versions, journey: `${versions.journey}+1`, itinerary: `${versions.itinerary}+1` };
        }
        const row = journal.get(tool);
        if (row) { row.status = 'completed'; row.output = { ok: tool }; }
        return { data: { output: { ok: tool }, versions }, error: null };
      }
      return { data: null, error: null };
    },
  };
  bindRunClient(runId, client);
  return { client, context, executed, journal, changes, reads, dispose: () => releaseRunClient(runId) };
}

// The map-location write geocodes through the AMap REST API; a local stub keeps
// the test offline while still exercising the real operation.
async function withGeocoder<T>(run: () => Promise<T>): Promise<T> {
  const key = Deno.env.get('AMAP_WEB_KEY');
  const originalFetch = globalThis.fetch;
  Deno.env.set('AMAP_WEB_KEY', 'test-key');
  globalThis.fetch = (async () => ({
    ok: true,
    json: async () => ({ status: '1', pois: [{ location: '103.5123,30.9876', name: '党岭村', cityname: '甘孜藏族自治州' }] }),
  })) as unknown as typeof fetch;
  try {
    return await run();
  } finally {
    globalThis.fetch = originalFetch;
    if (key === undefined) Deno.env.delete('AMAP_WEB_KEY');
    else Deno.env.set('AMAP_WEB_KEY', key);
  }
}

// 嵌套对象允许只写关心的字段：schema 现在要求显式给出每个键（strict 校验不
// 接受缺字段），这里把没写的补成 null，夹具因此保持简短。
type PlanPatch = Omit<Partial<PlanDocument>, 'itineraryItems' | 'endpoints' | 'mapLocation'> & {
  itineraryItems?: Array<Partial<PlanDocument['itineraryItems'][number]>>;
  endpoints?: Array<Partial<PlanDocument['endpoints'][number]>>;
  mapLocation?: Partial<NonNullable<PlanDocument['mapLocation']>> | null;
};
function plan(patch: PlanPatch = {}): PlanDocument {
  // 模型 schema 现在要求这些字段显式给出（strict 校验不接受缺字段），
  // 夹具保持简短：在这里补成 null。
  const normalized: Partial<PlanDocument> = { ...patch } as Partial<PlanDocument>;
  if (patch.itineraryItems) normalized.itineraryItems = patch.itineraryItems.map((item) => ({ ...item, timeStart: item.timeStart ?? null, timeEnd: item.timeEnd ?? null, location: item.location ?? null })) as PlanDocument['itineraryItems'];
  if (patch.endpoints) normalized.endpoints = patch.endpoints.map((endpoint) => ({ ...endpoint, waypointIndex: endpoint.waypointIndex ?? null, trackFinish: endpoint.trackFinish ?? null, endDistanceKm: endpoint.endDistanceKm ?? null, locationName: endpoint.locationName ?? null, estimateBasis: endpoint.estimateBasis ?? null, userDistanceQuote: endpoint.userDistanceQuote ?? null, overnightReview: endpoint.overnightReview ?? null, routeId: endpoint.routeId ?? null })) as PlanDocument['endpoints'];
  if (patch.mapLocation) normalized.mapLocation = { ...patch.mapLocation, region: patch.mapLocation.region ?? null } as PlanDocument['mapLocation'];
  return planDocumentSchema.parse({
    journey: { name: '党岭三湖连穿', region: '四川', days: 2 },
    mapLocation: null, schedule: null, transport: null, packingProfile: null,
    assumptions: [], unverified: [], blocker: null, pendingQuestion: null,
    ...normalized,
  });
}

Deno.test('the save stage writes creation, itinerary and map location in order', async () => {
  const h = saveHarness();
  try {
    const artifact = await withGeocoder(() => runSaveStage(h.client as never, h.context, plan({
      itineraryItems: [{ day: 'Day 1', title: '党岭村出发', timeStart: '07:00', routeId: null, kind: 'activity' }],
      mapLocation: { query: '党岭村' },
    })));
    assert(JSON.stringify(h.executed) === JSON.stringify(['create_journey', 'add_itinerary_items', 'set_journey_map_location']), `unexpected order: ${h.executed.join(',')}`);
    assert(artifact.failed.length === 0, `unexpected failures: ${JSON.stringify(artifact.failed)}`);
    assert(artifact.journeyId === 'j1', 'the created journey must be reported back');
    assert(h.context.task?.journeyId === 'j1', 'later operations must target the created journey');
  } finally { h.dispose(); }
});

Deno.test('an operation the user never authorized is skipped, not attempted', async () => {
  const h = saveHarness({ operations: ['create_journey', 'add_itinerary_items'] });
  try {
    const artifact = await runSaveStage(h.client as never, h.context, plan({
      itineraryItems: [{ day: 'Day 1', title: '党岭村出发', routeId: null, kind: 'activity' }],
      mapLocation: { query: '党岭村' },
    }));
    assert(!h.executed.includes('set_journey_map_location'), 'an unauthorized write must never reach the journal');
    assert(artifact.skipped.some(entry => entry.tool === 'set_journey_map_location' && entry.reason === 'unauthorized'), `unexpected skips: ${JSON.stringify(artifact.skipped)}`);
  } finally { h.dispose(); }
});

Deno.test('a failed itinerary write stops the endpoints that depend on it', async () => {
  const h = saveHarness({ fail: ['add_itinerary_items'] });
  try {
    const artifact = await runSaveStage(h.client as never, h.context, plan({
      itineraryItems: [{ day: 'Day 1', title: '党岭村出发', routeId: null, kind: 'activity' }],
      endpoints: [{ day: 'Day 1', trackFinish: true }],
    }));
    assert(artifact.failed.length === 1 && artifact.failed[0].tool === 'add_itinerary_items', `unexpected failures: ${JSON.stringify(artifact.failed)}`);
    assert(!h.executed.includes('set_itinerary_group_endpoints'), 'endpoints without day groups must not be attempted');
    assert(artifact.skipped.some(entry => entry.tool === 'set_itinerary_group_endpoints' && entry.reason === 'itinerary_failed'), `unexpected skips: ${JSON.stringify(artifact.skipped)}`);
    assert(artifact.saved.some(entry => entry.tool === 'create_journey'), 'the journey created before the failure must stay saved');
  } finally { h.dispose(); }
});

Deno.test('a failed creation stops the save instead of writing to nothing', async () => {
  const h = saveHarness({ fail: ['create_journey'] });
  try {
    const artifact = await runSaveStage(h.client as never, h.context, plan({ itineraryItems: [{ day: 'Day 1', title: '党岭村出发', routeId: null, kind: 'activity' }] }));
    assert(artifact.failed.length === 1 && artifact.failed[0].tool === 'create_journey', `unexpected failures: ${JSON.stringify(artifact.failed)}`);
    assert(artifact.saved.length === 0, 'nothing may be reported as saved');
    assert(artifact.skipped.every(entry => entry.reason === 'journey_create_failed'), `unexpected skips: ${JSON.stringify(artifact.skipped)}`);
    assert(artifact.journeyId === null, 'a failed creation must not report a journey');
  } finally { h.dispose(); }
});

Deno.test('a retried save replays completed receipts instead of writing twice', async () => {
  const h = saveHarness();
  try {
    const document = plan({ itineraryItems: [{ day: 'Day 1', title: '党岭村出发', routeId: null, kind: 'activity' }], mapLocation: { query: '党岭村' } });
    const first = await withGeocoder(() => runSaveStage(h.client as never, h.context, document));
    assert(first.saved.length === 3, `unexpected first pass: ${JSON.stringify(first)}`);
    // A retry re-enters with a fresh context, exactly like a resumed job.
    const retryContext: AgentContext = { ...h.context, dataContext: undefined, writeReceipt: undefined };
    const second = await withGeocoder(() => runSaveStage(h.client as never, retryContext, document));
    assert(second.failed.length === 0, `replay must not fail: ${JSON.stringify(second.failed)}`);
    assert(h.executed.length === 3, `replay re-executed a completed write: ${h.executed.join(',')}`);
    assert((retryContext.task as TaskState).journeyId === 'j1', 'replayed creation must restore the journey binding');
  } finally { h.dispose(); }
});

Deno.test('save failures preserve PostgREST message, code, details and hint for repair', async () => {
  const error = { message: 'Provide each existing day/group exactly once with a distinct day within totalDays', code: 'P0001', details: 'Day 1 is missing', hint: 'Include all groups' };
  const h = saveHarness({ operations: ['update_journey_schedule'], fail: ['update_journey_schedule'], error, existing: true });
  try {
    const artifact = await runSaveStage(h.client as never, h.context, plan({ journey: null, schedule: { totalDays: 2, plannedDate: null, dayAssignments: [] } }));
    assert(artifact.failed.length === 1, 'the schedule must fail');
    const serialized = artifact.failed[0].error;
    assert(serialized !== '[object Object]', 'the repair stage must receive usable context');
    assert(JSON.stringify(JSON.parse(serialized)) === JSON.stringify(error), 'all PostgREST fields must survive');
  } finally { h.dispose(); }
});

Deno.test('a fresh six-day plan satisfies its schedule after saving actual groups', async () => {
  const h = saveHarness({ operations: ['create_journey', 'add_itinerary_items', 'update_journey_schedule'] });
  h.context.task!.decision.days = 6;
  try {
    const document = plan({
      journey: { name: '党岭', region: '四川', days: 6, plannedDate: null, routeId: null, trackAttachmentName: null, description: null },
      itineraryItems: Array.from({ length: 6 }, (_, index) => ({ day: `Day ${index + 1}`, title: '具体地点' })),
      // The repair in S3.2 omitted Day 6. New groups come from the items,
      // so this incomplete outline must never be sent to the schedule RPC.
      schedule: { totalDays: 6, plannedDate: null, dayAssignments: Array.from({ length: 5 }, (_, index) => ({ from: `Day ${index + 1}`, toDay: index + 1 })) },
    });
    const artifact = await runSaveStage(h.client, h.context, document);
    assert(!artifact.failed.length && artifact.satisfied?.includes('update_journey_schedule'), `unexpected result: ${JSON.stringify(artifact)}`);
    assert(h.executed.join() === 'create_journey,add_itinerary_items', 'an already applied schedule needs no RPC');
    assert(h.reads.length === 2, 'schedule must check groups after the item write invalidates the snapshot');
    const reply = await runRespond({ context: h.context, task: h.context.task } as PipelineDeps, new AbortController().signal, { plan: document, save: artifact, packing: null }) as { text: string };
    assert(reply.text.startsWith('行程规划已完成并保存'), 'satisfied schedule must count in the response');
  } finally { h.dispose(); }
});

Deno.test('a fresh schedule change uses every saved group instead of outline assignments', async () => {
  const h = saveHarness({ operations: ['create_journey', 'add_itinerary_items', 'update_journey_schedule'] });
  try {
    const artifact = await runSaveStage(h.client, h.context, plan({
      itineraryItems: [{ day: 'Day 1', title: '起点' }, { day: 'Day 2', title: '终点' }],
      schedule: { totalDays: 3, plannedDate: null, dayAssignments: [{ from: 'Day 3', toDay: 3 }] },
    }));
    assert(!artifact.failed.length, `fresh schedule failed: ${JSON.stringify(artifact)}`);
    assert(h.executed.join() === 'create_journey,add_itinerary_items,update_journey_schedule', 'schedule must follow items for a new journey');
    const assignments = h.changes.find(change => change.tool === 'update_journey_schedule')?.dayAssignments;
    assert(JSON.stringify(assignments) === JSON.stringify([{ from: 'Day 1', toDay: 1 }, { from: 'Day 2', toDay: 2 }]), 'assignments must match saved groups exactly');
  } finally { h.dispose(); }
});

Deno.test('an app-created empty journey saves groups before its first schedule', async () => {
  const h = saveHarness({ operations: ['add_itinerary_items', 'update_journey_schedule'], existing: true });
  try {
    const artifact = await runSaveStage(h.client, h.context, plan({
      journey: null,
      itineraryItems: Array.from({ length: 5 }, (_, index) => ({ day: `Day ${index + 1}`, title: '具体地点' })),
      schedule: { totalDays: 5, plannedDate: '2026-10-09', dayAssignments: [{ from: 'Day 1', toDay: 1 }] },
    }));
    assert(!artifact.failed.length, `empty journey failed: ${JSON.stringify(artifact)}`);
    assert(h.executed.join() === 'add_itinerary_items,update_journey_schedule', 'groups must precede the initial schedule');
    assert(h.changes[1].dayAssignments.length === 5, 'schedule must use actual saved groups rather than the model outline');
  } finally { h.dispose(); }
});

Deno.test('save repair timeout retains concrete failed operations and partial response', async () => {
  const h = saveHarness({ operations: ['add_itinerary_items'], fail: ['add_itinerary_items'], existing: true });
  const controller = new AbortController();
  try {
    const document = plan({ journey: null, itineraryItems: [{ day: 'Day 1', title: '具体地点' }] });
    const pipeline = {
      client: h.client, context: h.context, task: h.context.task, userInput: '帮我规划',
      stageAgent: () => ({}), model: 'test',
      invoke: async () => { controller.abort(); throw new Error('Request was aborted.'); },
    } as unknown as PipelineDeps;
    const artifact = await runSave(pipeline, controller.signal, document, null);
    assert(artifact.failed[0]?.error.includes('校验失败'), 'original write failure must survive repair timeout');
    const reply = await runRespond(pipeline, new AbortController().signal, { plan: document, save: artifact, packing: null }) as { text: string; blocker: string };
    assert(!reply.text.startsWith('行程规划已完成并保存') && reply.blocker === '部分规划内容保存失败。', 'timeout cannot become a completion claim');
  } finally { h.dispose(); }
});

Deno.test('existing journey schedules preserve model moves and run before item writes', async () => {
  const h = saveHarness({ operations: ['add_itinerary_items', 'update_journey_schedule'], existing: true, groups: ['Day 1', 'Day 2'] });
  try {
    const artifact = await runSaveStage(h.client, h.context, plan({
      journey: null, itineraryItems: [{ day: 'Day 3', title: '新增地点' }],
      schedule: { totalDays: 5, plannedDate: '2026-10-12', dayAssignments: [{ from: '2026-10-12', toDay: 2 }, { from: 'Day 2', toDay: 1 }] },
    }));
    assert(!artifact.failed.length && h.executed.join() === 'update_journey_schedule,add_itinerary_items', 'existing schedule order must stay unchanged');
    const assignments = h.changes[0].dayAssignments;
    assert(assignments[0].from === 'Day 1' && assignments[0].toDay === 2 && assignments[1].toDay === 1, 'date names normalize but intentional moves survive');
    assert(!artifact.satisfied?.length, 'an explicit existing-journey schedule remains a real write');
  } finally { h.dispose(); }
});

Deno.test('required schedule with no changes is satisfied only when saved duration and date match', async () => {
  for (const days of [5, 6]) {
    const h = saveHarness({ operations: ['add_itinerary_items', 'update_journey_schedule'], existing: true, groups: ['Day 1'] });
    h.context.task!.decision.days = days;
    try {
      const document = plan({ journey: null, itineraryItems: [{ day: 'Day 1', title: '具体地点' }], schedule: null });
      const artifact = await runSaveStage(h.client, h.context, document);
      assert(Boolean(artifact.satisfied?.includes('update_journey_schedule')) === (days === 5), 'duration mismatch must remain incomplete');
      const reply = await runRespond({ context: h.context, task: h.context.task } as PipelineDeps, new AbortController().signal, { plan: document, save: artifact, packing: null }) as { text: string };
      assert(reply.text.startsWith('行程规划已完成并保存') === (days === 5), 'response must reflect the verified schedule');
    } finally { h.dispose(); }
  }
  const h = saveHarness({ operations: ['update_journey_schedule'], existing: true });
  h.context.task!.decision.days = 5;
  h.context.task!.decision.plannedDate = '2026-10-12';
  try {
    const artifact = await runSaveStage(h.client, h.context, plan({ journey: null }));
    assert(!artifact.satisfied?.length, 'a missing date must not satisfy the requested schedule');
  } finally { h.dispose(); }
});

Deno.test('a saved candidate with disclosures still binds the journey for downstream packing and response', async () => {
  const h = saveHarness({ operations: ['create_journey', 'add_itinerary_items'] });
  h.context.task!.decision.days = null;
  h.context.task!.decision.derivedDays = 2;
  try {
    const document = plan({ itineraryItems: [{ day: 'Day 1', title: '徒步起点' }], blocker: '接驳班次尚未核实', pendingQuestion: '是否接受候选安排？' });
    assertCreationFacts(h.context.task, { days: 2 });
    const artifact = await runSaveStage(h.client, h.context, document);
    assert(!artifact.failed.length && artifact.journeyId === 'j1' && h.context.currentJourneyId === 'j1', 'candidate must bind the journey');
    const reply = await runRespond({ context: h.context, task: h.context.task } as PipelineDeps, new AbortController().signal, { plan: document, save: artifact, packing: null }) as { pendingQuestion: string; blocker: string; text: string };
    assert(reply.pendingQuestion === document.pendingQuestion && reply.blocker === document.blocker && reply.text.includes('已保留'), 'saved candidate disclosures must survive response');
  } finally { h.dispose(); }
});
