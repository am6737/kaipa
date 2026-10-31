// Nightly refresh of the rail timetable snapshots an official plan reads.
// Driven by infra/supabase/rail-timetable-refresher.mjs through the app-agent
// `refresh_rail_timetables` action, one small slice per call.

import { collectOfficialTransport, timetableDate, type OfficialTransport } from './main-transport.ts';
import { railStationDirectory, resolveOfficialRailEndpoints } from './origin-endpoints.ts';
import { readTimetableSnapshot, saveTimetableSnapshot, snapshotable, stable, type RailArgs, type SnapshotStore } from './rail-timetable.ts';
import { queryTransport } from './search/transport.ts';
import { travelRequestSchema } from './travel-request.ts';

/** The official plans' meeting stations, one entry per distinct access. */
export async function officialAccesses(admin: any): Promise<OfficialTransport[]> {
  const { data, error } = await admin.from('route_itineraries').select('payload').eq('status', 'published');
  if (error) throw error;
  const seen = new Map<string, OfficialTransport>();
  for (const row of data ?? []) {
    const access = row?.payload?.access;
    const stations = Array.isArray(access?.stations) ? access.stations.map((station: any) => String(station?.name ?? '').trim()).filter(Boolean) : [];
    if (!access?.town || !stations.length) continue;
    const value = { town: String(access.town), meetingPoint: String(access.meetingPoint ?? access.town), arriveBy: String(access.arriveBy ?? '23:59'), accessStations: stations };
    seen.set(stable({ stations: value.accessStations.slice(0, 2), arriveBy: value.arriveBy }), value);
  }
  return [...seen.values()];
}

export async function hubCities(admin: any): Promise<string[]> {
  const { data, error } = await admin.from('rail_station_directory').select('city').eq('hub_rank', 1).order('city');
  if (error) throw error;
  return [...new Set<string>((data ?? []).map((row: any) => String(row.city)))];
}

/**
 * One slice of the nightly refresh: for each hub city × official access, ask
 * exactly what an official plan from that city asks, live, and keep the
 * answers. A pair whose snapshot is younger than `freshDays` is not asked again,
 * so a cycle interrupted by morning picks up where it stopped.
 */
export async function refreshRailTimetables(args: {
  admin: any; store: SnapshotStore; offset: number; limit: number; freshDays: number;
  live?: (query: RailArgs) => Promise<any>; now?: number;
}) {
  const now = args.now ?? Date.now();
  const live = args.live ?? ((query: RailArgs) => queryTransport(query, name => Deno.env.get(name)));
  const [cities, accesses] = await Promise.all([hubCities(args.admin), officialAccesses(args.admin)]);
  const slice = cities.slice(args.offset, args.offset + args.limit);
  const directory = railStationDirectory(args.admin);
  let queried = 0, reused = 0, failed = 0;
  for (const city of slice) {
    for (const access of accesses) {
      const request = travelRequestSchema.parse({ origin: city, modes: ['rail'], adults: 1 });
      const settled = await resolveOfficialRailEndpoints({ request, access, directory }).catch(() => null);
      if (!settled) continue;
      await collectOfficialTransport({ request, endpoints: settled.endpoints, plannedDate: null, official: access, now,
        query: async (query) => {
          const railArgs: RailArgs = { mode: 'rail', origin: query.origin, destination: query.destination,
            departureDate: query.departureDate || timetableDate(null, now), adults: 1, earliestHour: query.earliestHour ?? null, viaStation: null };
          const kept = await readTimetableSnapshot(args.store, railArgs, now, args.freshDays);
          if (kept) { reused++; return kept; }
          const result = await live(railArgs).catch(() => null);
          if (!snapshotable(railArgs, result)) { failed++; return result ?? { available: false, status: 'provider_error' }; }
          queried++;
          await saveTimetableSnapshot(args.store, railArgs, result, now);
          return result;
        } });
    }
  }
  const next = args.offset + slice.length;
  return { cities: slice, queried, reused, failed, next: next < cities.length ? next : null, total: cities.length,
    date: timetableDate(null, now) };
}
