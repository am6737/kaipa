import { officialDayEnd, officialStopKms } from './official-stops.ts';
import { geometryMeters, rangeMetrics, routeTrackFacts } from './track-metrics.ts';

function assert(value: unknown, message: string) { if (!value) throw new Error(message); }

const id = '11111111-1111-4111-8111-111111111111';
const rows = [{ id, version: 2, payload: { days: [
  { kind: 'hike', stops: [{ name: '马武寨', km: 0 }, { name: '张沟', km: 27.717 }] },
  { kind: 'hike', stops: [{ name: '张沟', km: 27.717 }, { name: '韩口', km: 46.135 }] },
  { kind: 'rest', stops: [{ name: '张沟', km: 27.717 }] },
] } }, { id: '22222222-2222-4222-8222-222222222222', version: 1, payload: { days: [
  { kind: 'hike', stops: [{ name: '韩口', km: 0 }, { name: '张沟', km: 15.559 }] },
] } }];

Deno.test('a walking day ends at its plan version\'s last stop', () => {
  assert(officialDayEnd(rows, { itineraryId: id, version: 2, dayIndex: 1 })?.name === '韩口', 'day 2 ends at 韩口');
  assert(officialDayEnd(rows, { itineraryId: id, version: 1, dayIndex: 1 }) === null, 'another version is not this plan');
  assert(officialDayEnd(rows, { itineraryId: id, version: 2, dayIndex: 2 }) === null, 'a rest day has no walking end');
});

Deno.test('a stop name placed at two km is not used to anchor', () => {
  const kms = officialStopKms(rows);
  assert(kms.get('马武寨') === 0, 'a consistent stop keeps its km');
  assert(!kms.has('张沟') && !kms.has('韩口'), 'stops at different km across plans are left out');
});

Deno.test('day metrics come from the recorded climb and the profile', () => {
  const track = routeTrackFacts([{ km: 0, ele: 1000 }, { km: 10, ele: 1300 }, { km: 20, ele: 900 }],
    [{ name: 'A', km: 10, cumulativeAscentMeters: 420 }, { name: 'B', km: 20, cumulativeAscentMeters: 600 }])!;
  const day = rangeMetrics(track, 10, 20);
  assert(day.distanceKm === 10 && day.ascentM === 180 && day.descentM === 580, JSON.stringify(day));
  const raw = rangeMetrics(routeTrackFacts([{ km: 0, ele: 1000 }, { km: 10, ele: 1300 }, { km: 20, ele: 900 }], [])!, 0, 20);
  assert(raw.ascentM === 300 && raw.descentM === 400, `the profile is the fallback, got ${JSON.stringify(raw)}`);
  assert(geometryMeters(23, 46, 41_800) === 20_900 && geometryMeters(50, 46, 41_800) === 41_800, 'stated km map onto the stored line by share');
});
