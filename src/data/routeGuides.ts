import type { JourneyPackingItemInput } from './journeyPacking';

export type GuideText = { zh: string; en: string };
export type GuideStay = 'day' | 'stay' | 'camp';
export interface RouteGuideDay {
  title: GuideText;
  summary: GuideText;
  detail: GuideText;
  items: GuideText[];
}
export interface RouteGuideGear {
  name: GuideText;
  category: GuideText;
  note: GuideText;
  quantity: number;
  weightKg?: number;
  carryStatus?: 'packed' | 'worn' | 'consumable' | 'optional';
}
export interface RouteGuidePlan {
  id: string;
  routeId: string;
  title: GuideText;
  shortTitle: GuideText;
  description: GuideText;
  stay: GuideStay;
  days: RouteGuideDay[];
  gear: RouteGuideGear[];
  /** These are planning scaffolds, not reviewed route-specific instructions. */
  draft: true;
}
export interface RouteCommunityGuide {
  id: string;
  title: GuideText;
  author: GuideText;
  authorId?: string;
  authorAvatarUrl?: string | null;
  description?: GuideText;
  season: 'autumn' | 'spring';
  travelDate: string;
  publishedDate: string;
  updatedDate: string;
  helpful: number;
  helpfulMarked: boolean;
  plan: RouteGuidePlan;
  review: GuideText;
}
/** Ephemeral creation payload; it is not stored in the route catalog. */
export interface RouteGuideJourneyTemplate {
  id: string;
  routeId: string;
  title: string;
  authorName: string;
  authorAvatarUrl?: string | null;
  days: { title: string; items: string[] }[];
  gear: JourneyPackingItemInput[];
}

export const guideText = (value: GuideText, lang: 'zh' | 'en') => value[lang];

export type RouteGuideSort = 'recommended' | 'helpful' | 'updated';
export function sortRouteGuides(guides: RouteCommunityGuide[], sort: RouteGuideSort, stay?: GuideStay): RouteCommunityGuide[] {
  return guides.filter((guide) => !stay || guide.plan.stay === stay).sort((a, b) => {
    if (sort === 'updated') return b.updatedDate.localeCompare(a.updatedDate);
    if (sort === 'helpful') return b.helpful - a.helpful;
    return Number(b.season === 'autumn') - Number(a.season === 'autumn') || b.helpful - a.helpful;
  });
}

export function toRouteGuideTemplate(guide: RouteCommunityGuide, lang: 'zh' | 'en'): RouteGuideJourneyTemplate {
  const plan = guide.plan;
  return {
    id: plan.id, routeId: plan.routeId, title: guideText(guide.title, lang), authorName: guideText(guide.author, lang), authorAvatarUrl: guide.authorAvatarUrl,
    days: plan.days.map((day) => ({ title: guideText(day.title, lang), items: day.items.map((item) => guideText(item, lang)) })),
    gear: plan.gear.map((item) => ({ sourceType: 'recommendedTemplate', name: guideText(item.name, lang), categoryName: guideText(item.category, lang), note: guideText(item.note, lang), quantity: item.quantity, weightKg: item.weightKg })),
  };
}
