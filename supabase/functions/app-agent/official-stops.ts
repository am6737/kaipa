// Stops of published official plans, as the save tools read them back from the
// database. A plan stop is curated data on the route's own track, so it can
// place an itinerary row or a day boundary without a model-supplied position.

export type PlanStopRow = { id: string; version: number; payload: unknown };
export type PlanStop = { name: string; km: number };

const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};

function stopsOf(day: unknown): PlanStop[] {
  const stops = record(day).stops;
  return (Array.isArray(stops) ? stops : []).flatMap(stop => {
    const { name, km } = record(stop);
    return typeof name === 'string' && name.trim() && typeof km === 'number' && Number.isFinite(km) ? [{ name: name.trim(), km }] : [];
  });
}

/** Where a published plan's walking day ends. */
export function officialDayEnd(rows: PlanStopRow[], ref: { itineraryId: string; version: number; dayIndex: number }): PlanStop | null {
  const row = rows.find(value => value.id === ref.itineraryId && value.version === ref.version);
  const day = row ? (record(row.payload).days as unknown[] | undefined)?.[ref.dayIndex] : undefined;
  if (!day || record(day).kind !== 'hike') return null;
  const stops = stopsOf(day);
  return stops.length >= 2 ? stops.at(-1)! : null;
}

/** Every stop name of a route's published plans with its km. A name the plans
 * place at different km is left out rather than guessed. */
export function officialStopKms(rows: PlanStopRow[]): Map<string, number> {
  const kms = new Map<string, number>();
  const conflicting = new Set<string>();
  for (const row of rows) {
    const days = record(row.payload).days;
    for (const stop of (Array.isArray(days) ? days : []).flatMap(stopsOf)) {
      const known = kms.get(stop.name);
      if (known != null && Math.abs(known - stop.km) > 0.001) conflicting.add(stop.name);
      else kms.set(stop.name, stop.km);
    }
  }
  for (const name of conflicting) kms.delete(name);
  return kms;
}
