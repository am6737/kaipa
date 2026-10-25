import { buildPrompt, MAX_DAYS, normalizeItinerary, parseModelJson } from './extract.ts';

function assertEquals(actual: unknown, expected: unknown, message: string): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${message}: got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)}`);
}

const routes = [{ id: 'trk014', name: '格聂牧场线', region: '四川 理塘' }];

Deno.test('keeps stated fields and drops unknown route ids', () => {
  const draft = normalizeItinerary({
    name: ' 格聂 4 天 ',
    routeId: 'trk999',
    days: [{
      title: '下则通村 → 日照金山营地', date: '2027-06-20', kind: 'hike', distanceKm: 14.25, ascentM: 1200, stay: '日照金山营地',
      items: [{ title: '出发', kind: 'activity', timeStart: '7:30' }, { title: '', kind: 'activity' }],
    }],
  }, routes);
  assertEquals(draft.name, '格聂 4 天', 'name trimmed');
  assertEquals(draft.routeId, null, 'unknown route id dropped');
  assertEquals(draft.startDate, '2027-06-20', 'start date falls back to the first day');
  assertEquals(draft.days[0].distanceKm, 14.3, 'distance rounded to 0.1 km');
  assertEquals(draft.days[0].items, [{ title: '出发', kind: 'activity', timeStart: '07:30', timeEnd: null }], 'empty items dropped, clock padded');
});

Deno.test('rejects invented-looking values instead of keeping them', () => {
  const draft = normalizeItinerary({
    routeId: 'trk014',
    days: [{ title: 'D1', date: '2027-02-30', kind: 'trek', distanceKm: -3, ascentM: '800', items: [{ title: 'x', timeStart: '25:00' }] }],
  }, routes);
  assertEquals(draft.routeId, 'trk014', 'catalog route kept');
  assertEquals(draft.days[0].date, null, 'impossible date dropped');
  assertEquals(draft.days[0].kind, 'other', 'unknown kind falls back');
  assertEquals([draft.days[0].distanceKm, draft.days[0].ascentM], [null, null], 'non-positive or non-numeric values dropped');
  assertEquals(draft.days[0].items[0].timeStart, null, 'impossible time dropped');
});

Deno.test('caps the number of days', () => {
  const days = Array.from({ length: MAX_DAYS + 5 }, (_, index) => ({ title: `D${index + 1}` }));
  assertEquals(normalizeItinerary({ days }, routes).days.length, MAX_DAYS, 'days capped');
});

Deno.test('reads fenced JSON and lists the catalog in the prompt', () => {
  assertEquals(parseModelJson('```json\n{"name":"a"}\n```'), { name: 'a' }, 'fenced json');
  const prompt = buildPrompt(routes, '第一天', 2);
  if (!prompt.includes('trk014\t格聂牧场线') || !prompt.includes('2 张截图')) throw new Error('prompt is missing the catalog or image count');
});
