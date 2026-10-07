import type { TimelineLocation, TLRow } from '../data/timeline';
import { trackLengthMatches } from './journeyTracks';
import { groupJourneyRows, orderedJourneyRows } from './journeyOrdering';
import {
  distanceMeters,
  measureTrack,
  positionAtDistance,
  projectOnTrack,
  trackSliceBetweenMeters,
  type Coordinate,
} from './routeSegments';

export interface JourneyStop {
  rowId: string;
  /** 1-based position within its own day — the pin's number while that day is
   *  open on its own. The overview draws places, not numbered steps. */
  order: number;
  day?: string;
  name: string;
  coordinate: Coordinate;
  /** Set when the place was picked on a recorded track. Two of these on one
   *  track walk that track instead of a road plan. */
  trackId?: string;
  trackMeters?: number;
  /** The track's length when the place was picked — see `trackLengthMatches`. */
  trackLengthMeters?: number;
}

export interface JourneyLeg {
  id: string;
  /** The day this travel belongs to. Legs never cross days, so this is also
   *  the day it leaves from. */
  day?: string;
  mode: 'driving' | 'walking';
  from: Coordinate;
  to: Coordinate;
  /** Road geometry already recorded on the transport row: nothing to plan. */
  recordedGeometry?: Coordinate[];
  /**
   * A mixed leg can enter or leave a recorded track through a short AMap
   * bridge. The direction request uses these endpoints; the actual stop
   * coordinates remain `from`/`to`.
   */
  directionFrom?: Coordinate;
  directionTo?: Coordinate;
  /** Recorded track pieces before/after the AMap bridge. */
  recordedPrefix?: Coordinate[];
  recordedSuffix?: Coordinate[];
  /** Geometry shown while the bridge is still being planned. */
  fallbackGeometry?: Coordinate[];
  /** Straight-line length: what decides walking versus driving above. */
  directMeters: number;
}

/** Two places inside the same day should not produce two pins — a transport row
 *  and the place it points at usually sit on the same spot. Across days this
 *  merge deliberately does not apply: each group stands on its own, so dropping
 *  a day's first place because yesterday ended there would leave that day empty. */
const SAME_PLACE_METERS = 50;

function coordinateOf(row: TLRow): { coordinate: Coordinate; name: string; location?: TimelineLocation } | null {
  const location = row.location;
  if (location && Number.isFinite(location.longitude) && Number.isFinite(location.latitude)) {
    return {
      coordinate: [location.longitude as number, location.latitude as number],
      name: location.name || row.title,
      location,
    };
  }
  return null;
}

/** A place a person put on a path, as opposed to one that exists on a map. */
function trackWalk(
  from: JourneyStop,
  to: JourneyStop,
  trackCoords?: (trackId: string) => Coordinate[] | undefined,
): boolean {
  if (!from.trackId || !to.trackId || from.trackMeters == null || to.trackMeters == null) return false;
  if (from.trackId === to.trackId) return true;
  // Two ids can name one line: the journey's own track row and the catalog route
  // its geometry was promoted from. A place kept under either of them still sits
  // on the same path, and the chain has to walk it.
  const geometry = trackCoords && trackCoords(from.trackId);
  return Boolean(geometry && geometry === trackCoords?.(to.trackId));
}

/** The days in the order the list shows them, so a day's colour is stable. */
export function journeyDayOrder(rows: TLRow[], knownGroups: string[]): string[] {
  return groupJourneyRows(rows, knownGroups).map((group) => group.key).filter(Boolean);
}

/** Stops in the order the itinerary list shows them, numbered within each day. */
export function buildJourneyStops(rows: TLRow[], knownGroups: string[]): JourneyStop[] {
  const stops: JourneyStop[] = [];
  const perDay = new Map<string, number>();
  for (const row of orderedJourneyRows(rows, knownGroups)) {
    const found = coordinateOf(row);
    if (!found) continue;
    const previous = stops[stops.length - 1];
    // The merge exists because a transport row and the place it points at are
    // usually the same spot. A track place is not that: it means "here on the
    // path", and the village POI next to it is a different place even when the
    // two are metres apart.
    const mergeable = previous && previous.day === (row.day || undefined)
      && !previous.trackId && !found.location?.trackId
      && distanceMeters(previous.coordinate, found.coordinate) < SAME_PLACE_METERS;
    if (mergeable) continue;
    const dayCount = (perDay.get(row.day) ?? 0) + 1;
    perDay.set(row.day, dayCount);
    stops.push({
      rowId: row.id,
      order: dayCount,
      day: row.day || undefined,
      name: found.name,
      coordinate: found.coordinate,
      trackId: found.location?.trackId,
      trackMeters: found.location?.trackMeters,
      trackLengthMeters: found.location?.trackLengthMeters,
    });
  }
  return stops;
}

/**
 * A "walk" leg beyond this is planned as a drive: AMap caps walking routes at
 * 100 km, and a hop that long was not walked anyway.
 */
const MAX_WALKED_LEG_METERS = 5_000;

/**
 * Legs join consecutive stops within one day group. A group is a route; the
 * hop from one group to the next is not part of either day's plan, so nothing
 * is drawn for it and the day that has no travel of its own has no mileage.
 *
 * `trackCoords` resolves a track id to its geometry. Two places on one recorded
 * track walk that track — there is no road to plan between them, and asking for
 * one sends the line out to the nearest valley road and reports the trip as its
 * driving distance.
 */
export function buildJourneyLegs(
  stops: JourneyStop[],
  rowsOrTrack: Map<string, TLRow> | ((trackId: string) => Coordinate[] | undefined) | undefined,
  maybeTrack?: (trackId: string) => Coordinate[] | undefined,
): JourneyLeg[] {
  const trackCoords = typeof rowsOrTrack === 'function' ? rowsOrTrack : maybeTrack;
  const legs: JourneyLeg[] = [];
  for (let index = 1; index < stops.length; index += 1) {
    const from = stops[index - 1];
    const to = stops[index];
    if (from.day !== to.day) continue;
    const directMeters = distanceMeters(from.coordinate, to.coordinate);
    const trackGeometry = trackGeometryFor(from, to, trackCoords);
    const mixed = Boolean(from.trackId) !== Boolean(to.trackId);
    const bridge = mixed ? buildTrackBridge(from, to, trackCoords) : null;
    const fullRecordedGeometry = trackGeometry ?? undefined;
    // Keep the existing walking semantics for any leg touching a recorded
    // track; the new bridge only changes which endpoint AMap plans to, not the
    // user's travel mode.
    const onSomeTrack = Boolean(from.trackId || to.trackId);
    const mode = trackGeometry || onSomeTrack ? 'walking' : 'driving';
    const leg: JourneyLeg = {
      id: `${from.rowId}->${to.rowId}`,
      day: to.day,
      mode,
      from: from.coordinate,
      to: to.coordinate,
      recordedGeometry: fullRecordedGeometry,
      directMeters,
    };
    if (!fullRecordedGeometry && bridge) {
      leg.directionFrom = bridge.directionFrom;
      leg.directionTo = bridge.directionTo;
      leg.recordedPrefix = bridge.recordedPrefix;
      leg.recordedSuffix = bridge.recordedSuffix;
      leg.fallbackGeometry = composeJourneyLegGeometry(leg, null);
    }
    legs.push(leg);
  }
  return legs;
}

const TRACK_BRIDGE_SNAP_METERS = 500;
const COORDINATE_EPSILON = 1e-9;

interface TrackBridge {
  directionFrom: Coordinate;
  directionTo: Coordinate;
  recordedPrefix?: Coordinate[];
  recordedSuffix?: Coordinate[];
}

function appendCoordinates(target: Coordinate[], coordinates?: Coordinate[]) {
  coordinates?.forEach((coordinate) => {
    const previous = target[target.length - 1];
    if (previous
      && Math.abs(previous[0] - coordinate[0]) <= COORDINATE_EPSILON
      && Math.abs(previous[1] - coordinate[1]) <= COORDINATE_EPSILON) return;
    target.push(coordinate);
  });
}

/** Compose an AMap bridge and any recorded-track pieces into one connected line. */
export function composeJourneyLegGeometry(leg: JourneyLeg, directionGeometry: Coordinate[] | null): Coordinate[] {
  if (leg.recordedGeometry?.length) return leg.recordedGeometry;
  const coordinates: Coordinate[] = [];
  appendCoordinates(coordinates, leg.recordedPrefix ?? [leg.from]);
  appendCoordinates(coordinates, directionGeometry ?? [leg.directionFrom ?? leg.from, leg.directionTo ?? leg.to]);
  appendCoordinates(coordinates, leg.recordedSuffix ?? [leg.to]);
  return coordinates;
}

function trackForStop(
  stop: JourneyStop,
  trackCoords: ((trackId: string) => Coordinate[] | undefined) | undefined,
) {
  if (!trackCoords || !stop.trackId || stop.trackMeters == null) return null;
  const coordinates = trackCoords(stop.trackId);
  const measure = measureTrack(coordinates);
  if (!measure || !trackLengthMatches(measure, stop.trackLengthMeters)) return null;
  return measure;
}

/**
 * Build the hybrid part of a mixed leg when the non-track place is close to the
 * recorded path. The short AMap bridge ends at the projected track point, and
 * the rest of the leg follows the original track instead of asking AMap to
 * invent a route through a hiking trail.
 */
function buildTrackBridge(
  from: JourneyStop,
  to: JourneyStop,
  trackCoords: ((trackId: string) => Coordinate[] | undefined) | undefined,
): TrackBridge | null {
  const fromOnTrack = Boolean(from.trackId && from.trackMeters != null);
  const toOnTrack = Boolean(to.trackId && to.trackMeters != null);
  if (fromOnTrack === toOnTrack) return null;
  const trackStop = fromOnTrack ? from : to;
  const otherStop = fromOnTrack ? to : from;
  const measure = trackForStop(trackStop, trackCoords);
  if (!measure) return null;
  const projected = projectOnTrack(measure, otherStop.coordinate);
  if (!projected || distanceMeters(projected.coordinate, otherStop.coordinate) > TRACK_BRIDGE_SNAP_METERS) return null;

  const recorded = fromOnTrack
    ? trackSliceBetweenMeters(measure, from.trackMeters as number, projected.distanceMeters)
    : trackSliceBetweenMeters(measure, projected.distanceMeters, to.trackMeters as number);

  if (!recorded || recorded.length < 2) return null;
  return fromOnTrack
    ? { directionFrom: projected.coordinate, directionTo: to.coordinate, recordedPrefix: recorded }
    : { directionFrom: from.coordinate, directionTo: projected.coordinate, recordedSuffix: recorded };
}

/** The track slice between two of its places, or nothing to fall back on. */
function trackGeometryFor(
  from: JourneyStop,
  to: JourneyStop,
  trackCoords: ((trackId: string) => Coordinate[] | undefined) | undefined,
): Coordinate[] | null {
  if (!trackCoords || !trackWalk(from, to, trackCoords)) return null;
  const coordinates = trackCoords(from.trackId as string);
  if (!coordinates) return null;
  const measure = measureTrack(coordinates);
  if (!measure) return null;
  // Stale distances would draw a confident wrong line, so the length the places
  // were measured against has to still be this track's length.
  if (!trackLengthMatches(measure, from.trackLengthMeters) || !trackLengthMatches(measure, to.trackLengthMeters)) return null;
  return trackSliceBetweenMeters(measure, from.trackMeters as number, to.trackMeters as number);
}

export interface JourneyDayDistance {
  day: string;
  /** Road length of everything that day travels, in metres. */
  meters: number;
  /** Middle of the day's chain, which is where its label sits on the map. */
  coordinate: Coordinate;
}

/**
 * Per-day mileage along the itinerary chain. A day with no travel of its own
 * (a single place, or places that all sit on the same spot) has no measurement
 * to show.
 */
export function measureJourneyDays(
  legs: JourneyLeg[],
  geometryByLeg: Record<string, Coordinate[]>,
): JourneyDayDistance[] {
  const byDay = new Map<string, Coordinate[]>();
  legs.forEach((leg) => {
    if (!leg.day) return;
    const coordinates = byDay.get(leg.day) ?? [];
    coordinates.push(...(geometryByLeg[leg.id] ?? leg.fallbackGeometry ?? [leg.from, leg.to]));
    byDay.set(leg.day, coordinates);
  });
  const measured: JourneyDayDistance[] = [];
  byDay.forEach((coordinates, day) => {
    const track = measureTrack(coordinates);
    if (!track) return;
    measured.push({
      day,
      meters: track.totalMeters,
      coordinate: positionAtDistance(track, track.totalMeters / 2).coordinate,
    });
  });
  return measured;
}

/**
 * The last place of the group before `day` — where the day before ended, which
 * is where this day usually starts. Chains never cross groups, so this is not
 * a link: it is only a place to fill a new item with instead of searching it.
 *
 * Only while `day` has no place of its own. Once the group has a stop, the row
 * below this one is that group's own last place, not yesterday's — and which
 * place sits below also depends on the time being typed, so there is no honest
 * "上一站" left to offer.
 */
export function carryPlaceFromPreviousDay(
  rows: TLRow[],
  knownGroups: string[],
  day: string,
  exceptRowId?: string,
): TimelineLocation | null {
  if (!day) return null;
  const siblings = rows.filter((row) => row.id !== exceptRowId);
  const stops = buildJourneyStops(siblings, knownGroups);
  if (stops.some((stop) => stop.day === day)) return null;
  const order = journeyDayOrder([{ id: '__pending', title: '', day }, ...siblings], knownGroups);
  const dayIndex = order.indexOf(day);
  const last = stops
    .filter((stop) => stop.day && order.indexOf(stop.day) < dayIndex)
    .pop();
  if (!last) return null;
  return siblings.find((row) => row.id === last.rowId)?.location
    ?? { name: last.name, longitude: last.coordinate[0], latitude: last.coordinate[1] };
}
