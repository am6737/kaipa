// 检查硬伤: deterministic checks on an imported itinerary. The model only
// transcribes the user's plan (supabase/functions/itinerary-import); every
// judgement is made here, so the same draft always produces the same report.
// Thresholds are in CHECK_LIMITS so the report and the docs quote one source.
import type { ItineraryPayload } from './officialItinerary';

export type ImportedItem = {
  title: string;
  kind: 'activity' | 'transport' | 'stay';
  timeStart: string | null;
  timeEnd: string | null;
};

export type ImportedDay = {
  title: string;
  date: string | null;
  kind: 'access' | 'hike' | 'rest' | 'other';
  distanceKm: number | null;
  ascentM: number | null;
  descentM: number | null;
  stay: string | null;
  sleepAltitudeM: number | null;
  items: ImportedItem[];
};

export type ImportedItinerary = {
  name: string;
  routeId: string | null;
  startDate: string | null;
  days: ImportedDay[];
  unreadable: string[];
};

export type IssueSeverity = 'serious' | 'warning' | 'info';

export type IssueCode =
  | 'datesBroken'
  | 'startInPast'
  | 'timeOverlap'
  | 'dayTooLong'
  | 'dayLong'
  | 'sleepAltitudeJump'
  | 'noRestDay'
  | 'missingStay'
  | 'fewerDaysThanOfficial'
  | 'harderThanOfficial'
  | 'offSeason'
  | 'unreadable';

export type ItineraryIssue = {
  severity: IssueSeverity;
  code: IssueCode;
  /** 1-based day the issue belongs to, when it belongs to one. */
  day?: number;
  vars?: Record<string, string | number>;
};

export const CHECK_LIMITS = {
  /** A loaded multi-day trekking day; beyond this most groups arrive after dark. */
  dayLongKm: 20,
  dayLongAscentM: 1200,
  dayTooLongKm: 30,
  dayTooLongAscentM: 1800,
  /** Above this altitude, raise the sleeping altitude by at most sleepRiseM a night. */
  sleepAltitudeFloorM: 3000,
  sleepRiseM: 500,
  /** Consecutive hiking days before a rest day is worth suggesting. */
  hikeDaysBeforeRest: 6,
  /** Share by which a day may exceed the hardest official day. */
  officialTolerance: 0.25,
} as const;

const SEVERITY_ORDER: Record<IssueSeverity, number> = { serious: 0, warning: 1, info: 2 };

function dateValue(value: string): number {
  const [year, month, day] = value.split('-').map(Number);
  return Date.UTC(year, month - 1, day);
}

function minutes(value: string | null): number | null {
  if (!value) return null;
  const [hours, mins] = value.split(':').map(Number);
  return hours * 60 + mins;
}

const hiking = (day: ImportedDay) => day.kind === 'hike';

export function countIssues(issues: ItineraryIssue[]): Record<IssueSeverity, number> {
  const counts: Record<IssueSeverity, number> = { serious: 0, warning: 0, info: 0 };
  issues.forEach((issue) => { counts[issue.severity] += 1; });
  return counts;
}

export function checkItinerary(
  itinerary: ImportedItinerary,
  context: {
    today: Date;
    official?: ItineraryPayload | null;
    /** The catalog route's months, used when the official plan has none. */
    routeBestMonths?: number[] | null;
  },
): ItineraryIssue[] {
  const issues: ItineraryIssue[] = [];
  const { days } = itinerary;

  // Dates: stated dates must run one day after another.
  let previous: { day: number; value: number } | null = null;
  days.forEach((day, index) => {
    if (!day.date) return;
    const value = dateValue(day.date);
    if (previous && value !== previous.value + (index + 1 - previous.day) * 86_400_000) {
      issues.push({ severity: 'serious', code: 'datesBroken', day: index + 1, vars: { day: index + 1, date: day.date } });
    }
    previous = { day: index + 1, value };
  });
  const today = Date.UTC(context.today.getFullYear(), context.today.getMonth(), context.today.getDate());
  if (itinerary.startDate && dateValue(itinerary.startDate) < today) {
    issues.push({ severity: 'warning', code: 'startInPast', vars: { date: itinerary.startDate } });
  }

  days.forEach((day, index) => {
    const dayNumber = index + 1;
    // Times inside a day must not run backwards or overlap.
    let lastEnd: number | null = null;
    for (const item of day.items) {
      const start = minutes(item.timeStart);
      const end = minutes(item.timeEnd);
      if (start != null && lastEnd != null && start < lastEnd) {
        issues.push({ severity: 'warning', code: 'timeOverlap', day: dayNumber, vars: { day: dayNumber, title: item.title } });
        break;
      }
      if (end != null && start != null && end >= start) lastEnd = end;
      else if (start != null) lastEnd = start;
    }

    if (hiking(day)) {
      const km = day.distanceKm ?? 0;
      const ascent = day.ascentM ?? 0;
      if (km > CHECK_LIMITS.dayTooLongKm || ascent > CHECK_LIMITS.dayTooLongAscentM) {
        issues.push({ severity: 'serious', code: 'dayTooLong', day: dayNumber, vars: { day: dayNumber, km: km || '--', ascent: ascent || '--' } });
      } else if (km > CHECK_LIMITS.dayLongKm || ascent > CHECK_LIMITS.dayLongAscentM) {
        issues.push({ severity: 'warning', code: 'dayLong', day: dayNumber, vars: { day: dayNumber, km: km || '--', ascent: ascent || '--' } });
      }
    }

    const before = index > 0 ? days[index - 1].sleepAltitudeM : null;
    if (before != null && day.sleepAltitudeM != null
      && day.sleepAltitudeM > CHECK_LIMITS.sleepAltitudeFloorM
      && day.sleepAltitudeM - before > CHECK_LIMITS.sleepRiseM) {
      issues.push({ severity: 'warning', code: 'sleepAltitudeJump', day: dayNumber, vars: { day: dayNumber, rise: Math.round(day.sleepAltitudeM - before), altitude: Math.round(day.sleepAltitudeM) } });
    }

    if (index < days.length - 1 && !day.stay && !day.items.some((item) => item.kind === 'stay')) {
      issues.push({ severity: 'info', code: 'missingStay', day: dayNumber, vars: { day: dayNumber } });
    }
  });

  let streak = 0;
  let longest = 0;
  days.forEach((day) => {
    streak = hiking(day) ? streak + 1 : 0;
    longest = Math.max(longest, streak);
  });
  if (longest >= CHECK_LIMITS.hikeDaysBeforeRest) {
    issues.push({ severity: 'info', code: 'noRestDay', vars: { count: longest } });
  }

  const hikeDays = days.filter(hiking);
  const official = context.official;
  if (official) {
    const officialHikeDays = official.days.filter((day) => day.kind === 'hike');
    // Without day kinds the whole plan is compared with the whole official plan.
    const mine = hikeDays.length || days.length;
    const theirs = hikeDays.length ? officialHikeDays.length : official.days.length;
    if (mine < theirs) {
      issues.push({ severity: 'serious', code: 'fewerDaysThanOfficial', vars: { mine, official: theirs, plan: official.name } });
    }
    const maxKm = Math.max(0, ...officialHikeDays.map((day) => day.distanceKm ?? 0));
    const maxAscent = Math.max(0, ...officialHikeDays.map((day) => day.ascentM ?? 0));
    hikeDays.forEach((day) => {
      const dayNumber = days.indexOf(day) + 1;
      const overKm = maxKm > 0 && (day.distanceKm ?? 0) > maxKm * (1 + CHECK_LIMITS.officialTolerance);
      const overAscent = maxAscent > 0 && (day.ascentM ?? 0) > maxAscent * (1 + CHECK_LIMITS.officialTolerance);
      if (overKm || overAscent) {
        issues.push({ severity: 'warning', code: 'harderThanOfficial', day: dayNumber, vars: { day: dayNumber, km: maxKm || '--', ascent: maxAscent || '--' } });
      }
    });
  }

  const bestMonths = official?.bestMonths?.length ? official.bestMonths : context.routeBestMonths;
  if (itinerary.startDate && bestMonths?.length) {
    const month = Number(itinerary.startDate.slice(5, 7));
    if (!bestMonths.includes(month)) {
      issues.push({ severity: 'warning', code: 'offSeason', vars: { month, months: bestMonths.join('、') } });
    }
  }

  itinerary.unreadable.forEach((note) => issues.push({ severity: 'info', code: 'unreadable', vars: { note } }));

  return issues
    .map((issue, index) => ({ issue, index }))
    .sort((a, b) => SEVERITY_ORDER[a.issue.severity] - SEVERITY_ORDER[b.issue.severity] || a.index - b.index)
    .map(({ issue }) => issue);
}
