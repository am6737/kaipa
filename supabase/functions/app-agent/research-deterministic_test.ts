import { bindCatalogFacts, catalogCoversPlanning, deterministicBrief, isResolvedRoute, normalizedDestination, sampleCatalogWaypoints, type CatalogRoute, type RouteEvidence } from './pipeline.ts';
import { researchBriefSchema, type ResearchBrief } from './plan-document.ts';
import type { PipelineDeps } from './pipeline.ts';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function catalogRoute(name: string, hikingDays: number | null): CatalogRoute {
  return {
    routeId: `route-${name}`, name, matchedName: name, region: '四川', distanceKm: 42, hikingDays,
    trackFileName: `${name}.gpx`,
    start: { longitude: 101, latitude: 30 }, end: { longitude: 102, latitude: 31 },
    waypoints: [{ index: 0, name: '起点', distanceKm: 0, elevationMeters: 3200 }],
  };
}

function routeEntry(patch: Partial<ResearchBrief['routes'][number]> = {}): ResearchBrief['routes'][number] {
  return {
    name: '贡嘎', routeId: null, hikingDays: null, distanceKm: null, summary: '',
    sourceUrls: [], unresolved: [], start: null, end: null, waypoints: [], ...patch,
  };
}

function evidenceOf(patch: Partial<RouteEvidence>): RouteEvidence {
  return {
    name: '贡嘎', catalog: null, carried: null, results: [], guideBody: null,
    imageText: null, facts: [], collected: [], error: null, ...patch,
  };
}

function pipelineStub(destination: string): PipelineDeps {
  return { task: { decision: { destination } } } as unknown as PipelineDeps;
}

Deno.test('destination normalization is separator- and order-insensitive', () => {
  assert(normalizedDestination('贡嘎、四姑娘山，稻城亚丁') === normalizedDestination('稻城亚丁/四姑娘山、贡嘎'), 'separator variants must match');
  assert(normalizedDestination('Gongga, Yala') === normalizedDestination('yala、gongga'), 'case must not matter');
  assert(normalizedDestination(null) === normalizedDestination(''), 'empty destinations must match');
  assert(normalizedDestination('贡嘎') !== normalizedDestination('贡嘎、四姑娘山'), 'different route sets must not match');
});

Deno.test('a route is resolved only with a summary, a length anchor and no gaps', () => {
  assert(isResolvedRoute(routeEntry({ summary: '四天环线', hikingDays: 4 })), 'summary plus days resolves');
  assert(isResolvedRoute(routeEntry({ summary: '四天环线', distanceKm: 42 })), 'summary plus distance resolves');
  assert(!isResolvedRoute(routeEntry({ summary: '四天环线' })), 'no length anchor stays unresolved');
  assert(!isResolvedRoute(routeEntry({ hikingDays: 4 })), 'no summary stays unresolved');
  assert(!isResolvedRoute(routeEntry({ summary: '四天环线', hikingDays: 4, unresolved: ['营地未核实'] })), 'open gaps stay unresolved');
  assert(!isResolvedRoute(null), 'missing entries stay unresolved');
});

Deno.test('catalog facts always win over model-written route fields', () => {
  const brief = researchBriefSchema.parse({
    destination: '贡嘎',
    routes: [{ name: '贡嘎', routeId: 'wrong', hikingDays: 2, distanceKm: 99, summary: 'x', start: null, end: null }],
  });
  const bound = bindCatalogFacts(brief, [catalogRoute('贡嘎', 5)]);
  assert(bound.routes[0].routeId === 'route-贡嘎', 'catalog routeId must bind');
  assert(bound.routes[0].hikingDays === 5, 'GPX-derived days must win');
  assert(bound.routes[0].distanceKm === 42, 'catalog distance must win');
  assert(bound.routes[0].start?.name === '贡嘎 起点', 'start name derives from the route name');
  assert(bound.routes[0].end?.name === '贡嘎 终点', 'end name derives from the route name');
  const untouched = bindCatalogFacts(researchBriefSchema.parse({ destination: '', routes: [{ name: '无名线', summary: 'x' }] }), [catalogRoute('贡嘎', 5)]);
  assert(untouched.routes[0].routeId === null, 'routes without a catalog row stay untouched');
});

Deno.test('the deterministic brief keeps evidence, gaps and a global caution', () => {
  const brief = deterministicBrief(pipelineStub('贡嘎、四姑娘山'), [
    evidenceOf({
      name: '贡嘎', catalog: catalogRoute('贡嘎', 4), guideBody: '正文',
      collected: ['检索到 1 条结果'],
      results: [{ title: '贡嘎徒步攻略', snippet: '四天环线，营地有水源', url: 'https://example.com/gongga' }],
    }),
    evidenceOf({ name: '四姑娘山', catalog: catalogRoute('四姑娘山', 3), collected: ['研究阶段预算不足，未检索'] }),
  ]);
  assert(brief.routes.length === 2, 'one entry per requested route');
  assert(brief.routes[0].hikingDays === 4 && brief.routes[0].summary.includes('四天环线'), 'evidence lands in the entry');
  assert(brief.routes[0].sourceUrls[0] === 'https://example.com/gongga', 'source urls are kept');
  assert(brief.routes[1].unresolved.some(text => text.includes('预算不足')), 'budget gaps are disclosed per route');
  assert(brief.suggestedDays === 7, 'days sum from catalog hiking days');
  assert(brief.durationBasis.includes('GPX'), 'the basis states its provenance');
  assert(brief.unresolved.some(text => text.includes('未能完成全部核验')), 'a global caution accompanies incomplete research');
  assert(brief.facts.length === 1 && brief.facts[0].sourceUrl === 'https://example.com/gongga', 'facts carry sources');
});
Deno.test('the deterministic brief carries the catalog waypoints the planner needs', () => {
  // Synthesis aborts on most runs, so this fallback is the brief the planner
  // usually sees: a missing waypoint list here means a plan with no overnight
  // points and no day endpoints.
  const evidence = [evidenceOf({ name: '党岭三湖连穿', catalog: catalogRoute('党岭三湖连穿', 2) })];
  const brief = deterministicBrief(pipelineStub('党岭三湖连穿'), evidence);
  assert(brief.routes[0].waypoints.length === 1, `the fallback must carry the catalog points, got ${JSON.stringify(brief.routes[0].waypoints)}`);
  assert(brief.routes[0].waypoints[0].name === '起点', 'the point keeps its recorded name');
  const uncatalogued = deterministicBrief(pipelineStub('某野山'), [evidenceOf({ name: '某野山' })]);
  assert(uncatalogued.routes[0].waypoints.length === 0, 'a route with no catalog entry carries no points');
});


Deno.test('carried routes survive a deterministic degradation untouched', () => {
  const carried = routeEntry({ name: '贡嘎', summary: '上一轮结论', hikingDays: 4, routeId: 'route-贡嘎' });
  const brief = deterministicBrief(pipelineStub('贡嘎、新线'), [
    evidenceOf({ name: '贡嘎', catalog: catalogRoute('贡嘎', 5), carried, collected: ['上一轮已核验，本轮复用'] }),
    evidenceOf({ name: '新线', catalog: null, collected: ['检索无结果'] }),
  ]);
  assert(brief.routes[0].summary === '上一轮结论' && brief.routes[0].hikingDays === 4, 'carried entries pass through with their content');
  assert(brief.routes[1].hikingDays === null, 'no catalog row means no invented days');
  assert(brief.suggestedDays === null, 'days are only suggested when every route has them');
  assert(brief.durationBasis === '', 'no basis without a full days sum');
  assert(brief.routes[1].unresolved.some(text => text.includes('攻略正文未读取')), 'missing body is disclosed');
});

Deno.test('deterministic facts stop at the schema cap', () => {
  const results = Array.from({ length: 31 }, (_, index) => ({ title: `t${index}`, snippet: 's', url: `https://example.com/${index}` }));
  const brief = deterministicBrief(pipelineStub('贡嘎'), [evidenceOf({ name: '贡嘎', catalog: catalogRoute('贡嘎', 2), results })]);
  assert(brief.facts.length === 30, 'facts respect the schema maximum');
  assert(brief.routes[0].sourceUrls.length === 8, 'source urls respect the schema maximum');
});

Deno.test('the brief carries the named points of a catalog track, sampled across the whole route', () => {
  const brief = researchBriefSchema.parse({ routes: [routeEntry({ name: '党岭三湖连穿' })] });
  const long = Array.from({ length: 105 }, (_, index) => ({ km: index * 0.2, name: `点${index}`, elevationMeters: 3400 }));
  const sampled = sampleCatalogWaypoints(long);
  assert(sampled.length === 40, `a long track must be sampled to the cap, got ${sampled.length}`);
  assert(sampled[0].index === 0 && sampled[sampled.length - 1].index === 104, 'the sample keeps both ends and their real track indices');
  assert(sampled.every((point, position) => position === 0 || point.index > sampled[position - 1].index), 'the sample stays in track order');
  const short = sampleCatalogWaypoints([{ km: 0, name: '起点' }, { km: 9.2, name: '' }, { km: 10.3, name: '卡尔杂' }]);
  assert(short.length === 2, `unnamed points are not usable candidates, got ${JSON.stringify(short)}`);
  assert(short[1].index === 2, 'the real track index survives filtering so waypointIndex stays valid');
  // The planner may only choose from these points, so they must survive the
  // deterministic bind that runs whatever the synthesis produced.
  const bound = bindCatalogFacts(brief, [{
    routeId: 'trk008', name: '党岭三湖连穿', matchedName: '党岭三湖连穿', region: '四川 · 甘孜', distanceKm: 19.5, hikingDays: 2,
    trackFileName: '党岭三湖连穿.kml', start: null, end: null,
    waypoints: [{ index: 3, name: '卓雍措营地', distanceKm: 9.2, elevationMeters: 4100 }],
  }]);
  assert(bound.routes[0].waypoints[0].name === '卓雍措营地', 'catalog waypoints must reach the brief');
  assert(bound.routes[0].routeId === 'trk008', 'the route stays bound to its catalog entry');
});

Deno.test('a model-invented waypoint list never survives the deterministic bind', () => {
  const brief = researchBriefSchema.parse({ routes: [routeEntry({ name: '党岭三湖连穿', waypoints: [{ index: 0, name: '编造营地', distanceKm: 5, elevationMeters: null }] })] });
  const matched = bindCatalogFacts(brief, [{ routeId: 'trk008', name: '党岭三湖连穿', matchedName: '党岭三湖连穿', region: null, distanceKm: 19.5, hikingDays: 2, trackFileName: null, start: null, end: null, waypoints: [] }]);
  assert(matched.routes[0].waypoints.length === 0, 'a route with no catalog track carries no waypoints');
  const unmatched = bindCatalogFacts(brief, []);
  assert(unmatched.routes[0].waypoints.length === 0, 'an unknown route must not keep model-invented waypoints');
});

Deno.test('a shortened destination token still binds its catalog route', () => {
  // The interpreter may write "党岭" for "党岭三湖连穿". Matching the catalog by
  // name equality loses that route's GPX days and waypoints, which is what left
  // the planner with no track to place overnight points on.
  const evidence = [evidenceOf({ name: '党岭', catalog: { ...catalogRoute('党岭三湖连穿', 2), matchedName: '党岭' } })];
  const brief = deterministicBrief(pipelineStub('党岭、桑措'), evidence);
  assert(brief.routes[0].routeId === 'route-党岭三湖连穿', `the route must keep its catalog id, got ${brief.routes[0].routeId}`);
  assert(brief.routes[0].hikingDays === 2, 'the GPX day count survives the shortened name');
  const bound = bindCatalogFacts(brief, [{ ...catalogRoute('党岭三湖连穿', 2), matchedName: '党岭' }]);
  assert(bound.routes[0].waypoints.length === 1, 'the waypoints reach the brief through the matched token');
});

Deno.test('research skips the guide tail only when the catalog covers every route', () => {
  // The synthesis call has never returned inside its budget and adds only prose,
  // so it is skipped exactly when the recorded track already places the
  // overnight points; a route without geometry still needs the guide evidence.
  const full = { ...catalogRoute('党岭三湖连穿', 2), matchedName: '党岭' };
  assert(catalogCoversPlanning(['党岭'], [full]), 'a route with a track and day count is covered');
  assert(!catalogCoversPlanning(['党岭'], [{ ...full, waypoints: [] }]), 'a route without named points is not covered');
  assert(!catalogCoversPlanning(['党岭'], [{ ...full, hikingDays: null }]), 'a route without a day count is not covered');
  assert(!catalogCoversPlanning(['党岭', '雅拉'], [full]), 'one uncovered route keeps the full path');
  assert(!catalogCoversPlanning([], [full]), 'no destination keeps the existing behaviour');
  assert(!catalogCoversPlanning(['某野山'], [full]), 'an unmatched route is not covered');
});

Deno.test('confirmed route facts land in the deterministic brief', () => {
  // The covered path returns the deterministic brief for most runs, so the
  // maintained 线路资料 must survive into it or the planner never sees them.
  const brief = deterministicBrief(pipelineStub('贡嘎'), [
    evidenceOf({
      name: '贡嘎', catalog: catalogRoute('贡嘎', 4),
      facts: [{ route_id: 'route-贡嘎', route_name: '贡嘎', category: { slug: 'campsite', name: '营地' }, title: '雅哈垭口营地', fields: { 水源: '有' }, source_url: 'https://example.com/camp', confirmed_at: '2026-09-01', review_due_at: null }],
    }),
  ]);
  assert(brief.facts.some(fact => fact.fact.includes('[线路资料·已核实]') && fact.fact.includes('雅哈垭口营地') && fact.sourceUrl === 'https://example.com/camp'), 'confirmed facts must carry into brief.facts');
});
