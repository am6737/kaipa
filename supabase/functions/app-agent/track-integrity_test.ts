import { buildAgentTrackData, computeTrackStats, snapTrackWaypoints } from './track.ts';
import { endpointAtDistance, trackLengthMeters } from './route-endpoints.ts';

function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }

Deno.test('long winding GPX retains measured length and camp positions after import', () => {
  const points = Array.from({ length: 1202 }, (_, i) => ({ lon: 100 + i * 0.00001, lat: 27 + (i % 2) * 0.0001, ele: 3500 + i % 20, time: null }));
  const stats = computeTrackStats(points)!;
  const saved = buildAgentTrackData(stats);
  assert(saved.trackCoords.length === points.length, 'measurement coordinates must not be sampled');
  assert(saved.trackElevation?.at(-1)?.km === stats.distM / 1000, 'elevation chart must retain the actual finish');
  assert(Math.abs(trackLengthMeters(saved.trackCoords) - stats.distM) < 0.001, 'all measured corners must be retained');
  const camps = snapTrackWaypoints([{ ...points[599], name: 'Camp' }, { ...points[0], name: ' ' }], stats)!;
  assert(camps.length === 1 && camps[0].distanceFromTrackMeters === 0, 'blank markers must not crowd out named camps');
  assert(camps[0].cumulativeAscentMeters! > 0 && camps[0].cumulativeDescentMeters! > 0, 'camp summaries need real effort data');
  const marker = endpointAtDistance(saved.trackCoords, camps[0].km * 1000);
  assert(Math.abs(marker.coordinate[0] - points[599].lon) < 1e-8 && Math.abs(marker.coordinate[1] - points[599].lat) < 1e-8, 'camp distance must locate the actual camp, not a scaled point');
});

Deno.test('missing elevations do not become zero-ascent assurances', () => {
  const points = [{ lon: 100, lat: 27, ele: NaN, time: null }, { lon: 100.1, lat: 27.1, ele: NaN, time: null }];
  const camp = snapTrackWaypoints([{ ...points[1], name: 'Camp' }], computeTrackStats(points)!)![0];
  assert(camp.cumulativeAscentMeters === null && camp.elevationMeters === null, 'unknown effort must remain unknown');
});
