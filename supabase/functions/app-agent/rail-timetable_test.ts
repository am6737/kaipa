import { readTimetableSnapshot, REFERENCE_SEAT, saveTimetableSnapshot, type RailArgs, type SnapshotStore } from './rail-timetable.ts';
import { refreshRailTimetables } from './rail-timetable-refresh.ts';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const memoryStore = () => {
  const rows = new Map<string, unknown>();
  const store: SnapshotStore = { read: async key => rows.get(key) ?? null, write: async (key, payload) => { rows.set(key, payload); } };
  return { rows, store };
};
const args = (departureDate: string, earliestHour: number | null = 4): RailArgs =>
  ({ mode: 'rail', origin: '郑州', destination: '新乡', departureDate, adults: 2, earliestHour, viaStation: null });
const live = {
  available: true, status: 'results', query: { departureDate: '2026-11-07' },
  offers: [{ trainNumber: 'Z1', from: '郑州', to: '新乡', departure: '2026-11-07T23:30:00+08:00', arrival: '2026-11-08T00:40:00+08:00',
    seats: [{ name: '硬卧', availability: '有', pricePerAdult: 60 }] }],
};
const now = Date.parse('2026-11-01T12:00:00+08:00');

Deno.test('a snapshot moves its trains to the asked date and never claims a seat', async () => {
  const { store } = memoryStore();
  await saveTimetableSnapshot(store, args('2026-11-07'), live, now);
  const reference = await readTimetableSnapshot(store, args('2026-11-14'), now + 86400000, 10);
  assert(reference, 'the same weekday a week later is answered');
  const offer = reference.offers[0];
  assert(offer.departure === '2026-11-14T23:30:00+08:00' && offer.arrival === '2026-11-15T00:40:00+08:00', JSON.stringify(offer));
  assert(offer.seats[0].availability === REFERENCE_SEAT && offer.seats[0].pricePerAdult === 60, JSON.stringify(offer.seats));
  assert(reference.cacheMeta.layer === 'timetable' && reference.cacheMeta.observedDate === '2026-11-07', JSON.stringify(reference.cacheMeta));
  assert(reference.query.departureDate === '2026-11-14' && reference.query.adults === 2, JSON.stringify(reference.query));
});

Deno.test('another weekday falls back to any snapshot; an old one or another hour does not', async () => {
  const { store } = memoryStore();
  await saveTimetableSnapshot(store, args('2026-11-07'), live, now);
  assert((await readTimetableSnapshot(store, args('2026-11-10'), now, 10))?.offers[0].departure.startsWith('2026-11-10'), 'any weekday');
  assert(!await readTimetableSnapshot(store, args('2026-11-10'), now + 11 * 86400000, 10), 'older than the max age');
  assert(!await readTimetableSnapshot(store, args('2026-11-07', 9), now, 10), 'the hour is part of the key');
  assert(!await readTimetableSnapshot(store, { ...args('2026-11-07'), viaStation: '郑州东' }, now, 10), 'connections are always live');
});

Deno.test('provider errors are not stored, empty answers are', async () => {
  const { rows, store } = memoryStore();
  await saveTimetableSnapshot(store, args('2026-11-07'), { available: false, status: 'rate_limited' }, now);
  assert(rows.size === 0, 'a rate limit is not a timetable');
  await saveTimetableSnapshot(store, args('2026-11-07'), { available: true, status: 'empty', offers: [] }, now);
  assert((await readTimetableSnapshot(store, args('2026-11-07'), now, 10))?.status === 'empty', 'no direct train is remembered');
});

Deno.test('the refresher asks each hub city what an official plan asks, and skips fresh pairs', async () => {
  const table = (rows: unknown[]) => {
    const query: any = { select: () => query, eq: () => query, in: (_: string, values: string[]) => ({ data: (rows as any[]).filter(row => values.includes(row.city) || values.includes(row.station_name)), error: null }),
      order: () => ({ data: rows, error: null }), then: (resolve: (value: unknown) => void) => resolve({ data: rows, error: null }) };
    return query;
  };
  const directory = [{ station_name: '郑州', city: '郑州', hub_rank: 1 }, { station_name: '郑州东', city: '郑州', hub_rank: 2 }];
  const admin = { from: (name: string) => name === 'route_itineraries'
    ? table([{ payload: { access: { town: '新乡', meetingPoint: '新乡站', arriveBy: '06:30', stations: [{ name: '新乡' }, { name: '新乡东' }] } } }])
    : table(directory) };
  const { store } = memoryStore();
  const asked: string[] = [];
  const answer = async (query: RailArgs) => {
    asked.push(`${query.origin}-${query.destination}@${query.earliestHour}`);
    return query.destination === '新乡'
      ? { available: true, status: 'results', offers: [{ trainNumber: 'K2276', from: query.origin, to: '新乡', departure: `${query.departureDate}T05:30:00+08:00`, arrival: `${query.departureDate}T06:27:00+08:00`, seats: [] }] }
      : { available: true, status: 'empty', offers: [] };
  };
  const first = await refreshRailTimetables({ admin, store, offset: 0, limit: 1, freshDays: 3, live: answer, now });
  assert(first.queried === 2 && first.next === null && first.cities[0] === '郑州', JSON.stringify(first));
  assert(asked.join() === '郑州-新乡@4,郑州-新乡东@4', asked.join());
  const second = await refreshRailTimetables({ admin, store, offset: 0, limit: 1, freshDays: 3, live: answer, now: now + 86400000 });
  assert(second.queried === 0 && second.reused === 2 && asked.length === 2, JSON.stringify(second));
});
