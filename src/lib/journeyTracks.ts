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
  /**
   * The id new places store. Where one geometry arrives under several ids this
   * is the journey's own track row, because that link outlives the day's route
   * reference the copy was promoted from.
   */
  id: string;
  /** Every id that resolves to this one track, canonical first. */
  ids: string[];
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
    ids: [id],
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
 * The tracks this journey actually has: the catalog routes its days link to, plus
 * the track bound to the journey itself. Ordered by first appearance in the
 * itinerary, because that is the order the reader is working through.
 *
 * One file reaches the journey through more than one id: building a journey from
 * a catalog route copies that route's geometry into a row of the track library
 * (`NewJourneySheet`) and stores its id on the journey, so the same path arrives
 * once as the day's route and once as the journey's own track. Ids alone cannot
 * tell that apart, and offering the reader two identical rows is worse than
 * offering none — it is the answer to "which one?", which has no answer. So the
 * list is keyed by geometry and every id that means this track is kept on it.
 */
export function journeyTracks(
  journey: Poi | undefined,
  rows: { routeId?: string }[],
  routes: Poi[],
): JourneyTrack[] {
  const tracks: JourneyTrack[] = [];
  const add = (source: TrackBearing | undefined, id: string | undefined, isOwnTrack = false) => {
    if (!id) return;
    const already = tracks.find((track) => track.ids.includes(id));
    if (already) return;
    const track = source ? toTrack(source, id) : null;
    if (!track) return;
    const same = tracks.find((item) => sameGeometry(item.coords, track.coords));
    if (same) mergeTrack(same, track, isOwnTrack);
    else tracks.push(track);
  };
  const seen = new Set<string>();
  for (const row of rows) {
    if (!row.routeId || seen.has(row.routeId)) continue;
    seen.add(row.routeId);
    add(routes.find((route) => route.id === row.routeId), row.routeId);
  }
  if (journey?.routeId) add(routes.find((route) => route.id === journey.routeId), journey.routeId);
  // The journey's own track is a projection of `journeys.track_id`.
  if (journey) add(journey, journey.trackId || journey.id, true);
  return tracks;
}

/** Two candidates are the same path when one is this one re-labelled. */
const COORD_EPSILON = 1e-7; // ~1 cm, well inside any two real tracks

function sameGeometry(a: Coordinate[], b: Coordinate[]): boolean {
  if (a.length !== b.length) return false;
  for (let index = 0; index < a.length; index += 1) {
    if (Math.abs(a[index][0] - b[index][0]) > COORD_EPSILON) return false;
    if (Math.abs(a[index][1] - b[index][1]) > COORD_EPSILON) return false;
  }
  return true;
}

/** Fold a duplicate's ids onto the track that already carries its geometry. */
function mergeTrack(target: JourneyTrack, incoming: JourneyTrack, makeCanonical: boolean) {
  if (!target.ids.includes(incoming.id)) target.ids.push(incoming.id);
  if (!makeCanonical || target.id === incoming.id) return;
  target.ids = [incoming.id, ...target.ids.filter((item) => item !== incoming.id)];
  target.id = incoming.id;
}

/**
 * The track a stored place sits on, by any id it could have been recorded under.
 * A place picked before its day dropped the route link keeps the route id, and
 * that is still the same line.
 */
export function trackForId(tracks: JourneyTrack[], id: string | undefined): JourneyTrack | undefined {
  if (!id) return undefined;
  return tracks.find((track) => track.id === id || track.ids.includes(id));
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
