declare const Deno: { env: { get(name: string): string | undefined }; serve(handler: (req: Request) => Response | Promise<Response>): void };

type Category = { id: string; name: string };
type Payload = { imageBase64?: string; categories?: Category[] };

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, 'Content-Type': 'application/json' },
});

const env = (name: string) => Deno.env.get(name)?.trim() || '';

const SYSTEM_PROMPT = `你是户外装备图片识别助手。分析用户上传的实物、包装、价签或吊牌图片，提取可用于装备库的结构化信息。

规则：
- name 使用简洁、可辨认的中文装备名称；可见品牌和型号时组合为“品牌 型号 品类”。
- categoryId 必须从用户提供的分类中选择最匹配的一项。
- weightKg 是单件重量（千克），priceCny 是单件人民币价格，quantity 是图片明确表示的件数。
- 优先读取图片中的文字、标签、包装参数和价签；也可以根据明确的品牌型号补充可靠的常识信息。
- 不确定的重量、价格或数量必须返回 null，不要编造精确数字。
- attributes 只保留对装备有用的信息，如品牌、型号、容量、尺码、材质、温标、颜色。
- warnings 用简短中文说明哪些字段是估算值或需要用户核对；没有则返回空数组。
- 只输出 JSON，不要输出 Markdown。`;

function extractJson(text: string) {
  const trimmed = text.trim();
  try { return JSON.parse(trimmed); } catch {}
  const match = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/) || trimmed.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('模型未返回有效 JSON');
  return JSON.parse(match[1] || match[0]);
}

function cleanCategories(value: unknown): Category[] {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => {
    const category = entry as Record<string, unknown>;
    return { id: String(category.id || '').trim(), name: String(category.name || '').trim() };
  }).filter((category) => category.id && category.name).slice(0, 50);
}

function normalizeResult(value: unknown, categories: Category[]) {
  const raw = (value || {}) as Record<string, unknown>;
  const allowedIds = new Set(categories.map((category) => category.id));
  const fallbackId = categories.find((category) => category.id === 'misc')?.id || categories[0]?.id || 'misc';
  const attributes = Array.isArray(raw.attributes) ? raw.attributes.map((entry) => {
    const attribute = entry as Record<string, unknown>;
    return { key: String(attribute.key || '').trim(), value: String(attribute.value || '').trim() };
  }).filter((entry) => entry.key && entry.value).slice(0, 8) : [];
  const warnings = Array.isArray(raw.warnings) ? raw.warnings.map(String).map((warning) => warning.trim()).filter(Boolean).slice(0, 4) : [];
  const numberOrNull = (input: unknown) => typeof input === 'number' && Number.isFinite(input) && input > 0 ? input : null;

  return {
    name: String(raw.name || '').trim().slice(0, 120),
    categoryId: allowedIds.has(String(raw.categoryId || '')) ? String(raw.categoryId) : fallbackId,
    weightKg: numberOrNull(raw.weightKg),
    priceCny: numberOrNull(raw.priceCny),
    quantity: numberOrNull(raw.quantity),
    attributes,
    warnings,
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: { code: 'method_not_allowed', message: 'Method not allowed' } }, 405);

  try {
    const payload = await req.json() as Payload;
    const imageBase64 = String(payload.imageBase64 || '').replace(/\s/g, '');
    if (!imageBase64) return json({ error: { code: 'image_required', message: '请选择需要识别的图片' } }, 400);
    if (imageBase64.length > 12_000_000) return json({ error: { code: 'image_too_large', message: '图片过大，请选择尺寸较小的图片' } }, 413);
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(imageBase64)) return json({ error: { code: 'invalid_image', message: '图片数据无效，请重新选择' } }, 400);

    const categories = cleanCategories(payload.categories);
    if (!categories.length) return json({ error: { code: 'categories_required', message: '装备分类不可用' } }, 400);

    const apiKey = env('KAIPA_AI_API_KEY');
    if (!apiKey) return json({ error: { code: 'not_configured', message: '图片识别服务尚未配置' } }, 503);
    const baseUrl = (env('GEAR_IMAGE_AI_BASE_URL') || 'https://ai.dootask.com/v1').replace(/\/$/, '');
    const model = env('GEAR_IMAGE_AI_MODEL') || 'gpt-5.6-sol';

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        temperature: 0.1,
        max_tokens: 1200,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          {
            role: 'user',
            content: [
              { type: 'text', text: `可选分类：${JSON.stringify(categories)}\n请识别这张装备图片。` },
              { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${imageBase64}`, detail: 'high' } },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      const detail = await response.text();
      console.error('gear image model request failed', response.status, detail.slice(0, 1000));
      return json({ error: { code: 'provider_failed', message: '图片识别服务暂时不可用，请稍后重试' } }, 502);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    const text = typeof content === 'string' ? content : Array.isArray(content) ? content.map((part: { text?: string }) => part.text || '').join('') : '';
    const item = normalizeResult(extractJson(text), categories);
    if (!item.name) return json({ error: { code: 'empty_result', message: '没有识别到装备，请换一张更清晰的图片' } }, 422);
    return json({ item, model });
  } catch (error) {
    console.error('gear image recognition failed', error);
    return json({ error: { code: 'request_failed', message: '图片识别失败，请稍后重试' } }, 500);
  }
});
