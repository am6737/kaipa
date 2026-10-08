import { itineraryItem } from './tools.ts';
import { presentItinerary } from './itinerary-presentation.ts';
import { planChunkSchema, planDocumentSchema, saveOperations } from './plan-document.ts';

function assert(value: unknown): asserts value { if (!value) throw new Error('Assertion failed'); }

Deno.test('brief daily summaries stay unchanged without duplicated provider receipts, retaining service times and coordinates', () => {
  const row = itineraryItem.parse({ day: 'Day 1', kind: 'custom', timeStart: '08:00', timeEnd: '18:00',
    title: '高铁/火车 G123 南宁东→成都东 · 二等座¥548/人 · 12306查询',
    location: { name: '南宁东', longitude: 108.4, latitude: 22.8 } });
  const result = presentItinerary([row, itineraryItem.parse({ day: 'Day 1', title: '抵达成都东 · G123', location: { name: '成都东' } })],
    [{ day: 'Day 1', note: '从南宁东乘高铁到成都东，抵达后住宿，为次日进山做准备。' }]);
  assert(result.items[0].title === '南宁东 · G123');
  assert(result.groupNotes[0].note === '从南宁东乘高铁到成都东，抵达后住宿，为次日进山做准备。');
  assert(result.items[1].title === '成都东 · G123');
  assert(result.items[0].timeEnd === '18:00' && result.items[0].location?.longitude === 108.4);
  assert(JSON.stringify(presentItinerary(result.items, result.groupNotes)) === JSON.stringify(result));
});

Deno.test('repeated daily start markers prefer the GPX place, while real text actions remain', () => {
  const result = presentItinerary([
    itineraryItem.parse({ day: 'Day 5', kind: 'custom', title: '从卓雍措营地出发', location: { name: '卓雍措营地' } }),
    itineraryItem.parse({ day: 'Day 5', kind: 'custom', title: '从D5：卓雍措营地', location: { name: 'D5：卓雍措营地', trackId: 't', trackMeters: 1000, trackLengthMeters: 2000, longitude: 101, latitude: 31 } }),
    itineraryItem.parse({ day: 'Day 5', kind: 'activity', routeId: 'r', title: '徒步第 2 天：卓雍措营地→垭口→甲依拉措→卡尔杂 · 约10.28km；包含碎石陡坡与长距离下降' }),
    itineraryItem.parse({ day: 'Day 5', kind: 'custom', title: '补充饮水' }),
  ]);
  assert(result.items.length === 3 && result.items[0].location?.trackId === 't');
  assert(result.items[1].routeId === 'r' && result.items[1].title === '徒步第 2 天');
  assert(result.items[2].title === '补充饮水');
  assert(result.groupNotes[0].note.includes('碎石陡坡') && result.groupNotes[0].note.includes('10.28'));
});

Deno.test('day summaries survive chunk parsing and are passed with the scoped itinerary write', () => {
  const chunk = planChunkSchema.parse({ itineraryItems: [{ day: 'Day 1', title: '成都东' }], groupNotes: [{ day: 'Day 1', note: '成都东出发，前往营地。' }] });
  const plan = planDocumentSchema.parse(chunk);
  const operation = saveOperations(plan).find(entry => entry.tool === 'add_itinerary_items');
  assert(JSON.stringify(operation?.args.groupNotes) === JSON.stringify(chunk.groupNotes));
  assert(planDocumentSchema.parse({}).groupNotes.length === 0);
});

Deno.test('returning to one place later keeps distinct stops and a known arrival needs no invented departure', () => {
  const rows = [
    itineraryItem.parse({ day: 'Day 1', kind: 'custom', title: '前往车站', location: { name: '车站' }, timeEnd: '08:00' }),
    itineraryItem.parse({ day: 'Day 1', kind: 'custom', title: '前往酒店', location: { name: '酒店' } }),
    itineraryItem.parse({ day: 'Day 1', kind: 'custom', title: '返回车站；领取寄存行李', location: { name: '车站' } }),
  ];
  const result = presentItinerary(rows);
  assert(result.items.length === 3 && result.items[0].timeStart === '08:00' && result.items[0].timeEnd === null);
  assert(result.items[0].title === '车站' && result.items[2].title === '车站（第2次）');
  assert(result.groupNotes[0].note.includes('领取寄存行李'));
  assert(JSON.stringify(presentItinerary(result.items, result.groupNotes)) === JSON.stringify(result));
});

Deno.test('adjacent station markers merge into the provider stop and retain earlier arrival time in notes', () => {
  const result = presentItinerary([
    itineraryItem.parse({ day: 'Day 1', kind: 'custom', title: '前往南宁东', timeStart: '07:00', location: { name: '南宁东' } }),
    itineraryItem.parse({ day: 'Day 1', kind: 'custom', title: '高铁 G123 南宁东→成都东 · 12306查询', timeStart: '08:00', timeEnd: '18:00', location: { name: '南宁东' } }),
    itineraryItem.parse({ day: 'Day 1', kind: 'custom', title: '抵达成都东 · G123', timeStart: '18:00', location: { name: '成都东', incomingMode: 'rail' } }),
    itineraryItem.parse({ day: 'Day 1', kind: 'custom', title: '从成都东出发', location: { name: '成都东' } }),
  ], [{ day: 'Day 1', note: 'ResearchBrief提供路线资料，按trk008安排徒步。' }]);
  assert(result.items.length === 2 && result.items[0].timeStart === '08:00' && result.items[0].timeEnd === '18:00');
  assert(result.items[1].location?.incomingMode === 'rail' && result.items[1].timeStart === '18:00');
  assert(result.groupNotes[0].note.includes('07:00') && !/ResearchBrief|trk008/.test(result.groupNotes[0].note));
  assert(JSON.stringify(presentItinerary(result.items, result.groupNotes)) === JSON.stringify(result));
});

Deno.test('a brief supplied note does not erase a separate actionable clause', () => {
  const result = presentItinerary([itineraryItem.parse({ day: 'Day 1', kind: 'custom',
    title: '返回车站；领取寄存行李', location: { name: '车站' } })],
    [{ day: 'Day 1', note: '游览后返回车站。' }]);
  assert(result.groupNotes[0].note === '游览后返回车站。');
  assert(result.items[0].title === '车站（领取寄存行李）');
  assert(JSON.stringify(presentItinerary(result.items, result.groupNotes)) === JSON.stringify(result));
});

Deno.test('standalone query explanations are removed while known route constraints remain', () => {
  const result = presentItinerary([itineraryItem.parse({ day: 'Day 1', title: '成都东' })],
    [{ day: 'Day 1', note: '从成都东乘高铁返回南宁东，抵达后结束行程。返程班次为查询参考，未构成预订。' }]);
  assert(result.groupNotes[0].note === '从成都东乘高铁返回南宁东，抵达后结束行程。');
  const constrained = presentItinerary([itineraryItem.parse({ day: 'Day 2', title: '徒步至营地' })],
    [{ day: 'Day 2', note: '徒步至营地。垭口道路封闭，需绕行。' }]);
  assert(constrained.groupNotes[0].note.includes('道路封闭'));
  assert(JSON.stringify(presentItinerary(result.items, result.groupNotes)) === JSON.stringify(result));
});
