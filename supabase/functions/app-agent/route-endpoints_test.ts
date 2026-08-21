import { endpointAtDistance, normalizeTrackCoordinates, trackLengthMeters } from './route-endpoints.ts';

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
