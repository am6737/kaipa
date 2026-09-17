import { packingItemDisplayName, packingItemIdentityKey, packingValidationError, validatePackingItems } from './packing-validation.ts';

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
    { name: '移动电源', attributes: [{ name: '容量', value: '10000mAh' }], quantity: 1 },
    { name: '全麦面包', attributes: [{ name: '单份净重', value: '80g/袋' }], quantity: 2 },
    { name: '葡萄干', attributes: [{ name: '单份净重', value: '50g/袋' }], quantity: 2 },
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

Deno.test('peanut butter packaging mass can coexist with structured carried weight', () => {
  const item = {
    name: '花生酱', quantity: 2, weightKg: 0.21,
    attributes: [{ name: '单份净重', value: '200g' }],
  };
  const issues = validatePackingItems([item]);
  assert(issues.length === 0, packingValidationError(issues));

  const missingPortion = validatePackingItems([{ ...item, attributes: [] }]);
  assert(missingPortion.length === 1 && missingPortion[0].message.includes('单份克重'),
    'Carried weight must not replace the food packaging specification');
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

Deno.test('water validation checks item structure without prescribing volume or bottle mix', () => {
  for (const capacity of ['350ml', '750ml', '1.25L']) {
    for (const quantity of [1, 4, 6]) {
      const issues = validatePackingItems([{ name: '瓶装矿泉水', attributes: [{ name: '容量', value: capacity }], quantity }]);
      assert(issues.length === 0, 'Valid water items must not be rejected for quantity or bottle selection');
    }
  }
});

Deno.test('pure bottled water is not mistaken for a purification device', () => {
  const issues = validatePackingItems([{ name: '瓶装纯净水', quantity: 1, attributes: [{ name: '单份净重', value: '1.5kg' }] }]);
  if (!issues.some(issue => issue.message.includes('容量'))) throw new Error('Pure water still bypasses capacity validation');
  const device = validatePackingItems([{ name: '净水壶', quantity: 1 }]);
  if (device.some(issue => issue.message.includes('容量'))) throw new Error('Treatment device was mistaken for carried water');
});
