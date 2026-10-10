import { newPackingDraft } from './packing-draft.ts';
import { railCacheTtl, runCommitPackingDraftBestEffort, bindRunClient, releaseRunClient, createJourney, addPackingItems, resolvePackingOwner, searchRoutes, searchTransport, kaipaAllTools, kaipaGlobalTools, kaipaJourneyTools } from './tools.ts';
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
        ['请重新规划行程和装备清单。', 'existing-journey', true],
        ['帮我规划行程', 'existing-journey', true],
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
    const h = planningHarness('请重新规划行程和装备清单。', journeyId);
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
