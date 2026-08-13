// gear.ts — 装备 tab data: categories, items, packing sets, metric aggregation.
// Ported/condensed from the gx-* prototype data.

export interface GearCat {
  id: string;
  name: string;
  color: string;
  builtin: boolean;
}

export type GearCarryStatus = 'packed' | 'worn' | 'consumable' | 'optional';

export interface GearItem {
  id?: number;
  name: string;
  cat: string;
  w: number; // kg, per unit
  p: number; // ¥, per unit
  qty?: number;
  // LighterPack-style carrying role. packed/base counts toward base weight;
  // worn stays on body; consumable is food/fuel/water; optional is excluded.
  status?: GearCarryStatus;
  // User-uploaded product photos. The first photo is the cover image.
  photos?: string[];
  attrs?: [string, string][];
  note?: string;
}

export interface GearSetOverride {
  qty?: number;
  status?: GearCarryStatus;
}

export interface GearSet {
  id: string;
  name: string;
  description?: string;
  items: string[]; // item names
  // Per-set overrides keyed by item id (with item name fallback for local/demo data).
  overrides?: Record<string, GearSetOverride>;
}

export type Metric = 'price' | 'weight' | 'count';
export type WeightUnit = 'kg' | 'g' | 'oz' | 'lb';

export const WEIGHT_UNITS: WeightUnit[] = ['kg', 'g', 'oz', 'lb'];

export const GEAR_STATUS: { id: GearCarryStatus; label: string; short: string }[] = [
  { id: 'packed', label: '包内', short: 'Base' },
  { id: 'worn', label: '穿戴', short: 'Worn' },
  { id: 'consumable', label: '消耗', short: 'Cons' },
  { id: 'optional', label: '备选', short: 'Opt' },
];

export const METRICS: { id: Metric; label: string }[] = [
  { id: 'price', label: '价值' },
  { id: 'weight', label: '重量' },
  { id: 'count', label: '数量' },
];

// Compact preset palette for categories. Arbitrary HEX colours are also
// supported by the category editor.
export const GX_PALETTE = [
  '#FF3B30', '#FF9500', '#34C759', '#00C7BE',
  '#32ADE6', '#5856D6', '#FF2D55', '#8E8E93',
];

export const GX_CATS: GearCat[] = [
  { id: 'pack', name: '背负系统', color: '#FF3B30', builtin: false },
  { id: 'shelter', name: '庇护系统', color: '#FF9500', builtin: false },
  { id: 'sleep', name: '睡眠系统', color: '#5856D6', builtin: false },
  { id: 'cloth', name: '服饰系统', color: '#34C759', builtin: false },
  { id: 'cook', name: '饮食系统', color: '#00C7BE', builtin: false },
  { id: 'elec', name: '电子导航', color: '#32ADE6', builtin: false },
  { id: 'safe', name: '安全急救', color: '#FF2D55', builtin: false },
  { id: 'misc', name: '其他', color: '#8E8E93', builtin: false },
];

export const UNCAT: GearCat = { id: 'uncat', name: '未分类', color: '#8E8E93', builtin: false };

export const GX_ITEMS: GearItem[] = [
  { name: 'Osprey Talon 33', cat: 'pack', w: 0.86, p: 1100, attrs: [['容量', '33 L'], ['尺码', 'S/M'], ['颜色', '岩灰']] },
  { name: 'HMG 2400 Southwest', cat: 'pack', w: 0.78, p: 2980, attrs: [['容量', '40 L']] },
  { name: '攻顶包 18L', cat: 'pack', w: 0.32, p: 320 },
  { name: 'Big Agnes Copper Spur HV UL2', cat: 'shelter', w: 1.32, p: 3380, attrs: [['人数', '2P']] },
  { name: 'MSR 地钉 ×8', cat: 'shelter', w: 0.12, p: 160 },
  { name: '地布 Tyvek', cat: 'shelter', w: 0.18, p: 120 },
  { name: 'Nemo Disco 15 羽绒睡袋', cat: 'sleep', w: 0.96, p: 2200, attrs: [['温标', '-9°C']] },
  { name: 'Therm-a-Rest NeoAir XLite', cat: 'sleep', w: 0.35, p: 1480, attrs: [['R 值', '4.2']] },
  { name: '充气枕', cat: 'sleep', w: 0.08, p: 120 },
  { name: 'Arc’teryx Beta AR 冲锋衣', cat: 'cloth', w: 0.44, p: 4200, attrs: [['尺码', 'M'], ['颜色', '黑']] },
  { name: 'Patagonia Nano Puff 棉服', cat: 'cloth', w: 0.34, p: 1680 },
  { name: '抓绒中层', cat: 'cloth', w: 0.3, p: 680 },
  { name: '速干裤', cat: 'cloth', w: 0.28, p: 520, qty: 2 },
  { name: '羊毛袜', cat: 'cloth', w: 0.06, p: 120, qty: 3 },
  { name: 'MSR PocketRocket 2 炉头', cat: 'cook', w: 0.073, p: 360 },
  { name: 'TOAKS 钛锅 750ml', cat: 'cook', w: 0.103, p: 280 },
  { name: '气罐 230g', cat: 'cook', w: 0.36, p: 45, qty: 2 },
  { name: '钛勺', cat: 'cook', w: 0.018, p: 60 },
  { name: 'Garmin inReach Mini 2', cat: 'elec', w: 0.1, p: 3280, attrs: [['卫星通讯', '是']] },
  { name: '头灯 Petzl Actik Core', cat: 'elec', w: 0.075, p: 420 },
  { name: '充电宝 20000mAh', cat: 'elec', w: 0.34, p: 260 },
  { name: 'GPS 手表 Fenix 7', cat: 'elec', w: 0.079, p: 5180 },
  { name: '急救包', cat: 'safe', w: 0.28, p: 280 },
  { name: '登山杖 一对', cat: 'safe', w: 0.46, p: 680 },
  { name: '哨子 + 指北针', cat: 'safe', w: 0.04, p: 90 },
  { name: '防晒霜 + 唇膏', cat: 'misc', w: 0.12, p: 160 },
  { name: '驱蚊液', cat: 'misc', w: 0.1, p: 60 },
  { name: '湿巾 + 垃圾袋', cat: 'misc', w: 0.15, p: 40 },
];

export const GX_SETS: GearSet[] = [
  { id: 's1', name: '高海拔三天两夜', items: ['HMG 2400 Southwest', 'Big Agnes Copper Spur HV UL2', 'Nemo Disco 15 羽绒睡袋', 'Therm-a-Rest NeoAir XLite', 'Arc’teryx Beta AR 冲锋衣', 'MSR PocketRocket 2 炉头', 'Garmin inReach Mini 2', '急救包'] },
  { id: 's2', name: '低海拔轻徒步', items: ['Osprey Talon 33', '速干裤', '抓绒中层', 'TOAKS 钛锅 750ml', '头灯 Petzl Actik Core'] },
  { id: 's3', name: '雪山技术线', items: ['HMG 2400 Southwest', 'Arc’teryx Beta AR 冲锋衣', 'Big Agnes Copper Spur HV UL2', 'Nemo Disco 15 羽绒睡袋', '登山杖 一对', '急救包', 'Garmin inReach Mini 2'] },
  { id: 's4', name: '摄影露营', items: ['Big Agnes Copper Spur HV UL2', 'Nemo Disco 15 羽绒睡袋', 'GPS 手表 Fenix 7', '充电宝 20000mAh', 'TOAKS 钛锅 750ml'] },
];

export function catById(id: string, cats: GearCat[] = GX_CATS): GearCat {
  return cats.find((c) => c.id === id) || UNCAT;
}

export function itemQty(item: GearItem): number { return item.qty || 1; }
export function itemWeight(item: GearItem): number { return item.w * itemQty(item); }
export function itemPrice(item: GearItem): number { return item.p * itemQty(item); }
export function itemStatus(item: GearItem): GearCarryStatus { return item.status || 'packed'; }
export function isCarried(item: GearItem): boolean { return itemStatus(item) !== 'optional'; }

export function metricValue(item: GearItem, metric: Metric): number {
  if (metric === 'price') return itemPrice(item);
  if (metric === 'weight') return itemWeight(item);
  return itemQty(item);
}

export function packStats(items: GearItem[]) {
  let base = 0, worn = 0, consumable = 0, optional = 0, price = 0, count = 0;
  for (const it of items) {
    const w = itemWeight(it);
    price += itemPrice(it);
    count += itemQty(it);
    const st = itemStatus(it);
    if (st === 'worn') worn += w;
    else if (st === 'consumable') consumable += w;
    else if (st === 'optional') optional += w;
    else base += w;
  }
  return { base, worn, consumable, optional, pack: base + consumable, skinOut: base + worn + consumable, price, count, kinds: items.length };
}

export interface CatAgg {
  cat: GearCat;
  value: number;
}

// Group items by category and sum the chosen metric, sorted descending.
export function aggregateByCat(items: GearItem[], metric: Metric, cats: GearCat[] = GX_CATS): CatAgg[] {
  const map = new Map<string, number>();
  for (const it of items) {
    map.set(it.cat, (map.get(it.cat) || 0) + metricValue(it, metric));
  }
  const out: CatAgg[] = [];
  for (const [id, value] of map.entries()) {
    if (value > 0) out.push({ cat: catById(id, cats), value });
  }
  return out.sort((a, b) => b.value - a.value);
}

export function metricTotals(items: GearItem[]) {
  let price = 0;
  let weight = 0;
  let count = 0;
  for (const it of items) {
    const q = it.qty || 1;
    price += it.p * q;
    weight += it.w * q;
    count += q;
  }
  return { price, weight, count, kinds: items.length };
}

export function convertWeight(kg: number, unit: WeightUnit): number {
  if (unit === 'g') return kg * 1000;
  if (unit === 'oz') return kg * 35.27396195;
  if (unit === 'lb') return kg * 2.2046226218;
  return kg;
}

export function fmtWeight(kg: number, unit: WeightUnit = 'kg', compact = false): string {
  const v = convertWeight(kg, unit);
  if (unit === 'g') return `${Math.round(v)} g`;
  if (unit === 'oz') return `${v >= 100 ? v.toFixed(0) : v.toFixed(1)} oz`;
  if (unit === 'lb') return `${v >= 10 || compact ? v.toFixed(1) : v.toFixed(2)} lb`;
  return `${v >= 10 || compact ? v.toFixed(1) : v.toFixed(2)} kg`;
}

export function splitWeight(kg: number, unit: WeightUnit = 'kg', compact = false): { value: string; unit: string } {
  const text = fmtWeight(kg, unit, compact);
  const i = text.lastIndexOf(' ');
  return i > 0 ? { value: text.slice(0, i), unit: text.slice(i + 1) } : { value: text, unit };
}

const fmtPriceValue = (value: number): string => {
  const rounded = Math.round(value);
  if (Math.abs(rounded) <= 100000) return String(rounded);
  const wan = rounded / 10000;
  return `${wan >= 10 ? wan.toFixed(1) : wan.toFixed(2).replace(/0$/, '')}万`;
};

export function fmtMetric(value: number, metric: Metric, unit: WeightUnit = 'kg'): string {
  if (metric === 'price') return '¥' + fmtPriceValue(value);
  if (metric === 'weight') return fmtWeight(value, unit);
  return String(Math.round(value)) + ' 件';
}
