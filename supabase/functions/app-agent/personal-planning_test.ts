import { dietaryConflictError, estimatePersonalPackingNeeds, normalizePlanningProfile, nutritionPlanError } from './personal-planning.ts';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const dayTrip = { accommodation: 'day_trip', waterRefill: 'none', mealPreparation: 'no_cook' } as const;

Deno.test('database nulls are unknown, not a one-hour zero-distance trip', () => {
  const result = estimatePersonalPackingNeeds({}, { total_days: 1, dist: null, asc_: null, track_duration_ms: null }, [], dayTrip);
  assert(result.trip.estimatedActiveHours === 5, 'Null distance incorrectly replaced the fallback duration');
  assert(result.trip.distanceKm === undefined && result.trip.ascentM === undefined, 'Missing terrain was invented as zero');
});

Deno.test('blank optional body measurements are not invented as zero', () => {
  const profile = normalizePlanningProfile({ height_cm: null, weight_kg: null, age_years: '', dietary_restrictions: null });
  assert(Object.keys(profile).length === 0, 'Blank measurements became numeric profile facts');
});

Deno.test('explicit hiking duration reaches food estimates without prescribing water', () => {
  const fallback = estimatePersonalPackingNeeds({}, { total_days: 1, dist: null }, [], dayTrip);
  const explicit = estimatePersonalPackingNeeds({}, { total_days: 1, dist: null }, [], dayTrip, 8);
  assert(explicit.trip.estimatedActiveHours === 8, 'Explicit duration was ignored');
  assert(explicit.recommendation.carriedFoodEnergyKcal.min > fallback.recommendation.carriedFoodEnergyKcal.min, 'Food did not reflect longer activity');
  assert(!('startingWaterLiters' in explicit.recommendation), 'Estimator must not prescribe water quantities');
});

Deno.test('personal packing estimates degrade gracefully without profile data', () => {
  const result = estimatePersonalPackingNeeds({}, { days: 1, dist: '18 km', asc_: '+900 m' }, [], dayTrip);
  assert(result.confidence === 'low', 'missing profile should keep confidence low');
  assert(!('profile' in result), 'raw body measurements must not be returned to the agent');
  assert(result.recommendation.carriedFoodEnergyKcal.min > 0, 'food estimate should remain usable');
  assert(!('startingWaterLiters' in result.recommendation), 'Missing context must not create a water target');
});

Deno.test('height is reduced to practical sizing guidance', () => {
  const result = estimatePersonalPackingNeeds({ heightCm: 180 }, { days: 1 }, [], dayTrip);
  assert(result.personalization.suggestedTrekkingPoleCm === 122, 'trekking pole guidance should be derived');
  assert(result.personalization.minimumSleepingBagLengthCm === 200, 'sleeping bag guidance should be derived');
});

Deno.test('higher body weight does not reduce food recommendation for the same trip', () => {
  const lighter = estimatePersonalPackingNeeds({ weightKg: 50, heightCm: 165, ageYears: 30 }, { days: 1, dist: '20 km', asc_: '+1000 m' }, [], dayTrip);
  const heavier = estimatePersonalPackingNeeds({ weightKg: 90, heightCm: 180, ageYears: 30 }, { days: 1, dist: '20 km', asc_: '+1000 m' }, [], dayTrip);
  assert(heavier.recommendation.carriedFoodEnergyKcal.min > lighter.recommendation.carriedFoodEnergyKcal.min, 'heavier profile should receive a larger estimate');
});

Deno.test('provided meals reduce carried food compared with camp cooking', () => {
  const profile = { weightKg: 65, heightCm: 170, ageYears: 35 };
  const journey = { days: 2, dist: '28 km', asc_: '+1400 m' };
  const provided = estimatePersonalPackingNeeds(profile, journey, [], { accommodation: 'indoors', waterRefill: 'treated', mealPreparation: 'provided' });
  const camping = estimatePersonalPackingNeeds(profile, journey, [], { accommodation: 'camping', waterRefill: 'natural', mealPreparation: 'cook' });
  assert(provided.recommendation.carriedFoodEnergyKcal.max < camping.recommendation.carriedFoodEnergyKcal.min, 'provided meals should not be packed again');
});

Deno.test('nutrition validation stays internal and checks broad quantity bounds', () => {
  const target = { min: 1000, max: 1500 };
  const adequate = [
    { name: '能量棒', categoryName: '食物', quantity: 4, weightKg: 0.05, estimatedEnergyKcalPerUnit: 210 },
    { name: '混合坚果', categoryName: '食物', quantity: 2, weightKg: 0.1, estimatedEnergyKcalPerUnit: 580 },
  ];
  assert(!nutritionPlanError(adequate, target), 'reasonable food should pass');
  assert(Boolean(nutritionPlanError([{ ...adequate[0], quantity: 1 }], target)), 'too little food should fail');
  assert(Boolean(nutritionPlanError([{ ...adequate[1], quantity: 10 }], target)), 'too much food should fail');
});

Deno.test('dietary restrictions reject obvious conflicting foods', () => {
  const items = [
    { name: '花生能量棒', categoryName: '食物', quantity: 2 },
    { name: '牛肉干', categoryName: '食物', quantity: 2 },
  ];
  const error = dietaryConflictError('花生过敏，不吃牛肉', items);
  assert(error?.includes('花生能量棒') && error.includes('牛肉干'), 'both conflicts should be reported');
  assert(!dietaryConflictError('乳糖不耐', [{ name: '混合坚果', categoryName: '食物', quantity: 2 }]), 'unrelated foods should pass');
});
