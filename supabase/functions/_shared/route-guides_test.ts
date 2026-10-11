import {
  getRouteGuide,
  GUIDE_SECTIONS,
  guideSourcesFor,
  missingGuideSections,
  REQUIRED_GUIDE_SECTIONS,
  routeGuideFromKnowledge,
  type GuideSource,
  type RouteGuide,
} from './route-guides.ts';

function equal(actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function source(id: string): GuideSource {
  return { id, platform: 'web', title: `来源 ${id}`, url: `https://example.com/${id}`,
    author: null, observedOn: null, retrievedAt: '2026-10-09' };
}

function fixture(): RouteGuide {
  return {
    routeId: 'test-route', title: '测试路线', variant: null, asOf: '2026-10-09',
    sources: [source('s1'), source('s2'), source('s3'), source('uncited')],
    sections: [
      { key: 'overview', heading: '概览', sourceIds: ['s2', 's1', 's2'], body: '概览正文。' },
      { key: 'access', heading: '交通', sourceIds: ['s3', 's1'], body: '交通正文。' },
      { key: 'tips', heading: '注意事项', sourceIds: [], body: '注意事项正文。' },
    ],
    markdown: '## 概览 [s2,s1,s2]\n概览正文。\n\n## 交通 [s3,s1]\n交通正文。\n\n## 注意事项\n注意事项正文。',
  };
}

Deno.test('section keys, headings and required sections follow the contract', () => {
  equal(GUIDE_SECTIONS.map(({ key, heading }) => [key, heading]), [
    ['overview', '概览'], ['itinerary', '行程'], ['access', '交通'], ['overnight', '住宿与营地'],
    ['costs', '费用'], ['water_supply', '补给与水源'], ['season_risk', '季节与风险'],
    ['gear', '装备建议'], ['tips', '注意事项'],
  ]);
  equal(REQUIRED_GUIDE_SECTIONS, ['overview', 'itinerary', 'access', 'overnight', 'season_risk']);
});

Deno.test('getRouteGuide returns null for absent ids and inherited object properties', async () => {
  for (const id of ['', '__absent_route__', 'toString', 'constructor', '__proto__']) {
    equal(await getRouteGuide(id), null);
  }
});

Deno.test('knowledge rows assemble into ordered markdown and deduplicated sources', () => {
  const guide = routeGuideFromKnowledge('test-route', [
    { id: 'a', route_id: 'test-route', region: null, section: 'tips', title: '路线提示', body: '正文', as_of: '2026-10-09', sources: [source('s1')] },
    { id: 'b', route_id: null, region: '四川', section: 'overview', title: '区域信息', body: '区域正文', as_of: '2026-10-10', sources: [source('s1'), source('s2')] },
  ]);
  equal(guide?.sections.map(section => section.key), ['overview', 'tips']);
  equal(guide?.sources.map(source => source.id), ['s1', 's2']);
  if (!guide?.markdown.includes('区域知识：四川')) throw new Error('region knowledge must be labelled');
});

Deno.test('missingGuideSections returns wildcard for an absent guide', () => {
  equal(missingGuideSections(null), ['*']);
});

Deno.test('missingGuideSections returns only missing required keys in fixed order', () => {
  const guide = fixture();
  equal(missingGuideSections(guide), ['itinerary', 'overnight', 'season_risk']);
  guide.sections = [];
  equal(missingGuideSections(guide), REQUIRED_GUIDE_SECTIONS);
});

Deno.test('missingGuideSections accepts complete required coverage without optional sections', () => {
  const guide = fixture();
  guide.sections = GUIDE_SECTIONS.filter(({ key }) =>
    REQUIRED_GUIDE_SECTIONS.some((required) => required === key)
  ).map(({ key, heading }) => ({ key, heading, sourceIds: [], body: '已核验。' })).reverse();
  equal(missingGuideSections(guide), []);
});

Deno.test('guideSourcesFor deduplicates in first-cited order and omits uncited sources', () => {
  const guide = fixture();
  equal(guideSourcesFor(guide).map(({ id }) => id), ['s2', 's1', 's3']);
  if (guideSourcesFor(guide)[0] !== guide.sources[1]) throw new Error('Source metadata not preserved');
});

Deno.test('guideSourcesFor filters sections while preserving guide citation order', () => {
  const guide = fixture();
  equal(guideSourcesFor(guide, ['access']).map(({ id }) => id), ['s3', 's1']);
  equal(guideSourcesFor(guide, ['access', 'overview']).map(({ id }) => id), ['s2', 's1', 's3']);
  equal(guideSourcesFor(guide, ['access', 'access']).map(({ id }) => id), ['s3', 's1']);
});

Deno.test('guideSourcesFor returns no sources for null, empty filters or uncited sections', () => {
  equal(guideSourcesFor(null), []);
  equal(guideSourcesFor(fixture(), []), []);
  equal(guideSourcesFor(fixture(), ['tips']), []);
  equal(guideSourcesFor(fixture(), ['unknown']), []);
  const guide = fixture();
  guide.sections = [];
  equal(guideSourcesFor(guide), []);
});

Deno.test('loader helpers leave guide data unchanged', () => {
  const guide = fixture();
  const original = JSON.stringify(guide);
  missingGuideSections(guide);
  guideSourcesFor(guide);
  guideSourcesFor(guide, ['access']);
  equal(JSON.stringify(guide), original);
});
