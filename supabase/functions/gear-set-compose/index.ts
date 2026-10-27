// 按描述搭配: picks gear for a new or edited set from the user's own library and
// lists what is still missing. One model call, no tools; nothing is written.
import { protectEndpoint, ResourceError, resourceFailure, modelBudget, serviceClient } from '../_shared/resource-guard.ts';
import { buildPrompt, normalizeResult, parseInput, parseModelJson } from './compose.ts';
declare const Deno: { env: { get(name: string): string | undefined }; serve(handler: (req: Request) => Response | Promise<Response>): void };

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const fail = (code: string, message: string, status: number) => json({ error: { code, message } }, status);
const env = (name: string) => Deno.env.get(name)?.trim() || '';

const MAX_TOKENS = 2000;

Deno.serve(protectEndpoint('ai', undefined, 'ai_requests', 256 * 1024)(async (req) => {
  try {
    const input = parseInput(await req.json());
    if (!input.description) return fail('description_required', '先写一句这份清单的用途', 400);
    if (!input.categories.length) return fail('categories_required', '装备分类不可用', 400);

    const apiKey = env('KAIPA_AI_API_KEY');
    if (!apiKey) return fail('not_configured', '搭配服务尚未配置', 503);
    const baseUrl = (env('GEAR_SET_AI_BASE_URL') || env('KAIPA_AI_BASE_URL') || 'https://ai.dootask.com/v1').replace(/\/$/, '');
    // A single structured answer, so the flash model is enough and keeps the editor responsive.
    const model = env('GEAR_SET_AI_MODEL') || env('KAIPA_AI_FLASH_MODEL') || env('KAIPA_AI_MODEL') || 'gpt-5.6-sol';

    const prompt = buildPrompt(input);
    const budget = modelBudget(serviceClient(), 'gear-set-compose:' + crypto.randomUUID());
    const units = new TextEncoder().encode(prompt).length + MAX_TOKENS;
    const ticket = await budget.reserve(units);
    const request = (reasoning: boolean) => fetch(`${baseUrl}/chat/completions`, {
      signal: AbortSignal.timeout(60_000),
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        max_tokens: MAX_TOKENS,
        response_format: { type: 'json_object' },
        messages: [{ role: 'user', content: prompt }],
        // Reasoning nearly tripled the wait (about 50 s against 18 s) without a
        // better pick list. A model that rejects the setting gets one plain retry.
        ...(reasoning ? {} : { reasoning_effort: 'none' }),
      }),
    });
    let response = await request(false);
    if (response.status === 400) response = await request(true);
    if (!response.ok) {
      console.error('gear set compose model request failed', response.status, (await response.text()).slice(0, 1000));
      return fail('provider_failed', '搭配服务暂时不可用，请稍后重试', 502);
    }
    const data = await response.json();
    if (data.usage?.total_tokens > 0) await budget.settle(ticket, Math.min(units, data.usage.total_tokens));
    const content = data.choices?.[0]?.message?.content;
    const text = typeof content === 'string' ? content : Array.isArray(content) ? content.map((part: { text?: string }) => part.text || '').join('') : '';
    return json({ result: normalizeResult(parseModelJson(text), input), model });
  } catch (error) {
    if (error instanceof ResourceError) return resourceFailure(error);
    console.error('gear set compose failed', error);
    return fail('request_failed', '搭配失败，请稍后重试', 500);
  }
}));
