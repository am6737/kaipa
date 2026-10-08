import type { TimelineIncomingPath } from '../data/timeline';
import { distanceMeters, measureTrack, projectOnTrack, trackSliceBetweenMeters, type Coordinate } from './routeSegments';

export function drawnAccessPath(from: Coordinate, to: Coordinate, interior: Coordinate[]): Coordinate[] | null {
  if (!interior.length || interior.length > 500) return null;
  const coords = [from, ...interior, to];
  if (coords.some((p) => !Number.isFinite(p[0]) || !Number.isFinite(p[1]) || Math.abs(p[0]) > 180 || Math.abs(p[1]) > 90)) return null;
  // Require enough detail to avoid confirming a long straight connector by accident.
  if (coords.some((p, i) => i > 0 && distanceMeters(coords[i - 1], p) > 250)) return null;
  return coords;
}

export function importedAccessPath(from: Coordinate, to: Coordinate, coords: Coordinate[]): Coordinate[] | null {
  const measure = measureTrack(coords);
  if (!measure) return null;
  const options = { maxOffsetMeters: 50, ambiguityMeters: 100 };
  const a = projectOnTrack(measure, from, options), b = projectOnTrack(measure, to, options);
  if (!a || !b) return null;
  const slice = trackSliceBetweenMeters(measure, a.distanceMeters, b.distanceMeters);
  if (!slice) return null;
  return [from, ...slice, to];
}


export function usableIncomingPath(path: TimelineIncomingPath | undefined, fromRowId: string, from: Coordinate, to: Coordinate): boolean {
  const coords = path?.coordinates;
  return Boolean(path?.fromRowId === fromRowId && (path.source === 'drawn' || path.source === 'imported')
    && Array.isArray(coords) && coords.length >= 2 && coords.length <= 50_000
    && coords.every((p) => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1])
      && Math.abs(p[0]) <= 180 && Math.abs(p[1]) <= 90)
    && distanceMeters(coords[0], from) < 1 && distanceMeters(coords[coords.length - 1], to) < 1);
}
