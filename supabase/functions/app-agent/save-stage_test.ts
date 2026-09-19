import { bindRunClient, releaseRunClient } from './tools.ts';
import { runSaveStage } from './save-stage.ts';
import { planDocumentSchema, type PlanDocument } from './plan-document.ts';
import type { TaskDecision, TaskState } from './task.ts';
import type { AgentContext } from './types.ts';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const VERSIONS = { journey: 'v1', track: 'v1', itinerary: 'v1', packing: 'v1', gear: 'v1' };
const JOURNEY = { id: 'j1', user_id: 'user', participant_permissions: null, total_days: 5, dist: '' };

function decision(operations: TaskDecision['operations']): TaskDecision {
  return {
    objective: '规划两天徒步', mode: 'execute', domain: 'hiking', continuation: false,
    authorizationQuote: '帮我规划两天徒步', operations, requiredOperations: operations, fullHikingPlan: true,
    destination: '党岭', plannedDate: null, dateUndecided: true, days: 2, trackAttachmentName: null,
    packingMode: 'none', constraints: [],
  };
}

// Mirrors the parts of the data layer the save stage touches: the journal with
// its (run, tool, arguments_hash) uniqueness, the versioned context RPCs and
// the atomic write transaction. Receipts recorded by one pass are returned by
// the next, so replay is exercised for real instead of being stubbed out.
function saveHarness(options: { operations?: TaskDecision['operations']; fail?: string[] } = {}) {
  const runId = crypto.randomUUID();
  const state: TaskState = { runId, journeyId: null, decision: decision(options.operations || ['create_journey', 'add_itinerary_items', 'set_itinerary_group_endpoints', 'set_journey_map_location']), outcome: null };
  const context: AgentContext = { userId: 'user', threadId: 'thread', runId, originalUserMessage: '帮我规划两天徒步', task: state };
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
        if (table === 'journeys') return { data: JOURNEY, error: null };
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
      if (name === 'agent_context_versions') return { data: VERSIONS, error: null };
      if (name === 'read_agent_journey_sections') return { data: { versions: VERSIONS, journey: JOURNEY, trackSummary: null, itinerary: [], itineraryGroups: [] }, error: null };
      if (name === 'create_agent_journey') return fail.has('create_journey')
        ? { data: null, error: { message: '创建旅程失败：缺少已确认的出发日期' } }
        : { data: { id: 'j1', name: '党岭三湖连穿', region: '四川', planned_date: null, total_days: 2 }, error: null };
      if (name === 'apply_agent_journey_change') {
        const tool = byCallId.get(String(params.p_call_id)) || '';
        if (fail.has(tool)) return { data: null, error: { message: `校验失败：${tool}` } };
        const row = journal.get(tool);
        if (row) { row.status = 'completed'; row.output = { ok: tool }; }
        return { data: { output: { ok: tool }, versions: VERSIONS }, error: null };
      }
      return { data: null, error: null };
    },
  };
  bindRunClient(runId, client);
  return { client, context, executed, journal, dispose: () => releaseRunClient(runId) };
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

function plan(patch: Partial<PlanDocument> = {}): PlanDocument {
  return planDocumentSchema.parse({
    journey: { name: '党岭三湖连穿', region: '四川', days: 2 },
    mapLocation: null, schedule: null, transport: null, packingProfile: null,
    assumptions: [], unverified: [], blocker: null, pendingQuestion: null,
    ...patch,
  });
}

Deno.test('the save stage writes creation, itinerary and map location in order', async () => {
  const h = saveHarness();
  try {
    const artifact = await withGeocoder(() => runSaveStage(h.client as never, h.context, plan({
      itineraryItems: [{ day: 'Day 1', title: '党岭村出发', timeStart: '07:00' }],
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
      itineraryItems: [{ day: 'Day 1', title: '党岭村出发' }],
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
      itineraryItems: [{ day: 'Day 1', title: '党岭村出发' }],
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
    const artifact = await runSaveStage(h.client as never, h.context, plan({ itineraryItems: [{ day: 'Day 1', title: '党岭村出发' }] }));
    assert(artifact.failed.length === 1 && artifact.failed[0].tool === 'create_journey', `unexpected failures: ${JSON.stringify(artifact.failed)}`);
    assert(artifact.saved.length === 0, 'nothing may be reported as saved');
    assert(artifact.skipped.every(entry => entry.reason === 'journey_create_failed'), `unexpected skips: ${JSON.stringify(artifact.skipped)}`);
    assert(artifact.journeyId === null, 'a failed creation must not report a journey');
  } finally { h.dispose(); }
});

Deno.test('a retried save replays completed receipts instead of writing twice', async () => {
  const h = saveHarness();
  try {
    const document = plan({ itineraryItems: [{ day: 'Day 1', title: '党岭村出发' }], mapLocation: { query: '党岭村' } });
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
