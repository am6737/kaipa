export class QueryError extends Error {
  constructor(status) { super(status); this.status = status; }
}
export function validateQuery(q, now = new Date()) {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  if (!q || !/^\d{4}-\d{2}-\d{2}$/.test(q.departureDate)) throw new QueryError('invalid_request');
  const date = Date.parse(`${q.departureDate}T00:00:00Z`);
  if (!Number.isFinite(date) || new Date(date).toISOString().slice(0, 10) !== q.departureDate) throw new QueryError('invalid_request');
  const days = (date - Date.parse(`${today}T00:00:00Z`)) / 86400000;
  if (days < 0) throw new QueryError('invalid_request');
  if (days > 14) throw new QueryError('not_on_sale');
  for (const value of [q.origin, q.destination, ...(q.viaStation != null ? [q.viaStation] : [])]) {
    if (typeof value !== 'string' || !/^[\p{L}\p{N} ()-]{1,40}$/u.test(value)) throw new QueryError('invalid_request');
  }
  if (q.origin === q.destination || !Number.isInteger(q.adults) || q.adults < 1 || q.adults > 9) throw new QueryError('invalid_request');
  const earliestHour = q.earliestHour ?? 0;
  if (!Number.isInteger(earliestHour) || earliestHour < 0 || earliestHour > 23) throw new QueryError('invalid_request');
  if (q.viaStation === q.origin || q.viaStation === q.destination) throw new QueryError('invalid_request');
  return { origin: q.origin, destination: q.destination, departureDate: q.departureDate, adults: q.adults, earliestHour,
    ...(q.viaStation != null ? { viaStation: q.viaStation } : {}) };
}
export function decode(result) {
  if (result?.isError) throw new QueryError('provider_error');
  try { return JSON.parse(result.content.filter(p => p.type === 'text').map(p => p.text).join('\n')); }
  catch { throw new QueryError('provider_error'); }
}
export function stationCode(data, name) {
  const station = data?.[name];
  if (!station) throw new QueryError('invalid_station');
  if (station.station_name !== name || !/^[A-Z]{3}$/.test(station.station_code)) throw new QueryError('provider_error');
  return station.station_code;
}
export function normalize(rows, q, from, to) {
  if (!Array.isArray(rows) || rows.length > 5000) throw new QueryError('provider_error');
  const clock = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
  return rows.map(r => {
    if (!r || typeof r.from_station_telecode !== 'string' || typeof r.to_station_telecode !== 'string') throw new QueryError('provider_error');
    return r;
  }).filter(r => r.from_station_telecode === from && r.to_station_telecode === to).map(r => {
    if (!clock.test(r.start_time) || !clock.test(r.arrive_time) || !/^\d{2,3}:[0-5]\d$/.test(r.lishi)
      || !Array.isArray(r.prices) || !/^[A-Z0-9]{1,12}$/.test(r.start_train_code)
      || r.from_station !== q.origin || r.to_station !== q.destination) throw new QueryError('provider_error');
    const [hours, minutes] = r.lishi.split(':').map(Number);
    const durationMinutes = hours * 60 + minutes;
    if (durationMinutes < 1 || durationMinutes > 7 * 1440) throw new QueryError('provider_error');
    // 12306 origin dates can precede boarding dates on overnight trains.
    const departure = `${q.departureDate}T${r.start_time}:00+08:00`;
    const arrivalLocal = new Date(Date.parse(departure) + durationMinutes * 60000 + 8 * 3600000).toISOString();
    if (arrivalLocal.slice(11, 16) !== r.arrive_time) throw new QueryError('provider_error');
    const seats = r.prices.map(p => {
      if (typeof p.seat_name !== 'string' || typeof p.num !== 'string' || p.seat_name.length > 40 || p.num.length > 20
        || (p.price != null && (typeof p.price !== 'number' || !Number.isFinite(p.price) || p.price < 0))) throw new QueryError('provider_error');
      return { name: p.seat_name, availability: p.num, pricePerAdult: p.price > 0 ? p.price : null };
    });
    return { trainNumber: r.start_train_code, from: q.origin, to: q.destination, fromCode: from, toCode: to,
      departure, arrival: `${arrivalLocal.slice(0, 19)}+08:00`, durationMinutes, seats, currency: 'CNY', pricedAdults: 1, booked: false };
  }).filter(r => Number(r.departure.slice(11, 13)) >= q.earliestHour)
    .sort((a, b) => a.departure.localeCompare(b.departure)).slice(0, 10);
}
