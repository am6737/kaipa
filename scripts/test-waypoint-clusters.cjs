const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const ts = require('typescript');
const source = ts.transpileModule(fs.readFileSync('src/components/maps/waypointClusters.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const loaded = { exports: {} };
new Function('exports', 'require', 'module', source)(loaded.exports, require, loaded);
const { clusterWaypoints } = loaded.exports;

test('ten nearby route annotations become one count and split as the map zooms in', () => {
  const points = Array.from({ length: 10 }, (_, i) => [100 + i * 0.001, 30]);
  const overview = clusterWaypoints(points, 10);
  assert.equal(overview.length, 1);
  assert.equal(overview[0].indices.length, 10);
  const middle = clusterWaypoints(points, 14);
  assert.ok(middle.length > 1 && middle.length < 10);
  assert.equal(clusterWaypoints(points, 17).length, 10);
});
test('all members keep their original identities and group anchors stay on the route', () => {
  const points = Array.from({ length: 1500 }, (_, i) => [100 + i * 0.0001, 30 + Math.sin(i) * 0.0001]);
  for (const zoom of [5, 10, 13, 16, 19]) {
    const groups = clusterWaypoints(points, zoom);
    assert.deepEqual(groups.flatMap(group => group.indices).sort((a, b) => a - b), points.map((_, i) => i));
    for (const group of groups) assert.ok(group.indices.some(index => points[index] === group.coordinate));
  }
});
test('a chain of nearby marks does not collapse a whole long track into one group', () => {
  const points = Array.from({ length: 100 }, (_, i) => [100 + i * 0.01, 30]);
  assert.ok(clusterWaypoints(points, 10).length > 10);
});
test('coincident annotations remain counted without losing list entries', () => {
  const points = Array.from({ length: 10 }, () => [100, 30]);
  assert.equal(clusterWaypoints(points, 19)[0].indices.length, 10);
});
test('nearby marks across the date line are grouped together', () => {
  assert.equal(clusterWaypoints([[179.999, 30], [-179.999, 30]], 10).length, 1);
});
test('empty and single-point tracks and polar coordinates are handled', () => {
  assert.deepEqual(clusterWaypoints([], 10), []);
  assert.deepEqual(clusterWaypoints([[100, 30]], 10), [{ indices: [0], coordinate: [100, 30] }]);
  assert.equal(clusterWaypoints([[100, 90], [100, 89.99]], 10)[0].indices.length, 2);
});
