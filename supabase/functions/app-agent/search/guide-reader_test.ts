import { analyzeGuideImages, boundedJson, guideImageCandidates, GUIDE_LIMITS, publicGuideUrl, readGuide } from './guide-reader.ts';

function assert(value: unknown, message = 'Assertion failed'): asserts value { if (!value) throw new Error(message); }
async function rejects(fn: () => unknown) { let failed = false; try { await fn(); } catch { failed = true; } assert(failed, 'Expected rejection'); }
const url = 'https://guides.example.com/hike';
const image = 'https://images.example.com/day1.jpg';
const env = (name: string) => ({ TAVILY_API_KEY: 'fixture', KAIPA_AI_API_KEY: 'fixture', KAIPA_AI_MODEL: 'fixture-vision' })[name];
const json = (value: unknown) => new Response(JSON.stringify(value), { headers: { 'Content-Type': 'application/json' } });

Deno.test('guide URLs reject local, credential-bearing and non-web targets', async () => {
  for (const value of ['file:///etc/passwd', 'http://localhost/x', 'http://127.1/x', 'http://2130706433', 'http://[::1]/',
    'http://10.0.0.1/', 'http://metadata.google.internal/', 'https://x.local/', 'https://user:pass@a.com/', 'https://a.com:8443/', 'data:image/png;base64,x']) {
    await rejects(() => publicGuideUrl(value));
  }
  assert(publicGuideUrl(`${url}?token=keep#section`) === `${url}?token=keep`, 'Keep source access tokens, remove fragments');
});

Deno.test('guide extraction requests the body and bounds text and image candidates', async () => {
  let count = 0;
  const result = await readGuide(url, env, async (target, init) => {
    count++;
    assert(target === 'https://api.tavily.com/extract' && init?.redirect === 'error');
    const body = JSON.parse(String(init?.body));
    assert(!('query' in body) && body.include_images && body.extract_depth === 'advanced');
    return json({ results: [{ url, raw_content: '正文'.repeat(15000), images: [image, image, 'http://127.0.0.1/private', 'https://a.com/logo.svg',
      ...Array.from({ length: 15 }, (_, i) => `https://images.example.com/${i}.jpg`)] }] });
  });
  assert(count === 1 && result.available && result.text.length === GUIDE_LIMITS.text && result.truncated);
  assert(result.images.length === GUIDE_LIMITS.candidates && result.imagesTruncated);
  assert(result.images[0].id === 1 && result.images[0].url === image);
  assert(result.limitation.includes('not yet read'));
});

Deno.test('guide extraction falls back to the next Tavily key', async () => {
  const authorizations: string[] = [];
  const result = await readGuide(url, (name) => name === 'TAVILY_API_KEYS' ? 'exhausted,available' : undefined, async (_target, init) => {
    authorizations.push(new Headers(init?.headers).get('Authorization') || '');
    if (authorizations.length === 1) return new Response('', { status: 429 });
    return json({ results: [{ url, raw_content: '正文', images: [] }] });
  });
  assert(result.available && result.text === '正文');
  assert(authorizations.join() === 'Bearer exhausted,Bearer available');
});

Deno.test('guide reads do not treat failures, challenge pages or search snippets as body content', async () => {
  const missing = await readGuide(url, () => undefined, () => { throw new Error('Unexpected network'); });
  assert(!missing.available && missing.status === 'not_configured');
  for (const payload of [
    { failed_results: [{ url, error: 'private failure' }] },
    { results: [{ url, raw_content: '请完成安全验证', images: [image] }] },
    { results: [{ url, raw_content: 'CAPTCHA', images: [image] }] },
    { results: [{ url, raw_content: '' }] },
    { results: [{ url: 'https://other.example.com/', raw_content: 'wrong page' }] },
  ]) {
    const result = await readGuide(url, env, async () => json(payload));
    assert(!result.available && result.text === '' && !result.images.length);
    assert(!JSON.stringify(result).includes('private failure'));
  }
  const failed = await readGuide(url, env, async () => new Response('secret upstream detail', { status: 403 }));
  assert(!failed.available && !JSON.stringify(failed).includes('secret'));
});

Deno.test('provider JSON response size is bounded while streaming', async () => {
  await rejects(() => boundedJson(new Response(JSON.stringify({ body: 'x'.repeat(200) })), 100));
  const parsed = await boundedJson(json({ ok: true }), 100) as { ok: boolean };
  assert(parsed.ok);
});

Deno.test('guide candidates exclude page links, known placeholders and interface images before the cap', () => {
  const result = guideImageCandidates([url, image, image, 'https://a.com/images/event/default_head.png',
    'https://a.com/qrCode?article', 'https://a.com/logo/weixin.png', 'https://a.com/images/icon_arrow3.png',
    'https://www.2bulu.com/images/2bulu_goods.jpg', 'https://a.com/favicon.ico'], url);
  assert(result.length === 1 && result[0] === image);
});

Deno.test('vision sends selected image inputs and preserves IDs, provenance and uncertainty', async () => {
  const result = await analyzeGuideImages(url, [{ id: 2, url: image }], env, async (target, init) => {
    assert(target === 'https://ai.dootask.com/v1/chat/completions' && init?.redirect === 'error');
    const body = JSON.parse(String(init?.body));
    const content = body.messages[1].content;
    assert(content[0].text === 'Image ID: 2');
    assert(content[1].type === 'image_url' && content[1].image_url.url === image && content[1].image_url.detail === 'high');
    assert(body.messages[0].content.includes('untrusted') && body.messages[0].content.includes('CAPTCHAs'));
    return json({ choices: [{ message: { content: JSON.stringify({ images: [{ imageId: 2, kind: 'itinerary', visibleText: 'Day 2 营地', observations: ['第二天标有营地'], uncertainties: ['距离看不清'] }] }) } }],
      usage: { prompt_tokens: 100, completion_tokens: 40, total_tokens: 140 } });
  });
  assert(result.available && result.images[0].sourceUrl === url && result.images[0].url === image);
  assert(result.images[0].uncertainties[0] === '距离看不清' && result.usage?.totalTokens === 140);
});

Deno.test('vision failure and fabricated image IDs never become successful observations', async () => {
  for (const content of ['not json', JSON.stringify({ images: [{ imageId: 99, kind: 'photo', visibleText: '', observations: [], uncertainties: [] }] }),
    JSON.stringify({ images: [] })]) {
    const result = await analyzeGuideImages(url, [{ id: 1, url: image }], env,
      async () => json({ choices: [{ message: { content } }] }));
    assert(!result.available && !result.images.length);
  }
  const missing = await analyzeGuideImages(url, [{ id: 1, url: image }], () => undefined, () => { throw new Error('Unexpected network'); });
  assert(missing.status === 'not_configured');
  await rejects(() => analyzeGuideImages(url, [{ id: 1, url: 'http://127.0.0.1/' }], env));
  await rejects(() => analyzeGuideImages(url, Array.from({ length: 5 }, (_, i) => ({ id: i + 1, url: image })), env));
  const failed = await analyzeGuideImages(url, [{ id: 1, url: image }], env, async () => { throw new Error('timeout'); });
  assert(!failed.available);
});
