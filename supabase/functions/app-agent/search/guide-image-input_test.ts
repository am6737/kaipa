import { guideImageInput } from './guide-image-input.ts';
function assert(value: unknown, message = 'Assertion failed'): asserts value { if (!value) throw new Error(message); }
async function rejects(fn: () => Promise<unknown>) { let failed = false; try { await fn(); } catch { failed = true; } assert(failed); }
const url = 'https://a.zdmimg.com/public.jpg';

Deno.test('trusted image input is bounded and converted to data without credentials or redirects', async () => {
  const value = await guideImageInput(url, async (target, init) => {
    assert(String(target) === url && init?.redirect === 'error' && !init.headers);
    return new Response(new Uint8Array([255, 216, 255, 0]), { headers: { 'Content-Type': 'image/jpeg' } });
  });
  assert(value === 'data:image/jpeg;base64,/9j/AA==');
});

Deno.test('untrusted hosts and lookalike domains never cause a server-side download', async () => {
  for (const input of ['https://unknown.example.com/a.jpg', 'https://a.zdmimg.com.evil.com/a.jpg', 'http://a.zdmimg.com/a.jpg', 'https://user:pass@a.zdmimg.com/a.jpg']) {
    assert(await guideImageInput(input, () => { throw new Error('Unexpected download'); }) === input);
  }
});

Deno.test('image input rejects redirects, access denial, unsupported MIME and deceptive or oversized bodies', async () => {
  for (const response of [new Response(null, { status: 302, headers: { Location: 'http://127.0.0.1' } }),
    new Response('', { status: 403 }), new Response('<svg/>', { headers: { 'Content-Type': 'image/svg+xml' } }),
    new Response('<html/>', { headers: { 'Content-Type': 'image/jpeg' } }),
    new Response(new Uint8Array(4_000_001), { headers: { 'Content-Type': 'image/png' } })]) {
    await rejects(() => guideImageInput(url, async () => response));
  }
});
