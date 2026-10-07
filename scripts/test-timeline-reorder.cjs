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
  const localRequire = name => name.startsWith('.') ? load(path.resolve(path.dirname(filename), `${name}.ts`)) : require(name);
  new Function('exports', 'require', 'module', code)(module.exports, localRequire, module);
  return module.exports;
}
const { moveTimelineItem, timelineDropIndex } = load('src/lib/timelineReorder.ts');
const { sortRowsWithinDay, orderedJourneyRows } = load('src/lib/journeyOrdering.ts');

test('moving first/last cards preserves the other items and the input', () => {
  const rows = ['a', 'b', 'c', 'd'];
  assert.deepEqual(moveTimelineItem(rows, 0, 3), ['b', 'c', 'd', 'a']);
  assert.deepEqual(moveTimelineItem(rows, 3, 0), ['d', 'a', 'b', 'c']);
  assert.deepEqual(rows, ['a', 'b', 'c', 'd']);
  assert.deepEqual(moveTimelineItem(rows, -1, 2), rows);
});

test('a tall photo card can pass short notes in either direction', () => {
  const layouts = [{ y: 0, height: 44 }, { y: 60, height: 300 }, { y: 376, height: 44 }];
  assert.equal(timelineDropIndex(layouts, 1, 0), 1);
  assert.equal(timelineDropIndex(layouts, 1, -60), 0);
  assert.equal(timelineDropIndex(layouts, 1, 60), 2);
  assert.equal(timelineDropIndex(layouts, 0, 376), 2);
  assert.equal(timelineDropIndex(layouts, 2, -376), 0);
});

test('persisted order survives conflicting times and is shared with map stop numbering', () => {
  const rows = [
    { id: 'morning', day: 'Day 1', title: 'Morning', timeStart: 480, sortOrder: 1 },
    { id: 'late', day: 'Day 1', title: 'Late', timeStart: 1080, sortOrder: 0 },
    { id: 'other', day: 'Day 2', title: 'Other', sortOrder: 0 },
  ];
  assert.deepEqual(sortRowsWithinDay(rows.slice(0, 2)).map(r => r.id), ['late', 'morning']);
  assert.deepEqual(orderedJourneyRows(rows, ['Day 1', 'Day 2']).map(r => r.id), ['late', 'morning', 'other']);
  assert.deepEqual(sortRowsWithinDay(rows.slice(0, 2).map(({ sortOrder, ...row }) => row)).map(r => r.id), ['morning', 'late']);
});

test('failed save restores the order while preserving a concurrent content edit', async () => {
  const effects = [];
  const storedRows = [
    { id: 'a', journey_id: 'journey', day: 'Day 1', title: 'A', sort_order: 0 },
    { id: 'b', journey_id: 'journey', day: 'Day 1', title: 'B', sort_order: 1 },
  ];
  let rejectReorder;
  const supabase = {
    from: table => ({ select: () => ({ eq: () => ({ order: async () => ({ data: table === 'timeline_rows' ? storedRows : [], error: null }) }) }) }),
    rpc: (name, args) => {
      if (name === 'journey_reorder_timeline_items') return new Promise((_, reject) => { rejectReorder = reject; });
      if (name === 'journey_save_timeline_item') return Promise.resolve({ data: { ...storedRows.find(r => r.id === args.p_id), title: args.p_fields.title }, error: null });
      throw new Error(`Unexpected RPC ${name}`);
    },
  };
  const filename = path.resolve('src/hooks/useTimeline.ts');
  const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  const fakeRequire = name => {
    if (name === 'react') return { useCallback: fn => fn, useEffect: fn => effects.push(fn), useMemo: fn => fn(), useState: value => [value, () => {}] };
    if (name === '../lib/supabase') return { supabase };
    if (name === '../lib/mappers') return { toTLRow: r => ({ id: r.id, title: r.title, day: r.day, sortOrder: r.sort_order }) };
    throw new Error(`Unexpected module ${name}`);
  };
  new Function('exports', 'require', 'module', code)(module.exports, fakeRequire, module);
  const { useTimeline } = module.exports;
  useTimeline('journey', 'owner');
  effects.splice(0).forEach(fn => fn());
  await new Promise(resolve => setImmediate(resolve));
  const timeline = useTimeline('journey', 'owner');
  const pending = timeline.reorder('Day 1', ['b', 'a']);
  assert.deepEqual(sortRowsWithinDay(useTimeline('journey', 'owner').rows).map(r => r.id), ['b', 'a']);
  await timeline.update('a', { title: 'Edited during save' });
  rejectReorder(new Error('Network failed'));
  await assert.rejects(pending, /Network failed/);
  const after = useTimeline('journey', 'owner').rows;
  assert.deepEqual(sortRowsWithinDay(after).map(r => r.id), ['a', 'b']);
  assert.equal(after.find(r => r.id === 'a').title, 'Edited during save');
  await assert.rejects(timeline.reorder('Day 1', ['a']), /group changed/);
});
