const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const react = {
  createElement: (type, props, ...children) => ({ type, props: { ...props, children } }),
  forwardRef: fn => fn,
  useRef: current => ({ current }),
  useImperativeHandle: () => {},
};
const mockAmap = {
  MapView: 'AndroidMap', Marker: 'Marker', Polyline: 'Polyline', MapType: { Standard: 0 },
  ExpoGaodeMapModule: { setPrivacyConfig() {}, initSDK() {} },
};
const cache = new Map();
function load(file) {
  file = path.resolve(file);
  if (cache.has(file)) return cache.get(file);
  const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true },
  }).outputText;
  const module = { exports: {} };
  const localRequire = name => {
    if (name === 'react') return react;
    if (name === 'react-native') return { View: 'View', StyleSheet: { absoluteFill: {} } };
    if (name === 'react-native-maps') return { __esModule: true, default: 'IOSMap', Marker: 'Marker', Polyline: 'Polyline' };
    if (name === 'expo-gaode-map') return mockAmap;
    if (name.startsWith('.')) return load(path.resolve(path.dirname(file), name) + '.ts');
    return require(name);
  };
  new Function('exports', 'require', 'module', source)(module.exports, localRequire, module);
  cache.set(file, module.exports);
  return module.exports;
}
const { wgs84ToGcj02 } = load('src/lib/coordinates.ts');
const actual = [113.123456, 28.234567];
const providerCoordinate = wgs84ToGcj02(actual);
function nativeMap(platform, callbacks) {
  const { NativeMap } = load(`src/components/maps/NativeMap.${platform}.tsx`);
  const tree = NativeMap({ initialCenter: actual, ...callbacks }, null);
  return platform === 'ios' ? tree.props : tree.props.children[0].props;
}
function poiEvent(platform, coordinate = providerCoordinate) {
  const [longitude, latitude] = coordinate;
  return { nativeEvent: platform === 'ios'
    ? { coordinate: { longitude, latitude }, name: '  山顶营地  ', placeId: 'camp' }
    : { position: { longitude, latitude }, name: '  山顶营地  ', id: 'camp' } };
}
for (const platform of ['ios', 'android']) {
  test(`${platform}: a base-map POI delivers its name and exact WGS-84 coordinate`, () => {
    let selected;
    const props = nativeMap(platform, { onPoiPress: poi => { selected = poi; } });
    props[platform === 'ios' ? 'onPoiClick' : 'onPressPoi'](poiEvent(platform));
    assert.equal(selected.name, '山顶营地');
    assert.equal(selected.id, 'camp');
    assert.ok(Math.abs(selected.coordinate[0] - actual[0]) < 1e-8);
    assert.ok(Math.abs(selected.coordinate[1] - actual[1]) < 1e-8);
  });
  test(`${platform}: the following background tap cannot overwrite the selected POI`, () => {
    let backgroundCalls = 0;
    let poiCalls = 0;
    const props = nativeMap(platform, { onPoiPress: () => { poiCalls++; }, onPress: () => { backgroundCalls++; } });
    props[platform === 'ios' ? 'onPoiClick' : 'onPressPoi'](poiEvent(platform));
    const longitude = providerCoordinate[0] + 0.001, latitude = providerCoordinate[1];
    props[platform === 'ios' ? 'onPress' : 'onMapPress']({ nativeEvent: platform === 'ios' ? { coordinate: { longitude, latitude } } : { longitude, latitude } });
    assert.equal(poiCalls, 1);
    assert.equal(backgroundCalls, 0);
  });
  test(`${platform}: existing maps without a POI handler still receive a coordinate`, () => {
    let selected;
    const props = nativeMap(platform, { onPress: coordinate => { selected = coordinate; } });
    props[platform === 'ios' ? 'onPoiClick' : 'onPressPoi'](poiEvent(platform));
    assert.ok(Math.abs(selected[0] - actual[0]) < 1e-8);
  });
  test(`${platform}: invalid provider coordinates are ignored`, () => {
    let called = false;
    const props = nativeMap(platform, { onPoiPress: () => { called = true; } });
    props[platform === 'ios' ? 'onPoiClick' : 'onPressPoi'](poiEvent(platform, [NaN, 28]));
    assert.equal(called, false);
  });
}

test('iOS: patched POI handlers remain inside their Objective-C method bodies', () => {
  const source = fs.readFileSync('node_modules/react-native-maps/ios/AirMaps/AIRMapManager.m', 'utf8');
  const selection = source.match(/- \(void\)mapView:\(AIRMap \*\)mapView didSelectAnnotationView:\(MKAnnotationView \*\)view\s*\{([\s\S]*?)\n\}\s*- \(void\)mapView:\(AIRMap \*\)mapView didDeselectAnnotationView:/);
  assert.ok(selection, 'selection handler must open its body before the POI availability guard');
  assert.match(selection[1], /MKMapFeatureAnnotation/);
  assert.match(selection[1], /emitPoi\(feature\.title\)/);
  assert.match(selection[1], /showCalloutView/);
  const deselection = source.match(/didDeselectAnnotationView:\(MKAnnotationView \*\)view\s*\{([\s\S]*?)\n\}/);
  assert.ok(deselection);
  assert.match(deselection[1], /MKMapFeatureAnnotation/);
  assert.match(deselection[1], /\[mapView\.poiMapItemRequest cancel\]/);
  assert.match(deselection[1], /hideCalloutView/);
  const patch = fs.readFileSync('patches/react-native-maps+1.27.2.patch', 'utf8');
  assert.doesNotMatch(patch, /^@@ -\d+,0 /m, 'native patch hunks need source context, not line-only insertion');
});
