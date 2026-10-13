const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const { test } = require('node:test');

function transport(phase, globals = {}) {
  const timers = new Map(), calls = [];
  let sequence = 0, release;
  const gate = new Promise((resolve) => { release = resolve; });
  const response = { ok: true, blob: async () => ({ size: 10, type: 'image/png' }) };
  const mocks = { './supabaseGuest': { guestSupabase: {
    functions: { invoke: async (name, { body }) => {
      calls.push(body.action);
      if (phase === 'invoke' || (phase === 'ticket' && body.action === 'guest_upload')) return gate;
      if (phase === 'error-body') return { error: { context: { json: () => gate } } };
      return { data: body.action === 'guest_upload' ? { bucket: 'photos', path: 'p', token: 'test' } : { id: 'row' } };
    } },
    storage: { from: () => ({
      uploadToSignedUrl: async () => { calls.push('upload'); return phase === 'upload' ? gate : {}; },
      getPublicUrl: () => ({ data: { publicUrl: 'https://storage.test/p' } }),
    }) },
  } } };
  const context = vm.createContext({
    Error,
    setTimeout: (fn, ms) => { timers.set(++sequence, { fn, ms }); return sequence; },
    clearTimeout: (id) => timers.delete(id),
    fetch: async () => { calls.push('fetch'); return phase === 'fetch' ? gate : response; },
    ...globals,
  });
  function load(name) {
    if (mocks[name]) return mocks[name];
    const source = ts.transpileModule(fs.readFileSync('src/web/' + name.slice(2) + '.ts', 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    const exports = {};
    vm.runInContext(`(function(exports, require) {${source}\n})`, context)(exports, load);
    return mocks[name] = exports;
  }
  return {
    request: load('./guestResources').guestRequest,
    upload: load('./guestStorage').uploadGuestPhoto,
    deadline: load('./guestDeadline').withGuestDeadline,
    retryState: () => load('./guestRetryState'),
    timers, calls,
    release(value) { release(value); },
    async expire() {
      for (const [id, { fn, ms }] of [...timers]) {
        assert.equal(ms, 30000, 'Use the production 30-second bound');
        timers.delete(id); fn();
      }
      await new Promise((resolve) => setImmediate(resolve));
    },
    response,
  };
}

test('hanging durable draft transaction is aborted on deadline and cannot commit later', async () => {
  let aborted = false, committed = false, closed = false;
  const transaction = {
    objectStore: () => ({ put: () => {} }),
    abort() { aborted = true; this.onabort(); },
  };
  const db = { transaction: () => transaction, close: () => { closed = true; } };
  const world = transport('none', { indexedDB: { open() {
    const request = { result: db };
    queueMicrotask(() => request.onsuccess());
    return request;
  } } });
  const saving = world.retryState().saveGuestDraft('session', { key: 'old', picks: [], caption: 'unknown', day: 1 });
  const rejected = assert.rejects(saving, /30秒/);
  await new Promise(resolve => setImmediate(resolve));
  await world.expire(); await rejected;
  if (!aborted) { committed = true; transaction.oncomplete(); }
  assert.equal(aborted, true);
  assert.equal(committed, false);
  assert.equal(closed, true);
});

for (const phase of ['invoke', 'error-body']) {
  test(`guestRequest bounds hanging ${phase} and cannot turn a late result into success`, async () => {
    const world = transport(phase);
    const pending = world.request({ action: 'guest_add', requestKey: 'same' });
    const rejected = assert.rejects(pending, /30秒/);
    await new Promise((resolve) => setImmediate(resolve));
    await world.expire(); await rejected;
    world.release({ data: { id: 'late' } });
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(world.timers.size, 0);
    assert.deepEqual(world.calls, ['guest_add']);
  });
}
for (const phase of ['fetch', 'ticket', 'upload']) {
  test(`hanging photo ${phase} ends waiting and cannot launch a late next stage`, async () => {
    const world = transport(phase);
    const pending = world.deadline(async guard => {
      await world.upload('data:image/png;base64,test', 'share', 'session', guard);
      guard();
      await world.request({ action: 'guest_add', requestKey: 'same' });
    });
    const rejected = assert.rejects(pending, /30秒/);
    await new Promise((resolve) => setImmediate(resolve));
    await world.expire(); await rejected;
    const before = [...world.calls];
    world.release(phase === 'fetch' ? world.response : phase === 'ticket'
      ? { data: { bucket: 'photos', path: 'p', token: 'test' } } : {});
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(world.calls, before);
    assert.equal(world.calls.includes('guest_add'), false);
    assert.equal(world.timers.size, 0);
  });
}
