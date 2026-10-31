// The origin station for an official plan is a lookup, not a judgement.
//
// An official plan already fixes how the walk is reached: its `access.stations`
// name the arrival station and `access.arriveBy` says when the shared ride
// leaves. The only thing the transport stage still had a model decide was which
// station the USER boards at, and that answer comes from the 12306 station
// directory plus the user's own words. Reading the directory is two indexed
// selects; the model call it replaces measured ~15 s.
//
// The resolver never guesses. A place it cannot match returns null and the
// caller keeps the model, so a thin directory costs latency, never a wrong
// station. A station the user named is always taken verbatim, exactly as the
// model prompt already required.
import { transportEndpointsSchema, type OfficialTransport } from './main-transport.ts';
import type { TravelRequest } from './travel-request.ts';

export type RailStation = { station: string; city: string; hubRank: number };

/** Station knowledge, injected so the resolver is testable without a database. */
export type RailDirectory = {
  /** Rows whose station name is exactly one of `names`. */
  stationsNamed(names: string[]): Promise<RailStation[]>;
  /** Rows for each named city; `hubRank` 0 rows are local stops, not city choices. */
  stationsInCities(cities: string[]): Promise<RailStation[]>;
};

export type OriginPlace = {
  /** Name without its administrative suffix, as the directory spells it. */
  key: string;
  /** The user's own wording, suffix included. */
  label: string;
  kind: 'station' | 'county' | 'city' | 'district' | 'name';
};
/** `places` are ordered most specific first; `station` is one the user named. */
export type ParsedOrigin = { places: OriginPlace[]; station: string | null };

const NOISE_PREFIX = /^(?:我(?:现在|目前)?在|家在|身处|从|到|去|回)/;
const NOISE_SUFFIX = /(?:出发|这边|这儿|附近|现在|了|吧|啊)+$/;
const STATION_TOKEN = /([\u4e00-\u9fa5A-Za-z0-9]{2,12}?)(?:高铁站|火车站|客运站|站)$/;
// A place name stops at the next administrative suffix, so 浙江省杭州市 is a
// province and a city and never an invented city called 浙江杭州.
const ADMIN_TOKEN = /((?:(?![市县区旗省])[\u4e00-\u9fa5]){1,8}?)(市|县|旗|区|省)/g;
// A prefecture that ends in 州 or 盟 carries no suffix to cut on, and 12306
// files it under its own short name: 大理白族自治州 is the city 大理, 锡林郭勒盟
// is 锡林郭勒.
const PREFECTURE_TAIL = /(?:州|盟)$/;
const DIRECTION = /^(.{2,8})[东南西北]$/;

/** The names one prefecture goes by; the caller reads this list back to front,
 * so the shortest spelling — the one 12306 files the city under — comes last.
 * 大理白族自治州 is the city 大理, 文山壮族苗族自治州 is 文山, 锡林郭勒盟 is
 * 锡林郭勒, and a city whose own name ends in 州 (杭州) is not cut at all. */
function prefectureKeys(run: string): string[] {
  const keys = [run];
  const add = (value: string) => { if (value.length >= 2 && !keys.includes(value)) keys.push(value); };
  const queue = [run.replace(/自治州$/, '').replace(/(?:盟|州)$/, '')];
  while (queue.length && keys.length < 5) {
    const value = queue.shift()!;
    add(value);
    // 土家族 and 维吾尔族 sit between the place name and 自治州, and which
    // chars belong to the place is not decidable here; the directory is.
    if (value.endsWith('族')) queue.push(value.slice(0, -2), value.slice(0, -3));
  }
  return keys;
}

/** Split an origin string into the places it names, most specific first.
 *
 * Only the shapes the app actually sends are handled: a reverse-geocoded fix
 * ("广西壮族自治区 南宁市 良庆区"), a typed city or county ("成都", "凌云县"),
 * or the station the user is at ("成都东站"). Every token is still checked
 * against the directory before it is used, so an over-eager token is harmless
 * and a plain POI ("万象城") simply matches nothing. */
export function parseOriginPlace(origin: string): ParsedOrigin | null {
  const raw = String(origin || '').trim().replace(/\s+/g, ' ').replace(NOISE_PREFIX, '').replace(NOISE_SUFFIX, '').trim();
  if (!raw) return null;
  const places: OriginPlace[] = [];
  const push = (place: OriginPlace) => {
    if (place.key.length >= 2 && !places.some(other => other.key === place.key)) places.push(place);
  };
  // A trailing 站 is the user naming the station itself, not a place.
  const station = raw.match(STATION_TOKEN)?.[1]?.trim() ?? null;
  let plain = true;
  for (const run of raw.split(' ')) {
    let found = false;
    for (const match of run.matchAll(ADMIN_TOKEN)) {
      const [, name, suffix] = match;
      found = true;
      // The province says nothing the city does not already say.
      if (suffix === '省') continue;
      push({ key: name, label: match[0], kind: suffix === '市' ? 'city' : suffix === '区' ? 'district' : 'county' });
    }
    if (found) { plain = false; continue; }
    if (PREFECTURE_TAIL.test(run)) {
      plain = false;
      for (const key of prefectureKeys(run)) push({ key, label: run, kind: 'city' });
      continue;
    }
    push({ key: run, label: run, kind: 'name' });
  }
  if (station) push({ key: station, label: station, kind: 'station' });
  const compact = raw.replace(/\s+/g, '');
  // A bare "成都南" is a station, not a place: that is how 12306 spells the
  // city's southern stop, and a user who means the city writes 成都.
  const directional = DIRECTION.exec(compact)?.[1];
  const named = station ?? (plain && directional ? compact : null);
  if (named && !places.some(place => place.kind === 'station')) push({ key: named, label: named, kind: 'station' });
  if (directional) push({ key: directional, label: directional, kind: 'name' });
  // A geocoded fix lists the province first and the district last, so reading
  // it back to front is reading it from the most specific place.
  return { places: places.reverse(), station: named };
}

export type ResolvedOfficialEndpoints = {
  endpoints: ReturnType<typeof transportEndpointsSchema.parse>;
  /** How the station was settled, for the stage log. */
  basis: string;
};

/** The user's boarding station for an official plan, or null when settling it
 * would take judgement the directory cannot give. */
export async function resolveOfficialRailEndpoints(args: {
  request: TravelRequest; access: OfficialTransport; directory: RailDirectory;
}): Promise<ResolvedOfficialEndpoints | null> {
  const destination = args.access.accessStations.find(name => name?.trim());
  if (!destination) return null;
  const parsed = parseOriginPlace(args.request.origin || '');
  if (!parsed?.places.length) return null;
  const keys = [...new Set(parsed.places.map(place => place.key))];
  const [named, inCities] = await Promise.all([args.directory.stationsNamed(keys), args.directory.stationsInCities(keys)]);
  const byName = new Map(named.map(row => [row.station, row]));
  // City rows are already the whole set; a station found by name may belong to
  // a city none of the user's words named, and that city's hubs are the
  // same-city alternatives. Their rows come from the second read only when the
  // city itself was one of the keys, so a county station falls back to no
  // alternative rather than an extra round trip.
  const hubs = new Map<string, RailStation[]>();
  for (const row of inCities) {
    if (row.hubRank <= 0 || row.station === destination) continue;
    const list = hubs.get(row.city) ?? [];
    if (!list.some(value => value.station === row.station)) list.push(row);
    hubs.set(row.city, list.sort((a, b) => a.hubRank - b.hubRank));
  }

  // A station the user named is theirs alone, with no same-city replacement. If
  // the directory cannot resolve it, this file cannot fill the cities around it
  // either, so the model — whose prompt carries the same rule — gets the turn.
  let station: RailStation | null;
  let alternative: RailStation | null = null;
  let userCity = '';
  const stated = parsed.station ? byName.get(parsed.station) ?? null : null;
  if (parsed.station) {
    if (!stated || stated.station === destination) return null;
    station = stated;
    userCity = stated.city;
  } else {
    // A county the user named that has no station of its own still says where
    // they live: 凌云县 stays 凌云县, so the leg to 百色站 is planned.
    const countyLabel = parsed.places.find(place => place.kind === 'county')?.label ?? null;
    station = null;
    for (const place of parsed.places) {
      if (place.kind === 'district' || place.kind === 'station') continue;
      // A city's own list outranks its bare-name station: 成都 boards at 成都东.
      const cityHubs = hubs.get(place.key) ?? [];
      if (cityHubs.length) {
        station = cityHubs[0];
        alternative = cityHubs.length > 1 ? cityHubs[1] : null;
        userCity = countyLabel && countyLabel !== place.label ? countyLabel : station.city;
        break;
      }
      const row = byName.get(place.key);
      if (!row || row.station === destination) continue;
      station = row;
      // A county's own station may still be seconded by a hub in the same prefecture.
      alternative = (hubs.get(row.city) ?? []).find(value => value.station !== row.station) ?? null;
      userCity = row.city;
      break;
    }
  }
  if (!station || !userCity) return null;

  const endpoints = transportEndpointsSchema.parse({ endpoints: [{
    mode: 'rail',
    outboundOrigin: station.station, outboundDestination: destination,
    returnOrigin: destination, returnDestination: station.station,
    outboundOriginCity: station.city, outboundDestinationCity: args.access.town,
    returnOriginCity: args.access.town, returnDestinationCity: station.city,
    outboundUserCity: userCity, returnUserCity: userCity,
    railAlternatives: alternative ? [{ direction: 'outbound', origin: alternative.station, destination }] : [],
    // An alternative means the city has several passenger stations and the
    // timetable, not this file, settled which one to board at.
  }], unresolved: alternative
    ? [`${userCity}有多个火车站，去程按 ${station.station} 查询，同时备选 ${alternative.station}；若你要从别的车站出发请告诉我。`]
    : [] });
  const basis = alternative
    ? `${userCity} 的出发站按 12306 车站目录取 ${station.station}，同城备选 ${alternative.station} 一并查询。`
    : `出发站按 12306 车站目录与出发地确定为 ${station.station}。`;
  return { endpoints, basis };
}

/** The station directory as the pipeline sees it.
 *
 * A missing table, a failed read or an empty city all mean one thing here: the
 * resolver has no answer, and the caller asks the model as before. */
export function railStationDirectory(client: any): RailDirectory {
  const parse = (result: { data: unknown; error: unknown }): RailStation[] => {
    if (result?.error || !Array.isArray(result?.data)) return [];
    return (result.data as any[]).map(row => ({
      station: String(row.station_name ?? '').trim(),
      city: String(row.city ?? '').trim(),
      hubRank: Number(row.hub_rank) || 0,
    })).filter(row => row.station && row.city);
  };
  const select = (field: string) => async (values: string[]) => {
    const unique = [...new Set(values.map(value => value.trim()).filter(Boolean))];
    if (!unique.length) return [];
    try { return parse(await client.from('rail_station_directory').select('station_name,city,hub_rank').in(field, unique)); }
    catch { return []; }
  };
  return { stationsNamed: select('station_name'), stationsInCities: select('city') };
}
