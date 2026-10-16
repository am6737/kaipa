import type { PublishedItinerary } from '../lib/officialItinerary';
import { sortItineraries } from '../lib/officialItinerary';
import { sortRouteGuides, type RouteCommunityGuide, type RouteGuideSort } from './routeGuides';

export type GuideListEntry =
  | { kind: 'official'; id: string; plan: PublishedItinerary }
  | { kind: 'community'; id: string; guide: RouteCommunityGuide };

export function mergeGuideList(plans: PublishedItinerary[], guides: RouteCommunityGuide[], sort: RouteGuideSort = 'recommended'): GuideListEntry[] {
  return [
    ...sortItineraries(plans).map((plan): GuideListEntry => ({ kind: 'official', id: `official:${plan.id}`, plan })),
    ...sortRouteGuides([...guides], sort).map((guide): GuideListEntry => ({ kind: 'community', id: `community:${guide.id}`, guide })),
  ];
}
