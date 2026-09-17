import { QueryError, normalize, validateQuery } from './policy.mjs';

// A planning floor, not an official station minimum connection time or guarantee.
export const MIN_TRANSFER_MINUTES = 45;
function fail() { throw new QueryError('provider_error'); }
function duration(value) {
  const match = typeof value === 'string' && /^(\d{1,3}):([0-5]?\d)$/.exec(value);
  if (!match) return fail();
  return Number(match[1]) * 60 + Number(match[2]);
}
function waitMinutes(value) {
  const match = typeof value === 'string' && /^(?:(\d{1,3})小时)?(?:(\d{1,3})分钟)?$/.exec(value);
  if (!match || (!match[1] && !match[2])) return fail();
  return Number(match[1] || 0) * 60 + Number(match[2] || 0);
}
export function normalizeConnections(rows, q, from, to, via, now = new Date()) {
  if (!Array.isArray(rows) || rows.length > 100) return fail();
  const candidates = [];
  for (const row of rows) {
    if (!row || !Array.isArray(row.ticketList) || row.ticketList.length !== 2 || row.train_count !== 2
      || typeof row.same_train !== 'boolean' || typeof row.same_station !== 'boolean') return fail();
    const [a, b] = row.ticketList;
    for (const leg of [a, b]) {
      if (!leg || !/^[A-Z]{3}$/.test(leg.from_station_telecode) || !/^[A-Z]{3}$/.test(leg.to_station_telecode)
        || typeof leg.from_station !== 'string' || typeof leg.to_station !== 'string'
        || !/^[A-Za-z0-9]{1,30}$/.test(leg.train_no)) return fail();
    }
    if (a.from_station_telecode !== from || b.to_station_telecode !== to || a.to_station_telecode !== via) continue;
    if (a.from_station !== q.origin || b.to_station !== q.destination || a.to_station !== q.viaStation
      || row.from_station_code !== from || row.end_station_code !== to || row.middle_station_code !== via
      || row.from_station_name !== q.origin || row.end_station_name !== q.destination || row.middle_station_name !== q.viaStation
      || row.first_train_no !== a.train_no || row.second_train_no !== b.train_no) return fail();
    const sameStation = a.to_station_telecode === b.from_station_telecode;
    if (sameStation !== row.same_station || (sameStation && a.to_station !== b.from_station)) return fail();
    const first = normalize([a], { ...q, destination: a.to_station, earliestHour: 0 }, from, via)[0];
    if (!first) return fail();
    const wait = waitMinutes(row.wait_time);
    if (wait < 0 || wait > 1440) return fail();
    const secondDeparture = Date.parse(first.arrival) + wait * 60000;
    const secondLocal = new Date(secondDeparture + 8 * 3600000).toISOString();
    if (secondLocal.slice(11, 16) !== b.start_time) return fail();
    const secondDate = secondLocal.slice(0, 10);
    validateQuery({ origin: b.from_station, destination: q.destination, departureDate: secondDate, adults: q.adults }, now);
    const second = normalize([b], { ...q, origin: b.from_station, departureDate: secondDate, earliestHour: 0 }, b.from_station_telecode, to)[0];
    if (!second || row.start_time !== a.start_time || row.arrive_time !== b.arrive_time
      || duration(row.lishi) !== first.durationMinutes + wait + second.durationMinutes
      || row.start_date !== q.departureDate || row.middle_date !== secondDate || row.arrive_date !== second.arrival.slice(0, 10)) return fail();
    // Provider flags are not sufficient: train identity catches renumbered trains.
    const sameTrain = row.same_train || a.train_no === b.train_no || a.start_train_code === b.start_train_code;
    const overnightWait = first.arrival.slice(0, 10) !== second.departure.slice(0, 10);
    const status = sameTrain ? 'same_train_split' : !sameStation ? 'station_change_unverified'
      : overnightWait ? 'overnight_unverified' : wait < MIN_TRANSFER_MINUTES ? 'insufficient_buffer' : 'buffer_met';
    candidates.push({ kind: 'rail_connection', from: q.origin, to: q.destination, fromCode: from, toCode: to,
      departure: first.departure, arrival: second.arrival, durationMinutes: first.durationMinutes + wait + second.durationMinutes,
      segments: [{ ...first, trainId: a.train_no }, { ...second, trainId: b.train_no }],
      connection: { arrivalStation: a.to_station, departureStation: b.from_station, arrivalCode: via, departureCode: b.from_station_telecode,
        waitMinutes: wait, minimumPlanningMinutes: MIN_TRANSFER_MINUTES, sameStation, sameTrain, overnightWait,
        status, usableForPlanning: status === 'buffer_met', guarantee: false },
      currency: 'CNY', pricedAdults: 1, booked: false,
      limitation: 'Two separately priced seat snapshots, not a through fare or protected connection. buffer_met checks time only, not official station transfer access, delay risk or ticket availability. Recheck both legs, seat continuity and station transfer rules. Cross-station and same-train splits are not approved transfers.' });
  }
  return candidates.filter(c => Number(c.departure.slice(11, 13)) >= q.earliestHour)
    .sort((a, b) => Number(b.connection.usableForPlanning) - Number(a.connection.usableForPlanning) || a.departure.localeCompare(b.departure)).slice(0, 10);
}
