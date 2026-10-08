import { z } from 'npm:zod@4.1.12';
import type { TransportQuery } from './transport.ts';

const stamp = z.string().regex(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
const segment = z.object({
  depCityCode: z.string(), depCityName: z.string(), depStationCode: z.string().regex(/^[A-Z]{3}$/), depStationName: z.string(),
  arrCityCode: z.string(), arrCityName: z.string(), arrStationCode: z.string().regex(/^[A-Z]{3}$/), arrStationName: z.string(),
  depDateTime: stamp, arrDateTime: stamp, marketingTransportNo: z.string().regex(/^[A-Z0-9]{2}\d{1,4}[A-Z]?$/),
  marketingTransportName: z.string(), seatClassName: z.string(),
});
const payloadSchema = z.object({ status: z.literal(0), systemMessage: z.string().max(2000).nullish(),
  data: z.object({ itemList: z.array(z.object({
    ticketPrice: z.string().regex(/^\d+(?:\.\d+)?$/), jumpUrl: z.string().url(),
    journeys: z.array(z.object({ segments: z.array(segment).min(1).max(4) })).length(1),
  })).max(100) }),
});
const airportStamp = (value: string) => value.replace(' ', 'T') + '+08:00';
function matches(value: string, cityCode: string, city: string, airportCode: string, airport: string) {
  return [cityCode, city, airportCode, airport].includes(value.trim());
}

/** Official CLI handles FlyAI signing in a private sidecar. The model never
 * receives credentials, selects a provider URL or produces concrete offers. */
export async function queryFlyai(query: TransportQuery, getEnv: (name: string) => string | undefined, request: typeof fetch = fetch) {
  const base = { query, provider: 'flyai', available: false, status: 'not_configured', offers: [] as unknown[],
    results: [{ title: '飞猪 FlyAI 航班查询', url: 'https://flyai.open.fliggy.com/', source: 'flyai' }],
    retrievedAt: new Date().toISOString(),
    limitation: '飞猪查询快照，未预订。票价按单名成人展示，税费/行李规则和实际可订余票须在购买页核对，不能推算为全团可订总价。覆盖与结果数量受服务额度限制；空结果不证明无航班。' };
  const token = getEnv('FLYAI_QUERY_TOKEN')?.trim();
  if (getEnv('FLYAI_QUERY_URL') !== 'http://flyai-query:8788' || !token) return base;
  try {
    const response = await request('http://flyai-query:8788/query', { method: 'POST', redirect: 'error',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ origin: query.origin, destination: query.destination, departureDate: query.departureDate, earliestHour: query.earliestHour }),
      signal: AbortSignal.timeout(40000) });
    if (response.status === 429) return { ...base, status: 'rate_limited' };
    if (!response.ok) throw new Error('query_failed');
    const payload = payloadSchema.parse(await response.json());
    const safeItems = payload.data.itemList.filter(item => {
      const segments = item.journeys[0].segments, first = segments[0], last = segments[segments.length - 1];
      return matches(query.origin, first.depCityCode, first.depCityName, first.depStationCode, first.depStationName)
        && matches(query.destination, last.arrCityCode, last.arrCityName, last.arrStationCode, last.arrStationName)
        && first.depDateTime.slice(0, 10) === query.departureDate
        && Number(first.depDateTime.slice(11, 13)) >= (query.earliestHour ?? 0)
        && segments.every((s, j) => j === 0 || (segments[j - 1].arrStationCode === s.depStationCode
          && Date.parse(airportStamp(s.depDateTime)) - Date.parse(airportStamp(segments[j - 1].arrDateTime)) >= 90 * 60000));
    });
    if (payload.data.itemList.length && !safeItems.length) throw new Error('no_valid_candidate');
    const offers = safeItems.map((item, i) => {
      const segments = item.journeys[0].segments;
      const first = segments[0], last = segments[segments.length - 1];
      if (!matches(query.origin, first.depCityCode, first.depCityName, first.depStationCode, first.depStationName)
        || !matches(query.destination, last.arrCityCode, last.arrCityName, last.arrStationCode, last.arrStationName)
        || first.depDateTime.slice(0, 10) !== query.departureDate
        || Number(first.depDateTime.slice(11, 13)) < (query.earliestHour ?? 0)) throw new Error('query_mismatch');
      for (let j = 0; j < segments.length; j++) {
        const s = segments[j];
        if (!(Date.parse(airportStamp(s.arrDateTime)) > Date.parse(airportStamp(s.depDateTime)))) throw new Error('invalid_time');
      }
      const url = new URL(item.jumpUrl);
      if (url.protocol !== 'https:' || !['router.feizhu.com', 'www.fliggy.com', 'h5.m.taobao.com'].includes(url.hostname)) throw new Error('invalid_link');
      return { id: `flyai-${i}`, pricePerAdult: Number(item.ticketPrice), currency: 'CNY', pricedAdults: 1,
        priceBasis: 'per_adult_quote_not_group_total', bookingUrl: item.jumpUrl, booked: false,
        itineraries: [{ segments: segments.map(s => ({
          from: s.depStationName, to: s.arrStationName, fromCode: s.depStationCode, toCode: s.arrStationCode,
          departure: airportStamp(s.depDateTime), arrival: airportStamp(s.arrDateTime),
          marketingCarrier: s.marketingTransportNo.slice(0, 2), flightNumber: s.marketingTransportNo.slice(2),
          airline: s.marketingTransportName, cabin: s.seatClassName,
        })) }], timeBasis: 'Domestic China airport-local timestamps, Asia/Shanghai (+08:00).' };
    });
    return { ...base, available: true, status: offers.length ? 'results' : 'empty', offers: offers.slice(0, 10),
      reliability: 'live_flight_snapshot', providerNotice: payload.systemMessage,
      limitation: base.limitation + (safeItems.length < payload.data.itemList.length ? ' 已排除日期/起终点不符、换机场或转机缓冲不足90分钟的候选；这不表示无航班。' : '')
        + (payload.systemMessage ? ` ${payload.systemMessage}` : '') };
  } catch {
    return { ...base, status: 'provider_error', reason: 'FlyAI 查询失败、超时或数据校验未通过；不能据此判断无航班、售罄或编造班次。' };
  }
}
