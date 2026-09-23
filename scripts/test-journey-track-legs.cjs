// A hiking day has no road to plan: two places picked on one recorded track walk
// that track. This covers the geometry that replaces the road plan, the fallback
// when only one end is on the track, and the stale-distance guard.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const ts = require('typescript');

const modules = new Map();
function load(file) {
  const resolved = path.resolve(file);
  if (modules.has(resolved)) return modules.get(resolved);
  const js = ts.transpileModule(fs.readFileSync(resolved, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  const requireLocal = (name) => {
    if (!name.startsWith('.')) return require(name);
    const base = path.resolve(path.dirname(resolved), name);
    for (const candidate of [`${base}.ts`, `${base}.tsx`, path.join(base, 'index.ts')]) {
      if (fs.existsSync(candidate)) return load(candidate);
    }
    throw new Error(`cannot resolve ${name} from ${resolved}`);
  };
  new Function('exports', 'require', 'module', '__filename', js)(module.exports, requireLocal, module, resolved);
  modules.set(resolved, module.exports);
  return module.exports;
}

const segments = load('src/lib/routeSegments.ts');
const stops = load('src/lib/journeyStops.ts');
const { measureTrack, positionAtDistance, projectOnTrack, trackSliceBetweenMeters, distanceMeters } = segments;

// ~111.32 km per degree of latitude at the equator: a straight north-south line
// whose every degree is a known distance, so expected metres are exact enough to
// assert on.
const LINE = [[100, 30], [100, 30.01], [100, 30.02], [100, 30.03], [100, 30.04]];
const measure = measureTrack(LINE);
const STEP = measure.cumulativeMeters[1];

test('a slice between two distances is that part of the track, in walking order', () => {
  const slice = trackSliceBetweenMeters(measure, STEP * 0.5, STEP * 2.5);
  assert.ok(slice.length >= 3);
  assert.deepEqual(slice[0], positionAtDistance(measure, STEP * 0.5).coordinate);
  assert.deepEqual(slice.at(-1), positionAtDistance(measure, STEP * 2.5).coordinate);
  assert.equal(slice[1][1], 30.01);
  const forward = measureTrack(slice).totalMeters;
  assert.ok(Math.abs(forward - STEP * 2) < 1, `expected ~2 steps, got ${forward}`);
});

test('walking backwards along the file reverses the slice instead of guessing', () => {
  const back = trackSliceBetweenMeters(measure, STEP * 2.5, STEP * 0.5);
  const forth = trackSliceBetweenMeters(measure, STEP * 0.5, STEP * 2.5);
  assert.deepEqual(back[0], forth.at(-1));
  assert.deepEqual(back.at(-1), forth[0]);
});

test('a slice of nothing is no geometry at all', () => {
  assert.equal(trackSliceBetweenMeters(measure, STEP, STEP), null);
  assert.equal(trackSliceBetweenMeters(measure, STEP, NaN), null);
});

test('a tap near the line is kept as a distance along it, on the line', () => {
  // A point a few metres east of the track, level with its second vertex.
  const tap = [100.001, 30.01];
  const position = projectOnTrack(measure, tap);
  assert.ok(Math.abs(position.distanceMeters - STEP) < 1, `got ${position.distanceMeters}`);
  assert.equal(position.coordinate[1], 30.01);
  assert.ok(Math.abs(position.coordinate[0] - 100) < 1e-9);
});

function place(name, day, coordinate, extra = {}) {
  return {
    id: name,
    title: name,
    day,
    location: { name, longitude: coordinate[0], latitude: coordinate[1], ...extra },
  };
}
const TRACK_POINT = {
  source: 'track',
  trackId: 't1',
  trackName: '卡尔杂→党岭',
  trackMeters: 0,
  trackLengthMeters: STEP * 4,
};
const rowsById = (rows) => new Map(rows.map((row) => [row.id, row]));
const trackCoords = (id) => (id === 't1' ? LINE : undefined);

function legOf(fromExtra, toExtra, distanceIndex) {
  const rows = [
    place('a', 'Day 1', LINE[0], fromExtra),
    place('b', 'Day 1', LINE[distanceIndex], toExtra),
  ];
  const built = stops.buildJourneyStops(rows, ['Day 1']);
  const legs = stops.buildJourneyLegs(built, rowsById(rows), trackCoords);
  return { built, legs: legs[0] };
}

test('two places on one track draw that track and never ask for a road', () => {
  const { legs } = legOf({ ...TRACK_POINT }, { ...TRACK_POINT, trackMeters: STEP * 3 }, 3);
  assert.equal(legs.mode, 'walking');
  assert.ok(legs.recordedGeometry, 'expected the track slice as recorded geometry');
  assert.equal(legs.recordedGeometry.length, 4);
  assert.deepEqual(legs.recordedGeometry[0], LINE[0]);
  assert.deepEqual(legs.recordedGeometry.at(-1), LINE[3]);
});

test('one end on the track still walks, but has no geometry to claim', () => {
  const { legs } = legOf({ ...TRACK_POINT }, {}, 3);
  assert.equal(legs.mode, 'walking');
  assert.equal(legs.recordedGeometry, undefined);
});

test('a distance measured against a different file is not drawn', () => {
  const stale = { ...TRACK_POINT, trackLengthMeters: STEP * 9 };
  const { legs } = legOf(stale, { ...stale }, 3);
  assert.equal(legs.recordedGeometry, undefined);
  assert.equal(legs.mode, 'walking');
});

test('two map places are still planned as before', () => {
  const { legs } = legOf({}, {}, 3);
  assert.equal(legs.mode, 'driving');
  assert.equal(legs.recordedGeometry, undefined);
});

test('a place on the path is not the village beside it', () => {
  const beside = [LINE[0][0] + 0.00002, LINE[0][1]];
  const merged = stops.buildJourneyStops(
    [place('bus', 'Day 1', LINE[0]), place('inn', 'Day 1', beside)],
    ['Day 1'],
  );
  assert.equal(merged.length, 1, 'two map places 2 m apart are one stop');
  const kept = stops.buildJourneyStops(
    [place('bus', 'Day 1', LINE[0]), place('camp', 'Day 1', beside, { ...TRACK_POINT, trackMeters: STEP })],
    ['Day 1'],
  );
  assert.equal(kept.length, 2, 'a track place beside a map place is its own stop');
  assert.equal(kept[1].trackMeters, STEP);
});

test('the chain across days stays unbroken by track places', () => {
  const rows = [
    place('a', 'Day 1', LINE[0], { ...TRACK_POINT }),
    place('b', 'Day 1', LINE[1], { ...TRACK_POINT, trackMeters: STEP }),
    place('c', 'Day 2', LINE[3], { ...TRACK_POINT, trackMeters: STEP * 3 }),
  ];
  const legs = stops.buildJourneyLegs(stops.buildJourneyStops(rows, ['Day 1', 'Day 2']), rowsById(rows), trackCoords);
  assert.equal(legs.length, 1);
  assert.equal(legs[0].day, 'Day 1');
  assert.ok(distanceMeters(legs[0].from, legs[0].to) < 2000);
});
