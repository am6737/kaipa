import { packingItemDisplayName, packingItemIdentityKey, packingValidationError, packingWaterMixError, requiresMixedWaterPlan, validatePackingItems } from './packing-validation.ts';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

Deno.test('packing validation rejects vague umbrella items', () => {
  const issues = validatePackingItems([
    { name: '饮用水', quantity: 2 },
    { name: '午间路餐', quantity: 1 },
    { name: '充电宝', quantity: 1 },
    { name: '急救包', quantity: 1 },
  ]);
  assert(issues.length === 4, `expected 4 issues, got ${issues.length}`);
});

Deno.test('packing validation accepts actionable specifications', () => {
  const issues = validatePackingItems([
    { name: '瓶装矿泉水', attributes: [{ name: '容量', value: '1.5L/瓶' }], quantity: 2 },
    { name: '能量棒', attributes: [{ name: '单份净重', value: '50g/根' }], quantity: 4 },
    { name: 'USB-C 充电宝', attributes: [{ name: '容量', value: '20000mAh' }, { name: '快充', value: 'PD' }], quantity: 1 },
    { name: '无菌纱布片', quantity: 4 },
    { name: '水泡贴', quantity: 4 },
    { name: '中空纤维滤水器', attributes: [{ name: '接口', value: '软水袋接口' }], quantity: 1 },
  ]);
  assert(issues.length === 0, `expected no issues, got ${packingValidationError(issues)}`);
});

Deno.test('packing validation requires decisive capacities', () => {
  const issues = validatePackingItems([
    { name: '折叠水袋', quantity: 1 },
    { name: 'USB-C 移动电源', attributes: [{ name: '快充', value: 'PD' }], quantity: 1 },
  ]);
  assert(issues.length === 2, `expected 2 issues, got ${issues.length}`);
  assert(issues[0].message.includes('容量'), 'water issue should request capacity');
  assert(issues[1].message.includes('容量'), 'power issue should request capacity');
});

Deno.test('packing validation requires food portions but not obvious first-aid details', () => {
  const issues = validatePackingItems([
    { name: '能量棒', quantity: 4 },
    { name: '弹性绷带', quantity: 2 },
    { name: '创可贴', quantity: 6 },
  ]);
  assert(issues.length === 1, `expected 1 issue, got ${issues.length}`);
  assert(issues[0].message.includes('单份克重'), 'food issue should request a portion size');
});

Deno.test('packing validation keeps carried weight out of equipment titles', () => {
  const issues = validatePackingItems([
    { name: '头灯', attributes: [{ name: '重量', value: '90g' }], quantity: 1 },
    { name: '约 300g 冲锋衣', quantity: 1 },
    { name: '能量棒', attributes: [{ name: '单份净重', value: '50g/根' }], quantity: 4 },
    { name: '异丁烷气罐', attributes: [{ name: '净含量', value: '230g' }], quantity: 1 },
  ]);
  assert(issues.length === 2, `expected 2 weight placement issues, got ${packingValidationError(issues)}`);
  assert(issues.every((issue) => issue.message.includes('weightKg')), 'weight issues should point to the structured field');
});

Deno.test('packing validation rejects redundant common-sense attributes', () => {
  const issues = validatePackingItems([
    { name: '头灯', attributes: [{ name: '亮度', value: '可调节' }], quantity: 1 },
    { name: '遮阳帽', attributes: [{ name: '结构', value: '带帽檐' }], quantity: 1 },
    { name: '创可贴', attributes: [{ name: '尺寸', value: '中号' }], quantity: 6 },
  ]);
  assert(issues.length === 3, `expected 3 redundant attribute issues, got ${packingValidationError(issues)}`);
});

Deno.test('packing display name stays concise when attributes are present', () => {
  assert(
    packingItemDisplayName({ name: '瓶装矿泉水', attributes: [{ name: '容量', value: '1.5L/瓶' }], quantity: 2 }) === '瓶装矿泉水',
    'expected attributes to stay out of the stored name',
  );
});

Deno.test('packing identity distinguishes same-name capacity variants', () => {
  const large = { name: '瓶装矿泉水', attributes: [{ name: '容量', value: '1.5L/瓶' }], quantity: 1 };
  const small = { name: '瓶装矿泉水', attributes: [{ name: '容量', value: '550ml/瓶' }], quantity: 2 };
  assert(packingItemIdentityKey(large) !== packingItemIdentityKey(small), 'different bottle sizes must not be deduplicated');
  assert(
    packingItemIdentityKey({ ...large, attributes: [{ name: '品牌', value: '不限' }, ...large.attributes] })
      === packingItemIdentityKey({ ...large, attributes: [...large.attributes, { name: '品牌', value: '不限' }] }),
    'attribute order must not change identity',
  );
});

Deno.test('packing water mix requires large and small bottled water', () => {
  const mixed = [
    { name: '瓶装矿泉水', attributes: [{ name: '容量', value: '1.5L/瓶' }], quantity: 1 },
    { name: '瓶装矿泉水', attributes: [{ name: '容量', value: '550ml/瓶' }], quantity: 2 },
  ];
  assert(!packingWaterMixError(mixed), 'expected practical mixed bottled water to pass');
  assert(Boolean(packingWaterMixError([{ name: '瓶装水', attributes: [{ name: '容量', value: '500ml/瓶' }], quantity: 3 }])), 'small bottles alone should not satisfy the mixed strategy');
  assert(requiresMixedWaterPlan('预计徒步 8 小时，全程无补水', 'none'), 'long no-refill hike should require a mix');
  assert(!requiresMixedWaterPlan('徒步 2 小时，全程无补水', 'none'), 'short hike should not require a mix');
  assert(!requiresMixedWaterPlan('全天徒步，沿途可补水', 'treated'), 'refill route should not require a mix');
});
