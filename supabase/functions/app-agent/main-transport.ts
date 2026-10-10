import { z } from 'npm:zod@4.1.12';
import { itineraryItem } from './tools.ts';
import { travelRequestSchema, travelModes, type TravelRequest } from './travel-request.ts';

export const transportEndpointsSchema = z.object({
  endpoints: z.array(z.object({
    mode: z.enum(travelModes),
    outboundOrigin: z.string().min(1).max(200),
    outboundDestination: z.string().min(1).max(200),
    returnOrigin: z.string().min(1).max(200),
    returnDestination: z.string().min(1).max(200),
    railAlternatives: z.array(z.object({
      direction: z.enum(['outbound', 'return']),
      origin: z.string().min(1).max(200), destination: z.string().min(1).max(200),
    })).max(2).default([]).describe('每个方向最多一个同城备选车站组合；只在主组合为空时查询，用户明确指定车站时不得替换'),
  })).max(3),
  unresolved: z.array(z.string().max(300)).max(12).default([]),
  suggestedDays: z.number().int().min(1).max(30).nullable().default(null)
    .describe('用户总天数待定时，用路线资料和往返交通/接驳估算的候选全程天数，仅供查询；不是用户已指定天数'),
  durationBasis: z.string().max(800).default('').describe('候选全程天数的徒步、往返交通、山路接驳和缓冲分配依据；不能只填 GPX 徒步天数'),
});

const querySchema = z.object({
  direction: z.enum(['outbound', 'return']), mode: z.enum(travelModes),
  origin: z.string(), destination: z.string(), departureDate: z.string().nullable(),
  earliestHour: z.number().int().min(0).max(23).nullable().default(null),
  stationAlternative: z.object({ origin: z.string(), destination: z.string() }).nullable().default(null),
});
export type MainTransportQuery = Omit<z.infer<typeof querySchema>, 'stationAlternative'> & { stationAlternative?: z.infer<typeof querySchema>['stationAlternative'] };
export const mainTransportSchema = z.object({
  request: travelRequestSchema,
  queries: z.array(querySchema.extend({ result: z.unknown() })).max(8).default([]),
  itineraryItems: z.array(itineraryItem).max(40).default([]),
  unresolved: z.array(z.string().max(300)).max(20).default([]),
  suggestedDays: z.number().int().min(1).max(30).nullable().default(null),
  durationBasis: z.string().max(800).default(''),
});
export type MainTransport = z.infer<typeof mainTransportSchema>;

export function travelDate(firstDate: string, offset: number) {
  const date = new Date(`${firstDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

export function mainTransportQueries(request: TravelRequest, endpoints: z.infer<typeof transportEndpointsSchema>, plannedDate: string | null, days: number | null) {
  const queries: MainTransportQuery[] = [];
  for (const mode of request.modes) {
    const hubs = endpoints.endpoints.find(value => value.mode === mode);
    if (!hubs) continue;
    queries.push({ direction: 'outbound', mode, origin: hubs.outboundOrigin, destination: hubs.outboundDestination, departureDate: plannedDate,
      earliestHour: mode === 'rail' ? 6 : null,
      stationAlternative: mode === 'rail' ? hubs.railAlternatives.find(value => value.direction === 'outbound') ?? null : null });
    queries.push({ direction: 'return', mode, origin: hubs.returnOrigin, destination: hubs.returnDestination,
      departureDate: plannedDate && days ? travelDate(plannedDate, days - 1) : null,
      earliestHour: mode === 'rail' ? days === 1 ? 18 : 8 : null,
      stationAlternative: mode === 'rail' ? hubs.railAlternatives.find(value => value.direction === 'return') ?? null : null });
  }
  return queries;
}

function record(value: unknown): Record<string, any> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : {};
}

function departureTime(value: unknown) {
  const text = String(value || '');
  return Date.parse(/[zZ]$|[+-]\d{2}:?\d{2}$/.test(text) ? text : `${text}+08:00`);
}

function availableSeats(seats: any[]) {
  return seats.filter(seat => seat.availability === '有' || /^[1-9]\d*$/.test(String(seat.availability)))
    .sort((a, b) => (typeof a.pricePerAdult === 'number' ? a.pricePerAdult : Infinity) - (typeof b.pricePerAdult === 'number' ? b.pricePerAdult : Infinity));
}

/** Remove model-generated main-service rows, including different wording or
 * guessed fares for the same train. Retain station/airport ground transfers. */
export function mergeMainTransportItems(items: MainTransport['itineraryItems'], main: MainTransport) {
  const services = main.queries.flatMap(entry => {
    const offers = record(entry.result).offers;
    return Array.isArray(offers) ? offers.flatMap((offer: any) => entry.mode === 'rail'
      ? (offer.segments || [offer]).map((segment: any) => segment.trainNumber)
      : entry.mode === 'flight' ? (offer.itineraries || []).flatMap((itinerary: any) => itinerary.segments.map((segment: any) => `${segment.marketingCarrier}${segment.flightNumber}`)) : []) : [];
  }).filter((service): service is string => typeof service === 'string' && service.length > 0);
  const local = items.filter(item => {
    if (item.kind === 'stay' || (item.kind === 'activity' && item.routeId)) return true;
    if (item.location?.incomingMode) return false;
    // Models sometimes restate a queried departure using a generic title.
    // Keep the provider row even when the copy contains no service number.
    // Match the full interval and place, so real airport transfers survive.
    if (item.timeStart && item.timeEnd && item.location?.name
      && main.itineraryItems.some(service => service.day === item.day
        && service.timeStart === item.timeStart && service.timeEnd === item.timeEnd
        && service.location?.name === item.location?.name)) return false;
    if (/^(?:抵达|到达)/.test(item.title) && item.timeStart && item.timeEnd
      && main.itineraryItems.some((service, index) => service.day === item.day
        && service.timeStart === item.timeStart && service.timeEnd === item.timeEnd
        && service.location?.name === item.startLocation?.name
        && main.itineraryItems[index + 1]?.location?.name === item.location?.name)) return false;
    if (/接驳|出租|网约车|公交|地铁|步行|拼车|班车|\btransfer\b|\btaxi\b/i.test(item.title)) return true;
    if (services.some(service => item.title.includes(service))) return false;
    return !(/高铁|动车|火车|航班|飞机|自驾|\btrain\b|\bflight\b|\bself.drive\b/i.test(item.title));
  });
  // Untimed local rows retain the model's sequence. Treating null as midnight
  // put lodging/exit transfers before the hike or train that reaches them.
  const days = [...new Set([...local, ...main.itineraryItems].map(item => item.day))]
    .sort((a, b) => Number(a.replace(/^Day\s*/i, '')) - Number(b.replace(/^Day\s*/i, '')));
  const placeKey = (name?: string) => (name || '').replace(/(?:高铁站|火车站|站)$/, '').replace(/\s/g, '');
  const returnDays = new Set(main.queries.filter(query => query.direction === 'return' && query.departureDate)
    .map(query => main.itineraryItems.find(item => item.location?.name === query.origin && item.title.includes('查询'))?.day).filter(Boolean));
  return days.flatMap(day => {
    const rows = local.filter(item => item.day === day);
    const serviceRows = main.itineraryItems.filter(item => item.day === day);
    if (!serviceRows.length) return rows;
    const depart = serviceRows[0];
    const arrive = serviceRows.at(-1)!;
    const before: typeof rows = [], after: typeof rows = [];
    for (const item of rows) {
      if (item.timeStart && depart.timeStart) {
        (item.timeStart < depart.timeStart ? before : after).push(item);
      } else if (placeKey(item.startLocation?.name) === placeKey(arrive.location?.name)
        || (item.title.includes(arrive.location?.name || '__unknown__') && /返回|回家/.test(item.title))) {
        after.push(item);
      } else if (returnDays.has(day) || placeKey(item.location?.name) === placeKey(depart.location?.name)) {
        before.push(item);
      } else after.push(item);
    }
    return [...before, ...serviceRows, ...after];
  });
}

/** Every concrete service/time below comes from a provider response, not a model. */
export function providerItinerary(query: MainTransportQuery, result: unknown, firstDate: string | null, now = Date.now()): MainTransport['itineraryItems'] {
  const data = record(result);
  if (!data.available || data.status !== 'results') return [];
  if (query.mode === 'self_drive') {
    if (!(data.distanceKm > 0 && data.durationMinutes > 0)) return [];
    const day = query.departureDate && firstDate ? 1 + Math.round((Date.parse(query.departureDate) - Date.parse(firstDate)) / 86400000) : query.direction === 'outbound' ? 1 : null;
    if (!day || day < 1) return [];
    return [itineraryItem.parse({ day: `Day ${day}`, kind: 'custom', title: `从${query.origin}出发（自驾）`.slice(0, 120), location: { name: query.origin, source: 'custom' } }), itineraryItem.parse({ day: `Day ${day}`, kind: 'custom',
      title: `自驾 ${query.origin}→${query.destination} · 高德估算 ${data.distanceKm}km / ${data.durationMinutes}分钟`.slice(0, 120),
      location: { name: query.destination, source: 'custom' } })];
  }
  if (!query.departureDate || !firstDate || !Array.isArray(data.offers)) return [];
  const offer = data.offers.find((offer: any) => {
    const segments = query.mode === 'rail' ? offer.segments || [offer] : offer.itineraries?.[0]?.segments;
    if (!Array.isArray(segments) || !segments.length
      || !(departureTime(segments[0].departure) >= now + 60 * 60000)) return false;
    return query.mode === 'rail'
      ? (!offer.connection || offer.connection.usableForPlanning === true)
        && segments.every((segment: any) => Array.isArray(segment.seats) && availableSeats(segment.seats).length > 0)
      : true;
  });
  if (!offer) return [];
  const segments = query.mode === 'rail' ? offer.segments || [offer] : offer.itineraries[0].segments;
  return segments.flatMap((segment: any) => {
    const depart = String(segment.departure || ''), arrive = String(segment.arrival || '');
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(depart) || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(arrive)) return [];
    const day = 1 + Math.round((Date.parse(`${depart.slice(0, 10)}T00:00:00Z`) - Date.parse(firstDate)) / 86400000);
    if (day < 1 || day > 30) return [];
    const from = segment.from, to = segment.to;
    if (!from || !to) return [];
    const service = query.mode === 'rail' ? segment.trainNumber : `${segment.marketingCarrier || ''}${segment.flightNumber || ''}`;
    if (!service) return [];
    const overnight = arrive.slice(0, 10) !== depart.slice(0, 10);
    const arrivalDay = 1 + Math.round((Date.parse(`${arrive.slice(0, 10)}T00:00:00Z`) - Date.parse(firstDate)) / 86400000);
    if (arrivalDay > 30 || Date.parse(arrive) <= Date.parse(depart)) return [];
    const seat = query.mode === 'rail' ? availableSeats(segment.seats || [])[0] : null;
    const price = seat && typeof seat.pricePerAdult === 'number' ? ` · ${seat.name || ''}¥${seat.pricePerAdult}/人`
      : query.mode === 'flight' && segment === segments[0] && typeof offer.pricePerAdult === 'number'
        ? ` · ${segments.length > 1 ? '全程' : ''}¥${offer.pricePerAdult}/人（查询价）` : '';
    const provider = query.mode === 'rail' ? '12306' : data.provider === 'flyai' ? '飞猪FlyAI' : 'Amadeus';
    return [itineraryItem.parse({ day: `Day ${day}`, kind: 'custom',
      title: `${query.mode === 'rail' ? '高铁/火车' : '航班'} ${service} ${from}→${to}${overnight ? ` · 次日${arrive.slice(0, 10)} ${arrive.slice(11, 16)}到达` : ''}${price} · ${provider}查询`.slice(0, 120),
      timeStart: depart.slice(11, 16), timeEnd: !overnight || (arrivalDay - day === 1 && arrive.slice(11, 16) < depart.slice(11, 16)) ? arrive.slice(11, 16) : null,
      location: { name: String(from).slice(0, 160), source: 'custom' } }),
      itineraryItem.parse({ day: `Day ${arrivalDay}`, kind: 'custom',
        title: `抵达${to} · ${service}`.slice(0, 120), timeStart: arrive.slice(11, 16),
        location: { name: String(to).slice(0, 160), source: 'custom', incomingMode: query.mode } })];
  });
}

export async function collectMainTransport(args: {
  request: TravelRequest; endpoints: z.infer<typeof transportEndpointsSchema>; plannedDate: string | null; days: number | null;
  query: (query: MainTransportQuery) => Promise<unknown>;
  now?: number;
}): Promise<MainTransport> {
  const suggestedDays = args.days == null && args.endpoints.durationBasis.trim() ? args.endpoints.suggestedDays : null;
  const queries = mainTransportQueries(args.request, args.endpoints, args.plannedDate, args.days ?? suggestedDays);
  const unresolved = [...args.endpoints.unresolved];
  if (suggestedDays != null) unresolved.push(`总天数待定，暂按候选全程 ${suggestedDays} 天查询返程：${args.endpoints.durationBasis}。这是估算方案，不是用户已指定的返程日期。`.slice(0, 300));
  for (const mode of args.request.modes) {
    if (!queries.some(query => query.mode === mode)) unresolved.push(`${mode} 出发/到达枢纽未能可靠确定，尚未查询。`);
  }
  const results = (await Promise.all(queries.map(async query => {
    if (query.mode !== 'self_drive' && !query.departureDate) return { ...query, result: { available: false, status: 'date_required' } };
    try {
      const result = await args.query(query);
      const alternative = query.stationAlternative;
      if (query.mode === 'rail' && record(result).status === 'empty' && alternative
        && (alternative.origin !== query.origin || alternative.destination !== query.destination)) {
        const next = { ...query, ...alternative, stationAlternative: null };
        let nextResult: unknown;
        try { nextResult = await args.query(next); }
        catch { nextResult = { available: false, status: 'provider_error' }; }
        unresolved.push(`${query.origin}→${query.destination} 查询为空，另查同城备选 ${next.origin}→${next.destination}；两次查询对应不同车站。`);
        return [{ ...query, result }, { ...next, result: nextResult }];
      }
      return { ...query, result };
    }
    catch { return { ...query, result: { available: false, status: 'provider_error' } }; }
  }))).flat();
  const itineraryItems: MainTransport['itineraryItems'] = [];
  // Compare alternatives in the artifact; save only one mode per direction.
  for (const direction of ['outbound', 'return'] as const) {
    let selected = false;
    for (const entry of results.filter(query => query.direction === direction)) {
      const data = record(entry.result);
      const items = providerItinerary(entry, entry.result, args.plannedDate, args.now);
      if (!selected && items.length) { itineraryItems.push(...items); selected = true; }
      if (data.status !== 'results') unresolved.push(`${direction === 'outbound' ? '去程' : '返程'} ${entry.mode} 查询：${data.status || 'provider_error'}；不能据此推断无班次或已售罄。`);
    }
    if (!selected) unresolved.push(`${direction === 'outbound' ? '去程' : '返程'}大交通尚无可保存的实际班次或道路方案。`);
  }
  if (args.request.adults === 1) unresolved.push('票价按 1 名成人查询，不代表已确认同行人数或全团总价。');
  if (results.some(entry => record(entry.result).provider === 'flyai')) unresolved.push('飞猪航班票价为单名成人查询价，尚未核对全团余票、税费及行李规则；不能乘人数当作已验证总价。');
  if (results.some(entry => record(entry.result).status === 'results')) unresolved.push('班次、余票与道路耗时为查询快照或估算，未预订；进出站、进山接驳和自驾取车仍须单独核对。');
  return mainTransportSchema.parse({ request: args.request, queries: results, itineraryItems, unresolved: unresolved.slice(0, 20),
    suggestedDays, durationBasis: suggestedDays != null ? args.endpoints.durationBasis : '' });
}
