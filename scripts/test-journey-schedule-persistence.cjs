const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const writes = [];
const supabase = {
  from(table) {
    let row;
    const query = {
      insert(value) { row = value; writes.push({ table, operation: 'insert', row }); return query; },
      update(value) { row = value; writes.push({ table, operation: 'update', row }); return query; },
      select() { return query; },
      single: async () => ({ data: row, error: null }),
      eq: async () => ({ error: null }),
    };
    return query;
  },
};
const mocks = {
  react: { useCallback: fn => fn, useEffect() {}, useState: value => [value, () => {}] },
  'react-native': {},
  '../lib/supabase': { supabase },
  '../lib/mappers': { toJourneyPoi: row => row },
  '../lib/storage': { ensureCloudMedia: async value => value },
  '../data/pois': { MAX_JOURNEY_PARTICIPANTS: 20 },
};
const source = fs.readFileSync(path.join(__dirname, '../src/hooks/useJourneys.ts'), 'utf8');
const javascript = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const context = vm.createContext({ exports: {}, console, require: name => {
  assert(name in mocks, `Unexpected dependency: ${name}`);
  return mocks[name];
} });
vm.runInContext(javascript, context);

(async () => {
  const journeys = context.exports.useJourneys('test-user');
  await journeys.createJourney({ name: 'Unscheduled route' });
  const created = writes.at(-1).row;
  for (const key of ['date', 'planned_date', 'days', 'total_days', 'countdown']) assert.equal(created[key], null, key);
  await journeys.updateJourney('test-trip', { date: undefined, plannedDate: undefined, days: undefined, totalDays: undefined, countdown: undefined });
  const cleared = JSON.parse(JSON.stringify(writes.at(-1).row));
  for (const key of ['date', 'planned_date', 'days', 'total_days', 'countdown']) assert.equal(cleared[key], null, `${key} must survive JSON serialization as null`);
  assert(!('track_id' in cleared), "schedule edits must not overwrite the journey's track link");
  await journeys.updateJourney('test-trip', { totalDays: 3, days: '3 days', countdown: 0 });
  assert.equal(writes.at(-1).row.total_days, 3);
  assert.equal(writes.at(-1).row.countdown, 0);
  await journeys.updateJourney('test-trip', { name: 'Renamed route' });
  assert(!('total_days' in writes.at(-1).row), 'unrelated edits must not clear duration');
  console.log('Journey schedule persistence tests passed.');
})().catch(error => { console.error(error); process.exitCode = 1; });
