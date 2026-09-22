import { acceptWriteVersions, contextPrompt, expectedWriteVersions, invalidateContext, prepareAgentContext, readAgentGear, readJourneySections } from './context.ts';
import type { AgentContext } from './types.ts';

function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }
function harness() {
  const context: AgentContext = { userId: 'u', threadId: 't', runId: 'r', currentJourneyId: 'j' };
  let versions = { journey: '1', track: '1', itinerary: '1', packing: '1', gear: '1' };
  const cache: Array<any> = [];
  const reads: string[][] = [];
  let gearReads = 0;
  const payload: Record<string, unknown> = { journey: { id: 'j', name: 'Trip' }, trackSummary: { totalKm: 18, start: [110, 25], end: [110.1, 25.1] }, itinerary: [{ id: 'row', title: 'Walk' }], itineraryGroups: [], packingLists: [] };
  const client = {
    rpc(name: string, args?: any) {
      if (name === 'agent_context_versions') return Promise.resolve({ data: { ...versions } });
      if (name === 'read_agent_gear') { gearReads++; return Promise.resolve({ data: { version: versions.gear, items: [{ name: 'Headlamp' }], categories: [] } }); }
      reads.push(args.p_sections);
      return Promise.resolve({ data: { versions: { ...versions }, ...payload } });
    },
    from() {
      const chain = { select: () => chain, eq: () => chain, in: () => chain,
        upsert(row: any) { const index = cache.findIndex((entry) => entry.resource_key === row.resource_key); if (index < 0) cache.push(row); else cache[index] = row; return Promise.resolve({}); },
        then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: cache }).then(resolve),
      };
      return chain;
    },
  };
  return { context, client, reads, cache, versions, payload, get gearReads() { return gearReads; } };
}

Deno.test('fresh and cached track summaries expose stable original waypoint indexes', async () => {
  const h = harness();
  h.payload.trackSummary = { waypoints: [{ name: '', km: 1 }, { name: 'Camp', km: 12 }, { name: 'Camp', km: 14 }] };
  const result = await readJourneySections(h.client, h.context, 'j', ['track']);
  assert((result.trackSummary as { waypoints: Array<{ waypointIndex: number }> }).waypoints[2].waypointIndex === 2, 'Duplicate names lost original index');
  const next = { ...h.context, dataContext: undefined };
  const prompt = await prepareAgentContext(h.client, next);
  assert(prompt.includes('"waypointIndex":2'), 'Cached summary lost selector');
  assert(!(h.payload.trackSummary as any).waypoints[2].waypointIndex, 'Stored snapshot mutated');
});

Deno.test('transport reads only missing sections and reuses track across turns', async () => {
  const h = harness();
  await prepareAgentContext(h.client, h.context);
  await readJourneySections(h.client, h.context, 'j', ['journey', 'track', 'itinerary']);
  assert(h.reads.length === 1 && !h.reads[0].includes('packing'), 'transport fetched packing');
  const next: AgentContext = { ...h.context, dataContext: undefined };
  const prompt = await prepareAgentContext(h.client, next);
  assert(prompt.includes('totalKm'), 'valid track not injected');
  const result = await readJourneySections(h.client, next, 'j', ['journey', 'track', 'itinerary']);
  assert(result.reused && h.reads.length === 1, 'unchanged data was fetched again');
  h.versions.itinerary = '2';
  const third: AgentContext = { ...h.context, dataContext: undefined };
  await prepareAgentContext(h.client, third);
  const latestPrompt = contextPrompt(third);
  assert(latestPrompt.includes('totalKm') && !latestPrompt.includes('Walk'), 'stale itinerary survived');
  await readJourneySections(h.client, third, 'j', ['journey', 'track', 'itinerary']);
  assert(JSON.stringify(h.reads.at(-1)) === '["itinerary"]', 'unrelated sections were reread');
});

Deno.test('write guards use observed snapshots and reject missing dependencies', async () => {
  const h = harness();
  await prepareAgentContext(h.client, h.context);
  let rejected = false;
  try { expectedWriteVersions(h.context, 'add_itinerary_items', { journeyId: 'j' }); } catch { rejected = true; }
  assert(rejected, 'a manifest alone must not authorize a write');
  await readJourneySections(h.client, h.context, 'j', ['journey', 'track', 'itinerary']);
  const expected = expectedWriteVersions(h.context, 'add_itinerary_items', { journeyId: 'j' });
  assert(expected.itinerary === '1' && !('packing' in expected), 'incorrect dependencies');
  acceptWriteVersions(h.context, 'j', expected, { ...h.versions, itinerary: '2' });
  assert(expectedWriteVersions(h.context, 'add_itinerary_items', { journeyId: 'j' }).itinerary === '2', 'own write not advanced');
  assert(contextPrompt(h.context).includes('totalKm') && !contextPrompt(h.context).includes('Walk'), 'written snapshot not invalidated');
  invalidateContext(h.context, 'j');
  rejected = false;
  try { expectedWriteVersions(h.context, 'add_itinerary_items', { journeyId: 'j' }); } catch { rejected = true; }
  assert(rejected, 'conflict allowed a blind retry');
});

Deno.test('schedule edits require journey and itinerary snapshots but not track or gear', async () => {
  const h = harness();
  await prepareAgentContext(h.client, h.context);
  await readJourneySections(h.client, h.context, 'j', ['journey']);
  let rejected = false;
  try { expectedWriteVersions(h.context, 'update_journey_schedule', { journeyId: 'j' }); } catch { rejected = true; }
  assert(rejected, 'schedule edits accepted an unread itinerary');
  await readJourneySections(h.client, h.context, 'j', ['itinerary']);
  const expected = expectedWriteVersions(h.context, 'update_journey_schedule', { journeyId: 'j' });
  assert(expected.journey === '1' && expected.itinerary === '1' && Object.keys(expected).length === 2, 'incorrect schedule dependencies');
});

Deno.test('gear cache is versioned and usable for a newly created journey', async () => {
  const h = harness();
  h.context.currentJourneyId = undefined;
  await readAgentGear(h.client, h.context);
  assert(h.gearReads === 1, 'the first read must populate the cache');
  await readAgentGear(h.client, h.context);
  assert(Number(h.gearReads) === 1, 'an unscoped reread with a matching version must use the cache');
  // A name-scoped read runs immediately before add_gear, where a stale thread
  // snapshot could make an existing item look new, so it always reads through.
  await readAgentGear(h.client, h.context, 'head');
  assert(Number(h.gearReads) === 2, 'a name-scoped check must read the current table');
  await readJourneySections(h.client, h.context, 'j', ['journey', 'track', 'itinerary', 'packing']);
  assert(expectedWriteVersions(h.context, 'add_packing_items', { journeyId: 'j', mode: 'full' }).gear === '1', 'new journey lost global gear context');
  h.versions.gear = '2';
  await readAgentGear(h.client, h.context);
  assert(Number(h.gearReads) === 3, 'gear change not refreshed');
});
