// 导入行程: reads pasted text and screenshots into a structured day-by-day
// draft. Nothing is written here; the app runs the checks on the draft and
// saves it with create_journey_from_import only when the user confirms.
import { protectEndpoint, ResourceError, resourceFailure, modelBudget, serviceClient } from '../_shared/resource-guard.ts';
import { buildPrompt, normalizeItinerary, parseModelJson, type RouteOption } from './extract.ts';
declare const Deno: { env: { get(name: string): string | undefined }; serve(handler: (req: Request) => Response | Promise<Response>): void };

type ImageInput = { base64?: string; contentType?: string };
type Payload = { text?: string; images?: ImageInput[] };

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const fail = (code: string, message: string, status: number) => json({ error: { code, message } }, status);
const env = (name: string) => Deno.env.get(name)?.trim() || '';

const MAX_IMAGES = 4;
const MAX_IMAGE_BASE64 = 4_000_000;
const MAX_TEXT = 20_000;
const MAX_ROUTES_IN_PROMPT = 400;
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

Deno.serve(protectEndpoint('ai', undefined, 'ai_requests', MAX_IMAGES * MAX_IMAGE_BASE64 + MAX_TEXT * 4 + 4096)(async (req) => {
  try {
    const payload = await req.json() as Payload;
    const text = String(payload.text || '').trim().slice(0, MAX_TEXT);
    const images = (Array.isArray(payload.images) ? payload.images : []).slice(0, MAX_IMAGES).map((image) => ({
      base64: String(image?.base64 || '').replace(/^data:[^;]+;base64,/i, '').replace(/\s/g, ''),
      contentType: IMAGE_TYPES.includes(String(image?.contentType || '').toLowerCase()) ? String(image.contentType).toLowerCase() : 'image/jpeg',
    })).filter((image) => image.base64);
    if (!text && !images.length) return fail('source_required', '请粘贴行程文字或添加截图', 400);
    if (images.some((image) => image.base64.length > MAX_IMAGE_BASE64)) return fail('image_too_large', '截图过大，请裁剪后重试', 413);
    if (images.some((image) => !/^[A-Za-z0-9+/]+={0,2}$/.test(image.base64))) return fail('invalid_image', '截图数据无效，请重新选择', 400);

    const apiKey = env('KAIPA_AI_API_KEY');
    if (!apiKey) return fail('not_configured', '行程导入服务尚未配置', 503);
    const baseUrl = (env('ITINERARY_IMPORT_AI_BASE_URL') || env('KAIPA_AI_BASE_URL') || 'https://ai.dootask.com/v1').replace(/\/$/, '');
    const model = env('ITINERARY_IMPORT_AI_MODEL') || env('KAIPA_AI_MODEL') || 'gpt-5.6-sol';

    const db = serviceClient();
    const routesResult = await db.from('routes').select('id,name,region').order('name').limit(MAX_ROUTES_IN_PROMPT);
    if (routesResult.error) throw routesResult.error;
    const routes = (routesResult.data || []) as RouteOption[];

    const prompt = buildPrompt(routes, text, images.length);
    const budget = modelBudget(db, 'itinerary-import:' + crypto.randomUUID());
    const units = new TextEncoder().encode(prompt).length + 6000 + images.length * 65536;
    const ticket = await budget.reserve(units);
    const response = await fetch(`${baseUrl}/chat/completions`, {
      signal: AbortSignal.timeout(120_000),
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        temperature: 0,
        max_tokens: 6000,
        response_format: { type: 'json_object' },
        messages: [{
          role: 'user',
          content: images.length
            ? [{ type: 'text', text: prompt }, ...images.map((image) => ({ type: 'image_url', image_url: { url: `data:${image.contentType};base64,${image.base64}`, detail: 'high' } }))]
            : prompt,
        }],
      }),
    });
    if (!response.ok) {
      console.error('itinerary import model request failed', response.status, (await response.text()).slice(0, 1000));
      return fail('provider_failed', '行程识别服务暂时不可用，请稍后重试', 502);
    }
    const data = await response.json();
    if (data.usage?.total_tokens > 0) await budget.settle(ticket, Math.min(units, data.usage.total_tokens));
    const content = data.choices?.[0]?.message?.content;
    const raw = typeof content === 'string' ? content : Array.isArray(content) ? content.map((part: { text?: string }) => part.text || '').join('') : '';
    const itinerary = normalizeItinerary(parseModelJson(raw), routes);
    if (!itinerary.days.length) return fail('empty_result', '没有识别出逐日行程，请补充文字或换一张更清晰的截图', 422);
    return json({ itinerary, model });
  } catch (error) {
    if (error instanceof ResourceError) return resourceFailure(error);
    console.error('itinerary import failed', error);
    return fail('request_failed', '行程识别失败，请稍后重试', 500);
  }
}));
