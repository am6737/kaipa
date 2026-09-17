import assert from 'node:assert/strict';

// Run inside the private sidecar: docker exec -i kaipa-rail-query node --input-type=module < scripts/test-rail-query-live.mjs
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const date = days => new Date(Date.parse(`${today}T00:00:00Z`) + days * 86400000).toISOString().slice(0, 10);
const query = { origin: '南宁东', destination: '桂林北', departureDate: date(2), adults: 2 };
const call = async q => {
  const response = await fetch('http://localhost:8787/query', { method: 'POST', body: JSON.stringify(q), signal: AbortSignal.timeout(60000) });
  assert.equal(response.status, 200);
  return response.json();
};
const future = await call({ ...query, departureDate: date(40) });
assert.equal(future.status, 'not_on_sale');
const invalid = await call({ ...query, departureDate: '2027-02-30' });
assert.equal(invalid.status, 'invalid_request');
// Concurrent requests exercise bounded serialization, not parallel upstream calls.
const outboundPromise = call(query);
const inboundPromise = call({ ...query, origin: '阳朔', destination: '南宁东', earliestHour: 18 });
const outbound = await outboundPromise, inbound = await inboundPromise;
assert.equal(outbound.status, 'results');
assert.equal(inbound.status, 'results');
assert.ok(outbound.offers.every(r => r.fromCode === 'NFZ' && r.toCode === 'GBZ' && r.pricedAdults === 1));
assert.ok(inbound.offers.every(r => r.fromCode === 'YCZ' && r.toCode === 'NFZ' && Number(r.departure.slice(11, 13)) >= 18));
const cached = await call(query);
assert.equal(cached.cached, true);
assert.equal(cached.retrievedAt, outbound.retrievedAt);
assert.deepEqual(cached.offers, outbound.offers);
const unsupported = await fetch('http://localhost:8787/tools/call', { method: 'POST', body: '{}' });
assert.equal(unsupported.status, 404);
console.log(JSON.stringify({ passed: true, date: date(2), outboundCount: outbound.offers.length, inboundCount: inbound.offers.length,
  retrievedAt: outbound.retrievedAt, cached: cached.cached, future: future.status, invalid: invalid.status, arbitraryToolStatus: unsupported.status }));
