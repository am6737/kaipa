// The pin layer must not be rebuilt by anything that only changes the overlay
// layer. Measured on device: opening a route card zooms the camera in, the zoom
// flips `trackEndpointsVisible` and re-steps `distanceStepKm`, and the one memo
// that mixed both layers then rebuilt 85 pin markers mid-animation — a 510ms
// JS-thread block (jsDrift=516ms) with nothing else scheduled.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { test } = require('node:test');
const ts = require('typescript');

/** The extent module is dependency-free, so both harnesses can use the real thing. */
function loadExtent() {
  const js = ts.transpileModule(fs.readFileSync('src/components/maps/extent.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const context = { exports: {} };
  vm.runInNewContext(js, context);
  return context.exports;
}

const MAP_GLOBE = 'src/components/globe/MapGlobe.tsx';
const IOS_MAP = 'src/components/maps/NativeMap.ios.tsx';

function transpile(file) {
  return ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React },
  }).outputText;
}

function realm(js, mocks, globals) {
  const context = {
    exports: {},
    // The realm stands in for a dev bundle: MapGlobe's temporary frame probe is
    // behind __DEV__, and a missing global there is a ReferenceError.
    __DEV__: true,
    require: (name) => {
      assert.ok(name in mocks, `Unexpected dependency: ${name}`);
      return mocks[name];
    },
    ...globals,
  };
  vm.runInNewContext(js, context);
  return context.exports;
}

function sameDeps(previous, next) {
  return !!previous && !!next && previous.length === next.length
    && next.every((value, index) => Object.is(value, previous[index]));
}

/**
 * A fake React that actually keeps state, so a `setState` inside an event
 * handler re-renders and every memo is judged against its real dependency list.
 * The framing test's stateless fake cannot express the bug under test: with
 * `useMemo: fn => fn()` every memo recomputes, so identity is never preserved
 * and never lost.
 */
function statefulReact(onTree) {
  const cells = [];
  const effects = [];
  let hookIndex = 0;
  let effectIndex = 0;
  let current = null;
  let rendering = false;

  const cell = (index) => {
    while (cells.length <= index) cells.push({});
    return cells[index];
  };

  const react = {
    createElement: (type, props, ...children) => ({ type, props: { ...props, children } }),
    useState(initial) {
      const state = cell(hookIndex++);
      if (!('value' in state)) state.value = typeof initial === 'function' ? initial() : initial;
      return [state.value, (next) => {
        state.value = typeof next === 'function' ? next(state.value) : next;
        // Every handler under test fires between renders; a setState during one
        // would need a real scheduler.
        if (!rendering) api.render(current.props, current.component);
      }];
    },
    useRef(initial) {
      const state = cell(hookIndex++);
      if (!('value' in state)) state.value = { current: initial };
      return state.value;
    },
    useMemo(fn, deps) {
      const state = cell(hookIndex++);
      if (!('value' in state) || !sameDeps(state.deps, deps)) {
        state.value = fn();
        state.deps = deps;
      }
      return state.value;
    },
    useCallback(fn, deps) { return react.useMemo(() => fn, deps); },
    useEffect(fn, deps) {
      const index = effectIndex++;
      const previous = effects[index];
      effects[index] = {
        deps,
        fn,
        cleanup: previous?.cleanup,
        changed: !previous || !sameDeps(previous.deps, deps),
      };
    },
    useImperativeHandle() {},
  };
  react.default = react;

  const api = {
    react,
    render(props, component) {
      current = { props, component };
      hookIndex = 0;
      effectIndex = 0;
      rendering = true;
      const tree = component(props);
      rendering = false;
      effects.forEach((effect) => {
        if (!effect.changed) return;
        if (typeof effect.cleanup === 'function') effect.cleanup();
        effect.cleanup = effect.fn();
        effect.changed = false;
      });
      onTree?.(tree);
      return tree;
    },
    flushTimers(timers) {
      timers.splice(0, timers.length).forEach((entry) => entry.fn());
    },
  };
  return api;
}

/** Manual clock: MapGlobe arms a 180ms debounce and the realm has no timers. */
function timers() {
  const queue = [];
  return {
    queue,
    globals: {
      setTimeout: (fn) => { const entry = { fn }; queue.push(entry); return entry; },
      clearTimeout: (entry) => { const at = queue.indexOf(entry); if (at >= 0) queue.splice(at, 1); },
    },
  };
}

function loadGlobe() {
  const { queue, globals } = timers();
  // Every render is observed, including the ones a setState inside an event
  // handler starts: the transitions under test are driven that way.
  let latest = null;
  const api = statefulReact((tree) => { latest = tree.props.children[0]; });
  const isValidMapCoordinate = (coord) => Array.isArray(coord) && coord.length === 2 && coord.every(Number.isFinite);
  const mocks = {
    react: api.react,
    'react-native': {
      View: 'View', Text: 'Text', Pressable: 'Pressable',
      Animated: {
        Value: class { constructor(value) { this.value = value; } setValue(value) { this.value = value; } },
        View: 'Animated.View',
        delay: () => ({ start() {} }),
        timing: () => ({ start() {} }),
        sequence: () => ({ start() {} }),
      },
      Easing: { out: (fn) => fn, cubic: (t) => t },
      Platform: { OS: 'ios' },
      StyleSheet: { create: (styles) => styles, absoluteFill: {}, hairlineWidth: 1 },
      useWindowDimensions: () => ({ width: 390, height: 844 }),
    },
    '../Icon': { Icon: 'Icon' },
    '../maps/NativeMap': { NativeMap: 'NativeMap' },
    // Span grows with zoom so that crossing MIN_TRACK_ENDPOINT_PIXELS (100) at
    // zoom 5 flips the endpoint markers on — the transition the device hit.
    // Real extent maths: the tolerance the tracks are drawn at is part of what
    // the pin memo must survive.
    '../maps/extent': loadExtent(),
    '../maps/types': { isValidMapCoordinate, keepValidCoordinates: (coords) => (coords ?? []).filter(isValidMapCoordinate) },
    '../StaggerIn': { STAGGER_MAX_DELAY_MS: 0, STAGGER_STEP_MS: 0 },
    './CurrentLocationMarker': { CurrentLocationMarker: 'CurrentLocationMarker' },
    './PhotoPin': {
      PhotoPin: 'PhotoPin',
      PHOTO_PIN_ANCHOR_Y: 20 / 70,
      PHOTO_PIN_WIDTH: 116,
      PHOTO_PIN_HEIGHT: 70,
      PHOTO_SIZE: 40,
      photoPinScaleForZoom: () => 1,
    },
    // The real geometry: a press on a hidden pin now resolves through it.
    '../../lib/pinOverlap': realm(transpile('src/lib/pinOverlap.ts'), {}, {}),
    '../../lib/routeSegments': { measureTrack: () => ({ totalMeters: 42000 }), positionAtDistance: () => ({ coordinate: [100, 30] }) },
  };
  const component = realm(transpile(MAP_GLOBE), mocks, globals).default;
  return {
    /** The NativeMap element from the most recent render, however it started. */
    render(props) {
      api.render(props, component);
      return latest;
    },
    get markers() { return latest.props.markers; },
    flushTimers() { api.flushTimers(queue); },
  };
}

const THEME = { dark: false, accent: '#f00', danger: '#d00', text: '#000', fieldSurface: '#fff', trailFaint: '#eee' };
const TRACK = [[100, 30], [100.5, 30.5]];
// The identity of this array is what the caller's own memo guarantees: the pins
// do not change when a card opens, only the camera does.
const POIS = [
  { id: 'p1', lng: 100, lat: 30, label: '一', layer: 'explore' },
  { id: 'p2', lng: 101, lat: 31, label: '二', layer: 'explore' },
  { id: 'p3', lng: 102, lat: 32, label: '三', layer: 'memory' },
];

const baseProps = (overrides) => ({ theme: THEME, pois: POIS, autoFrameRoute: false, ...overrides });
const pinsOf = (markers) => markers.filter((marker) => marker.id.startsWith('poi-'));

function assertSamePins(before, after, cause) {
  assert.deepEqual(pinsOf(after).map((marker) => marker.id), before.map((marker) => marker.id));
  pinsOf(after).forEach((marker, index) => {
    // Same objects, not equal-looking replacements: a replacement re-renders
    // every PhotoPin subtree and, on iOS, re-snapshots it into a bitmap.
    assert.equal(marker, before[index], `${marker.id} was rebuilt by ${cause}`);
    assert.equal(marker.content, before[index].content, `${marker.id} content was rebuilt by ${cause}`);
    assert.equal(marker.onPress, before[index].onPress, `${marker.id} onPress was rebuilt by ${cause}`);
  });
}

test('a zoom that turns the track endpoints on does not rebuild the pins', () => {
  const globe = loadGlobe();
  const map = globe.render(baseProps({ focusCoords: TRACK }));
  const before = pinsOf(globe.markers);
  assert.equal(before.length, 3);

  map.props.onZoomChange(3); // 60px on screen: under the 100px floor
  assert.ok(!globe.markers.some((marker) => marker.id === 'focus-start'));
  map.props.onZoomChange(8); // 160px: the endpoint markers appear
  assert.ok(globe.markers.some((marker) => marker.id === 'focus-start'), 'endpoints appeared');
  assert.ok(globe.markers.some((marker) => marker.id === 'focus-end'), 'both endpoints appeared');
  assertSamePins(before, globe.markers, 'a zoom change');
});

test('a zoom that re-steps the kilometre labels does not rebuild the pins', () => {
  const globe = loadGlobe();
  const map = globe.render(baseProps({ focusCoords: TRACK, showDistanceMarkers: true }));
  const before = pinsOf(globe.markers);
  const labelsBefore = globe.markers.filter((marker) => marker.id.startsWith('route-distance-'));
  assert.ok(labelsBefore.length > 1, 'labels on');

  map.props.onZoomChange(12); // the 10km step becomes 5km, once the camera is quiet
  globe.flushTimers();
  const labelsAfter = globe.markers.filter((marker) => marker.id.startsWith('route-distance-'));
  assert.notEqual(labelsAfter.length, labelsBefore.length, 'the label density actually changed');
  assertSamePins(before, globe.markers, 'a distance-step change');
});

test('an empty overlay layer hands NativeMap the same array it already had', () => {
  const globe = loadGlobe();
  const props = baseProps({ focusCoords: TRACK });
  const first = globe.render(props);
  const second = globe.render(props);
  assert.equal(first.props.markers, second.props.markers);
});

// ───────────────────────────── the element cache ─────────────────────────────

function loadIosMap() {
  let projectTrackCalls = 0;
  const react = {
    forwardRef: (fn) => fn,
    useRef: (initial) => ({ current: initial }),
    useImperativeHandle: () => {},
    createElement: (type, props, ...children) => ({ type, props: { ...props, children } }),
  };
  react.default = react;
  const mocks = {
    react,
    'react-native-maps': { default: 'MapView', Marker: 'Marker', Polyline: 'Polyline' },
    './types': {
      projectTrack: (coordinates) => { projectTrackCalls += 1; return coordinates; },
      withColorAlpha: (color) => color,
    },
    '../../lib/coordinates': { gcj02ToWgs84: (value) => value, wgs84ToGcj02: (value) => value },
  };
  return {
    component: realm(transpile(IOS_MAP), mocks, {}).NativeMap,
    projectTrackCalls: () => projectTrackCalls,
  };
}

const IOS_PROPS = { style: {}, initialCenter: [100, 30], initialZoom: 5, markers: [], polylines: [] };
// The two annotation layers are the MapView's two child expressions, in order.
const polylineElements = (tree) => tree.props.children[0];
const markerElements = (tree) => tree.props.children[1];

test('an unchanged marker keeps the identical element across renders', () => {
  const { component, projectTrackCalls } = loadIosMap();
  const marker = { id: 'poi-x', coordinate: [100, 30], content: { type: 'PhotoPin' } };
  const line = { id: 'leg', coordinates: TRACK, color: '#f00', width: 4, opacity: 1 };

  const first = component({ ...IOS_PROPS, markers: [marker], polylines: [line] }, null);
  const projected = projectTrackCalls();
  const second = component({ ...IOS_PROPS, markers: [marker], polylines: [line] }, null);

  assert.equal(polylineElements(second)[0], polylineElements(first)[0], 'the polyline element was rebuilt');
  assert.equal(markerElements(second)[0], markerElements(first)[0], 'the marker element was rebuilt');
  assert.equal(projectTrackCalls(), projected, 'a 1500-point track was re-projected for an unchanged line');
});

test('a rebuilt marker gets a new element', () => {
  const { component } = loadIosMap();
  const marker = { id: 'poi-x', coordinate: [100, 30], content: { type: 'PhotoPin' } };
  const first = component({ ...IOS_PROPS, markers: [marker] }, null);
  const changed = { ...marker, coordinate: [101, 31] };
  const second = component({ ...IOS_PROPS, markers: [changed] }, null);

  assert.notEqual(markerElements(second)[0], markerElements(first)[0], 'a changed marker kept the stale element');
  // Compared field by field: the coordinate is built inside the vm realm, and
  // a cross-realm deepEqual fails on the prototype alone.
  const coordinate = markerElements(second)[0].props.coordinate;
  assert.equal(coordinate.longitude, 101);
  assert.equal(coordinate.latitude, 31);
});

// ─────────────────────────── the fit's own input ───────────────────────────
// A fit is an extent question, and both SDKs answer it from the min/max of the
// points they are given. So the four bounding-box corners must describe the very
// same region the whole track does - otherwise the camera that opens a card would
// be framing something else.

function loadMapTypes() {
  const coordinates = realm(transpile('src/lib/coordinates.ts'), {}, {});
  const identity = (value) => value;
  const mocks = {
    react: { default: {} },
    'react-native': {},
    '../../lib/coordinates': {
      wgs84ToGcj02: coordinates.wgs84ToGcj02 ?? identity,
      gcj02ToWgs84: coordinates.gcj02ToWgs84 ?? identity,
    },
  };
  return realm(transpile('src/components/maps/types.ts'), mocks, {});
}

test('the bounding box corners hold every point of the track', () => {
  const { fitBoundsCorners } = loadMapTypes();
  const track = Array.from({ length: 1549 }, (_, index) => [
    100 + Math.sin(index / 37) * 0.8 + index * 0.0004,
    30 + Math.cos(index / 53) * 0.35,
  ]);
  const corners = fitBoundsCorners(track);
  assert.equal(corners.length, 4, 'the fit should cross the bridge with four points, not 1549');

  const minLng = Math.min(...corners.map(([lng]) => lng));
  const maxLng = Math.max(...corners.map(([lng]) => lng));
  const minLat = Math.min(...corners.map(([, lat]) => lat));
  const maxLat = Math.max(...corners.map(([, lat]) => lat));
  // Containment is half of it; tightness is the other half. A box that is merely
  // big enough would fit the camera out too far.
  track.forEach(([lng, lat]) => {
    assert.ok(lng >= minLng && lng <= maxLng && lat >= minLat && lat <= maxLat, 'a point fell outside');
  });
  assert.ok(track.some(([lng]) => lng === minLng), 'the west edge is not a real extreme');
  assert.ok(track.some(([lng]) => lng === maxLng), 'the east edge is not a real extreme');
  assert.ok(track.some(([, lat]) => lat === minLat), 'the south edge is not a real extreme');
  assert.ok(track.some(([, lat]) => lat === maxLat), 'the north edge is not a real extreme');
});

test('the corners pass a single point through and skip unusable ones', () => {
  const { fitBoundsCorners } = loadMapTypes();
  const single = [[100, 30]];
  assert.equal(fitBoundsCorners(single), single, 'a one-point fit must not be rebuilt as a box');
  assert.equal(fitBoundsCorners([]).length, 0);
  const withBad = [[100, 30], [101, 31], [Number.NaN, 20]];
  const corners = fitBoundsCorners(withBad);
  assert.equal(corners.length, 4);
  assert.ok(corners.every(([lng, lat]) => Number.isFinite(lng) && Number.isFinite(lat)), 'NaN leaked into the fit');
});

test('the frame that opens a card carries the track once, not twice over', () => {
  // The card frames a route into the space above it, so the vertices past what
  // that framing resolves are invisible weight - and this is the commit that also
  // starts the camera animation.
  const globe = loadGlobe();
  const track = Array.from({ length: 1549 }, (_, index) => {
    const step = index / 1549;
    return [
      100 + step * 0.6 + Math.sin(step * 9) * 0.01,
      30 + step * 0.4 + Math.cos(step * 13) * 0.008 + (index % 3) * 0.00001,
    ];
  });
  const map = globe.render(baseProps({ focusCoords: track }));
  const drawn = map.props.polylines[0].coordinates;

  assert.ok(drawn.length * 4 < track.length, `the fit drew ${drawn.length} of ${track.length} points`);
  assert.equal(drawn[0], track[0], 'the track lost its start');
  assert.equal(drawn[drawn.length - 1], track[track.length - 1], 'the track lost its end');
  // Where the camera settles *coarser* than the framing, the framing already
  // resolved everything on screen: the identical array has to come back, or the
  // native polyline gets a new shape for no visible reason.
  map.props.onZoomChange(3);
  globe.flushTimers();
  assert.equal(
    globe.render(baseProps({ focusCoords: track })).props.polylines[0].coordinates,
    drawn,
    'a camera move coarser than the framing re-drew the line',
  );
  // Zoomed past the framing the user is resolving detail the fit could not see, so
  // the line does gain vertices - once, after the camera has been quiet.
  map.props.onZoomChange(14);
  globe.flushTimers();
  const detailed = globe.render(baseProps({ focusCoords: track })).props.polylines[0].coordinates;
  assert.ok(detailed.length > drawn.length, `zooming in did not restore detail (${detailed.length} vs ${drawn.length})`);
  assert.ok(detailed.length <= track.length, 'detail went past what was recorded');
});

// ──────────────────────────── the blocked press ────────────────────────────
// Both mode layers stay mounted and the one the user is not looking at is hidden
// by its content's opacity — which leaves the hidden pin's native annotation
// perfectly interactive. On device that reads as "the first tap after I close a
// card does nothing, the second one works": MapKit handed the tap to an invisible
// pin from the other layer whose 116x70 frame happened to be on top.
const STACK = [
  { id: 'hidden', lng: 100, lat: 30, label: '隐', layer: 'explore' },
  { id: 'shown', lng: 100.4, lat: 30, label: '见', layer: 'memory' },
  { id: 'far', lng: 120, lat: 30, label: '远', layer: 'memory' },
];

function globeWithRail() {
  const api = { current: null };
  const pressed = [];
  const globe = loadGlobe();
  const props = baseProps({
    pois: STACK,
    pinVisibilityApi: api,
    onPoiPress: (id) => pressed.push(id),
  });
  globe.render(props);
  return { globe, api, pressed, props };
}

const pressPin = (globe, key) => {
  const marker = globe.markers.find((entry) => entry.id === `poi-${key}`);
  assert.ok(marker, `no ${key} annotation on the map`);
  marker.onPress();
};

test('a press the rail blocks is re-attributed to the visible pin under the frame', () => {
  const { globe, api, pressed } = globeWithRail();
  api.current.apply(new Set(['memory:shown', 'memory:far']));
  assert.deepEqual(pressed, [], 'nothing presses itself');

  // 0.4° apart at the initial zoom-3 world: the visible photo sits entirely
  // inside the invisible frame, so the user was pointing at it.
  pressPin(globe, 'explore:hidden');
  assert.deepEqual(pressed, ['shown'], 'the tap should open the pin the user could see');
});

test('a blocked press with no visible pin under it stays dropped', () => {
  const { globe, api, pressed } = globeWithRail();
  // Only the pin 20° away may be seen: nothing the user could have meant was
  // under the invisible frame, and guessing would open the wrong journey.
  api.current.apply(new Set(['memory:far']));
  pressPin(globe, 'explore:hidden');
  assert.deepEqual(pressed, [], 'the press must not teleport to a distant pin');
});

test('a visible pin still presses itself, rail or no rail', () => {
  const { globe, api, pressed } = globeWithRail();
  api.current.apply(new Set(['memory:shown', 'memory:far']));
  pressPin(globe, 'memory:shown');
  assert.deepEqual(pressed, ['shown']);
});

