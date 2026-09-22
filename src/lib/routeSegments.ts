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
}

export const JOURNEY_SEGMENT_COLORS = [
  '#26B7E8',
  '#FF914D',
  '#6C63F5',
  '#35B779',
  '#E35D9A',
  '#D9A21B',
] as const;

// Match GPX ingestion and the Edge Function's route-distance calculation.
const EARTH_RADIUS_METERS = 6_371_000;
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

const measuredTracks = new WeakMap<Coordinate[], TrackMeasure>();

export function measureTrack(trackCoords?: Coordinate[]): TrackMeasure | null {
  if (!trackCoords) return null;
  const cached = measuredTracks.get(trackCoords);
  if (cached) return cached;
  const coordinates = trackCoords.filter(
    ([lng, lat]) => Number.isFinite(lng) && Number.isFinite(lat),
  );
  if (coordinates.length < 2) return null;
  const cumulativeMeters = [0];
  for (let index = 1; index < coordinates.length; index += 1) {
    cumulativeMeters.push(cumulativeMeters[index - 1] + distanceMeters(coordinates[index - 1], coordinates[index]));
  }
  const measure = { coordinates, cumulativeMeters, totalMeters: cumulativeMeters[cumulativeMeters.length - 1] };
  // Opening a journey measures the same track from several places (the map
  // framing, the day segments, the distance labels), and a full GPS track is
  // tens of thousands of haversine calls per pass.
  measuredTracks.set(trackCoords, measure);
  return measure;
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
  // cumulativeMeters is sorted, so the segment that holds `distance` is a
  // lower-bound search. The scan made every distance label cost a full pass
  // over the track, and the map draws up to 60 of them per route.
  let low = 0;
  let high = measure.coordinates.length - 2;
  while (low < high) {
    const mid = (low + high) >> 1;
    if (measure.cumulativeMeters[mid + 1] >= distance) high = mid;
    else low = mid + 1;
  }
  const index = low;
  const start = measure.cumulativeMeters[index];
  const end = measure.cumulativeMeters[index + 1];
  const span = Math.max(end - start, 0.0001);
  const fraction = Math.max(0, Math.min(1, (distance - start) / span));
  return {
    coordinate: interpolate(measure.coordinates[index], measure.coordinates[index + 1], fraction),
    distanceMeters: distance,
    trackPointIndex: index,
    trackPointFraction: fraction,
  };
}
