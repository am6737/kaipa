import type { PackingPlanProfile } from './packing-coverage.ts';

export type PersonalPlanningProfile = {
  heightCm?: number;
  weightKg?: number;
  ageYears?: number;
  dietaryRestrictions?: string;
};

export type PlanningJourney = {
  days?: unknown;
  total_days?: unknown;
  dist?: unknown;
  asc_?: unknown;
  track_duration_ms?: unknown;
};

export type PlanningItineraryItem = {
  day?: unknown;
  time_mins?: unknown;
  time_end_mins?: unknown;
};

export type NutritionPlanningItem = {
  name: string;
  categoryName?: string;
  quantity: number;
  weightKg?: number;
  estimatedEnergyKcalPerUnit?: number;
};

function finiteNumber(value: unknown) {
  const parsed = typeof value === 'string' ? Number(value.replace(/[^\d.+-]/g, '')) : Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function roundedRange(center: number, spread: number, step: number) {
  const round = (value: number) => Math.max(step, Math.round(value / step) * step);
  return { min: round(center * (1 - spread)), max: round(center * (1 + spread)) };
}

function itineraryHours(items: PlanningItineraryItem[]) {
  const bounds = new Map<string, { start: number; end: number }>();
  items.forEach((item) => {
    const start = finiteNumber(item.time_mins);
    const end = finiteNumber(item.time_end_mins);
    if (start == null || end == null || end <= start) return;
    const day = String(item.day || 'Day 1');
    const current = bounds.get(day);
    bounds.set(day, {
      start: Math.min(current?.start ?? start, start),
      end: Math.max(current?.end ?? end, end),
    });
  });
  const hours = [...bounds.values()].reduce((total, value) => total + (value.end - value.start) / 60, 0);
  return hours > 0 ? hours : undefined;
}

export function normalizePlanningProfile(row: Record<string, unknown> | null | undefined): PersonalPlanningProfile {
  const heightCm = finiteNumber(row?.height_cm);
  const weightKg = finiteNumber(row?.weight_kg);
  const ageYears = finiteNumber(row?.age_years);
  const dietaryRestrictions = typeof row?.dietary_restrictions === 'string' ? row.dietary_restrictions.trim().slice(0, 200) : '';
  return {
    ...(heightCm != null ? { heightCm } : {}),
    ...(weightKg != null ? { weightKg } : {}),
    ...(ageYears != null ? { ageYears } : {}),
    ...(dietaryRestrictions ? { dietaryRestrictions } : {}),
  };
}

export function estimatePersonalPackingNeeds(
  profile: PersonalPlanningProfile,
  journey: PlanningJourney,
  itinerary: PlanningItineraryItem[],
  plan: PackingPlanProfile,
) {
  const days = clamp(Math.round(finiteNumber(journey.total_days) ?? finiteNumber(journey.days) ?? 1), 1, 30);
  const distanceKm = finiteNumber(journey.dist);
  const ascentM = finiteNumber(journey.asc_);
  const recordedHours = finiteNumber(journey.track_duration_ms);
  const scheduledHours = itineraryHours(itinerary);
  const terrainHours = distanceKm != null
    ? Math.max(1, distanceKm / 4.5 + Math.max(0, ascentM || 0) / 600)
    : undefined;
  const totalActiveHours = clamp(
    recordedHours != null && recordedHours > 0 ? recordedHours / 3_600_000 : scheduledHours ?? terrainHours ?? days * 5,
    1,
    days * 14,
  );
  const weightKg = clamp(profile.weightKg ?? 65, 25, 300);
  const profileAdjustment = clamp(
    1
      + ((profile.heightCm ?? 170) - 170) * 0.001
      - ((profile.ageYears ?? 35) - 35) * 0.0015,
    0.92,
    1.08,
  );
  const activityEnergy = totalActiveHours * weightKg * 5.2 * profileAdjustment;
  const restingEnergy = days * weightKg * 22 * profileAdjustment;
  const foodCenter = plan.mealPreparation === 'cook'
    ? restingEnergy + activityEnergy
    : plan.mealPreparation === 'provided'
    ? activityEnergy * 0.32 + days * 180
    : activityEnergy * 0.48 + days * 420;
  const carriedFoodEnergyKcal = roundedRange(Math.max(days * 500, foodCenter), profile.weightKg ? 0.18 : 0.28, 50);
  const foodWeightKg = {
    min: Number((carriedFoodEnergyKcal.min / 5200).toFixed(1)),
    max: Number((carriedFoodEnergyKcal.max / 3200).toFixed(1)),
  };

  const conditions = new Set(plan.conditions || []);
  const hydrationMultiplier = (conditions.has('hot') ? 1.3 : 1) * (conditions.has('high_altitude') ? 1.1 : 1);
  const totalWater = totalActiveHours * 0.55 * hydrationMultiplier;
  const waterCenter = plan.waterRefill === 'treated' || plan.waterRefill === 'natural'
    ? Math.min(totalWater, conditions.has('hot') ? 2 : 1.5)
    : Math.min(totalWater, 6);
  const startingWaterLiters = roundedRange(Math.max(0.75, waterCenter), 0.2, 0.25);

  const knownProfileFields = [profile.heightCm, profile.weightKg, profile.ageYears].filter((value) => value != null).length;
  const knownJourneyFacts = [distanceKm, ascentM, recordedHours || scheduledHours].filter((value) => value != null).length;

  return {
    personalization: {
      dietaryRestrictions: profile.dietaryRestrictions,
      suggestedTrekkingPoleCm: profile.heightCm ? Math.round(profile.heightCm * 0.68) : undefined,
      minimumSleepingBagLengthCm: profile.heightCm ? Math.round(profile.heightCm + 20) : undefined,
    },
    trip: {
      days,
      distanceKm,
      ascentM,
      estimatedActiveHours: Number(totalActiveHours.toFixed(1)),
    },
    recommendation: {
      carriedFoodEnergyKcal,
      foodWeightKg,
      startingWaterLiters,
      comfortableTotalCarryKg: profile.weightKg ? Number((profile.weightKg * 0.2).toFixed(1)) : undefined,
    },
    confidence: knownProfileFields >= 2 && knownJourneyFacts >= 2 ? 'medium' : 'low',
  };
}

const FOOD_PATTERN = /(食物|食品|路餐|餐食|能量棒|蛋白棒|坚果|花生|巧克力|饼干|面包|三明治|饭|面|牛肉干|肉脯|火腿肠|水果|香蕉|苹果|冻干|燕麦|food|meal|snack|bar|nuts?|jerky|chocolate|bread|sandwich|noodles?|fruit)/i;

export function isPlanningFoodItem(item: NutritionPlanningItem) {
  return FOOD_PATTERN.test(`${item.categoryName || ''} ${item.name}`);
}

export function nutritionPlanError(items: NutritionPlanningItem[], target: { min: number; max: number }) {
  const foods = items.filter(isPlanningFoodItem);
  if (!foods.length) return '完整清单必须包含可直接准备的具体路餐或补给食品。';
  const missing = foods.filter((item) => item.estimatedEnergyKcalPerUnit == null);
  if (missing.length) return `请为每项食品提供内部单份热量估算 estimatedEnergyKcalPerUnit：${missing.map((item) => item.name).join('、')}。该数值只用于校验，不会展示或写入清单。`;

  for (const food of foods) {
    const kcal = food.estimatedEnergyKcalPerUnit || 0;
    const grams = (food.weightKg || 0) * 1000;
    if (kcal <= 0 || kcal > 3000 || (grams > 0 && (kcal / grams < 0.25 || kcal / grams > 9))) {
      return `${food.name} 的单份热量估算与单件重量明显不匹配，请按常见包装规格修正。`;
    }
  }

  const total = foods.reduce((sum, item) => sum + (item.estimatedEnergyKcalPerUnit || 0) * item.quantity, 0);
  if (total < target.min * 0.75) return `当前路餐和补给明显不足，请增加具体食品数量后重新提交。`;
  if (total > target.max * 1.35) return `当前路餐和补给明显过量，请减少具体食品数量后重新提交。`;
  return undefined;
}

const DIETARY_RULES: Array<{ restriction: RegExp; conflicts: RegExp }> = [
  { restriction: /(花生|peanut)/i, conflicts: /(花生|peanut)/i },
  { restriction: /(不吃|忌|避免|过敏).{0,5}(牛肉|beef)|no beef/i, conflicts: /(牛肉|beef)/i },
  { restriction: /(不吃|忌|避免|过敏).{0,5}(猪肉|pork)|no pork|清真|halal/i, conflicts: /(猪肉|猪肉脯|培根|火腿|pork|bacon|ham)/i },
  { restriction: /(素食|vegetarian)/i, conflicts: /(牛肉|猪肉|鸡肉|鱼肉|肉脯|肉干|火腿|beef|pork|chicken|fish|jerky|ham)/i },
  { restriction: /(纯素|vegan)/i, conflicts: /(牛肉|猪肉|鸡肉|鱼肉|肉脯|肉干|火腿|牛奶|奶粉|乳清|芝士|鸡蛋|beef|pork|chicken|fish|jerky|ham|milk|whey|cheese|egg)/i },
  { restriction: /(乳糖不耐|奶制品过敏|dairy|lactose)/i, conflicts: /(牛奶|奶粉|乳清|芝士|奶酪|milk|whey|cheese)/i },
];

export function dietaryConflictError(restrictions: string | undefined, items: NutritionPlanningItem[]) {
  if (!restrictions?.trim()) return undefined;
  const conflicts = DIETARY_RULES
    .filter((rule) => rule.restriction.test(restrictions))
    .flatMap((rule) => items.filter((item) => rule.conflicts.test(item.name)).map((item) => item.name));
  const unique = [...new Set(conflicts)];
  return unique.length ? `清单中的 ${unique.join('、')} 与用户的饮食忌口冲突，请更换为不冲突的具体食品。` : undefined;
}
