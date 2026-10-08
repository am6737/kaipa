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

test('a map place on the same path follows the recorded track', () => {
  const { legs } = legOf({ ...TRACK_POINT }, {}, 3);
  assert.equal(legs.mode, 'walking');
  assert.deepEqual(legs.recordedGeometry, LINE.slice(0, 4));
  assert.equal(legs.pendingTrack, false);
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


test('mixed endpoints follow a bending track in either direction without a road bridge', () => {
  const path = [[100, 30], [100.01, 30], [100.01, 30.01]];
  const total = measureTrack(path).totalMeters;
  const a = place('poi', 'Day 1', [100, 30.0001]);
  const b = place('camp', 'Day 1', path[2], { trackId: 'bend', trackMeters: total, trackLengthMeters: total });
  for (const rows of [[a, b], [b, a]]) {
    const leg = stops.buildJourneyLegs(stops.buildJourneyStops(rows, ['Day 1']), () => path)[0];
    assert.deepEqual(leg.recordedGeometry, rows[0] === a ? path : [...path].reverse());
    assert.equal(leg.directionFrom, undefined);
    assert.equal(leg.directionTo, undefined);
    const days = stops.measureJourneyDays([leg], { [leg.id]: leg.recordedGeometry });
    assert.ok(Math.abs(days[0].meters - total) < 1);
  }
});

test('unverified or unavailable track connections remain unmeasured', () => {
  for (const coords of [trackCoords, () => undefined]) {
    const rows = [place('poi', 'Day 1', [100.02, 30]), place('camp', 'Day 1', LINE[3],
      { ...TRACK_POINT, trackMeters: STEP * 3 })];
    const leg = stops.buildJourneyLegs(stops.buildJourneyStops(rows, ['Day 1']), coords)[0];
    assert.equal(leg.pendingTrack, true);
    assert.equal(leg.recordedGeometry, undefined);
    const days = stops.measureJourneyDays([leg], {});
    assert.equal(days[0].pendingTrack, true);
    assert.equal(days[0].meters, 0);
  }
});

test('a POI beside an out-and-back track requires an explicit track position', () => {
  const loop = [[100, 30], [100, 30.02], [100.0001, 30.02], [100.0001, 30]];
  const total = measureTrack(loop).totalMeters;
  const rows = [place('poi', 'Day 1', [100.00005, 30.01]),
    place('camp', 'Day 1', loop[1], { trackId: 'loop', trackMeters: total / 2, trackLengthMeters: total })];
  const leg = stops.buildJourneyLegs(stops.buildJourneyStops(rows, ['Day 1']), () => loop)[0];
  assert.equal(leg.pendingTrack, true);
});

test('a distant POI approaching a track endpoint requests only the access road', () => {
  const rows = [place('poi', 'Day 1', [100, 29.99]),
    place('camp', 'Day 1', LINE[3], { ...TRACK_POINT, trackMeters: STEP * 3 })];
  for (const ordered of [rows, [...rows].reverse()]) {
    const leg = stops.buildJourneyLegs(stops.buildJourneyStops(ordered, ['Day 1']), trackCoords)[0];
    assert.equal(leg.trackBridge, true);
    assert.equal(leg.pendingTrack, true);
    assert.deepEqual(leg.directionFrom, ordered[0] === rows[0] ? [100, 29.99] : LINE[0]);
    assert.deepEqual(leg.directionTo, ordered[0] === rows[0] ? LINE[0] : [100, 29.99]);
    assert.equal(stops.trackAccessReachesEndpoints(leg, leg.directionFrom, leg.directionTo), true);
    assert.equal(stops.trackAccessReachesEndpoints(leg, leg.directionFrom, [100.02, 30]), false);
    assert.equal(stops.trackAccessReachesEndpoints(leg), false);
    const geometry = stops.composeJourneyLegGeometry(leg, [leg.directionFrom, leg.directionTo]);
    assert.deepEqual(geometry[0], leg.from);
    assert.deepEqual(geometry.at(-1), leg.to);
    assert.ok(geometry.some(point => point[1] === 30.02));
    const day = stops.measureJourneyDays([leg], { [leg.id]: geometry })[0];
    assert.equal(day.pendingTrack, undefined);
    assert.ok(day.meters > STEP * 3);
  }
});

const access = load('src/lib/journeyAccess.ts');
test('drawn access requires detail and is invalidated when the previous stop changes', () => {
  const from = [100, 30], to = [100, 30.004];
  assert.equal(access.drawnAccessPath(from, to, []), null);
  assert.equal(access.drawnAccessPath(from, to, [[100, 30.0001]]), null);
  const coords = access.drawnAccessPath(from, to, [[100, 30.002]]);
  assert.ok(coords);
  const rows = [place('a', 'Day 1', from), place('b', 'Day 1', to, {
    incomingPath: { fromRowId: 'a', source: 'drawn', coordinates: coords },
  })];
  const leg = stops.buildJourneyLegs(stops.buildJourneyStops(rows, ['Day 1']))[0];
  assert.equal(leg.userPath, 'drawn');
  assert.deepEqual(leg.recordedGeometry, coords);
  assert.equal(stops.measureJourneyDays([leg], { [leg.id]: coords })[0].userDrawn, true);
  const replaced = [{ ...rows[0], id: 'other' }, rows[1]];
  assert.equal(stops.buildJourneyLegs(stops.buildJourneyStops(replaced, ['Day 1']))[0].userPath, undefined);
  const moved = [place('a', 'Day 1', [100.01, 30]), rows[1]];
  assert.equal(stops.buildJourneyLegs(stops.buildJourneyStops(moved, ['Day 1']))[0].userPath, undefined);
});
test('imported access slices the real track in either direction and rejects uncovered endpoints', () => {
  const path = [[100, 30], [100.01, 30], [100.01, 30.01]];
  const forward = access.importedAccessPath(path[0], path[2], path);
  const reverse = access.importedAccessPath(path[2], path[0], path);
  assert.ok(forward);
  assert.deepEqual(forward, [...reverse].reverse());
  assert.equal(access.importedAccessPath([100, 29.9], path[2], path), null);
});

test('airport and station stops use normal driving navigation regardless of transport metadata', () => {
  for (const incomingMode of ['rail', 'flight']) {
    const pins = stops.buildJourneyStops([
      { id: 'depart', day: 'Day 1', title: '出发', location: { name: incomingMode === 'flight' ? '南宁吴圩机场' : '南宁东', longitude: 108.42, latitude: 22.85 } },
      { id: 'arrive', day: 'Day 1', title: '到达', location: { name: incomingMode === 'flight' ? '成都天府机场' : '成都东', longitude: 104.14, latitude: 30.63, incomingMode } },
    ], ['Day 1']);
    const legs = stops.buildJourneyLegs(pins);
    assert.equal(legs.length, 1);
    assert.equal(legs[0].mode, 'driving');
    assert.equal(legs[0].pendingTrack, false);
    assert.equal(legs[0].recordedGeometry, undefined);
    const road = [legs[0].from, [106, 28], legs[0].to];
    const measured = stops.measureJourneyDays(legs, { [legs[0].id]: road });
    assert.equal(measured.length, 1);
    assert.equal(measured[0].meters, segments.measureTrack(road).totalMeters);
  }
});
