import { chooseOfficialPlan, officialPlanDocument, type OfficialPlan } from './official-plan.ts';
import { carryDailyStarts } from './itinerary-locations.ts';
import { presentItinerary } from './itinerary-presentation.ts';
import { mergeMainTransportItems, type MainTransport } from './main-transport.ts';

function assert(value: unknown, message: string) { if (!value) throw new Error(message); }

const shuttle = (from: string, to: string, position: 'start' | 'end') =>
  ({ from, to, mode: 'charter', duration: '约 3 小时', costRef: null, position });
const day = (kind: 'access_in' | 'hike', title: string, transfers: ReturnType<typeof shuttle>[], stay: string | null, tip: string | null = null) =>
  ({ kind, title, transfers, stay: stay ? { name: stay } : null, tip });
const plan = (id: string, days: OfficialPlan['payload']['days'], is_default = false): OfficialPlan => ({
  id, version: 1, route_id: 'trk008', is_default,
  payload: { name: id, summary: '党岭三湖', notes: ['带足保暖'], days },
});

const oneDay = plan('one', [day('hike', '卡尔杂村 → 甲玉拉措 → 党岭村', [shuttle('党岭村', '丹巴', 'end')], null)], true);
const threeDay = plan('three', [
  day('access_in', '丹巴 → 党岭村', [shuttle('丹巴', '党岭村', 'start')], '党岭村'),
  day('hike', '党岭村 → 葫芦海 → 卓雍措营地', [], '卓雍措营地', '早出发'),
  day('hike', '卓雍措营地 → 垭口 → 卡尔杂村', [shuttle('卡尔杂村', '丹巴', 'end')], null),
]);

Deno.test('plan choice uses the total including round-trip days', () => {
  assert(chooseOfficialPlan([oneDay, threeDay], 5, 2)?.id === 'three', '5 days = 3 plan days + 2 travel days');
  assert(chooseOfficialPlan([oneDay, threeDay], 3, 2)?.id === 'one', '3 days = 1 plan day + 2 travel days');
  assert(chooseOfficialPlan([oneDay, threeDay], null, 2)?.id === 'one', 'unknown total keeps the default plan');
});

Deno.test('official plan days sit between the round-trip days', () => {
  const doc = officialPlanDocument({ plan: threeDay, routeId: 'trk008', routeName: '党岭', travelDays: 2, totalDays: 5, requestedDays: 6 });
  assert(doc.journey === null && doc.schedule?.totalDays === 5, 'bound journey is rescheduled to the plan length');
  const titles = (name: string) => doc.itineraryItems.filter(item => item.day === name).map(item => item.title);
  assert(titles('Day 1').join('|') === '丹巴', 'Day 1 reaches the plan town');
  assert(doc.itineraryItems[0].location?.name === '丹巴', 'Day 1 location is the town, not the title');
  assert(titles('Day 2').join('|') === '包车从丹巴到党岭村（约 3 小时）|党岭村', 'access day keeps the shuttle and stay');
  assert(titles('Day 3').join('|') === '党岭村|葫芦海|卓雍措营地', 'stay is not repeated as a stop');
  assert(titles('Day 4').at(-1) === '包车从卡尔杂村到丹巴（约 3 小时）', 'exit shuttle ends the last plan day');
  assert(titles('Day 5').join('|') === '丹巴', 'return day leaves from the town');
  assert(doc.groupNotes.find(note => note.day === 'Day 2')?.note.startsWith('党岭三湖\n1. 带足保暖'), 'first plan day carries summary and notes');
  assert(doc.assumptions.some(item => item.includes('6 天')), 'changed total is disclosed');

  const presented = presentItinerary(carryDailyStarts(doc.itineraryItems), doc.groupNotes, 5);
  const shown = (name: string) => presented.items.filter(item => item.day === name).map(item => item.title);
  assert(shown('Day 2')[0] === '丹巴', 'day starts carry over from the town');
  assert(shown('Day 2')[1] === '包车从丹巴到党岭村（约 3 小时）', 'shuttle title survives presentation');
  assert(shown('Day 5').join('|') === '丹巴', 'no extra start after the exit shuttle');
});

Deno.test('without round-trip transport the plan starts on Day 1', () => {
  const doc = officialPlanDocument({ plan: threeDay, routeId: 'trk008', routeName: '党岭', travelDays: 0, totalDays: 3, requestedDays: null });
  assert(doc.itineraryItems[0].day === 'Day 1' && doc.itineraryItems[0].title.startsWith('包车'), 'no travel day prepended');
  assert(!doc.itineraryItems.some(item => item.day === 'Day 4'), 'no return day appended');
});

Deno.test('Day 1 survives the merge when the user lives in the hub city', () => {
  const doc = officialPlanDocument({ plan: oneDay, routeId: 'trk008', routeName: '党岭', travelDays: 2, totalDays: 3, requestedDays: 5 });
  const city = '成都市';
  const main = {
    hubs: [{ mode: 'rail', outboundOrigin: '成都东', outboundDestination: '成都东', returnOrigin: '成都东', returnDestination: '成都东',
      outboundUserCity: city, returnUserCity: city, outboundOriginCity: city, outboundDestinationCity: city, returnOriginCity: city, returnDestinationCity: city,
      railAlternatives: [], outboundOriginDisplayName: null, outboundDestinationDisplayName: null, returnOriginDisplayName: null, returnDestinationDisplayName: null }],
    queries: [], unresolved: [], itineraryItems: [], suggestedDays: null, durationBasis: null,
    request: { modes: ['rail'], adults: 1, origin: '四川省成都市锦江区', returnDestination: '四川省成都市锦江区', modesQuote: '', originQuote: '' },
  } as unknown as MainTransport;
  const merged = mergeMainTransportItems(doc.itineraryItems, main, { totalDays: 3 });
  const days = new Set(merged.map(item => item.day));
  assert(doc.groupNotes.every(note => days.has(note.day)), 'every day note keeps a row to attach to');
  assert(merged.find(item => item.day === 'Day 1')?.title === '卡尔杂村', 'Day 1 keeps the trailhead town');
});
