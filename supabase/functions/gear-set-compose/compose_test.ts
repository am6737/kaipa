import { buildPrompt, MAX_MISSING, normalizeResult, parseInput, parseModelJson } from './compose.ts';

function assertEquals(actual: unknown, expected: unknown, message: string): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${message}: got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)}`);
}

const input = parseInput({
  description: ' 三天两夜四姑娘山二峰，营地住帐篷 ',
  categories: [{ id: 'sleep', name: '睡眠' }, { id: 'misc', name: '其他' }, { id: 'wear', name: '服装' }],
  items: [
    { id: 1, name: 'MSR Hubba Hubba 2', categoryId: 'sleep', weightKg: 1.72 },
    { id: 2, name: '鹅绒睡袋 -5℃', categoryId: 'sleep', weightKg: 1.18 },
    { id: 3, name: '冲锋衣', categoryId: 'wear', weightKg: 0.46, status: 'worn' },
    { id: 4, name: '登山杖', categoryId: 'misc', owned: false },
    { id: 'x', name: 'bad id' },
  ],
  keepIds: [3],
  excludeIds: [2],
});

Deno.test('parses input and drops invalid items', () => {
  assertEquals(input.description, '三天两夜四姑娘山二峰，营地住帐篷', 'description');
  assertEquals(input.items.map((item) => item.id), [1, 2, 3, 4], 'item ids');
  assertEquals(input.items[3].owned, false, 'owned flag');
});

Deno.test('prompt marks kept and to-buy items and hides excluded ones', () => {
  const prompt = buildPrompt(input);
  if (!prompt.includes('清单里已经有（不要再挑同类的）：\n3|冲锋衣|服装|460g|worn')) throw new Error('kept item missing');
  if (prompt.indexOf('3|冲锋衣') < prompt.indexOf('清单里已经有')) throw new Error('kept item offered as a pick');
  if (!prompt.includes('4|登山杖|其他|-||待购')) throw new Error('to-buy item line missing');
  if (prompt.includes('2|鹅绒睡袋')) throw new Error('excluded item listed');
  if (!prompt.includes('用户已明确不要：鹅绒睡袋 -5℃')) throw new Error('excluded item not named');
});

Deno.test('keeps only library picks the user has not kept or removed', () => {
  const result = normalizeResult({ name: '四姑娘山二峰 3 天', picks: [1, 2, 3, 99, 1, { id: 4 }], missing: [], summary: 'ok' }, input);
  assertEquals(result.picks, [1, 4], 'picks');
  assertEquals(result.name, '四姑娘山二峰 3 天', 'name');
});

Deno.test('missing gear already in the library becomes a pick', () => {
  const result = normalizeResult({ picks: [], missing: [
    { name: 'msr hubba hubba 2', categoryId: 'sleep', reason: '' },
    { name: '冰爪', categoryId: 'nope', reason: '顶部有冰雪坡' },
    { name: '冰爪', categoryId: 'misc', reason: 'dup' },
    { name: '鹅绒睡袋-5℃', categoryId: 'sleep', reason: '已被用户移除' },
  ] }, input);
  assertEquals(result.picks, [1], 'converted pick');
  assertEquals(result.missing, [{ name: '冰爪', categoryId: 'misc', reason: '顶部有冰雪坡' }], 'missing');
});

Deno.test('caps missing and keeps the user name', () => {
  const named = { ...input, name: '我的清单' };
  const result = normalizeResult({ name: '别的名字', missing: Array.from({ length: 12 }, (_, index) => ({ name: `装备${index}`, categoryId: 'misc' })) }, named);
  assertEquals(result.missing.length, MAX_MISSING, 'missing cap');
  assertEquals(result.name, '我的清单', 'name kept');
});

Deno.test('drops the suggested name when nothing fits', () => {
  assertEquals(normalizeResult({ name: '诗歌创作清单', picks: [], missing: [] }, input).name, '', 'name');
});

Deno.test('reads fenced JSON', () => {
  assertEquals(parseModelJson('```json\n{"picks":[1]}\n```'), { picks: [1] }, 'fenced');
});
