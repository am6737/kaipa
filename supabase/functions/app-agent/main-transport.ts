import { z } from 'npm:zod@4.1.12';
import { itineraryItem } from './tools.ts';
import { travelRequestSchema, travelModes, type TravelRequest } from './travel-request.ts';
import { isHubIncomingMode, type IncomingMode } from './incoming-mode.ts';
import { REFERENCE_SEAT } from './rail-timetable.ts';

const transportEndpointCanonicalSchema = z.object({
    mode: z.enum(travelModes),
    outboundOrigin: z.string().min(1).max(200),
    outboundDestination: z.string().min(1).max(200),
    returnOrigin: z.string().min(1).max(200),
    returnDestination: z.string().min(1).max(200),
    // Flight queries use IATA codes, while itinerary skeletons need readable
    // Chinese place names. These labels never flow into provider queries.
    outboundOriginDisplayName: z.string().min(1).max(200).nullable().default(null),
    outboundDestinationDisplayName: z.string().min(1).max(200).nullable().default(null),
    returnOriginDisplayName: z.string().min(1).max(200).nullable().default(null),
    returnDestinationDisplayName: z.string().min(1).max(200).nullable().default(null),
    outboundOriginCity: z.string().min(1).max(120).nullable().default(null),
    outboundDestinationCity: z.string().min(1).max(120).nullable().default(null),
    returnOriginCity: z.string().min(1).max(120).nullable().default(null),
    returnDestinationCity: z.string().min(1).max(120).nullable().default(null),
    // The city the user's own departure/return place belongs to. An urban
    // district counts as its city (南宁良庆区 → 南宁市), while a county or
    // county-level city counts as itself (凌云县 stays 凌云县, not 百色市).
    // Compared with the hub cities to decide whether a home→hub leg is needed.
    outboundUserCity: z.string().min(1).max(120).nullable().default(null).describe('用户出发地所在城市：市辖区填所属地级市或直辖市（南宁良庆区填南宁市），县或县级市填其本身（凌云县填凌云县）'),
    returnUserCity: z.string().min(1).max(120).nullable().default(null).describe('用户返回地所在城市，规则同 outboundUserCity'),
    railAlternatives: z.array(z.object({
      direction: z.enum(['outbound', 'return']),
      origin: z.string().min(1).max(200), destination: z.string().min(1).max(200),
    })).max(2).default([]).describe('每个方向最多一个同城备选车站组合；只在主组合为空时查询，用户明确指定车站时不得替换'),
  });
/** Parse the old *Name spelling, but persist one canonical display field. */
export const transportEndpointSchema = z.preprocess(value => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  const output = { ...(value as Record<string, unknown>) };
  for (const direction of ['outbound', 'return'] as const) {
    for (const side of ['Origin', 'Destination'] as const) {
      const canonical = `${direction}${side}DisplayName`;
      const legacy = `${direction}${side}Name`;
      if (output[canonical] == null && output[legacy] != null) output[canonical] = output[legacy];
      delete output[legacy];
    }
  }
  return output;
}, transportEndpointCanonicalSchema);
export const transportEndpointsSchema = z.object({
  endpoints: z.array(transportEndpointSchema).max(3),
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
  // Resolved endpoints are retained even when a date is missing or providers
  // return no offers, so the deterministic hub chain can still be saved.
  hubs: z.array(transportEndpointSchema).max(3).default([]),
  queries: z.array(querySchema.extend({ result: z.unknown() })).max(12).default([]),
  itineraryItems: z.array(itineraryItem).max(40).default([]),
  unresolved: z.array(z.string().max(300)).max(20).default([]),
  suggestedDays: z.number().int().min(1).max(30).nullable().default(null),
  durationBasis: z.string().max(800).default(''),
  // Set when an official plan's meeting time was checked against the
  // timetable: whether the trip needs a day to reach the meeting town first.
  official: z.object({ accessDay: z.boolean(), basis: z.array(z.string().max(300)).max(6).default([]) }).nullable().default(null),
});
export type MainTransport = z.infer<typeof mainTransportSchema>;

export function travelDate(firstDate: string, offset: number) {
  const date = new Date(`${firstDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

// A plan covers getting to the walk only. The trip ends where the walk ends;
// a way home is added later in chat when the user asks for one.
export function mainTransportQueries(request: TravelRequest, endpoints: z.infer<typeof transportEndpointsSchema>, plannedDate: string | null) {
  const queries: MainTransportQuery[] = [];
  for (const mode of request.modes) {
    const hubs = endpoints.endpoints.find(value => value.mode === mode);
    if (!hubs) continue;
    queries.push({ direction: 'outbound', mode, origin: hubs.outboundOrigin, destination: hubs.outboundDestination, departureDate: plannedDate,
      earliestHour: mode === 'rail' ? 6 : null,
      stationAlternative: mode === 'rail' ? hubs.railAlternatives.find(value => value.direction === 'outbound') ?? null : null });
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

// 12306 marks a fare that is not on sale yet with '*': the train and its fare
// are real, the ticket just cannot be bought today. Only '无' means sold out.
const presaleSeat = (seat: any) => String(seat.availability) === '*';
// A seat read from a stored timetable (rail-timetable.ts): the train ran on the
// same weekday when it was observed; whether it has tickets is the user's check.
const referenceSeat = (seat: any) => String(seat.availability) === REFERENCE_SEAT;

function availableSeats(seats: any[]) {
  return seats.filter(seat => seat.availability === '有' || /^[1-9]\d*$/.test(String(seat.availability)) || presaleSeat(seat) || referenceSeat(seat))
    .sort((a, b) => (typeof a.pricePerAdult === 'number' ? a.pricePerAdult : Infinity) - (typeof b.pricePerAdult === 'number' ? b.pricePerAdult : Infinity));
}

type MergeLocation = { name: string; source?: 'map' | 'custom'; longitude?: number | null; latitude?: number | null; address?: string | null };
type MergeOptions = { totalDays?: number | null; originLocation?: MergeLocation | null; originCity?: string | null };

const endpointDisplay = (endpoint: z.infer<typeof transportEndpointSchema>, direction: 'outbound' | 'return', side: 'origin' | 'destination') => {
  const key = `${direction}${side[0].toUpperCase()}${side.slice(1)}DisplayName` as keyof typeof endpoint;
  const cityKey = `${direction}${side[0].toUpperCase()}${side.slice(1)}City` as keyof typeof endpoint;
  const raw = endpoint[key];
  if (typeof raw === 'string' && raw.trim()) return raw.trim();
  const code = direction === 'outbound'
    ? (side === 'origin' ? endpoint.outboundOrigin : endpoint.outboundDestination)
    : (side === 'origin' ? endpoint.returnOrigin : endpoint.returnDestination);
  if (endpoint.mode === 'flight') {
    const city = endpoint[cityKey];
    return `${typeof city === 'string' && city.trim() ? city.trim() : '未知城市'}（${code}）`;
  }
  return code;
};

function canonicalHubNames(main: MainTransport) {
  const names = new Map<string, string>();
  const preferredMode = main.request.modes.find(mode => main.hubs.some(endpoint => endpoint.mode === mode));
  for (const endpoint of main.hubs.filter(value => !preferredMode || value.mode === preferredMode)) {
    const hubs = endpoint.mode === 'flight'
      ? [
        [endpoint.outboundDestination, endpointDisplay(endpoint, 'outbound', 'destination')],
        [endpoint.returnOrigin, endpointDisplay(endpoint, 'return', 'origin')],
      ] as const
      : [[endpoint.outboundDestination, endpoint.outboundDestination], [endpoint.returnOrigin, endpoint.returnOrigin]] as const;
    for (const [hub, display] of hubs) {
      const trimmed = String(hub).trim();
      if (!trimmed) continue;
      const city = endpoint.mode === 'rail' ? trimmed.replace(/(?:东|南|西|北|站)$/, '') : '';
      if (city.length >= 2 && city !== trimmed) names.set(city, display);
    }
  }
  return names;
}

function canonicalizeItem(item: MainTransport['itineraryItems'][number], names: Map<string, string>) {
  const fix = (location: any) => {
    if (!location) return location;
    const replacement = names.get(String(location.name).trim());
    return replacement ? { ...location, name: replacement } : location;
  };
  return { ...item, startLocation: fix(item.startLocation), location: fix(item.location) };
}

/** Compare administrative city names; only the trailing 市 is not significant. */
const cityKey = (name: string | null | undefined) => name?.trim().replace(/市$/, '') || null;

function endpointFor(main: MainTransport, direction: 'outbound' | 'return') {
  const mode = main.request.modes.find(value => main.hubs.some(endpoint => endpoint.mode === value));
  if (!mode) return null;
  const endpoint = main.hubs.find(value => value.mode === mode);
  if (!endpoint) return null;
  const origin = direction === 'outbound' ? endpoint.outboundOrigin : endpoint.returnOrigin;
  const destination = direction === 'outbound' ? endpoint.outboundDestination : endpoint.returnDestination;
  return { mode, endpoint, origin, destination,
    originDisplay: endpointDisplay(endpoint, direction, 'origin'),
    destinationDisplay: endpointDisplay(endpoint, direction, 'destination'),
    originCity: endpoint[`${direction}OriginCity` as keyof typeof endpoint] as string | undefined,
    destinationCity: endpoint[`${direction}DestinationCity` as keyof typeof endpoint] as string | undefined,
    userCity: endpoint[`${direction}UserCity` as keyof typeof endpoint] as string | undefined };
}

function queryServiceCodes(entry: MainTransport['queries'][number]) {
  const offers = record(entry.result).offers;
  if (!Array.isArray(offers)) return [];
  return offers.flatMap((offer: any) => entry.mode === 'rail'
    ? (offer.segments || [offer]).filter((segment: any, index: number, segments: any[]) => {
      const first = segments[0], last = segments.at(-1);
      return (!first?.from || String(first.from) === entry.origin)
        && (!last?.to || String(last.to) === entry.destination)
        && (!entry.departureDate || String(first?.departure || '').slice(0, 10) === entry.departureDate);
    }).map((segment: any) => segment.trainNumber)
    : entry.mode === 'flight'
      ? (offer.itineraries || []).flatMap((itinerary: any) => {
        const segments = itinerary.segments || [], first = segments[0], last = segments.at(-1);
        if (!first || (entry.departureDate && String(first.departure || '').slice(0, 10) !== entry.departureDate)
          || (first.from && String(first.from) !== entry.origin) || (last?.to && String(last.to) !== entry.destination)) return [];
        return segments.map((segment: any) => `${segment.marketingCarrier || ''}${segment.flightNumber || ''}`);
      })
      : []).filter((value: unknown): value is string => typeof value === 'string' && value.length > 0);
}

function providerRowsForDirection(main: MainTransport, direction: 'outbound' | 'return', endpoint: ReturnType<typeof endpointFor>) {
  if (!endpoint) return [];
  const rows = main.itineraryItems;
  const codes = main.queries.filter(query => query.direction === direction && query.mode === endpoint.mode).flatMap(queryServiceCodes);
  return rows.filter(item => {
    if (endpoint.mode === 'self_drive' && (/自驾|高德估算/.test(item.title)
      || item.location?.name === endpoint.origin || item.location?.name === endpoint.destination)) return true;
    if (codes.some(code => item.title.includes(code))) return true;
    const route = `${endpoint.origin}→${endpoint.destination}`;
    const displayRoute = `${endpoint.originDisplay}→${endpoint.destinationDisplay}`;
    return item.title.includes(route) || item.title.includes(displayRoute)
      || (item.location?.name === endpoint.destination && item.location.incomingMode === endpoint.mode
        && (/^(?:抵达|到达)/.test(item.title)));
  });
}

function skeletonItem(day: string, title: string, location: MergeLocation, startLocation?: MergeLocation, incomingMode?: IncomingMode | null) {
  return itineraryItem.parse({ day, kind: 'custom', title: title.slice(0, 120), startLocation: startLocation || null,
    location: { ...location, source: location.source || 'custom', incomingMode: incomingMode || null } });
}

/** Merge provider rows and the deterministic hub chain into model itinerary rows. */
export function mergeMainTransportItems(items: MainTransport['itineraryItems'], main: MainTransport, totalDaysOrOptions?: number | MergeOptions | null) {
  const options: MergeOptions = typeof totalDaysOrOptions === 'number' ? { totalDays: totalDaysOrOptions } : (totalDaysOrOptions || {});
  if (!main.hubs.length) {
    // Legacy artifacts predate persisted hubs. Keep the historical provider
    // merge so a saved dated service still extends the candidate day range,
    // while never deleting the model rows that cannot be reconciled.
    // Failed hub resolution lands here too, with ground estimates from home:
    // the trip still leaves home before anything else happens on Day 1.
    const rows = [...items];
    const leading: typeof rows = [];
    for (const service of main.itineraryItems) {
      if (rows.some(item => item.day === service.day && item.title === service.title
        && item.timeStart === service.timeStart && item.timeEnd === service.timeEnd
        && item.location?.name === service.location?.name)) continue;
      if (service.day === 'Day 1') leading.push(service);
      else rows.push(service);
    }
    return [...leading, ...rows];
  }
  const names = canonicalHubNames(main);
  const modelItems = items.map(item => canonicalizeItem(item, names));
  const requestOrigin = main.request.origin || '';
  const outboundEndpoint = endpointFor(main, 'outbound');
  const originMatch = (location: any) => location && location.name !== outboundEndpoint?.originDisplay
    && location.name !== outboundEndpoint?.destinationDisplay
    && (!requestOrigin || location.name === requestOrigin || location.name.startsWith(requestOrigin));
  const firstDayOriginItem = modelItems.find(item => item.day === 'Day 1'
    && (originMatch(item.startLocation) || originMatch(item.location)));
  const firstDayOrigin = firstDayOriginItem
    ? (originMatch(firstDayOriginItem.startLocation) ? firstDayOriginItem.startLocation : firstDayOriginItem.location)
    : undefined;
  const originLocation = firstDayOrigin || options.originLocation || (requestOrigin ? { name: requestOrigin, source: 'custom' as const } : null);
  // Only the way there: the hub chain anchors Day 1, and the trip ends where the walk ends.
  const outbound = (() => {
    const endpoint = outboundEndpoint;
    const provider = providerRowsForDirection(main, 'outbound', endpoint);
    const userCity = cityKey(options.originCity ?? endpoint?.userCity);
    const sameCity = Boolean(userCity && endpoint && userCity === cityKey(endpoint.originCity));
    const groundOnly = endpoint?.mode === 'self_drive'
      || Boolean(userCity && userCity === cityKey(endpoint?.originCity) && userCity === cityKey(endpoint?.destinationCity));
    const day = 'Day 1';
    const localEnd = { name: endpoint?.originDisplay || '', source: 'custom' as const };
    if (!endpoint || groundOnly || !localEnd.name || !originLocation?.name) return { endpoint, replacement: groundOnly ? provider : [], local: [] };
    const local = sameCity ? null : skeletonItem(day, `前往${localEnd.name}`, localEnd, originLocation);
    if (provider.length) return { endpoint, replacement: [...(local ? [local] : []), ...provider], local: local ? [local] : [] };
    const label = endpoint.mode === 'rail' ? '高铁' : endpoint.mode === 'flight' ? '航班' : '自驾';
    // Without a provider service the hub names alone say how to travel; no pending marker.
    const departure = skeletonItem(day, `${label} ${endpoint.originDisplay}→${endpoint.destinationDisplay}`, { name: endpoint.originDisplay, source: 'custom' });
    const arrival = skeletonItem(day, `抵达${endpoint.destinationDisplay}`, { name: endpoint.destinationDisplay, source: 'custom' }, undefined, endpoint.mode === 'self_drive' ? null : endpoint.mode);
    return { endpoint, replacement: [...(local ? [local] : []), departure, arrival], local: local ? [local] : [] };
  })();
  const replaced = Boolean(outbound.endpoint);
  const sameCity = Boolean(outbound.endpoint && outbound.local.length === 0);
  const replacementRows = [...outbound.local, ...outbound.replacement];
  const services = main.queries.flatMap(queryServiceCodes);
  const local = modelItems.filter(item => {
    if (item.kind === 'stay' || (item.kind === 'activity' && item.routeId)) return true;
    // The model occasionally emits a self-loop such as “前往成都” with both
    // ends still at the origin. It is not a place in the hub chain.
    if (item.startLocation && item.location && item.startLocation.name === item.location.name
      && /^(?:前往|抵达|到达)/.test(item.title)) return false;
    // Only a hub arrival is the chain's to replace; a road leg stays in the plan.
    if (isHubIncomingMode(item.location?.incomingMode) && replaced) return false;
    if (sameCity && item.day === 'Day 1' && /^(?:前往|从)/.test(item.title)) return false;
    if (sameCity && item.day === 'Day 1'
      && (item.location?.name === requestOrigin || item.startLocation?.name === requestOrigin)) return false;
    // The trip ends where the walk ends: a model ride home is not planned.
    if (item.day !== 'Day 1' && (/^(?:返回|回家|回到|返程)/.test(item.title)
      || (item.location?.name && (originMatch(item.location) || item.location.name === outboundEndpoint?.originDisplay)))) return false;
    if (/接驳|出租|网约车|公交|地铁|步行|拼车|班车|\btransfer\b|\btaxi\b/i.test(item.title)) return true;
    if (item.timeStart && item.timeEnd && item.location?.name
      && main.itineraryItems.some(service => service.day === item.day
        && service.timeStart === item.timeStart && service.timeEnd === item.timeEnd
        && service.location?.name === item.location?.name)) return false;
    if (services.some(service => item.title.includes(service))) return false;
    if (/高铁|动车|火车|航班|飞机|自驾|\b(?:train|flight|self.drive)\b/i.test(item.title)) return false;
    if (replaced && item.day === 'Day 1' && item.location
      && item.location.name === outbound.endpoint?.destinationDisplay && /^(?:抵达|到达)/.test(item.title)) return false;
    return true;
  });
  // Do not retain a model local transfer when the server already supplied the
  // same origin→departure-hub leg; its coordinates are copied into the server row.
  const withoutDuplicateLocals = local.filter(item => !replacementRows.some(server => {
    if (!item.startLocation || !item.location || !server.startLocation || !server.location) return false;
    return item.day === server.day && item.startLocation.name === server.startLocation.name && item.location.name === server.location.name;
  }));
  const all = [...withoutDuplicateLocals, ...replacementRows];
  const days = [...new Set(all.map(item => item.day))].sort((a, b) => (Number(a.replace(/^Day\s*/i, '')) || 0) - (Number(b.replace(/^Day\s*/i, '')) || 0));
  const placeKey = (name?: string) => (name || '').replace(/(?:高铁站|火车站|站)$/, '').replace(/\s/g, '');
  return days.flatMap(day => {
    const rows = all.filter(item => item.day === day);
    const timed = rows.filter(item => item.timeStart || item.timeEnd);
    const untimed = rows.filter(item => !item.timeStart && !item.timeEnd);
    // Hub rows anchor the first day whether they are dated provider services
    // or untimed skeletons; model rows (transfers, stays) follow them.
    if (day === 'Day 1' && outbound.replacement.length) {
      const rank = (item: typeof rows[number]) => {
        if (outbound.local.some(value => value === item)) return 1;
        if (outbound.replacement.some(value => value === item)) return 2;
        return 3;
      };
      return [...rows].sort((a, b) => rank(a) - rank(b));
    }
    return timed.length ? [...untimed, ...timed] : rows;
  }).filter((item, index, array) => index === array.findIndex(other => other.day === item.day
    && other.title === item.title && placeKey(other.location?.name) === placeKey(item.location?.name)
    && other.timeStart === item.timeStart && other.timeEnd === item.timeEnd));
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
  // A provider response can contain a stale or mismatched cached offer. Never
  // attach it to the opposite direction merely because its service number is
  // present in the response.
  if (query.mode === 'rail' && segments[0]?.from && String(segments[0].from) !== query.origin) return [];
  if (query.mode === 'rail' && segments.at(-1)?.to && String(segments.at(-1).to) !== query.destination) return [];
  if (query.departureDate && String(segments[0]?.departure || '').slice(0, 10) !== query.departureDate) return [];
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
    const price = seat && typeof seat.pricePerAdult === 'number' ? ` · ${seat.name || ''}¥${seat.pricePerAdult}/人${presaleSeat(seat) ? '（未开售）' : referenceSeat(seat) ? '（参考票价）' : ''}`
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
  fallbackDestination?: string | null;
  query: (query: MainTransportQuery) => Promise<unknown>;
  now?: number;
}): Promise<MainTransport> {
  const suggestedDays = args.days == null && args.endpoints.durationBasis.trim() ? args.endpoints.suggestedDays : null;
  const queries = mainTransportQueries(args.request, args.endpoints, args.plannedDate);
  const unresolved = [...args.endpoints.unresolved];
  for (const endpoint of args.endpoints.endpoints) {
    if (endpoint.mode !== 'flight') continue;
    for (const field of ['outboundOriginDisplayName', 'outboundDestinationDisplayName'] as const) {
      if (!endpoint[field]) unresolved.push(`航班机场显示名缺少模型提供的中文名称，${field} 使用城市与 IATA 组合展示，出发前需核对。`);
    }
  }
  if (suggestedDays != null) unresolved.push(`总天数待定，暂按候选全程 ${suggestedDays} 天编排：${args.endpoints.durationBasis}。这是估算方案，不是用户已指定的天数。`.slice(0, 300));
  for (const mode of args.request.modes) {
    if (!queries.some(query => query.mode === mode)) unresolved.push(`${mode} 出发/到达枢纽未能可靠确定，尚未查询。`);
  }
  const fallbackQueries: MainTransportQuery[] = !args.endpoints.endpoints.length && args.fallbackDestination
    ? [{ direction: 'outbound', mode: 'self_drive', origin: args.request.origin || '', destination: args.fallbackDestination,
      departureDate: args.plannedDate, earliestHour: null, stationAlternative: null }]
    : [];
  const results = (await Promise.all([...queries, ...fallbackQueries].map(async query => {
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
  if (fallbackQueries.length) {
    for (const entry of fallbackQueries) {
      const data = record(results.find(value => value.direction === entry.direction && value.mode === 'self_drive')?.result);
      const estimate = data.available && data.status === 'results' && data.distanceKm > 0 && data.durationMinutes > 0
        ? ` · 高德驾车估算 ${data.distanceKm}km / ${data.durationMinutes}分钟` : '';
      itineraryItems.push(itineraryItem.parse({ day: 'Day 1', kind: 'custom', title: `交通方式待定 ${entry.origin}→${entry.destination}${estimate}`.slice(0, 120),
        startLocation: { name: entry.origin, source: 'custom' }, location: { name: entry.destination, source: 'custom' } }));
    }
  }
  // Compare alternatives in the artifact; save only one mode.
  let selected = false;
  for (const entry of results) {
    const data = record(entry.result);
    const items = fallbackQueries.some(value => value.mode === entry.mode)
      ? [] : providerItinerary(entry, entry.result, args.plannedDate, args.now);
    if (!selected && items.length) { itineraryItems.push(...items); selected = true; }
    if (data.status !== 'results') unresolved.push(`去程 ${entry.mode} 查询：${data.status || 'provider_error'}；不能据此推断无班次或已售罄。`);
  }
  if (!selected) unresolved.push('去程大交通尚无可保存的实际班次或道路方案。');
  if (args.request.adults === 1) unresolved.push('票价按 1 名成人查询，不代表已确认同行人数或全团总价。');
  if (results.some(entry => record(entry.result).provider === 'flyai')) unresolved.push('飞猪航班票价为单名成人查询价，尚未核对全团余票、税费及行李规则；不能乘人数当作已验证总价。');
  if (results.some(entry => record(entry.result).status === 'results')) unresolved.push('班次、余票与道路耗时为查询快照或估算，未预订；进出站、进山接驳和自驾取车仍须单独核对。');
  const hubs = args.endpoints.endpoints.filter(endpoint => args.request.modes.includes(endpoint.mode));
  return mainTransportSchema.parse({ request: args.request, hubs, queries: results, itineraryItems, unresolved: unresolved.slice(0, 20),
    suggestedDays, durationBasis: suggestedDays != null ? args.endpoints.durationBasis : '' });
}

/** What an official plan fixes about getting to the walk. */
export type OfficialTransport = { town: string; meetingPoint: string; arriveBy: string; accessStations: string[] };

type RailOffer = { trainNumber: string; from: string; to: string; departure: string; arrival: string; seats: any[] };

function railOffers(result: unknown): RailOffer[] {
  const data = record(result);
  if (!data.available || data.status !== 'results' || !Array.isArray(data.offers)) return [];
  return data.offers.flatMap((offer: any) => {
    // Direct trains only: a connection's timing is not a meeting promise.
    const segments = offer.segments || [offer];
    if (segments.length !== 1 || offer.connection) return [];
    const segment = segments[0];
    const depart = String(segment.departure || ''), arrive = String(segment.arrival || '');
    if (!segment.trainNumber || !segment.from || !segment.to || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(depart) || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(arrive)) return [];
    return [{ trainNumber: String(segment.trainNumber), from: String(segment.from), to: String(segment.to), departure: depart, arrival: arrive, seats: Array.isArray(segment.seats) ? segment.seats : [] }];
  });
}

const shanghaiDate = (now: number) => new Date(now + 8 * 3600000).toISOString().slice(0, 10);
const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000);
const clock = (iso: string) => iso.slice(11, 16);
const monthDay = (date: string) => `${Number(date.slice(5, 7))}月${Number(date.slice(8, 10))}日`;

/** A date 12306 sells, on the same weekday as the one asked about. Schedules
 * repeat weekly, so a date outside the 15-day window is read from its echo. */
export function timetableDate(date: string | null, now: number) {
  const today = shanghaiDate(now);
  if (!date) return travelDate(today, 7);
  let probe = date;
  while (daysBetween(today, probe) > 14) probe = travelDate(probe, -7);
  while (daysBetween(today, probe) < 1) probe = travelDate(probe, 7);
  return probe;
}

/**
 * Rail to an official plan's meeting point. The plan says where the shared
 * ride leaves and by when; the timetable decides whether the walk can start on
 * the arrival day or the trip needs a day to get there first. Without rail,
 * the day there is kept.
 */
export async function collectOfficialTransport(args: {
  request: TravelRequest; endpoints: z.infer<typeof transportEndpointsSchema>; plannedDate: string | null;
  official: OfficialTransport;
  query: (query: MainTransportQuery) => Promise<unknown>;
  now?: number;
}): Promise<MainTransport> {
  const now = args.now ?? Date.now();
  const { official } = args;
  const hub = args.endpoints.endpoints.find(value => value.mode === 'rail');
  if (!args.request.modes.includes('rail') || !hub || !official.accessStations.length) {
    const fallback = await collectMainTransport({ request: args.request, endpoints: args.endpoints, plannedDate: args.plannedDate,
      days: null, fallbackDestination: official.town, query: args.query, now });
    return mainTransportSchema.parse({ ...fallback, official: { accessDay: true,
      basis: [`没有可查询的火车班次，第 1 天先到${official.town}。`] } });
  }
  const live = args.plannedDate != null && args.plannedDate === timetableDate(args.plannedDate, now);
  const firstDate = live ? args.plannedDate! : timetableDate(args.plannedDate, now);
  const reference = live ? '' : `按 ${monthDay(firstDate)} 的时刻表推算：`;
  const origins = [...new Set([hub.outboundOrigin, ...hub.railAlternatives.filter(value => value.direction === 'outbound').map(value => value.origin)])].slice(0, 2);
  const results: Array<MainTransportQuery & { result: unknown }> = [];
  const unresolved = [...args.endpoints.unresolved];
  const run = async (query: MainTransportQuery) => {
    let result: unknown;
    try { result = await args.query(query); }
    catch { result = { available: false, status: 'provider_error' }; }
    results.push({ ...query, result });
    return { query, offers: railOffers(result).filter(offer => offer.from === query.origin && offer.to === query.destination
      && offer.departure.slice(0, 10) === query.departureDate && (!live || departureTime(offer.departure) >= now + 60 * 60000)) };
  };
  const seated = (offer: RailOffer) => !live || availableSeats(offer.seats).length > 0;

  // The latest train that still reaches the meeting point in time.
  const meetBy = `${firstDate}T${official.arriveBy}`;
  const destinations = official.accessStations.slice(0, 2);
  const reaches = (entries: { query: MainTransportQuery; offers: RailOffer[] }[]) => entries
    .flatMap(entry => entry.offers.filter(offer => offer.arrival.slice(0, 16) <= meetBy).map(offer => ({ ...entry, offer })));
  const early: { query: MainTransportQuery; offers: RailOffer[] }[] = [];
  // The rail sidecar admits one query and one waiting, so firing every origin
  // and station at once only reports the extras as rate_limited — which reads
  // the same as "no trains" and silently adds a travel day. One station per
  // wave, and a later station is paid for only when the earlier one cannot
  // make the meeting time.
  for (const origin of origins) {
    early.push(...await Promise.all(destinations.map(destination => run({ direction: 'outbound', mode: 'rail',
      origin, destination, departureDate: firstDate, earliestHour: 4, stationAlternative: null }))));
    if (reaches(early).some(entry => seated(entry.offer))) break;
  }
  const inTime = reaches(early).sort((a, b) => b.offer.departure.localeCompare(a.offer.departure));
  const basis: string[] = [];
  let outbound: { query: MainTransportQuery; offer: RailOffer } | null = inTime.find(entry => seated(entry.offer)) ?? null;
  const accessDay = !outbound;
  if (outbound) {
    basis.push(`${reference}${outbound.offer.trainNumber} 次 ${outbound.offer.from} ${clock(outbound.offer.departure)} 开，${clock(outbound.offer.arrival)} 到${outbound.offer.to}，赶得上 ${official.arriveBy} 在${official.meetingPoint}集合，第 1 天当天进山。`);
  } else {
    basis.push(inTime.length
      ? `能赶上 ${official.arriveBy} 集合的 ${inTime[0].offer.trainNumber} 次已无余票，第 1 天先到${official.town}住一晚。`
      : `${reference}从${origins[0]}没有 ${official.arriveBy} 前到${official.town}的直达车，第 1 天先到${official.town}住一晚。`);
    // Any daytime train will do for a travel day; prefer the primary pair.
    const daytime = (entry: { offer: RailOffer }) => clock(entry.offer.departure) >= '07:00' && seated(entry.offer)
      && entry.offer.arrival.slice(0, 10) === firstDate;
    outbound = early.flatMap(entry => entry.offers.map(offer => ({ ...entry, offer }))).find(daytime) ?? null;
    // A pair that answered at all is the one worth asking again: the early
    // query starts at 04:00 and can stop before the daytime trains, while a
    // pair with no trains (a high-speed station to a conventional one) stays empty.
    const pair = early.find(entry => entry.offers.length) ?? early[0];
    if (!outbound && pair) {
      const later = await run({ ...pair.query, earliestHour: 9 });
      outbound = later.offers.map(offer => ({ ...later, offer })).find(daytime) ?? null;
    }
  }

  const itineraryItems = live && outbound ? providerItinerary(outbound.query, { available: true, status: 'results', offers: [outbound.offer] }, firstDate, now) : [];
  // A projected timetable is never saved as a ticket row; the note below
  // already says the trains are an estimate, so this is only for a live date.
  if (live && !itineraryItems.length) unresolved.push('去程大交通尚无可保存的实际班次或道路方案。');
  const observed = outbound && record(results.find(entry => entry.origin === outbound!.query.origin && entry.destination === outbound!.query.destination
    && entry.earliestHour === outbound!.query.earliestHour)?.result).cacheMeta;
  if (live && outbound && observed?.layer === 'timetable') {
    unresolved.push(`${outbound.offer.trainNumber} 次按 ${monthDay(String(observed.observedDate))}查询的时刻表参考，出发前请在 12306 核对班次和余票。`);
  } else if (live && outbound && !availableSeats(outbound.offer.seats).some(seat => !presaleSeat(seat))) {
    unresolved.push(`${outbound.offer.trainNumber} 次车票尚未开售，开售后需在 12306 购买并核对班次。`);
  }
  if (!live) unresolved.push(args.plannedDate
    ? `出发日期不在 12306 可售期内，去程按 ${monthDay(firstDate)} 同星期的时刻表推算，开售后需重新核对班次。`
    : `出发日期未定，去程按 ${monthDay(firstDate)} 的时刻表推算，定好日期后需重新核对班次。`);
  else unresolved.push('班次与余票为查询快照，未预订；拼车集合时间以司机通知为准。');
  if (args.request.adults === 1) unresolved.push('票价按 1 名成人查询，不代表已确认同行人数或全团总价。');
  const hubs = [{ ...hub,
    outboundOrigin: outbound?.query.origin ?? hub.outboundOrigin, outboundDestination: outbound?.query.destination ?? official.accessStations[0],
    outboundDestinationCity: official.town, railAlternatives: [] }];
  return mainTransportSchema.parse({ request: args.request, hubs, queries: results.slice(0, 12), itineraryItems,
    unresolved: unresolved.slice(0, 20), suggestedDays: null, durationBasis: '',
    official: { accessDay, basis } });
}
