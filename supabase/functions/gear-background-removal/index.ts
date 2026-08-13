declare const Deno: { env: { get(name: string): string | undefined }; serve(handler: (req: Request) => Response | Promise<Response>): void };

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type Payload = {
  imageBase64?: string;
  imageUrl?: string;
  contentType?: string;
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function decodeBase64(value: string): Uint8Array {
  const binary = atob(value);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function encodeBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: { code: 'method_not_allowed', message: 'Method not allowed' } }, 405);

  try {
    const payload = await req.json() as Payload;
    const imageUrl = String(payload.imageUrl || '').trim();
    const imageBase64 = String(payload.imageBase64 || '').replace(/\s/g, '');

    if (!imageUrl && !imageBase64) return json({ error: { code: 'image_required', message: '请选择需要抠图的图片' } }, 400);
    if (imageUrl && !/^https?:\/\//i.test(imageUrl)) return json({ error: { code: 'invalid_image_url', message: '图片地址无效' } }, 400);
    if (imageBase64.length > 20_000_000) return json({ error: { code: 'image_too_large', message: '图片过大，请选择尺寸较小的图片' } }, 413);
    if (imageBase64 && !/^[A-Za-z0-9+/]+={0,2}$/.test(imageBase64)) return json({ error: { code: 'invalid_image', message: '图片数据无效，请重新选择' } }, 400);

    const apiKey = Deno.env.get('REMOVE_BG_API_KEY');
    if (!apiKey) return json({ error: { code: 'not_configured', message: '抠图服务尚未配置' } }, 503);

    const form = new FormData();
    form.set('size', 'auto');
    form.set('format', 'png');
    if (imageUrl) {
      form.set('image_url', imageUrl);
    } else {
      const contentType = String(payload.contentType || 'image/jpeg');
      const bytes = decodeBase64(imageBase64);
      const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
      form.set('image_file', new Blob([buffer], { type: contentType }), `gear.${extensionFor(contentType)}`);
    }

    const response = await fetch('https://api.remove.bg/v1.0/removebg', {
      method: 'POST',
      headers: { 'X-Api-Key': apiKey },
      body: form,
    });

    if (!response.ok) {
      const detail = await response.text();
      console.error('background removal provider failed', response.status, detail.slice(0, 1000));
      const message = response.status === 402
        ? '抠图服务额度不足，请稍后再试'
        : response.status === 429
          ? '抠图请求过于频繁，请稍后再试'
          : '抠图服务暂时不可用，请稍后重试';
      return json({ error: { code: 'provider_failed', message } }, 502);
    }

    const bytes = new Uint8Array(await response.arrayBuffer());
    if (!bytes.length) return json({ error: { code: 'empty_result', message: '没有生成可用的抠图结果' } }, 422);
    return json({ imageBase64: encodeBase64(bytes), contentType: response.headers.get('content-type') || 'image/png' });
  } catch (error) {
    console.error('gear background removal failed', error);
    return json({ error: { code: 'request_failed', message: '抠图失败，请稍后重试' } }, 500);
  }
});

function extensionFor(contentType: string): string {
  if (contentType.includes('png')) return 'png';
  if (contentType.includes('webp')) return 'webp';
  if (contentType.includes('heic') || contentType.includes('heif')) return 'heic';
  return 'jpg';
}
