import { missingPackingCoverage, requiresFullPackingPlan, type PackingCoverageItem, type PackingPlanProfile } from './packing-coverage.ts';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const baseline: PackingCoverageItem[] = [
  { name: '日行背包', attributes: [{ name: '容量', value: '20L' }], quantity: 1 },
  { name: '低帮徒步鞋', quantity: 1 },
  { name: '速干上衣', quantity: 1 },
  { name: '瓶装矿泉水', attributes: [{ name: '容量', value: '1.5L/瓶' }], quantity: 2 },
  { name: '能量棒', attributes: [{ name: '单份净重', value: '50g/根' }], quantity: 4 },
  { name: '离线地图手机', quantity: 1 },
  { name: 'USB-C 移动电源', attributes: [{ name: '容量', value: '10000mAh' }], quantity: 1 },
  { name: '头灯', quantity: 1 },
  { name: '轻量雨衣', quantity: 1 },
  { name: 'SPF50 防晒霜', quantity: 1 },
  { name: '碘伏棉签', quantity: 8 },
  { name: '无菌纱布片', quantity: 4 },
  { name: '弹性绷带', quantity: 1 },
  { name: '水泡贴', quantity: 5 },
  { name: '救生哨', quantity: 1 },
];

const dayTrip: PackingPlanProfile = {
  accommodation: 'day_trip',
  waterRefill: 'none',
  mealPreparation: 'no_cook',
};

Deno.test('full day-trip coverage accepts a complete actionable list', () => {
  const gaps = missingPackingCoverage(baseline, dayTrip);
  assert(gaps.length === 0, `unexpected gaps: ${gaps.map((gap) => gap.key).join(', ')}`);
});

Deno.test('camping and natural water add contextual requirements', () => {
  const gaps = missingPackingCoverage(baseline, {
    accommodation: 'camping',
    waterRefill: 'natural',
    mealPreparation: 'cook',
    conditions: ['cold'],
  });
  for (const key of ['purification', 'shelter', 'sleepingBag', 'sleepingPad', 'stove', 'fuel', 'cookware', 'warmth']) {
    assert(gaps.some((gap) => gap.key === key), `expected ${key} gap`);
  }
});

Deno.test('vague legacy items do not satisfy full-plan coverage', () => {
  const gaps = missingPackingCoverage([
    ...baseline.filter((item) => !item.name.includes('矿泉水')),
    { name: '饮用水', quantity: 2 },
  ], dayTrip);
  assert(gaps.some((gap) => gap.key === 'hydration'), 'vague water must not satisfy hydration');
});

Deno.test('full packing intent detection leaves incremental requests alone', () => {
  assert(requiresFullPackingPlan('帮我生成一份完整装备清单'), 'expected full Chinese request');
  assert(requiresFullPackingPlan('prepare a complete packing list'), 'expected full English request');
  assert(!requiresFullPackingPlan('再加一根充电线'), 'incremental request must remain incremental');
});
