import type { TKey, TVars } from '../i18n';

type T = (key: TKey, vars?: TVars) => string;

/**
 * Human-readable elapsed duration ("耗时"), e.g. 42分钟 / 3小时20分 / 2天5小时.
 * Returns '—' when there is no usable duration.
 */
export function formatDuration(ms: number | null | undefined, t: T): string {
  if (!ms || ms < 0) return '—';
  const min = Math.round(ms / 60000);
  if (min < 60) return t('record.dur.minutes', { n: min });
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h < 24) return m ? t('record.dur.hoursMinutes', { h, m }) : t('record.dur.hours', { h });
  const d = Math.floor(h / 24);
  const hr = h % 24;
  return hr ? t('record.dur.daysHours', { d, h: hr }) : t('record.dur.days', { d });
}
