import { buildPrompt, MAX_ITEMS, normalizeDrafts, parseModelJson, type Category } from './drafts.ts';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
function assertEquals(actual: unknown, expected: unknown, message: string): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${message}: got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)}`);
}

const transport: Category = {
  slug: 'access_transport',
  name: '进出交通',
  description: '怎么到起点',
  field_schema: [
    { key: 'from', label: '出发地', type: 'text', required: true },
    { key: 'mode', label: '交通方式', type: 'select', options: ['班车', '拼车'] },
    { key: 'price', label: '票价', type: 'number', unit: '元' },
  ],
};
const cost: Category = { slug: 'shuttle_cost', name: '费用参考', description: null, field_schema: [{ key: 'item', label: '费用项目', type: 'text', required: true }] };
const categories = [transport, cost];
const routes = [{ id: 'trk008', name: '党岭三湖连穿', region: '四川 · 丹巴' }];

Deno.test('one source yields several drafts, each bound to its own category', () => {
  const drafts = normalizeDrafts({
    items: [
      { route_id: 'trk008', category_slug: 'access_transport', title: '成都 → 丹巴 班车', fields: { from: '成都', mode: '班车', price: '168' }, warnings: ['价格未注明季节浮动'] },
      { route_id: 'trk008', category_slug: 'shuttle_cost', title: '丹巴 → 党岭 包车', fields: { item: '包车进山' } },
    ],
  }, categories, routes);
  assertEquals(drafts.length, 2, 'both categories kept');
  assertEquals(drafts[0].fields, { from: '成都', mode: '班车', price: 168 }, 'number field coerced');
  assertEquals(drafts[1].category_slug, 'shuttle_cost', 'second draft category');
  assertEquals(drafts[0].warnings, ['价格未注明季节浮动'], 'warnings carried');
});

Deno.test('a draft whose category is not in the catalog is dropped, not filed under a guess', () => {
  const drafts = normalizeDrafts({ items: [{ category_slug: 'wild_camping', title: 'x', fields: { from: '成都' } }] }, categories, routes);
  assertEquals(drafts.length, 0, 'unknown slug dropped');
});

Deno.test('a route id the catalog does not know becomes blank instead of a wrong foreign key', () => {
  const drafts = normalizeDrafts({ items: [{ route_id: 'trk9999', category_slug: 'access_transport', title: '色根坝营地班车', fields: { from: '成都' } }] }, categories, routes);
  assertEquals(drafts[0].route_id, null, 'invented id rejected');
  assertEquals(normalizeDrafts({ items: [{ category_slug: 'access_transport', title: 't', fields: { from: '成都' } }] }, categories, routes)[0].route_id, null, 'missing id stays null');
});

Deno.test('values outside a select or a non-numeric number are dropped field by field, not the whole draft', () => {
  const drafts = normalizeDrafts({ items: [{ route_id: 'trk008', category_slug: 'access_transport', title: 't', fields: { from: '成都', mode: '直升机', price: '约 168' } }] }, categories, routes);
  assertEquals(drafts[0].fields, { from: '成都' }, 'only the valid field survives');
});

Deno.test('a model that ignores the items envelope still produces one draft', () => {
  const drafts = normalizeDrafts({ route_id: 'trk008', category_slug: 'access_transport', title: '成都 → 丹巴', fields: { from: '成都' } }, categories, routes);
  assertEquals(drafts.length, 1, 'bare object accepted');
  assertEquals(drafts[0].title, '成都 → 丹巴', 'title read');
});

Deno.test('an untitled, field-less draft is dropped and a titled one gets the category default title', () => {
  assertEquals(normalizeDrafts({ items: [{ category_slug: 'access_transport', fields: {} }] }, categories, routes).length, 0, 'empty draft dropped');
  const titled = normalizeDrafts({ items: [{ category_slug: 'access_transport', fields: { from: '成都' } }] }, categories, routes);
  assertEquals(titled[0].title, '进出交通资料草稿', 'default title');
});

Deno.test('a runaway batch is capped instead of flooding the editor', () => {
  const items = Array.from({ length: MAX_ITEMS + 6 }, (_, index) => ({ category_slug: 'access_transport', title: `条目 ${index}`, fields: { from: '成都' } }));
  assertEquals(normalizeDrafts({ items }, categories, routes).length, MAX_ITEMS, 'capped');
});

Deno.test('fenced and padded model output parses, and non-JSON raises', () => {
  assertEquals(parseModelJson('```json\n{"items":[]}\n```'), { items: [] }, 'fenced object');
  assertEquals(parseModelJson('  {"items":[{"title":"x"}]}  '), { items: [{ title: 'x' }] }, 'padded object');
  try {
    parseModelJson('我无法整理这段资料');
  } catch {
    return;
  }
  throw new Error('expected non-JSON to raise');
});

Deno.test('the prompt carries every category schema and the whole route catalog', () => {
  const prompt = buildPrompt(categories, routes, '成都新南门车站每天 07:30 发车');
  assert(prompt.includes('"shuttle_cost"'), 'second category in prompt');
  assert(prompt.includes('trk008'), 'route id in prompt');
  assert(prompt.includes('route_id 必须逐字来自给定线路目录'), 'no-guess rule in prompt');
});
