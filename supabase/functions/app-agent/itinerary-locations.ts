import type { z } from 'npm:zod@4.1.12';
import type { itineraryItem } from './tools.ts';
import { journeyDayOrdinal } from './journey-days.ts';

type Item = z.infer<typeof itineraryItem>;

/** Generic city lodging is a user choice, not a route stop. Keep named hotels
 * and measured hiking overnight places; never manufacture a hotel coordinate. */
export function omitGenericLodging(items: Item[]): Item[] {
  const generic = (name: string) => /(?:住宿(?:地点|待定)?|待定酒店|酒店待定|自选酒店|酒店自选|自行选择酒店)$/.test(name.trim());
  return items.filter(item => item.routeId || item.location?.trackId
    || !(generic(item.location?.name ?? '') || (item.kind === 'stay' && generic(item.title)
      && !/酒店|宾馆|饭店|民宿|客栈|营地/.test(item.location?.name ?? ''))))
    .map(item => item.startLocation && generic(item.startLocation.name)
      ? { ...item, startLocation: null } : item);
}

/** A location is one stop, never a textual A→B chain. */
export function expandItineraryLocations(items: Item[]): Item[] {
  return omitGenericLodging(items).flatMap(item => {
    if (!item.startLocation) return [item];
    const { startLocation, ...rest } = item;
    const start = { ...rest, startLocation: null, kind: 'custom' as const, routeId: null,
      title: `从${startLocation.name}出发`.slice(0, 120), timeEnd: null,
      location: { ...startLocation, incomingMode: null, trackId: null, trackMeters: null, trackLengthMeters: null } };
    return [start, { ...rest, startLocation: null }];
  });
}

/** Full new plans repeat yesterday's last stop, so each day has its own chain.
 * Do not apply to incremental edits or silently bridge a missing day. */
export function carryDailyStarts(items: Item[]): Item[] {
  const groups = new Map<string, Item[]>();
  for (const item of expandItineraryLocations(items)) {
    const group = groups.get(item.day) ?? [];
    group.push(item); groups.set(item.day, group);
  }
  const result: Item[] = [];
  let previous: Item | undefined;
  for (const [day, group] of [...groups].sort(([a], [b]) => (journeyDayOrdinal(a) ?? 0) - (journeyDayOrdinal(b) ?? 0))) {
    const first = group.find(item => item.location);
    const consecutive = previous && journeyDayOrdinal(day) === (journeyDayOrdinal(previous.day) ?? -2) + 1;
    if (consecutive && previous?.location && first?.location && previous.location.name !== first.location.name) {
      result.push({ ...previous, day, title: `从${previous.location.name}出发`.slice(0, 120), kind: 'custom', routeId: null,
        timeStart: null, timeEnd: null, startLocation: null, location: { ...previous.location, incomingMode: null } });
    }
    result.push(...group);
    previous = group.filter(item => item.location).at(-1);
  }
  return result;
}
