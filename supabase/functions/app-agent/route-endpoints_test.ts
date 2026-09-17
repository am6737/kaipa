import { assertTrackDistanceConsistency, endpointAtDistance, normalizeTrackCoordinates, trackLengthMeters } from './route-endpoints.ts';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

Deno.test('track endpoint resolves cumulative distance to a segment position', () => {
  const coordinates: [number, number][] = [[120, 30], [120.01, 30], [120.02, 30]];
  const total = trackLengthMeters(coordinates);
  const endpoint = endpointAtDistance(coordinates, total * 0.75);
  assert(endpoint.trackPointIndex === 1, 'expected endpoint on second segment');
  assert(Math.abs(endpoint.trackPointFraction - 0.5) < 0.001, 'expected midpoint of second segment');
  assert(Math.abs(endpoint.coordinate[0] - 120.015) < 0.00001, 'expected interpolated longitude');
});

Deno.test('track endpoint accepts the exact track end and rejects out of range values', () => {
  const coordinates: [number, number][] = [[120, 30], [120.01, 30]];
  const total = trackLengthMeters(coordinates);
  const endpoint = endpointAtDistance(coordinates, total);
  assert(endpoint.trackPointIndex === 0 && endpoint.trackPointFraction === 1, 'expected exact track end');
  let rejected = false;
  try { endpointAtDistance(coordinates, total + 10); } catch { rejected = true; }
  assert(rejected, 'expected an out of range endpoint to be rejected');
});

Deno.test('track coordinate normalization removes malformed points', () => {
  const coordinates = normalizeTrackCoordinates([[120, 30], null, ['121', '31'], ['bad', 32]]);
  assert(coordinates.length === 2, 'expected only valid coordinate pairs');
});

Deno.test('legacy sampled distance cannot be used to place new itinerary boundaries', () => {
  let rejected = false;
  try { assertTrackDistanceConsistency(71811, '80.4 km'); } catch { rejected = true; }
  assert(rejected, 'Hatian legacy undercount must block writes');
  assertTrackDistanceConsistency(80374.406, '80.4 km');
  assertTrackDistanceConsistency(851.2, '851 m');
  assertTrackDistanceConsistency(80374.406, null);
});

Deno.test('distance interpolation covers a track without asserting overnight suitability', () => {
  const coordinates: [number, number][] = [[86, 43], [86.2, 43.1], [86.4, 43.3], [86.6, 43.4]];
  const total = trackLengthMeters(coordinates);
  const hours = [10, 10.5, 10, 10, 10.5];
  const totalHours = hours.reduce((sum, value) => sum + value, 0);
  let cumulativeHours = 0;
  let previous = 0;
  let dailySum = 0;
  for (const value of hours) {
    cumulativeHours += value;
    const endpoint = endpointAtDistance(coordinates, total * cumulativeHours / totalHours);
    assert(endpoint.distanceMeters > previous, 'each hiking day must advance on the track');
    assert(endpoint.trackPointFraction >= 0 && endpoint.trackPointFraction <= 1, 'marker must lie on a segment');
    dailySum += endpoint.distanceMeters - previous;
    previous = endpoint.distanceMeters;
  }
  assert(Math.abs(dailySum - total) < 0.001, 'daily distances must cover the actual track length');
});
