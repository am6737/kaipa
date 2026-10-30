// gearRecognition.ts — turns a pasted link or a recognized photo into fields
// for the add gear form.
import { GearCat, GearItem } from '../../data/gear';
import { GearLinkPreview } from '../../lib/gearLinkPreview';

export function firstLink(text: string) {
  return text.match(/https?:\/\/[^\s，、]+/i)?.[0]?.trim() || '';
}

export function providerLabel(provider: GearLinkPreview['provider']) {
  if (provider === 'taobao') return '淘宝';
  if (provider === 'tmall') return '天猫';
  if (provider === 'jd') return '京东';
  if (provider === 'dewu') return '得物';
  if (provider === 'douyin') return '抖音';
  return '商品页';
}

export function defaultGearCat(cats: GearCat[]) {
  return cats.find((candidate) => candidate.id === 'misc')?.id || cats[0]?.id || 'misc';
}

// Blank draft the add form opens with.
export function blankGearItem(cats: GearCat[]): GearItem {
  return { name: '', cat: defaultGearCat(cats), w: 0, p: 0 };
}

function inferCategory(preview: GearLinkPreview, cats: GearCat[]) {
  const haystack = `${preview.name} ${preview.category || ''}`.toLowerCase();
  const rules: [string, string[]][] = [
    ['pack', ['背包', '腰包', 'pack', 'backpack']],
    ['shelter', ['帐篷', '天幕', '地布', 'tent', 'shelter']],
    ['sleep', ['睡袋', '睡垫', '枕', 'sleep', 'mattress']],
    ['cloth', ['衣', '裤', '鞋', '袜', '帽', '手套', 'jacket', 'shoe', 'shirt']],
    ['cook', ['炉', '锅', '水壶', '滤水', '餐具', 'stove', 'cook']],
    ['elec', ['头灯', '手表', 'gps', '电池', '充电', '相机', 'camera']],
    ['safe', ['急救', '登山杖', '冰爪', '头盔', '绳', '安全']],
  ];
  const matched = rules.find(([, words]) => words.some((word) => haystack.includes(word)))?.[0];
  return cats.find((candidate) => candidate.id === matched)?.id || defaultGearCat(cats);
}

export function itemFromLinkPreview(preview: GearLinkPreview, cats: GearCat[]): GearItem {
  return {
    name: preview.name,
    cat: inferCategory(preview, cats),
    w: preview.weightKg || 0,
    p: preview.priceCny || 0,
    attrs: preview.attrs.length ? preview.attrs : undefined,
    photos: preview.imageUrl ? [preview.imageUrl] : undefined,
  };
}
