import { allowGuideQueries, allowGuideReads, bindRunClient, clearGuideQueries, releaseRunClient, readTravelGuide, readTravelGuideImages, searchTravelWeb, kaipaAllTools, kaipaJourneyTools } from './tools.ts';
import type { AgentContext } from './types.ts';

function assert(value: unknown, message = 'Assertion failed'): asserts value { if (!value) throw new Error(message); }
const url = 'https://guides.example.com/day1';
type Row = Record<string, any>;

function harness(seed: Row[]) {
  const context: AgentContext = { userId: 'user', threadId: 'thread', runId: crypto.randomUUID(), originalUserMessage: '规划徒步' };
  const rows: Row[] = seed.map(row => ({ id: crypto.randomUUID(), run_id: context.runId, ...row }));
  const client = { from(table: string) {
    assert(table === 'agent_tool_calls');
    const filters: Array<(row: Row) => boolean> = [];
    let insert: Row | undefined;
    let update: Row | undefined;
    const execute = () => {
      if (insert) {
        let row = rows.find(row => row.run_id === insert!.run_id && row.tool_name === insert!.tool_name && row.arguments_hash === insert!.arguments_hash);
        if (!row) { row = { id: crypto.randomUUID() }; rows.push(row); }
        Object.assign(row, insert);
        return [row];
      }
      const found = rows.filter(row => filters.every(filter => filter(row)));
      if (update) found.forEach(row => Object.assign(row, update));
      return found;
    };
    const chain = {
      select: () => chain,
      eq: (key: string, value: unknown) => { filters.push(row => row[key] === value); return chain; },
      neq: (key: string, value: unknown) => { filters.push(row => row[key] !== value); return chain; },
      in: (key: string, values: unknown[]) => { filters.push(row => values.includes(row[key])); return chain; },
      upsert: (value: Row) => { insert = value; return chain; },
      update: (value: Row) => { update = value; return chain; },
      single: async () => ({ data: execute()[0] || null, error: null }),
      maybeSingle: async () => ({ data: execute()[0] || null, error: null }),
      then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: execute(), error: null }).then(resolve),
    };
    return chain;
  } };
  bindRunClient(context.runId, client);
  return { context, rows, recover: () => { releaseRunClient(context.runId); bindRunClient(context.runId, client); },
    dispose: () => releaseRunClient(context.runId) };
}
function searchSeed(urls: string[]) { return { tool_name: 'search_travel_web', status: 'completed', arguments: {},
  output: { results: urls.map(url => ({ url, title: 'Guide', source: 'tavily' })) } }; }
function pageSeed() { return { tool_name: 'read_travel_guide', status: 'completed', arguments: { url },
  output: { available: true, images: Array.from({ length: 8 }, (_, i) => ({ id: i + 1, url: `https://images.example.com/${i + 1}.jpg` })) } }; }
async function invoke(h: ReturnType<typeof harness>, tool: typeof readTravelGuide | typeof readTravelGuideImages, args: unknown) {
  return tool.invoke({ context: h.context } as never, JSON.stringify(args));
}
async function withProviders(fn: () => Promise<void>) {
  const names = ['TAVILY_API_KEY', 'KAIPA_AI_API_KEY'];
  const saved = names.map(name => Deno.env.get(name));
  const originalFetch = globalThis.fetch;
  names.forEach(name => Deno.env.set(name, 'fixture'));
  try { await fn(); } finally {
    globalThis.fetch = originalFetch;
    names.forEach((name, i) => saved[i] === undefined ? Deno.env.delete(name) : Deno.env.set(name, saved[i]!));
  }
}

Deno.test('guide tools are read-only tools exposed in global and journey modes', () => {
  for (const tools of [kaipaAllTools, kaipaJourneyTools]) {
    assert(tools.some(tool => tool.name === 'read_travel_guide'));
    assert(tools.some(tool => tool.name === 'read_travel_guide_images'));
  }
});

Deno.test('guide reads serialize the page budget and reuse receipts after recovery', async () => withProviders(async () => {
  const urls = Array.from({ length: 4 }, (_, i) => `${url}?page=${i}`);
  const h = harness([searchSeed(urls)]);
  let requests = 0;
  globalThis.fetch = async (_target, init) => {
    requests++;
    const requested = JSON.parse(String(init?.body)).urls[0];
    return new Response(JSON.stringify({ results: [{ url: requested, raw_content: 'Day 1 营地', images: [] }] }));
  };
  try {
    await Promise.all(urls.map(url => invoke(h, readTravelGuide, { url })));
    assert(requests === 3, 'Parallel calls exceeded the three-page budget');
    assert(h.rows.some(row => row.output?.status === 'budget_exhausted'));
    h.recover();
    await invoke(h, readTravelGuide, { url: urls[0] });
    await invoke(h, readTravelGuide, { url: urls[3] });
    assert(requests === 3, 'Recovery repeated extraction or lost the budget');
  } finally { h.dispose(); }
}));

Deno.test('guide tools reject unsearched URLs and foreign image IDs before network access', async () => withProviders(async () => {
  const h = harness([searchSeed([url]), pageSeed()]);
  globalThis.fetch = () => { throw new Error('Unexpected network'); };
  try {
    await invoke(h, readTravelGuide, { url: 'https://other.example.com/' });
    await invoke(h, readTravelGuideImages, { url, imageIds: [99] });
    assert(h.rows.filter(row => row.status === 'failed').length === 2);
  } finally { h.dispose(); }
}));

Deno.test('image observations reuse individual image IDs and enforce durable budgets', async () => withProviders(async () => {
  const h = harness([pageSeed()]);
  const seen: number[][] = [];
  globalThis.fetch = async (_target, init) => {
    const body = JSON.parse(String(init?.body));
    const ids = body.messages[1].content.filter((part: Row) => part.type === 'text').map((part: Row) => Number(part.text.split(': ')[1]));
    seen.push(ids);
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ images: ids.map((imageId: number) => ({
      imageId, kind: 'map', visibleText: '营地', observations: [], uncertainties: ['距离未知'],
    })) }) } }] }));
  };
  try {
    await invoke(h, readTravelGuideImages, { url, imageIds: [4, 3, 2, 1] });
    await invoke(h, readTravelGuideImages, { url, imageIds: [2, 3] });
    assert(seen.length === 1, 'Previously analyzed image IDs were sent again');
    await invoke(h, readTravelGuideImages, { url, imageIds: [5, 6] });
    h.recover();
    await invoke(h, readTravelGuideImages, { url, imageIds: [7] });
    await invoke(h, readTravelGuideImages, { url, imageIds: [1, 2, 3, 4] });
    assert(Number(seen.length) === 2 && seen.flat().length === 6);
    assert(h.rows.some(row => row.output?.status === 'budget_exhausted'));
  } finally { h.dispose(); }
}));

Deno.test('failed extraction is cached as unavailable, never as a retrieved article', async () => withProviders(async () => {
  const h = harness([searchSeed([url])]);
  let requests = 0;
  globalThis.fetch = async () => { requests++; return new Response('private provider detail', { status: 403 }); };
  try {
    await invoke(h, readTravelGuide, { url });
    h.recover();
    await invoke(h, readTravelGuide, { url });
    assert(requests === 1);
    const receipt = h.rows.find(row => row.tool_name === 'read_travel_guide');
    assert(receipt?.status === 'completed' && receipt.output.available === false && receipt.output.text === '');
    assert(!JSON.stringify(receipt).includes('private provider detail'));
  } finally { h.dispose(); }
}));

Deno.test('manual verification blocks rephrased searches in the same task even after recovery', async () => {
  const names = ['TRAVEL_SEARCH_SOURCES', 'MEDIACRAWLER_SEARCH_URL', 'MEDIACRAWLER_API_KEY'];
  const old = names.map(name => Deno.env.get(name));
  const original = globalThis.fetch;
  const h = harness([]);
  let calls = 0;
  try {
    Deno.env.set(names[0], 'douyin');
    Deno.env.set(names[1], 'http://gateway.internal/v1/search');
    Deno.env.set(names[2], 'fixture');
    globalThis.fetch = async () => { calls++; return new Response(JSON.stringify({ detail: 'verification_required: Manual verification required' }), { status: 503 }); };
    const search = (query: string) => searchTravelWeb.invoke({ context: h.context } as never, JSON.stringify({ query, purpose: 'guide' }));
    await search('哈天线');
    await search('哈天线');
    h.recover();
    await search('哈天线营地');
    assert(calls === 1, 'Keyword changes or recovery retried a verification-blocked provider');
  } finally {
    h.dispose();
    globalThis.fetch = original;
    names.forEach((name, i) => old[i] === undefined ? Deno.env.delete(name) : Deno.env.set(name, old[i]!));
  }
});

Deno.test('the staged pipeline\'s planned guide reads are exempt from the interactive page budget', async () => {
  const names = ['TRAVEL_SEARCH_SOURCES', 'TAVILY_API_KEY'];
  const old = names.map(name => Deno.env.get(name));
  const original = globalThis.fetch;
  const h = harness([]);
  try {
    Deno.env.set(names[0], 'tavily');
    Deno.env.set(names[1], 'fixture');
    const guideUrls = Array.from({ length: 6 }, (_, i) => `https://guides.example.com/day-${i}`);
    globalThis.fetch = async (input: unknown, init?: RequestInit) => {
      const target = String(input instanceof Request ? input.url : input);
      if (target.includes('/extract')) {
        const body = JSON.parse(String(init?.body ?? '{}'));
        return new Response(JSON.stringify({ results: [{ url: Array.isArray(body.urls) ? body.urls[0] : '', raw_content: '攻略正文', images: [] }] }));
      }
      return new Response(JSON.stringify({ results: guideUrls.map((guideUrl, i) => ({ url: guideUrl, title: `攻略${i}`, content: '内容' })) }));
    };
    const search = () => searchTravelWeb.invoke({ context: h.context } as never, JSON.stringify({ query: '贡嘎 徒步 攻略', purpose: 'guide' }));
    const read = (guideUrl: string) => readTravelGuide.invoke({ context: h.context } as never, JSON.stringify({ url: guideUrl }));
    await search();
    // The first three distinct reads stay inside the interactive page budget...
    for (let i = 0; i < 3; i++) assert((await read(guideUrls[i]) as { status?: string }).status !== 'budget_exhausted', `read ${i} must stay within the page budget`);
    // ...an unplanned fourth read is refused...
    assert((await read(guideUrls[3]) as { status?: string }).status === 'budget_exhausted', 'an unplanned fourth read must hit the page budget');
    // ...but the collector registers its planned reads, which are exempt.
    allowGuideReads(h.context.runId, [guideUrls[4]]);
    try {
      assert((await read(guideUrls[4]) as { status?: string }).status !== 'budget_exhausted', 'a planned read must bypass the page budget');
    } finally {
      clearGuideQueries(h.context.runId);
    }
    // After the pipeline unregisters its reads the budget is back in force.
    assert((await read(guideUrls[5]) as { status?: string }).status === 'budget_exhausted', 'the page budget did not return after the planned reads were cleared');
  } finally {
    h.dispose();
    globalThis.fetch = original;
    names.forEach((name, i) => old[i] === undefined ? Deno.env.delete(name) : Deno.env.set(name, old[i]!));
  }
});

Deno.test('the staged pipeline\'s planned per-route queries bypass the one-discovery guard only for those exact queries', async () => {
  const names = ['TRAVEL_SEARCH_SOURCES', 'TAVILY_API_KEY'];
  const old = names.map(name => Deno.env.get(name));
  const original = globalThis.fetch;
  const h = harness([]);
  let requests = 0;
  try {
    Deno.env.set(names[0], 'tavily');
    Deno.env.set(names[1], 'fixture');
    globalThis.fetch = async () => {
      requests++;
      return new Response(JSON.stringify({ results: [{ url, title: '攻略', content: '内容' }] }));
    };
    const search = (query: string) => searchTravelWeb.invoke({ context: h.context } as never, JSON.stringify({ query, purpose: 'guide' }));
    await search('贡嘎 徒步 攻略');
    // A planned per-route query is a fresh discovery pass...
    allowGuideQueries(h.context.runId, ['四姑娘山 徒步 攻略']);
    try {
      await search('四姑娘山 徒步 攻略');
      assert(requests === 2, 'A planned route query did not reach the provider');
      // ...while an unplanned rephrase still reuses the original search.
      await search('贡嘎 环线 攻略');
      assert(requests === 2, 'An unplanned rephrase bypassed the one-discovery guard');
    } finally {
      clearGuideQueries(h.context.runId);
    }
    // After the pipeline unregisters its queries the guard is back in force.
    await search('贡嘎 徒步 攻略');
    assert(requests === 2, 'The guard did not return after the planned queries were cleared');
  } finally {
    h.dispose();
    globalThis.fetch = original;
    names.forEach((name, i) => old[i] === undefined ? Deno.env.delete(name) : Deno.env.set(name, old[i]!));
  }
});

Deno.test('guide keyword variants reuse one search across parallel calls and worker recovery', async () => {
  const names = ['TRAVEL_SEARCH_SOURCES', 'TAVILY_API_KEY'];
  const old = names.map(name => Deno.env.get(name));
  const original = globalThis.fetch;
  const h = harness([]);
  let requests = 0;
  try {
    Deno.env.set(names[0], 'tavily');
    Deno.env.set(names[1], 'fixture');
    globalThis.fetch = async () => {
      requests++;
      return new Response(JSON.stringify({ results: [{ url, title: '哈天线攻略', content: '营地与路线' }] }));
    };
    const search = (query: string, purpose = 'guide') => searchTravelWeb.invoke({ context: h.context } as never, JSON.stringify({ query, purpose }));
    await Promise.all([search('哈天线 徒步 5天 营地'), search('哈天线 正穿 5天 行程')]);
    assert(requests === 1, 'Parallel keyword variants performed multiple searches');
    h.recover();
    const reused = await search('哈天线 重装 路线 哈巴 天宝雪山');
    assert(JSON.stringify(reused).includes(url), 'Recovery did not return original sources');
    assert(requests === 1, 'Recovery repeated guide discovery');
    assert(h.rows.filter(row => row.tool_name === 'search_travel_web').length === 1, 'Reuse created misleading search progress');
    await search('丽江 到 哈巴村 班车', 'transport');
    assert(Number(requests) === 2, 'Guide budget blocked a transport query');
  } finally {
    h.dispose();
    globalThis.fetch = original;
    names.forEach((name, i) => old[i] === undefined ? Deno.env.delete(name) : Deno.env.set(name, old[i]!));
  }
});
