export type PackingItemDraft = {
  name: string;
  attributes?: Array<{ name: string; value: string }>;
  quantity: number;
};

export type PackingValidationIssue = {
  index: number;
  name: string;
  message: string;
};

const WATER_PRODUCT = /(饮用水|矿泉水|瓶装水|纯净水|水壶|水瓶|水袋)/i;
const BOTTLED_WATER = /(饮用水|矿泉水|瓶装水|纯净水)/i;
const WATER_TREATMENT = /(净水|滤水|过滤)/i;
const WATER_CAPACITY = /\d+(?:\.\d+)?\s*(?:ml|毫升|l|升)/i;
const POWER_BANK = /(充电宝|移动电源|power\s*bank)/i;
const POWER_CAPACITY = /\d[\d,.]*\s*(?:mah|毫安时|wh|瓦时)/i;
const UNSPLIT_KIT = /^(?:个人)?(?:急救|医药)(?:包|箱|套装)$/i;
const GENERIC_FOOD = /^.{0,8}(?:路餐|餐食|食物|干粮|零食|能量食品)$/i;
const GENERIC_ITEMS = /^(?:饮用水|水|充电宝|移动电源|个人药品|常用药|换洗衣物|衣物|备用衣物)$/i;
const PACKAGED_TRAIL_FOOD = /(能量棒|蛋白棒|牛肉干|肉脯|坚果|燕麦|巧克力|饼干|方便面|速食|冻干|自热|火腿肠|电解质(?:粉|片|冲剂))/i;
const PORTION_SIZE = /\d+(?:\.\d+)?\s*(?:g|克|kg|千克|ml|毫升|l|升)(?:\s*\/\s*(?:包|袋|根|瓶|份))?/i;
const FUEL_BY_WEIGHT = /(气罐|燃料)/i;
const WEIGHT_IN_NAME = /(?:^|[\s（(])(?:约\s*)?\d+(?:\.\d+)?\s*(?:g|克|kg|千克)(?:[\s）)]|$)/i;
const WEIGHT_ONLY_SPECIFICATION = /^(?:约\s*)?\d+(?:\.\d+)?\s*(?:g|克|kg|千克)$/i;
const REDUNDANT_ATTRIBUTE_RULES = [
  { item: /头灯/i, attribute: /(?:亮度.*可调|可调.*亮度)/i },
  { item: /(?:头灯)?电池/i, attribute: /^(?:兼容性\s+)?(?:匹配|适配)(?:头灯)?型号$/i },
  { item: /遮阳帽/i, attribute: /帽檐/i },
  { item: /(?:太阳镜|墨镜)/i, attribute: /(?:防|抗)(?:uv|紫外线)/i },
  { item: /碘伏棉棒/i, attribute: /独立包装/i },
  { item: /创可贴/i, attribute: /(?:大|中|小)号/i },
];

function compact(value: string | undefined) {
  return value?.trim().replace(/\s+/g, ' ') || '';
}

function attributeText(item: PackingItemDraft) {
  return (item.attributes || []).map((attribute) => `${compact(attribute.name)} ${compact(attribute.value)}`).join(' ');
}

export function packingItemDisplayName(item: PackingItemDraft) {
  return compact(item.name);
}

export function packingItemIdentityKey(item: PackingItemDraft) {
  const attributes = (item.attributes || [])
    .map((attribute) => [compact(attribute.name).toLocaleLowerCase(), compact(attribute.value).toLocaleLowerCase()] as const)
    .sort(([leftName, leftValue], [rightName, rightValue]) => `${leftName}\u0000${leftValue}`.localeCompare(`${rightName}\u0000${rightValue}`));
  return JSON.stringify([packingItemDisplayName(item).toLocaleLowerCase(), attributes]);
}

export function packingItemSearchText(item: PackingItemDraft) {
  return `${packingItemDisplayName(item)} ${attributeText(item)}`.trim();
}

export function validatePackingItems(items: PackingItemDraft[]): PackingValidationIssue[] {
  const issues: PackingValidationIssue[] = [];

  items.forEach((item, index) => {
    const name = compact(item.name);
    const details = packingItemSearchText(item);
    const issue = (message: string) => issues.push({ index, name: name || `第 ${index + 1} 项`, message });

    if (UNSPLIT_KIT.test(name)) {
      issue('不能用套装名称代替内容物，请把消毒、创口处理、包扎固定、水泡处理和必要药品分别列项');
      return;
    }
    if (GENERIC_FOOD.test(name)) {
      issue('餐食必须拆成可购买的具体食品，并为包装食品注明单份克重或容量');
      return;
    }
    if (GENERIC_ITEMS.test(name)) {
      issue('名称过于笼统，请改成可直接购买或准备的具体物品');
      return;
    }
    if (WATER_PRODUCT.test(name) && !WATER_TREATMENT.test(name) && !WATER_CAPACITY.test(details)) {
      issue('饮水容器或瓶装水必须注明容量，例如 1.5L 或 500ml');
    }
    if (BOTTLED_WATER.test(name) && WATER_CAPACITY.test(name)) {
      issue('瓶装水容量必须写入 attributes 自定义字段，不要写在品名中');
    }
    if (POWER_BANK.test(name) && !POWER_CAPACITY.test(details)) {
      issue('移动电源必须注明容量，例如 20000mAh');
    }
    if (PACKAGED_TRAIL_FOOD.test(name) && !PORTION_SIZE.test(details)) {
      issue('包装路餐必须注明单份克重或容量，例如 50g/根或 100g/袋');
    }
    if (!PACKAGED_TRAIL_FOOD.test(name) && !FUEL_BY_WEIGHT.test(name)
      && (WEIGHT_IN_NAME.test(name) || (item.attributes || []).some((attribute) => WEIGHT_ONLY_SPECIFICATION.test(compact(attribute.value)) && /重量|净重/i.test(attribute.name)))) {
      issue('单件携带重量必须写入 weightKg，不要写在品名或自定义字段中');
    }
    if (REDUNDANT_ATTRIBUTE_RULES.some((rule) => rule.item.test(name) && (item.attributes || []).some((attribute) => rule.attribute.test(`${attribute.name} ${attribute.value}`)))) {
      issue('自定义字段包含不影响购买或安全的常识描述，请删除该字段');
    }
    if (packingItemDisplayName(item).length > 120) {
      issue('品名不能超过 120 个字符，请精简非关键描述');
    }
  });

  return issues;
}

function waterCapacityLiters(item: PackingItemDraft) {
  if (!BOTTLED_WATER.test(item.name)) return undefined;
  const match = packingItemSearchText(item).match(/(\d+(?:\.\d+)?)\s*(ml|毫升|l|升)/i);
  if (!match) return undefined;
  const value = Number(match[1]);
  return /^(?:ml|毫升)$/i.test(match[2]) ? value / 1000 : value;
}

export function requiresMixedWaterPlan(message: string, waterRefill: string) {
  if (waterRefill !== 'none') return false;
  const hourMatch = message.match(/(\d+(?:\.\d+)?)\s*(?:小时|h(?:ours?)?)/i);
  return /(?:全天|全日|一日|一天)/.test(message) || (hourMatch ? Number(hourMatch[1]) >= 4 : false);
}

export function packingWaterMixError(items: PackingItemDraft[]) {
  const variants = items.map((item) => ({ item, liters: waterCapacityLiters(item) })).filter((entry): entry is { item: PackingItemDraft; liters: number } => entry.liters != null);
  const hasLarge = variants.some((entry) => entry.liters >= 1.2 && entry.liters <= 2);
  const hasSmall = variants.some((entry) => entry.liters >= 0.45 && entry.liters <= 0.75);
  const totalLiters = variants.reduce((total, entry) => total + entry.liters * entry.item.quantity, 0);
  return hasLarge && hasSmall && totalLiters >= 2
    ? undefined
    : `全天或连续数小时无补水的清单需要混合携水：至少一瓶 1.2L/1.5L 瓶装饮用水，加一瓶或多瓶 500ml/550ml 瓶装饮用水，总量不少于约 2L；水壶或空水瓶不能代替实际饮水。当前明确饮水总量为 ${Number(totalLiters.toFixed(2))}L。`;
}

export function packingValidationError(issues: PackingValidationIssue[]) {
  const details = issues
    .slice(0, 12)
    .map((issue) => `${issue.index + 1}. ${issue.name}：${issue.message}`)
    .join('\n');
  const remainder = issues.length > 12 ? `\n另有 ${issues.length - 12} 项不合格。` : '';
  return `装备清单未达到可直接备齐的标准，请修正所有问题后重新调用 add_packing_items：\n${details}${remainder}`;
}
