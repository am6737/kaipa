import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
import { createClient } from '@supabase/supabase-js';

process.loadEnvFile(process.env.KAIPA_RUNTIME_ENV || '../kaipa-supabase-docker/.env');
const url = `http://127.0.0.1:${process.env.KONG_HTTP_PORT || '8010'}`;
const admin = createClient(url, process.env.SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const client = createClient(url, process.env.ANON_KEY, { auth: { persistSession: false } });
async function checked(request) { const result = await request; if (result.error) throw result.error; return result.data; }
let userId;
let threadId;
const versions = 'kaipa-harness-v1';

async function turn(message, options = {}) {
  const started = Date.now();
  const args = { action: 'turn', threadId, clientRunId: randomUUID(), message, locale: 'zh', clientLocalDate: '2026-09-08', clientTimeZone: 'Asia/Shanghai', ...options };
  const accepted = await checked(client.functions.invoke('app-agent', { body: args }));
  assert.equal(accepted.status, 'running', 'All natural-language requests use the same durable loop');
  threadId = accepted.threadId;
  for (;;) {
    const run = await checked(client.from('agent_runs').select('status,error,agent_version').eq('id', accepted.runId).single());
    if (run.status !== 'running') { assert.equal(run.status, 'completed', run.error); assert.equal(run.agent_version, versions); break; }
    assert.ok(Date.now() - started < 8 * 60_000, 'Worker deadline exceeded');
    await sleep(1000);
  }
  const task = await checked(client.from('agent_task_states').select('state').eq('run_id', accepted.runId).single());
  const calls = await checked(client.from('agent_tool_calls').select('tool_name,status,arguments').eq('run_id', accepted.runId));
  const replay = await checked(client.functions.invoke('app-agent', { body: args }));
  assert.equal(replay.runId, accepted.runId);
  const replies = await checked(client.from('agent_messages').select('id,content,ui').eq('thread_id', threadId).eq('role', 'assistant').contains('ui', { requestId: accepted.runId }));
  assert.equal(replies.length, 1, 'Retry duplicated the answer');
  console.log(JSON.stringify({ message, mode: task.state.decision.mode, status: task.state.outcome?.status, operations: task.state.decision.operations, elapsedMs: Date.now() - started }));
  return { task: task.state, calls, reply: replies[0] };
}

try {
  const email = `harness-${randomUUID()}@example.test`, password = randomUUID();
  userId = (await checked(admin.auth.admin.createUser({ email, password, email_confirm: true }))).user.id;
  await checked(client.auth.signInWithPassword({ email, password }));
  const first = await turn('帮我规划一个徒步旅程');
  assert.equal(first.task.outcome.status, 'waiting');
  assert.equal((await checked(client.from('journeys').select('id'))).length, 0);
  const changed = await turn('不规划旅程了，只看看我已经有的装备，告诉我数量。不要创建或修改任何数据。');
  assert.equal(changed.task.decision.mode, 'discuss');
  assert.ok(changed.calls.some(call => call.tool_name === 'list_gear' && call.status === 'completed'));
  assert.ok(!changed.calls.some(call => /^(create_|add_|delete_|set_|update_|undo_)/.test(call.tool_name)));

  const created = await turn('Create a Hangzhou hiking journey tomorrow for 1 day. Save only the empty journey, no itinerary or packing list. No track, no research.', { locale: 'en' });
  assert.equal(created.task.decision.plannedDate, '2026-09-09');
  assert.equal(created.task.outcome.status, 'completed');
  const journeys = await checked(client.from('journeys').select('id,planned_date,total_days'));
  assert.equal(journeys.length, 1);
  assert.equal(journeys[0].planned_date, '2026-09-09');
  const journeyId = journeys[0].id;

  const draft = await turn('只讨论不保存。根据我的已确认安排拟一个简短行程草稿：Day 1，09:00 至 10:00 九溪公交站至九溪烟树徒步。不要搜索，不要装备清单。', { currentJourneyId: journeyId });
  assert.equal(draft.task.decision.mode, 'discuss');
  assert.equal(draft.task.outcome.status, 'draft');
  assert.ok(draft.task.outcome.draft?.body.includes('九溪'));
  assert.equal((await checked(client.from('timeline_rows').select('id').eq('journey_id', journeyId))).length, 0);
  const saved = await turn('就按刚才的草稿保存，只添加那一项 09:00 至 10:00 的徒步行程，不添加其他内容。', { currentJourneyId: journeyId });
  assert.equal(saved.task.decision.mode, 'execute');
  assert.equal(saved.task.outcome.status, 'completed');
  const rows = await checked(client.from('timeline_rows').select('id,time_mins,time_end_mins').eq('journey_id', journeyId));
  assert.equal(rows.length, 1);
  assert.equal(rows[0].time_mins, 540);
  assert.equal(rows[0].time_end_mins, 600);
  assert.equal(saved.reply.ui.planPreview.days[0].items.length, 1);
  const undo = await turn('撤销刚才保存的行程。', { currentJourneyId: journeyId });
  assert.equal(undo.task.decision.operations.join(), 'undo_last_agent_changes');
  assert.equal((await checked(client.from('timeline_rows').select('id').eq('journey_id', journeyId))).length, 0);
  console.log('Live harness: clarification, redirect, English date, draft, scoped save, undo and replay passed.');
} finally {
  if (userId) {
    await checked(admin.from('journeys').delete().eq('user_id', userId));
    await checked(admin.auth.admin.deleteUser(userId));
    console.log('Disposable harness account and data removed.');
  }
}
