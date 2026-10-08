// Real self-hosted model/worker/providers. Only a disposable user's data is written.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { setTimeout as sleep } from 'node:timers/promises';
import { createClient } from '@supabase/supabase-js';

process.loadEnvFile(process.env.KAIPA_RUNTIME_ENV || 'infra/supabase/docker/.env');
const url = `http://127.0.0.1:${process.env.KONG_HTTP_PORT || '8010'}`;
const admin = createClient(url, process.env.SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const client = createClient(url, process.env.ANON_KEY, { auth: { persistSession: false } });
const checked = async request => { const result = await request; if (result.error) throw result.error; return result.data; };
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const depart = new Date(Date.parse(`${today}T00:00:00Z`) + 2 * 86400000).toISOString().slice(0, 10);
let userId, threadId;
const danglingCase = process.argv.includes('--case=dangling');
const flight = process.argv.includes('--flight');
const report = { case: danglingCase ? 'dangling' : 'lijiang', mode: flight ? 'flight' : 'rail', startedAt: new Date().toISOString(), turns: [] };
const reportPath = process.argv.find(arg => arg.startsWith('--report='))?.slice(9) || '/tmp/kaipa-main-transport-e2e.json';
async function turn(message, currentLocation) {
  const accepted = await checked(client.functions.invoke('app-agent', { body: {
    action: 'turn', clientRunId: randomUUID(), threadId, message, currentLocation, locale: 'zh', clientLocalDate: today, clientTimeZone: 'Asia/Shanghai',
  } }));
  assert.equal(accepted.status, 'running'); threadId = accepted.threadId;
  const started = Date.now();
  for (;;) {
    const run = await checked(client.from('agent_runs').select('status,error').eq('id', accepted.runId).single());
    if (run.status !== 'running') { assert.equal(run.status, 'completed', run.error); break; }
    assert.ok(Date.now() - started < 11 * 60_000, 'run exceeded deadline');
    await sleep(2000);
  }
  const task = (await checked(client.from('agent_task_states').select('state').eq('run_id', accepted.runId).single())).state;
  const calls = await checked(client.from('agent_tool_calls').select('tool_name,status,arguments,output').eq('run_id', accepted.runId));
  const stages = await checked(client.from('agent_stages').select('stage,status,artifact').eq('run_id', accepted.runId).order('created_at'));
  const reply = (await checked(client.from('agent_messages').select('content,ui').eq('thread_id', threadId).eq('role', 'assistant').order('created_at', { ascending: false }).limit(1)))[0];
  report.turns.push({ message, task, calls, stages, reply, elapsedMs: Date.now() - started });
  console.log(JSON.stringify({ message, status: task.outcome?.status, pendingQuestion: task.outcome?.pendingQuestion, tools: calls.map(call => call.tool_name), stages: stages.map(stage => `${stage.stage}:${stage.status}`) }));
  return { task, calls, stages, reply };
}
try {
  const email = `main-transport-${randomUUID()}@example.test`, password = randomUUID();
  userId = (await checked(admin.auth.admin.createUser({ email, password, email_confirm: true }))).user.id;
  await checked(client.auth.signInWithPassword({ email, password }));
  const planned = await turn(`帮我创建并完整规划${depart}出发、全程${danglingCase ? 6 : 3}天的${danglingCase ? '党岭三湖连穿' : '漓江'}徒步旅程，其中徒步${danglingCase ? 2 : 1}天，包含往返大交通和住宿，大交通优先${flight ? '飞机，从北京出发并返回北京' : '高铁'}，不需要装备清单。`, {
    status: 'available', latitude: flight ? 39.9 : 22.75, longitude: flight ? 116.4 : 108.38, accuracy: 20, timestamp: Date.now(), coordinateSystem: 'WGS84', placeName: flight ? '北京市 朝阳区' : '广西壮族自治区 南宁市 良庆区',
  });
  assert.equal(planned.task.decision.fullHikingPlan, true);
  assert.equal(report.turns.length, 1, 'no departure confirmation or preference questionnaire');
  const main = planned.stages.find(stage => stage.stage === 'transport')?.artifact?.mainTravel;
  assert.ok(main, 'full single-route journeys must execute the independent transport stage');
  assert.ok(main.request.origin.includes(flight ? '北京' : '南宁市'), 'available current location should be used without confirmation');
  if (danglingCase && !flight) {
    assert.ok(main.queries.some(q => q.direction === 'outbound' && q.destination === '成都东'), 'Dangling high-speed hub must use Chengdu East');
    assert.ok(main.queries.some(q => q.direction === 'return' && q.origin === '成都东'));
  }
  assert.ok(main.queries.some(query => query.direction === 'outbound') && main.queries.some(query => query.direction === 'return'));
  assert.ok(planned.calls.some(call => call.tool_name === 'search_transport' && call.arguments.mode === (flight ? 'flight' : 'rail')));
  const live = main.queries.filter(query => query.result?.status === 'results');
  if (flight) assert.ok(live.length >= 2, 'both directions must return real FlyAI flights');
  const provider = flight ? '飞猪FlyAI' : '12306';
  if (live.length) {
    assert.ok(main.itineraryItems.some(item => item.title.includes(provider) && item.timeStart), 'actual rail responses must create timed service rows');
    const rows = await checked(client.from('timeline_rows').select('title,day,time_mins,time_end_mins,location,sort_order').order('sort_order'));
    const savedGroups = await checked(client.from('timeline_groups').select('name,note').order('sort_order'));
    report.savedTimeline = { rows, groups: savedGroups };
    for (const day of new Set(rows.map(row => row.day))) assert.ok(savedGroups.some(group => group.name === day && group.note?.trim()), 'each planned day must persist a daily summary');
    assert.ok(rows.every(row => row.title.length <= 60), 'itinerary titles should remain concise');
    const findSaved = item => rows.find(row => row.day === item.day && row.location?.name === item.location?.name && row.location?.incomingMode === item.location?.incomingMode && (!item.timeStart || row.time_mins === Number(item.timeStart.slice(0, 2)) * 60 + Number(item.timeStart.slice(3))));
    for (const item of main.itineraryItems) {
      const saved = findSaved(item);
      assert.ok(saved, 'each provider departure/arrival must reach the saved timeline');
      assert.equal(saved.location?.name, item.location?.name);
      assert.ok(Number.isFinite(saved.location?.longitude) && Number.isFinite(saved.location?.latitude), 'saved transport stops need real map coordinates');
    }
    assert.ok(main.itineraryItems.some(item => item.location?.incomingMode === (flight ? 'flight' : 'rail')), 'arrival stops retain their transport metadata');
    const trackPlaces = rows.filter(row => row.location?.trackId && Number.isFinite(row.location?.trackMeters) && Number.isFinite(row.location?.longitude));
    if (danglingCase) assert.ok(trackPlaces.length >= 4, 'both hiking days must have GPX start/end stops');
    for (const day of [...new Set(main.itineraryItems.map(item => item.day))]) {
      const services = main.itineraryItems.filter(item => item.day === day);
      const saved = services.map(findSaved);
      assert.ok(saved.every((row, index) => index === 0 || saved[index - 1].sort_order < row.sort_order), 'provider departure and arrival order must survive persistence');
    }
    assert.ok(savedGroups.every(group => group.note.length <= 160), 'daily notes should be brief summaries');
    assert.ok(savedGroups.every(group => !/12306查询|飞猪FlyAI|ResearchBrief|TransportPlan/.test(group.note)), 'daily notes should not append provider receipts or source explanations');
  } else {
    assert.notEqual(planned.task.outcome.status, 'completed', 'unavailable providers cannot yield a completed journey');
  }
  report.passed = true;
} finally {
  if (userId) {
    await checked(admin.from('journeys').delete().eq('user_id', userId));
    await checked(admin.from('agent_threads').delete().eq('user_id', userId));
    await checked(admin.auth.admin.deleteUser(userId));
    report.cleanedUp = true;
  }
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
}
