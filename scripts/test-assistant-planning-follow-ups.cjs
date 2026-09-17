const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { test } = require('node:test');
const ts = require('typescript');

// Exercise the component's actual visibility rule without a native runtime.
const source = fs.readFileSync('src/components/assistant/AppAssistant.tsx', 'utf8');
const ast = ts.createSourceFile('AppAssistant.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let visibility;
function visit(node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(ast) === 'quickRepliesForTurn') visibility = node.initializer.getText(ast);
  ts.forEachChild(node, visit);
}
visit(ast);
assert.ok(visibility);
const code = ts.transpileModule(`globalThis.visibleReplies = ${visibility};`, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
}).outputText;

function repliesFor(turn, turns = [turn]) {
  const context = { turns, isTrackPromptTurn: (value) => !!value.trackPrompt };
  vm.runInNewContext(code, context);
  return context.visibleReplies(turn);
}
const extra = { label: 'Add transport', message: 'Add transport', action: 'supplement_plan' };
const completed = { role: 'assistant', quickReplies: [extra], undoAction: { runId: 'run' } };

test('saved planning shows extras alongside the undo action', () => {
  assert.equal(repliesFor(completed)[0], extra);
});
test('extras disappear after a reply or when their plan has been undone', () => {
  assert.equal(repliesFor(completed, [completed, { role: 'user', text: 'Add transport' }]).length, 0);
  assert.equal(repliesFor({ ...completed, undoAction: { runId: 'run', undoneAt: 'today' } }).length, 0);
});
test('restored history retains the optional entry points', () => {
  const restored = JSON.parse(JSON.stringify(completed));
  assert.equal(repliesFor(restored)[0].action, 'supplement_plan');
});
test('track prompts and ordinary write replies keep their previous visibility', () => {
  assert.equal(repliesFor({ ...completed, trackPrompt: true }).length, 0);
  const question = { label: 'Tomorrow', message: 'Tomorrow' };
  assert.equal(repliesFor({ ...completed, quickReplies: [question] }).length, 0);
  assert.equal(repliesFor({ role: 'assistant', quickReplies: [question] })[0], question);
});
