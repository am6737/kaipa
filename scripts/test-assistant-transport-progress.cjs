const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { test } = require('node:test');
const ts = require('typescript');

const source = fs.readFileSync('src/components/assistant/AppAssistant.tsx', 'utf8');
const ast = ts.createSourceFile('AppAssistant.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const fn = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'researchSteps');
assert.ok(fn);
const context = { searchReports: () => [] };
vm.runInNewContext(ts.transpileModule(`globalThis.steps = ${fn.getText(ast)};`, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
}).outputText, context);
const label = (activity) => context.steps([activity], (key, values) => ({ key, values }))[0].text;
const activity = (mode, status, output) => ({ toolName: 'search_transport', arguments: { mode }, status, output });

test('rail and flight access gaps are not presented as no service', () => {
  assert.equal(label(activity('rail', 'completed', { status: 'not_integrated' })).key, 'agent.research.railNotConnected');
  assert.equal(label(activity('flight', 'completed', { status: 'not_configured' })).key, 'agent.research.flightNotConnected');
  assert.equal(label(activity('flight', 'completed', { status: 'empty' })).key, 'agent.research.flightOffersEmpty');
  assert.equal(label(activity('flight', 'completed', { status: 'provider_error' })).key, 'agent.research.transportQueryFailed');
});
test('polling and restored UI count the same flight offers', () => {
  assert.equal(label(activity('flight', 'completed', { status: 'results', offers: [{}, {}] })).values.count, 2);
  assert.equal(label(activity('flight', 'completed', { status: 'results', count: 2 })).values.count, 2);
  assert.equal(label(activity('flight', 'running')).key, 'agent.research.flightSearching');
});
test('rail snapshots, presale and station errors have rail-specific labels', () => {
  for (const [status, suffix] of [['results', 'railOffersFound'], ['empty', 'railOffersEmpty'], ['not_on_sale', 'railNotOnSale'],
    ['invalid_station', 'railQueryNeedsCheck'], ['invalid_request', 'railQueryNeedsCheck'], ['rate_limited', 'transportQueryFailed'], ['temporarily_unavailable', 'transportQueryFailed']]) {
    assert.equal(label(activity('rail', 'completed', { status, offers: [{}, {}] })).key, `agent.research.${suffix}`);
  }
  assert.equal(label(activity('rail', 'completed', { status: 'results', count: 2 })).values.count, 2);
});
test('transport web searches use reference labels rather than guide labels', () => {
  assert.equal(label({ toolName: 'search_travel_web', arguments: { purpose: 'transport' }, status: 'running' }).key, 'agent.research.transportReferenceSearching');
  assert.equal(label({ toolName: 'search_travel_web', arguments: { purpose: 'guide' }, status: 'running' }).key, 'agent.research.searchingTitle');
});
test('connection results are candidates, not direct trains or approved transfers', () => {
  for (const [status, suffix] of [['results', 'railConnectionsFound'], ['empty', 'railConnectionsEmpty']]) {
    const a = activity('rail', 'completed', { status, count: 2 });
    a.arguments.viaStation = '桂林北';
    assert.equal(label(a).key, `agent.research.${suffix}`);
  }
});
