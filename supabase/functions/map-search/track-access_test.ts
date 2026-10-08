import { assertEquals } from 'jsr:@std/assert';
import { parseAccessRoad, metersBetween } from './track-access.ts';
import { planAll, clearDirectionCacheForTests, type DirectionRequest } from './direction.ts';
import { wgs84ToGcj02, type Coordinate } from './coordinates.ts';
import fixture from './fixtures/track-access-road.json' with { type: 'json' };
const from: Coordinate = [101.6433518949781, 30.270020839956643];
const to: Coordinate = [101.637548, 30.287811];
const request: DirectionRequest = { id: 'access', mode: 'walking', trackAccess: true, from, to };
const payload = (a: Coordinate, b: Coordinate) => ({ route: { paths: [{ steps: [{ polyline: [a, b].map(p => wgs84ToGcj02(p).join(',')).join(';') }] }] } });
Deno.test('real access road fixture covers both requested locations within the association tolerance', () => {
  const road = parseAccessRoad(fixture, from, to)!;
  assertEquals(road.coordinates.length, 53);
  assertEquals(metersBetween(from, road.actualFrom) < 50, true);
  assertEquals(metersBetween(to, road.actualTo) < 50, true);
  assertEquals(road.distanceMeters > 2000 && road.distanceMeters < 2200, true);
  assertEquals(parseAccessRoad(fixture, from, [101.64, 30.30]), null);
});
Deno.test('a truncated AMap access route falls back to the real road and caches its verified result', async () => {
  clearDirectionCacheForTests();
  let called = 0;
  const router = async () => { called++; return parseAccessRoad(fixture, from, to); };
  const amap = async () => payload(from, [101.639655615, 30.286344227]);
  const [planned] = await planAll([request], amap, () => true, router);
  assertEquals(planned.source, 'osm');
  assertEquals(planned.coordinates?.length, 53);
  await planAll([request], amap, () => true, router);
  assertEquals(called, 1);
});
Deno.test('connected AMap roads and ordinary driving requests do not call the fallback', async () => {
  clearDirectionCacheForTests();
  let called = 0;
  const fallback = async () => { called++; return null; };
  await planAll([request], async () => payload(from, to), () => true, fallback);
  await planAll([{ ...request, trackAccess: false, mode: 'driving' }], async () => payload(from, [101.64, 30.28]), () => true, fallback);
  assertEquals(called, 0);
});
Deno.test('both road sources missing remains unresolved and a timeout remains retryable', async () => {
  clearDirectionCacheForTests();
  const amap = async () => payload(from, [101.639655615, 30.286344227]);
  const [missing] = await planAll([request], amap, () => true, async () => null);
  assertEquals(missing.coordinates, null);
  assertEquals(missing.attempted, true);
  const [timeout] = await planAll([request], amap, () => true, async () => { throw Error('timeout'); });
  assertEquals(timeout.coordinates, null);
  assertEquals(timeout.attempted, false);
});
Deno.test('malformed and remote fallback routes cannot become a connection', () => {
  assertEquals(parseAccessRoad({ features: [{ geometry: { type: 'LineString', coordinates: [from, [NaN, 30], to] } }] }, from, to), null);
  assertEquals(parseAccessRoad(fixture, [100, 30], to), null);
});
