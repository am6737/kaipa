// Rail timetable snapshots: what a live 12306 query answered, kept per
// station pair and weekday so a later plan can read the trains without
// waiting ~15 s per query on the rail sidecar.
//
// High-speed timetables repeat every week; seats and fares do not. A snapshot
// therefore keeps the trains and their per-adult fares, shifts them to the
// date asked about and marks every seat '参考': the plan can be built on it,
// but the user buys and checks the ticket on 12306 themselves. Every live rail
// answer writes one, and the nightly refresher (rail-timetable-refresh.ts) keeps the
// official-plan pairs (hub city → plan access station) warm.

export type RailArgs = {
  mode: 'rail'; origin: string; destination: string; departureDate: string; adults: number;
  earliestHour: number | null; viaStation: string | null;
};
export type SnapshotStore = {
  read(key: string): Promise<any | null>;
  write(key: string, payload: unknown, ttlSeconds: number): Promise<void>;
};
type Snapshot = { observedAt: string; observedDate: string; result: Record<string, any> };

/** Availability of a seat read from a snapshot rather than from 12306 now. */
export const REFERENCE_SEAT = '参考';
const KEEP_SECONDS = 21 * 86400;
const DAY_MS = 86400000;

export function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${stable(object[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export async function sha256(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

const weekday = (date: string) => new Date(`${date}T00:00:00Z`).getUTCDay();
const shiftDate = (date: string, days: number) => new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
const shiftStamp = (stamp: unknown, days: number) => {
  const text = String(stamp ?? '');
  return /^\d{4}-\d{2}-\d{2}T/.test(text) ? `${shiftDate(text.slice(0, 10), days)}${text.slice(10)}` : stamp;
};

/** Same weekday first, then any weekday: a Saturday-only train is the
 * exception, and the note on the plan says to check the train anyway. */
async function snapshotKeys(args: RailArgs) {
  const base = `rail-timetable:v1:${await sha256(stable({ origin: args.origin, destination: args.destination, earliestHour: args.earliestHour }))}`;
  return { weekday: `${base}:w${weekday(args.departureDate)}`, any: `${base}:any` };
}

export const snapshotable = (args: RailArgs, result: any) => args.mode === 'rail' && !args.viaStation
  && (result?.status === 'empty' || (result?.available && result?.status === 'results' && Array.isArray(result.offers)));

export async function saveTimetableSnapshot(store: SnapshotStore, args: RailArgs, result: any, now = Date.now()) {
  if (!snapshotable(args, result)) return;
  const keys = await snapshotKeys(args);
  const payload: Snapshot = { observedAt: new Date(now).toISOString(), observedDate: args.departureDate, result };
  await Promise.all([store.write(keys.weekday, payload, KEEP_SECONDS), store.write(keys.any, payload, KEEP_SECONDS)]);
}

export function timetableMaxAgeDays() {
  const value = Number(Deno.env.get('RAIL_TIMETABLE_MAX_AGE_DAYS'));
  return Number.isFinite(value) && value >= 0 ? Math.min(20, value) : 10;
}

/** The trains of a stored answer, moved to the date asked about. */
export function referenceResult(snapshot: Snapshot, args: RailArgs): Record<string, any> {
  const days = Math.round((Date.parse(`${args.departureDate}T00:00:00Z`) - Date.parse(`${snapshot.observedDate}T00:00:00Z`)) / DAY_MS);
  const seats = (list: unknown) => Array.isArray(list)
    ? list.map((seat: any) => ({ ...seat, availability: REFERENCE_SEAT }))
    : list;
  const segment = (value: any) => ({ ...value, departure: shiftStamp(value.departure, days), arrival: shiftStamp(value.arrival, days), seats: seats(value.seats) });
  const offers = Array.isArray(snapshot.result.offers) ? snapshot.result.offers.map((offer: any) => ({
    ...segment(offer), ...(Array.isArray(offer.segments) ? { segments: offer.segments.map(segment) } : {}),
  })) : [];
  return {
    ...snapshot.result,
    query: { ...(snapshot.result.query || {}), departureDate: args.departureDate, adults: args.adults },
    offers, cached: true, booked: false, reliability: 'timetable_reference', retrievedAt: snapshot.observedAt,
    limitation: `Timetable reference observed on 12306 for ${snapshot.observedDate}; trains, fares and seats were not re-checked for ${args.departureDate}. Seat availability is '${REFERENCE_SEAT}', never a ticket promise.`,
    cacheMeta: { layer: 'timetable', observedAt: snapshot.observedAt, observedDate: snapshot.observedDate, cacheHit: true },
  };
}

export async function readTimetableSnapshot(store: SnapshotStore, args: RailArgs, now = Date.now(), maxAgeDays = timetableMaxAgeDays()) {
  if (args.mode !== 'rail' || args.viaStation || maxAgeDays <= 0) return null;
  const keys = await snapshotKeys(args);
  for (const key of [keys.weekday, keys.any]) {
    const snapshot = await store.read(key) as Snapshot | null;
    const observed = Date.parse(snapshot?.observedAt ?? '');
    if (!snapshot?.result || !/^\d{4}-\d{2}-\d{2}$/.test(snapshot.observedDate ?? '') || !(observed > now - maxAgeDays * DAY_MS)) continue;
    return referenceResult(snapshot, args);
  }
  return null;
}
