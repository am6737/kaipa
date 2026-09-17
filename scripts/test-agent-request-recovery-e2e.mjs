import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { createClient } from '@supabase/supabase-js';
import { setTimeout as sleep } from 'node:timers/promises';

// Uses a disposable account. The proxy forwards the write but drops its response.
process.loadEnvFile(process.env.KAIPA_RUNTIME_ENV || '../kaipa-supabase-docker/.env');
const url = `http://127.0.0.1:${process.env.KONG_HTTP_PORT || '8010'}`;
const admin = createClient(url, process.env.SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const client = createClient(url, process.env.ANON_KEY, { auth: { persistSession: false } });
let userId, proxy;
async function invoke(body) {
  const result = await client.functions.invoke('app-agent', { body });
  if (result.error) throw result.error;
  return result.data;
}
async function waitForRun(runId) {
  const deadline = Date.now() + 8 * 60_000;
  while (Date.now() < deadline) {
    const result = await client.from('agent_runs').select('status,error').eq('id', runId).single();
    if (result.error) throw result.error;
    if (result.data.status !== 'running') { assert.equal(result.data.status, 'completed', result.data.error); return; }
    await sleep(1000);
  }
  throw new Error('Recovery test exceeded deadline');
}
try {
  const email = `request-recovery-${randomUUID()}@example.test`;
  const password = randomUUID();
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error) throw created.error;
  userId = created.data.user.id;
  const signed = await client.auth.signInWithPassword({ email, password });
  if (signed.error) throw signed.error;
  const body = { action: 'turn', clientRunId: randomUUID(), locale: 'zh', message: '帮我创建一段新的户外旅程' };
  const results = await Promise.all([invoke(body), invoke(body)]);
  assert.equal(results[0].runId, body.clientRunId);
  assert.equal(results[0].threadId, results[1].threadId);
  await waitForRun(body.clientRunId);
  const firstHistory = await invoke({ action: 'history', threadId: results[0].threadId });
  assert.equal(firstHistory.messages.length, 2, 'concurrent clarification retry must not duplicate messages');
  assert.equal(firstHistory.activeRun, undefined);
  console.log('Concurrent requests produce one durable job and one completed message pair.');

  const followUp = { ...body, clientRunId: randomUUID(), threadId: results[0].threadId, message: '先不创建了，只告诉我 GPX 与 KML 的区别，不要搜索或修改数据。' };
  let forwarded;
  const committed = new Promise((resolve, reject) => { forwarded = { resolve, reject }; });
  proxy = createServer(async (req, res) => {
    try {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const response = await fetch(`${url}/functions/v1/app-agent`, {
        method: 'POST', headers: { Authorization: `Bearer ${signed.data.session.access_token}`, 'Content-Type': 'application/json', apikey: process.env.ANON_KEY },
        body: Buffer.concat(chunks),
      });
      const result = await response.json();
      assert.equal(response.status, 202, JSON.stringify(result));
      forwarded.resolve(result);
      // Deliberately do not write the HTTP response to the mobile-side connection.
      req.on('close', () => res.destroy());
    } catch (error) { forwarded.reject(error); res.destroy(); }
  });
  await new Promise((resolve) => proxy.listen(0, '127.0.0.1', resolve));
  const controller = new AbortController();
  const lostResponse = fetch(`http://127.0.0.1:${proxy.address().port}`, { method: 'POST', body: JSON.stringify(followUp), signal: controller.signal }).catch((error) => error);
  const response = await committed;
  controller.abort();
  const networkResult = await lostResponse;
  assert.ok(networkResult instanceof Error, 'client did not receive the committed response');
  await waitForRun(followUp.clientRunId);

  const receipt = await client.from('agent_runs').select('status,thread_id').eq('id', followUp.clientRunId).single();
  if (receipt.error) throw receipt.error;
  assert.equal(receipt.data.status, 'completed');
  const recovered = await invoke({ action: 'history', threadId: receipt.data.thread_id });
  const reply = recovered.messages.find((message) => message.role === 'assistant' && message.ui?.requestId === followUp.clientRunId);
  assert.match(reply.content, /GPX|KML/i);
  assert.equal(reply.ui.taskOutcome.status, 'completed');
  assert.equal(recovered.activeRun, undefined);
  assert.equal(recovered.messages.length, 4);
  const replay = await invoke(followUp);
  assert.equal(replay.runId, response.runId);
  assert.equal(replay.status, 'completed');
  assert.equal((await invoke({ action: 'history', threadId: replay.threadId })).messages.length, 4);
  console.log('Dropped acceptance response recovered from durable job and history without duplicate retry.');
} finally {
  if (proxy) { proxy.closeAllConnections(); await new Promise((resolve) => proxy.close(resolve)); }
  if (userId) {
    const removed = await admin.auth.admin.deleteUser(userId);
    if (removed.error) throw removed.error;
    console.log('Disposable recovery test account removed.');
  }
}
