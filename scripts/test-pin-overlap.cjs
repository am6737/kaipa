// The geometry behind "my first tap was eaten by an invisible pin".
//
// The 发现 map hides the other mode's pins by animating their content's opacity,
// which leaves the native annotation view interactive: at a country-wide zoom its
// 116x70 layout frame covers a big slice of the screen and MapKit hands the tap to
// it. `pickPinUnderPress` decides whether the press really belonged to a pin the
// user could see, and it must only say yes when that pin's *drawn photo* is
// genuinely under the frame that ate the tap — otherwise the map would open some
// other journey than the one tapped.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const ts = require('typescript');

const js = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/lib/pinOverlap.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const context = { exports: {}, Math };
vm.runInNewContext(js, context);
const { pickPinUnderPress, MIN_PHOTO_OVERLAP } = context.exports;

// PhotoPin's real numbers, so a threshold that passes here means the same thing
// on screen. At zoom 3 the pin's photo is drawn at 0.65 -> a 26pt square inside a
// 116x70 frame.
const BOXES = {
  frameWidth: 116,
  frameHeight: 70,
  anchorY: 20 / 70,
  photoSize: 40,
  scale: 0.65,
};
const ZOOM = 3;
const PRESSED = { id: 'hidden', lng: 100, lat: 30 };
const east = (degrees) => ({ lng: 100 + degrees, lat: 30 });

const pick = (candidate, boxes = BOXES, zoom = ZOOM) => pickPinUnderPress(
  PRESSED,
  [{ id: 'visible', ...candidate }],
  zoom,
  boxes,
  MIN_PHOTO_OVERLAP,
);

test('a pin drawn on top of the one that was tapped wins the press', () => {
  // Same place: the whole photo is inside the frame that ate the tap.
  const match = pick(east(0));
  assert.ok(match, 'the overlapping pin should be chosen');
  assert.equal(match.pin.id, 'visible');
  assert.equal(match.score, 1);
});

test('a pin one degree away at a country-wide zoom is still under the frame', () => {
  const match = pick(east(1));
  assert.ok(match, '5.7px apart: the two photos cannot be told apart at that zoom');
  assert.ok(match.score > 0.99, `expected a near-total overlap, got ${match.score}`);
});

test('the same one degree is nobody else\'s pin once the camera is zoomed in', () => {
  // At zoom 10 a degree is 728px: the tap is on the invisible pin and nowhere
  // near a visible one, so it must stay dropped rather than opening a journey
  // that is off the edge of the screen.
  assert.equal(pick(east(1), { ...BOXES, scale: 1 }, 10), null);
});

test('the threshold is the photo, not the frame', () => {
  // Photo centre at the frame's right edge (58px) is half outside; a couple of
  // degrees further it is mostly outside and the map must not guess.
  const mostlyInside = pick(east(8.8));
  assert.ok(mostlyInside, `8.8° should still read as the same spot, got ${mostlyInside}`);
  assert.ok(mostlyInside.score > 0.7, `expected > 0.7 overlap, got ${mostlyInside.score}`);

  const mostlyOutside = pick(east(10.65));
  assert.equal(mostlyOutside, null, 'a quarter of the photo inside is not enough to guess');
});

test('the north-south axis is measured in Mercator, not in degrees', () => {
  // A degree of latitude is ~3.8px at zoom 3 where a degree of longitude is 5.7,
  // so the same pixel threshold must land at a different number of degrees.
  const near = pick({ lng: 100, lat: 31 });
  assert.ok(near && near.score > 0.99, `1° north is 3.8px: ${near && near.score}`);
  const far = pick({ lng: 100, lat: 15 });
  assert.equal(far, null, '15° south is 57px, past the bottom of the frame');
});

test('a pin is never its own answer', () => {
  assert.equal(pickPinUnderPress(
    { id: 'only', lng: 100, lat: 30 },
    [{ id: 'only', lng: 100, lat: 30 }],
    ZOOM,
    BOXES,
  ), null);
});

test('nothing visible, no zoom, or a broken box all keep the old behaviour', () => {
  const pressed = { id: 'hidden', lng: 100, lat: 30 };
  assert.equal(pickPinUnderPress(pressed, [], ZOOM, BOXES), null);
  assert.equal(pickPinUnderPress(pressed, [{ id: 'v', lng: 100, lat: 30 }], NaN, BOXES), null);
  assert.equal(pickPinUnderPress(pressed, [{ id: 'v', lng: 100, lat: 30 }], ZOOM, { ...BOXES, frameWidth: 0 }), null);
  // A candidate with no coordinate (a POI that never got located) must not match.
  assert.equal(pickPinUnderPress(pressed, [{ id: 'v', lng: NaN, lat: 30 }], ZOOM, BOXES), null);
});
