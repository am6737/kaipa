import { assertEquals } from 'jsr:@std/assert';
import { gcj02ToWgs84, wgs84ToGcj02, type Coordinate } from './coordinates.ts';
import {
  DIRECTION_MAX_LEGS,
  DIRECTION_MAX_POINTS,
  downsample,
  parseAmapPolyline,
  parseDirectionLegs,
  planAll,
  type AmapRequest,
  type DirectionRequest,
  clearDirectionCacheForTests,
} from './direction.ts';

// A response copied from the v3 driving shape: one point per road turn, in
// `lng,lat` pairs, GCJ-02.
function amapResponse(polylines: string[]) {
  return {
    status: '1',
    info: 'OK',
    route: {
      origin: '116.434307,39.909376',
      destination: '116.474446,39.90985',
      paths: [{
        distance: '4529',
        duration: '1210',
        steps: polylines.map((polyline, index) => ({ instruction: `第${index + 1}段`, polyline, distance: '1148' })),
      }],
    },
  };
}

function recorder(payload: unknown) {
  const calls: Array<{ path: string; params: URLSearchParams }> = [];
  const amap: AmapRequest = async (path, params) => {
    calls.push({ path, params });
    return payload;
  };
  return { calls, amap };
}

const leg = (overrides: Partial<DirectionRequest> = {}): DirectionRequest => ({
  id: 'a->b',
  mode: 'driving',
  from: [116.434307, 39.909376],
  to: [116.474446, 39.90985],
  ...overrides,
});

Deno.test('the moved coordinate math still round-trips inside China', () => {
  for (const point of [[116.434307, 39.909376], [121.4737, 31.2304], [113.2644, 23.1291]] as Coordinate[]) {
    const [lng, lat] = gcj02ToWgs84(wgs84ToGcj02(point));
    assertEquals(Math.abs(lng - point[0]) < 1e-6, true, `${point} lng drifted`);
    assertEquals(Math.abs(lat - point[1]) < 1e-6, true, `${point} lat drifted`);
  }
  // Outside the shifted region the map vendors agree, so nothing is applied.
  assertEquals(gcj02ToWgs84([139.6917, 35.6895]), [139.6917, 35.6895]);
});

Deno.test('a planned leg joins every step and comes back in WGS-84', async () => {
  clearDirectionCacheForTests();
  const first = '116.433998,39.90933;116.434034,39.909331';
  const second = '116.454041,39.909332;116.454100,39.909400';
  const { calls, amap } = recorder(amapResponse([first, second]));
  const [planned] = await planAll([leg()], amap);

  assertEquals(calls.length, 1);
  assertEquals(calls[0].path, 'direction/driving');
  assertEquals(planned.coordinates?.length, 4);
  // Request coordinates are GCJ-02, response coordinates are back to WGS-84.
  const [originLng, originLat] = calls[0].params.get('origin')!.split(',').map(Number);
  const [expectedLng, expectedLat] = wgs84ToGcj02([116.434307, 39.909376]);
  assertEquals(Math.abs(originLng - expectedLng) < 1e-5, true);
  assertEquals(Math.abs(originLat - expectedLat) < 1e-5, true);
  const [lng, lat] = planned.coordinates![0];
  const [wantLng, wantLat] = gcj02ToWgs84([116.433998, 39.90933]);
  assertEquals(Math.abs(lng - wantLng) < 1e-9, true);
  assertEquals(Math.abs(lat - wantLat) < 1e-9, true);
});

Deno.test('a walking leg asks the walking endpoint', async () => {
  clearDirectionCacheForTests();
  const { calls, amap } = recorder(amapResponse(['116.4,39.9;116.41,39.91']));
  await planAll([leg({ id: 'walk', mode: 'walking', from: [116.4, 39.9], to: [116.41, 39.91] })], amap);
  assertEquals(calls[0].path, 'direction/walking');
});

Deno.test('an unusable plan degrades to null instead of failing the journey', async () => {
  clearDirectionCacheForTests();
  const failing = recorder(amapResponse([]));
  const [empty] = await planAll([leg({ id: 'empty', from: [116.1, 39.1], to: [116.2, 39.2] })], failing.amap);
  assertEquals(empty.coordinates, null);

  const throwing: AmapRequest = async () => {
    throw new Error('AMap USER_DAILY_REACHED');
  };
  const [errored] = await planAll([leg({ id: 'boom', from: [116.3, 39.3], to: [116.4, 39.4] })], throwing);
  assertEquals(errored.coordinates, null);
});

Deno.test('a repeated pair is served from cache and spends no budget', async () => {
  clearDirectionCacheForTests();
  const { calls, amap } = recorder(amapResponse(['116.4,39.9;116.41,39.91;116.42,39.92']));
  const pair = [leg({ id: 'one', from: [116.4, 39.9], to: [116.41, 39.91] })];
  await planAll(pair, amap);
  let spent = 0;
  const again = await planAll(pair, amap, () => {
    spent += 1;
    return true;
  });
  assertEquals(calls.length, 1);
  assertEquals(spent, 0);
  assertEquals(again[0].coordinates?.length, 3);
});

Deno.test('legs beyond the budget still answer, as gaps', async () => {
  clearDirectionCacheForTests();
  const { amap } = recorder(amapResponse(['116.4,39.9;116.41,39.91']));
  const legs = [116.5, 116.6, 116.7, 116.8, 116.9].map((lng, index) => leg({
    id: `leg-${index}`,
    from: [lng, 39.9],
    to: [lng + 0.01, 39.91],
  }));
  let remaining = 2;
  const planned = await planAll(legs, amap, () => remaining-- > 0);
  assertEquals(planned.length, legs.length);
  assertEquals(planned.every((item) => item.coordinates?.length === 2 || item.coordinates === null), true);
  assertEquals(planned.some((item) => item.coordinates === null), true);
});

Deno.test('a long plan is capped but keeps both endpoints', () => {
  const wide = Array.from({ length: 1000 }, (_, index) => `116.${100 + index},39.9`);
  const points = parseAmapPolyline(wide.join(';'));
  assertEquals(points.length, 1000);
  const sampled = downsample(points, DIRECTION_MAX_POINTS);
  assertEquals(sampled.length, DIRECTION_MAX_POINTS);
  assertEquals(sampled[0], points[0]);
  assertEquals(sampled[sampled.length - 1], points[points.length - 1]);
});

Deno.test('malformed input is dropped, oversized batches are capped', () => {
  const good = { id: 'ok', mode: 'driving', from: [116.4, 39.9], to: [116.5, 39.9] };
  const legs = parseDirectionLegs([
    good,
    { id: 'no-from', to: [116.5, 39.9] },
    { id: 'oob', from: [999, 39.9], to: [116.5, 39.9] },
    { id: 'unknown-mode', mode: 'flying', from: [116.6, 39.9], to: [116.7, 39.9] },
    // The cap applies to what the caller sent, before invalid entries are
    // dropped, so the tail of an oversized batch is cut rather than shifted.
    ...Array.from({ length: 40 }, (_, index) => ({ ...good, id: `x-${index}`, from: [116.4 + index / 100, 39.9] })),
  ]);
  assertEquals(legs.length, DIRECTION_MAX_LEGS - 2);
  assertEquals(legs[0].id, 'ok');
  assertEquals(legs[1].id, 'unknown-mode');
  assertEquals(legs[1].mode, 'driving');
  assertEquals(legs.every((item) => item.from.every(Number.isFinite)), true);
  assertEquals(legs.some((item) => item.id === 'no-from' || item.id === 'oob'), false);
  assertEquals(parseDirectionLegs('nope'), []);
});
