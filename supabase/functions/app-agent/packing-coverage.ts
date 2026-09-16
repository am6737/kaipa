import { packingItemSearchText, validatePackingItems, type PackingItemDraft } from './packing-validation.ts';

export type PackingPlanProfile = {
  accommodation: 'day_trip' | 'indoors' | 'camping' | 'unknown';
  waterRefill: 'none' | 'treated' | 'natural' | 'unknown';
  mealPreparation: 'no_cook' | 'cook' | 'provided' | 'unknown';
  conditions?: Array<'hot' | 'cold' | 'wet' | 'snow' | 'high_altitude'>;
};

export type PackingCoverageItem = PackingItemDraft & {
  categoryName?: string;
};

export type PackingCoverageGap = {
  key: string;
  label: string;
};

const RULES: Record<string, { label: string; pattern: RegExp }> = {
  backpack: { label: '合适容量的背包', pattern: /背包/ },
  footwear: { label: '适合路线的徒步鞋或登山鞋', pattern: /(徒步鞋|登山鞋|越野跑鞋|防滑鞋)/ },
  clothing: { label: '贴身或行进衣物', pattern: /(速干|排汗|衣|裤|袜)/ },
  hydration: { label: '饮水或饮水容器', pattern: /(矿泉水|瓶装水|纯净水|饮用水|水壶|水瓶|水袋)/ },
  carriedWater: { label: '明确容量的实际携带饮水', pattern: /(矿泉水|瓶装水|纯净水|饮用水)/ },
  purification: { label: '适用于天然水源的净水装备', pattern: /(净水器|净水滤芯|净水片|净水药片|过滤水壶)/ },
  food: { label: '可直接准备的具体餐食或能量食品', pattern: /(能量棒|蛋白棒|牛肉干|肉脯|坚果|燕麦|巧克力|饼干|面包|三明治|饭|面|火腿肠|水果|香蕉|苹果)/ },
  navigation: { label: '导航或通信设备', pattern: /(手机|地图|指南针|GPS|导航设备|导航手表|inReach|卫星通信)/i },
  power: { label: '有明确容量的备用电源', pattern: /(充电宝|移动电源)/ },
  lighting: { label: '头灯或手电', pattern: /(头灯|手电)/ },
  rain: { label: '防雨装备', pattern: /(雨衣|雨披|冲锋衣|防雨外套)/ },
  sun: { label: '防晒用品', pattern: /(防晒|遮阳帽|太阳镜)/ },
  warmth: { label: '保暖层', pattern: /(保暖|抓绒|羽绒|棉服)/ },
  disinfect: { label: '消毒用品', pattern: /(碘伏|酒精|消毒)/ },
  wound: { label: '创口覆盖用品', pattern: /(创可贴|纱布|敷料)/ },
  bandage: { label: '包扎固定用品', pattern: /(绷带|医用胶带|医用胶布)/ },
  blister: { label: '水泡或防磨处理用品', pattern: /(水泡贴|防磨贴|防磨膏|润滑膏)/ },
  emergency: { label: '应急求救或保温用品', pattern: /(救生哨|求生哨|哨子|保温毯|急救毯|应急毯|inReach|卫星通信)/i },
  shelter: { label: '露营庇护装备', pattern: /(帐篷|天幕|露营袋|bivy)/i },
  sleepingBag: { label: '睡袋', pattern: /睡袋/ },
  sleepingPad: { label: '睡垫或防潮垫', pattern: /(睡垫|防潮垫)/ },
  stove: { label: '炉具', pattern: /(炉头|炉具|一体炉)/ },
  fuel: { label: '与炉具匹配的燃料', pattern: /(气罐|燃料瓶|酒精燃料|固体燃料)/ },
  cookware: { label: '炊具', pattern: /(锅|饭盒|炊具)/ },
};

function requiredRuleKeys(profile: PackingPlanProfile) {
  const required = new Set([
    'backpack', 'footwear', 'clothing', 'hydration', 'food', 'navigation', 'power', 'lighting',
    'rain', 'sun', 'disinfect', 'wound', 'bandage', 'blister', 'emergency',
  ]);
  if (profile.waterRefill === 'natural') required.add('purification');
  if (profile.waterRefill === 'none' || profile.waterRefill === 'unknown') required.add('carriedWater');
  if (profile.accommodation === 'camping') {
    required.add('shelter');
    required.add('sleepingBag');
    required.add('sleepingPad');
  }
  if (profile.mealPreparation === 'cook') {
    required.add('stove');
    required.add('fuel');
    required.add('cookware');
  }
  if (profile.conditions?.some((condition) => condition === 'cold' || condition === 'snow' || condition === 'high_altitude')) required.add('warmth');
  return required;
}

export function missingPackingCoverage(items: PackingCoverageItem[], profile: PackingPlanProfile): PackingCoverageGap[] {
  const actionableItems = items.filter((item) => validatePackingItems([item]).length === 0);
  const searchable = actionableItems.map((item) => `${packingItemSearchText(item)} ${item.categoryName || ''}`).join('\n');
  return [...requiredRuleKeys(profile)].flatMap((key) => RULES[key].pattern.test(searchable) ? [] : [{ key, label: RULES[key].label }]);
}

export function packingCoverageError(gaps: PackingCoverageGap[]) {
  return `完整装备清单仍缺少必要类别：${gaps.map((gap) => gap.label).join('、')}。请补齐后以 mode=full 重新调用 add_packing_items。`;
}

export function requiresFullPackingPlan(message: string) {
  return /(?:完整|整份|全套).{0,12}(?:装备)?清单|(?:生成|规划|整理|准备|创建).{0,12}(?:装备)?清单|(?:装备)?清单.{0,8}(?:完整|整份|全套)|(?:full|complete).{0,12}(?:packing|gear).{0,8}list/i.test(message);
}
