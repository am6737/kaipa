import { parseOriginPlace, railStationDirectory, resolveOfficialRailEndpoints, type RailDirectory, type RailStation } from './origin-endpoints.ts';
import { resolveTravelRequest, travelRequestSchema } from './travel-request.ts';
import type { OfficialTransport } from './main-transport.ts';

function assert(value: unknown, message = 'Assertion failed'): asserts value { if (!value) throw new Error(message); }
const rows: RailStation[] = [
  { station: '成都东', city: '成都', hubRank: 1 }, { station: '成都南', city: '成都', hubRank: 2 }, { station: '成都', city: '成都', hubRank: 3 },
  { station: '百色', city: '百色', hubRank: 1 }, { station: '田东', city: '百色', hubRank: 0 },
  { station: '南宁东', city: '南宁', hubRank: 1 }, { station: '南宁', city: '南宁', hubRank: 2 },
  { station: '夹江', city: '乐山', hubRank: 0 }, { station: '乐山', city: '乐山', hubRank: 1 },
  { station: '广州南', city: '广州', hubRank: 1 }, { station: '广州', city: '广州', hubRank: 2 },
  { station: '大理', city: '大理', hubRank: 1 }, { station: '锡林浩特', city: '锡林郭勒', hubRank: 1 },
];
const directory = (rows: RailStation[]): RailDirectory => ({
  stationsNamed: async names => rows.filter(row => names.includes(row.station)),
  stationsInCities: async cities => rows.filter(row => cities.includes(row.city)),
});
const access = (stations: string[], town = '丹巴'): OfficialTransport => ({ town, meetingPoint: '客运站', arriveBy: '07:30', accessStations: stations });
const resolve = (origin: string | null, stations = ['成都东']) => resolveOfficialRailEndpoints({
  request: travelRequestSchema.parse({ origin, returnDestination: origin, modes: ['rail'] }),
  access: access(stations), directory: directory(rows),
});

Deno.test('a city with one passenger station is settled without a second guess', async () => {
  const resolved = await resolve('百色', ['新乡东']);
  assert(resolved, '百色 is in the directory');
  const hub = resolved.endpoints.endpoints[0];
  assert(hub.mode === 'rail' && hub.outboundOrigin === '百色' && hub.outboundOriginCity === '百色');
  assert(hub.railAlternatives.length === 0, 'a single station needs no same-city alternative');
  assert(resolved.endpoints.unresolved.length === 0, 'nothing was guessed, so nothing is flagged');
  assert(hub.outboundDestination === '新乡东' && hub.returnOrigin === '新乡东', 'the plan keeps the arrival station');
});

Deno.test('a city with several stations boards at its high-speed hub, with the runner-up kept', async () => {
  const resolved = await resolve('成都', ['新乡东']);
  const hub = resolved!.endpoints.endpoints[0];
  assert(hub.outboundOrigin === '成都东', `成都 must become 成都东, got ${hub.outboundOrigin}`);
  assert(hub.railAlternatives.length === 1 && hub.railAlternatives[0].origin === '成都南' && hub.railAlternatives[0].direction === 'outbound');
  assert(hub.outboundUserCity === '成都' && hub.outboundOriginCity === '成都', 'same city means no ground leg');
  assert(resolved!.endpoints.unresolved.some(note => /多个火车站/.test(note)), 'the choice is recorded as a caveat');
  assert(resolved!.endpoints.suggestedDays === null && resolved!.endpoints.durationBasis === '', 'the timetable, not this file, sets the days');
});

Deno.test('a geocoded location becomes its city station and keeps the county as home', async () => {
  const located = resolveTravelRequest(null, null, { status: 'available', latitude: 23, longitude: 108, accuracy: 30,
    timestamp: Date.now(), coordinateSystem: 'WGS84', placeName: '广西壮族自治区 南宁市 良庆区' });
  const hub = (await resolve(located.origin, ['新乡东']))!.endpoints.endpoints[0];
  assert(hub.outboundOrigin === '南宁东' && hub.outboundUserCity === '南宁', '良庆区 counts as 南宁');
  const county = (await resolve('广西壮族自治区 百色市 凌云县', ['新乡东']))!;
  assert(county.endpoints.endpoints[0].outboundOrigin === '百色', '凌云县 has no station of its own');
  assert(county.endpoints.endpoints[0].outboundUserCity === '凌云县', 'a county stays its own city, so the leg to 百色站 is planned');
  assert(county.endpoints.endpoints[0].outboundOriginCity === '百色');
  const own = (await resolve('四川省 乐山市 夹江县', ['新乡东']))!;
  assert(own.endpoints.endpoints[0].outboundOrigin === '夹江', '夹江县 boards at 夹江');
  assert(own.endpoints.endpoints[0].outboundUserCity === '乐山', 'a station in the user’s own county needs no intercity leg');
  assert(own.endpoints.endpoints[0].railAlternatives[0]?.origin === '乐山', 'the prefecture hub stays as the alternative');
});

Deno.test('a station the user named is used exactly and never replaced', async () => {
  const named = (await resolve('成都南站', ['新乡东']))!.endpoints.endpoints[0];
  assert(named.outboundOrigin === '成都南', '成都南 verbatim');
  assert(named.railAlternatives.length === 0, 'no alternative may replace a stated station');
  assert(named.outboundUserCity === '成都' && named.outboundOriginCity === '成都', 'the user is already at the station');
  const located = (await resolve('我在百色站', ['新乡东']))!.endpoints.endpoints[0];
  assert(located.outboundOrigin === '百色' && located.railAlternatives.length === 0);
  // 12306 spells the city's southern stop 成都南, and a user who means the city
  // writes 成都, so the bare form is the station speaking.
  const bare = (await resolve('成都南', ['新乡东']))!.endpoints.endpoints[0];
  assert(bare.outboundOrigin === '成都南' && bare.railAlternatives.length === 0, 'no 站 tail is still a station');
  assert(bare.outboundUserCity === '成都', 'the station says which city the user is in');
});

Deno.test('a district inside a city is read as that city, not as a place', async () => {
  const hub = (await resolve('广州市番禺区', ['新乡东']))!.endpoints.endpoints[0];
  assert(hub.outboundOrigin === '广州南' && hub.outboundUserCity === '广州', `got ${hub.outboundOrigin} / ${hub.outboundUserCity}`);
});

Deno.test('a prefecture is found under the name 12306 files it under', async () => {
  const prefecture = (await resolve('云南省 大理白族自治州', ['新乡东']))!.endpoints.endpoints[0];
  assert(prefecture.outboundOrigin === '大理', '大理白族自治州 is the city 大理');
  const league = (await resolve('内蒙古自治区 锡林郭勒盟', ['新乡东']))!.endpoints.endpoints[0];
  assert(league.outboundOrigin === '锡林浩特', 'a 盟 is its own city');
  assert(!await resolve('杭州', ['新乡东']), 'a 州-suffixed city name is not cut down to 杭');
});

Deno.test('a place the directory does not know is left to the model', async () => {
  assert(!await resolve('万象城', ['新乡东']), 'a POI is not a place name');
  assert(!await resolve('拉萨', ['新乡东']), 'an unseeded city is not guessed at');
  assert(!await resolve(null, ['新乡东']), 'no origin, no answer');
  assert(!await resolve('成都', []), 'a plan without access stations is not this path');
  assert(!await resolveOfficialRailEndpoints({ request: travelRequestSchema.parse({ origin: '成都', modes: ['rail'] }),
    access: access(['新乡东']), directory: directory([]) }), 'a missing table falls back');
});

Deno.test('the user never boards at the station the plan already arrives at', async () => {
  const hub = (await resolve('成都', ['成都东']))!.endpoints.endpoints[0];
  assert(hub.outboundOrigin === '成都南' && hub.outboundDestination === '成都东', `got ${hub.outboundOrigin}`);
  assert(!await resolve('百色', ['百色']), 'a single-station city cannot leave from itself');
});

Deno.test('origin text is split into the places it names, most specific first', () => {
  const located = parseOriginPlace('广西壮族自治区 南宁市 良庆区')!;
  assert(located.places.map(place => place.key).join(',') === '良庆,南宁,广西壮族自治', 'the district is read before its city');
  assert(located.places.map(place => place.kind).join(',') === 'district,city,district');
  assert(parseOriginPlace('四川省 乐山市 夹江县')!.places.map(place => place.key).join(',') === '夹江,乐山');
  assert(parseOriginPlace('广州市番禺区')!.places.map(place => `${place.key}:${place.kind}`).join(',') === '番禺:district,广州:city',
    'a city and its district are read without the space the geocoder puts between them');
  assert(parseOriginPlace('云南省 大理白族自治州')!.places.map(place => place.key).join(',') === '大理,大理白族,大理白族自治州');
  assert(parseOriginPlace('杭州')!.places[0].key === '杭州' && parseOriginPlace('杭州')!.places[0].kind === 'city');
  assert(parseOriginPlace('成都南')!.station === '成都南', 'a bare directional station needs no 站 tail');
  assert(parseOriginPlace('成都东站')!.station === '成都东');
  assert(parseOriginPlace('成都东站')!.places[0].key === '成都东' && parseOriginPlace('成都东站')!.places[0].kind === 'station');
  assert(parseOriginPlace('从成都市出发')!.places[0].key === '成都');
  assert(parseOriginPlace('  我在南宁  ')!.places[0].key === '南宁');
  assert(parseOriginPlace('   ') === null && parseOriginPlace('乌鲁木齐县')!.places[0].kind === 'county');
});

Deno.test('the database directory reads both lookups and survives a missing table', async () => {
  const calls: string[][] = [];
  const client = { from: (table: string) => ({ select: () => ({
    in: (field: string, values: string[]) => {
      calls.push([field, ...values]);
      return Promise.resolve(field === 'city' ? { data: [], error: null }
        : { data: values.includes('成都东') ? [{ station_name: '成都东', city: '成都', hub_rank: 1 }] : [], error: null });
    },
  }) }), };
  const read = railStationDirectory(client);
  assert((await read.stationsNamed(['成都东', '成都东'])).length === 1, 'names are deduplicated before the read');
  assert((await read.stationsInCities(['成都'])).length === 0);
  assert(calls[0][0] === 'station_name' && calls[1][0] === 'city');
  const broken = { from: () => { throw new Error('relation "rail_station_directory" does not exist'); } };
  assert((await railStationDirectory(broken).stationsNamed(['成都'])).length === 0, 'a missing table is not an error');
  const refused = { from: () => ({ select: () => ({ in: () => Promise.resolve({ data: null, error: { message: 'denied' } }) }) }) };
  assert((await railStationDirectory(refused).stationsInCities(['成都'])).length === 0);
});
