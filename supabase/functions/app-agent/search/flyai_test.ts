import { queryTransport, type TransportQuery } from './transport.ts';
import { providerItinerary } from '../main-transport.ts';

function assert(value: unknown, message = 'Assertion failed'): asserts value { if (!value) throw new Error(message); }
const query: TransportQuery = { mode: 'flight', origin: '北京', destination: '上海', departureDate: '2026-10-10', adults: 3 };
const env = (name: string) => ({ FLYAI_QUERY_URL: 'http://flyai-query:8788', FLYAI_QUERY_TOKEN: 'private-token' })[name];
const fixture = () => ({ status: 0, systemMessage: null, data: { itemList: [{ ticketPrice: '380.00', jumpUrl: 'https://router.feizhu.com/ws/example', journeys: [{ segments: [{
  depCityCode: 'BJS', depCityName: '北京', depStationCode: 'PKX', depStationName: '大兴国际机场', depDateTime: '2026-10-10 07:40:00',
  arrCityCode: 'SHA', arrCityName: '上海', arrStationCode: 'PVG', arrStationName: '浦东国际机场', arrDateTime: '2026-10-10 09:50:00',
  marketingTransportNo: 'MF8561', marketingTransportName: '厦航', seatClassName: '经济舱',
}] }] }] } });

Deno.test('FlyAI uses private service and produces dated single-adult offers and timeline rows', async () => {
  const result = await queryTransport(query, env, async (url, init) => {
    assert(String(url) === 'http://flyai-query:8788/query' && init?.redirect === 'error');
    assert(new Headers(init?.headers).get('Authorization') === 'Bearer private-token');
    const body = JSON.parse(String(init?.body));
    assert(body.origin === '北京' && body.departureDate === query.departureDate && !('adults' in body));
    return Response.json(fixture());
  });
  assert(result.status === 'results' && result.provider === 'flyai');
  const offer = result.offers[0] as any;
  assert(offer.pricePerAdult === 380 && offer.pricedAdults === 1 && !offer.totalPrice && !offer.booked);
  assert(offer.itineraries[0].segments[0].departure === '2026-10-10T07:40:00+08:00');
  const rows = providerItinerary({ ...query, direction: 'outbound', earliestHour: null }, result, query.departureDate);
  assert(rows.length === 1 && rows[0].timeStart === '07:40' && rows[0].timeEnd === '09:50');
  assert(rows[0].title.includes('MF8561') && rows[0].title.includes('飞猪FlyAI') && rows[0].title.includes('¥380/人'));
  assert(!JSON.stringify(result).includes('private-token'));
});

Deno.test('FlyAI preserves quota notices and empty results; accepts airport/city codes', async () => {
  for (const origin of ['BJS', 'PKX', '大兴国际机场']) {
    const result = await queryTransport({ ...query, origin }, env, async () => Response.json(fixture()));
    assert(result.status === 'results');
  }
  const result = await queryTransport(query, env, async () => Response.json({ status: 0, systemMessage: '体验模式结果受限', data: { itemList: [] } }));
  assert(result.status === 'empty' && result.available && result.limitation.includes('体验模式'));
  const suffix = fixture(); suffix.data.itemList[0].journeys[0].segments[0].marketingTransportNo = 'G52146W';
  const suffixResult = await queryTransport(query, env, async () => Response.json(suffix));
  assert(suffixResult.status === 'results', 'Provider flight-number suffix must be preserved');
});

Deno.test('FlyAI rejects wrong dates, endpoints, impossible times and untrusted purchase links', async () => {
  for (const corrupt of [
    (f: any) => f.data.itemList[0].journeys[0].segments[0].depDateTime = '2026-10-11 07:40:00',
    (f: any) => f.data.itemList[0].journeys[0].segments[0].arrDateTime = '2026-10-10 07:00:00',
    (f: any) => f.data.itemList[0].journeys[0].segments[0].depCityName = '广州',
    (f: any) => f.data.itemList[0].jumpUrl = 'https://attacker.example/booking',
  ]) {
    const f = fixture(); corrupt(f);
    const result = await queryTransport(query, env, async () => Response.json(f));
    assert(result.status === 'provider_error' && !result.available && !result.offers.length);
  }
  for (const status of [401, 429, 502]) {
    const result = await queryTransport(query, env, async () => new Response('private-token', { status }));
    assert(result.status === (status === 429 ? 'rate_limited' : 'provider_error'));
    assert(!JSON.stringify(result).includes('private-token'));
  }
  const result = await queryTransport(query, name => name === 'FLYAI_QUERY_URL' ? 'https://attacker.example' : env(name), () => { throw new Error('must not fetch'); });
  assert(!result.available && !result.offers.length);
});

Deno.test('FlyAI keeps matching candidates from broad results and rejects unsafe transfer alternatives', async () => {
  const f = fixture();
  const wrong = structuredClone(f.data.itemList[0]); wrong.journeys[0].segments[0].depCityName = '广州';
  f.data.itemList.push(wrong);
  const transfer = structuredClone(f.data.itemList[0]);
  const first = transfer.journeys[0].segments[0];
  const second = structuredClone(first);
  first.arrCityName = '武汉'; first.arrCityCode = 'WUH'; first.arrStationCode = 'WUH'; first.arrStationName = '天河机场'; first.arrDateTime = '2026-10-10 09:00:00';
  second.depCityName = '武汉'; second.depCityCode = 'WUH'; second.depStationCode = 'WUH'; second.depStationName = '天河机场'; second.depDateTime = '2026-10-10 09:30:00'; second.arrDateTime = '2026-10-10 11:00:00';
  transfer.journeys[0].segments.push(second); f.data.itemList.push(transfer);
  const result = await queryTransport(query, env, async () => Response.json(f));
  assert(result.status === 'results' && result.offers.length === 1 && result.limitation.includes('已排除'));
  second.depDateTime = '2026-10-10 10:30:00';
  const connected = await queryTransport(query, env, async () => Response.json({ ...f, data: { itemList: [transfer] } }));
  const rows = providerItinerary({ ...query, direction: 'outbound', earliestHour: null }, connected, query.departureDate);
  assert(connected.status === 'results' && rows.length === 2);
  assert(rows[0].title.includes('全程¥380/人') && !rows[1].title.includes('¥380'), 'Do not repeat whole-journey price on every leg');
});
