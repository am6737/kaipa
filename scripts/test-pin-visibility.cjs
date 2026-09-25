// The rule that decides which map pins may be seen, and the invariant that keeps a
// card's open/close out of the marker list: opening a card may only ever *hide*
// pins, never change which ones exist.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { test } = require('node:test');
const ts = require('typescript');

const js = ts.transpileModule(fs.readFileSync('src/lib/pinVisibility.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const context = {
  exports: {},
  require: (name) => { throw new Error(`pinVisibility must stay dependency-free, got: ${name}`); },
};
vm.runInNewContext(js, context);
const { visiblePinKeys } = context.exports;

const sorted = (set) => [...set].sort();
const place = (repId, members = [repId]) => ({ rep: { id: repId }, group: members.map((id) => ({ id })) });
const NO_COMPARISONS = new Set();

test('no card open: every place of the shown layer is visible', () => {
  const groups = [place('a'), place('b'), place('c')];
  assert.deepEqual(sorted(visiblePinKeys(groups, 'explore', null)), ['explore:a', 'explore:b', 'explore:c']);
});

test('the hidden layer stays hidden while a card is open', () => {
  // This is the whole point of the rail: both layers stay mounted and only the key
  // set moves. If a card's keys ever named the other layer, the map would have to
  // rebuild its marker list to honour them.
  const groups = [place('a'), place('b')];
  assert.deepEqual(sorted(visiblePinKeys(groups, 'memory', null)), ['memory:a', 'memory:b']);
  const opened = visiblePinKeys(groups, 'memory', { id: 'a', comparisonIds: NO_COMPARISONS });
  assert.deepEqual(sorted(opened), ['memory:b']);
});

test('a card hides the pin of the place it stands for', () => {
  const groups = [place('a'), place('b'), place('c')];
  const open = visiblePinKeys(groups, 'explore', { id: 'b', comparisonIds: NO_COMPARISONS });
  assert.deepEqual(sorted(open), ['explore:a', 'explore:c']);
  // Only ever a subset: a card never adds a pin.
  const all = visiblePinKeys(groups, 'explore', null);
  open.forEach((key) => assert.ok(all.has(key), `${key} appeared only once a card opened`));
});

test('a shared trailhead keeps its pin, so a sibling can still be compared', () => {
  // Two routes starting at the same point: the card owns one of them, and the pin
  // is the only map affordance for laying the other over it.
  const groups = [place('rep-route', ['rep-route', 'sibling-route']), place('other')];
  const open = visiblePinKeys(groups, 'explore', { id: 'rep-route', comparisonIds: NO_COMPARISONS });
  assert.deepEqual(sorted(open), ['explore:other', 'explore:rep-route']);
});

test('a place whose every member is on screen already loses its pin', () => {
  const groups = [place('rep-route', ['rep-route', 'sibling-route']), place('other')];
  const open = visiblePinKeys(groups, 'explore', { id: 'rep-route', comparisonIds: new Set(['sibling-route']) });
  assert.deepEqual(sorted(open), ['explore:other']);
});

test('a comparison route laid over the card hides its own place too', () => {
  const groups = [place('a'), place('b'), place('c')];
  const open = visiblePinKeys(groups, 'explore', { id: 'a', comparisonIds: new Set(['c']) });
  assert.deepEqual(sorted(open), ['explore:b']);
});

test('an empty map has no visible pins and does not throw', () => {
  assert.deepEqual(sorted(visiblePinKeys([], 'explore', { id: 'a', comparisonIds: NO_COMPARISONS })), []);
});

test('the rail stays up under a detail card', () => {
  // The regression this file exists for: with the rail down for a card, the marker
  // list was rebuilt on both the open and the close, inside the camera animation.
  // The `perfArm` half of the pattern is the temporary A/B in the probe; this
  // matches with and without it.
  const discover = fs.readFileSync('src/screens/DiscoverScreen.tsx', 'utf8');
  assert.match(
    discover,
    /const useRail = railAvailable( && \(perfArm === 'rail' \|\| !nav\.pointInfo\))?;/,
    'a card must not take the rail down',
  );
  assert.ok(!discover.includes('railAvailable && !nav.pointInfo'), 'the old unconditional gate is gone');
  assert.match(discover, /const mapPois = useRail \? railPins : liveLayerPins;/, 'the rail keeps one pin array for both modes');
  assert.match(discover, /return railVisibleKeys\(/, 'what a card changes is the visible set, not the pins');
});
