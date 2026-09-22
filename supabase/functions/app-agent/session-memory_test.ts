import { compactSession, compactionBoundary, type SessionRow } from './session-memory.ts';
import { compactHistoricalTools, sanitizeSessionItem } from './session-input.ts';

function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }
const rows = (turns: number): SessionRow[] => Array.from({ length: turns }, (_, i) => [
  { id: i * 4 + 1, item: { role: 'user', type: 'message', content: `User decision ${i}: public transit preferred` } },
  { id: i * 4 + 2, item: { type: 'function_call', callId: `call-${i}`, name: 'get_journey_details', arguments: '{}' } },
  { id: i * 4 + 3, item: { type: 'function_call_result', callId: `call-${i}`, name: 'get_journey_details', output: { type: 'text', text: '{"journey":{"track_coords":[[110,25],[111,26]]}}' } } },
  { id: i * 4 + 4, item: { role: 'assistant', type: 'message', content: 'Confirmed' } },
]).flat();

Deno.test('history strips geometry and duplicate snapshots without mutating originals', () => {
  const history = rows(1);
  const original = JSON.stringify(history);
  const result = compactHistoricalTools(history.map((row) => row.item));
  assert(!JSON.stringify(result).includes('track_coords'), 'raw coordinates retained');
  assert(result[2].type === 'function_call_result' && result[2].callId === 'call-0', 'tool pairing broken');
  assert(JSON.stringify(history) === original, 'persisted history mutated');
  const input = { role: 'user', content: [{ type: 'input_text', text: '本轮已检查的数据上下文：{"huge":"old data"}\n\n用户消息：返回原出发点，公共交通优先' }] };
  const clean = sanitizeSessionItem(input);
  assert(!JSON.stringify(clean).includes('huge') && JSON.stringify(clean).includes('公共交通优先'), 'snapshot filtering lost user preference');
  assert(JSON.stringify(input).includes('huge'), 'input was mutated');
});

// The boundary keeps the newest `keepTurns` whole turns (4 since the context
// budget was halved to 16k), so the 10th-turn history is archived up to the
// start of turn 6.
Deno.test('compaction keeps four whole turns, previous decisions, and original archives', async () => {
  const history = rows(10);
  assert(compactionBoundary(history, 1) === 24, 'wrong whole-turn boundary');
  const result = await compactSession(history, { through_id: 0, summary: 'Hotel already booked' }, async (previous, items) => {
    assert(previous.includes('Hotel'), 'prior memory lost');
    assert(JSON.stringify(items).includes('User decision 0'), 'user decisions missing from summarizer');
    assert(!JSON.stringify(items).includes('track_coords'), 'raw data sent to summarizer');
    return 'Confirmed: hotel booked; public transit preferred. Earlier GPS is the chosen origin, not a live location.';
  }, 1);
  assert(result.rows.length === 16 && result.rows[0].item.role === 'user', 'partial tool turn retained');
  assert(result.memory?.through_id === 24, 'incorrect archival boundary');
  assert(history.length === 40, 'original archive was deleted');
});

Deno.test('short histories avoid summarization; invalid summaries never advance boundary', async () => {
  let called = false;
  await compactSession(rows(2), undefined, async () => { called = true; return 'summary'; });
  assert(!called, 'short chat paid for compaction');
  for (const summary of ['', 'x'.repeat(12001)]) {
    let rejected = false;
    try { await compactSession(rows(10), undefined, async () => summary, 1); } catch { rejected = true; }
    assert(rejected, 'invalid summary accepted');
  }
});
