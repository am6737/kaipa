const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { test } = require('node:test');
const ts = require('typescript');
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const transpile = (source) => ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
const library = { exports: {}, setTimeout, clearTimeout, AbortController };
vm.runInNewContext(transpile(fs.readFileSync('src/lib/agentRecovery.ts', 'utf8')), library);
const { withAgentDeadline, startAgentRecovery } = library.exports;
const source = fs.readFileSync('src/components/assistant/AppAssistant.tsx', 'utf8');
const ast = ts.createSourceFile('AppAssistant.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let monitor, resend, restore;
function visit(node) {
  if (ts.isCallExpression(node) && node.expression.getText(ast) === 'useEffect' && node.arguments[0]?.getText(ast).includes('const recovery = startAgentRecovery(poll,')) monitor = node.arguments[0].getText(ast);
  if (ts.isVariableDeclaration(node) && node.name.getText(ast) === 'resendPendingRequest') resend = node.initializer.getText(ast);
  if (ts.isVariableDeclaration(node) && node.name.getText(ast) === 'restore') restore = node.initializer.getText(ast);
  ts.forEachChild(node, visit);
}
visit(ast);
assert.ok(monitor);
assert.ok(resend);
assert.ok(restore);

function harness(readRun) {
  const pending = { args: { clientRunId: 'run', threadId: 'thread', message: 'Date TBD' }, storageKey: 'pending', startedAt: 0 };
  const ctx = {
    visible: true, activeRunId: 'run', threadId: 'thread', activeJourneyId: undefined, currentJourneyId: undefined,
    data: { userId: 'user' }, pendingRequestRef: { current: pending }, requestInFlightRef: { current: true }, retryingPending: false,
    submitGenerationRef: { current: 0 },
    runActivitiesRef: { current: [] }, loading: true, turns: [{ role: 'user', text: 'Date TBD' }],
    getAgentRunActivity: readRun,
    getAgentHistory: async () => ({ thread: { id: 'thread', title: 'Trip' }, messages: [{ role: 'assistant', content: 'Upload a track?', ui: { requestId: 'run' } }] }),
    historyTurns: (history) => history.messages,
    activityFingerprint: JSON.stringify,
    AsyncStorage: { setItem: async () => {}, removeItem: async (key) => { ctx.removed = key; } },
    storageKey: () => 'scope', refetchWrittenJourney: async () => {},
    startAgentRecovery: (check, onError) => startAgentRecovery(check, onError, 10),
    AppState: { currentState: 'active', addEventListener: (_, listener) => { ctx.foreground = listener; return { remove() {} }; } },
    console: { warn() {}, info() {} }, appendResponse: (response) => { ctx.response = response; },
    sendAgentTurn: async (args) => { ctx.sent = args; return { status: 'completed', threadId: 'thread', runId: 'run' }; },
  };
  Object.assign(ctx, {
    active: true, key: 'scope', scope: 'user:global', canReuseCurrentView: false,
    initialPrompt: undefined, autoSubmitInitialPrompt: false, autoSubmitPrompt: undefined, autoDisplayPrompt: undefined,
    restoredScopeRef: { current: undefined }, pendingAutoSubmitRef: { current: undefined }, pendingAutoDisplayRef: { current: undefined },
    scrollRef: { current: null }, setTimeout: () => {}, setInput() {}, setRestoring() {},
  });
  for (const [setter, key] of [['setTurns', 'turns'], ['setLoading', 'loading'], ['setActiveRunId', 'activeRunId'], ['setThreadId', 'threadId'], ['setThreadTitle', 'threadTitle'], ['setThreadJourneyId', 'threadJourneyId'], ['setRunActivities', 'activities'], ['setRequestPhase', 'phase'], ['setRetryingPending', 'retryingPending']]) {
    ctx[setter] = (value) => { ctx[key] = typeof value === 'function' ? value(ctx[key]) : value; };
  }
  vm.runInNewContext(transpile(`globalThis.install = ${monitor}; globalThis.retry = ${resend}; globalThis.restore = ${restore};`), ctx);
  return ctx;
}

test('deadline bounds a stalled transport and aborts it', async () => {
  let signal;
  await assert.rejects(withAgentDeadline((value) => { signal = value; return new Promise(() => {}); }, 10), /agent_request_timeout/);
  assert.equal(signal.aborted, true);
});

test('connection loss then recovery restores the reply without resending', async () => {
  let offline = true;
  const ctx = harness(async () => { if (offline) throw new Error('offline'); return { status: 'completed', threadId: 'thread', activities: [] }; });
  const cleanup = ctx.install();
  try {
    await sleep(15);
    assert.equal(ctx.phase, 'reconnecting');
    assert.equal(ctx.loading, true);
    offline = false;
    await sleep(25);
    assert.equal(ctx.loading, false);
    assert.equal(ctx.turns[0].content, 'Upload a track?');
    assert.equal(ctx.sent, undefined);
    assert.equal(ctx.removed, 'pending');
  } finally { cleanup(); }
});

test('foreground transition immediately recovers background completion', async () => {
  let reads = 0;
  const ctx = harness(async () => { reads++; return { status: 'completed', threadId: 'thread', activities: [] }; });
  ctx.AppState.currentState = 'background';
  const cleanup = ctx.install();
  try {
    await sleep(15);
    assert.equal(reads, 0);
    ctx.AppState.currentState = 'active';
    ctx.foreground('active');
    await sleep(5);
    assert.ok(reads > 0);
    assert.equal(ctx.loading, false);
  } finally { cleanup(); }
});

test('late polling result after leaving a conversation cannot update it', async () => {
  let finish;
  const ctx = harness(() => new Promise((resolve) => { finish = resolve; }));
  const cleanup = ctx.install();
  cleanup();
  finish({ status: 'completed', threadId: 'old-thread', activities: [] });
  await sleep(5);
  assert.equal(ctx.loading, true);
  assert.equal(ctx.threadId, 'thread');
});

test('saved clarification recovers even without a running job', async () => {
  const ctx = harness(async () => ({ activities: [] }));
  const cleanup = ctx.install();
  try { await sleep(5); assert.equal(ctx.loading, false); } finally { cleanup(); }
});

test('unrelated history does not erase a pending message or unlock a duplicate submission', async () => {
  const ctx = harness(async () => ({ activities: [] }));
  ctx.getAgentHistory = async () => ({ thread: { id: 'thread' }, messages: [{ role: 'assistant', ui: { requestId: 'older' } }] });
  const cleanup = ctx.install();
  try {
    await sleep(5);
    assert.equal(ctx.phase, 'unconfirmed');
    assert.equal(ctx.loading, true);
    assert.equal(ctx.turns[0].text, 'Date TBD');
  } finally { cleanup(); }
});

test('manual retry first checks status, and reuses the exact request only when absent', async () => {
  const accepted = harness(async () => ({ status: 'running', activities: [] }));
  accepted.requestInFlightRef.current = false;
  await accepted.retry();
  assert.equal(accepted.sent, undefined);
  const missing = harness(async () => ({ activities: [] }));
  missing.requestInFlightRef.current = false;
  const original = missing.pendingRequestRef.current.args;
  await missing.retry();
  assert.equal(missing.sent, original);
  assert.equal(missing.loading, false);
});

test('manual retry while offline never blindly resubmits', async () => {
  const ctx = harness(async () => { throw new Error('offline'); });
  ctx.requestInFlightRef.current = false;
  await ctx.retry();
  assert.equal(ctx.sent, undefined);
  assert.equal(ctx.phase, 'reconnecting');
});

test('repeated wakeups cannot overlap status reads, and cleanup stops polling', async () => {
  let finish, calls = 0;
  const recovery = startAgentRecovery(() => { calls++; return new Promise((resolve) => { finish = resolve; }); }, () => {}, 5);
  recovery.resume(); recovery.resume();
  assert.equal(calls, 1);
  recovery.stop(); finish();
  await sleep(15);
  assert.equal(calls, 1);
});

test('cold start restores an unacknowledged request without losing its optimistic message', async () => {
  const ctx = harness(async () => ({ activities: [] }));
  const pending = { args: { clientRunId: 'run', threadId: 'thread', message: 'Date TBD' }, storageKey: 'scope:pending', startedAt: 0 };
  ctx.pendingRequestRef.current = undefined;
  ctx.turns = [];
  ctx.AsyncStorage.getItem = async (key) => key.endsWith(':pending') ? JSON.stringify(pending) : 'thread';
  ctx.getAgentHistory = async () => ({ thread: { id: 'thread', title: 'Trip' }, messages: [] });
  await ctx.restore();
  assert.equal(ctx.pendingRequestRef.current.args.clientRunId, 'run');
  assert.equal(ctx.activeRunId, 'run');
  assert.equal(ctx.loading, true);
  assert.equal(ctx.turns.at(-1).text, 'Date TBD');
});

test('cold start clears a completed pending request and restores the saved clarification', async () => {
  const ctx = harness(async () => ({ activities: [] }));
  const pending = { args: { clientRunId: 'run', threadId: 'thread', message: 'Date TBD' }, storageKey: 'scope:pending', startedAt: 0 };
  ctx.AsyncStorage.getItem = async (key) => key.endsWith(':pending') ? JSON.stringify(pending) : 'thread';
  await ctx.restore();
  assert.equal(ctx.pendingRequestRef.current, undefined);
  assert.equal(ctx.loading, false);
  assert.equal(ctx.turns.at(-1).text, 'Upload a track?');
});
