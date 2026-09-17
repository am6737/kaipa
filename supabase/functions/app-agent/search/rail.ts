import { z } from 'npm:zod@4.1.12';
import type { TransportQuery } from './transport.ts';

const reference = { title: '中国铁路12306官方查询', url: 'https://www.12306.cn/index/', source: '12306', snippet: 'Revalidate the timestamped rail snapshot on official 12306 before purchase.' };
const stamp = z.string().datetime({ offset: true });
const offer = z.object({
  trainNumber: z.string().regex(/^[A-Z0-9]{1,12}$/), from: z.string(), to: z.string(),
  fromCode: z.string().regex(/^[A-Z]{3}$/), toCode: z.string().regex(/^[A-Z]{3}$/),
  departure: stamp, arrival: stamp, durationMinutes: z.number().int().positive().max(10080),
  seats: z.array(z.object({ name: z.string().max(40), availability: z.string().max(20), pricePerAdult: z.number().nonnegative().nullable() })).max(20),
  currency: z.literal('CNY'), pricedAdults: z.literal(1), booked: z.literal(false),
});
const connectionOffer = z.object({
  kind: z.literal('rail_connection'), from: z.string(), to: z.string(), fromCode: z.string(), toCode: z.string(),
  departure: stamp, arrival: stamp, durationMinutes: z.number().int().positive().max(20160),
  segments: z.tuple([offer.extend({ trainId: z.string().min(1).max(30) }), offer.extend({ trainId: z.string().min(1).max(30) })]),
  connection: z.object({ arrivalStation: z.string(), departureStation: z.string(), arrivalCode: z.string(), departureCode: z.string(),
    waitMinutes: z.number().int().min(0).max(1440), minimumPlanningMinutes: z.literal(45), sameStation: z.boolean(), sameTrain: z.boolean(), overnightWait: z.boolean(),
    status: z.enum(['buffer_met', 'insufficient_buffer', 'station_change_unverified', 'same_train_split', 'overnight_unverified']), usableForPlanning: z.boolean(), guarantee: z.literal(false) }),
  currency: z.literal('CNY'), pricedAdults: z.literal(1), booked: z.literal(false), limitation: z.string().max(2000),
});
const payload = z.object({
  provider: z.literal('12306-mcp'), available: z.boolean(),
  status: z.enum(['results', 'empty', 'invalid_request', 'invalid_station', 'not_on_sale', 'provider_error', 'rate_limited', 'temporarily_unavailable']),
  retrievedAt: stamp, offers: z.array(z.union([connectionOffer, offer])).max(10), limitation: z.string().max(2000), cached: z.boolean().optional(),
}).refine(r => r.available === (r.status === 'results' || r.status === 'empty')
  && (r.status === 'results' ? r.offers.length > 0 : r.offers.length === 0));

export async function queryRail(query: TransportQuery, getEnv: (name: string) => string | undefined, request: typeof fetch) {
  const base = { query, results: [reference], offers: [] as unknown[], provider: '12306-mcp', available: false, retrievedAt: new Date().toISOString(),
    limitation: 'Read-only rail snapshot, not booking. Connection candidates require assessment; per-adult per-leg fares are not through fares. Official transfer access, delays and seats need revalidation.' };
  if (!getEnv('RAIL_QUERY_URL')) return { ...base, status: 'not_configured', reason: 'Rail read-only service is not configured. Continue with clearly unverified route estimates, not invented schedules.' };
  // A fixed internal destination prevents model-controlled URLs and credential redirects.
  if (getEnv('RAIL_QUERY_URL') !== 'http://rail-query:8787') return { ...base, status: 'provider_error', reason: 'Rail service configuration is invalid.' };
  try {
    const response = await request('http://rail-query:8787/query', { method: 'POST', redirect: 'error',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(query), signal: AbortSignal.timeout(60000) });
    if (!response.ok) throw new Error('rail_query_failed');
    const result = payload.parse(await response.json());
    for (const item of result.offers) {
      if (item.from !== query.origin || item.to !== query.destination || !item.departure.startsWith(`${query.departureDate}T`)
        || Number(item.departure.slice(11, 13)) < (query.earliestHour ?? 0)
        || !item.departure.endsWith('+08:00') || !item.arrival.endsWith('+08:00')
        || Date.parse(item.arrival) - Date.parse(item.departure) !== item.durationMinutes * 60000) throw new Error('rail_mismatch');
      if ('segments' in item) {
        const [a, b] = item.segments, c = item.connection;
        const sameStation = a.toCode === b.fromCode;
        const sameTrain = c.sameTrain || a.trainId === b.trainId || a.trainNumber === b.trainNumber;
        const wait = (Date.parse(b.departure) - Date.parse(a.arrival)) / 60000;
        const overnightWait = a.arrival.slice(0, 10) !== b.departure.slice(0, 10);
        const expected = sameTrain ? 'same_train_split' : !sameStation ? 'station_change_unverified' : overnightWait ? 'overnight_unverified' : wait < 45 ? 'insufficient_buffer' : 'buffer_met';
        if (!query.viaStation || a.to !== query.viaStation || a.from !== item.from || b.to !== item.to
          || a.fromCode !== item.fromCode || b.toCode !== item.toCode || a.departure !== item.departure || b.arrival !== item.arrival
          || c.arrivalStation !== a.to || c.departureStation !== b.from || c.arrivalCode !== a.toCode || c.departureCode !== b.fromCode
          || c.sameStation !== sameStation || c.sameTrain !== sameTrain || c.waitMinutes !== wait || c.overnightWait !== overnightWait
          || c.status !== expected || c.usableForPlanning !== (expected === 'buffer_met')
          || (sameStation && a.to !== b.from)) throw new Error('connection_mismatch');
        for (const leg of [a, b]) {
          if (!leg.departure.endsWith('+08:00') || !leg.arrival.endsWith('+08:00')
            || Date.parse(leg.arrival) - Date.parse(leg.departure) !== leg.durationMinutes * 60000) throw new Error('connection_time_mismatch');
        }
      } else if (query.viaStation) throw new Error('connection_missing');
    }
    return { ...base, ...result, reliability: result.available ? 'live_rail_snapshot' : undefined,
      reason: result.available ? undefined : 'No verified offer returned. not_on_sale means the initial or onward boarding date is outside the 15-day inclusive Shanghai calendar window, not sold out. invalid_station needs exact station names, not silent substitution. For rate_limited/temporarily_unavailable/provider_error do not retry in a loop or bypass upstream restrictions; continue with explicitly unverified planning.' };
  } catch {
    return { ...base, status: 'provider_error', reason: 'Rail query failed, timed out or returned invalid data. Do not infer sold out, invent trains, retry repeatedly or substitute community timetables.' };
  }
}
