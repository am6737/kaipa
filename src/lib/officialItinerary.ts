export type DayKind = 'access_in' | 'hike' | 'rest' | 'access_out';

export interface ItineraryTransfer {
  from: string;
  to: string;
  mode: 'charter' | 'shared' | 'bus' | 'shuttle';
  duration: string | null;
  costRef: string | null;
  booking: string | null;
  position: 'start' | 'end';
}

export interface ItineraryStay {
  name: string;
  type: 'camp' | 'homestay' | 'inn' | 'hotel';
  altitudeM: number | null;
  water: string | null;
  costRef: string | null;
  signal: string | null;
}

export interface ItineraryDay {
  kind: DayKind;
  title: string;
  distanceKm: number | null;
  ascentM: number | null;
  descentM: number | null;
  duration: string | null;
  transfers: ItineraryTransfer[];
  stay: ItineraryStay | null;
  supply: string | null;
  tip: string | null;
  bailout: string | null;
  source: 'official' | 'kb_generated' | 'user_track';
}

export interface ItineraryPayload {
  name: string;
  direction: string | null;
  lodging: 'camp' | 'lodge' | 'mixed';
  difficulty: '易' | '中' | '中高' | '高';
  audience: string;
  summary: string;
  notes: string[];
  bestMonths: number[] | null;
  seasonNote: string | null;
  days: ItineraryDay[];
}

export interface PublishedItinerary {
  id: string;
  version: number;
  routeId: string;
  isDefault: boolean;
  payload: ItineraryPayload;
  verifiedOn: string | null;
}

export interface PublishedItineraryRow {
  id: string;
  version: number;
  route_id: string;
  is_default: boolean;
  payload: ItineraryPayload;
  verified_on: string | null;
}

export interface RouteSeason {
  bestMonths: number[] | null;
  seasonNote: string | null;
}

export type AccessToggle = { label: '包含进山日' | '包含出山日' | '包含进山日和出山日' };

export interface AssembledDay extends ItineraryDay {
  dayNumber: number;
  date: string | null;
  dateLabel: string | null;
  kindLabel: '进山' | '徒步' | '休整' | '出山';
}

export interface AssembledItinerary {
  header: {
    routeName: string;
    planName: string;
    hikeDayCount: number;
    accessDayCount: number;
    countsLine: string;
    dateLine: string;
    difficulty: ItineraryPayload['difficulty'];
    audience: string;
  };
  summary: string;
  startDate: string | null;
  endDate: string | null;
  plannedDate: string | null;
  days: AssembledDay[];
  transportNote: string;
  accessToggle: AccessToggle | null;
  season: {
    inRecommendedMonths: boolean;
    monthsLabel: string;
    line: string;
    seasonNote: string | null;
  } | null;
  notes: string[];
  sourceLabel: string;
}

export function fromPublishedRow(row: PublishedItineraryRow): PublishedItinerary {
  return {
    id: row.id,
    version: row.version,
    routeId: row.route_id,
    isDefault: row.is_default,
    payload: row.payload,
    verifiedOn: row.verified_on,
  };
}

export function sortItineraries(list: PublishedItinerary[]): PublishedItinerary[] {
  return [...list].sort((a, b) =>
    Number(b.isDefault) - Number(a.isDefault)
    || hikeDays(a.payload) - hikeDays(b.payload)
    || a.payload.name.localeCompare(b.payload.name, 'zh-CN')
  );
}

export function chooseItinerary(plans: PublishedItinerary[], preferredHikeDays?: number): PublishedItinerary | undefined {
  const sorted = sortItineraries(plans);
  if (preferredHikeDays == null) return sorted[0];
  return sorted.reduce<PublishedItinerary | undefined>((best, plan) => {
    if (!best) return plan;
    const distance = Math.abs(hikeDays(plan.payload) - preferredHikeDays);
    const bestDistance = Math.abs(hikeDays(best.payload) - preferredHikeDays);
    return distance < bestDistance ? plan : best;
  }, undefined);
}

export function guideSeason(plan: PublishedItinerary, route: RouteSeason): { months: string | null; note: string | null } {
  const months = plan.payload.bestMonths ?? route.bestMonths;
  return { months: months?.length ? monthsLabel(months) : null, note: plan.payload.seasonNote ?? route.seasonNote };
}

function hikeDays(payload: ItineraryPayload): number {
  return payload.days.filter(day => day.kind === 'hike').length;
}

export function accessToggle(payload: ItineraryPayload): AccessToggle | null {
  const hasIn = payload.days.some(day => day.kind === 'access_in');
  const hasOut = payload.days.some(day => day.kind === 'access_out');
  if (!hasIn && !hasOut) return null;
  return { label: hasIn && hasOut ? '包含进山日和出山日' : hasIn ? '包含进山日' : '包含出山日' };
}

function addDays(isoDate: string, offset: number): string {
  const [year, month, day] = isoDate.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + offset)).toISOString().slice(0, 10);
}

function monthDay(isoDate: string): { month: number; day: number; year: number } {
  const [year, month, day] = isoDate.split('-').map(Number);
  return { year, month, day };
}

function monthsLabel(months: number[]): string {
  const sorted = [...new Set(months)].sort((a, b) => a - b);
  const runs: string[] = [];
  let start = sorted[0];
  let end = start;
  for (const month of sorted.slice(1)) {
    if (month === end + 1) {
      end = month;
    } else {
      runs.push(start === end ? `${start} 月` : `${start}～${end} 月`);
      start = end = month;
    }
  }
  if (start !== undefined) runs.push(start === end ? `${start} 月` : `${start}～${end} 月`);
  return runs.join('、');
}

function firstPlace(day: ItineraryDay): string {
  return day.transfers.find(transfer => transfer.position === 'start')?.from
    ?? day.title.split('→')[0].trim();
}

function lastPlace(day: ItineraryDay): string {
  const endTransfers = day.transfers.filter(transfer => transfer.position === 'end');
  return endTransfers.at(-1)?.to ?? day.title.split('→').at(-1)!.trim();
}

const kindLabels: Record<DayKind, AssembledDay['kindLabel']> = {
  access_in: '进山', hike: '徒步', rest: '休整', access_out: '出山',
};

export function assembleItinerary(
  plan: PublishedItinerary,
  route: { name: string } & RouteSeason,
  options: { trekStartDate: string | null; includeAccess: boolean },
): AssembledItinerary {
  const originalDays = plan.payload.days;
  const included = originalDays.filter(day => options.includeAccess || (day.kind !== 'access_in' && day.kind !== 'access_out'));
  const accessInCount = options.includeAccess ? originalDays.filter(day => day.kind === 'access_in').length : 0;
  const accessOutCount = options.includeAccess ? originalDays.filter(day => day.kind === 'access_out').length : 0;
  const accessDayCount = accessInCount + accessOutCount;
  const plannedDate = options.trekStartDate === null ? null : addDays(options.trekStartDate, -accessInCount);
  const days = included.map((day, index): AssembledDay => {
    const date = plannedDate === null ? null : addDays(plannedDate, index);
    const parts = date === null ? null : monthDay(date);
    return {
      ...day,
      dayNumber: index + 1,
      date,
      dateLabel: parts === null ? null : `${parts.month}/${parts.day}`,
      kindLabel: kindLabels[day.kind],
    };
  });
  const startDate = days[0]?.date ?? null;
  const endDate = days.at(-1)?.date ?? null;
  const startParts = startDate === null ? null : monthDay(startDate);
  const endParts = endDate === null ? null : monthDay(endDate);
  const dateLine = startParts === null || endParts === null
    ? '日期待定'
    : `${startParts.month} 月 ${startParts.day} 日至 ${endParts.month} 月 ${endParts.day} 日`;
  const accessParts = [
    accessInCount ? `进山 ${accessInCount} 天` : null,
    accessOutCount ? `出山 ${accessOutCount} 天` : null,
  ].filter((part): part is string => part !== null);
  const countsLine = `徒步 ${hikeDays(plan.payload)} 天${accessParts.length ? `，另含${accessParts.join('、')}` : ''}`;
  const from = firstPlace(included[0]);
  const to = lastPlace(included[included.length - 1]);
  const transportNote = from === to
    ? `往返${from}的交通不在方案内`
    : `前往${from}、从${to}返回的交通不在方案内`;
  const months = plan.payload.bestMonths ?? route.bestMonths;
  const note = plan.payload.seasonNote ?? route.seasonNote;
  const seasonNote = note?.includes('出发前请核实') ? null : note;
  const trekMonth = options.trekStartDate === null ? null : monthDay(options.trekStartDate).month;
  const label = months === null ? '' : monthsLabel(months);
  const season = trekMonth === null ? null : {
    inRecommendedMonths: months?.includes(trekMonth) ?? false,
    monthsLabel: label,
    line: months === null || months.length === 0
      ? '推荐月份未收录'
      : `${trekMonth} 月${months.includes(trekMonth) ? '在' : '不在'}推荐月份（${label}）内`,
    seasonNote,
  };
  const verified = plan.verifiedOn === null ? '' : (() => {
    const { year, month, day } = monthDay(plan.verifiedOn);
    return `，核实于 ${year} 年 ${month} 月 ${day} 日`;
  })();
  return {
    header: {
      routeName: route.name,
      planName: plan.payload.name,
      hikeDayCount: hikeDays(plan.payload),
      accessDayCount,
      countsLine,
      dateLine,
      difficulty: plan.payload.difficulty,
      audience: plan.payload.audience,
    },
    summary: plan.payload.summary,
    startDate,
    endDate,
    plannedDate,
    days,
    transportNote,
    accessToggle: accessToggle(plan.payload),
    season,
    notes: plan.payload.notes.slice(0, 5),
    sourceLabel: `Kaipa 官方方案第 ${plan.version} 版${verified}`,
  };
}
