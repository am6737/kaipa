// journeyTracks.ts — the recorded tracks a journey can put places on.
//
// A hiking day has no road to plan: the path between two places is a GPX the
// route catalog or the journey itself already carries. This resolves those
// tracks into one list so the place picker offers their points and the
// itinerary chain can draw itself along them instead of asking for a road.

import type { Poi } from '../data/pois';
import { measureTrack, positionAtDistance, type Coordinate, type TrackMeasure } from './routeSegments';

export interface JourneyTrackPoint {
  name: string;
  /** Distance along the track, in metres — the identity a place keeps. */
  meters: number;
  coordinate: Coordinate;
  elevation?: number;
}

export interface JourneyTrack {
  id: string;
  name: string;
  coords: Coordinate[];
  measure: TrackMeasure;
  waypoints: JourneyTrackPoint[];
  totalMeters: number;
  /** What the file actually recorded, if it recorded anything. */
  elevation?: { km: number; ele: number }[];
}

interface TrackBearing {
  id?: string;
  name?: string;
  trackCoords?: [number, number][];
  trackWaypoints?: { name: string; km: number }[];
  trackElevation?: { km: number; ele: number }[];
}

function elevationAt(series: { km: number; ele: number }[] | undefined, km: number): number | undefined {
  if (!series?.length) return undefined;
  let best = series[0];
  for (const point of series) {
    if (Math.abs(point.km - km) < Math.abs(best.km - km)) best = point;
  }
  return Number.isFinite(best.ele) ? best.ele : undefined;
}

function toTrack(source: TrackBearing, id: string): JourneyTrack | null {
  const coords = (source.trackCoords ?? []).filter(
    ([lng, lat]) => Number.isFinite(lng) && Number.isFinite(lat),
  ) as Coordinate[];
  if (coords.length < 2) return null;
  const measure = measureTrack(coords);
  if (!measure) return null;
  const waypoints = (source.trackWaypoints ?? [])
    .filter((point) => point.name.trim() && Number.isFinite(point.km))
    .map((point) => ({
      name: point.name.trim(),
      meters: point.km * 1000,
      coordinate: positionAtDistance(measure, point.km * 1000).coordinate,
      elevation: elevationAt(source.trackElevation, point.km),
    }));
  return {
    id,
    name: source.name || id,
    coords,
    measure,
    waypoints,
    totalMeters: measure.totalMeters,
    elevation: source.trackElevation?.length ? source.trackElevation : undefined,
  };
}

/** Height at a distance along the track, when the file carries heights. */
export function elevationAtMeters(track: JourneyTrack, meters: number): number | undefined {
  return elevationAt(track.elevation, meters / 1000);
}

/**
 * The tracks this journey actually has: the catalog routes its days are linked
 * to, plus the track bound to the journey itself. Ordered by first appearance in
 * the itinerary, because that is the order the reader is working through.
 */
export function journeyTracks(
  journey: Poi | undefined,
  rows: { routeId?: string }[],
  routes: Poi[],
): JourneyTrack[] {
  const byId = new Map<string, JourneyTrack>();
  const add = (source: TrackBearing | undefined, id: string | undefined) => {
    if (!id || byId.has(id)) return;
    const track = source ? toTrack(source, id) : null;
    if (track) byId.set(id, track);
  };
  const seen = new Set<string>();
  for (const row of rows) {
    if (!row.routeId || seen.has(row.routeId)) continue;
    seen.add(row.routeId);
    add(routes.find((route) => route.id === row.routeId), row.routeId);
  }
  if (journey?.routeId) add(routes.find((route) => route.id === journey.routeId), journey.routeId);
  // The journey's own track is a projection of `journeys.track_id`.
  if (journey) add(journey, journey.trackId || journey.id);
  return [...byId.values()];
}

/** A track point as the itinerary stores it. */
export function trackLocation(track: JourneyTrack, point: JourneyTrackPoint) {
  return {
    name: point.name,
    source: 'track' as const,
    longitude: point.coordinate[0],
    latitude: point.coordinate[1],
    trackId: track.id,
    trackName: track.name,
    trackMeters: point.meters,
    trackLengthMeters: track.totalMeters,
  };
}

/**
 * Whether a stored distance still means the same thing on this track. A replaced
 * file moves every number on it, and a leg drawn from stale distances would be
 * quietly wrong rather than visibly wrong.
 */
export function trackLengthMatches(track: { totalMeters: number }, storedMeters: number | undefined): boolean {
  if (storedMeters == null || !Number.isFinite(storedMeters)) return false;
  if (track.totalMeters <= 0) return false;
  return Math.abs(track.totalMeters - storedMeters) / track.totalMeters <= 0.02;
}
