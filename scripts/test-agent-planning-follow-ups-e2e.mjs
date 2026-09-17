import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
import { createClient } from '@supabase/supabase-js';

// Explicit integration test against the self-hosted worker and configured model.
process.loadEnvFile(process.env.KAIPA_RUNTIME_ENV || '../kaipa-supabase-docker/.env');
const url = `http://127.0.0.1:${process.env.KONG_HTTP_PORT || '8010'}`;
const admin = createClient(url, process.env.SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const client = createClient(url, process.env.ANON_KEY, { auth: { persistSession: false } });
let userId;
const journeyId = `j_${randomUUID()}`;

async function invoke(body) {
  const result = await client.functions.invoke('app-agent', { body });
  if (result.error) throw result.error;
  return result.data;
}

async function completeTurn(body) {
  const accepted = await invoke({ action: 'turn', clientRunId: randomUUID(), locale: 'zh', currentJourneyId: journeyId, ...body });
  const deadline = Date.now() + 19 * 60_000;
  while (accepted.status === 'running') {
    const run = await client.from('agent_runs').select('status,error').eq('id', accepted.runId).single();
    if (run.error) throw run.error;
    if (run.data.status !== 'running') {
      assert.equal(run.data.status, 'completed', run.data.error);
      break;
    }
    assert.ok(Date.now() < deadline, 'Worker exceeded test deadline');
    await sleep(1500);
  }
  const history = await invoke({ action: 'history', threadId: accepted.threadId });
  return { ...accepted, final: history.messages.at(-1) };
}

async function rows() {
  const result = await client.from('timeline_rows').select('*').eq('journey_id', journeyId).order('id');
  if (result.error) throw result.error;
  return result.data;
}

try {
  const email = `planning-extras-${randomUUID()}@example.test`;
  const password = randomUUID();
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error) throw created.error;
  userId = created.data.user.id;
  const signed = await client.auth.signInWithPassword({ email, password });
  if (signed.error) throw signed.error;
  const journey = await client.from('journeys').insert({
    id: journeyId, user_id: userId, name: '九溪烟树徒步测试', region: '杭州西湖',
    lng: 120.113, lat: 30.204, coord: '30.204 N 120.113 E', tone: 'forest',
    total_days: 1, days: '1 天', planned_date: '2026-10-15', date: '2026-10-15', dist: '6 km', asc_: '+100 m',
  });
  if (journey.error) throw journey.error;
  const core = await completeTurn({ intent: 'plan_journey', message: '为当前旅程规划完整的一日徒步行程并保存。徒步路线为九溪公交站至九溪烟树至龙井村，上午9点开始，下午3点结束。装备清单已有，这次不需要生成装备清单。' });
  const replies = core.final.ui?.quickReplies;
  assert.equal(replies?.length, 2, core.final.content);
  assert.ok(replies.every((reply) => reply.action === 'supplement_plan'));
  assert.ok(core.final.ui.undoAction, 'extras must coexist with undo');
  const before = await rows();
  assert.ok(before.length > 0, 'core itinerary was saved before offering extras');
  console.log('Core planning saved with two optional extras and undo.');

  const transport = await completeTurn({ threadId: core.threadId, message: replies[0].message });
  assert.deepEqual(await rows(), before, 'missing transport details must not change the saved itinerary');
  assert.match(transport.final.content, /出发|哪里|哪儿|返回|交通/);
  assert.ok(!transport.final.ui?.quickReplies?.some((reply) => reply.action === 'supplement_plan'), 'no recurring extras on clarification');
  console.log('Transport follow-up asks for missing details without modifying the hike.');

  const accommodation = await completeTurn({ threadId: core.threadId, message: '先不补交通，只补住宿。我想提前一天住在龙井村，预算每晚300元左右，目前旅程日期还没有调整。' });
  assert.deepEqual(await rows(), before, 'extra travel days must not overwrite or shift the existing hike');
  assert.match(accommodation.final.content, /日期|天数|调整|提前/);
  console.log('Extra overnight stay preserves the hike and asks about date adjustment.');
} finally {
  if (userId) {
    const journeys = await admin.from('journeys').delete().eq('user_id', userId);
    if (journeys.error) throw journeys.error;
    const removed = await admin.auth.admin.deleteUser(userId);
    if (removed.error) throw removed.error;
    console.log('Disposable test account and journey removed.');
  }
}
