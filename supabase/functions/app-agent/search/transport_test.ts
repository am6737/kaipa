import { queryTransport, type TransportQuery } from './transport.ts';
import { searchPurpose } from './routing.ts';
import { createTravelSearchProviders } from './registry.ts';
import { createTavilyProvider } from './providers/tavily.ts';

function assert(value: unknown, message = 'Assertion failed'): asserts value { if (!value) throw new Error(message); }
const query: TransportQuery = { mode: 'flight', origin: 'NNG', destination: 'KWL', departureDate: '2026-10-15', adults: 2 };
const env = (name: string) => ({ AMADEUS_CLIENT_ID: 'private-key', AMADEUS_CLIENT_SECRET: 'private-secret', AMADEUS_ENVIRONMENT: 'production' })[name];
const neverFetch: typeof fetch = () => { throw new Error('Unexpected network call'); };

Deno.test('rail and unconfigured/test aviation never scrape or return pretend inventory', async () => {
  const rail = await queryTransport({ ...query, mode: 'rail', origin: '南宁东', destination: '桂林北' }, env, neverFetch);
  assert(!rail.available && rail.status === 'not_configured' && !rail.offers.length);
  assert(rail.results[0].url === 'https://www.12306.cn/index/');
  for (const getEnv of [() => undefined, (name: string) => name === 'AMADEUS_ENVIRONMENT' ? 'test' : env(name)]) {
    const result = await queryTransport(query, getEnv, neverFetch);
    assert(!result.available && result.status === 'not_configured');
  }
  const invalid = await queryTransport({ ...query, origin: '南宁' }, env, neverFetch);
  assert(invalid.status === 'invalid_request');
});

Deno.test('production adapter uses documented authentication, dated offers and group price', async () => {
  const calls: string[] = [];
  const request: typeof fetch = async (url, init) => {
    const options = init as { body?: unknown; headers?: HeadersInit };
    calls.push(String(url));
    if (calls.length === 1) {
      assert(String(url) === 'https://api.amadeus.com/v1/security/oauth2/token');
      assert(options.body instanceof URLSearchParams && options.body.get('grant_type') === 'client_credentials');
      return Response.json({ access_token: 'private-token' });
    }
    const params = new URL(String(url)).searchParams;
    assert(params.get('adults') === '2' && params.get('departureDate') === '2026-10-15');
    assert(params.get('originLocationCode') === 'NNG' && params.get('destinationLocationCode') === 'KWL');
    assert(new Headers(options.headers).get('Authorization') === 'Bearer private-token');
    return Response.json({ data: [{ id: '1', price: { total: '1200.00', currency: 'CNY' },
      itineraries: [{ duration: 'PT1H', segments: [{ departure: { iataCode: 'NNG', at: '2026-10-15T06:00:00' },
        arrival: { iataCode: 'KWL', at: '2026-10-15T07:00:00' }, carrierCode: 'XX', number: '123' }] }] }] });
  };
  const result = await queryTransport(query, env, request);
  assert(result.status === 'results' && result.offers.length === 1 && calls.length === 2);
  const offer = result.offers[0] as { totalPrice: string; pricedAdults: number };
  assert(offer.totalPrice === '1200.00' && offer.pricedAdults === 2);
  assert(!JSON.stringify(result).includes('private-'), 'Credentials leaked');
});

Deno.test('empty inventory, provider errors and malformed data remain distinct', async () => {
  for (const [payload, expected] of [[{ data: [] }, 'empty'], [{ data: [{}] }, 'provider_error'], [{ errors: [] }, 'provider_error']] as const) {
    let n = 0;
    const result = await queryTransport(query, env, async () => ++n === 1 ? Response.json({ access_token: 'secret' }) : Response.json(payload));
    assert(result.status === expected);
  }
  const result = await queryTransport(query, env, async () => new Response('private-secret', { status: 401 }));
  assert(result.status === 'provider_error' && !JSON.stringify(result).includes('private-secret'));
});

Deno.test('transport routing excludes community even for old calls and guide override', () => {
  for (const text of ['南宁东 桂林北 高铁 时刻 12306', '兴坪汽车站到阳朔站接驳', 'flight NNG KWL', '杨堤拼车多少钱']) {
    assert(searchPurpose(text) === 'transport');
    assert(searchPurpose(text, 'guide') === 'transport');
  }
  assert(searchPurpose('漓江徒步风景') === 'guide');
  const getEnv = (name: string) => name === 'TRAVEL_SEARCH_SOURCES' ? 'xhs,douyin' : undefined;
  assert(createTravelSearchProviders(getEnv, 'transport').map(p => p.source).join() === 'tavily');
  assert(createTravelSearchProviders(getEnv).map(p => p.source).join() === 'xhs,douyin');
});

Deno.test('transport web references filter community URLs but never become live quotes', async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async (_url, init) => {
      assert(JSON.parse(String((init as { body?: unknown }).body)).exclude_domains.includes('xiaohongshu.com'));
      return Response.json({ results: [{ title: 'Post', url: 'https://www.xiaohongshu.com/explore/1' },
        { title: 'Operator notice', url: 'https://www.12306.cn/notice' }] });
    };
    const result = await createTavilyProvider('key', true).search('高铁', new AbortController().signal);
    assert(result.results.length === 1 && result.results[0].reliability === 'web');
  } finally { globalThis.fetch = original; }
});
