// Opening a route card draws a track that was sampled once a second: 1500 points
// for a two-hour walk, every one of them a `{latitude, longitude}` object handed
// to the native map in the frame that also starts the camera animation. The
// simplification has to be invisible, so these are mostly claims about deviation,
// not about counts.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { test } = require('node:test');
const ts = require('typescript');

const js = ts.transpileModule(fs.readFileSync('src/components/maps/extent.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const context = { exports: {} };
vm.runInNewContext(js, context);
const { simplifyTrack, trackSpanOnScreen, trackWorldSpan, zoomToFitSpan } = context.exports;

const DEG = 111320; // metres per degree, in the metric the simplifier measures in
const toScaled = (metres, scale) => metres / DEG / scale;

/** A walk that goes nowhere interesting: a gentle curve plus a little jitter. */
function smoothTrack(count) {
  return Array.from({ length: count }, (_, index) => {
    const step = index / count;
    return [
      100 + step * 0.6 + Math.sin(step * 9) * 0.01,
      30 + step * 0.4 + Math.cos(step * 13) * 0.008 + (index % 3) * 0.00001,
    ];
  });
}

function distanceToSegment(point, from, to) {
  const [px, py] = point;
  const [ax, ay] = from;
  const [bx, by] = to;
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) return Math.hypot(px - ax, py - ay);
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSquared));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/**
 * The worst distance from any source point to the simplified polyline, measured
 * in the same scaled-degree metric the simplifier used - the guarantee is only
 * meaningful in that metric, and comparing it against a plain-degree number would
 * be a different question.
 */
function maxDeviation(source, simplified, scale) {
  const kept = [];
  let cursor = 0;
  for (const point of simplified) {
    while (source[cursor] !== point) cursor += 1;
    kept.push(cursor);
  }
  let worst = 0;
  for (let index = 0; index + 1 < kept.length; index += 1) {
    const from = [source[kept[index]][0] * scale, source[kept[index]][1]];
    const to = [source[kept[index + 1]][0] * scale, source[kept[index + 1]][1]];
    for (let at = kept[index]; at <= kept[index + 1]; at += 1) {
      worst = Math.max(worst, distanceToSegment([source[at][0] * scale, source[at][1]], from, to));
    }
  }
  return worst;
}

test('a curve and its jitter collapse, within the tolerance', () => {
  const track = smoothTrack(1549);
  // A card frames a route track at roughly zoom 10, where half a pixel is ~40 m.
  const tolerance = toScaled(40, Math.cos((30 * Math.PI) / 180));
  const simplified = simplifyTrack(track, tolerance);

  assert.ok(simplified.length * 3 < track.length, `only ${simplified.length} of ${track.length} kept`);
  assert.ok(simplified.length > 20, 'too few points left to call it the same route');
  const deviated = maxDeviation(track, simplified, Math.cos((30 * Math.PI) / 180));
  assert.ok(
    deviated <= tolerance + 1e-12,
    `a dropped point sat ${(deviated * DEG).toFixed(1)} scaled-deg metres from the drawn line`,
  );
});

test('the ends of the track survive, whatever the tolerance', () => {
  const track = smoothTrack(400);
  const simplified = simplifyTrack(track, toScaled(5000, 1));
  assert.equal(simplified[0], track[0]);
  assert.equal(simplified[simplified.length - 1], track[track.length - 1]);
});

test('a corner sharper than the tolerance is kept', () => {
  // 200 m off the chord in the middle of an otherwise straight kilometre.
  const track = [[100, 30], [100.0045, 30.0018], [100.009, 30]];
  assert.equal(simplifyTrack(track, toScaled(50, 1)).length, 3, 'the hairpin was smoothed away');
  // The same shape 5.6 m off its chord is not a corner at all.
  const flat = [[100, 30], [100.00045, 30.00005], [100.0009, 30]];
  assert.equal(simplifyTrack(flat, toScaled(50, 1)).length, 2);
});

test('a track it cannot simplify keeps its own array identity', () => {
  // Returning a copy would invalidate the projection cache and rebuild the native
  // polyline on every render, which is the cost this whole change exists to avoid.
  const short = [[100, 30], [101, 31]];
  assert.equal(simplifyTrack(short, toScaled(10, 1)), short, 'a two-point track was replaced');
  const track = smoothTrack(300);
  // Zoomed in far enough that every sample earns its place, the array that comes
  // back has to be the array that went in.
  assert.equal(simplifyTrack(track, 1e-9), track, 'nothing was dropped but a copy came back');
  assert.equal(simplifyTrack(track, 0), track, 'a zero tolerance must not blank the line');
  assert.equal(simplifyTrack([], toScaled(10, 1)).length, 0);
});

test('longitude is weighed by latitude', () => {
  // A 0.0045-degree bow east of a north-south chord is ~500 m of ground on the
  // equator and ~250 m of it at 60N. Counted in bare degrees the two are the same
  // shape, so a track would lose detail in the north and carry dead weight in the
  // south - and the same route would look different in China than in Norway.
  const bow = (baseLat) => [[100, baseLat], [100.0045, baseLat + 0.01], [100, baseLat + 0.02]];
  const tolerance = toScaled(400, 1);
  assert.equal(simplifyTrack(bow(0), tolerance).length, 3, 'a 500 m bow at the equator needs its vertex');
  assert.equal(simplifyTrack(bow(60), tolerance).length, 2, 'the same bow at 60N is 250 m and does not');
});

test('the framing zoom and the on-screen size are the same question', () => {
  const span = trackWorldSpan(smoothTrack(500));
  const zoom = zoomToFitSpan(span, 300);
  assert.ok(Math.abs(trackSpanOnScreen(span, zoom) - 300) < 1e-6, 'fit then measure must round-trip');
  // A bigger box resolves the same track at a finer scale, so the tolerance that
  // comes out the other end has to shrink as the box grows.
  assert.ok(zoomToFitSpan(span, 600) > zoomToFitSpan(span, 120));
  assert.ok(Number.isFinite(zoomToFitSpan(null, 300)));
  assert.ok(Number.isFinite(zoomToFitSpan({ width: 0, height: 0 }, 300)));
});
