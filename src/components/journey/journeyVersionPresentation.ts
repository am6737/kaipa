import type { JourneyVersion } from '../../hooks/useJourneyVersions';
import type { ResolvedLang, TKey } from '../../i18n';

type Translate = (key: TKey, vars?: Record<string, string | number>) => string;

const FIELD_KEYS: Record<string, TKey> = {
  name: 'journey.version.field.name',
  region: 'journey.version.field.location',
  coord: 'journey.version.field.location',
  lng: 'journey.version.field.location',
  lat: 'journey.version.field.location',
  desc: 'journey.version.field.description',
  date: 'journey.version.field.date',
  days: 'journey.version.field.date',
  planned_date: 'journey.version.field.date',
  countdown: 'journey.version.field.date',
  day_index: 'journey.version.field.date',
  total_days: 'journey.version.field.date',
  dist: 'journey.version.field.track',
  asc_: 'journey.version.field.track',
  track_id: 'journey.version.field.track',
  photo_uris: 'journey.version.field.cover',
  hero_mode: 'journey.version.field.cover',
  track_public: 'journey.version.field.visibility',
  route_show_photos: 'journey.version.field.visibility',
  route_show_timeline: 'journey.version.field.visibility',
  participant_permissions: 'journey.version.field.permissions',
  fav: 'journey.version.field.favorite',
  companions: 'journey.version.field.companions',
  timeline: 'journey.version.field.timeline',
  moments: 'journey.version.field.moments',
  checklist: 'journey.version.field.checklist',
  restore: 'journey.version.field.restore',
};

function fieldLabels(version: Pick<JourneyVersion, 'changedFields'>, t: Translate) {
  return [...new Set(version.changedFields.map((key) => t(FIELD_KEYS[key] || 'journey.version.field.other')))];
}

export function formatJourneyVersionTime(value: string, locale: ResolvedLang, includeYear = true) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(locale === 'zh' ? 'zh-CN' : 'en-US', {
    year: includeYear ? 'numeric' : undefined,
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export function formatJourneyVersionRelativeTime(value: string, locale: ResolvedLang, now = new Date()) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const language = locale === 'zh' ? 'zh-CN' : 'en-US';
  const sameYear = date.getFullYear() === now.getFullYear();
  const elapsed = Math.max(0, now.getTime() - date.getTime());
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (sameYear && elapsed < 7 * day) {
    if (elapsed < minute) return locale === 'zh' ? '刚刚' : 'Just now';
    // RelativeTimeFormat is not available in all native JS runtimes.
    const unit = elapsed < hour ? 'minute' : elapsed < day ? 'hour' : 'day';
    const count = Math.floor(elapsed / (unit === 'minute' ? minute : unit === 'hour' ? hour : day));
    if (locale === 'zh') {
      const label = unit === 'minute' ? '分钟' : unit === 'hour' ? '小时' : '天';
      return `${count}${label}前`;
    }
    return `${count} ${unit}${count === 1 ? '' : 's'} ago`;
  }

  return new Intl.DateTimeFormat(language, {
    year: sameYear ? undefined : 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(date);
}

export function journeyVersionSummary(
  version: Pick<JourneyVersion, 'changeKind' | 'changedFields'>,
  resolved: ResolvedLang,
  t: Translate,
) {
  if (version.changeKind === 'create') return t('journey.version.created');
  if (version.changeKind === 'restore') return t('journey.version.restored');
  const labels = fieldLabels(version, t);
  return t('journey.version.changedSummary', {
    fields: labels.length ? labels.join(resolved === 'zh' ? '、' : ', ') : t('journey.version.field.other'),
  });
}

export function journeyVersionActivitySummary(
  version: Pick<JourneyVersion, 'changeKind' | 'changedFields'>,
  editor: string,
  resolved: ResolvedLang,
  t: Translate,
) {
  if (version.changeKind === 'create') return t('journey.version.createdBy', { name: editor });
  if (version.changeKind === 'restore') return t('journey.version.restoredBy', { name: editor });
  const labels = fieldLabels(version, t);
  return t('journey.version.activityChanged', {
    name: editor,
    fields: labels.length ? labels.join(resolved === 'zh' ? '、' : ', ') : t('journey.version.field.other'),
  });
}
