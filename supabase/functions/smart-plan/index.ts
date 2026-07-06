declare const Deno: { env: { get(name: string): string | undefined }; serve(handler: (req: Request) => Response | Promise<Response>): void };

type Provider = string;

type Prefs = {
  days?: number;
  startTime?: string;
  pace?: 'relaxed' | 'normal' | 'challenging';
  notes?: string;
};

type SmartPlanItem = {
  day: string;
  title: string;
  timeStart?: number;
  timeEnd?: number;
  note?: string;
};

type SmartPlanPayload = {
  provider?: Provider;
  preferences?: Prefs;
  journey?: Record<string, unknown>;
  existingTimeline?: Array<Record<string, unknown>>;
};

type SmartPlanResult = {
  provider: string;
  model?: string;
  items: SmartPlanItem[];
  warning?: string;
};

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

const SYSTEM_PROMPT = `你是专业户外徒步行程规划助手。请基于路线、天数、强度和已有行程生成可执行的中文行程安排。
要求：
- 只输出 JSON，格式为 {"items":[{"day":"第 1 天","title":"...","timeStart":480,"timeEnd":540,"note":"..."}]}。
- timeStart/timeEnd 是当天 0 点起的分钟数；无法确定时可以省略。
- 每天 3-6 项，覆盖集合、徒步/路段、补给/午餐、营地/住宿、风险提醒。
- 标题要短，适合放进移动端行程列表。
- 不要编造具体商家电话、官方班车时刻等高风险细节。`;

function clamp(n: number, min: number, max: number) { return Math.max(min, Math.min(max, n)); }
function parseTime(s?: string) {
  const m = (s || '08:00').match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return 480;
  return clamp(Number(m[1]) * 60 + Number(m[2]), 0, 23 * 60 + 59);
}
function dayName(n: number) { return `第 ${n} 天`; }

function fallbackPlan(payload: SmartPlanPayload): SmartPlanItem[] {
  const prefs = payload.preferences || {};
  const days = clamp(Number(prefs.days || 2), 1, 14);
  const start = parseTime(prefs.startTime);
  const pace = prefs.pace || 'normal';
  const hikeBlock = pace === 'relaxed' ? 210 : pace === 'challenging' ? 330 : 270;
  const items: SmartPlanItem[] = [];
  for (let d = 1; d <= days; d++) {
    const day = dayName(d);
    const s = d === 1 ? start : 480;
    items.push({ day, title: d === 1 ? '集合并检查装备' : '早餐与营地整理', timeStart: s, timeEnd: s + 30 });
    items.push({ day, title: d === 1 ? '开始徒步，控制前半程配速' : '继续徒步，关注天气变化', timeStart: s + 45, timeEnd: s + 45 + hikeBlock });
    items.push({ day, title: '午餐补给，检查饮水余量', timeStart: 720, timeEnd: 765 });
    items.push({ day, title: d === days ? '下撤/返程，复盘轨迹与照片' : '抵达住宿点或营地', timeStart: 960, timeEnd: 1020 });
    items.push({ day, title: '确认次日路线与风险点', timeStart: 1140, timeEnd: 1170 });
  }
  return items;
}

function buildUserPrompt(payload: SmartPlanPayload) {
  return JSON.stringify({
    journey: payload.journey || {},
    preferences: payload.preferences || {},
    existingTimeline: payload.existingTimeline || [],
  });
}

function extractJson(text: string): unknown {
  const trimmed = text.trim();
  try { return JSON.parse(trimmed); } catch {}
  const m = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/) || trimmed.match(/\{[\s\S]*\}/);
  if (!m) throw new Error('No JSON found in model output');
  return JSON.parse(m[1] || m[0]);
}

function normalizeItems(value: unknown): SmartPlanItem[] {
  const obj = value as { items?: unknown };
  const raw = Array.isArray(obj?.items) ? obj.items : Array.isArray(value) ? value : [];
  return raw.map((it) => {
    const x = it as Record<string, unknown>;
    const title = String(x.title || '').trim();
    if (!title) return null;
    const item: SmartPlanItem = {
      day: String(x.day || '第 1 天').trim(),
      title,
    };
    if (typeof x.timeStart === 'number') item.timeStart = clamp(Math.round(x.timeStart), 0, 1439);
    if (typeof x.timeEnd === 'number') item.timeEnd = clamp(Math.round(x.timeEnd), 0, 1439);
    if (typeof x.note === 'string' && x.note.trim()) item.note = x.note.trim();
    return item;
  }).filter(Boolean).slice(0, 80) as SmartPlanItem[];
}

const schema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          day: { type: 'string' },
          title: { type: 'string' },
          timeStart: { type: 'number' },
          timeEnd: { type: 'number' },
          note: { type: 'string' },
        },
        required: ['day', 'title'],
      },
    },
  },
  required: ['items'],
};

type ProviderKind = 'openai-responses' | 'openai-chat' | 'anthropic' | 'gemini';

type ProviderConfig = {
  kind: ProviderKind;
  label?: string;
  baseUrl?: string;
  model: string;
  apiKeyEnv: string;
};

type ProviderRegistry = Record<string, ProviderConfig>;

const PRESET_PROVIDERS: ProviderRegistry = {
  deepseek: {
    kind: 'openai-chat',
    baseUrl: 'https://api.deepseek.com',
    model: 'deepseek-v4-flash',
    apiKeyEnv: 'DEEPSEEK_API_KEY',
  },
  openai: {
    kind: 'openai-responses',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4.1-mini',
    apiKeyEnv: 'OPENAI_API_KEY',
  },
  anthropic: {
    kind: 'anthropic',
    baseUrl: 'https://api.anthropic.com',
    model: 'claude-3-5-haiku-latest',
    apiKeyEnv: 'ANTHROPIC_API_KEY',
  },
  gemini: {
    kind: 'gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    model: 'gemini-2.5-flash',
    apiKeyEnv: 'GEMINI_API_KEY',
  },
};

function parseProviderRegistry(): ProviderRegistry {
  const raw = env('SMART_PLAN_PROVIDERS');
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as ProviderRegistry;
    return Object.fromEntries(Object.entries(parsed).filter(([, cfg]) => cfg?.kind && cfg?.model && cfg?.apiKeyEnv));
  } catch (e) {
    console.error('Invalid SMART_PLAN_PROVIDERS JSON', e);
    return {};
  }
}

function legacyCompatibleProvider(): ProviderRegistry {
  const keyEnv = env('OPENAI_COMPATIBLE_API_KEY_ENV') || 'OPENAI_COMPATIBLE_API_KEY';
  const baseUrl = env('OPENAI_COMPATIBLE_BASE_URL');
  if (!baseUrl) return {};
  return {
    'openai-compatible': {
      kind: 'openai-chat',
      baseUrl,
      model: env('OPENAI_COMPATIBLE_MODEL') || 'deepseek-chat',
      apiKeyEnv: keyEnv,
    },
  };
}

function providers(): ProviderRegistry {
  return {
    ...PRESET_PROVIDERS,
    ...legacyCompatibleProvider(),
    ...parseProviderRegistry(),
  };
}

function configuredProviderIds(registry: ProviderRegistry) {
  return Object.entries(registry).filter(([, cfg]) => !!env(cfg.apiKeyEnv)).map(([id]) => id);
}

function resolveProvider(id: Provider | undefined): { id: string; cfg?: ProviderConfig } {
  const registry = providers();
  const requested = id && id !== 'auto' ? id : env('SMART_PLAN_DEFAULT_PROVIDER') || 'deepseek';
  if (requested) return { id: requested, cfg: registry[requested] };
  const first = configuredProviderIds(registry)[0];
  return first ? { id: first, cfg: registry[first] } : { id: 'fallback' };
}

function providerKey(cfg: ProviderConfig) {
  const key = env(cfg.apiKeyEnv);
  if (!key) throw new Error(`Missing ${cfg.apiKeyEnv}`);
  return key;
}

async function callOpenAIResponses(cfg: ProviderConfig, payload: SmartPlanPayload) {
  const base = (cfg.baseUrl || 'https://api.openai.com/v1').replace(/\/$/, '');
  const res = await fetch(`${base}/responses`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${providerKey(cfg)}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: cfg.model,
      input: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: buildUserPrompt(payload) },
      ],
      text: { format: { type: 'json_schema', name: 'smart_plan', strict: true, schema } },
    }),
  });
  if (!res.ok) throw new Error(`OpenAI Responses ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const text = data.output_text || data.output?.flatMap((o: any) => o.content || []).map((c: any) => c.text || '').join('') || '';
  return { items: normalizeItems(extractJson(text)), model: cfg.model };
}

async function callOpenAIChat(cfg: ProviderConfig, payload: SmartPlanPayload) {
  const base = (cfg.baseUrl || '').replace(/\/$/, '');
  if (!base) throw new Error('Missing provider baseUrl');
  const body: Record<string, unknown> = {
    model: cfg.model,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: buildUserPrompt(payload) },
    ],
    temperature: 0.4,
    max_tokens: 1800,
    response_format: { type: 'json_object' },
  };
  if (base.includes('api.deepseek.com')) body.thinking = { type: 'disabled' };
  const res = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${providerKey(cfg)}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${cfg.label || cfg.model} ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const text = data.choices?.[0]?.message?.content || '';
  return { items: normalizeItems(extractJson(text)), model: cfg.model };
}

async function callAnthropic(cfg: ProviderConfig, payload: SmartPlanPayload) {
  const base = (cfg.baseUrl || 'https://api.anthropic.com').replace(/\/$/, '');
  const res = await fetch(`${base}/v1/messages`, {
    method: 'POST',
    headers: { 'x-api-key': providerKey(cfg), 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: cfg.model,
      max_tokens: 1800,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: buildUserPrompt(payload) }],
      tools: [{ name: 'submit_smart_plan', description: 'Submit itinerary plan JSON', input_schema: schema }],
      tool_choice: { type: 'tool', name: 'submit_smart_plan' },
    }),
  });
  if (!res.ok) throw new Error(`Anthropic ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const tool = data.content?.find((c: any) => c.type === 'tool_use' && c.name === 'submit_smart_plan');
  return { items: normalizeItems(tool?.input || {}), model: cfg.model };
}

async function callGemini(cfg: ProviderConfig, payload: SmartPlanPayload) {
  const base = (cfg.baseUrl || 'https://generativelanguage.googleapis.com/v1beta').replace(/\/$/, '');
  const res = await fetch(`${base}/models/${cfg.model}:generateContent?key=${providerKey(cfg)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: [{ role: 'user', parts: [{ text: buildUserPrompt(payload) }] }],
      generationConfig: { responseMimeType: 'application/json', responseSchema: schema },
    }),
  });
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.map((p: any) => p.text || '').join('') || '';
  return { items: normalizeItems(extractJson(text)), model: cfg.model };
}

function fallbackResult(payload: SmartPlanPayload, warning?: string): SmartPlanResult {
  return { provider: 'fallback', items: fallbackPlan(payload), model: 'local-template', warning };
}

function shouldFallback(provider: Provider, resolvedId: string) {
  return !provider || provider === 'auto' || provider === resolvedId;
}

async function callConfiguredProvider(provider: Provider, payload: SmartPlanPayload): Promise<SmartPlanResult> {
  const resolved = resolveProvider(provider);
  if (!resolved.cfg) return fallbackResult(payload, 'No smart-plan provider configured; used local template.');
  if (!env(resolved.cfg.apiKeyEnv)) {
    if (provider && provider !== 'auto') throw new Error(`Provider "${provider}" is configured but ${resolved.cfg.apiKeyEnv} is missing`);
    return fallbackResult(payload, `${resolved.cfg.apiKeyEnv} is not set; used local template.`);
  }
  try {
    const out =
      resolved.cfg.kind === 'openai-responses' ? await callOpenAIResponses(resolved.cfg, payload) :
      resolved.cfg.kind === 'openai-chat' ? await callOpenAIChat(resolved.cfg, payload) :
      resolved.cfg.kind === 'anthropic' ? await callAnthropic(resolved.cfg, payload) :
      await callGemini(resolved.cfg, payload);
    return { provider: resolved.id, ...out };
  } catch (e) {
    if (!shouldFallback(provider, resolved.id)) throw e;
    const message = e instanceof Error ? e.message : 'Unknown provider error';
    console.error('smart-plan provider failed; using fallback', message);
    return fallbackResult(payload, `Provider ${resolved.id} failed; used local template.`);
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  try {
    const payload = await req.json() as SmartPlanPayload;
    const provider = payload.provider || 'auto';
    const result = await callConfiguredProvider(provider, payload);
    if (!result.items.length) throw new Error('Provider returned no valid items');
    return json(result);
  } catch (e) {
    console.error(e);
    return json({ error: e instanceof Error ? e.message : 'Unknown error' }, 500);
  }
});
