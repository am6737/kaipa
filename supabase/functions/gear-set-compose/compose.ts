// Pure parts of 按描述搭配: the prompt and the checks on the model's answer.
// The model may only pick IDs from the user's own library. Gear it calls
// missing is only a suggestion: nothing is written here, and the app saves
// the set (and any 待购 items) only when the user confirms.

export type ComposeCategory = { id: string; name: string };
export type ComposeItem = { id: number; name: string; categoryId: string; status: string; weightKg: number; owned: boolean };
export type ComposeInput = {
  description: string;
  name: string;
  categories: ComposeCategory[];
  items: ComposeItem[];
  keepIds: number[];
  excludeIds: number[];
};
export type ComposeResult = {
  name: string;
  picks: number[];
  missing: { name: string; categoryId: string; reason: string }[];
  summary: string;
};

export const MAX_DESCRIPTION = 500;
export const MAX_ITEMS = 400;
export const MAX_PICKS = 80;
export const MAX_MISSING = 8;
const MAX_NAME = 24;
const MAX_ITEM_NAME = 40;
const MAX_REASON = 60;

const clean = (value: unknown, max: number) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const nameKey = (value: string) => value.toLowerCase().replace(/\s+/g, '');
const ids = (value: unknown) => Array.isArray(value)
  ? [...new Set(value.map(Number).filter((id) => Number.isInteger(id) && id > 0))]
  : [];

export function parseInput(payload: unknown): ComposeInput {
  const raw = (payload || {}) as Record<string, unknown>;
  const categories = (Array.isArray(raw.categories) ? raw.categories : []).map((entry) => {
    const category = (entry || {}) as Record<string, unknown>;
    return { id: clean(category.id, 64), name: clean(category.name, 24) };
  }).filter((category) => category.id && category.name).slice(0, 50);
  const items = (Array.isArray(raw.items) ? raw.items : []).map((entry) => {
    const item = (entry || {}) as Record<string, unknown>;
    const weight = Number(item.weightKg);
    return {
      id: Number(item.id),
      name: clean(item.name, 80),
      categoryId: clean(item.categoryId, 64),
      status: clean(item.status, 16) || 'packed',
      weightKg: Number.isFinite(weight) && weight > 0 ? Math.round(weight * 1000) / 1000 : 0,
      owned: item.owned !== false,
    };
  }).filter((item) => Number.isInteger(item.id) && item.id > 0 && item.name).slice(0, MAX_ITEMS);
  return {
    description: clean(raw.description, MAX_DESCRIPTION),
    name: clean(raw.name, MAX_NAME),
    categories,
    items,
    keepIds: ids(raw.keepIds),
    excludeIds: ids(raw.excludeIds),
  };
}

export function buildPrompt(input: ComposeInput): string {
  const catName = new Map(input.categories.map((category) => [category.id, category.name]));
  const keep = new Set(input.keepIds);
  const exclude = new Set(input.excludeIds);
  const line = (item: ComposeItem) => [
      item.id,
      item.name,
      catName.get(item.categoryId) || '未分类',
      item.weightKg ? `${Math.round(item.weightKg * 1000)}g` : '-',
      item.status !== 'packed' ? item.status : '',
      item.owned ? '' : '待购',
    ].join('|').replace(/\|+$/, '');
  const lines = input.items.filter((item) => !exclude.has(item.id) && !keep.has(item.id)).map(line);
  const kept = input.items.filter((item) => keep.has(item.id)).map(line);
  const removed = input.items.filter((item) => exclude.has(item.id)).map((item) => item.name);
  return `你是户外装备清单搭配助手。用户想按一段描述建一份可复用的装备清单，你只能从用户自己的装备库里挑。

用户描述：${input.description}
${input.name ? `用户起的清单名：${input.name}\n` : ''}
可挑的装备（id|名称|分类|单件重量|携带方式|待购）：
${lines.join('\n') || '（空）'}
${kept.length ? `\n清单里已经有（不要再挑同类的）：\n${kept.join('\n')}\n` : ''}${removed.length ? `\n用户已明确不要：${removed.join('、')}\n` : ''}
可用分类：${JSON.stringify(input.categories)}

规则：
- picks 只放装备库里的 id，挑这次真正用得上的；同类装备只挑最合适的一件，除非确实需要多件。
- 清单包括穿在身上的（worn）和消耗品（consumable），这些也要挑。
- 「清单里已经有」的装备算作已带，不要再挑或列出同一用途的装备（已有背包就不再挑背包）。
- missing 只列这次必需、但装备库里没有能替代的装备，最多 ${MAX_MISSING} 件；库里已有同类就不要列。
- missing.name 用简短通用的中文品类名（如「冰爪」「羽绒服」），一项就是一件具体装备，不要列「配件」「用品」这类笼统名称，不要编品牌型号；categoryId 从可用分类里选。
- missing.reason 用一句话（不超过 24 字）说明这次为什么需要，要结合描述里的天数、海拔、气温、住宿方式等。
- name 是给清单起的名字，不超过 ${MAX_NAME} 个字；用户已起名时原样返回。
- summary 一句话概括挑选思路，不超过 40 字。
- 描述和户外装备无关时，picks 和 missing 都返回空数组，summary 说明原因。
- 只输出 JSON：{"name":"","picks":[1,2],"missing":[{"name":"","categoryId":"","reason":""}],"summary":""}`;
}

export function parseModelJson(text: string): unknown {
  const trimmed = text.trim();
  try { return JSON.parse(trimmed); } catch { /* fall through */ }
  const match = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/) || trimmed.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('模型未返回有效 JSON');
  return JSON.parse(match[1] || match[0]);
}

export function normalizeResult(value: unknown, input: ComposeInput): ComposeResult {
  const raw = (value || {}) as Record<string, unknown>;
  const library = new Map(input.items.map((item) => [item.id, item]));
  const byName = new Map(input.items.map((item) => [nameKey(item.name), item.id]));
  const blocked = new Set([...input.keepIds, ...input.excludeIds]);
  const categoryIds = new Set(input.categories.map((category) => category.id));
  const fallbackCategory = categoryIds.has('misc') ? 'misc' : input.categories[0]?.id || 'uncat';

  const picks: number[] = [];
  const pick = (id: number) => {
    if (library.has(id) && !blocked.has(id) && !picks.includes(id) && picks.length < MAX_PICKS) picks.push(id);
  };
  ids(raw.picks).forEach(pick);
  // Some models answer [{id}] instead of [id].
  if (Array.isArray(raw.picks)) raw.picks.forEach((entry) => {
    if (entry && typeof entry === 'object') pick(Number((entry as Record<string, unknown>).id));
  });

  const missing: ComposeResult['missing'] = [];
  const seen = new Set<string>();
  (Array.isArray(raw.missing) ? raw.missing : []).forEach((entry) => {
    const item = (entry || {}) as Record<string, unknown>;
    const name = clean(item.name, MAX_ITEM_NAME);
    const key = nameKey(name);
    if (!name || seen.has(key) || missing.length >= MAX_MISSING) return;
    seen.add(key);
    // "Missing" gear the library already has is a pick, not a purchase.
    const existing = byName.get(key);
    if (existing != null) { if (!input.excludeIds.includes(existing)) pick(existing); return; }
    const categoryId = clean(item.categoryId, 64);
    missing.push({
      name,
      categoryId: categoryIds.has(categoryId) ? categoryId : fallbackCategory,
      reason: clean(item.reason, MAX_REASON),
    });
  });

  // An off-topic description gets no picks, and no made-up name either.
  const found = picks.length > 0 || missing.length > 0;
  return {
    name: input.name || (found ? clean(raw.name, MAX_NAME) : ''),
    picks,
    missing,
    summary: clean(raw.summary, 80),
  };
}
