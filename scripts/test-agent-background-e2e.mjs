import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
import { createClient } from '@supabase/supabase-js';

// Explicit integration test: uses a disposable account and the configured model.
process.loadEnvFile(process.env.KAIPA_RUNTIME_ENV || '../kaipa-supabase-docker/.env');
const url = `http://127.0.0.1:${process.env.KONG_HTTP_PORT || '8010'}`;
const admin = createClient(url, process.env.SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const client = createClient(url, process.env.ANON_KEY, { auth: { persistSession: false } });
const email = `queue-test-${randomUUID()}@example.test`;
const password = randomUUID();
let userId;
const paths = [];
async function invoke(body) {
  const result = await client.functions.invoke('app-agent', { body });
  if (result.error) throw new Error(`Agent request failed: ${result.error.message}`);
  return result.data;
}
async function waitForRun(runId) {
  const deadline = Date.now() + 19 * 60_000;
  while (Date.now() < deadline) {
    const { data, error } = await client.from('agent_runs').select('status,error').eq('id', runId).single();
    if (error) throw error;
    if (data.status !== 'running') return data;
    await sleep(1500);
  }
  throw new Error('Integration run exceeded deadline');
}
try {
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error) throw created.error;
  userId = created.data.user.id;
  const signed = await client.auth.signInWithPassword({ email, password });
  if (signed.error) throw signed.error;
  const profile = await client.from('profiles').upsert({ id: userId, display_name: 'Queue regression test' });
  if (profile.error) throw profile.error;
  async function upload(name, contents) {
    const path = `assistant/${userId}/${name}`;
    paths.push(path);
    const result = await client.storage.from('kaipa').upload(path, contents, { contentType: 'application/gpx+xml' });
    if (result.error) throw result.error;
    return { kind: 'file', name, mimeType: 'application/gpx+xml', url: client.storage.from('kaipa').getPublicUrl(path).data.publicUrl };
  }
  const good = await upload('queue-test.gpx', '<gpx><trk><name>回归测试路线</name><trkseg><trkpt lat="25" lon="110"><ele>100</ele></trkpt><trkpt lat="25.01" lon="110.01"><ele>120</ele></trkpt></trkseg></trk></gpx>');
  const body = { action: 'turn', clientRunId: randomUUID(), locale: 'zh', attachments: [good],
    message: '用上传轨迹创建一个旅程，目的地为回归测试路线，日期待定，1 天，名称为后台队列回归测试。只创建并保存轨迹，不要搜索攻略，不要生成行程或装备清单。' };
  const started = Date.now();
  const accepted = await invoke(body);
  assert.equal(accepted.status, 'running');
  console.log(`Queue accepted in ${Date.now() - started} ms; no long-lived client request remains.`);
  const duplicate = await invoke(body);
  assert.equal(duplicate.runId, accepted.runId);
  assert.equal(duplicate.threadId, accepted.threadId);
  const history = await invoke({ action: 'history', threadId: accepted.threadId });
  assert.equal(history.messages.filter(item => item.role === 'user').length, 1);
  assert.equal(history.activeRun?.id, accepted.runId);
  const completed = await waitForRun(accepted.runId);
  assert.equal(completed.status, 'completed', completed.error);
  const journeys = await client.from('journeys').select('id,tracks ( file_name, coords )').eq('user_id', userId);
  if (journeys.error) throw journeys.error;
  assert.equal(journeys.data.length, 1);
  assert.equal(journeys.data[0].tracks.file_name, good.name);
  assert.equal(journeys.data[0].tracks.coords.length, 2);
  const reopened = await invoke({ action: 'history', threadId: accepted.threadId });
  assert.equal(reopened.activeRun, undefined);
  assert.ok(reopened.messages.some(item => item.role === 'assistant'));
  console.log('Background execution, duplicate submission and history restoration passed.');

  // Simulate losing the final response after the journey write committed.
  const resetJob = await admin.from('agent_jobs').update({ state: 'failed', last_error: 'Synthetic lost response', lease_until: null }).eq('run_id', accepted.runId);
  if (resetJob.error) throw resetJob.error;
  const resetRun = await admin.from('agent_runs').update({ status: 'failed', error: 'Synthetic lost response' }).eq('id', accepted.runId);
  if (resetRun.error) throw resetRun.error;
  const resumed = await invoke({ action: 'retry_run', runId: accepted.runId });
  assert.equal(resumed.runId, accepted.runId);
  assert.equal(resumed.status, 'running');
  const resumedAgain = await invoke({ action: 'retry_run', runId: accepted.runId });
  assert.equal(resumedAgain.runId, accepted.runId);
  const resumeResult = await waitForRun(accepted.runId);
  assert.equal(resumeResult.status, 'completed', resumeResult.error);
  const afterResume = await client.from('journeys').select('id').eq('user_id', userId);
  assert.equal(afterResume.data.length, 1);
  console.log('Resume reuses the original run and uploaded file without creating another journey.');

  const bad = await upload('invalid.gpx', '<gpx/>');
  const invalid = await invoke({ ...body, clientRunId: randomUUID(), attachments: [bad] });
  const failure = await waitForRun(invalid.runId);
  assert.equal(failure.status, 'failed');
  assert.match(failure.error, /^invalid_track:/);
  const invalidHistory = await invoke({ action: 'history', threadId: invalid.threadId });
  const final = invalidHistory.messages.at(-1);
  assert.match(final.content, /轨迹文件无法解析/);
  assert.equal(final.ui.quickReplies[0].action, 'upload_track');
  const calls = await client.from('agent_tool_calls').select('id').eq('run_id', invalid.runId);
  assert.equal(calls.data.length, 0);
  console.log('Invalid track rejected before any model/tool execution.');
} finally {
  if (userId) {
    if (paths.length) await admin.storage.from('kaipa').remove(paths);
    await admin.from('journeys').delete().eq('user_id', userId);
    const removed = await admin.auth.admin.deleteUser(userId);
    if (removed.error) throw removed.error;
    console.log('Disposable account and uploaded fixtures removed.');
  }
}
