declare const Deno: { env: { get(name: string): string | undefined }; serve(handler: (req: Request) => Response | Promise<Response>): void };

import { createClient } from 'npm:@supabase/supabase-js@2.108.1';
import { assertPublicSourceUrl } from './source-url.ts';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const env = (name: string) => Deno.env.get(name)?.trim() || '';

type Field = { key: string; label: string; type?: string; options?: string[] };

function parseJson(text: string): Record<string, unknown> {
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

async function readSource(url: string, text: string): Promise<{ content: string; sourceUrl: string | null }> {
  if (text.trim()) return { content: text.trim().slice(0, 120_000), sourceUrl: url || null };
  if (!url) throw new Error('请提供链接、文本或文本文件');
  // Absolute URL, http(s) only and a public host; see source-url.ts for the
  // ranges and the reason the first version of this check missed IPv6 literals.
  const parsed = assertPublicSourceUrl(url);
  // redirect: 'error' is part of the guard, not just hygiene: the host check is
  // static, so a public host that answers with a redirect to an internal one is
  // only stopped here.
  const response = await fetch(parsed.toString(), { redirect: 'error', signal: AbortSignal.timeout(20_000), headers: { Accept: 'text/plain,text/html,application/xhtml+xml' } });
  if (!response.ok) throw new Error(`来源页面读取失败（${response.status}）`);
  const type = response.headers.get('content-type') || '';
  if (type && !/(text|json|html|xml)/i.test(type)) throw new Error('来源不是可解析的文本页面，请改为粘贴正文或上传文本文件');
  const content = (await response.text()).trim();
  if (!content) throw new Error('来源页面没有可解析正文');
  return { content: content.slice(0, 120_000), sourceUrl: parsed.toString() };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  try {
    const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
    if (!token) return json({ error: 'unauthorized' }, 401);
    const service = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: auth } = await service.auth.getUser(token);
    const role = String(auth.user?.app_metadata?.role || '');
    if (!auth.user || !['owner', 'admin', 'editor'].includes(role)) return json({ error: 'forbidden' }, 403);

    const body = await req.json().catch(() => ({})) as { category_slug?: string; source_url?: string; source_text?: string; source_file?: { name?: string; content_type?: string; base64?: string } };
    if (!body.category_slug) return json({ error: 'category_required' }, 400);
    const category = await service.from('route_fact_categories').select('slug,name,description,field_schema').eq('slug', body.category_slug).maybeSingle();
    if (category.error) throw category.error;
    if (!category.data) return json({ error: 'category_not_found' }, 404);
    const schema = Array.isArray(category.data.field_schema) ? category.data.field_schema as Field[] : [];
    const fileType = String(body.source_file?.content_type || '').toLowerCase();
    const fileBase64 = String(body.source_file?.base64 || '').replace(/\s/g, '');
    if (fileBase64 && (!['image/jpeg', 'image/png', 'image/webp'].includes(fileType) || fileBase64.length > 8_000_000 || !/^[A-Za-z0-9+/]+={0,2}$/.test(fileBase64))) return json({ error: 'invalid_source_image' }, 400);
    const hasImage = Boolean(fileBase64);
    if (!hasImage && !String(body.source_url || '').trim() && !String(body.source_text || '').trim()) return json({ error: 'source_required' }, 400);
    const source = hasImage && !String(body.source_text || '').trim()
      ? { content: `上传图片：${String(body.source_file?.name || '未命名图片').slice(0, 200)}`, sourceUrl: String(body.source_url || '').trim() || null }
      : await readSource(String(body.source_url || '').trim(), String(body.source_text || ''));
    const apiKey = env('KAIPA_AI_API_KEY') || env('OPENROUTER_API_KEY');
    if (!apiKey) return json({ error: 'not_configured' }, 503);
    const baseUrl = (env('KAIPA_AI_BASE_URL') || (env('KAIPA_AI_API_KEY') ? 'https://ai.dootask.com/v1' : 'https://openrouter.ai/api/v1')).replace(/\/$/, '');
    const model = env('KAIPA_AI_FLASH_MODEL') || env('KAIPA_AI_MODEL') || env('OPENROUTER_MODEL') || 'openai/gpt-4.1-mini';
    const prompt = `你是户外路线资料整理助手。把下面来源资料整理成“${category.data.name}”类目的结构化草稿。\n\n规则：只提取来源明确出现的事实，不要补全、猜测或把宣传语当成事实；数值字段只写来源明确的数字；来源存在冲突时保留较保守表述并在 warnings 说明；字段 key 只能使用给定 schema；输出 JSON，不要 Markdown。\n\n类目：${JSON.stringify({ name: category.data.name, description: category.data.description, fields: schema })}\n\n来源：${source.content}`;
    const userContent = hasImage ? [
      { type: 'text', text: prompt },
      { type: 'image_url', image_url: { url: `data:${fileType};base64,${fileBase64}`, detail: 'high' } },
    ] : prompt;
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, temperature: 0.1, max_tokens: 2200, response_format: { type: 'json_object' }, messages: [
        { role: 'system', content: '输出格式：{"title":"简短标题","fields":{},"summary":"不超过500字","warnings":[]}' },
        { role: 'user', content: userContent },
      ] }),
      signal: AbortSignal.timeout(60_000),
    });
    if (!response.ok) { console.error('route fact analyzer failed', response.status, (await response.text()).slice(0, 500)); return json({ error: 'provider_failed' }, 502); }
    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    const result = parseJson(typeof content === 'string' ? content : '');
    return json({ draft: {
      title: String(result.title || `${category.data.name}资料草稿`).trim().slice(0, 120),
      fields: normalizeFields(result.fields, schema),
      summary: String(result.summary || '').trim().slice(0, 1000),
      warnings: Array.isArray(result.warnings) ? result.warnings.map(String).map((item) => item.trim()).filter(Boolean).slice(0, 8) : [],
      source_url: source.sourceUrl,
    }, model });
  } catch (error) {
    console.error('route fact analyzer error', error);
    return json({ error: error instanceof Error ? error.message : 'analyze_failed' }, 400);
  }
});
