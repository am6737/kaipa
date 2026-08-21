export type TrackCoordinate = [number, number];

export type TrackEndpoint = {
  coordinate: TrackCoordinate;
  distanceMeters: number;
  trackPointIndex: number;
  trackPointFraction: number;
};

const EARTH_RADIUS_METERS = 6_371_000;

function radians(value: number) {
  return value * Math.PI / 180;
}

function segmentDistanceMeters(start: TrackCoordinate, end: TrackCoordinate) {
  const latitudeDelta = radians(end[1] - start[1]);
  const longitudeDelta = radians(end[0] - start[0]);
  const startLatitude = radians(start[1]);
  const endLatitude = radians(end[1]);
  const a = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(startLatitude) * Math.cos(endLatitude) * Math.sin(longitudeDelta / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function normalizeTrackCoordinates(value: unknown): TrackCoordinate[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((coordinate) => {
    if (!Array.isArray(coordinate) || coordinate.length < 2) return [];
    const longitude = Number(coordinate[0]);
    const latitude = Number(coordinate[1]);
    return Number.isFinite(longitude) && Number.isFinite(latitude)
      ? [[longitude, latitude] as TrackCoordinate]
      : [];
  });
}

export function trackLengthMeters(coordinates: TrackCoordinate[]) {
  let total = 0;
  for (let index = 1; index < coordinates.length; index += 1) {
    total += segmentDistanceMeters(coordinates[index - 1], coordinates[index]);
  }
  return total;
}

export function endpointAtDistance(coordinates: TrackCoordinate[], requestedMeters: number): TrackEndpoint {
  if (coordinates.length < 2) throw new Error('当前旅程没有可用于设置终点的轨迹');
  const totalMeters = trackLengthMeters(coordinates);
  if (!Number.isFinite(requestedMeters) || requestedMeters <= 0 || requestedMeters > totalMeters + 1) {
    throw new Error(`终点累计里程必须在 0-${(totalMeters / 1000).toFixed(1)} km 之间`);
  }

  const targetMeters = Math.min(requestedMeters, totalMeters);
  let cumulativeMeters = 0;
  for (let index = 0; index < coordinates.length - 1; index += 1) {
    const start = coordinates[index];
    const end = coordinates[index + 1];
    const segmentMeters = segmentDistanceMeters(start, end);
    if (cumulativeMeters + segmentMeters >= targetMeters || index === coordinates.length - 2) {
      const fraction = segmentMeters > 0
        ? Math.max(0, Math.min(1, (targetMeters - cumulativeMeters) / segmentMeters))
        : 0;
      return {
        coordinate: [
          start[0] + (end[0] - start[0]) * fraction,
          start[1] + (end[1] - start[1]) * fraction,
        ],
        distanceMeters: targetMeters,
        trackPointIndex: index,
        trackPointFraction: fraction,
      };
    }
    cumulativeMeters += segmentMeters;
  }

  throw new Error('无法在轨迹上定位行程终点');
}
