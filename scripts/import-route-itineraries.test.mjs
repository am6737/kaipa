import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validateItineraryPayload, validateItineraryFile, planUpsert } from './import-route-itineraries.mjs';

const ID = '123e4567-e89b-42d3-a456-426614174000';
const clone = value => structuredClone(value);
const transfer = () => ({ from: '理塘', to: '下则通村', mode: 'shared', duration: null, costRef: '60 元/人', booking: null, position: 'start' });
const stay = () => ({ name: '下则通村', type: 'homestay', altitudeM: null, water: null, costRef: null, signal: null });
const day = (kind, title) => ({ kind, title, distanceKm: null, ascentM: null, descentM: null, duration: null, transfers: [], stay: null, supply: null, tip: null, bailout: null, source: 'official' });
function genne() {
  const access = day('access_in', '理塘 → 下则通村'); access.transfers = [transfer()]; access.stay = stay();
  const hike = day('hike', '下则通村 → 日照金山营地'); hike.distanceKm = 13; hike.ascentM = 1200; hike.stay = { ...stay(), name: '日照金山营地', type: 'camp', altitudeM: 4360 };
  const last = day('hike', '夯达营地 → 则巴村'); last.distanceKm = 2;
  return { name: '4 天 3 晚扎营穿越（下则通村至则巴村）', direction: '下则通村至则巴村', lodging: 'camp', difficulty: '中高', audience: '有多日扎营经验', summary: '从理塘进村，翻越垭口到日照金山营地。', notes: ['理塘回成都的拼车需提前预订'], bestMonths: null, seasonNote: null, days: [access, hike, last] };
}
function file() { return { routeId: 'trk014', plans: [{ id: ID, isDefault: true, origin: 'ai_draft', status: 'review', payload: genne(), draftSources: ['days[1].distanceKm', 'days[1].ascentM', 'days[1].stay.altitudeM', 'days[2].distanceKm'].map(path => ({ path, ref: 'trk014.md#s1' })), reviewNotes: ['核实里程'] }] }; }
function fails(label, mutate, path) { test(label, () => { const payload = genne(); mutate(payload); assert.ok(validateItineraryPayload(payload).some(error => error.includes(path)), validateItineraryPayload(payload).join('\n')); }); }

test('valid 格聂 payload and file pass', () => { assert.deepEqual(validateItineraryPayload(genne()), []); assert.deepEqual(validateItineraryFile(file()), []); });
fails('name length', p => { p.name = '甲'.repeat(41); }, 'name');
fails('audience length', p => { p.audience = '甲'.repeat(41); }, 'audience');
fails('summary length', p => { p.summary = '甲'.repeat(151); }, 'summary');
fails('notes count', p => { p.notes = Array(6).fill('注意'); }, 'notes');
fails('note length', p => { p.notes[0] = '甲'.repeat(41); }, 'notes[0]');
fails('title length', p => { p.days[0].title = '甲'.repeat(81); }, 'days[0].title');
fails('tip length', p => { p.days[0].tip = '甲'.repeat(101); }, 'days[0].tip');
for (const [field, value] of [['lodging', 'tent'], ['difficulty', '难']]) fails(`${field} enum`, p => { p[field] = value; }, field);
for (const [field, value] of [['kind', 'travel'], ['source', 'blog']]) fails(`${field} enum`, p => { p.days[0][field] = value; }, `days[0].${field}`);
for (const [field, value] of [['mode', 'taxi'], ['position', 'middle']]) fails(`${field} enum`, p => { p.days[0].transfers[0][field] = value; }, `days[0].transfers[0].${field}`);
fails('stay type enum', p => { p.days[0].stay.type = 'tent'; }, 'days[0].stay.type');
fails('bestMonths range and integer', p => { p.bestMonths = [0, 2.5, 13]; }, 'bestMonths[0]');
fails('days minimum', p => { p.days = []; }, 'days');
fails('days maximum', p => { p.days = Array(31).fill(p.days[1]); }, 'days');
fails('access_in only at start', p => { p.days[2].kind = 'access_in'; p.days[2].transfers = [transfer()]; p.days[2].distanceKm = null; }, 'days[2].kind');
fails('access_out only at end', p => { p.days[1].kind = 'access_out'; p.days[1].transfers = [transfer()]; p.days[1].distanceKm = null; }, 'days[2].kind');
fails('at least one non-access day', p => { p.days = [p.days[0]]; }, 'requires at least one');
fails('access requires transfer', p => { p.days[0].transfers = []; }, 'days[0].transfers');
fails('access forbids distance', p => { p.days[0].distanceKm = 2; }, 'days[0].distanceKm');
fails('rest requires tip', p => { p.days[1].kind = 'rest'; }, 'days[1].tip');
fails('stay required except last', p => { p.days[1].stay = null; }, 'days[1].stay required');
fails('ascent integer', p => { p.days[1].ascentM = 2.5; }, 'days[1].ascentM');
fails('descent integer', p => { p.days[1].descentM = 2.5; }, 'days[1].descentM');
fails('no empty strings recursively', p => { p.days[0].transfers[0].booking = ''; }, 'days[0].transfers[0].booking');
fails('no middle dot recursively', p => { p.days[0].stay.name = '村·营地'; }, 'days[0].stay.name');
fails('unknown fields are rejected', p => { p.days[0].unexpected = true; }, 'days[0].unexpected');
fails('numeric fields have numeric types', p => { p.days[1].distanceKm = '13'; }, 'days[1].distanceKm');

test('file requires routeId, UUIDs, unique IDs and at most one default', () => {
  const f = file(); f.routeId = ''; f.plans.push(clone(f.plans[0]));
  const errors = validateItineraryFile(f);
  assert.ok(errors.some(e => e.includes('routeId required')));
  assert.ok(errors.some(e => e.includes('.id duplicate')));
  assert.ok(errors.some(e => e.includes('at most one')));
  f.plans[0].id = 'bad'; assert.ok(validateItineraryFile(f).some(e => e.includes('must be a UUID')));
});
test('file refuses published/archived and invalid origin', () => {
  for (const status of ['published', 'archived']) { const f = file(); f.plans[0].status = status; assert.ok(validateItineraryFile(f).some(e => e.includes('.status'))); }
  const f = file(); f.plans[0].origin = 'import'; assert.ok(validateItineraryFile(f).some(e => e.includes('.origin')));
});
test('AI draft needs exact source path for every non-null numeric payload field', () => {
  const f = file(); f.plans[0].draftSources.splice(0, 1, { path: 'days[0].distanceKm', ref: 'wrong field' });
  assert.ok(validateItineraryFile(f).some(e => e.includes('missing days[1].distanceKm')));
  f.plans[0].origin = 'manual'; assert.deepEqual(validateItineraryFile(f), []);
});
test('file checks metadata arrays and booleans', () => {
  const f = file(); f.plans[0].isDefault = 'yes'; f.plans[0].draftSources = null; f.plans[0].reviewNotes = [''];
  const errors = validateItineraryFile(f);
  for (const path of ['isDefault', 'draftSources', 'reviewNotes']) assert.ok(errors.some(e => e.includes(path)));
});

test('planUpsert inserts version 1 when absent', () => {
  const plan = { ...file().plans[0], routeId: 'trk014' };
  const result = planUpsert(plan, []);
  assert.equal(result.action, 'insert'); assert.equal(result.row.version, 1); assert.equal(result.row.route_id, 'trk014');
});
test('planUpsert updates latest draft or review in place', () => {
  const plan = { ...file().plans[0], routeId: 'trk014' };
  for (const status of ['draft', 'review']) {
    const result = planUpsert(plan, [{ id: ID, version: 1, status: 'archived' }, { id: ID, version: 2, status }]);
    assert.equal(result.action, 'update'); assert.equal(result.row.version, 2);
  }
});
test('planUpsert updates a pending draft above a published version', () => {
  const plan = { ...file().plans[0], routeId: 'trk014' };
  const result = planUpsert(plan, [{ id: ID, version: 1, status: 'published' }, { id: ID, version: 3, status: 'draft' }]);
  assert.equal(result.action, 'update'); assert.equal(result.row.version, 3);
});
test('planUpsert creates a new version when the latest is archived or published', () => {
  const plan = { ...file().plans[0], routeId: 'trk014' };
  for (const rows of [[{ id: ID, version: 2, status: 'archived' }], [{ id: ID, version: 1, status: 'archived' }, { id: ID, version: 2, status: 'published' }]]) {
    const before = clone(rows); const result = planUpsert(plan, rows);
    assert.equal(result.action, 'insert'); assert.equal(result.row.version, Math.max(...rows.map(row => row.version)) + 1); assert.deepEqual(rows, before);
  }
});
