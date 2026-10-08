import { collectMainTransport, mergeMainTransportItems, mainTransportQueries, providerItinerary, transportEndpointsSchema } from './main-transport.ts';
import { resolveTravelRequest, travelIntake, travelRequestSchema, travelContextFromRequest } from './travel-request.ts';
import { constrainTaskDecision, taskDecisionSchema, type TaskState } from './task.ts';

function assert(value: unknown, message = 'Assertion failed'): asserts value { if (!value) throw new Error(message); }
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
  assert(!travelIntake(empty, { status: 'permission_denied' })?.quickReplies.length);
  assert(!travelIntake(empty, undefined, true)?.quickReplies.length);
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

Deno.test('main transport executes both directions and builds real service rows from provider receipts', async () => {
  const calls: string[] = [];
  const main = await collectMainTransport({ request, endpoints, plannedDate: '2026-10-09', days: 5, query: async query => {
    calls.push(`${query.direction}:${query.departureDate}`);
    return { ...rail, offers: rail.offers.map(offer => query.direction === 'outbound' ? offer : { ...offer, from: '成都东', to: '杭州东',
      departure: '2026-10-13T08:00:00+08:00', arrival: '2026-10-13T18:30:00+08:00' }) };
  } });
  assert(calls.length === 2 && calls.includes('return:2026-10-13'));
  assert(main.itineraryItems[0].day === 'Day 1' && main.itineraryItems[0].timeStart === '08:00' && main.itineraryItems[0].title.includes('G123'));
  assert(main.itineraryItems[2].day === 'Day 5');
});

Deno.test('unknown dates and unavailable providers never produce invented train/flight rows', async () => {
  let calls = 0;
  const undated = await collectMainTransport({ request, endpoints, plannedDate: null, days: 5, query: async () => { calls++; return rail; } });
  assert(calls === 0 && undated.itineraryItems.length === 0 && undated.unresolved.some(value => value.includes('date_required')));
  const failed = await collectMainTransport({ request, endpoints, plannedDate: '2026-10-09', days: 5, query: async () => ({ available: false, status: 'not_on_sale' }) });
  assert(failed.itineraryItems.length === 0 && failed.unresolved.some(value => value.includes('not_on_sale')));
  const sold = providerItinerary(mainTransportQueries(request, endpoints, '2026-10-09', 5)[0], { ...rail, offers: rail.offers.map(value => ({ ...value, seats: [{ availability: '无' }] })) }, '2026-10-09');
  assert(sold.length === 0);
});

Deno.test('unsafe train connections are never chosen; overnight arrival remains explicit', () => {
  const query = mainTransportQueries(request, endpoints, '2026-10-09', 5)[0];
  assert(providerItinerary(query, { ...rail, offers: [{ ...rail.offers[0], connection: { usableForPlanning: false } }] }, '2026-10-09').length === 0);
  const overnight = providerItinerary(query, { ...rail, offers: [{ ...rail.offers[0], arrival: '2026-10-10T06:30:00+08:00' }] }, '2026-10-09');
  assert(overnight[0].title.includes('次日2026-10-10') && overnight[0].timeEnd === '06:30');
});

Deno.test('driving uses actual AMap distance/duration and invents no departure time', () => {
  const query = { direction: 'outbound' as const, mode: 'self_drive' as const, earliestHour: null, origin: '成都', destination: '党岭村', departureDate: '2026-10-09' };
  const items = providerItinerary(query, { available: true, status: 'results', distanceKm: 320, durationMinutes: 420 }, '2026-10-09');
  assert(items.length === 2 && items[1].title.includes('320km') && !items[0].timeStart);
});

Deno.test('flight rows retain provider flight numbers, airport codes and local timestamps', () => {
  const query = { direction: 'outbound' as const, mode: 'flight' as const, earliestHour: null, origin: 'NNG', destination: 'CTU', departureDate: '2026-10-09' };
  const items = providerItinerary(query, { available: true, status: 'results', offers: [{ itineraries: [{ segments: [{
    from: 'NNG', to: 'CTU', departure: '2026-10-09T09:30:00', arrival: '2026-10-09T11:30:00', marketingCarrier: 'CA', flightNumber: '1234',
  }] }] }] }, '2026-10-09');
  assert(items.length === 2 && items[0].title.includes('CA1234') && items[0].title.includes('NNG→CTU'));
  assert(items[0].timeStart === '09:30' && items[0].timeEnd === '11:30');
  assert(providerItinerary(query, { available: false, status: 'not_configured' }, '2026-10-09').length === 0);
});

Deno.test('model duplicate trains and invented main-service rows are replaced while local transfers survive', async () => {
  const main = await collectMainTransport({ request, endpoints, plannedDate: '2026-10-09', days: 5, query: async () => rail });
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

Deno.test('rail queries use waking-hour defaults and per-person price uses an available inexpensive seat', () => {
  const queries = mainTransportQueries(request, endpoints, '2026-10-09', 5);
  assert(queries[0].earliestHour === 6 && queries[1].earliestHour === 8);
  assert(mainTransportQueries(request, endpoints, '2026-10-09', 1)[1].earliestHour === 18);
  const items = providerItinerary(queries[0], { ...rail, offers: [{ ...rail.offers[0], seats: [
    { name: '商务座', availability: '有', pricePerAdult: 900 }, { name: '二等座', availability: '有', pricePerAdult: 300 },
  ] }] }, '2026-10-09');
  assert(items[0].title.includes('二等座¥300/人') && !items[0].title.includes('900'));
});

Deno.test('empty exact-station rail results check one explicit alternative and retain both queries', async () => {
  const hubs = transportEndpointsSchema.parse({ endpoints: [{ mode: 'rail', outboundOrigin: '南宁东', outboundDestination: '成都',
    returnOrigin: '成都东', returnDestination: '南宁东',
    railAlternatives: [{ direction: 'outbound', origin: '南宁东', destination: '成都东' }] }] });
  const calls: string[] = [];
  const main = await collectMainTransport({ request, endpoints: hubs, plannedDate: '2026-10-09', days: 5, query: async q => {
    calls.push(`${q.origin}→${q.destination}`);
    return q.destination === '成都' ? { available: true, status: 'empty', offers: [] } : rail;
  } });
  assert(calls.includes('南宁东→成都') && calls.includes('南宁东→成都东'));
  assert(main.queries.length === 3, 'initial empty query and alternate result both remain inspectable');
  assert(main.unresolved.some(text => text.includes('不同车站')));
});

Deno.test('unavailable rail provider never triggers alternate station retries', async () => {
  const hubs = transportEndpointsSchema.parse({ endpoints: [{ ...endpoints.endpoints[0],
    railAlternatives: [{ direction: 'outbound', origin: '杭州', destination: '成都东' }] }] });
  let calls = 0;
  await collectMainTransport({ request, endpoints: hubs, plannedDate: '2026-10-09', days: 5,
    query: async () => { calls++; return { available: false, status: 'provider_error' }; } });
  assert(calls === 2, 'one outbound and one return call, without retries');
});

Deno.test('undecided total days can query a clearly labelled proposed return date', async () => {
  const hubs = transportEndpointsSchema.parse({ ...endpoints, suggestedDays: 6,
    durationBasis: '徒步 2 天、城市往返 2 天、进出山接驳各 1 天，公路耗时仍为估算' });
  const dates: Array<string | null> = [];
  const main = await collectMainTransport({ request, endpoints: hubs, plannedDate: '2026-10-09', days: null,
    query: async q => { dates.push(q.departureDate); return { available: true, status: 'empty', offers: [] }; } });
  assert(dates.includes('2026-10-14'), 'return date should follow candidate TOTAL duration');
  assert(main.suggestedDays === 6 && main.unresolved.some(text => text.includes('不是用户已指定')));
  const fixed = await collectMainTransport({ request, endpoints: hubs, plannedDate: '2026-10-09', days: 4,
    query: async q => ({ available: true, status: 'empty', offers: [], date: q.departureDate }) });
  assert(fixed.queries[1].departureDate === '2026-10-12' && fixed.suggestedDays == null, 'explicit total days override estimated duration');
});

Deno.test('untimed hike/lodging order survives merging and transfer mentioning a train is retained', async () => {
  const main = await collectMainTransport({ request, endpoints, plannedDate: '2026-10-09', days: 5, query: async query => ({ ...rail,
    offers: rail.offers.map(offer => query.direction === 'outbound' ? offer : { ...offer, from: '成都东', to: '杭州东',
      departure: '2026-10-13T08:00:00+08:00', arrival: '2026-10-13T18:30:00+08:00' }) }) });
  const template = main.itineraryItems[0];
  const rows = mergeMainTransportItems([
    { ...template, day: 'Day 2', kind: 'activity', routeId: 'r', title: '徒步线路', timeStart: null, timeEnd: null },
    { ...template, day: 'Day 2', kind: 'stay', title: '营地过夜', timeStart: null, timeEnd: null },
    { ...template, day: 'Day 5', title: '卡尔杂→成都东 接驳赶上G123', timeStart: null, timeEnd: null },
    { ...template, day: 'Day 5', title: '杭州东返回家中', startLocation: { ...template.location!, name: '杭州东' }, timeStart: null, timeEnd: null },
  ], main);
  const hike = rows.filter(item => item.day === 'Day 2');
  assert(hike[0].kind === 'activity' && hike[1].kind === 'stay');
  const returned = rows.filter(item => item.day === 'Day 5');
  assert(returned[0].title.includes('接驳') && returned[1].title.includes('12306') && returned.at(-1)!.title.includes('家中'));
});
