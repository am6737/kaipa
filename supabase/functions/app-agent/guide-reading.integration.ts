import { createTavilyProvider, tavilyApiKeys } from './search/providers/tavily.ts';
import { analyzeGuideImages, readGuide, type GuideContent } from './search/guide-reader.ts';

// Public source artifacts only. Credentials come from --env-file, never args
// or report files. This probe does not create or modify journey data.
const env = (name: string) => Deno.env.get(name);
const artifact = '/tmp/kaipa-guide-live.json';
const [mode, value] = Deno.args;
const started = Date.now();
if (mode === 'search') {
  const result = await createTavilyProvider(tavilyApiKeys(env('TAVILY_API_KEYS'), env('TAVILY_API_KEY'))).search(value || '哈天线 徒步 七天 营地 攻略', AbortSignal.timeout(30000));
  console.log(JSON.stringify({ stage: mode, elapsedMs: Date.now() - started, ...result }, null, 2));
  if (!result.available || !result.results.length) Deno.exitCode = 1;
} else if (mode === 'read' && value) {
  const result = await readGuide(value, env);
  if (result.available) await Deno.writeTextFile(artifact, JSON.stringify(result), { mode: 0o600 });
  console.log(JSON.stringify({ stage: mode, elapsedMs: Date.now() - started, available: result.available, status: result.status,
    url: result.url, textLength: result.text.length, textPreview: result.text.slice(0, 1800), truncated: result.truncated,
    images: result.images, limitation: result.limitation }, null, 2));
  if (!result.available) Deno.exitCode = 1;
} else if (mode === 'vision') {
  if (!env('KAIPA_AI_MODEL') && !env('OPENROUTER_MODEL')) throw new Error('Set KAIPA_AI_MODEL to the deployed model; Compose defaults are not loaded by --env-file');
  const page = JSON.parse(await Deno.readTextFile(artifact)) as GuideContent;
  const ids = (value || '1').split(',').map(Number);
  const images = ids.map(id => page.images.find(image => image.id === id));
  if (images.some(image => !image)) throw new Error('Selected image ID is not in the retrieved guide');
  const result = await analyzeGuideImages(page.url, images.filter((image): image is NonNullable<typeof image> => Boolean(image)), env, async (target, init) => {
    const response = await fetch(target, init);
    if (!response.ok) {
      const payload = await response.clone().json().catch(() => ({}));
      let message = String(payload.error?.message || payload.message || '');
      for (const name of ['KAIPA_AI_API_KEY', 'OPENROUTER_API_KEY', 'TAVILY_API_KEYS', 'TAVILY_API_KEY']) {
        const key = env(name);
        if (key) message = message.replaceAll(key, '[redacted]');
      }
      console.log(JSON.stringify({ stage: 'vision-provider', status: response.status, message: message.slice(0, 300) }));
    }
    return response;
  });
  console.log(JSON.stringify({ stage: mode, elapsedMs: Date.now() - started, ...result }, null, 2));
  if (!result.available || result.images.every(image => image.kind === 'unreadable')) Deno.exitCode = 1;
} else {
  throw new Error('Usage: search [query] | read <article URL> | vision [image IDs, comma separated]');
}
