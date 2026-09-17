import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeConnections } from './connections.mjs';
import { validateQuery } from './policy.mjs';
const q = { origin: '阳朔', destination: '南宁东', viaStation: '桂林北', departureDate: '2026-09-11', adults: 2, earliestHour: 0 };
function fixture(wait = 45, overnight = false) {
  const firstStart = overnight ? '23:00' : '10:00';
  const secondMs = Date.parse(`${q.departureDate}T${firstStart}:00Z`) + (60 + wait) * 60000;
  const secondStart = new Date(secondMs).toISOString(), end = new Date(secondMs + 120 * 60000).toISOString();
  const seats = [{ seat_name: '二等座', num: '有', price: 100 }];
  return { train_count: 2, same_train: false, same_station: true, wait_time: `${wait}分钟`, lishi: `${Math.floor((180 + wait) / 60)}:${(180 + wait) % 60}`,
    start_time: firstStart, arrive_time: end.slice(11, 16), start_date: q.departureDate, middle_date: secondStart.slice(0, 10), arrive_date: end.slice(0, 10),
    from_station_code: 'YCZ', from_station_name: '阳朔', middle_station_code: 'GBZ', middle_station_name: '桂林北', end_station_code: 'NFZ', end_station_name: '南宁东',
    first_train_no: 'A111', second_train_no: 'B222', ticketList: [
      { train_no: 'A111', start_train_code: 'D1', start_time: firstStart, arrive_time: overnight ? '00:00' : '11:00', lishi: '01:00',
        from_station: '阳朔', to_station: '桂林北', from_station_telecode: 'YCZ', to_station_telecode: 'GBZ', prices: seats },
      { train_no: 'B222', start_train_code: 'G2', start_time: secondStart.slice(11, 16), arrive_time: end.slice(11, 16), lishi: '02:00',
        from_station: '桂林北', to_station: '南宁东', from_station_telecode: 'GBZ', to_station_telecode: 'NFZ', prices: seats },
    ] };
}
const now = new Date('2026-09-09T00:00:00Z');
const run = rows => normalizeConnections(rows, q, 'YCZ', 'NFZ', 'GBZ', now);
test('exact via-station input and direct cache identity remain distinct', () => {
  const now = new Date('2026-09-09T00:00:00Z');
  assert.equal(validateQuery(q, now).viaStation, '桂林北');
  for (const viaStation of ['', '桂林|桂林北', '阳朔', '南宁东']) assert.throws(() => validateQuery({ ...q, viaStation }, now), /invalid_request/);
});
test('45-minute floor is time-only, with separate per-adult fares and no guarantees', () => {
  const [r] = run([fixture()]);
  assert.equal(r.connection.status, 'buffer_met');
  assert.equal(r.connection.usableForPlanning, true);
  assert.equal(r.connection.guarantee, false);
  assert.equal(r.segments.length, 2);
  assert.equal(r.totalPrice, undefined);
  assert.equal(r.segments[1].pricedAdults, 1);
  assert.equal(run([fixture(44)])[0].connection.status, 'insufficient_buffer');
});
test('renumbered same-train tickets never become short transfers, even if provider flag is false', () => {
  const row = fixture(4);
  row.second_train_no = row.first_train_no;
  row.ticketList[1].train_no = row.first_train_no;
  const [r] = run([row]);
  assert.equal(r.connection.status, 'same_train_split');
  assert.equal(r.connection.usableForPlanning, false);
});
test('cross-station ground travel is not approved by a large time gap', () => {
  const row = fixture(120);
  row.same_station = false;
  row.ticketList[1].from_station = '桂林';
  row.ticketList[1].from_station_telecode = 'GLZ';
  const [r] = run([row]);
  assert.equal(r.connection.status, 'station_change_unverified');
  assert.equal(r.connection.departureStation, '桂林');
  assert.equal(r.connection.usableForPlanning, false);
});
test('overnight departure is derived and cross-checked against provider dates and duration', () => {
  const [r] = run([fixture(45, true)]);
  assert.equal(r.segments[1].departure, '2026-09-12T00:45:00+08:00');
  assert.equal(r.arrival, '2026-09-12T02:45:00+08:00');
  for (const change of [{ middle_date: '2026-09-11' }, { arrive_date: '2026-09-13' }, { lishi: '04:45' }, { wait_time: 'unknown' }, { same_station: false }]) {
    assert.throws(() => run([{ ...fixture(45, true), ...change }]), /provider_error/);
  }
});
test('exact station filtering and usable candidate ranking precede cap; earliest hour still applies', () => {
  const wrong = fixture(); wrong.ticketList[0].to_station_telecode = 'GLZ';
  assert.equal(run([wrong]).length, 0);
  const rows = [...Array.from({ length: 12 }, () => fixture(4)), fixture(60)];
  assert.equal(run(rows).length, 10);
  assert.equal(run(rows)[0].connection.status, 'buffer_met');
  assert.equal(normalizeConnections([fixture()], { ...q, earliestHour: 18 }, 'YCZ', 'NFZ', 'GBZ', now).length, 0);
});
test('overnight onward boarding beyond the sale window is not sold-out inventory', () => {
  assert.throws(() => normalizeConnections([fixture(45, true)], q, 'YCZ', 'NFZ', 'GBZ', new Date('2026-08-27T16:00:00Z')), /not_on_sale/);
});
test('overnight station wait requires a separate station-access and rest plan', () => {
  const [r] = run([fixture(900)]);
  assert.equal(r.connection.overnightWait, true);
  assert.equal(r.connection.status, 'overnight_unverified');
  assert.equal(r.connection.usableForPlanning, false);
});
