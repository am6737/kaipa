// Model-output handling for route-fact-analyze, kept apart from the request
// plumbing so the batch shape can be tested without a provider.

export type Field = { key: string; label: string; type?: string; required?: boolean; options?: string[]; unit?: string };
export type Category = { slug: string; name: string; description: string | null; field_schema: Field[] };
export type RouteOption = { id: string; name: string; region: string | null };

export type FactDraft = {
  route_id: string | null;
  category_slug: string;
  title: string;
  fields: Record<string, string | number>;
  warnings: string[];
};

export const MAX_ITEMS = 12;

export function parseModelJson(text: string): Record<string, unknown> {
  const trimmed = text.trim();
  try { return JSON.parse(trimmed) as Record<string, unknown>; } catch {}
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const object = fenced?.[1]?.match(/\{[\s\S]*\}/) || trimmed.match(/\{[\s\S]*\}/);
  if (!object) throw new Error('模型未返回有效 JSON');
  return JSON.parse(object[0]) as Record<string, unknown>;
}

function normalizeFields(raw: unknown, schema: Field[]): Record<string, string | number> {
  const input = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
  const output: Record<string, string | number> = {};
  for (const field of schema) {
    const value = input[field.key];
    if (value == null || String(value).trim() === '') continue;
    if (field.type === 'number') {
      const number = Number(value);
      if (Number.isFinite(number)) output[field.key] = number;
    } else if (field.type === 'select') {
      const selected = String(value).trim();
      if (!field.options?.length || field.options.includes(selected)) output[field.key] = selected;
    } else {
      output[field.key] = String(value).trim().slice(0, 2000);
    }
  }
  return output;
}

function normalizeWarnings(raw: unknown): string[] {
  return Array.isArray(raw) ? raw.map(String).map((item) => item.trim()).filter(Boolean).slice(0, 8) : [];
}

// One source usually carries several facts of different kinds (how to get in,
// what it costs, where to sleep), so the model receives every category schema
// and the whole route catalog and returns a batch instead of one draft.
//
// Only ids and slugs are trusted downstream: the console already holds the
// catalogs, so names, missing-required fields and duplicate entries are derived
// there rather than duplicated here.
export function normalizeDrafts(parsed: unknown, categories: Category[], routes: RouteOption[]): FactDraft[] {
  const root = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  const rawItems = Array.isArray(root.items) ? root.items : Array.isArray(root.drafts) ? root.drafts : Array.isArray(parsed) ? parsed as unknown[] : [root];
  const categoryBySlug = new Map(categories.map((category) => [category.slug, category]));
  const routeById = new Map(routes.map((route) => [route.id, route]));
  const drafts: FactDraft[] = [];
  for (const raw of rawItems.slice(0, MAX_ITEMS)) {
    const item = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
    const category = categoryBySlug.get(String(item.category_slug || ''));
    if (!category) continue;
    // An id the catalog does not know becomes a blank route rather than a wrong
    // one: route_id is a non-null foreign key, so the editor shows the card as
    // 待补充 and keeps it out of the save set.
    const route = routeById.get(String(item.route_id || '')) || null;
    const fields = normalizeFields(item.fields, category.field_schema);
    const title = String(item.title || '').trim().slice(0, 120);
    if (!title && !Object.keys(fields).length) continue;
    drafts.push({
      route_id: route?.id || null,
      category_slug: category.slug,
      title: title || `${category.name}资料草稿`,
      fields,
      warnings: normalizeWarnings(item.warnings),
    });
  }
  return drafts;
}

// The catalog is small enough to inline in full, which beats guessing the route
// from a name mention: the model picks an id and the server validates it. If the
// catalog outgrows that, prefilter by the names that appear in the source text.
export function buildPrompt(categories: Category[], routes: RouteOption[], source: string) {
  return `你是户外路线资料整理助手。把下面来源资料整理成若干条结构化草稿。\n\n规则：\n- 只提取来源明确出现的事实，不要补全、猜测或把宣传语当成事实。\n- 一条来源可以产出多条不同类目的资料；每条只用一个类目，且只使用该类目 schema 里的字段 key。\n- 同一条事实只出现在最合适的那一条里，不要重复。\n- route_id 必须逐字来自给定线路目录；来源提到的地名与目录对不上时留空，不要勉强匹配。\n- 数值字段只写来源明确的数字；select 字段只能取给定选项。\n- 有歧义、来源内部冲突或缺少关键信息时，把问题写进该条的 warnings。\n- 输出 JSON，不要 Markdown。\n\n类目：${JSON.stringify(categories.map((category) => ({ slug: category.slug, name: category.name, description: category.description, fields: category.field_schema })))}\n\n线路目录：${JSON.stringify(routes.map((route) => ({ id: route.id, name: route.name, region: route.region })))}\n\n来源：${source}`;
}
