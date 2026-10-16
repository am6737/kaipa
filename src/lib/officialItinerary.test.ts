// The Expo tsconfig does not include Node declarations; Node 24 runs this file directly.
// @ts-ignore Node built-in module is available at test runtime.
import test from 'node:test';
// @ts-ignore Node built-in module is available at test runtime.
import assert from 'node:assert/strict';
// @ts-ignore Node built-in module is available at test runtime.
import { readFileSync } from 'node:fs';
// @ts-ignore Node requires this extension; the Expo tsconfig disallows it.
import { assembleItinerary, fromPublishedRow, sortItineraries } from './officialItinerary.ts';
import type { PublishedItinerary } from './officialItinerary.ts';

function fixture(routeId: string): PublishedItinerary {
  const data = JSON.parse(readFileSync(new URL(`../../data/route-itineraries/${routeId}.json`, import.meta.url), 'utf8'));
  const plan = data.plans[0];
  return { id: plan.id, version: 1, routeId, isDefault: plan.isDefault, payload: plan.payload, verifiedOn: '2026-06-01' };
}

const route014 = { name: '格聂牧场线', bestMonths: [5, 6, 7, 8, 9, 10], seasonNote: '6～7 月花海最佳' };

test('included access day preserves official fields and spans June 19 to 22', () => {
  const plan = fixture('trk014');
  const result = assembleItinerary(plan, route014, { trekStartDate: '2026-06-20', includeAccess: true });
  assert.equal(result.days.length, 4);
  assert.deepEqual(result.days.map(day => day.dateLabel), ['6/19', '6/20', '6/21', '6/22']);
  assert.equal(result.header.dateLine, '6 月 19 日至 6 月 22 日');
  assert.equal(result.header.countsLine, '徒步 3 天，另含进山 1 天');
  assert.equal(result.transportNote, '往返理塘的交通不在方案内');
  assert.equal(result.plannedDate, '2026-06-19');
  assert.equal(result.accessToggle?.label, '包含进山日');
  for (const [index, day] of result.days.entries()) {
    const official = plan.payload.days[index];
    for (const field of ['title', 'stay', 'tip', 'distanceKm', 'ascentM', 'descentM', 'duration', 'transfers', 'supply', 'bailout']) {
      assert.deepEqual(day[field as keyof typeof day], official[field as keyof typeof official], field);
    }
  }
  assert.equal(result.sourceLabel, 'Kaipa 官方方案第 1 版，核实于 2026 年 6 月 1 日');
});

test('removing access day retains hike dates and the final return transfer', () => {
  const result = assembleItinerary(fixture('trk014'), route014, { trekStartDate: '2026-06-20', includeAccess: false });
  assert.equal(result.days.length, 3);
  assert.deepEqual(result.days.map(day => day.dateLabel), ['6/20', '6/21', '6/22']);
  assert.deepEqual(result.days.map(day => day.dayNumber), [1, 2, 3]);
  assert.equal(result.transportNote, '前往下则通村、从理塘返回的交通不在方案内');
  assert.equal(result.days[2].transfers.at(-1)?.to, '理塘');
  assert.equal(result.header.countsLine, '徒步 3 天');
});

test('disjoint recommended months and placeholder season note', () => {
  const result = assembleItinerary(fixture('trk066'), {
    name: '亚丁大转山', bestMonths: [5, 6, 9, 10], seasonNote: '出发前请核实当季开放、天气与通行条件。',
  }, { trekStartDate: '2026-07-12', includeAccess: true });
  assert.equal(result.season?.inRecommendedMonths, false);
  assert.equal(result.season?.monthsLabel, '5～6 月、9～10 月');
  assert.equal(result.season?.line, '7 月不在推荐月份（5～6 月、9～10 月）内');
  assert.equal(result.season?.seasonNote, null);
});

test('single-day itinerary and undated itinerary', () => {
  const plan = fixture('trk008');
  const route = { name: '党岭三湖连穿', bestMonths: null, seasonNote: null };
  assert.equal(assembleItinerary(plan, route, { trekStartDate: '2026-10-01', includeAccess: true }).days.length, 1);
  const undated = assembleItinerary(fixture('trk014'), route014, { trekStartDate: null, includeAccess: true });
  assert.equal(undated.header.dateLine, '日期待定');
  assert.equal(undated.startDate, null);
  assert.equal(undated.endDate, null);
  assert.equal(undated.plannedDate, null);
  assert.equal(undated.season, null);
  assert.ok(undated.days.every(day => day.date === null && day.dateLabel === null));
});

test('default plan sorts first and RPC row maps to camelCase', () => {
  const first = fixture('trk066');
  const second = { ...first, id: 'another-plan', isDefault: false, payload: { ...first.payload, name: '另一方案' } };
  assert.deepEqual(sortItineraries([second, first]), [first, second]);
  assert.deepEqual(fromPublishedRow({
    id: first.id, version: first.version, route_id: first.routeId,
    is_default: first.isDefault, payload: first.payload, verified_on: first.verifiedOn,
  }), first);
});

test('UTC calendar arithmetic crosses month and year boundaries', () => {
  const result = assembleItinerary(fixture('trk014'), route014, { trekStartDate: '2027-01-01', includeAccess: true });
  assert.equal(result.plannedDate, '2026-12-31');
  assert.deepEqual(result.days.map(day => day.date), ['2026-12-31', '2027-01-01', '2027-01-02', '2027-01-03']);
  const month = assembleItinerary(fixture('trk014'), route014, { trekStartDate: '2027-03-01', includeAccess: true });
  assert.equal(month.plannedDate, '2027-02-28');
});
