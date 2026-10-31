// The Expo tsconfig does not include Node declarations; Node runs this file directly:
//   node --experimental-strip-types src/lib/journeyStops.test.ts
// @ts-ignore Node built-in module is available at test runtime.
import test from 'node:test';
// @ts-ignore Node built-in module is available at test runtime.
import assert from 'node:assert/strict';
// @ts-ignore Node built-in module is available at test runtime.
import { register } from 'node:module';
// @ts-ignore Node requires this extension; the Expo tsconfig disallows it.
import { distanceMeters, measureTrack, positionAtDistance, projectOnTrack, type Coordinate, type TrackMeasure } from './routeSegments.ts';
// @ts-ignore Node requires this extension; the Expo tsconfig disallows it.
import type { TLRow } from '../data/timeline.ts';

// Expo sources import one another without a file extension, which ESM will not
// resolve. The chain under test is pure — no React Native in it — so this only
// teaches the resolver the extension the app's bundler already infers.
register('data:text/javascript,' + encodeURIComponent([
  'export async function resolve(specifier, context, nextResolve) {',
  '  if (specifier.startsWith(".") && !/\\.(ts|tsx|js|mjs|cjs|json)$/.test(specifier)) return nextResolve(specifier + ".ts", context);',
  '  return nextResolve(specifier, context);',
  '}',
].join('\n')), import.meta.url);

// @ts-ignore Node resolves the extension; the Expo tsconfig disallows it in a path.
const { buildJourneyLegs, buildJourneyStops, composeJourneyLegGeometry, measureJourneyDays } = await import('./journeyStops.ts');

const STATION = '新乡东';
const SPACING = 35; // metres between two track points, like a GPS trace
// Local planar frame in kilometres with the station at the origin, so the
// distances the assertions quote are the distances the journey really has.
const BASE_LAT = 35.6416;
const BASE_LNG = 113.4917;
const KM_PER_DEGREE_LAT = 110.54;
const KM_PER_DEGREE_LNG = 111.32 * Math.cos(BASE_LAT * Math.PI / 180);
const toCoordinate = ([x, y]: [number, number]): Coordinate => [BASE_LNG + x / KM_PER_DEGREE_LNG, BASE_LAT + y / KM_PER_DEGREE_LAT];
const ORIGIN: Coordinate = [BASE_LNG, BASE_LAT];

/** ~35 m of track between two points of the local frame. */
function run(from: [number, number], to: [number, number], skipFirst = false): Coordinate[] {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const count = Math.max(2, Math.round(Math.hypot(dx, dy) * 1000 / SPACING) + 1);
  const points: Coordinate[] = [];
  for (let index = skipFirst ? 1 : 0; index < count; index += 1) {
    points.push(toCoordinate([from[0] + dx * index / (count - 1), from[1] + dy * index / (count - 1)]));
  }
  return points;
}

/** The 南太行 shape: a ~47 km line that swings past the station, so both of its
 *  ends sit some 50 km away while its nearest point lies three quarters along it.
 *  Projecting the station off that line lands in the middle of the trail.
 *  The radius is a parabola around the station whose minimum, 46.8 km, sits at
 *  angle 0.2 — some 73% of the way from -0.44 to +0.44. */
function arcTrack(): Coordinate[] {
  const points: Coordinate[] = [];
  const step = 0.88 / 1370;
  for (let angle = -0.44; angle <= 0.44 + 1e-12; angle += step) {
    const radius = 46.8 + 30 * (angle - 0.2) ** 2;
    points.push(toCoordinate([radius * Math.sin(angle), radius * Math.cos(angle)]));
  }
  return points;
}

const TRACK = arcTrack();
const MEASURE = measureTrack(TRACK)!;
const TOTAL = MEASURE.totalMeters;
const TRACK_START = MEASURE.coordinates[0];
const TRACK_END = MEASURE.coordinates[MEASURE.coordinates.length - 1];

function onTrackRow(name: string, day: string, meters: number, measure = MEASURE, trackId = 't1'): TLRow {
  const coordinate = positionAtDistance(measure, meters).coordinate;
  return {
    id: `${day}-${name}-${meters}`, title: name, day,
    location: { name, longitude: coordinate[0], latitude: coordinate[1], source: 'track', trackId, trackMeters: meters, trackLengthMeters: measure.totalMeters },
  };
}
function mapRow(name: string, day: string, coordinate: Coordinate, extra: Partial<TLRow['location']> = {}): TLRow {
  return { id: `${day}-${name}-${coordinate[0]}`, title: name, day, location: { name, longitude: coordinate[0], latitude: coordinate[1], source: 'map', ...extra } };
}
function legsFor(rows: TLRow[], resolveTrack: (trackId: string) => Coordinate[] | undefined = (id) => (id === 't1' ? TRACK : undefined)) {
  const stops = buildJourneyStops(rows, [...new Set(rows.map((row) => row.day))]);
  return buildJourneyLegs(stops, resolveTrack);
}
/** Which way along its line a recorded piece runs, and how long it is. */
function sliceAlong(measure: TrackMeasure, coordinates: Coordinate[] | undefined) {
  if (!coordinates) return null;
  const from = projectOnTrack(measure, coordinates[0])!.distanceMeters;
  const to = projectOnTrack(measure, coordinates[coordinates.length - 1])!.distanceMeters;
  return { backwards: to < from, meters: measureTrack(coordinates)!.totalMeters };
}

test('the fixture keeps the shape that broke: the station projects into the middle of the track', () => {
  const projected = projectOnTrack(MEASURE, ORIGIN)!;
  assert.ok(distanceMeters(projected.coordinate, ORIGIN) > 2_000, 'the station is nowhere near the line');
  assert.ok(projected.distanceMeters > 100 && TOTAL - projected.distanceMeters > 100,
    `expected an interior projection, got ${projected.distanceMeters} of ${TOTAL}`);
  assert.ok(distanceMeters(TRACK_START, ORIGIN) > 40_000 && distanceMeters(TRACK_END, ORIGIN) > 40_000);
});

test('a car transfer to the trailhead the day starts at is a road leg, not a pending track', () => {
  const leg = legsFor([mapRow(STATION, 'Day 2', ORIGIN), onTrackRow('马武寨', 'Day 2', 0)])[0];
  assert.equal(leg.pendingTrack, false, 'the entrance is settled, so the map can draw it');
  assert.equal(leg.trackBridge, true);
  assert.equal(leg.mode, 'driving', '59 km of mountain road is not a walk');
  assert.deepEqual(leg.directionTo, TRACK_START, 'the bridge reaches the place itself, not a guessed projection');
  assert.deepEqual(leg.directionFrom, ORIGIN);
  assert.equal(leg.recordedSuffix, undefined, 'an entrance at the place leaves no track to walk');
  assert.equal(leg.recordedPrefix, undefined);
});

test('leaving by the far trailhead bridges from there', () => {
  const leg = legsFor([onTrackRow('韩口', 'Day 3', TOTAL), mapRow(STATION, 'Day 3', ORIGIN)])[0];
  assert.equal(leg.pendingTrack, false);
  assert.equal(leg.trackBridge, true);
  assert.equal(leg.mode, 'driving');
  assert.deepEqual(leg.directionFrom, TRACK_END);
  assert.deepEqual(leg.directionTo, ORIGIN);
  assert.equal(leg.recordedPrefix, undefined);
  assert.equal(leg.recordedSuffix, undefined);
});

test('a transfer row that says so asks for a road even close to the trail', () => {
  const dropOff: Coordinate = [TRACK_START[0], TRACK_START[1] - 1 / KM_PER_DEGREE_LAT];
  const dropMeters = distanceMeters(dropOff, TRACK_START);
  assert.ok(dropMeters > 800 && dropMeters < 1_500, `expected a kilometre drop-off, got ${dropMeters}`);
  const marked = legsFor([onTrackRow('马武寨', 'Day 2', 0), mapRow(STATION, 'Day 2', dropOff, { incomingMode: 'road' })])[0];
  assert.equal(marked.mode, 'driving');
  assert.equal(marked.trackBridge, true);
  assert.deepEqual(marked.directionFrom, TRACK_START);
  const unmarked = legsFor([onTrackRow('马武寨', 'Day 2', 0), mapRow(STATION, 'Day 2', dropOff)])[0];
  assert.equal(unmarked.mode, 'walking', 'a kilometre off the trail is still walked');
});

test('a road arrival is read off the trailhead row on the way in', () => {
  const pickUp: Coordinate = [TRACK_START[0], TRACK_START[1] - 1 / KM_PER_DEGREE_LAT];
  const trailhead = onTrackRow('马武寨', 'Day 2', 0);
  const marked = { ...trailhead, location: { ...trailhead.location!, incomingMode: 'road' as const } };
  const leg = legsFor([mapRow('村口', 'Day 2', pickUp), marked])[0];
  assert.equal(leg.mode, 'driving');
  assert.deepEqual(leg.directionTo, TRACK_START);
  const onFoot = legsFor([mapRow('村口', 'Day 2', pickUp), trailhead])[0];
  assert.equal(onFoot.mode, 'walking');
});

test('a day between places on the line still walks that line', () => {
  const legs = legsFor([onTrackRow('抱犊村', 'Day 2', 6_455), onTrackRow('西莲', 'Day 2', 16_507), onTrackRow('张沟', 'Day 2', 25_139)]);
  assert.equal(legs.length, 2);
  legs.forEach((leg: any, index: number) => {
    assert.equal(leg.mode, 'walking');
    assert.equal(leg.pendingTrack, false);
    assert.equal(leg.trackBridge, undefined);
    const along = sliceAlong(MEASURE, leg.recordedGeometry);
    assert.ok(along && !along.backwards, 'expected a forward recorded slice');
    assert.ok(Math.abs(along!.meters - [16_507 - 6_455, 25_139 - 16_507][index]!) < 1, `unexpected ${along!.meters}`);
  });
});

test('a village beside the trail is still reached along the recorded track', () => {
  const straight = run([0, 1], [0, 13]);
  const straightMeasure = measureTrack(straight)!;
  const beside = positionAtDistance(straightMeasure, 3_000).coordinate;
  const village: Coordinate = [beside[0] + 30 / (KM_PER_DEGREE_LNG * 1000), beside[1]]; // ~30 m east of the line
  assert.ok(Math.abs(distanceMeters(village, beside) - 30) < 3);
  const rows = [mapRow('客栈', 'Day 2', village), onTrackRow('营地', 'Day 2', 6_000, straightMeasure, 't2')];
  const leg = legsFor(rows, (id) => (id === 't2' ? straight : undefined))[0];
  assert.equal(leg.trackBridge, undefined, 'a place on the line needs no road bridge');
  assert.equal(leg.pendingTrack, false);
  assert.equal(leg.mode, 'walking');
  const along = sliceAlong(straightMeasure, leg.recordedGeometry)!;
  assert.equal(along.backwards, false);
  assert.ok(Math.abs(along.meters - 3_000) < 1, `unexpected ${along.meters}`);
});

test('the journey chain carries its recorded track and no backwards slice', () => {
  const rows = [
    mapRow(STATION, 'Day 2', ORIGIN),
    onTrackRow('马武寨', 'Day 2', 0),
    onTrackRow('抱犊村', 'Day 2', 6_455),
    onTrackRow('西莲', 'Day 2', 16_507),
    onTrackRow('张沟', 'Day 2', 25_139),
    onTrackRow('张沟', 'Day 3', 25_139),
    onTrackRow('滴水寨', 'Day 3', 40_102),
    onTrackRow('韩口', 'Day 3', TOTAL),
    mapRow(STATION, 'Day 3', ORIGIN),
  ];
  const legs = legsFor(rows);
  assert.equal(legs.length, 7, 'the chain stops at the day boundary');
  legs.forEach((leg: any) => {
    for (const slice of [leg.recordedPrefix, leg.recordedSuffix, leg.recordedGeometry]) {
      if (!slice) continue;
      assert.equal(sliceAlong(MEASURE, slice)!.backwards, false, `${leg.id} slice runs backwards`);
    }
  });
  assert.deepEqual(legs.filter((leg: any) => leg.trackBridge).map((leg: any) => leg.mode), ['driving', 'driving']);
  const geometry = Object.fromEntries(legs.map((leg: any) => [
    leg.id,
    composeJourneyLegGeometry(leg, [leg.directionFrom ?? leg.from, leg.directionTo ?? leg.to]),
  ]));
  const days = measureJourneyDays(legs, geometry);
  assert.deepEqual(days.map((day: any) => day.day), ['Day 2', 'Day 3']);
  assert.equal(days[0].pendingTrack, undefined);
  assert.ok(days[0].meters > TOTAL, `expected the road plus the walked part, got ${days[0].meters}`);
  assert.ok(days[0].meters < TOTAL + 2 * distanceMeters(TRACK_START, ORIGIN), 'the transfer is counted once');
});

test('a station projected onto the far end never pulls the whole track in reverse', () => {
  // 12 km of trail running west, then 8 km back south toward the station: the
  // nearest point of that line is its last one, while the day's place sits near
  // the first — reaching it from the station would walk every metre backwards.
  const line = [...run([12, 12], [0, 12]), ...run([0, 12], [0, 4], true)];
  const lineMeasure = measureTrack(line)!;
  const station: Coordinate = toCoordinate([0, 0]);
  assert.ok(Math.abs(projectOnTrack(lineMeasure, station)!.distanceMeters - lineMeasure.totalMeters) < 1,
    'the nearest point of this line is its far end');
  const resolve = (id: string) => (id === 't2' ? line : undefined);
  const arriving = legsFor([mapRow(STATION, 'Day 2', station), onTrackRow('垭口', 'Day 2', 600, lineMeasure, 't2')], resolve)[0];
  assert.equal(arriving.trackBridge, undefined, 'joining behind the place it reaches is not an entrance');
  assert.equal(arriving.pendingTrack, true);
  assert.equal(arriving.recordedSuffix, undefined, 'a reversed slice would add the whole line to the day');
  assert.equal(arriving.recordedPrefix, undefined);
  const departing = legsFor([onTrackRow('垭口', 'Day 2', 600, lineMeasure, 't2'), mapRow(STATION, 'Day 2', station)], resolve)[0];
  assert.equal(departing.trackBridge, true);
  assert.equal(departing.mode, 'driving', '4 km from the nearest trailhead is a road transfer');
  assert.equal(departing.pendingTrack, false);
  const prefix = sliceAlong(lineMeasure, departing.recordedPrefix)!;
  assert.equal(prefix.backwards, false);
  assert.ok(Math.abs(prefix.meters - (lineMeasure.totalMeters - 600)) < 1);
});

test('an interior place still bridges through the trailhead the projection reaches', () => {
  const line = run([0, 1], [0, 13]);
  const lineMeasure = measureTrack(line)!;
  const leg = legsFor(
    [mapRow(STATION, 'Day 2', ORIGIN), onTrackRow('营地', 'Day 2', 3_000, lineMeasure, 't2')],
    (id) => (id === 't2' ? line : undefined),
  )[0];
  assert.equal(leg.trackBridge, true);
  assert.equal(leg.pendingTrack, false);
  assert.equal(leg.mode, 'walking', 'the bridge is shorter than the road-transfer distance');
  assert.deepEqual(leg.directionTo, line[0]);
  const suffix = sliceAlong(lineMeasure, leg.recordedSuffix)!;
  assert.equal(suffix.backwards, false);
  assert.ok(Math.abs(suffix.meters - 3_000) < 1);
});

test('a day measured off straight links says so instead of passing for a road length', () => {
  const a: Coordinate = toCoordinate([0, 0]);
  const b: Coordinate = toCoordinate([4, 0]);
  const c: Coordinate = toCoordinate([4, 4]);
  const leg = (id: string, day: string, from: Coordinate, to: Coordinate) => ({
    id, day, mode: 'driving' as const, from, to, directMeters: distanceMeters(from, to),
  });
  const legs = [leg('1', 'Day 1', a, b), leg('2', 'Day 1', b, c), leg('3', 'Day 2', a, b), leg('4', 'Day 3', b, c)];
  const road = (from: Coordinate, to: Coordinate): Coordinate[] => [from, [from[0], to[1]], to];
  const days = measureJourneyDays(legs, { 1: road(a, b), 4: road(b, c) });
  assert.deepEqual(days.map((day: any) => [day.day, day.straightLine]), [
    ['Day 1', 'part'],
    ['Day 2', 'all'],
    ['Day 3', undefined],
  ]);
});
