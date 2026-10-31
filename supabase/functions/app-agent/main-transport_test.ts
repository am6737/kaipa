import { REFERENCE_SEAT } from './rail-timetable.ts';
import { collectMainTransport, collectOfficialTransport, timetableDate, mainTransportSchema, mergeMainTransportItems, mainTransportQueries, providerItinerary, transportEndpointsSchema } from './main-transport.ts';
import { resolveTravelRequest, travelIntake, travelRequestSchema, travelContextFromRequest } from './travel-request.ts';
import { constrainTaskDecision, taskDecisionSchema, type TaskState } from './task.ts';
import { carryDailyStarts } from './itinerary-locations.ts';
import { presentItinerary } from './itinerary-presentation.ts';
import { itineraryItem } from './tools.ts';

function assert(value: unknown, message = 'Assertion failed'): asserts value { if (!value) throw new Error(message); }
const now = Date.parse('2026-10-08T00:00:00+08:00');
const request = travelRequestSchema.parse({ origin: '杭州', returnDestination: '杭州', modes: ['rail'] });
const endpoints = transportEndpointsSchema.parse({ endpoints: [{ mode: 'rail', outboundOrigin: '杭州东', outboundDestination: '成都东', returnOrigin: '成都东', returnDestination: '杭州东' }] });
const rail = { available: true, status: 'results', offers: [{ trainNumber: 'G123', from: '杭州东', to: '成都东',
  departure: '2026-10-09T08:00:00+08:00', arrival: '2026-10-09T18:30:00+08:00', seats: [{ availability: '有', pricePerAdult: 300 }] }] };

Deno.test('current location is the default origin without confirmation and explicit places win', () => {
  const location = { status: 'available' as const, latitude: 30, longitude: 120, accuracy: 20, timestamp: Date.now(), coordinateSystem: 'WGS84' as const, placeName: '杭州市' };
  const located = resolveTravelRequest(null, null, location);
  assert(located.origin === '杭州市' && located.returnDestination === '杭州市');
  assert(travelIntake(located, location) === null, 'usable GPS must not trigger confirmation or a mode questionnaire');
  assert(located.modes.join(',') === 'rail,flight', 'no preference means compare public transport');
  assert(resolveTravelRequest(request, null, location).origin === '杭州', 'explicit origin overrides GPS');
  const retained = travelContextFromRequest(request, null, 'j');
  assert(resolveTravelRequest(null, retained, location).modes[0] === 'rail');
  assert(resolveTravelRequest(null, retained, location).origin === '杭州', 'retained trip origin survives a new fix');
  const empty = resolveTravelRequest(null);
  assert(travelIntake(empty)?.quickReplies[0]?.action === 'request_location');
  assert(/请设置出发地/.test(travelIntake(empty)?.question || '') && !/无法获取/.test(travelIntake(empty)?.question || ''),
    'location that was never requested is not reported as a failure');
  const denied = travelIntake(empty, { status: 'permission_denied' });
  assert(denied?.question.startsWith('没有定位权限') && denied.quickReplies[0]?.action === 'request_location',
    'denied location still offers the departure picker, which allows manual entry');
  assert(!resolveTravelRequest(null, { ...retained, origin: null, returnDestination: null, locationDeclined: true }, location).origin);
  assert(!resolveTravelRequest(null, null, { ...location, timestamp: 0 }).origin, 'stale fix cannot silently become departure');
});

Deno.test('preference continuation preserves the entire authorized journey and previous origin', () => {
  const previous: TaskState = { runId: 'old', journeyId: null, decision: taskDecisionSchema.parse({
    objective: '完整旅程', mode: 'execute', continuation: false, authorizationQuote: '帮我规划', operations: ['create_journey', 'add_itinerary_items', 'add_packing_items'],
    requiredOperations: ['create_journey', 'add_itinerary_items', 'add_packing_items'], fullHikingPlan: true, destination: '党岭', plannedDate: '2026-10-09',
    dateUndecided: false, days: 5, trackAttachmentName: null, packingMode: 'full', constraints: [], travelRequest: { ...request, modes: [] },
  }), outcome: { status: 'waiting', pendingQuestion: '选择交通方式', missingOperations: ['create_journey', 'add_itinerary_items', 'add_packing_items'], draft: null } };
  const input = taskDecisionSchema.parse({ ...previous.decision, fullHikingPlan: false, destination: null, plannedDate: null, days: null, packingMode: 'none',
    continuation: true, authorizationQuote: '', operations: [], requiredOperations: [], travelRequest: { modes: ['rail'], modesQuote: '高铁' } });
  const decision = constrainTaskDecision(input, '高铁', previous, null);
  assert(decision.mode === 'execute' && decision.fullHikingPlan && decision.packingMode === 'full');
  assert(decision.operations.includes('create_journey') && decision.operations.includes('add_packing_items'));
  assert(decision.travelRequest?.origin === '杭州' && decision.travelRequest.modes[0] === 'rail');
  assert(decision.plannedDate === '2026-10-09' && decision.days === 5);
});

Deno.test('model-invented origin/preference without user quotes is discarded', () => {
  const input = taskDecisionSchema.parse({ objective: '规划', mode: 'execute', continuation: false, authorizationQuote: '帮我规划', operations: ['create_journey'], requiredOperations: [],
    destination: '党岭', plannedDate: null, dateUndecided: true, days: 5, trackAttachmentName: null, packingMode: 'none', constraints: [], travelRequest: request });
  const constrained = constrainTaskDecision(input, '帮我规划党岭', null, null);
  assert(!constrained.travelRequest?.origin && !constrained.travelRequest?.modes.length);
});

Deno.test('main transport queries only the way there and builds real service rows from provider receipts', async () => {
  const calls: string[] = [];
  const main = await collectMainTransport({ now, request, endpoints, plannedDate: '2026-10-09', days: 5, query: async query => {
    calls.push(`${query.direction}:${query.departureDate}`);
    return rail;
  } });
  assert(calls.join(',') === 'outbound:2026-10-09', calls.join(','));
  assert(main.itineraryItems[0].day === 'Day 1' && main.itineraryItems[0].timeStart === '08:00' && main.itineraryItems[0].title.includes('G123'));
  assert(main.itineraryItems.length === 2 && main.itineraryItems.every(item => item.day === 'Day 1'), 'no return rows');
  assert(!main.unresolved.some(value => value.includes('返程')), main.unresolved.join(' / '));
});

Deno.test('unknown dates and unavailable providers never produce invented train/flight rows', async () => {
  let calls = 0;
  const undated = await collectMainTransport({ now, request, endpoints, plannedDate: null, days: 5, query: async () => { calls++; return rail; } });
  assert(calls === 0 && undated.itineraryItems.length === 0 && undated.unresolved.some(value => value.includes('date_required')));
  const failed = await collectMainTransport({ now, request, endpoints, plannedDate: '2026-10-09', days: 5, query: async () => ({ available: false, status: 'not_on_sale' }) });
  assert(failed.itineraryItems.length === 0 && failed.unresolved.some(value => value.includes('not_on_sale')));
  const sold = providerItinerary(mainTransportQueries(request, endpoints, '2026-10-09')[0], { ...rail, offers: rail.offers.map(value => ({ ...value, seats: [{ availability: '无' }] })) }, '2026-10-09', now);
  assert(sold.length === 0);
});

Deno.test('unsafe train connections are never chosen; overnight arrival remains explicit', () => {
  const query = mainTransportQueries(request, endpoints, '2026-10-09')[0];
  assert(providerItinerary(query, { ...rail, offers: [{ ...rail.offers[0], connection: { usableForPlanning: false } }] }, '2026-10-09', now).length === 0);
  const overnight = providerItinerary(query, { ...rail, offers: [{ ...rail.offers[0], arrival: '2026-10-10T06:30:00+08:00' }] }, '2026-10-09', now);
  assert(overnight[0].title.includes('次日2026-10-10') && overnight[0].timeEnd === '06:30');
});

Deno.test('driving uses actual AMap distance/duration and invents no departure time', () => {
  const query = { direction: 'outbound' as const, mode: 'self_drive' as const, earliestHour: null, origin: '成都', destination: '党岭村', departureDate: '2026-10-09' };
  const items = providerItinerary(query, { available: true, status: 'results', distanceKm: 320, durationMinutes: 420 }, '2026-10-09', now);
  assert(items.length === 2 && items[1].title.includes('320km') && !items[0].timeStart);
});

Deno.test('flight rows retain provider flight numbers, airport codes and local timestamps', () => {
  const query = { direction: 'outbound' as const, mode: 'flight' as const, earliestHour: null, origin: 'NNG', destination: 'CTU', departureDate: '2026-10-09' };
  const items = providerItinerary(query, { available: true, status: 'results', offers: [{ itineraries: [{ segments: [{
    from: 'NNG', to: 'CTU', departure: '2026-10-09T09:30:00', arrival: '2026-10-09T11:30:00', marketingCarrier: 'CA', flightNumber: '1234',
  }] }] }] }, '2026-10-09', now);
  assert(items.length === 2 && items[0].title.includes('CA1234') && items[0].title.includes('NNG→CTU'));
  assert(items[0].timeStart === '09:30' && items[0].timeEnd === '11:30');
  assert(providerItinerary(query, { available: false, status: 'not_configured' }, '2026-10-09', now).length === 0);
});

Deno.test('model duplicate trains and invented main-service rows are replaced while local transfers survive', async () => {
  const main = await collectMainTransport({ now, request, endpoints, plannedDate: '2026-10-09', days: 5, query: async () => rail });
  const template = main.itineraryItems[0];
  const merged = mergeMainTransportItems([
    { ...template, title: '高铁 G123 杭州东→成都东 · 猜测票价¥999' },
    { ...template, title: '乘高铁 G9999 到成都' },
    { ...template, title: '成都东高铁站→党岭村 网约车接驳', timeStart: null, timeEnd: null },
  ], main);
  assert(merged.filter(item => item.title.includes('G123')).length === main.itineraryItems.length);
  assert(!merged.some(item => item.title.includes('999')));
  assert(merged.some(item => item.title.includes('网约车接驳')));
});

Deno.test('model arrival spanning the same provider train is removed before itinerary validation', async () => {
  const main = await collectMainTransport({ now, request, endpoints, plannedDate: '2026-10-09', days: 5, query: async () => rail });
  const train = main.itineraryItems[0];
  const arrival = main.itineraryItems[1];
  const merged = mergeMainTransportItems([{ ...train, title: '抵达成都东', location: { ...arrival.location!, incomingMode: null },
    startLocation: train.location }], main);
  assert(merged.some(item => item.title === '前往杭州东'), 'the server adds the origin-to-station local leg');
  assert(!merged.some(item => item.day !== 'Day 1' && item.location?.name === '杭州东'), 'no return skeleton');
  assert(merged.every(item => item.title !== '抵达成都东'));
});

Deno.test('generic overnight airport duplicates are replaced without removing real transfers', async () => {
  const flight = { ...rail, offers: [{ itineraries: [{ segments: [{
    from: '吴圩机场', to: '新郑国际机场', departure: '2026-10-09T23:00:00+08:00',
    arrival: '2026-10-10T01:30:00+08:00', marketingCarrier: 'PN', flightNumber: '6478',
  }] }] }] };
  const flightRequest = { ...request, modes: ['flight' as const] };
  const flightEndpoints = transportEndpointsSchema.parse({ endpoints: [{ mode: 'flight', outboundOrigin: '吴圩机场', outboundDestination: '新郑国际机场', returnOrigin: '新郑国际机场', returnDestination: '吴圩机场' }] });
  const main = await collectMainTransport({ now, request: flightRequest, endpoints: flightEndpoints, plannedDate: '2026-10-09', days: 6,
    query: async query => query.direction === 'outbound' ? flight : { available: false, status: 'empty' } });
  const departure = main.itineraryItems[0];
  const transfer = { ...departure, title: '前往机场接驳', timeStart: '20:00', timeEnd: '21:00' };
  const merged = mergeMainTransportItems([{ ...departure, title: '前往郑州中转' }, transfer], main);
  assert(merged.filter(item => item.timeStart === '23:00' && item.timeEnd === '01:30').length === 1, 'a generic title must not duplicate the provider flight interval');
  assert(merged.some(item => item.title === transfer.title), 'a separate local transfer must remain');
  assert(merged.some(item => item.day === 'Day 2' && item.location?.name === '新郑国际机场'), 'next-day arrival must remain');
  assert(JSON.stringify(mergeMainTransportItems(merged, main)) === JSON.stringify(merged), 'repeated merging must be idempotent');
});

Deno.test('rail queries use waking-hour defaults and per-person price uses an available inexpensive seat', () => {
  const queries = mainTransportQueries(request, endpoints, '2026-10-09');
  assert(queries.length === 1 && queries[0].earliestHour === 6);
  const items = providerItinerary(queries[0], { ...rail, offers: [{ ...rail.offers[0], seats: [
    { name: '商务座', availability: '有', pricePerAdult: 900 }, { name: '二等座', availability: '有', pricePerAdult: 300 },
  ] }] }, '2026-10-09', now);
  assert(items[0].title.includes('二等座¥300/人') && !items[0].title.includes('900'));
});

Deno.test('empty exact-station rail results check one explicit alternative and retain both queries', async () => {
  const hubs = transportEndpointsSchema.parse({ endpoints: [{ mode: 'rail', outboundOrigin: '南宁东', outboundDestination: '成都',
    returnOrigin: '成都东', returnDestination: '南宁东',
    railAlternatives: [{ direction: 'outbound', origin: '南宁东', destination: '成都东' }] }] });
  const calls: string[] = [];
  const main = await collectMainTransport({ now, request, endpoints: hubs, plannedDate: '2026-10-09', days: 5, query: async q => {
    calls.push(`${q.origin}→${q.destination}`);
    return q.destination === '成都' ? { available: true, status: 'empty', offers: [] } : rail;
  } });
  assert(calls.includes('南宁东→成都') && calls.includes('南宁东→成都东'));
  assert(main.queries.length === 2, 'initial empty query and alternate result both remain inspectable');
  assert(main.unresolved.some(text => text.includes('不同车站')));
});

Deno.test('unavailable rail provider never triggers alternate station retries', async () => {
  const hubs = transportEndpointsSchema.parse({ endpoints: [{ ...endpoints.endpoints[0],
    railAlternatives: [{ direction: 'outbound', origin: '杭州', destination: '成都东' }] }] });
  let calls = 0;
  await collectMainTransport({ now, request, endpoints: hubs, plannedDate: '2026-10-09', days: 5,
    query: async () => { calls++; return { available: false, status: 'provider_error' }; } });
  assert(calls === 1, 'one outbound call, without retries');
});

Deno.test('undecided total days keep a clearly labelled candidate duration', async () => {
  const hubs = transportEndpointsSchema.parse({ ...endpoints, suggestedDays: 4,
    durationBasis: '去程 1 天、徒步 2 天、进山接驳 1 天，公路耗时仍为估算' });
  const dates: Array<string | null> = [];
  const main = await collectMainTransport({ now, request, endpoints: hubs, plannedDate: '2026-10-09', days: null,
    query: async q => { dates.push(q.departureDate); return { available: true, status: 'empty', offers: [] }; } });
  assert(dates.join(',') === '2026-10-09', dates.join(','));
  assert(main.suggestedDays === 4 && main.unresolved.some(text => text.includes('不是用户已指定')));
  const fixed = await collectMainTransport({ now, request, endpoints: hubs, plannedDate: '2026-10-09', days: 4,
    query: async q => ({ available: true, status: 'empty', offers: [], date: q.departureDate }) });
  assert(fixed.suggestedDays == null, 'explicit total days override estimated duration');
});

Deno.test('untimed hike/lodging order survives merging and transfer mentioning a train is retained', async () => {
  const main = await collectMainTransport({ now, request, endpoints, plannedDate: '2026-10-09', days: 5, query: async () => rail });
  const template = main.itineraryItems[0];
  const rows = mergeMainTransportItems([
    { ...template, day: 'Day 2', kind: 'activity', routeId: 'r', title: '徒步线路', timeStart: null, timeEnd: null },
    { ...template, day: 'Day 2', kind: 'stay', title: '营地过夜', timeStart: null, timeEnd: null },
    { ...template, day: 'Day 2', title: '成都东→卡尔杂 接驳，G123 到站后出发', startLocation: { ...template.location!, name: '成都东' }, location: { ...template.location!, name: '卡尔杂村' }, timeStart: null, timeEnd: null },
  ], main);
  const hike = rows.filter(item => item.day === 'Day 2');
  assert(hike[0].kind === 'activity' && hike[1].kind === 'stay' && hike[2].title.includes('接驳'));
  assert(!rows.some(item => item.day === 'Day 5'), 'nothing is added after the walk');
});

Deno.test('departed or near-departure trains are skipped in favor of the next boardable offer', async () => {
  const now = Date.parse('2026-10-08T20:00:00+08:00');
  const query = mainTransportQueries(request, endpoints, '2026-10-08')[0];
  const offer = (trainNumber: string, departure: string) => ({ ...rail.offers[0], trainNumber, departure,
    arrival: '2026-10-09T06:30:00+08:00' });
  const result = { ...rail, cached: true, offers: [
    offer('G3586', '2026-10-08T16:43:00+08:00'), offer('G100', '2026-10-08T20:59:00+08:00'),
    offer('G200', '2026-10-08T21:00:00+08:00'),
  ] };
  const items = providerItinerary(query, result, '2026-10-08', now);
  assert(items.length === 2 && items[0].title.includes('G200'), 'must skip stale and too-close offers, including cached results');
  const main = await collectMainTransport({ request, endpoints, plannedDate: '2026-10-08', days: 5, now, query: async () => result });
  assert(main.itineraryItems.length > 0 && main.itineraryItems.every(item => !/G3586|G100/.test(item.title)), 'collection must use the injected clock');
  assert(providerItinerary(query, { ...result, offers: result.offers.slice(0, 2) }, '2026-10-08', now).length === 0, 'no boardable services means no saved train');
  const connection = { ...offer('G300', '2026-10-08T16:43:00+08:00'), connection: { usableForPlanning: true },
    segments: [offer('G300', '2026-10-08T16:43:00+08:00'), offer('G301', '2026-10-08T22:00:00+08:00')] };
  assert(providerItinerary(query, { ...rail, offers: [connection, result.offers[2]] }, '2026-10-08', now)[0].title.includes('G200'), 'a future second segment cannot rescue a departed first segment');
});

Deno.test('flight departure filtering interprets unzoned provider timestamps in Asia/Shanghai', () => {
  const query = { ...mainTransportQueries(request, endpoints, '2026-10-08')[0], mode: 'flight' as const };
  const offer = (flightNumber: string, departure: string) => ({ itineraries: [{ segments: [{ from: 'NNG', to: 'CTU',
    marketingCarrier: 'CA', flightNumber, departure, arrival: '2026-10-08T23:30:00' }] }] });
  const items = providerItinerary(query, { available: true, status: 'results', offers: [
    offer('100', '2026-10-08T16:43:00'), offer('200', '2026-10-08T22:00:00'),
  ] }, '2026-10-08', Date.parse('2026-10-08T20:00:00+08:00'));
  assert(items.length === 2 && items[0].title.includes('CA200'), 'unzoned China departures must not be treated as UTC');
});

Deno.test('fixed hubs survive empty providers and canonicalize the complete six-day fixture', async () => {
  const trip = travelRequestSchema.parse({ origin: '南宁良庆区', returnDestination: '南宁良庆区', modes: ['rail', 'flight'] });
  const hubs = transportEndpointsSchema.parse({ endpoints: [
    { mode: 'rail', outboundOrigin: '南宁东', outboundDestination: '成都东', returnOrigin: '成都东', returnDestination: '南宁东', outboundOriginCity: '南宁', outboundDestinationCity: '成都', returnOriginCity: '成都', returnDestinationCity: '南宁' },
    { mode: 'flight', outboundOrigin: 'NNG', outboundDestination: 'TFU', returnOrigin: 'TFU', returnDestination: 'NNG',
      outboundOriginDisplayName: '南宁吴圩国际机场', outboundDestinationDisplayName: '成都天府国际机场',
      returnOriginDisplayName: '成都天府国际机场', returnDestinationDisplayName: '南宁吴圩国际机场' },
  ] });
  const main = await collectMainTransport({ now, request: trip, endpoints: hubs, plannedDate: '2026-10-09', days: 6,
    query: async query => query.mode === 'rail' ? { available: true, status: 'empty', offers: [] } : { available: false, status: 'provider_error' } });
  const model = [
    { day: 'Day 1', kind: 'custom' as const, title: '前往成都', startLocation: { name: '南宁良庆区', latitude: 22.7595, longitude: 108.4255 }, location: { name: '南宁良庆区', latitude: 22.7595, longitude: 108.4255 } },
    { day: 'Day 1', kind: 'custom' as const, title: '抵达成都', startLocation: { name: '南宁良庆区' }, location: { name: '成都', incomingMode: 'rail' as const } },
    { day: 'Day 2', kind: 'custom' as const, title: '成都至卡尔杂村', startLocation: { name: '成都' }, location: { name: '卡尔杂村' } },
    { day: 'Day 2', kind: 'stay' as const, title: '卡尔杂村休整', location: { name: '卡尔杂村通铺' } },
    { day: 'Day 5', kind: 'custom' as const, title: '返回成都', startLocation: { name: '卡尔杂村' }, location: { name: '成都' } },
    { day: 'Day 6', kind: 'custom' as const, title: 'D1723 成都东至南宁东', timeStart: '08:27', timeEnd: '15:30', startLocation: { name: '成都东' }, location: { name: '南宁东', incomingMode: 'rail' as const } },
    { day: 'Day 6', kind: 'custom' as const, title: '返回南宁良庆区', startLocation: { name: '南宁东' }, location: { name: '南宁良庆区' } },
  ].map(item => itineraryItem.parse(item));
  const final = presentItinerary(carryDailyStarts(mergeMainTransportItems(model, main, { totalDays: 6, originCity: '南宁' })), [], 6).items;
  const names = (day: string) => final.filter(item => item.day === day && item.location).map(item => item.location!.name)
    .filter((name, index, all) => index === 0 || name !== all[index - 1]);
  assert(JSON.stringify(names('Day 1')) === JSON.stringify(['南宁东', '成都东']));
  assert(names('Day 2')[0] === '成都东' && names('Day 2')[1] === '卡尔杂村' && !names('Day 2').includes('成都'));
  assert(!names('Day 5').includes('成都'), 'a model ride back to the city is not kept');
  assert(!final.some(item => item.day === 'Day 6' && item.location?.name === '南宁东'), 'no train home');
});

Deno.test('date-less queries still produce untimed hub skeletons', async () => {
  const main = await collectMainTransport({ request, endpoints, plannedDate: null, days: 4, query: async () => { throw new Error('must not query without a date'); } });
  const merged = mergeMainTransportItems([], main, 4);
  assert(merged.filter(item => item.day === 'Day 1').some(item => item.title.includes('→') && !item.title.includes('待查')));
  assert(!merged.some(item => item.day === 'Day 4'));
  assert(merged.every(item => !item.timeStart && !item.timeEnd));
});

Deno.test('provider rows remain singular while the local origin leg is retained', async () => {
  const main = await collectMainTransport({ now, request, endpoints, plannedDate: '2026-10-09', days: 5, query: async () => rail });
  const merged = mergeMainTransportItems([], main, 5);
  assert(merged.filter(item => item.title.includes('G123')).length === 2);
  assert(merged.filter(item => item.title === '前往杭州东').length === 1);
  assert(merged.every(item => item.day === 'Day 1'));
});

Deno.test('flight skeletons use Chinese airport display names and never IATA place names', async () => {
  const flightRequest = travelRequestSchema.parse({ origin: '南宁', returnDestination: '南宁', modes: ['flight'] });
  const flightEndpoints = transportEndpointsSchema.parse({ endpoints: [{ mode: 'flight', outboundOrigin: 'NNG', outboundDestination: 'TFU', returnOrigin: 'TFU', returnDestination: 'NNG',
    outboundOriginDisplayName: '南宁吴圩国际机场', outboundDestinationDisplayName: '成都天府国际机场', returnOriginDisplayName: '成都天府国际机场', returnDestinationDisplayName: '南宁吴圩国际机场' }] });
  const main = await collectMainTransport({ request: flightRequest, endpoints: flightEndpoints, plannedDate: null, days: 3, query: async () => ({}) });
  const rows = mergeMainTransportItems([], main, 3);
  assert(rows.some(item => item.location?.name === '南宁吴圩国际机场') && rows.some(item => item.location?.name === '成都天府国际机场'));
  assert(rows.every(item => item.location?.name !== 'NNG' && item.location?.name !== 'TFU'));
});

Deno.test('legacy main transport artifacts without hubs retain their model rows', () => {
  const legacy = mainTransportSchema.parse({ request, itineraryItems: [{ day: 'Day 1', title: '抵达成都', location: { name: '成都' } }] });
  assert(legacy.hubs.length === 0 && mergeMainTransportItems(legacy.itineraryItems, legacy).length === 1);
});

Deno.test('outbound provider rows precede untimed post-arrival rows on Day 1', async () => {
  const main = await collectMainTransport({ now, request, endpoints, plannedDate: '2026-10-09', days: 5, query: async () => rail });
  const postArrival = itineraryItem.parse({ day: 'Day 1', title: '成都东到卡尔杂村接驳', startLocation: { name: '成都东' }, location: { name: '卡尔杂村' } });
  const merged = mergeMainTransportItems([postArrival], main, 5);
  const day = merged.filter(item => item.day === 'Day 1');
  assert(day.findIndex(item => item.title.includes('G123')) < day.findIndex(item => item.title.includes('卡尔杂村')));
  assert(day.find(item => item.location?.name === '成都东' && item.location.incomingMode === 'rail'));
});

Deno.test('same-city structured metadata suppresses district home legs', () => {
  const localHubs = transportEndpointsSchema.parse({ endpoints: [{ mode: 'rail', outboundOrigin: '南宁东', outboundDestination: '成都东', returnOrigin: '成都东', returnDestination: '南宁东',
    outboundOriginCity: '南宁', outboundDestinationCity: '成都', returnOriginCity: '成都', returnDestinationCity: '南宁' }] });
  const main = mainTransportSchema.parse({ request: { origin: '南宁良庆区', returnDestination: '南宁良庆区', modes: ['rail'] }, hubs: localHubs.endpoints });
  const rows = mergeMainTransportItems([itineraryItem.parse({ day: 'Day 1', title: '前往成都', startLocation: { name: '南宁良庆区' }, location: { name: '南宁良庆区' } }),
    itineraryItem.parse({ day: 'Day 6', title: '返回南宁良庆区', startLocation: { name: '南宁东' }, location: { name: '南宁良庆区' } })], main, { totalDays: 6, originCity: '南宁' });
  assert(!rows.some(item => /南宁良庆区|前往南宁东|从南宁良庆区|返回南宁/.test(item.title) || item.location?.name === '南宁良庆区'));
  assert(rows.some(item => item.location?.name === '南宁东') && rows.some(item => item.location?.name === '成都东'));
  assert(rows.some(item => item.title === '返回南宁良庆区') === false, 'a model ride home is not kept');
});

Deno.test('different-city origin keeps the ground leg', () => {
  const localHubs = transportEndpointsSchema.parse({ endpoints: [{ mode: 'rail', outboundOrigin: '百色站', outboundDestination: '成都东', returnOrigin: '成都东', returnDestination: '百色站', outboundOriginCity: '百色', outboundDestinationCity: '成都', returnOriginCity: '成都', returnDestinationCity: '百色' }] });
  const main = mainTransportSchema.parse({ request: { origin: '广西凌云县', returnDestination: '广西凌云县', modes: ['rail'] }, hubs: localHubs.endpoints });
  const rows = mergeMainTransportItems([], main, { totalDays: 4, originCity: '凌云' });
  assert(rows.some(item => item.title === '前往百色站' && item.startLocation?.name === '广西凌云县'));
});

Deno.test('self-drive emits ground rows without station or airport rows', async () => {
  const driveRequest = travelRequestSchema.parse({ origin: '西安', returnDestination: '西安', modes: ['self_drive'] });
  const driveEndpoints = transportEndpointsSchema.parse({ endpoints: [{ mode: 'self_drive', outboundOrigin: '西安', outboundDestination: '鳌太起点', returnOrigin: '鳌太起点', returnDestination: '西安' }] });
  const main = await collectMainTransport({ request: driveRequest, endpoints: driveEndpoints, plannedDate: null, days: 3,
    query: async () => ({ available: true, status: 'results', distanceKm: 240, durationMinutes: 300 }) });
  const rows = mergeMainTransportItems([], main, 3);
  assert(rows.length > 0 && rows.every(item => !/车站|机场|高铁|航班/.test(item.title)) && rows.some(item => item.title.includes('高德估算')));
});

Deno.test('failed hub resolution falls back to transfer-city ground estimates', async () => {
  const main = await collectMainTransport({ request, endpoints: transportEndpointsSchema.parse({ endpoints: [] }), plannedDate: null, days: 4,
    fallbackDestination: '成都', query: async query => query.mode === 'self_drive'
      ? { available: true, status: 'results', distanceKm: 1200, durationMinutes: 900 } : {} });
  assert(main.itineraryItems.some(item => item.title.includes('交通方式待定') && item.title.includes('高德驾车估算')));
});

Deno.test('fallback ground estimates leave home before the plan town on Day 1', async () => {
  const main = await collectMainTransport({ request, endpoints: transportEndpointsSchema.parse({ endpoints: [] }), plannedDate: null, days: 4,
    fallbackDestination: '新乡', query: async () => ({ available: true, status: 'results', distanceKm: 90, durationMinutes: 80 }) });
  const model = [itineraryItem.parse({ day: 'Day 1', title: '新乡', location: { name: '新乡' } })];
  const rows = presentItinerary(carryDailyStarts(mergeMainTransportItems(model, main, 4)), [], 4).items;
  const day1 = rows.filter(item => item.day === 'Day 1').map(item => item.location?.name);
  assert(day1.at(-1) === '新乡' && day1.filter(name => name === '新乡').length === 1 && day1.length > 1, JSON.stringify(day1));
});

// Production passes only totalDays and the GPS place (mainTransportMergeOptions);
// the user's city must come from the persisted endpoint output, not the caller.
Deno.test('persisted endpoint user city suppresses home legs without caller-supplied cities', async () => {
  const localRequest = travelRequestSchema.parse({ origin: '南宁良庆区', returnDestination: '南宁良庆区', modes: ['rail'] });
  const localEndpoints = transportEndpointsSchema.parse({ endpoints: [{ mode: 'rail', outboundOrigin: '南宁东', outboundDestination: '成都东', returnOrigin: '成都东', returnDestination: '南宁东',
    outboundOriginCity: '南宁', outboundDestinationCity: '成都市', returnOriginCity: '成都', returnDestinationCity: '南宁', outboundUserCity: '南宁市', returnUserCity: '南宁市' }] });
  const main = await collectMainTransport({ now, request: localRequest, endpoints: localEndpoints, plannedDate: null, days: 6, query: async () => ({ available: false, status: 'not_configured' }) });
  const stored = mainTransportSchema.parse(JSON.parse(JSON.stringify(main)));
  const model = [
    itineraryItem.parse({ day: 'Day 1', title: '从南宁良庆区出发', location: { name: '南宁良庆区' } }),
    itineraryItem.parse({ day: 'Day 2', title: '成都东到卡尔杂村接驳', startLocation: { name: '成都东' }, location: { name: '卡尔杂村' } }),
    itineraryItem.parse({ day: 'Day 6', title: '返回南宁良庆区', startLocation: { name: '南宁东' }, location: { name: '南宁良庆区' } }),
  ];
  const rows = presentItinerary(carryDailyStarts(mergeMainTransportItems(model, stored, {
    totalDays: 6, originLocation: { name: '南宁良庆区', latitude: 22.75, longitude: 108.39, source: 'custom' } })), [], 6).items;
  const chain = (day: string) => rows.filter(item => item.day === day && item.location).map(item => item.location!.name);
  assert(!rows.some(item => item.location?.name === '南宁良庆区' || item.startLocation?.name === '南宁良庆区'), JSON.stringify(rows.map(item => [item.day, item.title])));
  assert(chain('Day 1')[0] === '南宁东' && chain('Day 1').includes('成都东'), JSON.stringify(chain('Day 1')));
  assert(!chain('Day 6').includes('南宁东'), JSON.stringify(chain('Day 6')));
});

Deno.test('a county origin keeps its ground leg even inside the hub prefecture', async () => {
  const countyEndpoints = transportEndpointsSchema.parse({ endpoints: [{ mode: 'rail', outboundOrigin: '百色', outboundDestination: '成都东', returnOrigin: '成都东', returnDestination: '百色',
    outboundOriginCity: '百色市', outboundDestinationCity: '成都', returnOriginCity: '成都', returnDestinationCity: '百色市', outboundUserCity: '凌云县', returnUserCity: '凌云县' }] });
  const countyRequest = travelRequestSchema.parse({ origin: '广西凌云县', returnDestination: '广西凌云县', modes: ['rail'] });
  const main = await collectMainTransport({ now, request: countyRequest, endpoints: countyEndpoints, plannedDate: null, days: 4, query: async () => ({ available: false, status: 'not_configured' }) });
  const rows = mergeMainTransportItems([], main, { totalDays: 4 });
  assert(rows.some(item => item.day === 'Day 1' && item.startLocation?.name === '广西凌云县' && item.location?.name === '百色'), JSON.stringify(rows.map(item => [item.day, item.title])));
});

Deno.test('undated hub skeleton leads Day 1 ahead of model transfers', async () => {
  const localRequest = travelRequestSchema.parse({ origin: '南宁良庆区', returnDestination: '南宁良庆区', modes: ['rail'] });
  const localEndpoints = transportEndpointsSchema.parse({ endpoints: [{ mode: 'rail', outboundOrigin: '南宁东', outboundDestination: '成都东', returnOrigin: '成都东', returnDestination: '南宁东',
    outboundOriginCity: '南宁市', outboundDestinationCity: '成都市', returnOriginCity: '成都市', returnDestinationCity: '南宁市', outboundUserCity: '南宁市', returnUserCity: '南宁市' }] });
  const main = await collectMainTransport({ now, request: localRequest, endpoints: localEndpoints, plannedDate: null, days: 6, query: async () => ({ available: false, status: 'date_required' }) });
  // The live T1 plan: the model puts the mountain transfer on Day 1 after its own rail row.
  const model = [
    itineraryItem.parse({ day: 'Day 1', title: '铁路前往成都', startLocation: { name: '南宁东' }, location: { name: '成都东', incomingMode: 'rail' } }),
    itineraryItem.parse({ day: 'Day 1', title: '成都接驳卡尔杂', startLocation: { name: '成都东' }, location: { name: '卡尔杂村', trackId: 'trk008', trackMeters: 0 } }),
    itineraryItem.parse({ day: 'Day 6', title: '卡尔杂村返回成都接驳', startLocation: { name: '卡尔杂村' }, location: { name: '成都东' } }),
  ];
  const rows = presentItinerary(carryDailyStarts(mergeMainTransportItems(model, mainTransportSchema.parse(JSON.parse(JSON.stringify(main))), { totalDays: 6 })), [], 6).items;
  const chain = (day: string) => rows.filter(item => item.day === day && item.location).map(item => item.location!.name);
  assert(JSON.stringify(chain('Day 1')) === JSON.stringify(['南宁东', '成都东', '卡尔杂村']), JSON.stringify(chain('Day 1')));
  assert(rows.some(item => item.day === 'Day 1' && item.title === '南宁东'), JSON.stringify(rows.filter(item => item.day === 'Day 1').map(item => item.title)));
  assert(!chain('Day 6').includes('南宁东'), JSON.stringify(chain('Day 6')));
});

// 南太行: the shared ride leaves 新乡站 at 06:45.
const meeting = { town: '新乡', meetingPoint: '新乡站', arriveBy: '06:45', accessStations: ['新乡', '新乡东'] };
const train = (trainNumber: string, from: string, to: string, date: string, depart: string, arrive: string, availability = '有') =>
  ({ trainNumber, from, to, departure: `${date}T${depart}:00+08:00`, arrival: `${date}T${arrive}:00+08:00`, seats: [{ name: '二等座', availability, pricePerAdult: 30 }] });
const timetable = (offers: ReturnType<typeof train>[]) => async (query: { origin: string; destination: string; departureDate: string | null; earliestHour: number | null }) => ({
  available: true, status: 'results', offers: offers.filter(offer => offer.from === query.origin && offer.to === query.destination
    && offer.departure.slice(0, 10) === query.departureDate && Number(offer.departure.slice(11, 13)) >= (query.earliestHour ?? 0)),
});
const homeRail = (origin: string) => transportEndpointsSchema.parse({ endpoints: [{ mode: 'rail', outboundOrigin: origin, outboundDestination: '新乡东', returnOrigin: '新乡东', returnDestination: origin }] });

Deno.test('an early train that makes the meeting time puts the walk on Day 1', async () => {
  const main = await collectOfficialTransport({ request: travelRequestSchema.parse({ origin: '郑州', returnDestination: '郑州', modes: ['rail'] }),
    endpoints: homeRail('郑州'), plannedDate: '2026-10-10', official: meeting, now, query: timetable([
      train('K2276', '郑州', '新乡', '2026-10-10', '05:30', '06:27'),
      train('T50', '郑州', '新乡', '2026-10-10', '06:34', '07:25'),
      train('G552', '郑州', '新乡东', '2026-10-10', '06:39', '06:59'),
      train('G1572', '新乡东', '郑州', '2026-10-11', '17:02', '17:25'),
    ]) });
  assert(main.official?.accessDay === false, `the walk starts on the arrival day, got ${JSON.stringify(main.official)}`);
  assert(main.official.basis.length === 1 && main.official.basis[0].includes('K2276'), `the basis names the train: ${main.official.basis.join(' / ')}`);
  const titles = main.itineraryItems.map(item => `${item.day} ${item.title}`);
  assert(titles.some(title => title.startsWith('Day 1 高铁/火车 K2276')) && !titles.some(title => title.includes('G1572')), titles.join(' | '));
  assert(main.queries.every(query => query.direction === 'outbound'), 'no train home is queried');
  assert(main.hubs[0].outboundDestination === '新乡', 'the hub follows the chosen train');
});

Deno.test('no train in time for the meeting means a town night first', async () => {
  const main = await collectOfficialTransport({ request: travelRequestSchema.parse({ origin: '北京', returnDestination: '北京', modes: ['rail'] }),
    endpoints: homeRail('北京西'), plannedDate: '2026-10-10', official: meeting, now, query: timetable([
      train('G511', '北京西', '新乡东', '2026-10-10', '06:19', '09:38'),
      train('G79', '北京西', '新乡东', '2026-10-10', '10:00', '12:30'),
    ]) });
  assert(main.official?.accessDay === true, JSON.stringify(main.official));
  assert(main.itineraryItems.some(item => item.day === 'Day 1' && item.title.includes('G79')), 'a daytime train on the travel day');
});

Deno.test('a sold-out meeting train adds the day there', async () => {
  const main = await collectOfficialTransport({ request: travelRequestSchema.parse({ origin: '郑州', returnDestination: '郑州', modes: ['rail'] }),
    endpoints: homeRail('郑州'), plannedDate: '2026-10-10', official: meeting, now, query: timetable([
      train('K2276', '郑州', '新乡', '2026-10-10', '05:30', '06:27', '无'),
      train('T50', '郑州', '新乡', '2026-10-10', '08:34', '09:25'),
    ]) });
  assert(main.official?.accessDay, JSON.stringify(main.official));
  assert(main.official.basis[0].includes('K2276') && main.official.basis[0].includes('无余票'), main.official.basis[0]);
  assert(main.itineraryItems.some(item => item.day === 'Day 1' && item.title.includes('T50')), 'a daytime train instead');
});

Deno.test('a train not on sale yet still makes the plan and is saved with the presale note', async () => {
  const main = await collectOfficialTransport({ request: travelRequestSchema.parse({ origin: '郑州', returnDestination: '郑州', modes: ['rail'] }),
    endpoints: homeRail('郑州'), plannedDate: '2026-10-10', official: meeting, now, query: timetable([
      train('K2276', '郑州', '新乡', '2026-10-10', '05:30', '06:27', '*'),
    ]) });
  assert(main.official?.accessDay === false, `presale is not sold out: ${JSON.stringify(main.official)}`);
  assert(!main.official.basis.some(value => value.includes('无余票')), main.official.basis.join(' / '));
  assert(main.itineraryItems.some(item => item.day === 'Day 1' && item.title.includes('K2276') && item.title.includes('未开售')),
    main.itineraryItems.map(item => item.title).join(' | '));
  assert(main.unresolved.some(value => value.includes('K2276 次车票尚未开售')), main.unresolved.join(' / '));
  assert(!main.unresolved.some(value => value.includes('尚无可保存')), main.unresolved.join(' / '));
});

Deno.test('a stored timetable plans the train as a reference and says when it was observed', async () => {
  const stored = timetable([train('K2276', '郑州', '新乡', '2026-10-10', '05:30', '06:27', REFERENCE_SEAT)]);
  const main = await collectOfficialTransport({ request: travelRequestSchema.parse({ origin: '郑州', returnDestination: '郑州', modes: ['rail'] }),
    endpoints: homeRail('郑州'), plannedDate: '2026-10-10', official: meeting, now,
    query: async query => ({ ...await stored(query), cacheMeta: { layer: 'timetable', observedDate: '2026-10-03' } }) });
  assert(main.official?.accessDay === false, JSON.stringify(main.official));
  assert(main.itineraryItems.some(item => item.title.includes('K2276') && item.title.includes('参考票价')), main.itineraryItems.map(item => item.title).join(' | '));
  assert(main.unresolved.some(value => value.includes('K2276 次按 10月3日查询的时刻表参考')), main.unresolved.join(' / '));
  assert(!main.unresolved.some(value => value.includes('尚未开售')), main.unresolved.join(' / '));
});

Deno.test('the travel-day retry asks a pair that has trains, not an empty station pair', async () => {
  // 郑州东 is high-speed only and 新乡 conventional only: that pair never has a train.
  const official = { ...meeting, accessStations: ['新乡', '新乡东'] };
  const asked: string[] = [];
  const main = await collectOfficialTransport({ request: travelRequestSchema.parse({ origin: '郑州', returnDestination: '郑州', modes: ['rail'] }),
    endpoints: transportEndpointsSchema.parse({ endpoints: [{ mode: 'rail', outboundOrigin: '郑州东', outboundDestination: '新乡',
      returnOrigin: '新乡', returnDestination: '郑州东' }] }),
    plannedDate: '2026-10-10', official, now, query: async value => {
      asked.push(`${value.origin}→${value.destination}@${value.earliestHour}`);
      // Like 12306's first page, the 04:00 query stops before the daytime trains.
      if (value.earliestHour === 4) return timetable([train('G552', '郑州东', '新乡东', '2026-10-10', '06:39', '06:59')])(value);
      return timetable([train('G374', '郑州东', '新乡东', '2026-10-10', '09:03', '09:22')])(value);
    } });
  assert(main.official?.accessDay === true, JSON.stringify(main.official));
  assert(asked.includes('郑州东→新乡东@9') && !asked.includes('郑州东→新乡@9'), asked.join(','));
  assert(main.itineraryItems.some(item => item.day === 'Day 1' && item.title.includes('G374')), main.itineraryItems.map(item => item.title).join(' | '));
});

Deno.test('a same-city station is queried only when the first one cannot make the meeting time', async () => {
  const twoStations = transportEndpointsSchema.parse({ endpoints: [{ mode: 'rail',
    outboundOrigin: '郑州东', outboundDestination: '新乡东', returnOrigin: '新乡东', returnDestination: '郑州东',
    railAlternatives: [{ direction: 'outbound', origin: '郑州', destination: '新乡东' }] }] });
  const asked: string[] = [];
  const record = (query: { origin: string; destination: string }) => { asked.push(`${query.origin}→${query.destination}`); };
  const main = await collectOfficialTransport({ request: travelRequestSchema.parse({ origin: '郑州', returnDestination: '郑州', modes: ['rail'] }),
    endpoints: twoStations, plannedDate: '2026-10-10', official: meeting, now, query: async value => {
      record(value);
      return timetable([
        train('G1234', '郑州东', '新乡东', '2026-10-10', '06:12', '06:31'),
        train('K2276', '郑州', '新乡', '2026-10-10', '05:30', '06:27'),
      ])(value);
    } });
  assert(main.official?.accessDay === false, JSON.stringify(main.official));
  assert(main.official.basis[0].includes('G1234'), main.official.basis[0]);
  assert(!asked.some(route => route.startsWith('郑州→')), `the alternative station is left unqueried: ${asked.join(',')}`);
});

Deno.test('the alternative station is probed when the first has nothing in time', async () => {
  const twoStations = transportEndpointsSchema.parse({ endpoints: [{ mode: 'rail',
    outboundOrigin: '郑州东', outboundDestination: '新乡东', returnOrigin: '新乡东', returnDestination: '郑州东',
    railAlternatives: [{ direction: 'outbound', origin: '郑州', destination: '新乡东' }] }] });
  const asked: string[] = [];
  const main = await collectOfficialTransport({ request: travelRequestSchema.parse({ origin: '郑州', returnDestination: '郑州', modes: ['rail'] }),
    endpoints: twoStations, plannedDate: '2026-10-10', official: meeting, now, query: async value => {
      asked.push(`${value.origin}→${value.destination}`);
      return timetable([
        train('G5678', '郑州东', '新乡东', '2026-10-10', '09:12', '09:31'),
        train('K2276', '郑州', '新乡', '2026-10-10', '05:30', '06:27'),
      ])(value);
    } });
  assert(asked.some(route => route.startsWith('郑州→')), `the second station is paid for only when needed: ${asked.join(',')}`);
  assert(main.official?.accessDay === false, JSON.stringify(main.official));
  assert(main.official.basis[0].includes('K2276'), main.official.basis[0]);
  assert(main.hubs[0].outboundOrigin === '郑州', 'the saved hub follows the chosen train');
});

Deno.test('a date outside the sale window is read from the same weekday inside it', async () => {
  assert(timetableDate('2026-11-07', now) === '2026-10-17', 'a Saturday maps to a Saturday within 15 days');
  assert(timetableDate('2026-10-12', now) === '2026-10-12', 'a sold date is kept');
  const asked: string[] = [];
  const query = timetable([train('K2276', '郑州', '新乡', '2026-10-17', '05:30', '06:27')]);
  const main = await collectOfficialTransport({ request: travelRequestSchema.parse({ origin: '郑州', returnDestination: '郑州', modes: ['rail'] }),
    endpoints: homeRail('郑州'), plannedDate: '2026-11-07', official: meeting, now, query: async value => { asked.push(value.departureDate!); return query(value); } });
  assert(asked.every(date => date === '2026-10-17'), asked.join(','));
  assert(main.official?.accessDay === false && main.official.basis[0].startsWith('按 10月17日 的时刻表推算'), JSON.stringify(main.official));
  assert(main.itineraryItems.length === 0, 'no ticket rows on a date the trains were not read for');
  assert(main.unresolved.some(value => value.includes('不在 12306 可售期内')), 'the approximation is disclosed');
  assert(!main.unresolved.some(value => value.includes('尚无可保存')), 'a projected timetable is not reported as a missing ticket');
});

Deno.test('without rail the official plan keeps the day there', async () => {
  const main = await collectOfficialTransport({ request: travelRequestSchema.parse({ origin: '郑州', returnDestination: '郑州', modes: ['self_drive'] }),
    endpoints: transportEndpointsSchema.parse({ endpoints: [] }), plannedDate: '2026-10-10', official: meeting, now,
    query: async () => ({ available: true, status: 'results', distanceKm: 90, durationMinutes: 80 }) });
  assert(main.official?.accessDay, JSON.stringify(main.official));
  assert(main.itineraryItems.every(item => item.day === 'Day 1'), 'only the way there');
});

Deno.test('a road leg stays with the plan while a hub arrival belongs to the chain', async () => {
  const main = await collectMainTransport({ now, request, endpoints, plannedDate: '2026-10-09', days: 5, query: async () => rail });
  const road = itineraryItem.parse({ day: 'Day 1', kind: 'custom', title: '拼车从成都东到卡尔杂村（约 3 小时）',
    location: { name: '卡尔杂村', incomingMode: 'road' } });
  const modelHubArrival = itineraryItem.parse({ day: 'Day 1', kind: 'custom', title: '抵达成都东 · G999',
    location: { name: '成都东', incomingMode: 'rail' } });
  const merged = mergeMainTransportItems([road, modelHubArrival], main, 5);
  const titles = merged.map(item => `${item.day} ${item.title}`).join(' | ');
  assert(merged.some(item => item.title === road.title && item.location?.incomingMode === 'road'),
    `the hub chain replaces a hub arrival, not a road leg: ${titles}`);
  assert(merged.filter(item => item.location?.incomingMode === 'road').length === 1, `no hub row is relabelled as road: ${titles}`);
  assert(!merged.some(item => item.title.includes('G999')), `the model rail arrival gives way to the queried service: ${titles}`);
  assert(merged.filter(item => item.location?.incomingMode === 'rail').length === 1, `one rail arrival row: ${titles}`);
});
