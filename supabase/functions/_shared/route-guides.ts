export const GUIDE_SECTIONS = [
  { key: 'overview', heading: '概览' },
  { key: 'itinerary', heading: '行程' },
  { key: 'access', heading: '交通' },
  { key: 'overnight', heading: '住宿与营地' },
  { key: 'costs', heading: '费用' },
  { key: 'water_supply', heading: '补给与水源' },
  { key: 'season_risk', heading: '季节与风险' },
  { key: 'gear', heading: '装备建议' },
  { key: 'tips', heading: '注意事项' },
] as const;

export const REQUIRED_GUIDE_SECTIONS = [
  'overview', 'itinerary', 'access', 'overnight', 'season_risk',
] as const;

export type GuideSource = {
  id: string;
  platform: 'xiaohongshu' | 'douyin' | 'web' | 'official' | 'firsthand' | 'social';
  title: string;
  url: string | null;
  author: string | null;
  observedOn: string | null;
  retrievedAt: string;
};

export type GuideSection = {
  key: typeof GUIDE_SECTIONS[number]['key'];
  heading: typeof GUIDE_SECTIONS[number]['heading'];
  sourceIds: string[];
  body: string;
};

export type RouteGuide = {
  routeId: string;
  title: string;
  variant: string | null;
  asOf: string;
  sources: GuideSource[];
  sections: GuideSection[];
  /** Original markdown body without frontmatter, with outer whitespace trimmed. */
  markdown: string;
};

export type KnowledgeRow = {
  id: string;
  route_id: string | null;
  region: string | null;
  section: RouteGuide['sections'][number]['key'];
  title: string;
  body: string;
  sources: GuideSource[];
  as_of: string;
  status?: string;
};

function assembleKnowledge(routeId: string, rows: KnowledgeRow[]): RouteGuide | null {
  if (!rows.length) return null;
  const byKey = new Map<string, KnowledgeRow>();
  for (const row of rows) if (!byKey.has(row.section)) byKey.set(row.section, row);
  const sections = GUIDE_SECTIONS.flatMap(({ key, heading }) => {
    const row = byKey.get(key);
    if (!row) return [];
    return [{ key, heading, sourceIds: (Array.isArray(row.sources) ? row.sources : []).map(source => source.id), body: row.route_id ? row.body : `区域知识（${row.region}）\n\n${row.body}` }];
  });
  const sourceMap = new Map<string, GuideSource>();
  for (const row of rows) for (const source of Array.isArray(row.sources) ? row.sources : []) {
    if (source?.id && !sourceMap.has(source.id)) sourceMap.set(source.id, source);
  }
  const sources = [...sourceMap.values()];
  const asOf = rows.map(row => row.as_of).filter(Boolean).sort().at(-1) || '';
  const markdown = sections.map(section => {
    const row = byKey.get(section.key)!;
    const label = row.route_id ? row.title : `${row.title}（区域知识：${row.region}）`;
    return `## ${label} [${section.sourceIds.join(',')}]\n\n${row.body}`;
  }).join('\n\n');
  return { routeId, title: rows.find(row => row.route_id)?.title || rows[0].title, variant: null, asOf, sources, sections, markdown };
}

/** Build a guide from rows returned by get_route_knowledge. */
export function routeGuideFromKnowledge(routeId: string, rows: KnowledgeRow[]): RouteGuide | null {
  return assembleKnowledge(routeId, rows);
}

/** Database-backed lookup. The client is intentionally injected for tests and for the service-role pipeline client. */
export async function lookupRouteKnowledge(client: any, routeId: string): Promise<RouteGuide | null> {
  if (!client?.rpc) return null;
  const result = await client.rpc('get_route_knowledge', { p_route_id: routeId });
  if (result.error) throw result.error;
  return assembleKnowledge(routeId, (result.data || []) as KnowledgeRow[]);
}

/** Compatibility default for callers that inject fixtures. Runtime callers pass lookupRouteKnowledge with their client. */
export async function getRouteGuide(_routeId: string): Promise<RouteGuide | null> {
  // The runtime supplies a service-role client through lookupRouteKnowledge.
  // This zero-client fallback keeps shared helpers safe when called outside a run.
  return null;
}

export function missingGuideSections(guide: RouteGuide | null): string[] {
  if (!guide) return ['*'];
  const present = new Set(guide.sections.map((section) => section.key));
  return REQUIRED_GUIDE_SECTIONS.filter((key) => !present.has(key));
}

/** Section order, then citation order within a section; uncited sources are omitted. */
export function guideSourcesFor(guide: RouteGuide | null, sectionKeys?: readonly string[]): GuideSource[] {
  if (!guide) return [];
  const sources = new Map(guide.sources.map((source) => [source.id, source]));
  const seen = new Set<string>();
  const result: GuideSource[] = [];
  for (const section of guide.sections) {
    if (sectionKeys && !sectionKeys.includes(section.key)) continue;
    for (const id of section.sourceIds) {
      const source = sources.get(id);
      if (source && !seen.has(id)) {
        seen.add(id);
        result.push(source);
      }
    }
  }
  return result;
}
