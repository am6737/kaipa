declare const Deno: { env: { get(name: string): string | undefined }; serve(handler: (req: Request) => Response | Promise<Response>): void };

import { createClient } from 'npm:@supabase/supabase-js@2.108.1';
import { assertPublicSourceUrl } from './source-url.ts';
import { buildPrompt, normalizeDrafts, parseModelJson, type Category, type RouteOption } from './drafts.ts';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const env = (name: string) => Deno.env.get(name)?.trim() || '';

// The route catalog is inlined into the prompt (see drafts.ts); beyond this size
// it is truncated rather than silently guessed at.
const MAX_ROUTES_IN_PROMPT = 400;

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

    const body = await req.json().catch(() => ({})) as { source_url?: string; source_text?: string; source_file?: { name?: string; content_type?: string; base64?: string } };
    const [categoriesResult, routesResult] = await Promise.all([
      service.from('route_fact_categories').select('slug,name,description,field_schema').order('sort_order'),
      service.from('routes').select('id,name,region').order('name').limit(MAX_ROUTES_IN_PROMPT),
    ]);
    if (categoriesResult.error) throw categoriesResult.error;
    if (routesResult.error) throw routesResult.error;
    const categories = (categoriesResult.data || []) as Category[];
    const routes = (routesResult.data || []) as RouteOption[];
    if (!categories.length) return json({ error: 'no_categories' }, 503);

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
    const prompt = buildPrompt(categories, routes, source.content);
    const userContent = hasImage ? [
      { type: 'text', text: prompt },
      { type: 'image_url', image_url: { url: `data:${fileType};base64,${fileBase64}`, detail: 'high' } },
    ] : prompt;
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, temperature: 0.1, max_tokens: 4000, response_format: { type: 'json_object' }, messages: [
        { role: 'system', content: '输出格式：{"items":[{"route_id":"目录中的 id 或空字符串","category_slug":"目录中的 slug","title":"简短标题","fields":{},"warnings":[]}]}' },
        { role: 'user', content: userContent },
      ] }),
      signal: AbortSignal.timeout(90_000),
    });
    if (!response.ok) { console.error('route fact analyzer failed', response.status, (await response.text()).slice(0, 500)); return json({ error: 'provider_failed' }, 502); }
    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    const drafts = normalizeDrafts(parseModelJson(typeof content === 'string' ? content : ''), categories, routes);
    return json({ items: drafts, source_url: source.sourceUrl, model, route_catalog_size: routes.length });
  } catch (error) {
    console.error('route fact analyzer error', error);
    return json({ error: error instanceof Error ? error.message : 'analyze_failed' }, 400);
  }
});
