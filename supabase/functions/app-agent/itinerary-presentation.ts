import type { z } from 'npm:zod@4.1.12';
import type { itineraryItem } from './tools.ts';
import { omitGenericLodging } from './itinerary-locations.ts';
import { journeyDayOrdinal } from './journey-days.ts';

type Item = z.infer<typeof itineraryItem>;
type GroupNote = { day: string; note: string };
const readable = (text: string) => text.replace(/ResearchBrief/g, '路线资料').replace(/TransportPlan/g, '交通资料').replace(/mainTravel/g, '交通查询结果').replace(/PlanDocument/g, '行程方案').replace(/\btrk\d+\b/g, '该路线');
// Remove standalone generation/query bookkeeping, not route facts or known constraints.
// Feasibility issues remain in the plan/task metadata and the final planning response.
const briefSummary = (text: string) => text.split(/(?<=[。；;])/).filter((sentence, index) => index === 0
  || !/(?:未纳入.*查询|未构成预订|查询参考|尚缺.*(?:安排|核对)|(?:接驳|班次|道路耗时|落脚点|过夜点).*(?:未核实|未确定|尚未确定|未核定|未能从.*标注.*定位)|具体终点安排取决于)/.test(sentence)).join('').trim().replace(/[；;]$/, '。');
const serviceCode = (title: string) => /\b(?:[GDKTZCY]\d{1,6}|[A-Z0-9]{2}\d{2,5})\b/.exec(title.replace(/D\d+[：:]/gi, ''))?.[0];
const placeKey = (name: string) => name.replace(/^D\d+[：:]\s*|^(?:终点|起点)[：:]\s*/i, '').trim();

/** Keep generated prose in the daily note while preserving map/time metadata.
 * Supplied summaries stay concise without appended provider receipts or prose;
 * the fallback retains
 * existing descriptive titles when a legacy or repair response omits them. */
export function presentItinerary(items: Item[], groupNotes: GroupNote[] = [], totalDays?: number | null) {
  items = removeOutOfRangeArrivals(omitGenericLodging(items), totalDays);
  const notes = new Map<string, string>();
  for (const entry of groupNotes) {
    if (notes.has(entry.day)) throw new Error('同一个行程日只能输出一份摘要');
    notes.set(entry.day, briefSummary(readable(entry.note.trim())));
  }
  const additions = new Map<string, string[]>();
  const result: Item[] = [];
  for (const item of items) {
    const original = item.title;
    const service = serviceCode(original);
    const isMarker = item.location && (original === item.location.name || /^(?:从|抵达|到达|前往|入住)/.test(original));
    const descriptive = original.length > 40 || /[；;]| · /.test(original);
    let title = original;
    if (item.location && (isMarker || descriptive || original.includes('→'))) {
      title = `${placeKey(item.location.name)}${service ? ` · ${service}` : ''}`.slice(0, 120);
    } else if (descriptive) {
      title = item.kind === 'activity' && item.routeId
        ? (/徒步\s*(?:第\s*)?\d+\s*天/.exec(original)?.[0] || '沿线徒步')
        : original.split(/\s*·\s*|[；;]/)[0].trim();
    }
    // A short actionable clause must survive even when a supplied summary omits it.
    const action = notes.get(item.day) && item.kind === 'custom' && item.location && !service
      && original.length <= 40 ? original.split(/[；;]/).slice(1).join('；').trim() : '';
    if (action) title = `${placeKey(item.location!.name)}（${action}）`;
    if ((/(?:次日|过夜|通宵|夜行|卧铺)/.test(original)
      || (item.timeStart && item.timeEnd && item.timeEnd <= item.timeStart))
      && !/(?:次日|过夜|通宵|夜行|卧铺)/.test(title)) {
      title = `${title.slice(0, 114)}（次日到达）`;
    }
    if (title !== original && !notes.get(item.day) && (!isMarker || descriptive || service)) {
      const extra = additions.get(item.day) ?? [];
      if (!extra.includes(original) && !notes.get(item.day)?.includes(original)) extra.push(original);
      additions.set(item.day, extra);
    }
    // A stop's known arrival time is a point in time when departure is unknown.
    const next = item.location && !item.timeStart && item.timeEnd
      ? { ...item, title, timeStart: item.timeEnd, timeEnd: null } : { ...item, title };
    const previous = result.at(-1);
    // Remove adjacent repeated stop markers; prefer the measured GPX place.
    // Separate actionable text (e.g. collecting bags) remains its own item.
    const simpleStop = (entry: Item) => entry.location && (entry.title === placeKey(entry.location.name)
      || entry.title === `${placeKey(entry.location.name)} · ${serviceCode(entry.title)}`);
    const previousService = previous && serviceCode(previous.title);
    if (previous?.day === next.day && previous.kind === 'custom' && next.kind === 'custom'
      && previous.location && next.location && simpleStop(previous) && simpleStop(next)
      && placeKey(previous.location.name) === placeKey(next.location.name)
      && (!previous.location.trackId || !next.location.trackId || (previous.location.trackId === next.location.trackId && previous.location.trackMeters === next.location.trackMeters))
      && (!previousService || !service || previousService === service)
      && (previous.timeStart === next.timeStart || !previous.timeStart || !next.timeStart || previousService || service)) {
      const preferred = next.location.trackId && !previous.location.trackId ? next
        : previous.location.trackId && !next.location.trackId ? previous
        : service && !previousService ? next
        : previousService && !service ? previous : next.timeStart ? next : previous;
      const other = preferred === next ? previous : next;
      if (other.timeStart && other.timeStart !== preferred.timeStart) {
        const extra = additions.get(item.day) ?? [];
        extra.push(`${placeKey(other.location!.name)}到站 ${other.timeStart}${other.timeEnd ? `—${other.timeEnd}` : ''}`);
        additions.set(item.day, extra);
      }
      result[result.length - 1] = preferred;
      continue;
    }
    result.push(next);
  }
  const seenTitles = new Set<string>();
  for (const item of result) {
    const base = item.title;
    let visit = 2;
    while (item.location && seenTitles.has(`${item.day}\u0000${item.title}`)) {
      const suffix = `（第${visit++}次）`;
      item.title = `${base.slice(0, 120 - suffix.length)}${suffix}`;
    }
    seenTitles.add(`${item.day}\u0000${item.title}`);
  }
  for (const day of new Set(items.map(item => item.day))) {
    const dayItems = items.filter(item => item.day === day);
    const places = dayItems.flatMap(item => item.location ? [placeKey(item.location.name)] : [])
      .filter((name, index, all) => index === 0 || all[index - 1] !== name);
    const fallback = places.length > 1 ? `当天从${places[0]}出发，经${places.slice(1).join('、')}。`
      : places.length === 1 ? `当天在${places[0]}安排活动。` : dayItems.map(item => item.title).join('；');
    const note = readable([notes.get(day) || fallback, ...(additions.get(day) ?? [])].filter(Boolean).join('\n'));
    if (note.length > 1000) throw new Error(`${day} 摘要超过1000字，请概括当天安排并精简重复说明后重试`);
    notes.set(day, note);
  }
  return { items: result, groupNotes: [...notes].map(([day, note]) => ({ day, note })) };
}

export function removeOutOfRangeArrivals(items: Item[], totalDays?: number | null): Item[] {
  return items.filter(item => !(totalDays != null && item.location?.incomingMode
    && /^(?:抵达|到达)/.test(item.title) && (journeyDayOrdinal(item.day) ?? 0) > totalDays));
}
