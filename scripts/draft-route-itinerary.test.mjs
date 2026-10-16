import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { draftRouteItinerary, collectDraftSources } from './draft-route-itinerary.mjs';
import { validateItineraryFile } from './import-route-itineraries.mjs';

const uuid = '123e4567-e89b-42d3-a456-426614174000';
const payload = () => ({
  name: '1 天 0 晚徒步环线', direction: null, lodging: 'lodge', difficulty: '中',
  audience: '有徒步经验', summary: '从村口出发返回村口。', notes: [], bestMonths: null, seasonNote: null,
  days: [{ kind: 'hike', title: '村口 → 村口', distanceKm: 8, ascentM: null, descentM: null,
    duration: null, transfers: [], stay: null, supply: null, tip: null, bailout: null, source: 'official' }],
});

async function fixture(withSources = true) {
  const root = await mkdtemp(join(tmpdir(), 'kaipa-draft-'));
  await mkdir(join(root, 'data/route-guides/_inbox/trk020'), { recursive: true });
  await mkdir(join(root, 'data/route-itineraries'), { recursive: true });
  if (withSources) {
    await writeFile(join(root, 'data/route-guides/trk020.md'), '---\nrouteId: trk020\n---\n## 行程\n徒步 8 km。\n## 交通\n村口。\n');
    await writeFile(join(root, 'data/route-guides/_inbox/trk020/a.json'), JSON.stringify({ routeId: 'trk020', items: [{ extractedText: '记录一' }, { extractedText: '记录二' }] }));
  }
  return root;
}

function fakeFetch(model, seen = []) {
  return async (url, init) => {
    seen.push({ url, init });
    if (url.includes('/rest/v1/routes')) return { ok: true, json: async () => [{ id: 'trk020', name: '测试线', region: '四川', best_months: [6, 7] }] };
    return { ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify(model) } }] }) };
  };
}

const deps = (root, model, seen) => ({ root, fetch: fakeFetch(model, seen), env: { SUPABASE_SERVICE_ROLE_KEY: 'fake-rest-key', KAIPA_AI_API_KEY: 'fake-model-key' }, uuid: () => uuid, log: () => {} });

test('source refs are stable for markdown sections and inbox items', async () => {
  const root = await fixture();
  const refs = (await collectDraftSources('trk020', root)).map(source => source.ref);
  assert.deepEqual(refs, ['trk020.md#s1', 'trk020.md#s2', '_inbox/trk020/a.json#1', '_inbox/trk020/a.json#2']);
});

test('unsourced number is nulled and noted; produced file passes importer validation', async () => {
  const root = await fixture();
  const model = { payload: payload(), draftSources: [{ path: 'name', ref: 'trk020.md#s1' }, { path: 'days[0].distanceKm', ref: 'invented' }], reviewNotes: [] };
  const seen = [];
  const file = await draftRouteItinerary(['--route', 'trk020'], deps(root, model, seen));
  assert.equal(file.plans[0].payload.days[0].distanceKm, null);
  assert.ok(file.plans[0].reviewNotes.includes('days[0].distanceKm 无来源，已置空'));
  assert.deepEqual(validateItineraryFile(file), []);
  assert.deepEqual(JSON.parse(await readFile(join(root, 'data/route-itineraries/trk020.json'), 'utf8')), file);
  assert.equal(seen.length, 2);
  assert.deepEqual(JSON.parse(seen[1].init.body).messages[1].content.includes('fake-model-key'), false);
});

test('valid citation preserves number and dry-run writes nothing', async () => {
  const root = await fixture();
  const model = { payload: payload(), draftSources: [{ path: 'name', ref: 'trk020.md#s1' }, { path: 'days[0].distanceKm', ref: 'trk020.md#s1' }], reviewNotes: [] };
  const file = await draftRouteItinerary(['--route', 'trk020', '--dry-run'], deps(root, model));
  assert.equal(file.plans[0].payload.days[0].distanceKm, 8);
  assert.deepEqual(validateItineraryFile(file), []);
  await assert.rejects(readFile(join(root, 'data/route-itineraries/trk020.json')), { code: 'ENOENT' });
});

test('an uncited recommended month clears the whole month array', async () => {
  const root = await fixture();
  const proposed = payload();
  proposed.bestMonths = [6, 7];
  const model = { payload: proposed, draftSources: [{ path: 'name', ref: 'trk020.md#s1' }, { path: 'days[0].distanceKm', ref: 'trk020.md#s1' }, { path: 'bestMonths[0]', ref: 'trk020.md#s1' }], reviewNotes: [] };
  const file = await draftRouteItinerary(['--route', 'trk020', '--dry-run'], deps(root, model));
  assert.equal(file.plans[0].payload.bestMonths, null);
  assert.ok(file.plans[0].reviewNotes.includes('bestMonths[1] 无来源，已置空'));
  assert.deepEqual(validateItineraryFile(file), []);
});

test('invalid model payload writes nothing', async () => {
  const root = await fixture();
  const model = { payload: { ...payload(), days: [] }, draftSources: [], reviewNotes: [] };
  await assert.rejects(draftRouteItinerary(['--route', 'trk020'], deps(root, model)), /days must contain 1-30 days/);
  await assert.rejects(readFile(join(root, 'data/route-itineraries/trk020.json')), { code: 'ENOENT' });
});

test('existing default file is not overwritten', async () => {
  const root = await fixture();
  const path = join(root, 'data/route-itineraries/trk020.json');
  await writeFile(path, 'reviewed');
  await assert.rejects(draftRouteItinerary(['--route', 'trk020'], deps(root, {})), /Refusing to overwrite/);
  assert.equal(await readFile(path, 'utf8'), 'reviewed');
});

test('no sources exits with a clear error before API calls', async () => {
  const root = await fixture(false);
  const seen = [];
  await assert.rejects(draftRouteItinerary(['--route', 'trk020'], deps(root, {}, seen)), /No sources found for trk020/);
  assert.equal(seen.length, 0);
});
