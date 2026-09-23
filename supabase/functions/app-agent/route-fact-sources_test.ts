import {
  bindRouteFacts, emptyRouteFactStats, factFieldsRecord, factPromptBlock, factSourceChips, factsForRoute, isStaleReview,
  routeFactSourcesFromArtifact, transportLegNote, ROUTE_FACT_SOURCE_LIMIT, type RouteFactRow,
} from './route-fact-sources.ts';
import { TRANSPORT_NOTE_MAX, transportPlanSchema, type ResearchBrief } from './plan-document.ts';
import type { AgentSource } from './types.ts';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const NOW = Date.parse('2026-09-22T00:00:00Z');

function row(overrides: Partial<RouteFactRow> = {}): RouteFactRow {
  return {
    id: 'fact-1',
    route_id: 'trk008',
    route_name: '党岭三湖连穿',
    category: { slug: 'campsite', name: '营地' },
    title: '葫芦海营地',
    fields: { 水源: '有' },
    source_url: 'https://example.com/camp',
    confirmed_at: '2026-06-01T00:00:00Z',
    reviewed_at: '2026-06-01T00:00:00Z',
    review_due_at: '2026-12-01T00:00:00Z',
    ...overrides,
  };
}

function webSource(index: number): AgentSource {
  return { title: `攻略 ${index}`, url: `https://web.example.com/${index}`, source: 'web' };
}

Deno.test('a review date in the past is stale, everything else is not', () => {
  assert(isStaleReview('2026-01-01T00:00:00Z', NOW), 'a past review date is stale');
  assert(!isStaleReview('2027-01-01T00:00:00Z', NOW), 'a future review date is not stale');
  assert(!isStaleReview(null, NOW), 'a fact without a review date is not treated as expired');
  assert(!isStaleReview('not a date', NOW), 'an unparseable date must not expire a fact');
});

Deno.test('a brief carries the facts that were loaded, not what the model wrote', () => {
  const modelBrief = { routeFacts: [{ entryId: 'invented', routeName: 'x', category: 'y', title: 'z', sourceUrl: null, reviewedAt: null, reviewDueAt: null, stale: false }] } as unknown as ResearchBrief;
  const stats = emptyRouteFactStats();
  const bound = bindRouteFacts(modelBrief, [row({ id: 'fact-real' })], stats, NOW);
  assert(bound.routeFacts.length === 1 && bound.routeFacts[0].entryId === 'fact-real', 'the model-written list must be replaced');
  assert(stats.loaded === 1 && stats.injected === 1, `stats must count what was loaded and bound, got ${stats.loaded}/${stats.injected}`);
});

Deno.test('the recorded fact list is bounded', () => {
  const rows = Array.from({ length: ROUTE_FACT_SOURCE_LIMIT + 10 }, (_, index) => row({ id: `fact-${index}` }));
  const stats = emptyRouteFactStats();
  const bound = bindRouteFacts({ routeFacts: [] } as unknown as ResearchBrief, rows, stats, NOW);
  assert(bound.routeFacts.length === ROUTE_FACT_SOURCE_LIMIT, 'the brief must not grow without bound');
  assert(stats.loaded === rows.length, 'the counter still reports everything the library returned');
});

Deno.test('the prompt block separates verified facts from expired ones', () => {
  const blocks = factPromptBlock([
    row({ id: 'fresh', title: '葫芦海营地', review_due_at: '2027-01-01T00:00:00Z' }),
    row({ id: 'stale', title: '老营地', review_due_at: '2020-01-01T00:00:00Z' }),
  ], NOW);
  assert(blocks.length === 2, `expected one block per freshness band, got ${blocks.length}`);
  assert(blocks[0].includes('已核实线路资料') && blocks[0].includes('优先于攻略正文') && blocks[0].includes('"id":"fresh"'), 'fresh facts keep their authority and expose their id');
  assert(!blocks[0].includes('"id":"stale"'), 'an expired fact must not sit in the authoritative block');
  assert(blocks[1].includes('已过期待复核') && blocks[1].includes('"id":"stale"'), 'expired facts move to the reference-only block');
  assert(blocks[1].includes('targetEntryId'), 'the expired block tells the model how to propose an update');
});

Deno.test('no facts means no prompt block', () => {
  assert(factPromptBlock([], NOW).length === 0, 'an empty library must not inject an empty block');
});

Deno.test('a transport leg note stays inside what the schema accepts', () => {
  const fallback = '路线起终点已从 GPX 读取，道路接驳时间待核实';
  assert(transportLegNote([], fallback) === fallback, 'with no facts the leg keeps the plain fallback');
  // The real regression: a full entry (five fields of JSON) plus the prefix went
  // past transportPlanSchema's bound and failed the whole transport stage.
  const fat = row({ fields: { from: '成都', to: '党岭村', mode: '拼车', schedule: '成都茶店子客运站 06:30 有班车至丹巴（约 350 km）；丹巴县城→党岭村约 60—68 km 乡村公路，需拼车或包车，末段路窄', duration: '成都→丹巴约 9—10 小时；丹巴→党岭村约 2—4 小时', price_min: 200, price_max: 300, notes: '依多篇攻略交叉核实；价格与班次随季节波动，出行前确认。' } });
  const note = transportLegNote([fat, fat], fallback);
  assert(note.length <= TRANSPORT_NOTE_MAX, `the note must fit the schema, got ${note.length}`);
  assert(note.startsWith('已核实线路资料'), 'the note must still say where it came from');
  // And the value the schema itself enforces is the same number.
  const parsed = transportPlanSchema.parse({ segments: [{ fromRoute: 'a', toRoute: 'b', from: 'a', to: 'b', mode: 'unknown', durationMinutes: null, overnightRequired: false, verified: false, sourceUrl: null, note, fromLocation: null, toLocation: null }] });
  assert(parsed.segments[0].note.length === note.length, 'the schema must accept the note it is given here');
});

Deno.test('recorded facts are read back defensively', () => {
  const parsed = routeFactSourcesFromArtifact([
    { entryId: 'fact-1', routeName: '党岭', category: '营地', title: '葫芦海', sourceUrl: 'https://example.com/a', reviewedAt: '2026-06-01', reviewDueAt: null, stale: false },
    { entryId: '', routeName: 'empty id is dropped' },
    null,
    'junk',
  ]);
  assert(parsed.length === 1 && parsed[0].entryId === 'fact-1', `expected one usable entry, got ${parsed.length}`);
  assert(parsed[0].stale === false, 'a missing stale flag defaults to not stale');
  assert(routeFactSourcesFromArtifact(null).length === 0, 'a missing column reads as no facts');
});

Deno.test('every verified fact is cited, and only the web links are capped', () => {
  // The regression this replaces: a total cap dropped whichever facts came last
  // in category order, so 季节与安全 (the closure/risk entry) disappeared from
  // the reply exactly when a route had enough documented facts to be useful.
  const facts = Array.from({ length: 13 }, (_, index) => routeFactSourcesFromArtifact([
    { entryId: `fact-${index}`, routeName: '党岭', category: '营地', title: `条目 ${index}`, sourceUrl: `https://fact.example.com/${index}`, reviewedAt: '2026-06-01', reviewDueAt: null, stale: false },
  ])[0]);
  const web = Array.from({ length: 10 }, (_, index) => webSource(index));
  const chips = factSourceChips(facts, web, { webLimit: 8 });
  assert(chips.filter(chip => chip.kind === 'fact').length === 13, 'all thirteen facts must be cited');
  assert(chips.slice(0, 13).every(chip => chip.kind === 'fact'), 'facts come before web links');
  assert(chips.length === 13 + 8, `expected thirteen facts plus eight links, got ${chips.length}`);
  assert(chips.at(-1)?.kind !== 'fact', 'the web links follow the facts');
});

Deno.test('with no facts, the web keeps its own allowance', () => {
  const chips = factSourceChips([], Array.from({ length: 10 }, (_, index) => webSource(index)));
  assert(chips.length === 8, `expected eight web links, got ${chips.length}`);
  assert(chips.every(chip => chip.kind === undefined), 'web links are not marked as facts');
});

Deno.test('a source that is both a maintained fact and a search result is cited once, as verified', () => {
  const [fact] = routeFactSourcesFromArtifact([
    { entryId: 'fact-1', routeName: '党岭', category: '营地', title: '葫芦海营地', sourceUrl: 'https://example.com/shared', reviewedAt: '2026-06-01', reviewDueAt: null, stale: false },
  ]);
  const chips = factSourceChips([fact], [{ title: '网上攻略', url: 'https://example.com/shared' }, webSource(1)]);
  const shared = chips.filter(chip => chip.url === 'https://example.com/shared');
  assert(shared.length === 1, `the shared url must appear once, got ${shared.length}`);
  assert(shared[0].kind === 'fact' && shared[0].factId === 'fact-1', 'the verified form wins the slot');
});

Deno.test('a fact without a source link still cites, without a url to open', () => {
  const [fact] = routeFactSourcesFromArtifact([
    { entryId: 'fact-1', routeName: '党岭', category: '营地', title: '葫芦海营地', sourceUrl: null, reviewedAt: '2026-06-01', reviewDueAt: null, stale: false },
  ]);
  const chips = factSourceChips([fact], [webSource(1)]);
  assert(chips.length === 2, 'a fact without a link is still a source');
  assert(!('url' in chips[0]) || chips[0].url === undefined, 'no url is invented for a fact that has none');
  assert(chips[0].kind === 'fact' && chips[0].factId === 'fact-1' && chips[0].verifiedAt === '2026-06-01', 'the chip keeps its identity and review date');
});

Deno.test('with no facts, the web keeps the whole cap', () => {
  const chips = factSourceChips([], Array.from({ length: 10 }, (_, index) => webSource(index)));
  assert(chips.length === 8, `expected eight web links, got ${chips.length}`);
  assert(chips.every(chip => chip.kind === undefined), 'web links are not marked as facts');
});

Deno.test('fact rows are matched to a route by id first, then by fuzzy name', () => {
  const rows = [row({ id: 'a', route_id: 'trk008', route_name: '党岭三湖连穿' }), row({ id: 'b', route_id: 'trk065', route_name: '党岭三湖连穿（副本）' })];
  assert(factsForRoute(rows, '党岭', 'trk065').length === 1, 'an exact route id wins over a name that matches both');
  assert(factsForRoute(rows, '党岭').length === 2, 'without an id, every name match is returned');
  assert(factsForRoute(rows, '雅拉').length === 0, 'an unrelated route matches nothing');
});

Deno.test('the model key/value list folds back into the record the RPC takes', () => {
  // The schema hands the model a key/value list because the provider's strict
  // validation cannot express a free-form map; nothing downstream may see that
  // shape.
  assert(JSON.stringify(factFieldsRecord([{ key: 'price_min', value: '220' }, { key: 'unit', value: '每人' }])) === JSON.stringify({ price_min: '220', unit: '每人' }), 'pairs fold into a record');
  assert(JSON.stringify(factFieldsRecord([])) === '{}', 'an empty list is an empty record');
  assert(JSON.stringify(factFieldsRecord(null)) === '{}', 'a missing list is an empty record');
  assert(JSON.stringify(factFieldsRecord([{ key: '', value: 'x' }, { key: 'ok', value: 'y' }])) === JSON.stringify({ ok: 'y' }), 'a blank key is dropped');
});
