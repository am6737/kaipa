const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { test } = require('node:test');
const ts = require('typescript');

// Run the real component callbacks with a small React element/hook harness.
// Network/storage correctness is covered separately by the hook and real DB probe.
function componentHarness(file, name, overrides = {}) {
  const state = [];
  let cursor = 0, sequence = 0;
  const react = {
    useState(initial) {
      const i = cursor++;
      if (!(i in state)) state[i] = typeof initial === 'function' ? initial() : initial;
      return [state[i], (next) => { state[i] = typeof next === 'function' ? next(state[i]) : next; }];
    },
    useRef(initial) {
      const i = cursor++;
      if (!(i in state)) state[i] = { current: initial };
      return state[i];
    },
    useCallback: (f) => f,
    useMemo: (f) => f(),
    createElement: (type, props, ...children) => ({ type, props: { ...props, children } }),
  };
  const mocks = {
    react,
    'react-native': {
      View: 'View', Text: 'Text', TextInput: 'TextInput', Pressable: 'Pressable', ScrollView: 'ScrollView',
      StyleSheet: { create: (v) => v, absoluteFill: {} }, useWindowDimensions: () => ({ width: 400, height: 800 }),
    },
    'expo-image': { Image: 'Image' },
    'expo-image-picker': { launchImageLibraryAsync: async () => ({ canceled: true }) },
    'expo-linear-gradient': { LinearGradient: 'LinearGradient' },
    'react-native-svg': { default: 'Svg', Path: 'Path' },
    '../theme/fonts': { SERIF: 'serif' },
    '../components/PhotoTile': { PhotoTile: 'PhotoTile' },
    '../components/Avatar': { Avatar: 'Avatar' },
    '../components/Press': { Press: 'Press' },
    '../i18n': { useI18n: () => ({ t: (key) => key }) },
    '../design-system': { space: { sm: 12 }, type: { hint: {} } },
    '../data/tones': { paletteFor: () => ['color'] },
    './GuestLightbox': { GuestLightbox: 'GuestLightbox' },
    './GuestUploadSheet': { GuestUploadSheet: 'GuestUploadSheet' },
    './GuestSaveSheet': { GuestSaveSheet: 'GuestSaveSheet' },
    ...overrides,
  };
  const context = vm.createContext({
    exports: {}, Error, crypto: { randomUUID: () => `submission-${++sequence}` },
    require: (key) => { assert.ok(key in mocks, `Unexpected dependency: ${key}`); return mocks[key]; },
  });
  vm.runInContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true },
  }).outputText, context);
  return {
    render(props) { cursor = 0; return context.exports[name](props); },
    remount() { state.length = 0; },
  };
}
function nodes(tree) {
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  if (!tree || typeof tree !== 'object') return [];
  return [tree, ...nodes(tree.props?.children)];
}
const byType = (tree, type) => nodes(tree).find((node) => node.type === type);
const button = (tree, label) => nodes(tree).find((node) => node.type === 'Press' && nodes(node).some((child) => child.type === 'Text' && child.props.children.includes(label)));
const theme = { text: 'text', text2: 'text2', text3: 'text3', accent: 'accent', danger: 'danger' };

test('failed sheet preserves draft/key, blocks edits and rapid duplicate presses, cancel/reopen starts new', async () => {
  const world = componentHarness('src/web/GuestUploadSheet.tsx', 'GuestUploadSheet');
  const keys = [];
  let release, closed = 0;
  let outcome = new Promise((resolve, reject) => { release = () => reject(new Error('Response lost')); });
  const props = { theme, days: 2, onClose: () => { closed++; }, onPost: async () => { throw new Error('Unexpected photos'); },
    onPostText: async (caption, day, key) => { assert.equal(caption, '草稿'); assert.equal(day, 2); keys.push(key); await outcome; } };
  const render = () => world.render(props);
  byType(render(), 'TextInput').props.onChangeText('草稿');
  const press = button(render(), 'guest.wall.post').props.onPress;
  const first = press();
  await press(); // Same captured callback before the next React render.
  assert.equal(keys.length, 1);
  assert.equal(button(render(), 'guest.wall.post').props.onPress, undefined);
  byType(render(), 'Pressable').props.onPress();
  assert.equal(closed, 0);
  release();
  await first;
  const failed = render();
  assert.equal(byType(failed, 'TextInput').props.value, '草稿');
  assert.equal(byType(failed, 'TextInput').props.editable, false);
  assert.ok(nodes(failed).some((node) => node.props.accessibilityRole === 'alert' && node.props.children.includes('Response lost')));
  outcome = Promise.resolve();
  await button(failed, 'guest.wall.post').props.onPress();
  assert.equal(keys[0], keys[1]);
  button(render(), 'guest.wall.cancel').props.onPress();
  assert.equal(closed, 1);
  world.remount();
  assert.equal(byType(render(), 'TextInput').props.value, '');
  assert.equal(byType(render(), 'TextInput').props.editable, true);
  byType(render(), 'TextInput').props.onChangeText('草稿');
  await button(render(), 'guest.wall.post').props.onPress();
  assert.notEqual(keys[2], keys[0]);
});

test('wall stays open on failure, closes only on confirmed success, partial batch retries stable per-item keys', async () => {
  const world = componentHarness('src/web/GuestWall.tsx', 'GuestWall');
  const calls = [], toasts = [];
  let rejectSecond = true;
  const props = { theme, journey: { total_days: 1 }, host: { display_name: 'Host' }, companions: [], identity: { name: 'Guest', ini: 'G', tone: 'river' },
    moments: [], sessionId: 'session', media: [], onDeleteMoment: async () => {}, onToast: (v) => toasts.push(v),
    onAddMoment: async (moment, key) => { calls.push({ moment, key }); if (rejectSecond && key === 'batch:1') { rejectSecond = false; throw new Error('lost second response'); } },
  };
  const render = () => world.render(props);
  button(render(), 'journey.action.add').props.onPress();
  const sheet = byType(render(), 'GuestUploadSheet');
  const photos = [{ uri: 'blob:0' }, { uri: 'blob:1' }];
  await assert.rejects(sheet.props.onPost(photos, 'caption', 1, 'batch'), /lost second/);
  assert.ok(byType(render(), 'GuestUploadSheet'));
  assert.equal(toasts.length, 0);
  await byType(render(), 'GuestUploadSheet').props.onPost(photos, 'caption', 1, 'batch');
  assert.deepEqual(calls.map(({ key }) => key), ['batch:0', 'batch:1', 'batch:0', 'batch:1']);
  assert.deepEqual(calls.map(({ moment }) => moment.caption), ['caption', '', 'caption', '']);
  assert.equal(byType(render(), 'GuestUploadSheet'), undefined);
  assert.equal(toasts.length, 1);
});


test('canceling an unknown failed operation then reopening produces a new key for identical content', async () => {
  const world = componentHarness('src/web/GuestUploadSheet.tsx', 'GuestUploadSheet');
  const keys = [];
  let closed = 0;
  const props = { theme, days: 1, onClose: () => { closed++; }, onPost: async () => {},
    onPostText: async (caption, day, key) => { keys.push(key); if (keys.length === 1) throw new Error('Unknown result'); } };
  const render = () => world.render(props);
  byType(render(), 'TextInput').props.onChangeText('same');
  await button(render(), 'guest.wall.post').props.onPress();
  button(render(), 'guest.wall.cancel').props.onPress();
  assert.equal(closed, 1);
  world.remount();
  byType(render(), 'TextInput').props.onChangeText('same');
  await button(render(), 'guest.wall.post').props.onPress();
  assert.equal(keys.length, 2);
  assert.notEqual(keys[0], keys[1]);
});
