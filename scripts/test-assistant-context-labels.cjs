const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { test } = require('node:test');
const ts = require('typescript');
const ast = ts.createSourceFile('AppAssistant.tsx', fs.readFileSync('src/components/assistant/AppAssistant.tsx', 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let source;
ts.forEachChild(ast, (node) => { if (ts.isFunctionDeclaration(node) && node.name?.text === 'completedJourneyTrackLabel') source = node.getText(ast); });
assert.ok(source);
const context = {};
vm.runInNewContext(ts.transpileModule(`${source}\nglobalThis.label = completedJourneyTrackLabel`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context);
const translate = (key, values) => ({ key, values });
test('versioned summaries preserve existing distance and ascent labels in either theme', () => {
  const result = context.label({ trackSummary: { totalKm: 17.78, distance: '18.3 km', ascent: '+496 m' } }, translate);
  assert.equal(result.key, 'agent.research.journeyTrackLoadedStats');
  assert.equal(result.values.distance, '18.3 km');
  assert.equal(result.values.ascent, '496 m');
});
test('legacy and compact progress outputs retain their labels; itinerary-only reads do not claim to read a track', () => {
  assert.equal(context.label({ journey: { dist: '6 km', asc_: '+100 m' }, trackSummary: { totalKm: 6.2 } }, translate).values.ascent, '100 m');
  assert.equal(context.label({ hasTrack: true, distance: '6 km', ascent: '+100 m' }, translate).values.distance, '6 km');
  // A journey section on its own says nothing about a track: the link alone is not a reading.
  assert.equal(context.label({ journey: { dist: '6 km', asc_: '+100 m', track_id: 't-1' } }, translate), undefined);
  assert.equal(context.label({ itinerary: [] }, translate), undefined);
});
