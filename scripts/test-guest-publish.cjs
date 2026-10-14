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
  const effects = [];
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
    useEffect(effect, deps) {
      const i = cursor++;
      const previous = state[i];
      if (!previous || deps.some((v, j) => v !== previous.deps[j])) effects.push(() => {
        previous?.cleanup?.(); state[i] = { deps, cleanup: effect() };
      });
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
    './guestRetryState': { loadGuestDraft: async () => null, saveGuestDraft: async () => {}, clearGuestDraft: async () => {}, durablePhotoUri: async (uri) => uri },
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
    render(props) { cursor = 0; const tree = context.exports[name](props); effects.splice(0).forEach((f) => f()); return tree; },
    remount() { state.forEach((v) => v?.cleanup?.()); state.length = 0; },
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


test('scoped unknown draft is saved before writing, survives departure and restores its key; explicit new clears it', async () => {
  let saved = null, release;
  let clearRelease;
  const keys = [];
  const repo = {
    loadGuestDraft: async () => saved,
    saveGuestDraft: async (scope, draft) => { saved = JSON.parse(JSON.stringify(draft)); },
    clearGuestDraft: async (scope, key) => {
      await new Promise(resolve => { clearRelease = resolve; });
      if (saved?.key === key) saved = null;
    },
    durablePhotoUri: async (uri) => uri,
  };
  const world = componentHarness('src/web/GuestUploadSheet.tsx', 'GuestUploadSheet', { './guestRetryState': repo });
  let closed = 0;
  const props = { theme, days: 1, draftScope: 'session', onClose: () => { closed++; }, onPost: async () => {},
    onPostText: async (caption, day, key) => {
      assert.equal(saved.key, key, 'Durable draft must precede any network write');
      keys.push(key);
      await new Promise((resolve, reject) => { release = () => reject(new Error('等待超过30秒')); });
    } };
  const render = () => world.render(props);
  render(); await new Promise((resolve) => setImmediate(resolve));
  byType(render(), 'TextInput').props.onChangeText('可恢复草稿');
  const first = button(render(), 'guest.wall.post').props.onPress();
  await new Promise((resolve) => setImmediate(resolve));
  release(); await first;
  const originalKey = saved.key;
  button(render(), 'guest.wall.cancel').props.onPress();
  assert.equal(closed, 1);
  assert.equal(saved.key, originalKey, 'Closing must preserve unknown key');
  world.remount();
  render(); await new Promise((resolve) => setImmediate(resolve));
  assert.equal(byType(render(), 'TextInput').props.value, '可恢复草稿');
  assert.equal(byType(render(), 'TextInput').props.editable, false);
  const retry = button(render(), 'guest.wall.post').props.onPress();
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(keys, [originalKey, originalKey]);
  release(); await retry;
  const stalePublish = button(render(), 'guest.wall.post').props.onPress;
  const discard = button(render(), '放弃此草稿并新建（已提交内容会保留）').props.onPress();
  await stalePublish();
  assert.equal(keys.length, 2, 'Discarding must block even captured publish callbacks');
  button(render(), 'guest.wall.cancel').props.onPress?.();
  assert.equal(closed, 1);
  clearRelease(); await discard;
  await stalePublish();
  assert.equal(keys.length, 2, 'Discarded captured callbacks must stay retired');
  assert.equal(saved, null);
  world.remount(); render(); await new Promise((resolve) => setImmediate(resolve));
  assert.equal(byType(render(), 'TextInput').props.value, '');
});


test('failed durable draft save prevents any write and preserves the retry key in the sheet', async () => {
  let writable = false, calls = 0, key;
  const repo = { loadGuestDraft: async () => null, clearGuestDraft: async () => {}, durablePhotoUri: async (uri) => uri,
    saveGuestDraft: async (scope, draft) => { if (key) assert.equal(draft.key, key); key = draft.key; if (!writable) throw new Error('存储不可用'); } };
  const world = componentHarness('src/web/GuestUploadSheet.tsx', 'GuestUploadSheet', { './guestRetryState': repo });
  const props = { theme, days: 1, draftScope: 'session', onClose: () => {}, onPost: async () => {}, onPostText: async () => { calls++; } };
  const render = () => world.render(props);
  render(); await new Promise((resolve) => setImmediate(resolve));
  byType(render(), 'TextInput').props.onChangeText('saved-first');
  await button(render(), 'guest.wall.post').props.onPress();
  assert.equal(calls, 0);
  assert.equal(byType(render(), 'TextInput').props.value, 'saved-first');
  writable = true;
  await button(render(), 'guest.wall.post').props.onPress();
  assert.equal(calls, 1);
});

// Connect the real sheet's publishing callback to the real wall after a rename.
function recoveryWorld() {
  let saved = null;
  const requests = [], confirmed = new Map();
  const repo = { loadGuestDraft: async () => saved,
    saveGuestDraft: async (scope, draft) => { saved = JSON.parse(JSON.stringify(draft)); },
    clearGuestDraft: async () => { saved = null; }, durablePhotoUri: async uri => uri };
  const wall = componentHarness('src/web/GuestWall.tsx', 'GuestWall', { './guestRetryState': repo });
  const sheet = componentHarness('src/web/GuestUploadSheet.tsx', 'GuestUploadSheet', { './guestRetryState': repo });
  const original = { name: '原访客', ini: '原', tone: 'river' }, renamed = { name: '改名访客', ini: '改', tone: 'forest' };
  const props = { theme, journey: { total_days: 1 }, host: { display_name: 'Host' }, companions: [], identity: original,
    moments: [], sessionId: 'session', media: [], onDeleteMoment: async () => {}, onToast: () => {},
    onAddMoment: async (moment, key) => {
      const previous = confirmed.get(key);
      if (previous) assert.deepEqual(moment, previous, 'Same key must retain the original identity');
      requests.push({ moment, key });
      if (!previous) { confirmed.set(key, moment); throw new Error('Response lost'); }
    } };
  const render = () => {
    button(wall.render(props), 'journey.action.add').props.onPress();
    return sheet.render(byType(wall.render(props), 'GuestUploadSheet').props);
  };
  const tick = () => new Promise(resolve => setImmediate(resolve));
  return { props, original, renamed, requests, render, tick, sheet, saved: () => saved };
}

test('renamed visitor restores original draft identity after refresh and retries original key', async () => {
  const w = recoveryWorld();
  w.render(); await w.tick();
  byType(w.render(), 'TextInput').props.onChangeText('身份草稿');
  await button(w.render(), 'guest.wall.post').props.onPress();
  const key = w.requests[0].key;
  w.sheet.remount(); w.props.identity = w.renamed;
  w.render(); await w.tick();
  await button(w.render(), 'guest.wall.post').props.onPress();
  assert.equal(w.requests.length, 2, 'Renaming must not strand a recovered retry');
  assert.equal(w.requests[1].key, key);
  assert.equal(w.requests[1].moment.guest_name, w.original.name);
  assert.equal(w.saved(), null, 'Confirmed recovery clears the draft');
});

test('recovered draft exposes discard before any retry; refresh stays empty and new operation uses current identity', async () => {
  const w = recoveryWorld();
  w.render(); await w.tick();
  byType(w.render(), 'TextInput').props.onChangeText('身份草稿');
  await button(w.render(), 'guest.wall.post').props.onPress();
  const oldKey = w.requests[0].key;
  w.sheet.remount(); w.props.identity = w.renamed;
  w.render(); await w.tick();
  const discard = button(w.render(), '放弃此草稿并新建（已提交内容会保留）');
  assert.ok(discard?.props.onPress, 'Recovered draft must offer discard without first failing again');
  await discard.props.onPress();
  assert.equal(w.saved(), null);
  w.sheet.remount(); w.render(); await w.tick();
  assert.equal(byType(w.render(), 'TextInput').props.value, '');
  byType(w.render(), 'TextInput').props.onChangeText('身份草稿');
  await button(w.render(), 'guest.wall.post').props.onPress();
  assert.notEqual(w.requests[1].key, oldKey);
  assert.equal(w.requests[1].moment.guest_name, w.renamed.name);
});
