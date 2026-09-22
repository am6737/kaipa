import { SupabaseAgentSession } from './session.ts';

function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }
function harness(turns: number, failSave = false) {
  const rows = Array.from({ length: turns }, (_, i) => ({ id: i + 1, item: { role: 'user', type: 'message', content: `Decision ${i}: ` + 'Retain this user requirement. '.repeat(140) } }));
  let memory: any;
  let pages = 0;
  const client = { from(table: string) {
    let cursor = 0;
    const chain = {
      select: () => chain, eq: () => chain, order: () => chain,
      gt: (_key: string, value: number) => { cursor = value; return chain; },
      limit: (limit: number) => { pages++; return Promise.resolve({ data: rows.filter((row) => row.id > cursor).slice(0, limit) }); },
      maybeSingle: () => Promise.resolve({ data: memory }),
      upsert: (value: unknown) => { if (failSave) return Promise.resolve({ error: new Error('Storage unavailable') }); memory = value; return Promise.resolve({}); },
    };
    assert(['agent_session_items', 'agent_session_memory'].includes(table), 'unexpected table');
    return chain;
  } };
  return { client, rows, get memory() { return memory; }, get pages() { return pages; } };
}

Deno.test('session saves memory boundary only after summary and storage succeed', async () => {
  const h = harness(12);
  const session = new SupabaseAgentSession(h.client, 't', 'u', async () => 'User confirmed public transit and a booked hotel.');
  // The boundary keeps the newest 4 whole turns, so 8 of the 12 are archived
  // and the reply is the summary plus those 4.
  const result = await session.getItems();
  assert(h.memory.through_id === 8 && result.length === 5, 'summary or recent turns missing');
  assert(h.rows.length === 12, 'archive destroyed');
  const again = await session.getItems();
  assert(again.length === 5, 'archived turns reloaded despite memory boundary');
});

Deno.test('summary failure and failed memory persistence retain every user requirement', async () => {
  for (const failSave of [false, true]) {
    const h = harness(12, failSave);
    const session = new SupabaseAgentSession(h.client, 't', 'u', async () => { if (!failSave) throw new Error('Provider timeout'); return 'Summary'; });
    const result = await session.getItems();
    assert(result.length === 12 && !h.memory, 'failed compaction silently dropped history');
    assert(JSON.stringify(result).includes('Decision 0'), 'old requirement lost');
  }
});

Deno.test('session paginates large archives instead of silently losing rows at REST limits', async () => {
  const h = harness(1002);
  const session = new SupabaseAgentSession(h.client, 't', 'u');
  const result = await session.getItems();
  assert(result.length === 1002 && h.pages === 3, 'REST pagination lost historical messages');
});
