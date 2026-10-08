const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
let slots = [], cursor = 0, lookups = [];
const react = {
  Component: class {},
  createElement: (type, props, ...children) => ({ type, props: { ...props, children } }),
  useState: initial => { const i = cursor++; if (!(i in slots)) slots[i] = initial; return [slots[i], value => { slots[i] = typeof value === 'function' ? value(slots[i]) : value; }]; },
  useRef: initial => { const i = cursor++; if (!(i in slots)) slots[i] = { current: initial }; return slots[i]; },
  useMemo: fn => fn(), useEffect: () => {},
};
const rn = {
  View: 'View', Text: 'Text', Modal: 'Modal', Pressable: 'Pressable', ScrollView: 'ScrollView', TextInput: 'TextInput', KeyboardAvoidingView: 'KeyboardAvoidingView',
  Keyboard: { dismiss() {} }, StyleSheet: { create: value => value, absoluteFill: {} },
  Platform: { OS: 'ios', select: values => values.ios ?? values.default }, useWindowDimensions: () => ({ width: 390, height: 844 }),
};
const cache = new Map();
function load(file) {
  file = path.resolve(file);
  if (cache.has(file)) return cache.get(file);
  const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true } }).outputText;
  const module = { exports: {} };
  const localRequire = name => {
    if (name === 'react') return react;
    if (name === 'react-native') return rn;
    if (name === 'react-native-safe-area-context') return { useSafeAreaInsets: () => ({ top: 0, bottom: 0 }) };
    if (name.endsWith('/i18n')) return { useI18n: () => ({ resolved: 'zh', t: key => ({ 'journey.timeline.trackMapPointSelected': '已选位置' }[key] ?? key) }) };
    if (name.endsWith('/amapGeocoding')) return { hasAmapGeocoding: () => true, reverseJourneyLocation: (lng, lat, language, signal) => new Promise(resolve => { lookups.push({ lng, lat, signal, resolve }); }) };
    if (name === './TrackMap') return { TrackMap: 'TrackMap' };
    if (name.endsWith('/maps/NativeMap')) return { NATIVE_MAP_AVAILABLE: true };
    if (name.endsWith('/MapPresentationContext')) return { useMapPresentation: () => ({ mapStyle: 'standard', mapLabelsVisible: true }) };
    if (name.endsWith('/Press')) return { Press: 'Press' };
    if (name.endsWith('/Icon')) return { Icon: 'Icon' };
    if (name.endsWith('/CircleBtn')) return { CircleBtn: 'CircleBtn' };
    if (name.endsWith('/design-system')) return load('src/design-system/tokens.ts');
    if (name.startsWith('.')) {
      const base = path.resolve(path.dirname(file), name);
      const target = [base + '.ts', base + '.tsx'].find(fs.existsSync);
      return load(target);
    }
    return require(name);
  };
  new Function('exports', 'require', 'module', source)(module.exports, localRequire, module);
  cache.set(file, module.exports);
  return module.exports;
}
const { measureTrack } = load('src/lib/routeSegments.ts');
const { TrackPointPickerSheet } = load('src/components/overlays/TrackPointPicker.tsx');
function find(tree, predicate) {
  if (!tree || typeof tree !== 'object') return null;
  if (predicate(tree)) return tree;
  for (const child of (tree.props?.children ?? []).flat(Infinity)) { const result = find(child, predicate); if (result) return result; }
  return null;
}
function harness() {
  slots = []; lookups = [];
  const coords = [[100, 30], [100, 30.01], [100, 30.02]];
  const track = { id: 'track-1', name: '路线', coords, measure: measureTrack(coords), totalMeters: measureTrack(coords).totalMeters, waypoints: [{ name: '原有标注', coordinate: coords[1], meters: 1100 }] };
  const saved = [];
  const render = () => { cursor = 0; return TrackPointPickerSheet({ theme: { dark: false }, tracks: [track], onClose() {}, onPick: location => saved.push(location) }); };
  return { render, map: () => find(render(), node => node.type === 'TrackMap').props, saved };
}
test('a tapped POI shows its actual name on the map and keeps it when its address resolves', async () => {
  const h = harness(), coordinate = [100.0004, 30.01];
  const pending = h.map().onPoiPress({ name: '山顶营地', coordinate });
  assert.equal(h.map().scrubLabel, '山顶营地');
  lookups[0].resolve({ name: '某乡镇', address: '营地完整地址' });
  await pending;
  assert.equal(h.map().scrubLabel, '山顶营地');
  assert.deepEqual(h.map().scrubPt, coordinate);
  const confirm = find(h.render(), node => node.type === 'Press' && node.props.accessibilityState?.disabled === false);
  confirm.props.onPress();
  assert.equal(h.saved[0].name, '山顶营地');
  assert.equal(h.saved[0].address, '营地完整地址');
  assert.equal(h.saved[0].longitude, coordinate[0]);
});
test('a background point resolves a visible address without snapping its coordinate to the track', async () => {
  const h = harness(), coordinate = [100.0004, 30.01];
  const pending = h.map().onMapPress(coordinate);
  assert.equal(h.map().scrubLabel, '已选位置');
  lookups[0].resolve({ name: '某乡镇', address: '地图上的实际地址' });
  await pending;
  assert.equal(h.map().scrubLabel, '地图上的实际地址');
  assert.deepEqual(h.map().scrubPt, coordinate);
});
test('a late lookup cannot replace a newer selection', async () => {
  const h = harness();
  const first = h.map().onMapPress([100.0004, 30.005]);
  const secondCoordinate = [100.0006, 30.015];
  const second = h.map().onPoiPress({ name: '第二个地点', coordinate: secondCoordinate });
  assert.equal(lookups[0].signal.aborted, true);
  lookups[0].resolve({ name: '旧地点', address: '旧地址' });
  await first;
  assert.equal(h.map().scrubLabel, '第二个地点');
  lookups[1].resolve({ name: '新地址', address: '新地址' });
  await second;
  assert.deepEqual(h.map().scrubPt, secondCoordinate);
});
test('choosing a waypoint cancels the pending background lookup and keeps the waypoint name', async () => {
  const h = harness();
  const pending = h.map().onMapPress([100.0004, 30.005]);
  const props = h.map();
  props.onWaypointPress(props.waypoints[0]);
  assert.equal(lookups[0].signal.aborted, true);
  lookups[0].resolve({ name: '旧地点', address: '旧地址' });
  await pending;
  assert.equal(h.map().scrubLabel, '原有标注');
});
