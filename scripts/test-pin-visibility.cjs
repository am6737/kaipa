// The rule that decides which map pins may be seen, and the invariant that keeps a
// card's open/close out of the marker list: opening a card may only ever *hide*
// pins, never change which ones exist.
//
// Also the shape of the reveal cascade — who triggers it and how long it takes —
// because that is decided here as pure arithmetic, in the same dependency-free
// module.
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
const { visiblePinKeys, staggerStepMs, staggerRevealPlan } = context.exports;

const sorted = (set) => [...set].sort();
const place = (repId, members = [repId]) => ({ rep: { id: repId }, group: members.map((id) => ({ id })) });

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
  const opened = visiblePinKeys(groups, 'memory', { id: 'a' });
  assert.deepEqual(sorted(opened), ['memory:b']);
});

test('a card hides the pin of the place it stands for', () => {
  const groups = [place('a'), place('b'), place('c')];
  const open = visiblePinKeys(groups, 'explore', { id: 'b' });
  assert.deepEqual(sorted(open), ['explore:a', 'explore:c']);
  // Only ever a subset: a card never adds a pin.
  const all = visiblePinKeys(groups, 'explore', null);
  open.forEach((key) => assert.ok(all.has(key), `${key} appeared only once a card opened`));
});

test('a shared trailhead keeps its pin, so a sibling can still be opened', () => {
  // Two routes starting at the same point: the card owns one of them, and the pin
  // is the only map affordance for switching to the other.
  const groups = [place('rep-route', ['rep-route', 'sibling-route']), place('other')];
  const open = visiblePinKeys(groups, 'explore', { id: 'rep-route' });
  assert.deepEqual(sorted(open), ['explore:other', 'explore:rep-route']);
});

test('a place whose only member is the open route loses its pin', () => {
  const groups = [place('rep-route', ['rep-route']), place('other')];
  const open = visiblePinKeys(groups, 'explore', { id: 'rep-route' });
  assert.deepEqual(sorted(open), ['explore:other']);
});

test('an empty map has no visible pins and does not throw', () => {
  assert.deepEqual(sorted(visiblePinKeys([], 'explore', { id: 'a' })), []);
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

// ─────────────────────────────── the reveal plan ───────────────────────────────
// Who cascades and who arrives at once is the caller's decision; how a cascade is
// spread over time and space is arithmetic, and it lives in the same
// dependency-free module so both can be checked without a map.

/** StaggerIn owns the shared rhythm. Read from its source, so what is asserted
    here is what `MapGlobe` actually hands the plan. */
const { STAGGER_STEP_MS, STAGGER_MAX_DELAY_MS } = (() => {
  const source = fs.readFileSync('src/components/StaggerIn.tsx', 'utf8');
  const constant = (name) => Number(source.match(new RegExp(`export const ${name} = (\\d+);`))[1]);
  return {
    STAGGER_STEP_MS: constant('STAGGER_STEP_MS'),
    STAGGER_MAX_DELAY_MS: constant('STAGGER_MAX_DELAY_MS'),
  };
})();

/** Pins in a row, 1° of longitude apart: the middle of the line is the centroid,
    so the sweep order is readable straight off the ids. */
const line = (count) => {
  const keys = [];
  const coordinates = new Map();
  for (let index = 0; index < count; index += 1) {
    const key = `explore:r${index}`;
    keys.push(key);
    coordinates.set(key, [100 + index, 30]);
  }
  return { keys, coordinates };
};

const plan = (count) => {
  const { keys, coordinates } = line(count);
  return staggerRevealPlan(keys, coordinates, STAGGER_STEP_MS, STAGGER_MAX_DELAY_MS);
};

test('a small group keeps the shared step', () => {
  [1, 3, 12].forEach((count) => {
    assert.equal(staggerStepMs(count, STAGGER_STEP_MS, STAGGER_MAX_DELAY_MS), STAGGER_STEP_MS, `${count} pins`);
  });
  const delays = plan(5).map((step) => step.delayMs);
  // Joined: the plan is built inside the vm realm, so a deep-equal on its array
  // would fail on the prototype alone.
  assert.equal(delays.join(','), '0,55,110,165,220');
});

test("a region's worth compresses so the cascade still ends on the total", () => {
  // The old rhythm capped the *index*, so 全国's 150 pins swept twelve of them and
  // then the rest arrived together at the cap.
  const steps = plan(150);
  const delays = steps.map((step) => step.delayMs);
  assert.equal(delays[0], 0, 'the first pin is shown straight away');
  assert.ok(Math.max(...delays) < STAGGER_MAX_DELAY_MS, `the sweep ran past its total: ${Math.max(...delays)}`);
  assert.ok(STAGGER_MAX_DELAY_MS - Math.max(...delays) < STAGGER_STEP_MS, 'it uses the whole total, not half of it');
  assert.equal(new Set(delays).size, 150, 'pins sharing a delay arrive in a burst');
});

test('the sweep runs from the middle of the group outward', () => {
  const steps = plan(150);
  assert.ok(['explore:r74', 'explore:r75'].includes(steps[0].key), `the sweep started at ${steps[0].key}`);
  assert.ok(['explore:r0', 'explore:r149'].includes(steps[149].key), `the sweep ended at ${steps[149].key}`);
  // Distance from the centroid never shrinks as the sweep goes on.
  const fromCentre = (key) => Math.abs(Number(key.split(':')[1].slice(1)) - 74.5);
  const distances = steps.map(({ key }) => fromCentre(key));
  distances.forEach((value, index) => {
    if (index === 0) return;
    assert.ok(value >= distances[index - 1], `the sweep went back in at rank ${index}: ${distances.join(',')}`);
  });
});

test('a pin with no coordinate is revealed last rather than dropped', () => {
  const { keys, coordinates } = line(3);
  keys.push('explore:none');
  const steps = staggerRevealPlan(keys, coordinates, STAGGER_STEP_MS, STAGGER_MAX_DELAY_MS);
  assert.equal(steps.length, 4);
  assert.equal(steps[steps.length - 1].key, 'explore:none');
});

// ───────────────────────────── who plays the cascade ─────────────────────────────
// Pins arrive — the first paint, and a region's places swapping in behind the
// camera fit that started a frame earlier — and they get edited: a chip filter, an
// open card, a refetch. Only arriving cascades. The trigger therefore reads the
// region the apply actually carries, which is `dataRegion` (two frames behind
// `adminRegion`) and never `adminRegion` itself.

const syncBody = () => {
  const discover = fs.readFileSync('src/screens/DiscoverScreen.tsx', 'utf8');
  const start = discover.indexOf('const syncPinVisibility = React.useCallback');
  assert.ok(start >= 0, 'the visibility sync is a callback of its own');
  const end = discover.indexOf('}, []);', start);
  assert.ok(end > start, 'the callback body could not be found');
  return discover.slice(start, end);
};

test('the region the apply carries is what triggers the cascade', () => {
  const discover = fs.readFileSync('src/screens/DiscoverScreen.tsx', 'utf8');
  // One snapshot of both, so the pending cascade cannot be spent by an apply that
  // still holds the previous region's keys.
  assert.match(discover, /pinVisibilityStateRef\.current = \{ visiblePinKeys, dataRegion \};/);
  assert.match(syncBody(), /const \{ visiblePinKeys, dataRegion \} = pinVisibilityStateRef\.current;/);
  assert.match(syncBody(), /const regionChanged = staggeredRegionRef\.current !== dataRegion;/);
  assert.match(syncBody(), /const stagger = regionChanged \|\| !pinsEnteredRef\.current;/);
  assert.ok(!syncBody().includes('adminRegion'), 'the camera region is two frames ahead of the pins');
});

test('filters, cards and refetches do not play the cascade', () => {
  ['routeFilters', 'placeGroups', 'pointInfo', 'mapPois', 'publicTrackPois'].forEach((name) => {
    assert.ok(!syncBody().includes(name), `${name} must not decide whether pins cascade`);
  });
});

test('reduced motion never staggers a reveal', () => {
  const globe = fs.readFileSync('src/components/globe/MapGlobe.tsx', 'utf8');
  assert.match(globe, /options\?\.stagger === true && !reduceMotionRef\.current/);
  assert.match(globe, /AccessibilityInfo\.addEventListener\('reduceMotionChanged'/);
});

// ─────────────────────────── the Android entrance ───────────────────────────
// AMap bakes the pin's children into a bitmap, so the rail above cannot run there:
// the fade has to be the marker's own (`grow` → `growAnimation`), and it plays the
// first time the native marker is shown. A marker is shown again for reasons that
// must not replay an entrance, so a pin grows only while the caller's region
// entrance is unspent *and* the pin's key was not on screen at the previous build.

test('Android grows only pins that just arrived, and never replays them', () => {
  const globe = fs.readFileSync('src/components/globe/MapGlobe.tsx', 'utf8');
  const allowed = /const entranceAllowed = Platform\.OS === 'android'\s*&& !reduceMotionRef\.current\s*&& pinEntranceKey != null\s*&& pinEntranceKey !== spentEntranceKeyRef\.current;/;
  assert.match(globe, allowed, 'the native entrance is Android-only, motion-honest, and unspent');
  assert.match(globe, /const grow = entranceAllowed && !shownPinsRef\.current\.has\(key\);/);
  assert.match(globe, /if \(entranceAllowed && values\.length\) spentEntranceKeyRef\.current = pinEntranceKey \?\? null;/);
  // A layer that is hidden or has not loaded has not played an entrance, and the
  // keys it drops must not count as arrivals when it comes back.
  assert.match(globe, /shownPinsRef\.current = new Set\(alphas\.keys\(\)\);/);
  // The answer lives in refs, so it must stay out of the marker memo's deps: the
  // render that changes the region carries that region's pins anyway, and a dep on
  // the key alone would rebuild the whole layer from nothing.
  const memo = globe.slice(globe.indexOf('const poiMarkers = useMemo'));
  const depsStart = memo.indexOf('}, [activePoiId');
  assert.ok(depsStart > 0, 'the pin memo deps could not be found');
  const deps = memo.slice(depsStart, memo.indexOf(']);', depsStart) + 3);
  assert.ok(!deps.includes('pinEntranceKey'), `${deps} must not rebuild markers when only the entrance key moved`);
  assert.ok(!deps.includes('staggerPins'), `${deps} must not rebuild markers when the cascade flips`);

  const discover = fs.readFileSync('src/screens/DiscoverScreen.tsx', 'utf8');
  const entranceArg = discover.slice(discover.indexOf('pinEntranceKey={'));
  assert.match(entranceArg, /^pinEntranceKey=\{dataRegion\}/);

  const android = fs.readFileSync('src/components/maps/NativeMap.android.tsx', 'utf8');
  assert.match(android, /growAnimation=\{marker\.grow\}/);
  const ios = fs.readFileSync('src/components/maps/NativeMap.ios.tsx', 'utf8');
  assert.ok(!ios.includes('growAnimation'), 'MapKit animates annotations itself');
});
