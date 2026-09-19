const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { test } = require('node:test');
const ts = require('typescript');

// Exercise the component's actual submit handler without requiring a native runtime.
const source = fs.readFileSync('src/components/assistant/AppAssistant.tsx', 'utf8');
const ast = ts.createSourceFile('AppAssistant.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let submit;
const helpers = [];
function visit(node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(ast) === 'submit') submit = node.initializer.getText(ast);
  if (ts.isFunctionDeclaration(node) && ['isTrackAttachmentName', 'wantsTrackUploadReply', 'wantsNoTrackReply'].includes(node.name?.text)) helpers.push(node.getText(ast));
  ts.forEachChild(node, visit);
}
visit(ast);
assert.ok(submit);
const code = ts.transpileModule(`${helpers.join('\n')}\n globalThis.submit = ${submit};`, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
}).outputText;

function harness(upload) {
  let id = 0;
  const ctx = {
    turns: [], selectedAttachments: [], input: '', loading: false, attachmentUploading: false,
    trackPicking: false, trackPrompt: null, threadId: 'thread', activeJourneyId: undefined, currentJourneyId: undefined,
    resolved: 'zh', data: { userId: 'user' }, sent: [], picked: 0, skipped: 0,
    uploadInFlightRef: { current: false }, requestInFlightRef: { current: false },
    submitGenerationRef: { current: 0 }, pendingRequestRef: { current: undefined },
    runActivitiesRef: { current: [] }, scrollRef: { current: null },
    createRunId: () => `run-${++id}`, t: (key) => key, setTimeout: () => {},
    console: { log() {}, info() {}, warn() {} }, isTrackPromptTurn: () => false,
    trackPromptFromTurn: () => undefined, localAgentTimeContext: () => ({}),
    getAgentLocation: async () => undefined,
    uploadAgentAttachment: upload, completedActivitiesFor: async () => [],
    appendResponse() {}, setActiveRunId(value) { ctx.activeRunId = value; }, setRunActivities() {}, setRunStages() {}, setRunModelMetrics() {},
    setRequestPhase(value) { ctx.requestPhase = value; },
    setThreadId(value) { ctx.threadId = value; }, setThreadTitle() {},
    AsyncStorage: { setItem: async () => {}, removeItem: async () => {} }, storageKey: () => 'test-thread',
    setAttachmentTrayOpen() {}, showAttachmentError() { assert.fail('Unexpected alert'); },
  };
  for (const [setter, key] of [['setTurns', 'turns'], ['setInput', 'input'], ['setSelectedAttachments', 'selectedAttachments'], ['setLoading', 'loading'], ['setAttachmentUploading', 'attachmentUploading']]) {
    ctx[setter] = (value) => { ctx[key] = typeof value === 'function' ? value(ctx[key]) : value; };
  }
  ctx.chooseTrackForPlan = () => { ctx.picked++; };
  ctx.continuePlanWithoutTrack = () => { ctx.skipped++; };
  ctx.sendAgentTurn = async (args) => { ctx.sent.push(args); return { threadId: 'thread', runId: 'run' }; };
  vm.runInNewContext(code, ctx);
  return ctx;
}

const files = [{ id: 'file', kind: 'file', uri: 'file:///route.gpx', name: 'route.gpx', size: 100 }];

test('mentioning GPX or changing a track decision does not hijack natural conversation', async () => {
  for (const message of ['GPX 和 KML 有什么区别？', '先不规划了，帮我看看装备', '我之前上传轨迹了，现在只讨论路线']) {
    const ctx = harness(async () => 'uploaded');
    await ctx.submit(message);
    assert.equal(ctx.picked, 0);
    assert.equal(ctx.sent[0].message, message);
  }
});

test('location is included in the submitted and recoverable request', async () => {
  const ctx = harness(async () => 'uploaded');
  const fix = { status: 'available', latitude: 25, longitude: 110, accuracy: 30, timestamp: Date.now(), coordinateSystem: 'WGS84' };
  ctx.getAgentLocation = async (message) => { assert.equal(message, '从当前位置出发'); return fix; };
  let saved;
  ctx.AsyncStorage.setItem = async (_key, value) => { if (value.includes('"args"')) saved = JSON.parse(value); };
  await ctx.submit('从当前位置出发');
  assert.equal(ctx.sent[0].currentLocation, fix);
  assert.deepEqual(saved.args.currentLocation, fix);
});

test('switching conversations while locating discards the result', async () => {
  const ctx = harness(async () => 'uploaded');
  let finish;
  ctx.getAgentLocation = () => new Promise((resolve) => { finish = resolve; });
  const sending = ctx.submit('从当前位置出发');
  await new Promise((resolve) => setImmediate(resolve));
  ctx.submitGenerationRef.current++;
  finish({ status: 'unavailable' });
  await sending;
  assert.equal(ctx.sent.length, 0);
});

test('accepted background run keeps progress active without appending a fake completion', async () => {
  const ctx = harness(async () => 'https://example.test/route.gpx');
  ctx.sendAgentTurn = async () => ({ status: 'running', threadId: 'persisted-thread', runId: 'persisted-run' });
  ctx.appendResponse = () => assert.fail('Pending run must not render completion');
  await ctx.submit('Upload track', undefined, true, files);
  assert.equal(ctx.loading, true);
  assert.equal(ctx.requestInFlightRef.current, false);
  assert.equal(ctx.threadId, 'persisted-thread');
  assert.equal(ctx.activeRunId, 'persisted-run');
  assert.equal(ctx.turns.length, 1);
});

test('shows the track immediately, blocks duplicate upload, then replaces local attachment', async () => {
  let finish;
  const ctx = harness(() => new Promise((resolve) => { finish = resolve; }));
  const pending = ctx.submit('Upload track', undefined, true, files);
  assert.equal(ctx.turns.length, 1);
  assert.equal(ctx.turns[0].upload.status, 'uploading');
  assert.equal(ctx.turns[0].attachments[0].name, 'route.gpx');
  assert.equal(ctx.sent.length, 0);
  await ctx.submit('Upload track', undefined, true, files);
  assert.equal(ctx.turns.length, 1);
  finish('https://example.test/route.gpx');
  await pending;
  assert.equal(ctx.turns.length, 1);
  assert.equal(ctx.turns[0].upload, undefined);
  assert.equal(ctx.turns[0].attachments[0].url, 'https://example.test/route.gpx');
  assert.equal(ctx.sent.length, 1);
});

test('failed upload keeps files and retries in the same message without clearing a new draft', async () => {
  const ctx = harness(async () => { throw new Error('offline'); });
  await ctx.submit('Upload track', undefined, true, files);
  const failed = ctx.turns[0];
  assert.equal(failed.upload.status, 'failed');
  assert.equal(ctx.sent.length, 0);
  ctx.input = 'New draft';
  ctx.uploadAgentAttachment = async () => 'https://example.test/route.gpx';
  await ctx.submit(failed.upload.message, failed.upload.intent, true, failed.upload.files, failed.text, failed.id);
  assert.equal(ctx.turns.length, 1);
  assert.equal(ctx.turns[0].id, failed.id);
  assert.equal(ctx.turns[0].upload, undefined);
  assert.equal(ctx.input, 'New draft');
  assert.equal(ctx.sent.length, 1);
});

test('skip text does not trigger upload picker', async () => {
  const ctx = harness(async () => assert.fail('Unexpected upload'));
  ctx.trackPrompt = { message: 'Plan a trip' };
  await ctx.submit('\u6682\u4e0d\u4e0a\u4f20\u8f68\u8ff9');
  assert.equal(ctx.picked, 0);
  assert.equal(ctx.skipped, 1);
});

test('track attached in composer is sent instead of reopening picker', async () => {
  const ctx = harness(async () => 'https://example.test/route.gpx');
  ctx.trackPrompt = { message: 'Plan a trip' };
  ctx.selectedAttachments = files;
  await ctx.submit('Upload track');
  assert.equal(ctx.picked, 0);
  assert.equal(ctx.sent.length, 1);
});

test('completed clarification displays immediately without any progress or refresh read', async () => {
  const ctx = harness(async () => assert.fail('Unexpected upload'));
  ctx.sendAgentTurn = async () => ({ status: 'completed', threadId: 'thread', runId: 'reply', message: 'Upload a track?', ui: { createJourneyFlow: { step: 'ask_track' } } });
  ctx.completedActivitiesFor = () => assert.fail('Completion must not query progress');
  ctx.refetchWrittenJourney = () => assert.fail('Clarification must not refresh journey data');
  let displayed = false;
  ctx.appendResponse = () => { displayed = true; };
  await ctx.submit('Date TBD, 2 days');
  assert.equal(displayed, true);
  assert.equal(ctx.loading, false);
  assert.equal(ctx.activeRunId, undefined);
  assert.equal(ctx.pendingRequestRef.current, undefined);
});

test('a stalled data refresh cannot block an already completed reply', async () => {
  const ctx = harness(async () => assert.fail('Unexpected upload'));
  ctx.sendAgentTurn = async () => ({ status: 'completed', threadId: 'thread', runId: 'reply', ui: { undoAction: { runId: 'reply' } } });
  ctx.refetchWrittenJourney = () => new Promise(() => {});
  await ctx.submit('Add an item');
  assert.equal(ctx.loading, false);
});

test('lost response retains the same request for recovery without resending', async () => {
  const ctx = harness(async () => assert.fail('Unexpected upload'));
  let sends = 0;
  ctx.sendAgentTurn = async () => { sends++; throw new Error('offline'); };
  await ctx.submit('Date TBD, 2 days');
  assert.equal(ctx.requestPhase, 'reconnecting');
  assert.equal(ctx.pendingRequestRef.current.args.clientRunId, ctx.activeRunId);
  assert.equal(ctx.loading, true);
  assert.equal(ctx.requestInFlightRef.current, false);
  assert.equal(sends, 1);
});

test('late response from a previous request cannot overwrite a newer request', async () => {
  const ctx = harness(async () => assert.fail('Unexpected upload'));
  let finish;
  ctx.sendAgentTurn = () => new Promise((resolve) => { finish = resolve; });
  ctx.appendResponse = () => assert.fail('Late reply must be ignored');
  const work = ctx.submit('Old request');
  await new Promise((resolve) => setImmediate(resolve));
  ctx.submitGenerationRef.current++;
  ctx.pendingRequestRef.current = { args: { clientRunId: 'new' } };
  ctx.activeRunId = 'new';
  finish({ status: 'completed', threadId: 'thread', runId: 'old' });
  await work;
  assert.equal(ctx.activeRunId, 'new');
  assert.equal(ctx.loading, true);
});
