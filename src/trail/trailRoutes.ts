// trailRoutes.ts — turning what the app already shows (a catalog route, a
// track in the library) into the line the 徒步导航 page follows.
import { useCallback } from 'react';
import type { Track } from '../data/tracks';
import type { Poi } from '../data/pois';
import { useI18n } from '../i18n';
import { reverseRoute } from '../lib/routeDirection';
import type { TrailRouteRef } from '../lib/trailRecorder';
import { useNav } from '../nav/NavContext';
import { getTrailSnapshot } from '../lib/trailRecorder';
import { useTrail } from './TrailContext';

/** A catalog route, walked in the direction the route card is showing. */
export function trailRouteFromPoi(poi: Poi, reversed = false): TrailRouteRef | null {
  const route = reversed ? reverseRoute(poi) : poi;
  if (!route.trackCoords || route.trackCoords.length < 2) return null;
  return {
    kind: 'route',
    id: route.id,
    name: route.name,
    coords: route.trackCoords,
    elevation: route.trackElevation,
    waypoints: route.trackWaypoints,
    reversed,
    region: route.region,
  };
}

export function trailRouteFromTrack(track: Track): TrailRouteRef | null {
  if (!track.coords || track.coords.length < 2) return null;
  return {
    kind: 'track',
    id: track.id,
    name: track.name,
    coords: track.coords,
    elevation: track.elevation,
    waypoints: track.waypoints,
  };
}

/** Opens the page for a route, or for free recording with `null`. */
export function useOpenTrail() {
  const trail = useTrail();
  const nav = useNav();
  const { t } = useI18n();
  return useCallback((route: TrailRouteRef | null) => {
    if (trail.openTrail(route) === 'busy') nav.showToast(t('trail.busy'));
  }, [nav, t, trail]);
}

/**
 * The 记录轨迹 buttons: a free recording, or straight back to the one already
 * running, whatever it is following. Never a "busy" toast from here.
 */
export function useRecordTrail() {
  const trail = useTrail();
  return useCallback(() => {
    if (getTrailSnapshot().session) trail.openTrail();
    else trail.openTrail(null);
  }, [trail]);
}
