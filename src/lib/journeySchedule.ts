import type { Poi } from '../data/pois';

export interface JourneyDateRangeSelection {
  start: Date;
  totalDays?: number;
  flexible: boolean;
}

export function journeyCalendarDays(start: Date, end: Date): number {
  const utc = (date: Date) => Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  return Math.max(1, Math.round((utc(end) - utc(start)) / 86400000) + 1);
}

export function journeySchedulePatch(
  { start, totalDays, flexible }: JourneyDateRangeSelection,
  daysLabel: string,
): Pick<Poi, 'date' | 'plannedDate' | 'days' | 'totalDays' | 'countdown'> {
  const days = totalDays != null && Number.isSafeInteger(totalDays) && totalDays > 0 ? totalDays : undefined;
  const dated = !flexible && days != null;
  const date = dated
    ? `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-${String(start.getDate()).padStart(2, '0')}`
    : undefined;
  return {
    date,
    plannedDate: date,
    days: days == null ? undefined : daysLabel,
    totalDays: days,
    countdown: dated ? Math.max(0, journeyCalendarDays(new Date(), start) - 1) : undefined,
  };
}
