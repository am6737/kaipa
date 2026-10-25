// The Expo tsconfig does not include Node declarations; Node 24 runs this file directly.
// @ts-ignore Node built-in module is available at test runtime.
import test from 'node:test';
// @ts-ignore Node built-in module is available at test runtime.
import assert from 'node:assert/strict';
// @ts-ignore Node built-in module is available at test runtime.
import { readFileSync } from 'node:fs';
// @ts-ignore Node requires this extension; the Expo tsconfig disallows it.
import { checkItinerary, countIssues } from './itineraryCheck.ts';
import type { ImportedDay, ImportedItinerary } from './itineraryCheck.ts';

const gennie = JSON.parse(readFileSync(new URL('../../data/route-itineraries/trk014.json', import.meta.url), 'utf8')).plans[0].payload;
const today = new Date(2027, 4, 1);

function day(patch: Partial<ImportedDay>): ImportedDay {
  return { title: '', date: null, kind: 'hike', distanceKm: null, ascentM: null, descentM: null, stay: '营地', sleepAltitudeM: null, items: [], ...patch };
}
function plan(days: ImportedDay[], patch: Partial<ImportedItinerary> = {}): ImportedItinerary {
  return { name: '测试', routeId: null, startDate: days[0]?.date ?? null, days, unreadable: [], ...patch };
}
const codes = (itinerary: ImportedItinerary, context = {}) => checkItinerary(itinerary, { today, ...context }).map((issue) => issue.code);

test('a sound plan has no issues', () => {
  const sound = plan([
    day({ date: '2027-06-19', kind: 'access' }),
    day({ date: '2027-06-20', distanceKm: 13, ascentM: 1200 }),
    day({ date: '2027-06-21', distanceKm: 17 }),
    day({ date: '2027-06-22', distanceKm: 2, stay: null }),
  ]);
  assert.deepEqual(codes(sound, { official: gennie, routeBestMonths: [6, 7] }), []);
});

test('broken dates and a past start are reported', () => {
  const result = codes(plan([day({ date: '2027-04-01' }), day({ date: '2027-04-03' }), day({ date: '2027-04-03', stay: null })]));
  assert.deepEqual(result, ['datesBroken', 'datesBroken', 'startInPast']);
});

test('day load is graded against fixed limits', () => {
  const result = checkItinerary(plan([day({ distanceKm: 24 }), day({ ascentM: 2000, stay: null })]), { today });
  assert.deepEqual(result.map((issue) => [issue.code, issue.day]), [['dayTooLong', 2], ['dayLong', 1]]);
});

test('sleeping altitude rising more than 500 m above 3000 m is flagged', () => {
  const result = codes(plan([day({ sleepAltitudeM: 3400 }), day({ sleepAltitudeM: 4100 }), day({ sleepAltitudeM: 4300, stay: null })]));
  assert.deepEqual(result, ['sleepAltitudeJump']);
});

test('overlapping times, missing stays and a long streak are reported', () => {
  const days = [
    day({ items: [{ title: '出发', kind: 'activity', timeStart: '08:00', timeEnd: '12:00' }, { title: '午饭', kind: 'activity', timeStart: '11:00', timeEnd: null }] }),
    ...Array.from({ length: 5 }, () => day({ stay: null })),
  ];
  const result = codes(plan(days));
  assert.equal(result[0], 'timeOverlap');
  assert.equal(result.filter((code) => code === 'missingStay').length, 4);
  assert.ok(result.includes('noRestDay'));
});

test('compressing the official plan is serious, a harder day is a warning', () => {
  const squeezed = plan([day({ distanceKm: 30 }), day({ distanceKm: 2, stay: null })]);
  const result = checkItinerary(squeezed, { today, official: gennie });
  assert.equal(result[0].code, 'fewerDaysThanOfficial');
  assert.deepEqual(result[0].vars, { mine: 2, official: 3, plan: gennie.name });
  assert.ok(result.some((issue) => issue.code === 'harderThanOfficial' && issue.day === 1));
});

test('season falls back to the route months', () => {
  assert.deepEqual(codes(plan([day({ date: '2027-12-01', stay: null })]), { routeBestMonths: [6, 7, 8] }), ['offSeason']);
});

test('issues are ordered by severity and counted', () => {
  const issues = checkItinerary(plan([day({ distanceKm: 40, stay: null })], { unreadable: ['第二张图模糊'], startDate: '2027-01-01' }), { today });
  assert.deepEqual(issues.map((issue) => issue.severity), ['serious', 'warning', 'info']);
  assert.deepEqual(countIssues(issues), { serious: 1, warning: 1, info: 1 });
});
