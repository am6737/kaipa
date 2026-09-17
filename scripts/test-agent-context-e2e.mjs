import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { createClient } from '@supabase/supabase-js';

process.loadEnvFile(process.env.KAIPA_RUNTIME_ENV || '../kaipa-supabase-docker/.env');
const url = `http://127.0.0.1:${process.env.KONG_HTTP_PORT || '8010'}`;
const admin = createClient(url, process.env.SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const client = createClient(url, process.env.ANON_KEY, { auth: { persistSession: false } });
const journeyId = `context-e2e-${randomUUID()}`;
let userId;
let threadId;
async function checked(request) { const result = await request; if (result.error) throw result.error; return result.data; }
async function turn(message, allowWrites = false) {
  const accepted = await checked(client.functions.invoke('app-agent', { body: { action: 'turn', currentJourneyId: journeyId, threadId, clientRunId: randomUUID(), message, locale: 'zh' } }));
  threadId = accepted.threadId;
  const deadline = Date.now() + 8 * 60_000;
  while (true) {
    const run = await checked(client.from('agent_runs').select('status,error,final_output,agent_version').eq('id', accepted.runId).single());
    if (run.status !== 'running') {
      assert.equal(run.status, 'completed', run.error);
      assert.equal(run.agent_version, 'kaipa-harness-v1');
      const calls = await checked(client.from('agent_tool_calls').select('tool_name,status,arguments,output').eq('run_id', accepted.runId).order('created_at'));
      if (!allowWrites) assert.ok(!calls.some((call) => /^(add_|delete_|set_|create_|update_)/.test(call.tool_name)), 'Read-only conversation performed a mutation');
      return { run, calls };
    }
    assert.ok(Date.now() < deadline, 'Agent context test deadline exceeded');
    await sleep(1000);
  }
}

try {
  const email = `context-${randomUUID()}@example.test`;
  const password = randomUUID();
  const created = await checked(admin.auth.admin.createUser({ email, password, email_confirm: true }));
  userId = created.user.id;
  await checked(client.auth.signInWithPassword({ email, password }));
  const trackId = (await checked(client.from('tracks').insert({ user_id: userId, name: '上下文只读测试轨迹', file_name: 'context.gpx',
    file_format: 'gpx', coords: [[120.1,30.2],[120.11,30.21]], waypoints: [{ name: '终点', km: 1.47 }] }).select('id').single())).id;
  await checked(client.from('journeys').insert({ id: journeyId, user_id: userId, name: '上下文只读测试', region: '杭州', lng: 120.1, lat: 30.2, tone: 'forest', planned_date: '2026-10-15', total_days: 1, days: '1 天', track_id: trackId }));
  if (process.argv.includes('--schedule-only')) {
    const rowId = `schedule-${randomUUID()}`;
    const groupId = `schedule-${randomUUID()}`;
    await checked(client.from('timeline_rows').insert({ id: rowId, journey_id: journeyId, user_id: userId, title: '九溪徒步', day: 'Day 1', checked: true }));
    await checked(client.from('timeline_groups').insert({ id: groupId, journey_id: journeyId, user_id: userId, name: 'Day 1', sort_order: 0, route_end_meters: 1470 }));
    const edited = await turn('请直接把当前旅程改为两天，出发日期提前到2026-10-14，将原来 Day 1 的徒步行程整体移到 Day 2，保留轨迹终点和装备。然后在 Day 1 添加一条 18:00 的“杭州东站集合”，这是我已确认的安排，不用搜索，不用另加交通或住宿，不用我手动修改。', true);
    assert.ok(edited.calls.some((call) => call.tool_name === 'update_journey_schedule' && call.status === 'completed'), 'Agent did not execute schedule editing');
    assert.ok(edited.calls.some((call) => call.tool_name === 'add_itinerary_items' && call.status === 'completed'), 'Agent did not continue writing after schedule editing');
    const trip = await checked(client.from('journeys').select('planned_date,total_days').eq('id', journeyId).single());
    assert.deepEqual(trip, { planned_date: '2026-10-14', total_days: 2 });
    const row = await checked(client.from('timeline_rows').select('day,checked').eq('id', rowId).single());
    assert.deepEqual(row, { day: 'Day 2', checked: true });
    const group = await checked(client.from('timeline_groups').select('name,route_end_meters').eq('id', groupId).single());
    assert.deepEqual(group, { name: 'Day 2', route_end_meters: 1470 });
    const orderedGroups = await checked(client.from('timeline_groups').select('name').eq('journey_id', journeyId).eq('deleted', false).order('sort_order'));
    assert.deepEqual(orderedGroups.map((item) => item.name), ['Day 1', 'Day 2']);
    console.log('Live agent adjusted date/day count in place, preserved endpoint and continued adding an item.');
    const undone = await turn('撤销刚才这一轮的所有修改，恢复原来的一天旅程和原日期。', true);
    assert.ok(undone.calls.some((call) => call.tool_name === 'undo_last_agent_changes' && call.status === 'completed'), 'Agent did not undo the complete run');
    const restored = await checked(client.from('journeys').select('planned_date,total_days').eq('id', journeyId).single());
    assert.deepEqual(restored, { planned_date: '2026-10-15', total_days: 1 });
    const rows = await checked(client.from('timeline_rows').select('id,day').eq('journey_id', journeyId));
    assert.deepEqual(rows, [{ id: rowId, day: 'Day 1' }]);
    console.log('Live agent undid schedule and subsequent addition together.');
  }
  if (!process.argv.includes('--concurrency-only') && !process.argv.includes('--schedule-only')) {
  const first = await turn('只讨论不修改数据。请读取当前旅程的轨迹摘要，告诉我起终点坐标和里程。另外记住：我偏好公共交通，预算300元，酒店已经订好，不要再推荐住宿。');
  assert.ok(first.calls.some((call) => call.tool_name === 'get_journey_details' && call.status === 'completed'));
  assert.ok(!JSON.stringify(first.calls).includes('coords'), 'Model received raw geometry');
  assert.ok(!first.calls.some((call) => call.tool_name === 'list_gear'), 'Read-only track question loaded gear');
  console.log('First turn read bounded track summary without gear or raw coordinates.');
  const second = await turn('仍然只讨论，不修改。再告诉我刚才轨迹的里程，以及我说的交通偏好和预算。');
  assert.ok(!second.calls.some((call) => call.tool_name === 'get_journey_details'), 'Unchanged track was reread');
  assert.match(second.run.final_output, /300/);
  console.log('Follow-up reused version-verified context without a journey read.');
  await checked(client.from('tracks').update({ coords: [[120.1,30.2],[120.12,30.22]] }).eq('id', trackId));
  const third = await turn('只读不修改。现在的轨迹终点坐标和总里程是多少？');
  assert.ok(third.calls.some((call) => call.tool_name === 'get_journey_details' && call.arguments.sections.includes('track')));
  assert.match(third.run.final_output, /120\.12/);
  console.log('Manual track edit invalidated the summary and refreshed the endpoint.');

  const written = await turn('请执行这一项明确修改：在当前旅程 Day 1 添加一条 09:00 的行程“九溪公交站集合”。只添加这一项，不修改其他内容，不需要搜索外部资料。', true);
  assert.ok(written.calls.some((call) => call.tool_name === 'add_itinerary_items' && call.status === 'completed'), 'Version-checked tool did not save the requested item');
  const savedRows = await checked(client.from('timeline_rows').select('title').eq('journey_id', journeyId));
  assert.equal(savedRows.length, 1);
  assert.equal(savedRows[0].title, '九溪公交站集合');
  console.log('Live agent added exactly one itinerary item through the version-checked transaction.');

  const filler = Array.from({ length: 10 }, (_, i) => [
    { thread_id: threadId, user_id: userId, item: { type: 'message', role: 'user', content: `历史测试记录${i}，无需执行任何操作。` + '这是一段用于检查历史压缩的普通旅行记录，不包含新的偏好或任何修改请求。'.repeat(120) } },
    { thread_id: threadId, user_id: userId, item: { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: '已知悉，这段记录不改变任何偏好。' }] } },
  ]).flat();
  await checked(client.from('agent_session_items').insert(filler));
  const fourth = await turn('只回答不要修改：我此前确认的交通偏好、预算，以及是否需要推荐住宿是什么？');
  const memory = await checked(client.from('agent_session_memory').select('through_id,summary').eq('thread_id', threadId).single());
  assert.ok(memory.through_id > 0);
  assert.match(memory.summary, /300/);
  assert.match(fourth.run.final_output, /300/);
  assert.match(fourth.run.final_output, /公共交通/);
  assert.match(fourth.run.final_output, /不需要|无需|不要|已.*订/);
  console.log('Live summarization preserved transport, budget and existing hotel constraints.');
  }
  if (!threadId) {
    threadId = randomUUID();
    await checked(client.from('agent_threads').insert({ id: threadId, user_id: userId, current_journey_id: journeyId }));
  }

  // Two real DB sessions: the manual edit holds the parent lock while an agent
  // attempts to commit an operation planned against the previous revision.
  const runId = randomUUID();
  const callId = randomUUID();
  const rowId = `row-${randomUUID()}`;
  await checked(client.from('timeline_rows').insert({ id: rowId, journey_id: journeyId, user_id: userId, title: 'Original', day: 'Day 1', sort_order: 0 }));
  const expected = await checked(client.rpc('agent_context_versions', { p_journey_id: journeyId }));
  await checked(client.from('agent_runs').insert({ id: runId, thread_id: threadId, user_id: userId, status: 'running', agent_version: 'context-test' }));
  await checked(client.from('agent_tool_calls').insert({ id: callId, run_id: runId, thread_id: threadId, user_id: userId, tool_name: 'delete_itinerary_items', arguments: { journeyId, items: [{ id: rowId, title: 'Original' }] }, arguments_hash: randomUUID(), status: 'running' }));
  const writer = spawn('docker', ['exec', '-i', 'kaipa-supabase-db', 'psql', '-X', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'postgres']);
  let output = '';
  let errors = '';
  let announce;
  const locked = new Promise((resolve, reject) => { announce = resolve; writer.on('error', reject); });
  writer.stdout.on('data', (chunk) => { output += chunk; if (output.includes('CONTEXT_LOCKED')) announce(); });
  writer.stderr.on('data', (chunk) => { errors += chunk; });
  const finished = new Promise((resolve, reject) => { writer.on('close', (code) => code === 0 ? resolve() : reject(new Error(errors))); });
  writer.stdin.end(`begin; select set_config('request.jwt.claim.sub','${userId}',true); set local role authenticated; update timeline_rows set title='Collaborator edit' where id='${rowId}';\n\\echo CONTEXT_LOCKED\nselect pg_sleep(1); commit;\n`);
  await Promise.race([locked, finished.then(() => { throw new Error('Writer exited before lock'); })]);
  const conflict = await client.rpc('apply_agent_journey_change', { p_call_id: callId, p_journey_id: journeyId, p_expected: expected, p_change: {}, p_output: { deleted: 1 }, p_undo: null });
  await finished;
  assert.equal(conflict.error?.code, 'PT409', JSON.stringify(conflict));
  assert.equal((await checked(client.from('timeline_rows').select('title').eq('id', rowId).single())).title, 'Collaborator edit');
  console.log('Concurrent edit won; stale agent transaction was rejected without deleting the row.');
} finally {
  if (userId) {
    await checked(admin.from('journeys').delete().eq('user_id', userId));
    await checked(admin.auth.admin.deleteUser(userId));
    console.log('Disposable context test account and journey removed.');
  }
}
