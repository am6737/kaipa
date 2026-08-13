import type { TimelineGroupRoute } from '../data/timeline';

export type Coordinate = [number, number];

export interface TrackMeasure {
  coordinates: Coordinate[];
  cumulativeMeters: number[];
  totalMeters: number;
}

export interface TrackPosition {
  coordinate: Coordinate;
  distanceMeters: number;
  trackPointIndex: number;
  trackPointFraction: number;
  distanceFromTrackMeters?: number;
}

export interface JourneyRouteSegment {
  id: string;
  groupKey: string;
  coordinates: Coordinate[];
  color: string;
  startDistanceMeters: number;
  endDistanceMeters: number;
  active: boolean;
}

export const JOURNEY_SEGMENT_COLORS = [
  '#26B7E8',
  '#FF914D',
  '#6C63F5',
  '#35B779',
  '#E35D9A',
  '#D9A21B',
] as const;

const EARTH_RADIUS_METERS = 6_371_008.8;
const toRadians = (degrees: number) => degrees * Math.PI / 180;

export function distanceMeters(a: Coordinate, b: Coordinate): number {
  const lat1 = toRadians(a[1]);
  const lat2 = toRadians(b[1]);
  const dLat = lat2 - lat1;
  const dLng = toRadians(b[0] - a[0]);
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h = sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLng * sinLng;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function measureTrack(trackCoords?: Coordinate[]): TrackMeasure | null {
  const coordinates = (trackCoords ?? []).filter(
    ([lng, lat]) => Number.isFinite(lng) && Number.isFinite(lat),
  );
  if (coordinates.length < 2) return null;
  const cumulativeMeters = [0];
  for (let index = 1; index < coordinates.length; index += 1) {
    cumulativeMeters.push(cumulativeMeters[index - 1] + distanceMeters(coordinates[index - 1], coordinates[index]));
  }
  return { coordinates, cumulativeMeters, totalMeters: cumulativeMeters[cumulativeMeters.length - 1] };
}

function interpolate(a: Coordinate, b: Coordinate, fraction: number): Coordinate {
  return [
    a[0] + (b[0] - a[0]) * fraction,
    a[1] + (b[1] - a[1]) * fraction,
  ];
}

export function positionAtDistance(measure: TrackMeasure, requestedMeters: number): TrackPosition {
  const distance = Math.max(0, Math.min(requestedMeters, measure.totalMeters));
  if (distance <= 0) {
    return { coordinate: measure.coordinates[0], distanceMeters: 0, trackPointIndex: 0, trackPointFraction: 0 };
  }
  for (let index = 0; index < measure.coordinates.length - 1; index += 1) {
    const start = measure.cumulativeMeters[index];
    const end = measure.cumulativeMeters[index + 1];
    if (distance <= end || index === measure.coordinates.length - 2) {
      const span = Math.max(end - start, 0.0001);
      const fraction = Math.max(0, Math.min(1, (distance - start) / span));
      return {
        coordinate: interpolate(measure.coordinates[index], measure.coordinates[index + 1], fraction),
        distanceMeters: distance,
        trackPointIndex: index,
        trackPointFraction: fraction,
      };
    }
  }
  const lastIndex = measure.coordinates.length - 1;
  return {
    coordinate: measure.coordinates[lastIndex],
    distanceMeters: measure.totalMeters,
    trackPointIndex: Math.max(0, lastIndex - 1),
    trackPointFraction: 1,
  };
}

export function sliceTrackByDistance(measure: TrackMeasure, startMeters: number, endMeters: number): Coordinate[] {
  const start = positionAtDistance(measure, startMeters);
  const end = positionAtDistance(measure, endMeters);
  if (end.distanceMeters <= start.distanceMeters) return [];
  const coordinates: Coordinate[] = [start.coordinate];
  for (let index = start.trackPointIndex + 1; index <= end.trackPointIndex; index += 1) {
    const coordinate = measure.coordinates[index];
    if (coordinate && distanceMeters(coordinates[coordinates.length - 1], coordinate) > 0.01) coordinates.push(coordinate);
  }
  if (distanceMeters(coordinates[coordinates.length - 1], end.coordinate) > 0.01) coordinates.push(end.coordinate);
  return coordinates;
}

export function nearestTrackPosition(measure: TrackMeasure, point: Coordinate): TrackPosition {
  const referenceLat = toRadians(point[1]);
  const metersPerLngDegree = Math.max(1, Math.cos(referenceLat) * 111_320);
  const metersPerLatDegree = 110_574;
  let best: TrackPosition | null = null;
  let bestDistance = Infinity;

  for (let index = 0; index < measure.coordinates.length - 1; index += 1) {
    const a = measure.coordinates[index];
    const b = measure.coordinates[index + 1];
    const ax = (a[0] - point[0]) * metersPerLngDegree;
    const ay = (a[1] - point[1]) * metersPerLatDegree;
    const bx = (b[0] - point[0]) * metersPerLngDegree;
    const by = (b[1] - point[1]) * metersPerLatDegree;
    const dx = bx - ax;
    const dy = by - ay;
    const lengthSquared = dx * dx + dy * dy;
    const fraction = lengthSquared > 0 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / lengthSquared)) : 0;
    const px = ax + dx * fraction;
    const py = ay + dy * fraction;
    const fromTrack = Math.sqrt(px * px + py * py);
    if (fromTrack < bestDistance) {
      const segmentMeters = measure.cumulativeMeters[index + 1] - measure.cumulativeMeters[index];
      bestDistance = fromTrack;
      best = {
        coordinate: interpolate(a, b, fraction),
        distanceMeters: measure.cumulativeMeters[index] + segmentMeters * fraction,
        trackPointIndex: index,
        trackPointFraction: fraction,
        distanceFromTrackMeters: fromTrack,
      };
    }
  }

  return best ?? positionAtDistance(measure, 0);
}

export function buildJourneyRouteSegments(
  measure: TrackMeasure | null,
  groupKeys: string[],
  routes: Record<string, TimelineGroupRoute | undefined>,
  activeGroupKey?: string,
): JourneyRouteSegment[] {
  if (!measure) return [];
  const segments: JourneyRouteSegment[] = [];
  for (let index = 0; index < groupKeys.length; index += 1) {
    const groupKey = groupKeys[index];
    const route = routes[groupKey];
    const previousRoute = index > 0 ? routes[groupKeys[index - 1]] : undefined;
    if (!route || !Number.isFinite(route.endDistanceMeters)) continue;
    if (index > 0 && (!previousRoute || !Number.isFinite(previousRoute.endDistanceMeters))) continue;
    const startMeters = index === 0 ? 0 : Math.max(0, Math.min(previousRoute!.endDistanceMeters, measure.totalMeters));
    const endMeters = Math.max(0, Math.min(route.endDistanceMeters, measure.totalMeters));
    if (endMeters <= startMeters) continue;
    const coordinates = sliceTrackByDistance(measure, startMeters, endMeters);
    if (coordinates.length >= 2) {
      segments.push({
        id: `journey-segment-${index}`,
        groupKey,
        coordinates,
        color: JOURNEY_SEGMENT_COLORS[index % JOURNEY_SEGMENT_COLORS.length],
        startDistanceMeters: startMeters,
        endDistanceMeters: endMeters,
        active: !activeGroupKey || groupKey === activeGroupKey,
      });
    }
  }
  return segments;
}
