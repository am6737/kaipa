import { readGuide } from './guide-reader.ts';
import { createMediaCrawlerProvider } from './providers/mediacrawler.ts';
import { aggregateTravelSearch } from './aggregate.ts';

function assert(value: unknown, message = 'Assertion failed'): asserts value { if (!value) throw new Error(message); }
const url = 'https://www.douyin.com/video/1234567890123456789';
const env = (name: string) => ({ MEDIACRAWLER_SEARCH_URL: 'http://gateway.internal/v1/search', MEDIACRAWLER_API_KEY: 'fixture' })[name];

Deno.test('Douyin reads full captions and gallery candidates without Tavily', async () => {
  let calls = 0;
  const result = await readGuide(url, env, async (target, init) => {
    calls++;
    assert(String(target) === 'http://gateway.internal/v1/content');
    assert(new Headers(init?.headers).get('X-Kaipa-Gateway-Key') === 'fixture');
    assert(JSON.parse(String(init?.body)).url === url);
    return new Response(JSON.stringify({ cached: true, result: { url, content: '路线营地'.repeat(400), contentType: 'image_gallery',
      images: ['https://images.example.com/1.jpg', 'https://images.example.com/1.jpg', 'http://127.0.0.1/private'], truncated: false } }));
  });
  assert(calls === 1 && result.available && result.text.length === 1600);
  assert(result.images.length === 1 && result.images[0].id === 1 && result.contentType === 'image_gallery');
});

Deno.test('Douyin video captions are not presented as understood videos or image galleries', async () => {
  const result = await readGuide(url, env, async () => new Response(JSON.stringify({ result: { url, content: '徒步记录', contentType: 'video_caption', images: [] } })));
  assert(result.available && !result.images.length && result.limitation.includes('NOT spoken content'));
});

Deno.test('Douyin gateway errors and mismatched article IDs never fall back to Tavily', async () => {
  let calls = 0;
  const result = await readGuide(url, env, async () => { calls++; return new Response('sensitive upstream content', { status: 502 }); });
  assert(calls === 1 && !result.available && !JSON.stringify(result).includes('sensitive'));
  const wrong = await readGuide(url, env, async () => new Response(JSON.stringify({ result: { url: url.replace(/9$/, '8'), content: 'other article', images: [], contentType: 'video_caption' } })));
  assert(!wrong.available);
  const missing = await readGuide(url, () => undefined, () => { throw new Error('Unexpected fetch'); });
  assert(missing.status === 'not_configured');
});

Deno.test('Douyin search preserves gallery kind but keeps the search response small', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ results: [{ url, title: '攻略', contentType: 'image_gallery',
    content: 'full caption', images: ['https://images.example.com/1.jpg'], snippet: '摘要' }] }));
  try {
    const result = await createMediaCrawlerProvider({ source: 'douyin', endpoint: 'http://gateway.internal/v1/search', apiKey: 'fixture' }).search('哈天线', new AbortController().signal);
    assert(result.results[0].kind === 'guide' && !('content' in result.results[0]) && !('images' in result.results[0]));
  } finally { globalThis.fetch = original; }
});

Deno.test('verification-required responses survive aggregation instead of becoming empty successes', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ detail: 'verification_required: Complete manual browser verification' }), { status: 503 });
  try {
    const result = await aggregateTravelSearch({ query: '哈天线', providers: [createMediaCrawlerProvider({ source: 'douyin', endpoint: 'http://gateway.internal/v1/search', apiKey: 'fixture' })] });
    assert(!result.available && result.sources[0].status === 'unavailable');
    assert(result.sources[0].errorCode === 'verification_required' && result.sources[0].error?.includes('Stop requests'));
  } finally { globalThis.fetch = original; }
});
