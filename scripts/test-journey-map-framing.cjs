const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { test } = require('node:test');
const ts = require('typescript');

function loadMap() {
  const calls = [];
  const effects = [];
  let effectIndex = 0;
  const camera = Object.fromEntries(['fitCoordinates', 'moveCamera', 'resetNorth'].map(name => [
    name, (...args) => calls.push({ name, args }),
  ]));
  const react = {
    createElement: (type, props, ...children) => ({ type, props: { ...props, children } }),
    useCallback: fn => fn,
    useMemo: fn => fn(),
    useRef: () => ({ current: camera }),
    useState: value => [typeof value === 'function' ? value() : value, () => {}],
    useEffect: (fn, deps) => {
      const index = effectIndex++;
      const previous = effects[index];
      // No deps array means "after every render", which is how MapGlobe keeps
      // its press-callback refs current.
      const changed = !deps || !previous || !previous.deps
        || deps.some((value, i) => !Object.is(value, previous.deps[i]));
      effects[index] = { deps, fn, changed };
    },
  };
  react.default = react;
  const isValidMapCoordinate = (coord) => Array.isArray(coord) && coord.length === 2 && coord.every(Number.isFinite);
  const mocks = {
    react,
    'react-native': {
      View: 'View', Text: 'Text', Pressable: 'Pressable',
      Animated: { Value: class { constructor(value) { this.value = value; } } },
      Platform: { OS: 'ios' },
      StyleSheet: { create: styles => styles, absoluteFill: {}, hairlineWidth: 1 },
      useWindowDimensions: () => ({ height: 844 }),
    },
    '../Icon': { Icon: 'Icon' },
    '../maps/NativeMap': { NativeMap: 'NativeMap' },
    '../maps/extent': { trackSpanOnScreen: () => 0, trackWorldSpan: () => null },
    '../maps/types': {
      isValidMapCoordinate: isValidMapCoordinate,
      keepValidCoordinates: coordinates => (coordinates ?? []).filter(isValidMapCoordinate),
    },
    '../StaggerIn': { STAGGER_MAX_DELAY_MS: 0, STAGGER_STEP_MS: 0 },
    './CurrentLocationMarker': { CurrentLocationMarker: 'CurrentLocationMarker' },
    './PhotoPin': { PhotoPin: 'PhotoPin', photoPinScaleForZoom: () => 1 },
    '../../lib/routeSegments': { measureTrack: () => ({ totalMeters: 0 }), positionAtDistance: () => null },
  };
  const js = ts.transpileModule(fs.readFileSync('src/components/globe/MapGlobe.tsx', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React },
  }).outputText;
  const context = { exports: {}, require: name => {
    assert.ok(name in mocks, `Unexpected dependency: ${name}`);
    return mocks[name];
  } };
  vm.runInNewContext(js, context);
  return {
    calls,
    render(props) {
      effectIndex = 0;
      const tree = context.exports.default(props);
      effects.forEach(effect => { if (effect.changed) effect.fn(); });
      return tree.props.children[0];
    },
  };
}

for (const dark of [false, true]) {
  test(`sheet framing pauses after a gesture and resumes on route reset (${dark ? 'dark' : 'light'})`, () => {
    const { render, calls } = loadMap();
    const props = {
      theme: { dark }, pois: [], focusCoords: [[100, 30], [101, 31]],
      focusBottomPadding: 450, autoFrameRoute: true,
      onCameraGestureStart: () => { props.autoFrameRoute = false; },
    };
    let map = render(props);
    assert.equal(calls.length, 1);
    props.focusBottomPadding = 100;
    map = render(props);
    assert.equal(calls.at(-1).args[1][2], 100);
    props.focusBottomPadding = 450;
    map = render(props);
    assert.equal(calls.at(-1).args[1][2], 450);
    map.props.onGestureStart();
    const count = calls.length;
    render(props);
    props.focusBottomPadding = 100;
    render(props);
    props.focusBottomPadding = 450;
    render(props);
    assert.equal(calls.length, count);
    props.autoFrameRoute = true;
    props.cameraAction = { type: 'fitRoute', revision: 1 };
    render(props);
    assert.equal(calls.at(-1).args[2], 650);
    props.focusBottomPadding = 100;
    render(props);
    assert.equal(calls.at(-1).args[1][2], 100);
    assert.equal(calls.at(-1).args[2], 250);
  });
}

test('explicit camera commands remain available while automatic framing is paused', () => {
  const { render, calls } = loadMap();
  const props = { theme: {}, pois: [], focusCoords: [[100, 30]], autoFrameRoute: false };
  render(props);
  assert.equal(calls.length, 0);
  render({ ...props, cameraAction: { type: 'fitRoute', revision: 1 } });
  assert.equal(calls.at(-1).name, 'moveCamera');
  render({ ...props, cameraAction: { type: 'resetNorth', revision: 2 } });
  assert.equal(calls.at(-1).name, 'resetNorth');
});

test('a day with a single place frames it against the card, not the middle of the view', () => {
  const { render, calls } = loadMap();
  render({
    theme: {}, pois: [], focusCoords: [], autoFrameRoute: false, focusBottomPadding: 450,
    cameraAction: { type: 'fitCoordinates', revision: 1, coordinates: [[100, 30]] },
  });
  const call = calls.at(-1);
  assert.equal(call.name, 'moveCamera');
  // The padding array is built inside the vm context, so compare by value.
  assert.equal(call.args[3].edgePadding.join(','), '90,54,450,54');
});

test('a card pulled over the whole map leaves a frameable strip above it', () => {
  const { render, calls } = loadMap();
  render({
    theme: {}, pois: [], focusCoords: [[100, 30], [101, 31]], autoFrameRoute: true, focusBottomPadding: 800,
  });
  // The harness window is 844 tall, so 800pt of bottom padding plus the usual
  // 90pt top would ask for a box with negative height.
  assert.equal(calls.at(-1).args[1].join(','), '4,54,800,54');
});

function loadIosMap() {
  const react = {
    default: { forwardRef: fn => fn, useRef: () => ({ current: null }) },
    forwardRef: fn => fn,
    useRef: () => ({ current: null }),
  };
  const mocks = {
    react,
    'react-native-maps': { default: 'MapView', Marker: 'Marker', Polyline: 'Polyline' },
    './types': { projectTrack: coordinates => coordinates },
    '../../lib/coordinates': { gcj02ToWgs84: value => value, wgs84ToGcj02: value => value },
  };
  const js = ts.transpileModule(fs.readFileSync('src/components/maps/NativeMap.ios.tsx', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React },
  }).outputText;
  const context = { exports: {}, require: name => {
    assert.ok(name in mocks, `Unexpected dependency: ${name}`);
    return mocks[name];
  } };
  vm.runInNewContext(js, context);
  return context.exports;
}

test('the single-point iOS camera puts the target in the padded box', () => {
  const { offsetCenter } = loadIosMap();
  const size = { width: 390, height: 844 };
  const edgePadding = [90, 54, 450, 54];
  const delta = 360 / 2 ** 12;
  const center = offsetCenter([100, 30], 12, edgePadding, size);
  // Where the target actually lands, given the region centred on `center`.
  const y = ((center[1] + delta / 2) - 30) / delta * size.height;
  const expectedY = (edgePadding[0] + (size.height - edgePadding[2])) / 2;
  assert.ok(Math.abs(y - expectedY) < 0.01, `expected y=${expectedY}, got ${y}`);
  assert.equal(center[0], 100);
  assert.deepEqual(offsetCenter([100, 30], 12, undefined, size), [100, 30]);
});
