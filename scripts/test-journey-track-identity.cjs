// One recorded file reaches a journey under two ids: the catalog route it was
// built from, and the track row the client promoted from that route. Keying the
// place picker by id alone showed the reader two identical rows and asked them to
// choose. This covers the merge, the id a place keeps, and the chain still walking
// the line when its two ends were picked under different ids.
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
const { journeyTracks, trackForId } = load('src/lib/journeyTracks.ts');
const { buildJourneyLegs } = load('src/lib/journeyStops.ts');
const { measureTrack } = segments;

// The same north-south line the legs test uses: known metres per vertex.
const LINE = [[100, 30], [100, 30.01], [100, 30.02], [100, 30.03], [100, 30.04]];
const WAYPOINTS = [{ name: '垭口', km: measureTrack(LINE).cumulativeMeters[2] / 1000 }];
const OTHER_LINE = [[101, 31], [101.01, 31.01], [101.02, 31.02]];

// A journey made from a catalog route: `NewJourneySheet` copies the route geometry
// into a track row and points `track_id` at it, while the day keeps `route_id`.
const ROUTE = { id: 'route-1', kind: 'route', name: '哈天线', trackCoords: LINE, trackWaypoints: WAYPOINTS };
const OTHER_ROUTE = { id: 'route-2', kind: 'route', name: '东岸', trackCoords: OTHER_LINE, trackWaypoints: [] };
const JOURNEY = {
  id: 'j-1', kind: 'journey', name: '哈天线', trackId: 'track-1',
  trackCoords: LINE, trackWaypoints: WAYPOINTS,
};

test('the route copy and the journey track are one row, not a choice between two', () => {
  const tracks = journeyTracks(JOURNEY, [{ routeId: ROUTE.id }], [ROUTE]);
  assert.equal(tracks.length, 1, 'a single track has to pick itself straight away');
  // The journey's own track row outlives the day's route link, so it is the id
  // new places store.
  assert.equal(tracks[0].id, 'track-1');
  assert.deepEqual(tracks[0].ids, ['track-1', 'route-1']);
});

test('a place already stored under the route id still finds its track', () => {
  const tracks = journeyTracks(JOURNEY, [{ routeId: ROUTE.id }], [ROUTE]);
  assert.equal(trackForId(tracks, 'route-1'), tracks[0]);
  assert.equal(trackForId(tracks, 'track-1'), tracks[0]);
  assert.equal(trackForId(tracks, undefined), undefined);
  assert.equal(trackForId(tracks, 'route-2'), undefined);
});

test('ends picked under either id still walk the line instead of going straight', () => {
  const tracks = journeyTracks(JOURNEY, [{ routeId: ROUTE.id }], [ROUTE]);
  // Built the way the detail screen builds it: every id of a track resolves to it.
  const coordsById = new Map(tracks.flatMap((track) => track.ids.map((id) => [id, track.coords])));
  const track = tracks[0];
  const total = track.totalMeters;
  const stops = [
    { rowId: 'a', order: 1, day: '第1天', name: 'A', coordinate: LINE[1], trackId: 'route-1', trackMeters: total * 0.25, trackLengthMeters: total },
    { rowId: 'b', order: 2, day: '第1天', name: 'B', coordinate: LINE[3], trackId: 'track-1', trackMeters: total * 0.75, trackLengthMeters: total },
  ];
  const legs = buildJourneyLegs(stops, new Map(), (id) => coordsById.get(id));
  assert.equal(legs.length, 1);
  assert.equal(legs[0].mode, 'walking');
  assert.ok(legs[0].recordedGeometry, 'the leg must be the track slice, not a straight hop');
  assert.ok(legs[0].recordedGeometry.length >= 3);
});

test('genuinely different tracks stay separate', () => {
  const tracks = journeyTracks(JOURNEY, [{ routeId: ROUTE.id }, { routeId: OTHER_ROUTE.id }], [ROUTE, OTHER_ROUTE]);
  assert.deepEqual(tracks.map((track) => track.id), ['track-1', 'route-2']);
});

test('a re-imported track is not folded onto the route it no longer matches', () => {
  const rebound = { ...JOURNEY, trackCoords: OTHER_LINE, trackWaypoints: [] };
  const tracks = journeyTracks(rebound, [{ routeId: ROUTE.id }], [ROUTE]);
  assert.equal(tracks.length, 2, 'two different files, two choices');
  assert.deepEqual(tracks.map((track) => track.id), ['route-1', 'track-1']);
});

test('one day listing the same route twice adds no track', () => {
  const tracks = journeyTracks(JOURNEY, [{ routeId: ROUTE.id }, { routeId: ROUTE.id }], [ROUTE]);
  assert.equal(tracks.length, 1);
});
