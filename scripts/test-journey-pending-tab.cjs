const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const ts = require('typescript');

function load(file) {
  const filename = path.resolve(file);
  const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  const localRequire = (name) => name.startsWith('.')
    ? load(path.resolve(path.dirname(filename), `${name}.ts`))
    : require(name);
  new Function('exports', 'require', 'module', code)(module.exports, localRequire, module);
  return module.exports;
}

const { groupJourneyRows, journeyGroupsForSelectedDay } = load('src/lib/journeyOrdering.ts');
const { buildJourneyGroupChoices, journeyMoveDestinations } = load('src/lib/journeyGroupChoices.ts');
const row = (id, day) => ({ id, day, title: id });
const t = key => ({
  'journey.timeline.pendingGroup': '待计划',
  'journey.timeline.pendingGroupHint': '尚未安排到具体日期',
  'journey.timeline.emptyTitle': '还没有行程安排',
})[key];

test('pending remains available before any undated itinerary item exists', () => {
  const groups = groupJourneyRows([row('dated', 'Day 1')], ['Day 1', '']);
  const pending = journeyGroupsForSelectedDay(groups, '');
  assert.equal(pending.length, 1);
  assert.equal(pending[0].key, '');
  assert.deepEqual(pending[0].rows, []);
});

test('pending contains only undated items and never falls back to the whole timeline', () => {
  const groups = groupJourneyRows([
    row('later', 'Day 2'), row('pending', ''), row('first', 'Day 1'),
  ], ['Day 1', 'Day 2', '']);
  const before = structuredClone(groups);
  assert.deepEqual(journeyGroupsForSelectedDay(groups, '').flatMap(g => g.rows.map(r => r.id)), ['pending']);
  assert.deepEqual(journeyGroupsForSelectedDay(groups, 'Day 1').map(g => g.key), ['Day 1', 'Day 2']);
  assert.deepEqual(groups, before);
});

test('moving an item between pending and a named group changes the visible tab', () => {
  const original = row('place', '');
  const pendingGroups = groupJourneyRows([original], ['', 'Day 1', 'camp']);
  assert.equal(journeyGroupsForSelectedDay(pendingGroups, '')[0].rows.length, 1);
  const movedGroups = groupJourneyRows([{ ...original, day: 'camp' }], ['', 'Day 1', 'camp']);
  assert.equal(journeyGroupsForSelectedDay(movedGroups, '')[0].rows.length, 0);
  assert.deepEqual(journeyGroupsForSelectedDay(movedGroups, 'camp').flatMap(g => g.rows.map(r => r.id)), ['place']);
});

test('add and move choices keep pending first and merge localized day aliases', () => {
  const choices = buildJourneyGroupChoices([], ['Day 1', '', '第一天', 'camp', 'Day 2', ''], 'zh', t);
  assert.deepEqual(choices.map(c => c.value), ['', 'Day 1', 'camp', 'Day 2']);
  assert.equal(choices[0].label, '待计划');
  assert.equal(choices[0].summary, '尚未安排到具体日期');
  assert.equal(choices[1].label, '第一天');
  assert.equal(choices[1].summary, '还没有行程安排');
});

test('group summaries follow itinerary time order and include title-less places', () => {
  const choices = buildJourneyGroupChoices([
    { ...row('evening', 'Day 1'), timeStart: 1080 },
    { ...row('morning', '第一天'), timeStart: 480 },
    { ...row('', 'Day 1'), timeStart: 720, location: { name: 'lunch' } },
    row('untimed', 'Day 1'),
  ], ['Day 1'], 'en', t);
  assert.equal(choices[1].summary, 'morning → lunch → evening');
});

test('move list excludes the current group, including localized aliases', () => {
  const choices = buildJourneyGroupChoices([], ['Day 1', 'Day 2'], 'zh', t);
  assert.deepEqual(journeyMoveDestinations(choices, [row('item', '第一天')]).map(c => c.value), ['', 'Day 2']);
  assert.deepEqual(journeyMoveDestinations(choices, [row('item', '')]).map(c => c.value), ['Day 1', 'Day 2']);
  assert.deepEqual(journeyMoveDestinations(choices, []), []);
});

test('mixed-group selection can move to either group or pending', () => {
  const choices = buildJourneyGroupChoices([], ['Day 1', 'Day 2'], 'zh', t);
  assert.deepEqual(journeyMoveDestinations(choices, [row('a', 'Day 1'), row('b', 'Day 2')]).map(c => c.value), ['', 'Day 1', 'Day 2']);
});
