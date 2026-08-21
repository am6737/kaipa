import type { ResolvedLang } from '../i18n';

function chineseNumber(value: number): string {
  if (value <= 0 || value > 99) return String(value);
  const digits = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
  if (value < 10) return digits[value];
  const tens = Math.floor(value / 10);
  const ones = value % 10;
  return `${tens === 1 ? '' : digits[tens]}十${ones ? digits[ones] : ''}`;
}

function chineseDayNumber(value: string): number | undefined {
  const digits: Record<string, number> = { 零: 0, 〇: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
  if (value === '十') return 10;
  const tenIndex = value.indexOf('十');
  if (tenIndex >= 0) {
    const tens = tenIndex === 0 ? 1 : digits[value[tenIndex - 1]];
    const ones = tenIndex === value.length - 1 ? 0 : digits[value[tenIndex + 1]];
    return tens == null || ones == null ? undefined : tens * 10 + ones;
  }
  const parsed = [...value].reduce((total, character) => digits[character] == null ? Number.NaN : total * 10 + digits[character], 0);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

export function journeyDayOrdinal(label: string): number | undefined {
  const trimmed = label.trim();
  const numeric = trimmed.match(/^(?:第\s*)?(\d+)\s*(?:天|日)?$|^Day\s*(\d+)$/i);
  if (numeric) {
    const value = Number(numeric[1] || numeric[2]);
    return value > 0 ? value : undefined;
  }
  const chinese = trimmed.match(/^第\s*([零〇一二两三四五六七八九十]+)\s*(?:天|日)$/);
  return chinese ? chineseDayNumber(chinese[1]) : undefined;
}

export const journeyDayKey = (index: number) => `Day ${index}`;

export function journeyDayDisplayLabel(label: string, resolved: ResolvedLang): string {
  const ordinal = journeyDayOrdinal(label);
  if (!ordinal) return label;
  return resolved === 'zh' ? `第${chineseNumber(ordinal)}天` : journeyDayKey(ordinal);
}

export function nextJourneyDayKey(labels: string[]): string {
  const used = new Set(labels.map(journeyDayOrdinal).filter((value): value is number => value != null));
  let index = 1;
  while (used.has(index)) index += 1;
  return journeyDayKey(index);
}
