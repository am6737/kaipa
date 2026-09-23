import type { TimelineLocation, TLRow } from '../data/timeline';
import { groupJourneyRows, orderedJourneyRows } from './journeyOrdering';
import { distanceMeters, measureTrack, positionAtDistance, type Coordinate } from './routeSegments';

export interface JourneyStop {
  rowId: string;
  /** 1-based position within its own day — the pin's number while that day is
   *  open on its own. The overview draws places, not numbered steps. */
  order: number;
  day?: string;
  name: string;
  coordinate: Coordinate;
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
  /** Straight-line length: what decides walking versus driving above. */
  directMeters: number;
}

/** Two places inside the same day should not produce two pins — a transport row
 *  and the place it points at usually sit on the same spot. Across days this
 *  merge deliberately does not apply: each group stands on its own, so dropping
 *  a day's first place because yesterday ended there would leave that day empty. */
const SAME_PLACE_METERS = 50;

function coordinateOf(row: TLRow): { coordinate: Coordinate; name: string } | null {
  const location = row.location;
  if (location && Number.isFinite(location.longitude) && Number.isFinite(location.latitude)) {
    return {
      coordinate: [location.longitude as number, location.latitude as number],
      name: location.name || row.title,
    };
  }
  // Agent-produced transport rows keep their destination in `transport.to`.
  const to = row.transport?.to;
  if (to && Number.isFinite(to.longitude) && Number.isFinite(to.latitude)) {
    return { coordinate: [to.longitude as number, to.latitude as number], name: to.name || row.title };
  }
  return null;
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
    if (previous && previous.day === (row.day || undefined)
      && distanceMeters(previous.coordinate, found.coordinate) < SAME_PLACE_METERS) continue;
    const dayCount = (perDay.get(row.day) ?? 0) + 1;
    perDay.set(row.day, dayCount);
    stops.push({
      rowId: row.id,
      order: dayCount,
      day: row.day || undefined,
      name: found.name,
      coordinate: found.coordinate,
    });
  }
  return stops;
}

/**
 * A "walk" leg beyond this is planned as a drive: AMap caps walking routes at
 * 100 km, and a hop that long was not walked anyway.
 */
const MAX_WALKED_LEG_METERS = 5_000;

/** Legs join consecutive stops within one day group. A group is a route; the
 *  hop from one group to the next is not part of either day's plan, so nothing
 *  is drawn for it and the day that has no travel of its own has no mileage. */
export function buildJourneyLegs(stops: JourneyStop[], rowsById: Map<string, TLRow>): JourneyLeg[] {
  const legs: JourneyLeg[] = [];
  for (let index = 1; index < stops.length; index += 1) {
    const from = stops[index - 1];
    const to = stops[index];
    if (from.day !== to.day) continue;
    const directMeters = distanceMeters(from.coordinate, to.coordinate);
    const toRow = rowsById.get(to.rowId);
    const recordedGeometry = toRow?.transport?.geometry;
    legs.push({
      id: `${from.rowId}->${to.rowId}`,
      day: to.day,
      mode: toRow?.transport?.mode === 'walk' && directMeters <= MAX_WALKED_LEG_METERS ? 'walking' : 'driving',
      from: from.coordinate,
      to: to.coordinate,
      recordedGeometry: recordedGeometry && recordedGeometry.length >= 2 ? recordedGeometry : undefined,
      directMeters,
    });
  }
  return legs;
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
    coordinates.push(...(geometryByLeg[leg.id] ?? [leg.from, leg.to]));
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
 */
export function carryPlaceFromPreviousDay(
  rows: TLRow[],
  knownGroups: string[],
  day: string,
  exceptRowId?: string,
): TimelineLocation | null {
  if (!day) return null;
  const siblings = rows.filter((row) => row.id !== exceptRowId);
  const order = journeyDayOrder([{ id: '__pending', title: '', day }, ...siblings], knownGroups);
  const dayIndex = order.indexOf(day);
  const last = buildJourneyStops(siblings, knownGroups)
    .filter((stop) => stop.day && order.indexOf(stop.day) < dayIndex)
    .pop();
  if (!last) return null;
  return siblings.find((row) => row.id === last.rowId)?.location
    ?? { name: last.name, longitude: last.coordinate[0], latitude: last.coordinate[1] };
}
