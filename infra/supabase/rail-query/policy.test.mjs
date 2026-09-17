import test from 'node:test';
import assert from 'node:assert/strict';
import { validateQuery, decode, stationCode, normalize } from './policy.mjs';
const q = { origin: '南宁东', destination: '桂林北', adults: 2, departureDate: '2026-09-11', earliestHour: 0 };
const now = new Date('2026-09-08T16:00:00Z');
test('Shanghai dates, real calendar, inclusive 15-day window and bounded arguments', () => {
  assert.deepEqual(validateQuery(q, now), q);
  validateQuery({ ...q, departureDate: '2026-09-23' }, now);
  for (const departureDate of ['2026-09-08', '2027-02-30', '2026-9-11']) assert.throws(() => validateQuery({ ...q, departureDate }, now), /invalid_request/);
  assert.throws(() => validateQuery({ ...q, departureDate: '2026-09-24' }, now), /not_on_sale/);
  for (const value of [{ origin: '南宁东|桂林' }, { earliestHour: 24 }, { adults: 0 }, { destination: q.origin }]) assert.throws(() => validateQuery({ ...q, ...value }, now), /invalid_request/);
});
test('MCP envelope success is not data success; station names must match exactly', () => {
  for (const result of [{ isError: true }, { content: [{ type: 'text', text: 'Error: Station not found' }] }, {}]) assert.throws(() => decode(result), /provider_error/);
  assert.throws(() => stationCode({}, '南宁东'), /invalid_station/);
  assert.throws(() => stationCode({ 南宁东: { station_name: '南宁', station_code: 'NFZ' } }, '南宁东'), /provider_error/);
});
const row = { start_train_code: 'G2340', from_station: '南宁东', to_station: '桂林北', from_station_telecode: 'NFZ', to_station_telecode: 'GBZ',
  start_date: '2026-09-10', start_time: '23:25', arrive_time: '01:44', lishi: '02:19', prices: [{ seat_name: '二等座', num: '--', price: 121.5 }] };
test('exact station filtering precedes limit, boarding date normalizes overnight and fares stay per adult', () => {
  const rows = [...Array.from({ length: 12 }, () => ({ ...row, to_station: '桂林', to_station_telecode: 'GLZ' })), row];
  const offers = normalize(rows, q, 'NFZ', 'GBZ');
  assert.equal(offers.length, 1);
  assert.equal(offers[0].departure, '2026-09-11T23:25:00+08:00');
  assert.equal(offers[0].arrival, '2026-09-12T01:44:00+08:00');
  assert.equal(offers[0].pricedAdults, 1);
  assert.equal(offers[0].seats[0].availability, '--');
  assert.equal(normalize([{ ...row, start_time: '06:25', arrive_time: '08:44' }], { ...q, earliestHour: 18 }, 'NFZ', 'GBZ').length, 0);
});
test('malformed, inconsistent or interline data fail closed', () => {
  for (const rows of [{ error: 'bad' }, [{ same_train: true, ticketList: [row] }], [{ ...row, arrive_time: '02:00' }], [{ ...row, prices: [{}] }]]) {
    assert.throws(() => normalize(rows, q, 'NFZ', 'GBZ'), /provider_error/);
  }
});
