// routeDirection.ts — a route walked from either trailhead. The catalog keeps
// one recorded direction; picking the other one flips the geometry, the
// profile and the climb together so everything downstream sees one direction.
import type { Poi } from '../data/pois';
import { directedClimb } from '../data/elevation';
import { distanceMeters, measureTrack, type Coordinate } from './routeSegments';

/** Trailheads this close together make a loop: swapping them changes the
 *  turning sense, not where the walk starts. */
const LOOP_GAP_METERS = 300;

export function isLoopTrack(coords?: Coordinate[]): boolean {
  if (!coords || coords.length < 3) return false;
  return distanceMeters(coords[0], coords[coords.length - 1]) <= LOOP_GAP_METERS;
}

/** Turning sense of a loop as recorded, from its signed area (shoelace) with
 *  longitude scaled by the latitude so the shape isn't skewed. */
export function loopIsClockwise(coords: Coordinate[]): boolean {
  const scale = Math.cos((coords.reduce((sum, [, lat]) => sum + lat, 0) / coords.length) * Math.PI / 180);
  let area = 0;
  for (let i = 0; i < coords.length; i += 1) {
    const [x1, y1] = coords[i];
    const [x2, y2] = coords[(i + 1) % coords.length];
    area += x1 * scale * y2 - x2 * scale * y1;
  }
  return area < 0;
}

/**
 * The route as walked from its recorded finish: coordinates and profile in
 * reverse, waypoint mileage counted from the other end, and the ascent of the
 * new direction, left blank when no profile can tell it. A route without a
 * usable track comes back unchanged.
 */
export function reverseRoute(route: Poi): Poi {
  const coords = route.trackCoords;
  if (!coords || coords.length < 2) return route;
  const elevation = route.trackElevation;
  const totalKm = elevation?.length ? elevation[elevation.length - 1].km : undefined;
  const trackKm = (measureTrack(coords)?.totalMeters ?? 0) / 1000;
  const { ascent } = directedClimb(route, true);
  return {
    ...route,
    trackCoords: [...coords].reverse(),
    trackElevation: elevation && totalKm != null
      ? [...elevation].reverse().map((point) => ({ km: totalKm - point.km, ele: point.ele }))
      : elevation,
    trackWaypoints: route.trackWaypoints
      ?.map((waypoint) => ({ ...waypoint, km: Math.max(0, Math.round((trackKm - waypoint.km) * 100) / 100) }))
      .sort((a, b) => a.km - b.km),
    asc: ascent != null ? `+${Math.round(ascent).toLocaleString('en-US')} m` : '',
  };
}
