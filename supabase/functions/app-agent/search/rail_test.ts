import { queryTransport, type TransportQuery } from './transport.ts';
function assert(value: unknown): asserts value { if (!value) throw new Error('Assertion failed'); }
const q: TransportQuery = { mode: 'rail', origin: '南宁东', destination: '桂林北', departureDate: '2026-09-11', adults: 2, earliestHour: 18 };
const env = (key: string) => key === 'RAIL_QUERY_URL' ? 'http://rail-query:8787' : undefined;
const item = { trainNumber: 'G2340', from: q.origin, to: q.destination, fromCode: 'NFZ', toCode: 'GBZ',
  departure: '2026-09-11T23:25:00+08:00', arrival: '2026-09-12T01:44:00+08:00', durationMinutes: 139,
  seats: [{ name: '二等座', availability: '有', pricePerAdult: 121.5 }], currency: 'CNY', pricedAdults: 1, booked: false };
const result = { provider: '12306-mcp', available: true, status: 'results', retrievedAt: new Date().toISOString(), offers: [item], limitation: 'Snapshot', cached: false };
Deno.test('rail uses fixed private endpoint and validates timestamped per-adult offers', async () => {
  const r = await queryTransport(q, env, async (url, init) => {
    assert(String(url) === 'http://rail-query:8787/query');
    const options = init as { redirect?: string; signal?: unknown; body?: unknown };
    assert(options.redirect === 'error' && options.signal);
    assert(JSON.parse(String(options.body)).earliestHour === 18);
    return Response.json(result);
  });
  assert(r.status === 'results' && r.available && r.offers.length === 1);
  assert((r.offers[0] as typeof item).pricedAdults === 1);
});
Deno.test('rail rejects wrong stations, dates, duration and success envelopes with errors', async () => {
  for (const payload of [{ ...result, offers: [{ ...item, to: '桂林' }] },
    { ...result, offers: [{ ...item, departure: '2026-09-10T23:25:00+08:00' }] },
    { ...result, offers: [{ ...item, durationMinutes: 5 }] },
    { ...result, available: false }, { content: [{ text: 'Error: failed' }] }]) {
    const r = await queryTransport(q, env, async () => Response.json(payload));
    assert(r.status === 'provider_error' && !r.available && !r.offers.length);
  }
});
Deno.test('rail preserves guarded statuses; bad configuration and failures never leak details', async () => {
  for (const status of ['not_on_sale', 'invalid_station', 'rate_limited', 'temporarily_unavailable', 'provider_error']) {
    const r = await queryTransport(q, env, async () => Response.json({ ...result, status, available: false, offers: [] }));
    assert(r.status === status && !r.available);
  }
  const r = await queryTransport(q, () => 'https://attacker.invalid', () => { throw new Error('must not fetch'); });
  assert(r.status === 'provider_error');
  const failed = await queryTransport(q, env, async () => new Response('private-secret', { status: 500 }));
  assert(failed.status === 'provider_error' && !JSON.stringify(failed).includes('private-secret'));
});
const transferQuery = { ...q, origin: '阳朔', destination: '南宁东', viaStation: '桂林北' };
const first = { ...item, trainId: 'A1', trainNumber: 'D1', from: '阳朔', fromCode: 'YCZ', to: '桂林北', toCode: 'GBZ',
  departure: '2026-09-11T18:00:00+08:00', arrival: '2026-09-11T19:00:00+08:00', durationMinutes: 60 };
const second = { ...item, trainId: 'B2', trainNumber: 'G2', from: '桂林北', fromCode: 'GBZ', to: '南宁东', toCode: 'NFZ',
  departure: '2026-09-11T19:45:00+08:00', arrival: '2026-09-11T21:45:00+08:00', durationMinutes: 120 };
const candidate = { kind: 'rail_connection', from: '阳朔', fromCode: 'YCZ', to: '南宁东', toCode: 'NFZ',
  departure: first.departure, arrival: second.arrival, durationMinutes: 225, segments: [first, second],
  connection: { arrivalStation: '桂林北', departureStation: '桂林北', arrivalCode: 'GBZ', departureCode: 'GBZ', waitMinutes: 45,
    minimumPlanningMinutes: 45, sameStation: true, sameTrain: false, overnightWait: false, status: 'buffer_met', usableForPlanning: true, guarantee: false },
  currency: 'CNY', pricedAdults: 1, booked: false, limitation: 'Per leg; no guarantees' };
Deno.test('rail connection contract preserves per-leg evidence and time-only assessment', async () => {
  const r = await queryTransport(transferQuery, env, async () => Response.json({ ...result, offers: [candidate] }));
  assert(r.status === 'results');
  const c = r.offers[0] as typeof candidate;
  assert(c.connection.status === 'buffer_met' && c.segments[1].trainId === 'B2' && !c.connection.guarantee);
});
Deno.test('connection adapter independently rejects unsafe approvals, wrong hubs, broken continuity and direct substitutions', async () => {
  for (const bad of [
    { ...candidate, connection: { ...candidate.connection, waitMinutes: 44 } },
    { ...candidate, connection: { ...candidate.connection, sameTrain: true } },
    { ...candidate, connection: { ...candidate.connection, usableForPlanning: false } },
    { ...candidate, segments: [first, { ...second, trainId: first.trainId }] },
    { ...candidate, segments: [first, { ...second, fromCode: 'GLZ', from: '桂林' }] },
    { ...candidate, segments: [first, { ...second, arrival: '2026-09-12T21:45:00+08:00' }] },
    item,
  ]) {
    const r = await queryTransport(transferQuery, env, async () => Response.json({ ...result, offers: [bad] }));
    assert(r.status === 'provider_error' && !r.offers.length);
  }
  const wrongHub = await queryTransport({ ...transferQuery, viaStation: '桂林' }, env, async () => Response.json({ ...result, offers: [candidate] }));
  assert(wrongHub.status === 'provider_error');
});
Deno.test('same-train split remains visible but explicitly unusable', async () => {
  const split = { ...candidate, segments: [first, { ...second, trainId: first.trainId }],
    connection: { ...candidate.connection, sameTrain: true, status: 'same_train_split', usableForPlanning: false } };
  const r = await queryTransport(transferQuery, env, async () => Response.json({ ...result, offers: [split] }));
  assert(r.status === 'results' && !(r.offers[0] as typeof candidate).connection.usableForPlanning);
});
