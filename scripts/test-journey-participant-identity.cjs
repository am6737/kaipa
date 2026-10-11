const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const ts = require('typescript');

function load(file) {
  const resolved = path.resolve(file);
  const js = ts.transpileModule(fs.readFileSync(resolved, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  new Function('exports', 'require', 'module', js)(module.exports, (name) => (
    name.startsWith('.') ? load(path.resolve(path.dirname(resolved), `${name}.ts`)) : require(name)
  ), module);
  return module.exports;
}

const { toJourneyPoi } = load('src/lib/mappers.ts');
const owner = { id: 1, user_id: 'owner', name: '领队', ini: '领', is_host: true, is_self: true, avatar_url: 'https://example.com/owner.jpg' };
const viewer = { id: 2, user_id: 'viewer', name: '伙伴', ini: '伙', is_self: false, avatar_url: 'https://example.com/viewer.jpg' };

test('joining a journey keeps owner and viewer identities distinct', () => {
  const journey = toJourneyPoi({ mine: false, companions: [owner, viewer] }, undefined, 'viewer');
  assert.equal(journey.companionList[0].self, false);
  assert.equal(journey.companionList[0].host, true);
  assert.equal(journey.companionList[0].avatarUrl, owner.avatar_url);
  assert.equal(journey.companionList[1].self, true);
  assert.equal(journey.companionList[1].avatarUrl, viewer.avatar_url);
});

test('legacy is_self identifies me only on my own journey', () => {
  const legacy = { ...owner, user_id: null };
  assert.equal(toJourneyPoi({ mine: true, companions: [legacy] }, undefined, 'viewer').companionList[0].self, true);
  assert.equal(toJourneyPoi({ mine: false, companions: [legacy] }, undefined, 'viewer').companionList[0].self, false);
});

test('explicit user ids override the legacy self flag', () => {
  assert.equal(toJourneyPoi({ mine: true, companions: [owner] }, undefined, 'viewer').companionList[0].self, false);
  assert.equal(toJourneyPoi({ mine: true, companions: [owner] }, undefined, 'owner').companionList[0].self, true);
});
