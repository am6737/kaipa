import { chooseOfficialPlan, officialPlanDocument, type OfficialPlan, type OfficialSelection } from './official-plan.ts';
import { routeTrackFacts } from './track-metrics.ts';
import { carryDailyStarts } from './itinerary-locations.ts';
import { presentItinerary } from './itinerary-presentation.ts';
import { mergeMainTransportItems, type MainTransport } from './main-transport.ts';

function assert(value: unknown, message: string) { if (!value) throw new Error(message); }

const shuttle = (from: string, to: string, position: 'start' | 'end') =>
  ({ from, to, mode: 'charter', duration: '约 3 小时', costRef: null as string | null, booking: null as string | null, position });
const day = (kind: 'access_in' | 'hike', title: string, transfers: ReturnType<typeof shuttle>[], stay: string | null, tip: string | null = null) =>
  ({ kind, title, transfers, stay: stay ? { name: stay } : null, tip });
const plan = (id: string, days: OfficialPlan['payload']['days'], is_default = false): OfficialPlan => ({
  id, version: 1, route_id: 'trk008', is_default,
  payload: { name: id, summary: '党岭三湖', notes: ['带足保暖'], days },
});

const select = (value: OfficialPlan, travel: { accessDay: boolean; withTravel?: boolean }, requestedDays: number | null = null, extra: Partial<OfficialSelection> = {}): OfficialSelection => ({
  plan: value, routeId: value.route_id, routeName: value.id, track: null, withTravel: travel.withTravel ?? true, travelBasis: [], requestedDays,
  accessDay: travel.accessDay, totalDays: value.payload.days.length + Number(travel.accessDay), ...extra,
});

const oneDay = plan('one', [day('hike', '卡尔杂村 → 甲玉拉措 → 党岭村', [shuttle('党岭村', '丹巴', 'end')], null)], true);
const threeDay = plan('three', [
  day('access_in', '丹巴 → 党岭村', [shuttle('丹巴', '党岭村', 'start')], '党岭村'),
  day('hike', '党岭村 → 葫芦海 → 卓雍措营地', [], '卓雍措营地', '早出发'),
  day('hike', '卓雍措营地 → 垭口 → 卡尔杂村', [shuttle('卡尔杂村', '丹巴', 'end')], null),
]);

Deno.test('plan choice uses the total including the day there', () => {
  assert(chooseOfficialPlan([oneDay, threeDay], 4, true)?.id === 'three', '4 days = 3 plan days + 1 travel day');
  assert(chooseOfficialPlan([oneDay, threeDay], 2, true)?.id === 'one', '2 days = 1 plan day + 1 travel day');
  assert(chooseOfficialPlan([oneDay, threeDay], null, true)?.id === 'one', 'unknown total keeps the default plan');
  assert(chooseOfficialPlan([oneDay, threeDay], 3, false)?.id === 'three', 'without travel the plan days are the total');
});

Deno.test('official plan days follow the day there and end with the walk', () => {
  const doc = officialPlanDocument(select(threeDay, { accessDay: true }, 6));
  assert(doc.journey === null && doc.schedule?.totalDays === 4, 'bound journey is rescheduled to the plan length');
  const titles = (name: string) => doc.itineraryItems.filter(item => item.day === name).map(item => item.title);
  assert(titles('Day 1').join('|') === '在丹巴住一晚', 'Day 1 reaches the plan town and stays there');
  assert(doc.itineraryItems[0].location?.name === '丹巴' && doc.itineraryItems[0].kind === 'stay', 'the town night is a stay, not a walking stop');
  assert(titles('Day 2').join('|') === '包车从丹巴到党岭村（约 3 小时）|党岭村', 'access day keeps the shuttle and stay');
  assert(titles('Day 3').join('|') === '党岭村|葫芦海|卓雍措营地', 'stay is not repeated as a stop');
  assert(titles('Day 4').at(-1) === '包车从卡尔杂村到丹巴（约 3 小时）', 'exit shuttle ends the last plan day');
  assert(!doc.itineraryItems.some(item => item.day === 'Day 5'), 'no day home');
  assert(doc.groupNotes.find(note => note.day === 'Day 1')?.note.startsWith('three | three'), 'the plan overview opens Day 1');
  assert(doc.groupNotes.find(note => note.day === 'Day 4')?.note.includes('注意事项：\n- 带足保暖'), 'the plan notes close the last day');
  assert(doc.assumptions.some(item => item.includes('6 天')), 'changed total is disclosed');

  const presented = presentItinerary(carryDailyStarts(doc.itineraryItems), doc.groupNotes, 4);
  const shown = (name: string) => presented.items.filter(item => item.day === name).map(item => item.title);
  assert(shown('Day 2').includes('包车从丹巴到党岭村（约 3 小时）'), 'shuttle title survives presentation');
});

Deno.test('plan shuttle rows are road arrivals and nothing else is', () => {
  const doc = officialPlanDocument(select(threeDay, { accessDay: true }, 6));
  const roads = doc.itineraryItems.filter(item => item.location?.incomingMode === 'road');
  assert(roads.length === 2, 'both plan rides are marked as road legs');
  assert(roads.map(item => `${item.title}|${item.location?.name}`).join('\n')
    === '包车从丹巴到党岭村（约 3 小时）|党岭村\n包车从卡尔杂村到丹巴（约 3 小时）|丹巴',
    'a road row sits at the place its ride drives to');
  assert(doc.itineraryItems.filter(item => item.location?.incomingMode !== 'road')
    .every(item => item.location?.incomingMode == null), 'stops, stays and the town night claim no arrival mode');

  const presented = presentItinerary(carryDailyStarts(doc.itineraryItems), doc.groupNotes, 4);
  const shown = presented.items.filter(item => item.location?.incomingMode === 'road');
  assert(shown.length === 2 && shown.every(item => /^包车从.+到.+（约 3 小时）$/.test(item.title)),
    'presentation keeps the road marker and its words');
});

Deno.test('shared ride cost and booking go to the day note, not the title', () => {
  const ride = { from: '新乡', to: '马武寨', mode: 'shared', duration: '约 1.5 至 2 小时', costRef: '拼车约 60～70 元/人', booking: '提前约好往返车', position: 'start' as const };
  const doc = officialPlanDocument(select(plan('ride', [day('hike', '马武寨 → 张沟', [ride], '张沟', '带头灯')]), { accessDay: true }, 2));
  const presented = presentItinerary(carryDailyStarts(doc.itineraryItems), doc.groupNotes, 2);
  assert(presented.items.some(item => item.day === 'Day 2' && item.title === '拼车从新乡到马武寨（约 1.5 至 2 小时）'), 'ride title survives presentation');
  const note = doc.groupNotes.find(entry => entry.day === 'Day 2')?.note ?? '';
  assert(note.includes('交通：\n- 拼车 新乡 → 马武寨：约 60～70 元/人，约 1.5 至 2 小时，提前约好往返车') && note.includes('带头灯'), `cost, booking and tip stay in the note: ${note}`);
});

Deno.test('without travel the plan starts on Day 1', () => {
  const doc = officialPlanDocument(select(threeDay, { accessDay: false, withTravel: false }));
  assert(doc.itineraryItems[0].day === 'Day 1' && doc.itineraryItems[0].title.startsWith('包车'), 'no travel day prepended');
  assert(!doc.itineraryItems.some(item => item.day === 'Day 4'), 'no return day appended');
});

Deno.test('Day 1 survives the merge when the user lives in the hub city', () => {
  const doc = officialPlanDocument(select(oneDay, { accessDay: true }, 2));
  const city = '成都市';
  const main = {
    hubs: [{ mode: 'rail', outboundOrigin: '成都东', outboundDestination: '成都东', returnOrigin: '成都东', returnDestination: '成都东',
      outboundUserCity: city, returnUserCity: city, outboundOriginCity: city, outboundDestinationCity: city, returnOriginCity: city, returnDestinationCity: city,
      railAlternatives: [], outboundOriginDisplayName: null, outboundDestinationDisplayName: null, returnOriginDisplayName: null, returnDestinationDisplayName: null }],
    queries: [], unresolved: [], itineraryItems: [], suggestedDays: null, durationBasis: null,
    request: { modes: ['rail'], adults: 1, origin: '四川省成都市锦江区', returnDestination: '四川省成都市锦江区', modesQuote: '', originQuote: '' },
  } as unknown as MainTransport;
  const merged = mergeMainTransportItems(doc.itineraryItems, main, { totalDays: 2 });
  const days = new Set(merged.map(item => item.day));
  assert(doc.groupNotes.every(note => days.has(note.day)), 'every day note keeps a row to attach to');
  assert(merged.some(item => item.day === 'Day 1' && item.title === '在卡尔杂村住一晚'), 'Day 1 keeps the trailhead town');
});

// 南太行 as published: stops in the route's stated km, a meeting time in 新乡.
const staged = (): OfficialPlan => ({
  id: '11111111-1111-4111-8111-111111111111', version: 2, route_id: 'trk076', is_default: true,
  payload: { name: '南太行正穿两天', summary: '马武寨到韩口', notes: [],
    access: { town: '新乡', meetingPoint: '新乡站', arriveBy: '06:45', stations: [{ name: '新乡' }, { name: '新乡东' }] },
    exit: { town: '新乡', readyAt: '17:30', stations: [{ name: '新乡' }, { name: '新乡东' }] },
    days: [
      { kind: 'hike', title: '马武寨 → 张沟', tip: null, stay: { name: '张沟' }, transfers: [{ from: '新乡', to: '马武寨', mode: 'shared', duration: null, costRef: null, position: 'start' }],
        stops: [{ name: '马武寨', km: 0 }, { name: '西莲', km: 18.2 }, { name: '张沟', km: 27.717 }] },
      { kind: 'hike', title: '张沟 → 韩口', tip: null, stay: null, transfers: [{ from: '韩口', to: '新乡', mode: 'shared', duration: null, costRef: null, position: 'end' }],
        stops: [{ name: '张沟', km: 27.717 }, { name: '窟窿山', km: 39.965 }, { name: '韩口', km: 46.135 }] },
    ] },
});
const track = routeTrackFacts(
  [{ km: 0, ele: 1000 }, { km: 27.717, ele: 1200 }, { km: 46.135, ele: 400 }],
  [{ name: '张沟', km: 27.717, cumulativeAscentMeters: 726 }, { name: '韩口', km: 46.135, cumulativeAscentMeters: 1802 }],
);

Deno.test('a walk that starts on the arrival day keeps the plan days as the trip', () => {
  const doc = officialPlanDocument(select(staged(), { accessDay: false }, null, { track, travelBasis: ['K2276 次赶得上集合'] }));
  assert(doc.schedule?.totalDays === 2, 'no reserved travel day');
  const titles = (name: string) => doc.itineraryItems.filter(item => item.day === name).map(item => item.title);
  assert(titles('Day 1').join('|') === '拼车从新乡到马武寨|西莲|张沟', `the day walks its stops, got ${titles('Day 1').join('|')}`);
  assert(titles('Day 2').join('|') === '张沟|窟窿山|韩口|拼车从韩口到新乡', `the second day ends at its last stop, then the ride out, got ${titles('Day 2').join('|')}`);
  const first = doc.groupNotes.find(note => note.day === 'Day 1')?.note ?? '';
  assert(first.includes('当天乘早班车到新乡，06:45 前到新乡站集合') && first.includes('徒步约 27.7 km，爬升约 730 m，下降约 530 m'), `day 1 note: ${first}`);
  assert(first.startsWith(`${staged().id} | 南太行正穿两天\n全程约 46.1 km，累计爬升约 1810 m`), `the overview opens the first walking day: ${first}`);
  const last = doc.groupNotes.find(note => note.day === 'Day 2')?.note ?? '';
  assert(last.includes('徒步约 18.4 km，爬升约 1080 m，下降约 1880 m') && !last.includes('返程'), `day 2 note: ${last}`);
  assert(JSON.stringify(doc.endpoints.map(endpoint => [endpoint.day, endpoint.officialStop?.dayIndex])) === '[["Day 1",0],["Day 2",1]]', 'each walking day ends at its last stop');
  assert(doc.assumptions.includes('K2276 次赶得上集合'), 'the timetable basis is disclosed');
});

Deno.test('the merged plan keeps its road rides beside the rail hub chain', () => {
  const doc = officialPlanDocument(select(staged(), { accessDay: false }, null, { track }));
  const main = {
    hubs: [{ mode: 'rail', outboundOrigin: '郑州', outboundDestination: '新乡', returnOrigin: '新乡', returnDestination: '郑州',
      outboundOriginCity: '郑州市', outboundDestinationCity: '新乡市', returnOriginCity: '新乡市', returnDestinationCity: '郑州市',
      outboundUserCity: '郑州市', returnUserCity: '郑州市', railAlternatives: [],
      outboundOriginDisplayName: null, outboundDestinationDisplayName: null, returnOriginDisplayName: null, returnDestinationDisplayName: null }],
    queries: [], unresolved: [], itineraryItems: [], suggestedDays: null, durationBasis: '',
    request: { modes: ['rail'], adults: 1, origin: '郑州', returnDestination: '郑州', modesQuote: '', originQuote: '' },
  } as unknown as MainTransport;
  const merged = mergeMainTransportItems(doc.itineraryItems, main, { totalDays: 3, originCity: '郑州市' });
  const titles = merged.filter(item => item.location?.incomingMode === 'road').map(item => `${item.day} ${item.title}`);
  assert(titles.join('|') === 'Day 1 拼车从新乡到马武寨|Day 2 拼车从韩口到新乡', `both rides stay road legs, got ${titles.join('|')}`);
  const hub = merged.filter(item => item.location?.incomingMode === 'rail').map(item => `${item.day} ${item.title}`);
  assert(hub.join('|') === 'Day 1 抵达新乡', `the hub arrival stays the rail row, got ${hub.join('|')}`);
  const day1 = merged.filter(item => item.day === 'Day 1').map(item => item.location!.name);
  assert(day1.join('→') === '郑州→新乡→马武寨→西莲→张沟', `the fixed chain still opens the trip, got ${day1.join('→')}`);
});

Deno.test('a trip that must arrive the evening before gets a town night first', () => {
  const doc = officialPlanDocument(select(staged(), { accessDay: true }, null, { track }));
  assert(doc.schedule?.totalDays === 3, 'one travel day');
  assert(doc.itineraryItems[0].day === 'Day 1' && doc.itineraryItems[0].title === '在新乡住一晚', 'Day 1 stays in the meeting town');
  assert(doc.groupNotes.find(note => note.day === 'Day 2')?.note.includes('交通：\n- 06:45 前到新乡站集合'), 'the meeting time is in the walking day');
  assert(JSON.stringify(doc.endpoints.map(endpoint => endpoint.day)) === '["Day 2","Day 3"]', 'walking days shift by the travel day');
  assert(!doc.groupNotes.find(note => note.day === 'Day 2')?.note.includes('乘早班车'), 'no same-day arrival advice after a town night');
});
