import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { setTimeout as sleep } from 'node:timers/promises';

process.loadEnvFile(process.env.KAIPA_RUNTIME_ENV || '../kaipa-supabase-docker/.env');
const url = `http://127.0.0.1:${process.env.KONG_HTTP_PORT || '8010'}`;
const admin = createClient(url, process.env.SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const client = createClient(url, process.env.ANON_KEY, { auth: { persistSession: false } });
let userId, path;
try {
  const email = `attachment-context-${randomUUID()}@example.test`, password = randomUUID();
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error) throw created.error;
  userId = created.data.user.id;
  const signed = await client.auth.signInWithPassword({ email, password });
  if (signed.error) throw signed.error;
  path = `assistant/${userId}/existing.gpx`;
  const upload = await client.storage.from('kaipa').upload(path, '<gpx><trk><trkseg><trkpt lat="25" lon="110"/><trkpt lat="25.01" lon="110.01"/></trkseg></trk></gpx>');
  if (upload.error) throw upload.error;
  const track = { kind: 'file', name: 'existing.gpx', mimeType: 'application/gpx+xml', url: client.storage.from('kaipa').getPublicUrl(path).data.publicUrl };
  const threadId = randomUUID();
  const thread = await client.from('agent_threads').insert({ id: threadId, user_id: userId, title: 'Attachment regression' });
  if (thread.error) throw thread.error;
  const contents = [
    ['user', '帮我创建一个桂林徒步旅程', {}],
    ['user', '上传轨迹', { attachments: [track] }],
    ['assistant', '轨迹已收到，请确认出发日期。', {}],
  ];
  const messages = await client.from('agent_messages').insert(contents.map(([role, content, ui], index) => ({
    thread_id: threadId, user_id: userId, role, content, ui, created_at: new Date(Date.now() - 5000 + index * 100).toISOString(),
  })));
  if (messages.error) throw messages.error;
  const response = await client.functions.invoke('app-agent', { body: { action: 'turn', clientRunId: randomUUID(), threadId, locale: 'zh', message: '明天出发' } });
  if (response.error) throw response.error;
  assert.equal(response.data.status, 'running');
  const deadline = Date.now() + 8 * 60_000;
  for (;;) {
    const run = await client.from('agent_runs').select('status,error').eq('id', response.data.runId).single();
    if (run.error) throw run.error;
    if (run.data.status !== 'running') { assert.equal(run.data.status, 'completed', run.data.error); break; }
    assert.ok(Date.now() < deadline, 'Attachment clarification exceeded deadline');
    await sleep(1000);
  }
  const task = await client.from('agent_task_states').select('state').eq('run_id', response.data.runId).single();
  if (task.error) throw task.error;
  assert.equal(task.data.state.decision.trackAttachmentName, track.name);
  assert.equal(task.data.state.decision.days, null);
  const history = await client.functions.invoke('app-agent', { body: { action: 'history', threadId } });
  if (history.error) throw history.error;
  const userMessages = history.data.messages.filter((message) => message.role === 'user');
  assert.equal(userMessages.filter((message) => message.ui?.attachments?.length).length, 1, 'inherited attachments must not appear as new uploads');
  console.log('An original conversation upload survives a model clarification without flow metadata, and is not duplicated on the new user message.');
} finally {
  if (path) await admin.storage.from('kaipa').remove([path]);
  if (userId) {
    const removed = await admin.auth.admin.deleteUser(userId);
    if (removed.error) throw removed.error;
    console.log('Disposable attachment test account and file removed.');
  }
}
