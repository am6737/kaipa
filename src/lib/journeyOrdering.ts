import type { TLGroup, TLRow } from '../data/timeline';

// The itinerary's display order is a single rule shared by the list and the
// map, so the two can never disagree about which stop is "第3站".

/** Group rows by `day`, preserving the persisted group order supplied by the caller. */
export function groupJourneyRows(rows: TLRow[], knownGroups: string[]): TLGroup[] {
  const map = new Map<string, { rows: TLRow[]; order: number }>();
  let order = 0;
  for (const g of knownGroups) map.set(g, { rows: [], order: order++ });
  for (const r of rows) {
    const key = r.day || '';
    const group = map.get(key);
    if (group) group.rows.push(r);
    else map.set(key, { rows: [r], order: order++ });
  }
  return [...map.entries()]
    .sort((a, b) => a[1].order - b[1].order)
    .map(([key, group]) => ({ key, label: key, rows: group.rows }));
}

/** Within a day, preserve the persisted manual order. */
export function sortRowsWithinDay(rows: TLRow[]): TLRow[] {
  return [...rows];
}

/** Every row in exactly the sequence the itinerary list renders it. */
export function orderedJourneyRows(rows: TLRow[], knownGroups: string[]): TLRow[] {
  return groupJourneyRows(rows, knownGroups).flatMap((group) => sortRowsWithinDay(group.rows));
}
