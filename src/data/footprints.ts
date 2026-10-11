import type { Poi } from './pois';
import { journeyStartDate, journeyStatus } from '../components/journey/JourneyPlanCard';

export function routeProvince(region: string): string | undefined {
  const province = region.split('·')[0]?.trim();
  return province || undefined;
}

export function buildRouteFootprints(routes: Poi[], journeys: Poi[], now = new Date()) {
  const catalog = routes.filter((route) => route.kind === 'route' && !route.deletedAt);
  const completed = journeys.filter((journey) => !journey.deletedAt && journey.routeId && journeyStatus(journey, now) === 'completed');
  const byRoute = new Map<string, Poi>();
  for (const journey of completed) {
    const routeId = journey.routeId!;
    const previous = byRoute.get(routeId);
    const date = (item: Poi) => journeyStartDate(item)?.getTime() ?? (item.updatedAt ? new Date(item.updatedAt).getTime() : 0);
    if (!previous || date(journey) >= date(previous)) byRoute.set(routeId, journey);
  }
  const items = catalog.map((route) => ({ route, lit: byRoute.has(route.id), journey: byRoute.get(route.id) }));
  const litItems = items.filter((item) => item.lit);
  const provinces = [...new Set(litItems.map((item) => routeProvince(item.route.region || '')).filter((value): value is string => Boolean(value)))];
  const litKm = litItems.reduce((sum, item) => {
    const distance = Number.parseFloat(item.route.dist || '');
    return sum + (Number.isFinite(distance) ? distance : 0);
  }, 0);
  litItems.sort((a, b) => {
    const date = (item: typeof a) => journeyStartDate(item.journey!)?.getTime() ?? (item.journey?.updatedAt ? new Date(item.journey.updatedAt).getTime() : 0);
    return date(b) - date(a);
  });
  return { items, litItems, litCount: litItems.length, total: catalog.length, provinces, litKm };
}

export type RouteFootprints = ReturnType<typeof buildRouteFootprints>;
