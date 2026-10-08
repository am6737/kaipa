import { itineraryItem } from './tools.ts';
import { carryDailyStarts, expandItineraryLocations } from './itinerary-locations.ts';
import { addTrackDayLocations } from './itinerary-track-locations.ts';
import { planDocumentSchema } from './plan-document.ts';
import { providerItinerary } from './main-transport.ts';

function assert(value: unknown): asserts value { if (!value) throw new Error('Assertion failed'); }

Deno.test('local transfer expands into two separate places and next day repeats the overnight place', () => {
  const items = [itineraryItem.parse({ day: 'Day 1', title: '成都东到丹巴接驳', startLocation: { name: '成都东' }, location: { name: '丹巴县城' } }),
    itineraryItem.parse({ day: 'Day 2', title: '丹巴到党岭村接驳', location: { name: '党岭村' } })];
  const expanded = carryDailyStarts(items);
  assert(expanded.map(item => item.location?.name).join(',') === '成都东,丹巴县城,丹巴县城,党岭村');
  assert(JSON.stringify(carryDailyStarts(expanded)) === JSON.stringify(expanded));
  assert(expandItineraryLocations(items).length === 3);
  assert(carryDailyStarts([items[0], { ...items[1], day: 'Day 3' }]).length === 3);
});

Deno.test('overnight train arrival belongs to the actual next day and retains both stations', () => {
  const rows = providerItinerary({ direction: 'outbound', mode: 'rail', origin: '南宁东', destination: '成都东', departureDate: '2026-10-09', earliestHour: null },
    { available: true, status: 'results', offers: [{ from: '南宁东', to: '成都东', trainNumber: 'D1', departure: '2026-10-09T20:00:00+08:00', arrival: '2026-10-10T07:30:00+08:00', seats: [{ availability: '有' }] }] }, '2026-10-09');
  assert(rows.length === 2 && rows[0].location?.name === '南宁东' && rows[1].location?.name === '成都东');
  assert(rows[1].day === 'Day 2' && rows[1].timeStart === '07:30' && rows[1].location?.incomingMode === 'rail');
});

Deno.test('GPX day locations use real coordinates and consecutive distances for the map', () => {
  const plan = planDocumentSchema.parse({ itineraryItems: [
    { day: 'Day 1', title: '第一天徒步', kind: 'activity', routeId: 'r' },
    { day: 'Day 2', title: '第二天徒步', kind: 'activity', routeId: 'r' },
  ], endpoints: [{ day: 'Day 1', routeId: 'r', waypointIndex: 0 }, { day: 'Day 2', routeId: 'r', trackFinish: true }] });
  addTrackDayLocations(plan, new Map([['r', { id: 'r', name: '路线', coordinates: [[100, 30], [100, 30.01], [100, 30.02]], waypoints: [{ name: '营地', km: 1 }] }]]));
  const locations = plan.itineraryItems.flatMap(item => item.location ? [item.location] : []);
  assert(locations.length === 4 && locations[1].name === '营地' && locations[2].name === '营地');
  assert(locations[1].longitude === locations[2].longitude && locations[1].latitude === locations[2].latitude);
  assert(locations[0].trackMeters === 0 && locations[1].trackMeters === 1000);
  assert(locations.every(location => location.trackId === 'r' && location.longitude != null));
  const before = JSON.stringify(plan.itineraryItems);
  addTrackDayLocations(plan, new Map([['r', { id: 'r', name: '路线', coordinates: [[100, 30], [100, 30.01], [100, 30.02]], waypoints: [{ name: '营地', km: 1 }] }]]));
  assert(JSON.stringify(plan.itineraryItems) === before);
});

Deno.test('generic city lodging does not add route stops or leak into the next day', () => {
  const rows = [
    itineraryItem.parse({ day: 'Day 1', title: '南宁东', location: { name: '南宁东' } }),
    itineraryItem.parse({ day: 'Day 1', title: '成都东', location: { name: '成都东' } }),
    itineraryItem.parse({ day: 'Day 1', title: '成都住宿', kind: 'stay', location: { name: '成都' } }),
    itineraryItem.parse({ day: 'Day 1', title: '入住成都住宿', kind: 'stay', location: { name: '成都住宿' } }),
    itineraryItem.parse({ day: 'Day 2', title: '前往党岭村', startLocation: { name: '成都住宿' }, location: { name: '党岭村' } }),
  ];
  const result = carryDailyStarts(rows);
  assert(result.map(item => item.location?.name).join(',') === '南宁东,成都东,成都东,党岭村');
  assert(JSON.stringify(carryDailyStarts(result)) === JSON.stringify(result));
});

Deno.test('named hotels and measured hiking overnight places remain concrete stops', () => {
  const rows = [
    itineraryItem.parse({ day: 'Day 1', title: '成都住宿', kind: 'stay', location: { name: '成都天府丽都喜来登饭店' } }),
    itineraryItem.parse({ day: 'Day 2', title: '飞机坪住宿', kind: 'stay', location: { name: '飞机坪住宿', trackId: 'r', trackMeters: 3000 } }),
  ];
  assert(expandItineraryLocations(rows).length === 2);
});
