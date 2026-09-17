const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { test } = require('node:test');
const ts = require('typescript');

const source = fs.readFileSync('src/components/assistant/AppAssistant.tsx', 'utf8');
const ast = ts.createSourceFile('AppAssistant.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const fn = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'researchSteps');
assert.ok(fn);
const reports = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'searchReports');
assert.ok(reports);
const context = { sourceLabel: source => source };
vm.runInNewContext(ts.transpileModule(`globalThis.searchReports = ${reports.getText(ast)};`, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
}).outputText, context);
vm.runInNewContext(ts.transpileModule(`globalThis.steps = ${fn.getText(ast)};`, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
}).outputText, context);
const step = (toolName, status, output) => context.steps([{ toolName, status, output, arguments: {} }], key => key)[0];

test('guide progress distinguishes text extraction from image reading', () => {
  assert.equal(step('read_travel_guide', 'running').text, 'agent.research.guideReading');
  assert.equal(step('read_travel_guide', 'completed', { available: true }).text, 'agent.research.guideRead');
  assert.equal(step('read_travel_guide_images', 'running').text, 'agent.research.guideImagesReading');
  assert.equal(step('read_travel_guide_images', 'completed', { available: true }).text, 'agent.research.guideImagesRead');
});
test('unavailable and budget-exhausted tool receipts never display successful reading', () => {
  for (const name of ['read_travel_guide', 'read_travel_guide_images']) {
    for (const status of ['not_configured', 'unavailable', 'budget_exhausted']) {
      const value = step(name, 'completed', { available: false, status });
      assert.equal(value.status, 'failed');
      assert.match(value.text, /Unavailable$/);
    }
    assert.equal(step(name, 'failed').status, 'failed');
  }
});

test('Douyin manual verification is not rendered as zero results or disconnected service', () => {
  const steps = context.steps([{ toolName: 'search_travel_web', status: 'completed', arguments: { query: '哈天线' },
    output: { sources: [{ source: 'douyin', status: 'unavailable', resultCount: 0, errorCode: 'verification_required' }] } }], key => key);
  const last = steps.at(-1);
  assert.equal(last.status, 'failed');
  assert.equal(last.text, 'agent.research.sourceVerificationRequired');
});
