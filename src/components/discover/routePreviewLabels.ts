// routePreviewLabels.ts — the words the route detail card reads over its data.
// Kept out of the panel so the sheet's pinned title row uses the same copy.
import { seasonRun } from '../../lib/routePreview';
import type { ResolvedLang, TKey } from '../../i18n';

const ENGLISH_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export type TFn = (key: TKey, vars?: Record<string, string | number>) => string;

const DIFFICULTY_KEYS: Record<'易' | '中' | '中高' | '高', TKey> = {
  易: 'route.preview.diff.易',
  中: 'route.preview.diff.中',
  中高: 'route.preview.diff.中高',
  高: 'route.preview.diff.高',
};

export function difficultyLabel(t: TFn, diff?: '易' | '中' | '中高' | '高'): string | null {
  return diff ? t(DIFFICULTY_KEYS[diff]) : null;
}

/** 连续月份一句话（跨年说「次年」），断裂的月份逐月列出。 */
export function bestSeasonLabel(t: TFn, lang: ResolvedLang, months: number[] | undefined): string | null {
  const run = seasonRun(months);
  if (!run.length) return null;
  if (run.length === 12) return t('route.preview.seasonAllYear');
  const name = (month: number) => (lang === 'en' ? ENGLISH_MONTHS[month - 1] : t('route.preview.month', { n: month }));
  const consecutive = run.every((month, index) => index === 0 || (month - run[index - 1] + 12) % 12 === 1);
  if (!consecutive) return run.map(name).join(t('route.preview.listSeparator'));
  const [first, last] = [name(run[0]), name(run[run.length - 1])];
  if (run.length === 1 || run[0] === run[run.length - 1]) return t('route.preview.seasonSingle', { month: first });
  return run[run.length - 1] > run[0]
    ? t('route.preview.seasonThrough', { from: first, to: last })
    : t('route.preview.seasonNextYear', { from: first, to: last });
}
