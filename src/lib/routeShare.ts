// routeShare.ts — what a route card's share menu offers, and doing it.
import { Share } from 'react-native';
import type { Poi } from '../data/pois';
import { exportRouteTrack, routeAsTrack } from './trackExport';
import { regionLabel } from './regionLabel';

export type RouteShareAction = 'text' | 'gpx' | 'original';

/** The share actions this route supports, in menu order. A GPX original is
 *  what the GPX action already hands over, so only KML/KMZ get their own. */
export function routeShareActions(route: Poi): RouteShareAction[] {
  const track = routeAsTrack(route);
  const hasTrack = (track.coords?.length ?? 0) >= 2 || Boolean(track.fileUrl);
  const hasOriginal = Boolean(track.fileUrl && track.fileFormat && track.fileFormat !== 'gpx');
  return ['text', ...(hasTrack ? ['gpx' as const] : []), ...(hasOriginal ? ['original' as const] : [])];
}

/** Opens the system share sheet. Resolves `false` when an export failed (a
 *  dismissed sheet is not a failure). */
export async function shareRoute(route: Poi, action: RouteShareAction): Promise<boolean> {
  try {
    if (action === 'text') {
      const message = `${route.name}\n${[regionLabel(route.region), route.dist, route.asc].filter(Boolean).join(' ')}`;
      await Share.share({ title: route.name, message });
    } else {
      await exportRouteTrack(route, action);
    }
    return true;
  } catch (error: any) {
    if (error?.message === 'User did not share') return true;
    console.warn('[routeShare] share failed:', error);
    return action === 'text';
  }
}
