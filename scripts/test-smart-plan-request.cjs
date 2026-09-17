const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const file = path.join(__dirname, '../src/AppRoot.tsx');
const source = fs.readFileSync(file, 'utf8');
const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let callback;
function visit(node) {
  if (ts.isJsxAttribute(node) && node.name.getText(ast) === 'onSmartPlan') callback = node.initializer.expression.getText(ast);
  ts.forEachChild(node, visit);
}
visit(ast);
assert(callback, 'Smart planning callback must exist');
const javascript = ts.transpileModule(`const submit = ${callback}`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;

(async () => {
  for (const hasTrack of [false, true]) {
    for (const totalDays of [undefined, null, 0, 1, 3]) {
      let opened;
      const poi = { name: 'Test route', totalDays, ...(hasTrack ? { trackFileUrl: 'track.gpx' } : {}) };
      const context = vm.createContext({
        nav: {
          addJoinedJourney: async () => ({ ...poi, id: 'saved-trip' }),
          closeNewJourney() {}, showToast() {},
          openAssistant: (...args) => { opened = args; },
        },
        t: (key, vars) => ({ key, vars }),
        poi,
      });
      vm.runInContext(javascript, context);
      assert.equal(await vm.runInContext('submit(poi, "original planning prompt")', context), true);
      assert.equal(opened[0], 'original planning prompt', 'display formatting must not replace the model prompt');
      const message = opened[3];
      const known = totalDays != null && totalDays > 0;
      assert.equal(message.key, `journeyEdit.form.smartPlan${hasTrack ? 'Track' : ''}Request${known ? '' : 'Unset'}`);
      assert.equal(message.vars.name, poi.name);
      if (known) assert.equal(message.vars.count, totalDays);
      else assert(!('count' in message.vars), 'unknown duration must not become one day');
    }
  }
  console.log('Smart plan display message tests passed.');
})().catch(error => { console.error(error); process.exitCode = 1; });
