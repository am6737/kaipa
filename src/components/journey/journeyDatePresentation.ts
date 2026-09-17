import type { Poi } from '../../data/pois';

type JourneyDates = Pick<Poi, 'plannedDate' | 'date' | 'totalDays' | 'days'>;

// Older journeys store localized date labels rather than an ISO date.
function parseStart(value: string, fallbackYear: number): Date | null {
  const full = value.match(/^(\d{4})\s*(?:年|[./-]|·)\s*(\d{1,2})\s*(?:月|[./-])\s*(\d{1,2})(?:\s*日)?(?:\s|$)/);
  const short = value.match(/^(\d{1,2})\s*(?:月|\/)\s*(\d{1,2})(?:\s*日)?(?:\s|$)/);
  if (!full && !short) return null;
  const year = full ? Number(full[1]) : fallbackYear;
  const month = Number(full ? full[2] : short![1]);
  const day = Number(full ? full[3] : short![2]);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day ? date : null;
}

export function formatJourneyDetailDate(journey: JourneyDates, locale: 'zh' | 'en', now = new Date()): string | null {
  const value = journey.plannedDate?.trim() || journey.date?.trim();
  if (!value) return null;
  const currentYear = now.getFullYear();
  const storedYear = journey.date?.match(/^(\d{4})\b/)?.[1];
  const start = parseStart(value, storedYear ? Number(storedYear) : currentYear);
  const language = locale === 'zh' ? 'zh-CN' : 'en-US';
  if (!start) {
    const monthOnly = value.match(/^(\d{4})\s*(?:年|·|[/-])\s*(\d{1,2})\s*月?$/);
    if (!monthOnly || Number(monthOnly[2]) < 1 || Number(monthOnly[2]) > 12) return value;
    const year = Number(monthOnly[1]);
    return new Intl.DateTimeFormat(language, {
      year: year === currentYear ? undefined : 'numeric',
      month: 'short',
    }).format(new Date(year, Number(monthOnly[2]) - 1, 1));
  }

  const legacyDays = journey.days?.trim().match(/^(\d+)\s*(?:天|days?|d)$/i);
  const count = journey.totalDays ?? (legacyDays ? Number(legacyDays[1]) : undefined);
  const totalDays = count != null && Number.isSafeInteger(count) && count > 0 ? count : undefined;
  const end = new Date(start);
  // Calendar arithmetic keeps inclusive date ranges correct across DST changes.
  end.setDate(end.getDate() + (totalDays ?? 1) - 1);
  if (!Number.isFinite(end.getTime())) return value;
  const crossYear = start.getFullYear() !== end.getFullYear();
  const format = (date: Date) => new Intl.DateTimeFormat(language, {
    year: crossYear || date.getFullYear() !== currentYear ? 'numeric' : undefined,
    month: 'short',
    day: 'numeric',
  }).format(date);
  const range = totalDays && totalDays > 1 ? `${format(start)}-${format(end)}` : format(start);
  const duration = totalDays ? (locale === 'zh' ? `${totalDays}天` : `${totalDays} ${totalDays === 1 ? 'day' : 'days'}`) : '';
  return duration ? `${range} ${duration}` : range;
}
