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

/**
 * The part of a track between two distances along it — the geometry an itinerary
 * leg takes when both of its places were picked on that track. Walking backwards
 * along the file (`fromMeters` behind `toMeters`) is a 反穿 and reads as a
 * reversed slice, which is a fact about the trip rather than a guess.
 */
export function trackSliceBetweenMeters(
  measure: TrackMeasure,
  fromMeters: number,
  toMeters: number,
): Coordinate[] | null {
  if (!Number.isFinite(fromMeters) || !Number.isFinite(toMeters)) return null;
  if (Math.abs(toMeters - fromMeters) < 1) return null;
  const a = positionAtDistance(measure, fromMeters);
  const b = positionAtDistance(measure, toMeters);
  const backward = toMeters < fromMeters;
  const start = backward ? b : a;
  const end = backward ? a : b;
  const slice: Coordinate[] = [start.coordinate];
  for (let index = start.trackPointIndex + 1; index <= end.trackPointIndex; index += 1) {
    slice.push(measure.coordinates[index]);
  }
  // A distance that lands on a vertex already put that vertex in the slice;
  // appending the interpolated point again would draw a zero-length step. The
  // comparison needs slack because the cumulative metres are summed floats —
  // a distance asked for as `3 * step` comes back a fraction of a nanometre
  // past the vertex it sits on.
  if (end.trackPointFraction > 1e-6) slice.push(end.coordinate);
  return slice.length >= 2 ? (backward ? slice.reverse() : slice) : null;
}

/**
 * Where a place sits on a track: the nearest point of the line, as a distance
 * along it. Only for places a human chose by tapping the visible line — two
 * valleys a ridge apart can sit metres apart on the map and hundreds of metres
 * apart on the ground, so projecting blind picks the wrong line.
 */
export function projectOnTrack(measure: TrackMeasure, coordinate: Coordinate): TrackPosition | null {
  const points = measure.coordinates;
  if (points.length < 2) return null;
  // Local planar frame in metres: good enough over the few km a tap can span.
  const lngScale = 111320 * Math.cos(toRadians(coordinate[1]));
  const latScale = 110540;
  let best: { meters: number; index: number; fraction: number } | null = null;
  for (let index = 0; index + 1 < points.length; index += 1) {
    const ax = (points[index][0] - coordinate[0]) * lngScale;
    const ay = (points[index][1] - coordinate[1]) * latScale;
    const bx = (points[index + 1][0] - coordinate[0]) * lngScale;
    const by = (points[index + 1][1] - coordinate[1]) * latScale;
    const dx = bx - ax;
    const dy = by - ay;
    const span = dx * dx + dy * dy;
    const t = span > 0 ? Math.max(0, Math.min(1, -((ax * dx + ay * dy)) / span)) : 0;
    const ox = ax + dx * t;
    const oy = ay + dy * t;
    const offset = Math.hypot(ox, oy);
    if (!best || offset < best.meters) best = { meters: offset, index, fraction: t };
  }
  if (!best) return null;
  const { index, fraction } = best;
  return {
    coordinate: interpolate(points[index], points[index + 1], fraction),
    distanceMeters: measure.cumulativeMeters[index]
      + (measure.cumulativeMeters[index + 1] - measure.cumulativeMeters[index]) * fraction,
    trackPointIndex: index,
    trackPointFraction: fraction,
  };
}
