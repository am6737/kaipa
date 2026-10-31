import type { TimelineLocation, TLRow } from '../data/timeline';
import { usableIncomingPath } from './journeyAccess';
import { trackLengthMatches } from './journeyTracks';
import { groupJourneyRows, orderedJourneyRows } from './journeyOrdering';
import {
  distanceMeters,
  measureTrack,
  positionAtDistance,
  projectOnTrack,
  trackSliceBetweenMeters,
  type Coordinate,
  type TrackMeasure,
} from './routeSegments';

export interface JourneyStop {
  rowId: string;
  incomingPath?: TimelineLocation['incomingPath'];
  /** How the trip arrived here; `road` means this row is a road transfer. */
  incomingMode?: TimelineLocation['incomingMode'];
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
  /** What the road planner is asked for. A leg that touches a recorded track
   *  walks it, except where the off-track end is far enough to be a road transfer. */
  mode: 'driving' | 'walking';
  /** Track routing could not be resolved; never send this leg to a road planner. */
  pendingTrack?: boolean;
  /** A road request limited to a validated track entrance/exit. */
  trackBridge?: boolean;
  userPath?: 'drawn' | 'imported';
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
  /** Recorded track pieces before/after the AMap bridge. Never a piece the day
   *  would have to walk backwards. */
  recordedPrefix?: Coordinate[];
  recordedSuffix?: Coordinate[];
  /** Geometry shown while the bridge is still being planned. */
  fallbackGeometry?: Coordinate[];
  /** Straight-line length between the two stops. The road transfer decision
   *  measures the bridge to the trailhead instead — see ROAD_TRANSFER_METERS. */
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
      incomingPath: found.location?.incomingPath,
      incomingMode: found.location?.incomingMode,
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
    const mixedGeometry = mixed ? buildMixedTrackGeometry(from, to, trackCoords) : null;
    const supplied = to.incomingPath;
    const suppliedCoords = supplied?.coordinates;
    const validSupplied = usableIncomingPath(supplied, from.rowId, from.coordinate, to.coordinate);
    const fullRecordedGeometry = (validSupplied ? suppliedCoords : undefined) ?? trackGeometry ?? mixedGeometry ?? undefined;
    const onSomeTrack = Boolean(from.trackId || to.trackId);
    const bridge = mixed && !fullRecordedGeometry ? buildTrackAccess(from, to, trackCoords) : null;
    const mode = bridge?.mode ?? (trackGeometry || onSomeTrack ? 'walking' : 'driving');
    const leg: JourneyLeg = {
      id: `${from.rowId}->${to.rowId}`,
      day: to.day,
      mode,
      from: from.coordinate,
      to: to.coordinate,
      recordedGeometry: fullRecordedGeometry,
      userPath: validSupplied ? supplied?.source : undefined,
      // A bridge is a settled answer about where the day joins the trail: what is
      // still missing is road geometry, which is how every other leg behaves.
      pendingTrack: onSomeTrack && !fullRecordedGeometry && !bridge,
      directMeters,
    };
    if (bridge) Object.assign(leg, bridge.access, { trackBridge: true });
    legs.push(leg);
  }
  return legs;
}

// Only associate a nearby map place; proximity does not establish an access trail.
const TRACK_AUTO_SNAP_METERS = 50;
/** A track place this close to the recorded start or end is the trailhead itself:
 *  the bridge runs to that place instead of guessing an entrance from a projection. */
const TRACK_ENTRANCE_ANCHOR_METERS = 100;
/** How far a mixed leg's off-track place may sit from the trailhead before the day
 *  travels it by road (拼车/包车/班车) rather than on foot. */
const ROAD_TRANSFER_METERS = 2_000;
const COORDINATE_EPSILON = 1e-9;

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
  if (!measure || !Number.isFinite(stop.trackMeters) || stop.trackMeters < 0
    || stop.trackMeters > measure.totalMeters || !trackLengthMatches(measure, stop.trackLengthMeters)) return null;
  return measure;
}

/** Resolve a mixed pair directly on the recorded path, without a road bridge.
 * Keep the original POI pin; the route starts at its associated track position.
 * Distant or ambiguous positions require the user to choose a track point.
 */
function buildMixedTrackGeometry(
  from: JourneyStop,
  to: JourneyStop,
  trackCoords: ((trackId: string) => Coordinate[] | undefined) | undefined,
): Coordinate[] | null {
  const fromOnTrack = Boolean(from.trackId && from.trackMeters != null);
  const toOnTrack = Boolean(to.trackId && to.trackMeters != null);
  if (fromOnTrack === toOnTrack) return null;
  const trackStop = fromOnTrack ? from : to;
  const otherStop = fromOnTrack ? to : from;
  const measure = trackForStop(trackStop, trackCoords);
  if (!measure) return null;
  const projected = projectOnTrack(measure, otherStop.coordinate, {
    maxOffsetMeters: TRACK_AUTO_SNAP_METERS,
    ambiguityMeters: TRACK_AUTO_SNAP_METERS * 2,
  });
  if (!projected) return null;
  const start = fromOnTrack ? from.trackMeters as number : projected.distanceMeters;
  const finish = fromOnTrack ? projected.distanceMeters : to.trackMeters as number;
  return trackSliceBetweenMeters(measure, start, finish)
    ?? [positionAtDistance(measure, start).coordinate, positionAtDistance(measure, finish).coordinate];
}

/** A mixed leg's road bridge: what to ask the planner for, and how to get there. */
interface TrackBridge {
  mode: JourneyLeg['mode'];
  access: Partial<JourneyLeg>;
}

/** Distant places connect through an end of the recorded track.
 * Never ask the road planner to route into the middle of a mountain trail.
 * When the recorded place itself sits on a trailhead, that is the entrance — its
 * distance along the track is a fact, while projecting a station blind picks
 * whichever bend happens to be nearest and can land in the middle of the line.
 * Otherwise only use an end the nearest projected position reaches; interior or
 * ambiguous access needs an explicit track-point selection.
 */
function buildTrackAccess(
  from: JourneyStop,
  to: JourneyStop,
  trackCoords: ((trackId: string) => Coordinate[] | undefined) | undefined,
): TrackBridge | null {
  const fromOnTrack = Boolean(from.trackId && from.trackMeters != null);
  const trackStop = fromOnTrack ? from : to;
  const mapStop = fromOnTrack ? to : from;
  const measure = trackForStop(trackStop, trackCoords);
  if (!measure) return null;
  const stopMeters = trackStop.trackMeters as number;
  // A place on a trailhead is one: the day joins the line there, whatever the
  // nearest point of the whole line happens to be.
  if (stopMeters <= TRACK_ENTRANCE_ANCHOR_METERS || measure.totalMeters - stopMeters <= TRACK_ENTRANCE_ANCHOR_METERS) {
    return bridgeLeg(from, to, measure, trackStop.coordinate, stopMeters);
  }
  const projected = projectOnTrack(measure, mapStop.coordinate);
  if (!projected || distanceMeters(projected.coordinate, mapStop.coordinate) <= TRACK_AUTO_SNAP_METERS) return null;
  const projectedAtStart = projected.distanceMeters <= TRACK_ENTRANCE_ANCHOR_METERS;
  const projectedAtEnd = measure.totalMeters - projected.distanceMeters <= TRACK_ENTRANCE_ANCHOR_METERS;
  if (!projectedAtStart && !projectedAtEnd) return null;
  const start = measure.coordinates[0];
  const end = measure.coordinates[measure.coordinates.length - 1];
  if (measure.totalMeters > 200
    && Math.abs(distanceMeters(start, mapStop.coordinate) - distanceMeters(end, mapStop.coordinate)) < 50) return null;
  const entranceMeters = projectedAtStart ? 0 : measure.totalMeters;
  // Tracks are directional. An access bridge may only join the line ahead of the
  // place it leaves or behind the place it reaches — otherwise the day would walk
  // the recorded track in reverse to get there.
  const againstDirection = fromOnTrack ? entranceMeters < stopMeters : entranceMeters > stopMeters;
  if (againstDirection) return null;
  return bridgeLeg(from, to, measure, positionAtDistance(measure, entranceMeters).coordinate, entranceMeters);
}

/** The road half of a mixed leg, plus the recorded piece it joins to. */
function bridgeLeg(
  from: JourneyStop,
  to: JourneyStop,
  measure: TrackMeasure,
  entrance: Coordinate,
  entranceMeters: number,
): TrackBridge {
  const fromOnTrack = Boolean(from.trackId && from.trackMeters != null);
  const trackStop = fromOnTrack ? from : to;
  const mapStop = fromOnTrack ? to : from;
  const stopMeters = trackStop.trackMeters as number;
  // The row says the day arrives by 拼车/包车/班车, so it is a road however close
  // the two places look on the map.
  // The mode sits on the row being arrived at: the trailhead on the way in, the
  // town on the way out.
  const roadTransfer = to.incomingMode === 'road'
    || distanceMeters(mapStop.coordinate, entrance) > ROAD_TRANSFER_METERS;
  const mode: JourneyLeg['mode'] = roadTransfer ? 'driving' : 'walking';
  const recorded = fromOnTrack
    ? trackSliceBetweenMeters(measure, stopMeters, entranceMeters)
    : trackSliceBetweenMeters(measure, entranceMeters, stopMeters);
  const access: Partial<JourneyLeg> = fromOnTrack
    ? { directionFrom: entrance, directionTo: mapStop.coordinate }
    : { directionFrom: mapStop.coordinate, directionTo: entrance };
  // An entrance at the recorded place itself leaves no track to walk beside it.
  if (recorded) {
    if (fromOnTrack) access.recordedPrefix = recorded;
    else access.recordedSuffix = recorded;
  }
  return { mode, access };
}

/** Validate provider endpoints before accepting any normalized/joined geometry. */
export function trackAccessReachesEndpoints(
  leg: JourneyLeg,
  actualFrom?: Coordinate,
  actualTo?: Coordinate,
): boolean {
  return Boolean(actualFrom && actualTo
    && distanceMeters(actualFrom, leg.directionFrom ?? leg.from) <= 50
    && distanceMeters(actualTo, leg.directionTo ?? leg.to) <= 50);
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
  /** Length of everything that day travels, in metres. */
  meters: number;
  pendingTrack?: boolean;
  userDrawn?: boolean;
  /** Some (`part`) or every (`all`) leg of the day has no road or track yet
   *  and was measured as a straight line, so `meters` is not a real distance. */
  straightLine?: 'part' | 'all';
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
  const pendingDays = new Set<string>();
  // Legs measured with a real geometry vs. ones that fell back to a straight
  // link (offline, never planned, or no road). A bridge leg's fallback is
  // track plus a straight bridge, so it counts as straight too.
  const realLegs = new Map<string, number>();
  const straightLegs = new Map<string, number>();
  legs.forEach((leg) => {
    if (!leg.day) return;
    if (leg.pendingTrack && (!leg.trackBridge || !geometryByLeg[leg.id])) {
      pendingDays.add(leg.day);
      if (!byDay.has(leg.day)) byDay.set(leg.day, []);
      return;
    }
    const geometry = geometryByLeg[leg.id];
    const tally = geometry ? realLegs : straightLegs;
    tally.set(leg.day, (tally.get(leg.day) ?? 0) + 1);
    const coordinates = byDay.get(leg.day) ?? [];
    coordinates.push(...(geometry ?? leg.fallbackGeometry ?? [leg.from, leg.to]));
    byDay.set(leg.day, coordinates);
  });
  const measured: JourneyDayDistance[] = [];
  byDay.forEach((coordinates, day) => {
    if (pendingDays.has(day)) {
      const leg = legs.find((candidate) => candidate.day === day && candidate.pendingTrack)!;
      measured.push({ day, meters: 0, pendingTrack: true, coordinate: leg.from });
      return;
    }
    const track = measureTrack(coordinates);
    if (!track) return;
    measured.push({
      day,
      meters: track.totalMeters,
      userDrawn: legs.some((leg) => leg.day === day && leg.userPath === 'drawn'),
      straightLine: straightLegs.has(day) ? (realLegs.has(day) ? 'part' : 'all') : undefined,
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
