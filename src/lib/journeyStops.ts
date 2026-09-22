import type { TLRow } from '../data/timeline';
import { orderedJourneyRows } from './journeyOrdering';
import { distanceMeters, type Coordinate } from './routeSegments';

export interface JourneyStop {
  rowId: string;
  /** 1-based position in the itinerary, drawn as the pin's number. */
  order: number;
  day?: string;
  name: string;
  coordinate: Coordinate;
}

export interface JourneyLeg {
  id: string;
  day?: string;
  mode: 'driving' | 'walking';
  from: Coordinate;
  to: Coordinate;
  /** Road geometry already recorded on the transport row: nothing to plan. */
  recordedGeometry?: Coordinate[];
  /** Straight-line length, used only to pick a fallback presentation. */
  directMeters: number;
}

/** Two rows naming the same place should not produce two pins. */
const SAME_PLACE_METERS = 50;
/**
 * A day's stops are visited in sequence, but a long transfer (flight, train to
 * the next valley) is not a road the user drove. Beyond this the chain breaks
 * instead of drawing a line across the country.
 */
export const MAX_LINKED_LEG_METERS = 100_000;

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

/** Numbered in the order the itinerary list shows them, across all days. */
export function buildJourneyStops(rows: TLRow[], knownGroups: string[]): JourneyStop[] {
  const stops: JourneyStop[] = [];
  for (const row of orderedJourneyRows(rows, knownGroups)) {
    const found = coordinateOf(row);
    if (!found) continue;
    const previous = stops[stops.length - 1];
    if (previous && distanceMeters(previous.coordinate, found.coordinate) < SAME_PLACE_METERS) continue;
    stops.push({
      rowId: row.id,
      order: stops.length + 1,
      day: row.day || undefined,
      name: found.name,
      coordinate: found.coordinate,
    });
  }
  return stops;
}

/**
 * Legs only ever join two stops of the same day: a new day is a new line, and
 * an in-day jump too far to have been walked or driven is left as a gap.
 */
/**
 * A "walk" leg beyond this is planned as a drive: AMap caps walking routes at
 * 100 km, and a hop that long was not walked anyway.
 */
const MAX_WALKED_LEG_METERS = 5_000;

export function buildJourneyLegs(stops: JourneyStop[], rowsById: Map<string, TLRow>): JourneyLeg[] {
  const legs: JourneyLeg[] = [];
  for (let index = 1; index < stops.length; index += 1) {
    const from = stops[index - 1];
    const to = stops[index];
    if (!from.day || from.day !== to.day) continue;
    const directMeters = distanceMeters(from.coordinate, to.coordinate);
    if (directMeters > MAX_LINKED_LEG_METERS) continue;
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
