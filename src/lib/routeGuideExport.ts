import { Platform, Share } from 'react-native';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { guideText, type RouteCommunityGuide } from '../data/routeGuides';
import { routeGuideCopy } from '../components/discover/routeGuideCopy';
import { journeyDayDisplayLabel } from './journeyDays';

export function guideWeight(weight: number) {
  if (!Number.isFinite(weight) || weight <= 0) return '';
  return weight < 1 ? `${Math.round(weight * 1000)} g` : `${Number(weight.toFixed(2))} kg`;
}

/** A snapshot of the selected guide, never the reader's private journey/gear. */
export function buildGuideDocument(routeName: string, guide: RouteCommunityGuide, lang: 'zh' | 'en', metrics?: { distance?: string; highestElevation?: string }) {
  const gearGroups = [...new Set(guide.plan.gear.map((item) => guideText(item.category, lang)))].map((category) => ({
    title: category,
    items: guide.plan.gear.filter((item) => guideText(item.category, lang) === category).map((item) => ({
      name: guideText(item.name, lang),
      quantity: item.quantity,
      weight: guideWeight(item.weightKg ?? 0),
      note: guideText(item.note, lang),
    })),
  }));
  const weightStats = guide.plan.gear.reduce((stats, item) => {
    const weight = (item.weightKg ?? 0) * Math.max(1, item.quantity);
    if (item.carryStatus === 'worn') stats.worn += weight;
    else if (item.carryStatus === 'consumable') stats.consumable += weight;
    else if (item.carryStatus !== 'optional') stats.base += weight;
    return stats;
  }, { base: 0, consumable: 0, worn: 0 });
  return {
    routeName,
    title: guideText(guide.title, lang),
    author: guideText(guide.author, lang),
    description: guide.description ? guideText(guide.description, lang) : '',
    date: guide.travelDate,
    distance: metrics?.distance || '',
    highestElevation: metrics?.highestElevation || '',
    days: guide.plan.days.map((day, index) => ({
      label: journeyDayDisplayLabel(`Day ${index + 1}`, lang),
      title: isGenericDayLabel(guideText(day.title, lang), index) ? '' : guideText(day.title, lang),
      summary: isGenericDayLabel(guideText(day.summary, lang), index) ? '' : guideText(day.summary, lang),
      detail: guideText(day.detail, lang),
      items: day.items.map((item) => guideText(item, lang)),
    })),
    gearGroups, weightStats: { pack: weightStats.base + weightStats.consumable, ...weightStats },
    totalWeight: guideWeight(guide.plan.gear.reduce((sum, item) => sum + (item.weightKg ?? 0) * item.quantity, 0)),
    review: guideText(guide.review, lang),
  };
}

export type GuideDocumentData = ReturnType<typeof buildGuideDocument>;

export function buildGuideText(data: GuideDocumentData, lang: 'zh' | 'en', checklistOnly = false) {
  const c = routeGuideCopy[lang];
  const lines = [data.title, `${c.authorLabel}：${data.author}`, data.date];
  if (!checklistOnly) {
    lines.push('', c.dayPlan);
    data.days.forEach((day) => lines.push('', `${day.label}${day.title ? ` ${day.title}` : ''}`, ...[day.summary, day.detail].filter(Boolean), ...day.items.map((item, i) => `${i + 1}. ${item}`)));
  }
  lines.push('', c.gearTitle + (data.totalWeight ? `  ${c.totalWeight} ${data.totalWeight}` : ''));
  data.gearGroups.forEach((group) => {
    lines.push('', group.title);
    group.items.forEach((item) => lines.push(`${item.name} ×${item.quantity}${item.weight ? `  ${item.weight}` : ''}`, ...(item.note ? [`  ${item.note}`] : [])));
  });
  if (!checklistOnly) lines.push('', c.reviewTitle, data.review);
  lines.push('', 'Kaipa 开爬');
  return lines.join('\n');
}

function isGenericDayLabel(value: string, index: number) {
  const day = index + 1;
  return value.trim().toLowerCase() === `day ${day}` || value.trim() === `第${day}天` || value.trim() === `第 ${day} 天` || value.trim() === `第${day}日`;
}

export function guideFilename(title: string, extension: string) {
  return `${title.trim().replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').slice(0, 100) || 'kaipa-guide'}.${extension}`;
}

export function downloadGuideFile(uri: string, filename: string) {
  const link = document.createElement('a');
  link.href = uri;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
}

export async function exportGuideText(content: string, filename: string) {
  if (Platform.OS === 'web') {
    const uri = URL.createObjectURL(new Blob(['\uFEFF', content], { type: 'text/plain;charset=utf-8' }));
    downloadGuideFile(uri, filename);
    setTimeout(() => URL.revokeObjectURL(uri), 1000);
    return;
  }
  const file = new File(Paths.cache, filename);
  file.create({ overwrite: true });
  file.write(content);
  try {
    if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(file.uri, { mimeType: 'text/plain', dialogTitle: filename });
    else await Share.share({ title: filename, message: content });
  } finally {
    if (file.exists) file.delete();
  }
}
