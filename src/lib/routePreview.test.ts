// The Expo tsconfig does not include Node declarations; Node runs this file directly:
//   node --experimental-strip-types src/lib/routePreview.test.ts
// @ts-ignore Node built-in module is available at test runtime.
import test from 'node:test';
// @ts-ignore Node built-in module is available at test runtime.
import assert from 'node:assert/strict';
// @ts-ignore Node requires this extension; the Expo tsconfig disallows it.
import { climbValueMeters, directedKm, directedWaypoints, durationParts, elevationAtKm, elevationSummary, estimateDurationMinutes, featuredWaypoints, hasMeasuredElevation, routeDistanceParts, routeGallery, routeSectionIndexAtScroll, routeTripType, seasonRun } from './routePreview.ts';

const UNITS = { hours: '小时', minutes: '分' };

test('Naismith: 13 km with 994 m of ascent reads as 4 h 15 min', () => {
  const minutes = estimateDurationMinutes({ dist: '13.0 km' }, 994);
  assert.equal(minutes, 255);
  assert.deepEqual(durationParts(minutes!, UNITS), { hours: '4', hoursUnit: '小时', minutes: '15', minutesUnit: '分' });
});

test('a recorded duration wins and rounds to the nearest 5 minutes', () => {
  assert.equal(estimateDurationMinutes({ dist: '13.0 km', trackDurationMs: (3 * 3600 + 43 * 60 + 20) * 1000 }, 994), 225);
  assert.equal(estimateDurationMinutes({ dist: '13.0 km', trackDurationMs: 60 * 1000 }, 994), 5);
});

test('no distance means no estimate, and a flat route uses distance only', () => {
  assert.equal(estimateDurationMinutes({ dist: '' }), null);
  assert.equal(estimateDurationMinutes({ dist: '5.0 km' }, undefined), 60);
  assert.equal(durationParts(45, UNITS).hours, undefined);
  assert.equal(durationParts(240, UNITS).minutes, undefined);
});

test('distance labels split into value and unit', () => {
  assert.deepEqual(routeDistanceParts('13.0 km'), { value: '13.0', unit: 'km' });
  assert.deepEqual(routeDistanceParts('6,2 公里'), { value: '6.2', unit: '公里' });
  assert.equal(routeDistanceParts(undefined), null);
  assert.equal(climbValueMeters(994.4), '994');
  assert.equal(climbValueMeters(1234), '1,234');
  assert.equal(climbValueMeters(undefined), null);
});

test('trip type comes from the gap between the track ends', () => {
  const start: [number, number] = [113.5, 23.4];
  assert.equal(routeTripType([start, [start[0] + 0.0005, start[1] + 0.0005]]), 'loop');
  assert.equal(routeTripType([start, [start[0] + 0.05, start[1] + 0.05]]), 'shuttle');
  assert.equal(routeTripType(undefined), null);
});

test('best months cut at the widest gap so a wrapping season stays one run', () => {
  assert.deepEqual(seasonRun([10, 11, 12, 1, 2, 3, 4]), [10, 11, 12, 1, 2, 3, 4]);
  assert.deepEqual(seasonRun([5, 6, 7, 8, 9, 10]), [5, 6, 7, 8, 9, 10]);
  assert.deepEqual(seasonRun([7]), [7]);
  assert.deepEqual(seasonRun([1, 5, 9]), [5, 9, 1]);
  assert.deepEqual(seasonRun(undefined), []);
});

test('the section tab follows the last section past the pinned header', () => {
  const offsets = [0, 300, 520, 900];
  assert.equal(routeSectionIndexAtScroll(offsets, 0, 90), 0);
  assert.equal(routeSectionIndexAtScroll(offsets, 209, 90), 0);
  assert.equal(routeSectionIndexAtScroll(offsets, 210, 90), 1);
  assert.equal(routeSectionIndexAtScroll(offsets, 429, 90), 1);
  assert.equal(routeSectionIndexAtScroll(offsets, 430, 90), 2);
  assert.equal(routeSectionIndexAtScroll(offsets, 810, 90), 3);
  assert.equal(routeSectionIndexAtScroll([], 100, 90), -1);
});

const PROFILE = [
  { km: 0, ele: 200 },
  { km: 2, ele: 400 },
  { km: 5, ele: 100 },
];

test('a profile needs two real samples before it is worth drawing', () => {
  assert.equal(hasMeasuredElevation(PROFILE), true);
  assert.equal(hasMeasuredElevation([{ km: 0, ele: 200 }]), false);
  assert.equal(hasMeasuredElevation(undefined), false);
});

test('height reads straight between samples and clamps at both ends', () => {
  assert.equal(elevationAtKm(PROFILE, 0), 200);
  assert.equal(elevationAtKm(PROFILE, 1), 300);
  assert.equal(elevationAtKm(PROFILE, 3.5), 250);
  assert.equal(elevationAtKm(PROFILE, -2), 200);
  assert.equal(elevationAtKm(PROFILE, 99), 100);
  assert.equal(elevationAtKm(undefined, 3), null);
  assert.equal(elevationAtKm(PROFILE, Number.NaN), null);
});

test('the summary names the two ends and the steepest stretch either way', () => {
  assert.deepEqual(elevationSummary(PROFILE), { maxEle: 400, minEle: 100, maxGrade: 10 });
  assert.equal(elevationSummary(undefined), null);
});

test('walking backwards counts mileage from the recorded finish', () => {
  assert.equal(directedKm(13, 3.4, false), 3.4);
  assert.equal(directedKm(13, 3.4, true), 9.6);
  assert.equal(directedKm(13, 14, true), 0);
});

test('waypoints arrive in walking order and renumber when reversed', () => {
  const forward = directedWaypoints([{ name: '口', km: 0 }, { name: '垭口', km: 3.4 }, { name: '峰', km: 7.6 }], 10, false);
  assert.deepEqual(forward.map((w) => [w.order, w.name, w.alongKm, w.index]), [[1, '口', 0, 0], [2, '垭口', 3.4, 1], [3, '峰', 7.6, 2]]);
  const back = directedWaypoints([{ name: '口', km: 0 }, { name: '垭口', km: 3.4 }, { name: '峰', km: 7.6 }], 10, true);
  assert.deepEqual(back.map((w) => [w.order, w.name, w.alongKm, w.index]), [[1, '峰', 2.4, 2], [2, '垭口', 6.6, 1], [3, '口', 10, 0]]);
  assert.deepEqual(directedWaypoints(undefined, 10, false), []);
});

const GALLERY_ROUTE = {
  dist: '10.0 km',
  photoUris: ['/cover.jpg', '/shared.jpg'],
  trackWaypoints: [
    { name: '峰', km: 7.6, photo: '/shared.jpg', highlight: true as const },
    { name: '垭口', km: 3.4, photo: '/pass.jpg' },
    { name: '口', km: 0 },
  ],
};

test('the gallery walks the waypoint shots first, then the route pictures, once each', () => {
  assert.deepEqual(routeGallery(GALLERY_ROUTE, false, 10), [
    { uri: '/pass.jpg', waypointIndex: 1, name: '垭口', km: 3.4 },
    { uri: '/shared.jpg', waypointIndex: 0, name: '峰', km: 7.6 },
    { uri: '/cover.jpg' },
  ]);
  // Reversed: walking order and mileage both count from the recorded finish,
  // and a shot keeps the waypoint it was taken at.
  assert.deepEqual(routeGallery(GALLERY_ROUTE, true, 10), [
    { uri: '/shared.jpg', waypointIndex: 0, name: '峰', km: 2.4 },
    { uri: '/pass.jpg', waypointIndex: 1, name: '垭口', km: 6.6 },
    { uri: '/cover.jpg' },
  ]);
  assert.deepEqual(routeGallery(GALLERY_ROUTE, true).map((photo) => photo.km), [2.4, 6.6, undefined]);
  assert.deepEqual(routeGallery({ dist: '10.0 km', photoUris: ['/a.jpg', '', '/a.jpg'] }, false), [{ uri: '/a.jpg' }]);
  assert.deepEqual(routeGallery({ dist: '', trackWaypoints: [{ name: '口', km: 1 }] }, false), []);
});

test('highlights narrow the list, and a route without any keeps every waypoint', () => {
  assert.deepEqual(featuredWaypoints(GALLERY_ROUTE.trackWaypoints).map((w) => w.name), ['峰']);
  assert.deepEqual(featuredWaypoints([{ name: '口' }, { name: '湖' }]).map((w) => w.name), ['口', '湖']);
});
