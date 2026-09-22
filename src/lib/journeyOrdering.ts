import type { TLGroup, TLRow } from '../data/timeline';
import { journeyDayOrdinal } from './journeyDays';

// The itinerary's display order is a single rule shared by the list and the
// map, so the two can never disagree about which stop is "第3站".

/** Group rows by `day`. Default day names sort by day index; custom names keep their first-seen order after numbered days. */
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
    .sort((a, b) => {
      const ai = journeyDayOrdinal(a[0]);
      const bi = journeyDayOrdinal(b[0]);
      if (ai != null && bi != null) return ai - bi;
      if (ai != null) return -1;
      if (bi != null) return 1;
      return a[1].order - b[1].order;
    })
    .map(([key, group]) => ({ key, label: key, rows: group.rows }));
}

/** Within a day, timed rows come first in ascending order; untimed rows keep the order they were added. */
export function sortRowsWithinDay(rows: TLRow[]): TLRow[] {
  return [...rows]
    .map((row, index) => ({ row, index }))
    .sort((a, b) => {
      const ta = a.row.timeStart ?? Infinity, tb = b.row.timeStart ?? Infinity;
      return ta === tb ? a.index - b.index : ta - tb;
    })
    .map((item) => item.row);
}

/** Every row in exactly the sequence the itinerary list renders it. */
export function orderedJourneyRows(rows: TLRow[], knownGroups: string[]): TLRow[] {
  return groupJourneyRows(rows, knownGroups).flatMap((group) => sortRowsWithinDay(group.rows));
}
