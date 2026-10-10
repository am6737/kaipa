import { bindRunClient, releaseRunClient, createReadRouteGuide, kaipaAllTools, kaipaGlobalTools, kaipaJourneyTools } from './tools.ts';
import { fixtureGuide, gapAdmin } from './guide-fixtures.ts';
import type { AgentContext } from './types.ts';

function assert(value: unknown, message = 'Assertion failed'): asserts value { if (!value) throw new Error(message); }
type Row = Record<string, any>;
function harness(catalog: Row[] = []) {
  const context: AgentContext = { userId: 'user', threadId: 'thread', runId: crypto.randomUUID(), originalUserMessage: '问路线' };
  const rows: Row[] = [];
  const client = { from(table: string) {
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
      const found = (table === 'routes' ? catalog : rows).filter(row => filters.every(filter => filter(row)));
      if (update) found.forEach(row => Object.assign(row, update));
      return found;
    };
    const chain = {
      select: () => chain, limit: () => chain,
      eq: (key: string, value: unknown) => { filters.push(row => row[key] === value); return chain; },
      ilike: (key: string, value: string) => { filters.push(row => String(row[key]).includes(value.replaceAll('%', ''))); return chain; },
      upsert: (value: Row) => { insert = value; return chain; },
      update: (value: Row) => { update = value; return chain; },
      single: async () => ({ data: execute()[0] || null, error: null }),
      maybeSingle: async () => ({ data: execute()[0] || null, error: null }),
      then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: execute(), error: null }).then(resolve),
    };
    return chain;
  } };
  const admin = gapAdmin();
  bindRunClient(context.runId, client, admin);
  return { client, context, rows, admin, dispose: () => releaseRunClient(context.runId) };
}

Deno.test('trusted guide tool replaces all three external guide tools in every runtime mode', () => {
  for (const tools of [kaipaAllTools, kaipaGlobalTools, kaipaJourneyTools]) {
    assert(tools.some(tool => tool.name === 'read_route_guide'));
    for (const name of ['search_travel_web', 'read_travel_guide', 'read_travel_guide_images']) assert(!tools.some(tool => tool.name === name), `${name} exposed`);
  }
});

Deno.test('read_route_guide returns trusted markdown, asOf and sources without network access', async () => {
  const guide = fixtureGuide();
  const h = harness();
  try {
    const tool = createReadRouteGuide(id => id === guide.routeId ? guide : null);
    const result: any = await tool.invoke({ context: h.context } as never, JSON.stringify({ routeId: guide.routeId }));
    assert(result.available && result.markdown === guide.markdown && result.asOf === guide.asOf);
    assert(result.sources.length === 2 && result.sources[1].url === null);
    assert(result.missingSections.length === 0 && result.disclosure === null);
    assert(h.admin.calls.length === 0);
    assert(h.rows[0].status === 'completed' && h.rows[0].tool_name === 'read_route_guide');
  } finally { h.dispose(); }
});

Deno.test('read_route_guide resolves a shortened catalog route name', async () => {
  const guide = fixtureGuide();
  const h = harness([{ id: guide.routeId, name: '测试路线连穿' }]);
  try {
    const result: any = await createReadRouteGuide(() => guide).invoke({ context: h.context } as never, JSON.stringify({ name: '测试路线' }));
    assert(result.available && result.routeId === guide.routeId && result.name === '测试路线连穿');
  } finally { h.dispose(); }
});

Deno.test('read_route_guide missing guide discloses and records one gap across repeated reads', async () => {
  const h = harness([{ id: 'missing', name: '未编写路线' }]);
  try {
    const tool = createReadRouteGuide(() => null);
    for (const args of [{ routeId: 'missing' }, { name: '未编写路线' }, { routeId: 'missing' }]) {
      const result: any = await tool.invoke({ context: h.context } as never, JSON.stringify(args));
      assert(!result.available && result.markdown === '' && result.asOf === null);
      assert(result.disclosure.includes('尚未覆盖') && result.missingSections.join() === '*');
    }
    assert(h.admin.calls.length === 1);
    assert(JSON.stringify(h.admin.calls[0]) === JSON.stringify({ name: 'record_route_guide_gaps', args: { p_route_id: 'missing', p_sections: ['*'], p_run_id: h.context.runId } }));
  } finally { h.dispose(); }
});

Deno.test('read_route_guide without a catalog match or with ambiguous matches never invents an id', async () => {
  for (const catalog of [[], [{ id: 'a', name: '测试甲' }, { id: 'b', name: '测试乙' }]]) {
    const h = harness(catalog);
    try {
      const result: any = await createReadRouteGuide(() => { throw new Error('unexpected lookup'); }).invoke({ context: h.context } as never, JSON.stringify({ name: '测试' }));
      assert(!result.available && result.routeId === null && result.disclosure.includes('尚未覆盖'));
      assert(h.admin.calls.length === 0);
    } finally { h.dispose(); }
  }
});

Deno.test('read_route_guide refreshes a changed guide instead of replaying old content', async () => {
  let guide = fixtureGuide();
  const h = harness();
  try {
    const tool = createReadRouteGuide(() => guide);
    const read = () => tool.invoke({ context: h.context } as never, JSON.stringify({ routeId: guide.routeId }));
    await read();
    guide = { ...guide, markdown: 'updated trusted body' };
    assert((await read() as any).markdown === guide.markdown);
  } finally { h.dispose(); }
});
