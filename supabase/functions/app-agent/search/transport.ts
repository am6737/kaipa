import { z } from 'npm:zod@4.1.12';
import { queryRail } from './rail.ts';

export type TransportQuery = {
  mode: 'rail' | 'flight';
  origin: string;
  destination: string;
  departureDate: string;
  adults: number;
  earliestHour?: number | null;
  viaStation?: string | null;
};
type EnvGetter = (name: string) => string | undefined;

// Fixed provider URLs: neither the model nor user input can redirect credentials.
const baseUrl = 'https://api.amadeus.com';
const railReference = { title: '中国铁路12306官方查询', url: 'https://www.12306.cn/index/', source: '12306', snippet: 'Official manual lookup only; this link is not a dated timetable or ticket availability result.' };
const endpointSchema = z.object({ iataCode: z.string().regex(/^[A-Z]{3}$/), at: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/) });
const offersSchema = z.object({ data: z.array(z.object({
  id: z.string(),
  price: z.object({ total: z.string().regex(/^\d+(?:\.\d+)?$/), currency: z.string().regex(/^[A-Z]{3}$/) }),
  itineraries: z.array(z.object({ duration: z.string(), segments: z.array(z.object({
    departure: endpointSchema, arrival: endpointSchema, carrierCode: z.string(), number: z.string(),
    operating: z.object({ carrierCode: z.string() }).optional(),
  })).min(1) })).min(1),
})) });

export async function queryTransport(query: TransportQuery, getEnv: EnvGetter, request: typeof fetch = fetch) {
  const common = { query, retrievedAt: new Date().toISOString(), results: query.mode === 'rail' ? [railReference] : [], offers: [] as unknown[],
    limitation: 'No booking is made. Missing results do not prove that no service exists. Prices and seats require revalidation before purchase.' };
  if (query.mode === 'rail') return queryRail(query, getEnv, request);
  const key = getEnv('AMADEUS_CLIENT_ID')?.trim(), secret = getEnv('AMADEUS_CLIENT_SECRET')?.trim();
  if (!key || !secret || getEnv('AMADEUS_ENVIRONMENT') !== 'production') return { ...common, available: false, status: 'not_configured', provider: 'amadeus',
    reason: 'Production flight-offer access is not configured. Test data must not be presented as real flight availability. Continue comparing flight vs rail at route level without inventing flights or prices.' };
  if (!/^[A-Z]{3}$/.test(query.origin) || !/^[A-Z]{3}$/.test(query.destination)) return { ...common, available: false, status: 'invalid_request', provider: 'amadeus',
    reason: 'Flight search needs verified IATA city/airport codes. Resolve appropriate airports through reliable sources; do not ask the traveler to supply technical codes.' };
  const signal = AbortSignal.timeout(15000);
  try {
    const auth = await request(`${baseUrl}/v1/security/oauth2/token`, {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'client_credentials', client_id: key, client_secret: secret }), signal,
    });
    if (!auth.ok) throw new Error('provider_auth');
    const token = z.object({ access_token: z.string().min(1) }).parse(await auth.json());
    const params = new URLSearchParams({ originLocationCode: query.origin, destinationLocationCode: query.destination,
      departureDate: query.departureDate, adults: String(query.adults), currencyCode: 'CNY', max: '5' });
    const response = await request(`${baseUrl}/v2/shopping/flight-offers?${params}`, { headers: { Authorization: `Bearer ${token.access_token}` }, signal });
    if (!response.ok) throw new Error('provider_search');
    const payload = offersSchema.parse(await response.json());
    const offers = payload.data.slice(0, 5).map(offer => {
      const itineraries = offer.itineraries.map(itinerary => ({ duration: itinerary.duration,
        segments: itinerary.segments.map(segment => ({
          from: segment.departure?.iataCode, departure: segment.departure?.at,
          to: segment.arrival?.iataCode, arrival: segment.arrival?.at,
          marketingCarrier: segment.carrierCode, flightNumber: segment.number, operatingCarrier: segment.operating?.carrierCode,
        })),
      }));
      return { id: offer.id, totalPrice: offer.price.total, currency: offer.price.currency, pricedAdults: query.adults,
        itineraries, timeBasis: 'Airport-local timestamps as returned by the provider; do not assume UTC.', booked: false };
    });
    return { ...common, offers, available: true, status: offers.length ? 'results' : 'empty', provider: 'amadeus',
      reliability: 'live_offer', limitation: `${common.limitation} Coverage depends on the provider and account; this is not a complete inventory of Chinese airlines.` };
  } catch {
    return { ...common, available: false, status: 'provider_error', provider: 'amadeus',
      reason: 'Flight provider authentication, query or response failed or timed out. No availability conclusion can be drawn; do not substitute community data.' };
  }
}
