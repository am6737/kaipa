const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { test } = require('node:test');
const ts = require('typescript');

function harness({ bridge = true, available = true, failInit = false } = {}) {
  const calls = [];
  const warnings = [];
  const sdk = {
    setPrivacyConfig() { calls.push('privacy'); },
    initSDK() {
      calls.push('init');
      if (failInit) throw new Error('SDK initialization failed');
    },
    ...(bridge ? { setTerrainEnable(value) { calls.push(['terrain', value]); } } : {}),
  };
  const element = (type, props) => {
    if (type === 'MapView') calls.push('map');
    return { type, props };
  };
  const imports = {
    react: { forwardRef: (render) => render, useRef: (current) => ({ current }), useImperativeHandle() {} },
    'react/jsx-runtime': { jsx: element, jsxs: element },
    'react-native': { View: 'View', StyleSheet: { absoluteFill: {} } },
    '../../lib/coordinates': { wgs84ToGcj02: (p) => p, gcj02ToWgs84: (p) => p },
    'expo-gaode-map': {
      ExpoGaodeMapModule: sdk, MapView: 'MapView', Marker: 'Marker', Polyline: 'Polyline',
      MapType: { Standard: 1, Satellite: 2, Navi: 4 },
    },
  };
  const context = {
    exports: {}, console: { warn: (...args) => warnings.push(args) },
    require(name) {
      if (name === 'expo-gaode-map' && !available) throw new Error('No native module');
      assert.ok(name in imports, `Unexpected import: ${name}`);
      return imports[name];
    },
  };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/components/maps/NativeMap.android.tsx', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, context);
  return {
    calls, warnings,
    available: context.exports.NATIVE_MAP_AVAILABLE,
    render: (props = {}) => context.exports.NativeMap({ initialCenter: [105, 35], ...props }, null),
  };
}

test('enables terrain once, after SDK/privacy initialization and before every map view', () => {
  const h = harness();
  h.render();
  h.render();
  assert.deepEqual(h.calls, ['privacy', 'init', ['terrain', true], 'map', 'map']);
});

test('standard, satellite and legacy terrain share the engine without using Navi', () => {
  const h = harness();
  for (const [mapStyle, mapType] of [['standard', 1], ['satellite', 2], ['terrain', 1], ['standard', 1]]) {
    const view = h.render({ mapStyle }).props.children;
    assert.equal(view.props.mapType, mapType);
    assert.equal(view.props.tiltGesturesEnabled, true);
  }
  assert.equal(h.calls.filter((call) => Array.isArray(call)).length, 1);
});

test('old native binaries retain maps and warn once that a rebuild is needed', () => {
  const h = harness({ bridge: false });
  assert.equal(h.render().props.children.type, 'MapView');
  h.render();
  assert.equal(h.warnings.length, 1);
  assert.match(h.warnings[0][0], /rebuild the Android app/);
});

test('missing native module retains Expo Go fallback', () => {
  const h = harness({ available: false });
  assert.equal(h.available, false);
  assert.equal(h.render().props.children, undefined);
  assert.deepEqual(h.calls, []);
});

test('failed initialization does not create a map or enable terrain', () => {
  const h = harness({ failInit: true });
  assert.equal(h.render().props.children, undefined);
  assert.deepEqual(h.calls, ['privacy', 'init']);
});

test('installed patch exposes a synchronous Android bridge and optional public type', () => {
  const native = fs.readFileSync('node_modules/expo-gaode-map/android/src/main/java/expo/modules/gaodemap/ExpoGaodeMapModule.kt', 'utf8');
  assert.match(native, /Function\("setTerrainEnable"\)\s*\{ enable: Boolean ->\s*MapsInitializer\.setTerrainEnable\(enable\)/);
  const types = fs.readFileSync('node_modules/expo-gaode-map/build/types/native-module.types.d.ts', 'utf8');
  assert.match(types, /setTerrainEnable\?\(enabled: boolean\): void/);
});
