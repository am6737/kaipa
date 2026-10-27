import { newPackingDraft } from './packing-draft.ts';
import { railCacheTtl, runCommitPackingDraftBestEffort, runAddItinerary, bindRunClient, releaseRunClient, createJourney, addPackingItems, resolvePackingOwner, searchRoutes, searchTransport, addGear, kaipaAllTools, kaipaGlobalTools, kaipaJourneyTools } from './tools.ts';
import type { AgentContext } from './types.ts';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function toolNames(tools: typeof kaipaGlobalTools | typeof kaipaJourneyTools) {
  return tools.map((item) => item.name);
}

Deno.test('packing always belongs to the requesting member, including group journeys', () => {
  const companions = [{ id: 1, user_id: 'host', is_self: true }, { id: 2, user_id: 'member' }];
  assert(resolvePackingOwner(companions, 'member') === 2, 'group member must not write to the host or a shared list');
  assert(resolvePackingOwner(companions, 'host') === 1, 'host writes to their own list');
  assert(resolvePackingOwner([{ id: 2, user_id: 'member' }], 'member') === 2, 'solo list owner changed');
  assert(resolvePackingOwner([{ id: 3, is_self: true }], 'member') === 3, 'legacy solo self participant should resolve');
  for (const rows of [[], companions, [{ id: 1, user_id: 'host', is_self: true }], [{ id: 1, is_self: true }, { id: 2 }]]) {
    let rejected = false;
    try { resolvePackingOwner(rows, 'outsider'); } catch { rejected = true; }
    assert(rejected, 'unknown member must not silently write to another person');
  }
});

Deno.test('agent modes expose scoped tools without duplicates', () => {
  const allNames = toolNames(kaipaAllTools);
  for (const [mode, tools] of [['global', kaipaGlobalTools], ['journey', kaipaJourneyTools]] as const) {
    const names = toolNames(tools);
    assert(new Set(names).size === names.length, `${mode} tools contain duplicates`);
    assert(names.every((name) => allNames.includes(name)), `${mode} mode contains an unregistered tool`);
  }
  assert(JSON.stringify([...toolNames(kaipaGlobalTools)].sort()) === JSON.stringify([...allNames].sort()), 'global mode must expose every registered tool');
});

Deno.test('journey tool set exposes both destructive operations', () => {
  const names = toolNames(kaipaJourneyTools);
  assert(!names.includes('create_journey'), 'journey mode must not expose journey creation');
  assert(names.includes('delete_itinerary_items'), 'journey tools must include itinerary deletion');
  assert(names.includes('update_journey_schedule'), 'journey tools must support schedule edits');
  assert(names.includes('delete_packing_items'), 'journey tools must include packing deletion');
});

Deno.test('global tool set preserves journey creation and follow-up writes', () => {
  const names = toolNames(kaipaGlobalTools);
  assert(names.includes('create_journey'), 'global tools must include journey creation');
  assert(names.includes('update_journey_schedule'), 'global tools must support existing schedule edits');
  assert(names.includes('add_itinerary_items'), 'global tools must include itinerary writes');
  assert(names.includes('set_itinerary_group_endpoints'), 'global tools must include itinerary endpoint writes');
  assert(names.includes('set_journey_map_location'), 'global tools must include journey map location writes');
  assert(names.includes('add_packing_items'), 'global tools must include packing writes');
  assert(names.includes('estimate_personal_packing_needs'), 'global tools must include private packing estimates');
  assert(names.includes('undo_last_agent_changes'), 'global tools must support natural-language undo');
});

function planningHarness(message: string, currentJourneyId?: string) {
  const context: AgentContext = { userId: 'user', threadId: 'thread', runId: crypto.randomUUID(), originalUserMessage: message, currentJourneyId };
  const updates: Array<Record<string, unknown>> = [];
  const reads: string[] = [];
  const client = {
    from(table: string) {
      reads.push(table);
      const chain = {
        select: () => chain,
        eq: () => chain,
        gt: () => chain,
        is: () => chain,
        neq: () => chain,
        in: () => chain,
        ilike: () => chain,
        limit: () => chain,
        upsert: () => chain,
        update: (value: Record<string, unknown>) => { updates.push(value); return chain; },
        maybeSingle: async () => ({ data: null, error: null }),
        single: async () => ({ data: table === 'agent_threads' ? { current_journey_id: null } : { id: 'call' }, error: null }),
        then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(resolve),
      };
      return chain;
    },
  };
  bindRunClient(context.runId, client);
  return { client, context, updates, reads, dispose: () => releaseRunClient(context.runId) };
}

Deno.test('exploration never requires a creation date, duration or track', async () => {
  const sources = Deno.env.get('TRAVEL_SEARCH_SOURCES');
  // Exercise the real search tool without contacting external providers.
  Deno.env.set('TRAVEL_SEARCH_SOURCES', 'none');
  try {
    for (const search of [searchRoutes]) {
      for (const [message, journeyId, allowed] of [
        ['请重新规划旅程和装备清单。', 'existing-journey', true],
        ['帮我规划旅程', 'existing-journey', true],
        ['帮我规划漓江徒步', undefined, true],
        ['帮我规划明天的漓江徒步', undefined, true],
        ['帮我规划漓江一日徒步', undefined, true],
        ['帮我规划明天的漓江一日徒步', undefined, true],
        ['帮我规划漓江一日徒步，日期待定', undefined, true],
      ] as const) {
        const h = planningHarness(message, journeyId);
        try {
          await search.invoke({ context: h.context } as never, JSON.stringify({ query: '漓江 老寨山 徒步' }));
          const completed = h.updates.some((update) => update.status === 'completed');
          assert(completed === allowed, `${search.name}: unexpected result for ${message} (${journeyId})`);
          if (search === searchRoutes) assert(h.reads.includes('routes') === allowed, 'only valid searches should reach route data');
        } finally { h.dispose(); }
      }
    }
  } finally {
    if (sources === undefined) Deno.env.delete('TRAVEL_SEARCH_SOURCES');
    else Deno.env.set('TRAVEL_SEARCH_SOURCES', sources);
  }
});

Deno.test('create_journey still rejects missing basics and duplicate creation in journey mode', async () => {
  for (const journeyId of [undefined, 'existing-journey']) {
    const h = planningHarness('请重新规划旅程和装备清单。', journeyId);
    h.context.task = { runId: h.context.runId, journeyId: journeyId || null, outcome: null, decision: {
      objective: 'Create', mode: 'execute', domain: null, domainQuote: null, authorizationUnconfirmed: false, fullHikingPlan: false, activeHoursPerDay: null, continuation: false, authorizationQuote: 'create',
      operations: ['create_journey'], requiredOperations: ['create_journey'], destination: null,
      days: null, derivedDays: null, plannedDate: null, dateUndecided: false, trackAttachmentName: null, packingMode: 'none', constraints: [],
    } };
    try {
      await createJourney.invoke({ context: h.context } as never, JSON.stringify({ name: '漓江', plannedDate: '2026-09-08', days: 1 }));
      const expected = journeyId ? '不能再次创建旅程' : 'known destination and duration';
      assert(h.updates.some((update) => String(update.error).includes(expected)), 'creation guard must remain active');
      assert(!h.updates.some((update) => update.status === 'completed'), 'must not create a journey');
    } finally { h.dispose(); }
  }
});

Deno.test('a write invoked outside task scope never reaches database operations', async () => {
  const h = planningHarness('Only discuss');
  try {
    const result = await createJourney.invoke({ context: h.context } as never, JSON.stringify({ name: 'Discussion', days: 1 }));
    assert(String(result).includes('task_scope_denied'), 'missing task must deny');
    assert(h.reads.length === 0, 'scope denial must precede business reads and receipts');
  } finally { h.dispose(); }
});

Deno.test('packing mode mismatch is rejected before receipt replay or database access', async () => {
  const h = planningHarness('Add only one cable', 'journey');
  h.context.task = { runId: h.context.runId, journeyId: 'journey', outcome: null, decision: {
    objective: 'Add cable', mode: 'execute', domain: null, domainQuote: null, authorizationUnconfirmed: false, fullHikingPlan: false, activeHoursPerDay: null, continuation: false, authorizationQuote: 'Add',
    operations: ['add_packing_items'], requiredOperations: ['add_packing_items'], destination: null,
    days: null, derivedDays: null, plannedDate: null, dateUndecided: false, trackAttachmentName: null, packingMode: 'incremental', constraints: [],
  } };
  try {
    const result = await addPackingItems.invoke({ context: h.context } as never, JSON.stringify({ journeyId: 'journey', mode: 'full',
      items: [{ name: 'Cable', quantity: 1, weightKg: 0.03, weightEstimated: true, carryStatus: 'packed' }],
    }));
    assert(String(result).includes('task_scope_denied'), 'Mode expansion was not rejected');
    assert(h.reads.length === 0, 'Mode guard must precede receipts and business access');
  } finally { h.dispose(); }
});

// A chain names several routes and the model sends them in one query. The
// catalog lookup must split them, or it matches a contiguous substring that no
// route row can contain and reports the catalog as empty.
Deno.test('a multi-route query is searched term by term, not as one substring', async () => {
  const { routeSearchTerms } = await import('./tools.ts');
  const terms = (query: string) => JSON.stringify(routeSearchTerms(query));
  assert(terms('党岭三湖连穿 雅拉温泉线 桑措玉琼（嘉措琼吉）') === '["党岭三湖连穿","雅拉温泉线","桑措玉琼（嘉措琼吉）"]',
    `space-separated route names must split, got ${terms('党岭三湖连穿 雅拉温泉线 桑措玉琼（嘉措琼吉）')}`);
  assert(terms('党岭三湖连穿、雅拉温泉线、桑措玉琼') === '["党岭三湖连穿","雅拉温泉线","桑措玉琼"]',
    'the Chinese enumeration comma must split');
  // A single route must keep working exactly as before, parentheses included.
  assert(terms('桑措玉琼（嘉措琼吉）') === '["桑措玉琼（嘉措琼吉）"]', 'one route name must stay whole');
  assert(terms('九溪') === '["九溪"]', 'a two-character route name is a usable term');
  // Fragments shorter than two characters would match nearly every row.
  assert(terms('线 道 九溪') === '["九溪"]', 'single-character fragments are dropped');
  assert(terms('   ') === '[]', 'blank input yields no terms');
  // Eight real route names must still cap the fan-out; single characters would
  // be filtered by the minimum-length rule before the cap ever applies.
  assert(terms('党岭三湖 雅拉温泉 桑措玉琼 四姑娘山 格聂 狼塔 夏特 慕士')
    === '["党岭三湖","雅拉温泉","桑措玉琼","四姑娘山","格聂","狼塔"]', 'term count is capped to bound the fan-out');
});

Deno.test('near-departure rail TTL is capped at 15 minutes and honors lower overrides', () => {
  const saved = Deno.env.get('RAIL_CACHE_TTL_SECONDS');
  const now = Date.parse('2026-10-08T20:00:00+08:00');
  try {
    Deno.env.delete('RAIL_CACHE_TTL_SECONDS');
    assert(railCacheTtl('2026-10-09', now) === 900, 'default must be 15 minutes');
    Deno.env.set('RAIL_CACHE_TTL_SECONDS', '86400');
    assert(railCacheTtl('2026-10-10', now) === 900, 'near departures must cap a long override');
    assert(railCacheTtl('2026-10-12', now) === 86400, 'later departures retain the override');
    Deno.env.set('RAIL_CACHE_TTL_SECONDS', '60');
    assert(railCacheTtl('2026-10-09', now) === 60, 'a shorter override remains an upper bound');
  } finally {
    if (saved === undefined) Deno.env.delete('RAIL_CACHE_TTL_SECONDS'); else Deno.env.set('RAIL_CACHE_TTL_SECONDS', saved);
  }
});

Deno.test('a full packing task commits only valid rows of its own draft and still denies incremental adds', async () => {
  const h = planningHarness('Save packing', 'journey');
  h.context.task = { runId: h.context.runId, journeyId: 'journey', outcome: null, decision: {
    objective: 'Packing', mode: 'execute', domain: 'packing', domainQuote: null, authorizationUnconfirmed: false,
    fullHikingPlan: false, activeHoursPerDay: null, continuation: false, authorizationQuote: 'Save packing',
    operations: ['add_packing_items'], requiredOperations: ['add_packing_items'], destination: null,
    days: 1, derivedDays: null, plannedDate: null, dateUndecided: true, trackAttachmentName: null, packingMode: 'full', constraints: [],
  } };
  const versions = { journey: 'v1', track: 'v1', itinerary: 'v1', packing: 'v1', gear: 'v1' };
  h.context.dataContext = { versions: {}, observed: { journey: versions }, snapshots: { gear: { revision: 'v1', data: {} } } };
  const item = { name: 'USB-C 充电线', quantity: 1, weightKg: 0.03, weightEstimated: true, carryStatus: 'packed' as const, attributes: null, categoryName: null, estimatedEnergyKcalPerUnit: null };
  const draft = newPackingDraft('journey', { accommodation: 'day_trip', waterRefill: 'none', mealPreparation: 'no_cook', conditions: null }, [item, { ...item, name: '饮用水' }]);
  const committed: Array<Record<string, any>> = [];
  const client = { from(table: string) {
    if (table === 'agent_tool_calls') return h.client.from(table);
    const data = table === 'agent_packing_drafts' ? { state: draft, last_edit: null }
      : table === 'journeys' ? { id: 'journey', user_id: 'user' }
      : table === 'journey_packing_lists' ? { id: 'list' }
      : table === 'companions' ? [{ id: 1, user_id: 'user' }] : [];
    const chain = { select: () => chain, eq: () => chain, is: () => chain, order: () => chain,
      single: async () => ({ data, error: null }), maybeSingle: async () => ({ data, error: null }),
      then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data, error: null }).then(resolve) };
    return chain;
  }, rpc: async (_name: string, args: Record<string, any>) => {
    committed.push(args.p_change);
    return { data: { output: args.p_output, versions }, error: null };
  } };
  bindRunClient(h.context.runId, client);
  try {
    const denied = await addPackingItems.invoke({ context: h.context } as never, JSON.stringify({ journeyId: 'journey', mode: 'incremental', items: [item] }));
    assert(String(denied).includes('task_scope_denied') && committed.length === 0, 'arbitrary incremental writes must remain denied');
    const partial = await runCommitPackingDraftBestEffort({ revision: 1 }, { context: h.context }) as { added: number; skippedInvalid: number };
    assert(partial.added === 1 && partial.skippedInvalid === 1, 'valid draft subset must save');
    assert(Number(committed.length) === 1 && committed[0].items[0].name === 'USB-C 充电线', 'invalid rows must not reach the writer');
    h.context.task.journeyId = 'other';
    let rejected = false;
    try { await runCommitPackingDraftBestEffort({ revision: 1 }, { context: h.context }); } catch { rejected = true; }
    assert(rejected && Number(committed.length) === 1, 'a draft cannot write outside its task journey');
  } finally { h.dispose(); }
});

Deno.test('rail cache reads reject older long-lived snapshots and write the shorter TTL', async () => {
  const names = ['RAIL_QUERY_URL', 'RAIL_CACHE_TTL_SECONDS'];
  const saved = names.map(name => Deno.env.get(name));
  const originalFetch = globalThis.fetch;
  const departureDate = new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10);
  try {
    Deno.env.set('RAIL_QUERY_URL', 'http://rail-query:8787');
    Deno.env.set('RAIL_CACHE_TTL_SECONDS', '86400');
    for (const age of [60000, 16 * 60000, null]) {
      const h = planningHarness('Query rail');
      let requests = 0;
      const writes: number[] = [];
      globalThis.fetch = async () => {
        requests++;
        return Response.json({ provider: '12306-mcp', available: true, status: 'empty', offers: [], retrievedAt: new Date().toISOString(), limitation: 'Snapshot' });
      };
      bindRunClient(h.context.runId, h.client, { rpc: async (name: string, args: Record<string, any>) => {
        if (name === 'write_agent_external_cache') { writes.push(args.p_ttl_seconds); return { data: null, error: null }; }
        return { data: { available: true, status: 'results', offers: [{ trainNumber: 'STALE' }],
          cacheMeta: age == null ? {} : { observedAt: new Date(Date.now() - age).toISOString() } }, error: null };
      } });
      try {
        await searchTransport.invoke({ context: h.context } as never, JSON.stringify({ mode: 'rail', origin: '杭州东', destination: '成都东', departureDate, adults: 1 }));
        assert(requests === (age === 60000 ? 0 : 1), 'only a fresh rail snapshot can avoid the provider');
        if (age !== 60000) assert(writes.length === 1 && writes[0] === 900, 'refreshed rail snapshots must use the capped TTL');
      } finally { h.dispose(); }
    }
  } finally {
    globalThis.fetch = originalFetch;
    names.forEach((name, i) => saved[i] === undefined ? Deno.env.delete(name) : Deno.env.set(name, saved[i]!));
  }
});

// The plan model transcribed the track start coordinate onto every village of
// one hike and the old filter only geocoded items with empty lat/lng, so the
// fabrication reached the timeline labeled source=map. Server resolution is
// now the only coordinate source, except for anchors that name a real waypoint
// on their own track.
Deno.test('model-injected itinerary coordinates are re-resolved, not trusted', async () => {
  const savedEnv = ['AMAP_WEB_KEY', 'SERVICE_ROLE_KEY', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'APP_AGENT_DATABASE_URL', 'APP_AGENT_SERVICE_ROLE_KEY'].map(name => [name, Deno.env.get(name)] as const);
  const originalFetch = globalThis.fetch;
  try {
    Deno.env.set('AMAP_WEB_KEY', 'test-key');
    const h = planningHarness('Plan the hike', 'journey');
    h.context.task = { runId: h.context.runId, journeyId: 'journey', outcome: null, decision: {
      objective: 'Plan', mode: 'execute', domain: 'hiking', domainQuote: null, authorizationUnconfirmed: false,
      fullHikingPlan: true, activeHoursPerDay: null, continuation: false, authorizationQuote: 'Plan',
      operations: ['add_itinerary_items'], requiredOperations: ['add_itinerary_items'], destination: null,
      days: 3, derivedDays: null, plannedDate: null, dateUndecided: true, trackAttachmentName: null, packingMode: 'none', constraints: [],
    } };
    h.context.dataContext = { versions: {}, observed: { journey: { journey: 'v1', track: 'v1', itinerary: 'v1' } }, snapshots: {} } as never;
    const committed: Array<Record<string, any>> = [];
    const track = { id: '9f1c2b3a-4d5e-4a6b-8c7d-1e2f3a4b5c6d', name: '党岭三湖连穿', waypoints: [{ name: 'D5：卓雍措营地', km: 9.19 }, { name: '终点：卡尔杂', km: 19.46 }] };
    const tracks = [track];
    const trackIds: string[][] = [];
    const amapRequests: URL[] = [];
    globalThis.fetch = async (input: any) => {
      const url = new URL(String(input));
      amapRequests.push(url);
      const keywords = url.searchParams.get('keywords');
      const pois = keywords === '卡尔杂村'
        ? [{ name: '甲依拉措山庄', pname: '四川省', cityname: '甘孜藏族自治州', adname: '丹巴县', address: '某路1号', location: '101.348157,31.101975' }]
        : [];
      return Response.json({ status: '1', pois });
    };
    const client = { from(table: string) {
      if (table === 'agent_tool_calls') return h.client.from(table);
      const data = table === 'journeys' ? { id: 'journey', user_id: 'user', region: '四川省 · 甘孜', total_days: 3, track_id: track.id }
        : table === 'tracks' ? tracks : [];
      const chain = { select: () => chain, eq: () => chain, is: () => chain, order: () => chain, limit: () => chain,
        in: (_column: unknown, ids: unknown) => { if (table === 'tracks') trackIds.push(ids as string[]); return Promise.resolve({ data: table === 'tracks' ? tracks.filter(item => (ids as string[]).includes(item.id)) : data, error: null }); },
        single: async () => ({ data: table === 'tracks' ? (data as Array<Record<string, unknown>>)[0] : data, error: null }),
        maybeSingle: async () => ({ data: table === 'tracks' ? null : data, error: null }),
        then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data, error: null }).then(resolve) };
      return chain;
    }, rpc: async (_name: string, args: Record<string, any>) => {
      committed.push(args.p_change);
      return { data: { output: { added: args.p_change.rows.length }, versions: { journey: 'v1', track: 'v1', itinerary: 'v1' } }, error: null };
    } };
    bindRunClient(h.context.runId, client);
    try {
      const fabricated = { source: 'map', longitude: 101.407867, latitude: 31.073537, trackId: 'trk008', trackMeters: 0, trackLengthMeters: 19462, address: null } as const;
      await runAddItinerary({ journeyId: 'journey', groupNotes: [], items: [
        { day: 'Day 1', kind: 'custom', title: '抵达卡尔杂村', startLocation: null, routeId: null, timeStart: null, timeEnd: null,
          location: { name: '卡尔杂村', incomingMode: null, ...fabricated } },
        { day: 'Day 2', kind: 'custom', title: '前往党岭村', startLocation: null, routeId: null, timeStart: null, timeEnd: null,
          location: { name: '党岭村', incomingMode: null, ...fabricated } },
        { day: 'Day 2', kind: 'stay', title: '卓雍措营地', startLocation: null, routeId: 'trk008', timeStart: null, timeEnd: null,
          location: { name: 'D5：卓雍措营地', incomingMode: null, source: 'custom', longitude: 31.049579, latitude: 101.353194, trackId: track.id, trackMeters: 9193, trackLengthMeters: 19462, address: null } },
        { day: 'Day 3', kind: 'activity', title: '下到卡尔杂', startLocation: null, routeId: 'trk008', timeStart: null, timeEnd: null,
          location: { name: '终点：卡尔杂', incomingMode: null, ...fabricated, trackMeters: null } },
      ] }, { context: h.context } as never);
      const rows = committed[0].rows;
      const amapNames = amapRequests.map(url => url.searchParams.get('keywords'));
      assert(rows.length === 4, 'every item must still save');
      // Model coordinates must never survive unverified: the village got the POI point.
      const village = rows.find((row: any) => row.location?.name === '卡尔杂村').location;
      assert(village.source === 'map' && Math.abs(village.latitude - 31.101975) < 0.01, 'village must take the resolved POI coordinate, not the fabricated track start');
      assert(village.trackId === null && village.trackMeters === null, 'a resolved place must not keep a fake track anchor');
      const missing = rows.find((row: any) => row.location?.name === '党岭村').location;
      assert(missing.latitude === null && missing.longitude === null && missing.source === 'custom', 'unresolvable places keep the name without invented coordinates');
      assert(missing.trackId === null && missing.trackMeters === null, 'an unverified track anchor must not steer geometry after its coordinates are dropped');
      // A catalog route id is not a track uuid, so it must never reach the tracks query.
      assert(JSON.stringify(trackIds) === JSON.stringify([[track.id]]), `only uuid anchors may be queried, got ${JSON.stringify(trackIds)}`);
      // Waypoint anchors are server-verifiable, so they skip geocoding entirely.
      const camp = rows.find((row: any) => row.location?.name === 'D5：卓雍措营地').location;
      assert(camp.trackMeters === 9193 && camp.trackId === track.id, 'a confirmed waypoint anchor must be preserved');
      assert(camp.latitude === null && camp.longitude === null, 'an anchor reads its geometry from the track, not from model lat/lng');
      assert(camp.source === 'track', 'a waypoint anchor is stored the same way the manual track picker stores it');
      assert(!amapNames.includes('D5：卓雍措营地'), 'waypoint anchors must not hit the map provider');
      // A stop named after a waypoint anchors on the walk even when the model only
      // knows the research alias and leaves the distance out.
      const finish = rows.find((row: any) => row.location?.name === '终点：卡尔杂').location;
      assert(finish.source === 'track' && finish.trackId === track.id, 'a waypoint name must anchor on the journey track');
      assert(finish.trackMeters === 19460 && finish.latitude === null, 'the recorded waypoint distance replaces the missing measurement');
      assert(!amapNames.includes('终点：卡尔杂'), 'an anchored finish must not be searched on the map');
      assert(amapNames.filter((name: string | null) => name === '卡尔杂村').length === 1, 'one name resolves once per batch');
      const villageUrl = amapRequests.find(url => url.searchParams.get('keywords') === '卡尔杂村')!;
      assert(villageUrl.searchParams.get('city') === '四川省' && villageUrl.searchParams.get('citylimit') === 'true', 'rural names stay scoped to the journey province');
    } finally { h.dispose(); }
  } finally {
    globalThis.fetch = originalFetch;
    for (const [name, value] of savedEnv) { if (value === undefined) Deno.env.delete(name); else Deno.env.set(name, value); }
  }
});

// A free map key answers only a few requests per second, and many hamlets live in
// the address geocoder rather than the POI index. Neither is a reason to leave a
// day stop without a coordinate, because the driving route needs one.
Deno.test('a throttled or POI-less stop still gets a provider coordinate', async () => {
  const savedEnv = ['AMAP_WEB_KEY'].map(name => [name, Deno.env.get(name)] as const);
  const originalFetch = globalThis.fetch;
  try {
    Deno.env.set('AMAP_WEB_KEY', 'test-key');
    const h = planningHarness('Plan the hike', 'journey');
    h.context.task = { runId: h.context.runId, journeyId: 'journey', outcome: null, decision: {
      objective: 'Plan', mode: 'execute', domain: 'hiking', domainQuote: null, authorizationUnconfirmed: false,
      fullHikingPlan: true, activeHoursPerDay: null, continuation: false, authorizationQuote: 'Plan',
      operations: ['add_itinerary_items'], requiredOperations: ['add_itinerary_items'], destination: null,
      days: 3, derivedDays: null, plannedDate: null, dateUndecided: true, trackAttachmentName: null, packingMode: 'none', constraints: [],
    } };
    h.context.dataContext = { versions: {}, observed: { journey: { journey: 'v1', track: 'v1', itinerary: 'v1' } }, snapshots: {} } as never;
    const committed: Array<Record<string, any>> = [];
    const keywordCalls: string[] = [];
    const poiAttempts = new Map<string, number>();
    globalThis.fetch = async (input: any) => {
      const url = new URL(String(input));
      if (url.pathname === '/v3/place/text') {
        const keywords = url.searchParams.get('keywords') || '';
        keywordCalls.push(keywords);
        if (keywords === '牛场' || keywords === '无名湖') return Response.json({ status: '1', pois: [] });
        if (keywords === '黑石头村' && (poiAttempts.get(keywords) || 0) === 0) {
          poiAttempts.set(keywords, 1);
          return Response.json({ status: '0', info: 'CUQPS_HAS_EXCEEDED_THE_LIMIT' });
        }
        return Response.json({ status: '1', pois: [{ name: keywords, pname: '四川省', cityname: '甘孜藏族自治州', adname: '丹巴县', address: '某路2号', location: '101.904486,30.874157' }] });
      }
      const address = url.searchParams.get('address') || '';
      if (address === '无名湖') return Response.json({ status: '1', geocodes: [{ formatted_address: '四川省阿坝藏族羌族自治州茂县无名', province: '四川省', city: '甘孜藏族自治州', district: '茂县', level: '村庄', location: '103.830150,31.849691' }] });
      return Response.json({ status: '1', geocodes: [{ formatted_address: `四川省甘孜藏族自治州丹巴县${address}`, province: '四川省', city: '甘孜藏族自治州', district: '丹巴县', level: '村庄', location: '101.890540,30.878618' }] });
    };
    const client = { from(table: string) {
      if (table === 'agent_tool_calls') return h.client.from(table);
      const data = table === 'journeys' ? { id: 'journey', user_id: 'user', region: '四川省 · 甘孜', total_days: 3, track_id: null } : [];
      const chain = { select: () => chain, eq: () => chain, is: () => chain, order: () => chain, limit: () => chain,
        in: () => Promise.resolve({ data, error: null }),
        single: async () => ({ data, error: null }), maybeSingle: async () => ({ data: table === 'journeys' ? data : null, error: null }),
        then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data, error: null }).then(resolve) };
      return chain;
    }, rpc: async (_name: string, args: Record<string, any>) => {
      committed.push(args.p_change);
      return { data: { output: { added: args.p_change.rows.length }, versions: { journey: 'v1', track: 'v1', itinerary: 'v1' } }, error: null };
    } };
    bindRunClient(h.context.runId, client);
    const item = (day: string, name: string) => ({ day, kind: 'custom' as const, title: name, startLocation: null, routeId: null, timeStart: null, timeEnd: null,
      location: { name, incomingMode: null, source: 'custom' as const, longitude: null, latitude: null, trackId: null, trackMeters: null, trackLengthMeters: null, address: null } });
    try {
      await runAddItinerary({ journeyId: 'journey', groupNotes: [], items: [item('Day 1', '黑石头村'), item('Day 2', '牛场'), item('Day 3', '无名湖')] }, { context: h.context } as never);
      const rows = committed[0].rows;
      const throttled = rows.find((row: any) => row.location?.name === '黑石头村').location;
      assert(throttled.source === 'map' && Number.isFinite(throttled.latitude), 'a throttled answer must be retried, not dropped');
      assert(keywordCalls.filter(name => name === '黑石头村').length === 2, 'the retry must re-ask the provider for the same name');
      const addressOnly = rows.find((row: any) => row.location?.name === '牛场').location;
      assert(addressOnly.source === 'map' && Number.isFinite(addressOnly.longitude), 'a place missing from the POI index must fall back to the address geocoder');
      assert(String(addressOnly.address).includes('丹巴县'), 'the address geocoder answer must be kept as the address');
      const namesake = rows.find((row: any) => row.location?.name === '无名湖').location;
      assert(namesake.latitude === null && namesake.longitude === null, 'a geocoder namesake that does not answer the exact place must not steer the route');
    } finally { h.dispose(); }
  } finally {
    globalThis.fetch = originalFetch;
    for (const [name, value] of savedEnv) { if (value === undefined) Deno.env.delete(name); else Deno.env.set(name, value); }
  }
});

Deno.test('identical add_gear calls sent in one batch insert the item once, with whole-yuan prices', async () => {
  const context: AgentContext = { userId: 'user', threadId: 'thread', runId: crypto.randomUUID(), originalUserMessage: '加两个Nalgene 99.5元' };
  context.task = { runId: context.runId, journeyId: null, outcome: null, decision: {
    objective: 'Add gear', mode: 'execute', domain: null, domainQuote: null, authorizationUnconfirmed: false, fullHikingPlan: false, activeHoursPerDay: null, continuation: false, authorizationQuote: '加两个Nalgene',
    operations: ['add_gear'], requiredOperations: ['add_gear'], destination: null,
    days: null, derivedDays: null, plannedDate: null, dateUndecided: false, trackAttachmentName: null, packingMode: 'none', constraints: [],
  } };
  const inserted: Array<Record<string, unknown>> = [];
  const client = {
    from(table: string) {
      let pending: Record<string, unknown> | null = null;
      const chain = {
        select: () => chain, eq: () => chain, neq: () => chain, upsert: () => chain,
        update: () => chain,
        insert: (value: Record<string, unknown>) => { pending = value; return chain; },
        maybeSingle: async () => ({ data: null, error: null }),
        single: async () => {
          if (table === 'gear_items' && pending) { inserted.push(pending); return { data: { id: inserted.length, name: pending.name }, error: null }; }
          return { data: { id: 'call' }, error: null };
        },
        // The library read resolves after a tick, as a real round trip would.
        then: (resolve: (value: unknown) => unknown) => new Promise(r => setTimeout(r, 5)).then(() => ({ data: [], error: null })).then(resolve),
      };
      return chain;
    },
  };
  bindRunClient(context.runId, client);
  try {
    const args = JSON.stringify({ name: 'Nalgene', priceCny: 99.5 });
    await Promise.all([addGear.invoke({ context } as never, args), addGear.invoke({ context } as never, args)]);
    assert(inserted.length === 1, `inserted ${inserted.length} rows`);
    assert(inserted[0].price === 100, `price ${inserted[0].price}`);
  } finally { releaseRunClient(context.runId); }
});
