import { z } from 'npm:zod@4.1.12';
import { itineraryItem } from './tools.ts';
import { travelRequestSchema, travelModes, type TravelRequest } from './travel-request.ts';

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

type MergeLocation = { name: string; source?: 'map' | 'custom'; longitude?: number | null; latitude?: number | null; address?: string | null };
type MergeOptions = { totalDays?: number | null; originLocation?: MergeLocation | null; originCity?: string | null; returnCity?: string | null };

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

function skeletonItem(day: string, title: string, location: MergeLocation, startLocation?: MergeLocation, incomingMode?: 'rail' | 'flight' | null) {
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
    const rows = [...items];
    for (const service of main.itineraryItems) {
      if (!rows.some(item => item.day === service.day && item.title === service.title
        && item.timeStart === service.timeStart && item.timeEnd === service.timeEnd
        && item.location?.name === service.location?.name)) rows.push(service);
    }
    return rows;
  }
  const names = canonicalHubNames(main);
  const modelItems = items.map(item => canonicalizeItem(item, names));
  const requestOrigin = main.request.origin || '';
  const requestReturn = main.request.returnDestination || requestOrigin;
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
  const returnLocation = requestReturn ? { name: requestReturn, source: 'custom' as const } : null;
  const outboundDate = main.queries.find(query => query.direction === 'outbound' && query.departureDate)?.departureDate;
  const returnDate = main.queries.find(query => query.direction === 'return' && query.departureDate)?.departureDate;
  const queriedDays = outboundDate && returnDate
    ? Math.round((Date.parse(`${returnDate}T00:00:00Z`) - Date.parse(`${outboundDate}T00:00:00Z`)) / 86400000) + 1
    : null;
  const totalDays = options.totalDays || queriedDays || Math.max(1, ...modelItems.map(item => Number(item.day.replace(/^Day\s*/i, '')) || 1));
  const directions = (['outbound', 'return'] as const).map(direction => {
    const endpoint = endpointFor(main, direction);
    const provider = providerRowsForDirection(main, direction, endpoint);
    const userCity = cityKey((direction === 'outbound' ? options.originCity : options.returnCity) ?? endpoint?.userCity);
    const sameCity = Boolean(userCity && endpoint && (direction === 'outbound'
      ? userCity === cityKey(endpoint.originCity)
      : userCity === cityKey(endpoint.destinationCity)));
    const groundOnly = endpoint?.mode === 'self_drive'
      || Boolean(userCity && userCity === cityKey(endpoint?.originCity) && userCity === cityKey(endpoint?.destinationCity));
    const day = direction === 'outbound' ? 'Day 1' : `Day ${totalDays}`;
    const start = direction === 'outbound' ? originLocation : { name: endpoint?.destinationDisplay || requestReturn, source: 'custom' as const };
    const end = direction === 'outbound' ? { name: endpoint?.destinationDisplay || '', source: 'custom' as const } : returnLocation;
    const localStart = direction === 'outbound' ? start : { name: endpoint?.destinationDisplay || '', source: 'custom' as const };
    const localEnd = direction === 'outbound' ? { name: endpoint?.originDisplay || '', source: 'custom' as const } : end;
    if (!endpoint || groundOnly || !localEnd?.name || !localStart?.name) return { direction, endpoint, provider: groundOnly ? provider : [], replacement: groundOnly ? provider : [], local: [] };
    const local = sameCity ? null : skeletonItem(day, `前往${localEnd.name}`, localEnd, localStart);
    if (provider.length) return { direction, endpoint, provider, replacement: direction === 'return' ? [...provider, ...(local ? [local] : [])] : [...(local ? [local] : []), ...provider], local: local ? [local] : [] };
    const label = endpoint.mode === 'rail' ? '高铁' : endpoint.mode === 'flight' ? '航班' : '自驾';
    const pending = endpoint.mode === 'rail' ? '车次待查' : endpoint.mode === 'flight' ? '航班待查' : '路线待查';
    const departure = skeletonItem(day, `${label} ${endpoint.originDisplay}→${endpoint.destinationDisplay} · ${pending}`, { name: endpoint.originDisplay, source: 'custom' });
    const arrival = skeletonItem(day, `抵达${endpoint.destinationDisplay}`, { name: endpoint.destinationDisplay, source: 'custom' }, undefined, endpoint.mode === 'self_drive' ? null : endpoint.mode);
    return { direction, endpoint, provider, replacement: direction === 'return' ? [departure, arrival, ...(local ? [local] : [])] : [...(local ? [local] : []), departure, arrival], local: local ? [local] : [] };
  });
  const replacementDirections = new Set(directions.filter(value => value.endpoint).map(value => value.direction));
  const sameCityDirections = new Set(directions.filter(value => value.endpoint && value.local.length === 0).map(value => value.direction));
  const replacementRows = directions.flatMap(value => [...value.local, ...value.replacement]);
  const services = main.queries.flatMap(queryServiceCodes);
  const local = modelItems.filter(item => {
    if (item.kind === 'stay' || (item.kind === 'activity' && item.routeId)) return true;
    // The model occasionally emits a self-loop such as “前往成都” with both
    // ends still at the origin. It is not a place in the hub chain.
    if (item.startLocation && item.location && item.startLocation.name === item.location.name
      && /^(?:前往|抵达|到达)/.test(item.title)) return false;
    if (item.location?.incomingMode && replacementDirections.size) return false;
    if (sameCityDirections.has('outbound') && item.day === 'Day 1' && /^(?:前往|从)/.test(item.title)) return false;
    if (sameCityDirections.has('return') && item.day === `Day ${totalDays}` && /^(?:返回|回家|前往|从)/.test(item.title)) return false;
    if (sameCityDirections.has('outbound') && item.day === 'Day 1'
      && (item.location?.name === requestOrigin || item.startLocation?.name === requestOrigin)) return false;
    if (sameCityDirections.has('return') && item.day === `Day ${totalDays}`
      && (item.location?.name === requestReturn || item.startLocation?.name === requestReturn)) return false;
    if (/接驳|出租|网约车|公交|地铁|步行|拼车|班车|\btransfer\b|\btaxi\b/i.test(item.title)) return true;
    if (item.timeStart && item.timeEnd && item.location?.name
      && main.itineraryItems.some(service => service.day === item.day
        && service.timeStart === item.timeStart && service.timeEnd === item.timeEnd
        && service.location?.name === item.location?.name)) return false;
    if (services.some(service => item.title.includes(service))) return false;
    if (/高铁|动车|火车|航班|飞机|自驾|\b(?:train|flight|self.drive)\b/i.test(item.title)) return false;
    if (replacementDirections.has('outbound') && item.day === 'Day 1' && item.location
      && item.location.name === directions[0].endpoint?.destinationDisplay && /^(?:抵达|到达)/.test(item.title)) return false;
    if (replacementDirections.has('return') && item.day === `Day ${totalDays}` && item.location
      && item.location.name === directions[1].endpoint?.destinationDisplay && /^(?:抵达|到达)/.test(item.title)) return false;
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
    const returnDirection = directions.find(value => value.direction === 'return');
    const outboundDirection = directions.find(value => value.direction === 'outbound');
    // Hub rows anchor the first and last days whether they are dated provider
    // services or untimed skeletons; model rows (transfers, stays) follow or precede them.
    if (day === 'Day 1' && outboundDirection?.replacement.length) {
      const rank = (item: typeof rows[number]) => {
        if (outboundDirection.local.some(value => value === item)) return 1;
        if (outboundDirection.replacement.some(value => value === item)) return 2;
        return 3;
      };
      return [...rows].sort((a, b) => rank(a) - rank(b));
    }
    if (day === `Day ${totalDays}` && returnDirection?.replacement.length) {
      const rank = (item: typeof rows[number]) => {
        if (returnDirection.local.some(value => value === item)) return 4;
        if (returnDirection.replacement.some(value => value === item)) return 2;
        // A home-bound leg follows the hub train; a transfer back to the return hub precedes it.
        if (/返回|回家/.test(item.title) && item.location?.name !== returnDirection.endpoint?.originDisplay) return 5;
        return 1;
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
  fallbackDestination?: string | null;
  query: (query: MainTransportQuery) => Promise<unknown>;
  now?: number;
}): Promise<MainTransport> {
  const suggestedDays = args.days == null && args.endpoints.durationBasis.trim() ? args.endpoints.suggestedDays : null;
  const queries = mainTransportQueries(args.request, args.endpoints, args.plannedDate, args.days ?? suggestedDays);
  const unresolved = [...args.endpoints.unresolved];
  for (const endpoint of args.endpoints.endpoints) {
    if (endpoint.mode !== 'flight') continue;
    for (const field of ['outboundOriginDisplayName', 'outboundDestinationDisplayName', 'returnOriginDisplayName', 'returnDestinationDisplayName'] as const) {
      if (!endpoint[field]) unresolved.push(`航班机场显示名缺少模型提供的中文名称，${field} 使用城市与 IATA 组合展示，出发前需核对。`);
    }
  }
  if (suggestedDays != null) unresolved.push(`总天数待定，暂按候选全程 ${suggestedDays} 天查询返程：${args.endpoints.durationBasis}。这是估算方案，不是用户已指定的返程日期。`.slice(0, 300));
  for (const mode of args.request.modes) {
    if (!queries.some(query => query.mode === mode)) unresolved.push(`${mode} 出发/到达枢纽未能可靠确定，尚未查询。`);
  }
  const fallbackQueries: MainTransportQuery[] = !args.endpoints.endpoints.length && args.fallbackDestination
    ? (['outbound', 'return'] as const).map(direction => ({ direction, mode: 'self_drive' as const,
      origin: direction === 'outbound' ? args.request.origin || '' : args.fallbackDestination!,
      destination: direction === 'outbound' ? args.fallbackDestination! : args.request.returnDestination || args.request.origin || '',
      departureDate: direction === 'outbound' ? args.plannedDate : args.plannedDate && (args.days ?? suggestedDays) ? travelDate(args.plannedDate, (args.days ?? suggestedDays)! - 1) : null,
      earliestHour: null, stationAlternative: null }))
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
      itineraryItems.push(itineraryItem.parse({ day: entry.direction === 'outbound' ? 'Day 1' : `Day ${args.days ?? suggestedDays ?? 1}`,
        kind: 'custom', title: `交通方式待定 ${entry.origin}→${entry.destination}${estimate}`.slice(0, 120),
        startLocation: { name: entry.origin, source: 'custom' }, location: { name: entry.destination, source: 'custom' } }));
    }
  }
  // Compare alternatives in the artifact; save only one mode per direction.
  for (const direction of ['outbound', 'return'] as const) {
    let selected = false;
    for (const entry of results.filter(query => query.direction === direction)) {
      const data = record(entry.result);
      const items = fallbackQueries.some(value => value.direction === entry.direction && value.mode === entry.mode)
        ? [] : providerItinerary(entry, entry.result, args.plannedDate, args.now);
      if (!selected && items.length) { itineraryItems.push(...items); selected = true; }
      if (data.status !== 'results') unresolved.push(`${direction === 'outbound' ? '去程' : '返程'} ${entry.mode} 查询：${data.status || 'provider_error'}；不能据此推断无班次或已售罄。`);
    }
    if (!selected) unresolved.push(`${direction === 'outbound' ? '去程' : '返程'}大交通尚无可保存的实际班次或道路方案。`);
  }
  if (args.request.adults === 1) unresolved.push('票价按 1 名成人查询，不代表已确认同行人数或全团总价。');
  if (results.some(entry => record(entry.result).provider === 'flyai')) unresolved.push('飞猪航班票价为单名成人查询价，尚未核对全团余票、税费及行李规则；不能乘人数当作已验证总价。');
  if (results.some(entry => record(entry.result).status === 'results')) unresolved.push('班次、余票与道路耗时为查询快照或估算，未预订；进出站、进山接驳和自驾取车仍须单独核对。');
  const hubs = args.endpoints.endpoints.filter(endpoint => args.request.modes.includes(endpoint.mode));
  return mainTransportSchema.parse({ request: args.request, hubs, queries: results, itineraryItems, unresolved: unresolved.slice(0, 20),
    suggestedDays, durationBasis: suggestedDays != null ? args.endpoints.durationBasis : '' });
}
