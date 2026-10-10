import { ROUTE_GUIDES } from './route-guides.generated.ts';

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

export function getRouteGuide(routeId: string): RouteGuide | null {
  return Object.hasOwn(ROUTE_GUIDES, routeId) ? ROUTE_GUIDES[routeId] : null;
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
