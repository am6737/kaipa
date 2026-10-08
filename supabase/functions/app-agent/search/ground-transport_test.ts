import { queryGroundTransport } from './ground-transport.ts';
function assert(value: unknown): asserts value { if (!value) throw new Error('Assertion failed'); }
const query = { origin: '成都', destination: '党岭村' };

Deno.test('AMap ground query geocodes both ends and exposes only road estimates', async () => {
  const calls: string[] = [];
  const result = await queryGroundTransport(query, () => 'private-key', async input => {
    const url = new URL(String(input)); calls.push(url.pathname);
    assert(url.hostname === 'restapi.amap.com');
    if (url.pathname.includes('geocode')) return Response.json({ status: '1', geocodes: [{ location: '104.1,30.5' }] });
    assert(url.searchParams.get('origin') === '104.1,30.5' && url.searchParams.get('destination') === '104.1,30.5');
    return Response.json({ status: '1', route: { paths: [{ distance: '320000', duration: '25200', tolls: '120' }] } });
  });
  assert(calls.length === 3 && result.available && result.distanceKm === 320 && result.durationMinutes === 420 && result.tollsCny === 120);
  assert(!JSON.stringify(result).includes('private-key'));
});

Deno.test('missing key, ambiguous location, missing routes and provider errors remain distinct', async () => {
  assert((await queryGroundTransport(query, () => undefined, () => { throw new Error('must not fetch'); })).status === 'not_configured');
  assert((await queryGroundTransport(query, () => 'key', async () => Response.json({ status: '1', geocodes: [{ location: '104,30' }, { location: '105,30' }] }))).status === 'ambiguous_location');
  const empty = await queryGroundTransport(query, () => 'key', async input => Response.json(String(input).includes('geocode')
    ? { status: '1', geocodes: [{ location: '104,30' }] } : { status: '1', route: { paths: [] } }));
  assert(!empty.available && empty.status === 'empty');
  const failed = await queryGroundTransport(query, () => 'key', async () => new Response('private-secret', { status: 500 }));
  assert(failed.status === 'provider_error' && !JSON.stringify(failed).includes('private-secret'));
});
