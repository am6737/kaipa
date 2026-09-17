import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { setTimeout as sleep } from 'node:timers/promises';
import { createClient } from '@supabase/supabase-js';

// Real self-hosted worker/model; synthetic locations and disposable account only.
process.loadEnvFile(process.env.KAIPA_RUNTIME_ENV || '../kaipa-supabase-docker/.env');
const url = `http://127.0.0.1:${process.env.KONG_HTTP_PORT || '8010'}`;
const admin = createClient(url, process.env.SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const client = createClient(url, process.env.ANON_KEY, { auth: { persistSession: false } });
const reportPath = process.argv.find(arg => arg.startsWith('--report='))?.slice(9);
const selectedCase = process.argv.find(arg => arg.startsWith('--case='))?.slice(7);
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const liveDate = new Date(Date.parse(`${today}T00:00:00Z`) + 2 * 86400000).toISOString().slice(0, 10);
const report = { startedAt: new Date().toISOString(), results: [] };
let userId;
const checked = async request => { const result = await request; if (result.error) throw result.error; return result.data; };
const fix = (placeName = '广东省 广州市', latitude = 23.129, longitude = 113.264) => ({
  status: 'available', placeName, latitude, longitude, accuracy: 40, timestamp: Date.now(), coordinateSystem: 'WGS84',
});

async function fixture(date = '2026-10-15') {
  const journeyId = `transport-${randomUUID()}`;
  await checked(client.from('journeys').insert({ id: journeyId, user_id: userId, name: '漓江交通联调', region: '桂林阳朔',
    lng: 110.45, lat: 24.9, tone: 'forest', planned_date: date, total_days: 1, days: '1 天' }));
  await checked(client.from('timeline_rows').insert({ id: `hike-${randomUUID()}`, user_id: userId, journey_id: journeyId,
    title: '杨堤乡漓江步道起点至兴坪镇徒步', day: 'Day 1', time_mins: 450, time_end_mins: 970, checked: true }));
  return { journeyId };
}
async function snapshot(journeyId) {
  const lists = await checked(client.from('journey_packing_lists').select('*').eq('journey_id', journeyId).order('id'));
  return {
    journey: await checked(client.from('journeys').select('id,name,planned_date,total_days').eq('id', journeyId).single()),
    rows: await checked(client.from('timeline_rows').select('id,title,day,time_mins,time_end_mins,checked').eq('journey_id', journeyId).order('id')),
    packing: { lists, items: lists.length ? await checked(client.from('journey_packing_items').select('*').in('list_id', lists.map(list => list.id)).order('id')) : [] },
  };
}
async function turn(conversation, id, message, location, verify) {
  if (selectedCase && selectedCase !== id) return { passed: false, skipped: true };
  const before = await snapshot(conversation.journeyId);
  const cursor = await checked(client.from('agent_session_items').select('id').eq('thread_id', conversation.threadId || '00000000-0000-0000-0000-000000000000').order('id', { ascending: false }).limit(1));
  const started = Date.now();
  const accepted = await checked(client.functions.invoke('app-agent', { body: { action: 'turn', clientRunId: randomUUID(),
    currentJourneyId: conversation.journeyId, threadId: conversation.threadId, message, currentLocation: location,
    locale: 'zh', clientLocalDate: today, clientTimeZone: 'Asia/Shanghai' } }));
  conversation.threadId = accepted.threadId;
  let run;
  for (;;) {
    run = await checked(client.from('agent_runs').select('status,error').eq('id', accepted.runId).single());
    if (run.status !== 'running') break;
    if (Date.now() - started > 8 * 60_000) throw new Error(`Worker deadline exceeded: ${id}`);
    await sleep(2000);
  }
  const replies = await checked(client.from('agent_messages').select('content,ui').eq('thread_id', accepted.threadId)
    .eq('role', 'assistant').contains('ui', { requestId: accepted.runId }));
  const session = await checked(client.from('agent_session_items').select('item').eq('thread_id', accepted.threadId).gt('id', cursor[0]?.id || 0).order('id'));
  const calls = session.filter(row => row.item.type === 'function_call').map(row => ({ name: row.item.name, arguments: row.item.arguments }));
  const result = { id, elapsedMs: Date.now() - started, runStatus: run.status, error: run.error, reply: replies[0], calls, before, after: await snapshot(conversation.journeyId) };
  result.providerCalls = await checked(client.from('agent_tool_calls').select('tool_name,arguments,output,status').eq('run_id', accepted.runId)
    .in('tool_name', ['search_transport', 'search_travel_web']));
  result.task = (await checked(client.from('agent_task_states').select('state').eq('run_id', accepted.runId).maybeSingle()))?.state;
  try {
    assert.equal(run.status, 'completed', run.error);
    assert.equal(replies.length, 1);
    await verify(result);
    result.passed = true;
  } catch (error) { result.passed = false; result.failure = error.message; }
  report.results.push(result);
  if (reportPath) await writeFile(reportPath, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ id, passed: result.passed, elapsedMs: result.elapsedMs, failure: result.failure,
    reply: result.reply?.content, travelContext: result.reply?.ui?.travelContext, quickReplies: result.reply?.ui?.quickReplies,
    tools: calls.map(call => call.name) }));
  return result;
}
const noWrites = result => assert.deepEqual(result.after, result.before, 'Unexpected itinerary/date/packing changes');

try {
  const email = `transport-eval-${randomUUID()}@example.test`, password = randomUUID();
  userId = (await checked(admin.auth.admin.createUser({ email, password, email_confirm: true }))).user.id;
  await checked(client.auth.signInWithPassword({ email, password }));
  const trip = await fixture();
  await turn(trip, 'location-candidate', '帮我安排完整往返交通，包含到徒步起点和从终点离开的接驳。复用已确认地点；缺少出发地时可建议本次定位，并确认是否往返这里。先分析可行方案，只问关键问题，保留已有徒步行程。', fix(), result => {
    noWrites(result);
    assert.match(result.reply.content, /广州/);
    assert.match(result.reply.content, /是否|是不是|确认/);
    assert.ok((result.reply.content.match(/[?？]/g) || []).length <= 1, 'Duplicate confirmation questions');
    assert.equal(result.reply.ui.travelContext?.origin ?? null, null, 'GPS was treated as confirmation');
    assert.ok(result.reply.ui.taskOutcome.pendingQuestion);
    assert.ok(result.reply.ui.quickReplies?.some(reply => /广州/.test(reply.message)));
  });
  await turn(trip, 'round-trip-chain', '确认从广州出发，也回广州，高铁优先，两个人。先给完整交通方案，不保存。保留10月15日07:30至16:10的徒步，可以比较前晚抵达但暂不订住宿；班次和拼车没核实就明确标注。', undefined, result => {
    noWrites(result);
    assert.match(result.reply.ui.travelContext.origin, /广州/);
    assert.match(result.reply.ui.travelContext.returnDestination, /广州/);
    assert.equal(result.reply.ui.travelContext.direction, 'round_trip');
    assert.match(result.reply.content, /杨堤/);
    assert.match(result.reply.content, /兴坪/);
    assert.match(result.reply.content, /高铁|动车/);
    assert.match(result.reply.content, /接驳|出租|网约|拼车|班车/);
    assert.match(result.reply.content, /前晚|前一晚|提前一天|14日|10-14/);
    assert.match(result.reply.content, /核实|核验|确认|估算|参考/);
    assert.ok(result.calls.some(call => call.name === 'search_travel_web'), 'No live travel research');
  });
  await turn(trip, 'correct-return-ignore-new-gps', '返回地改为深圳，出发地仍是广州。请记住这个更正，简单确认即可，先不要重新规划或保存行程。', fix('北京市', 39.904, 116.407), result => {
    noWrites(result);
    assert.match(result.reply.ui.travelContext.origin, /广州/);
    assert.match(result.reply.ui.travelContext.returnDestination, /深圳/);
    assert.doesNotMatch(result.reply.ui.travelContext.origin, /北京/);
  });
  const inserted = await turn(trip, 'single-confirmed-transfer', '只保存一项已确认的去程接驳：Day 1 06:30至07:10，从桂林市区乘预约出租车到杨堤乡漓江步道起点。这次只加这一项，不搜索，不加返程或住宿，不调整原徒步、日期和装备。', undefined, result => {
    assert.deepEqual(result.after.journey, result.before.journey);
    assert.deepEqual(result.after.packing, result.before.packing);
    for (const row of result.before.rows) assert.deepEqual(result.after.rows.find(item => item.id === row.id), row);
    assert.equal(result.after.rows.length, result.before.rows.length + 1);
    assert.equal(result.reply.ui.taskOutcome.status, 'completed');
  });
  if (inserted.passed) await turn(trip, 'repeat-does-not-duplicate', '再检查刚才那项Day 1 06:30至07:10桂林市区乘预约出租车到杨堤起点的接驳，已经有就保留，不重复添加，也不改任何其他内容。', undefined, noWrites);
  const permissions = await fixture();
  await turn(permissions, 'permission-required', '帮我安排往返交通，保留原徒步。', { status: 'permission_required' }, result => {
    noWrites(result);
    assert.ok(result.reply.ui.quickReplies?.some(reply => reply.action === 'request_location'), 'No location consent entry');
    assert.ok(result.reply.ui.quickReplies?.some(reply => reply.action !== 'request_location'), 'No manual alternative');
  });
  await turn(permissions, 'location-refused', '不要获取定位。我还没定出发城市，先不规划交通，不要修改任何数据。', undefined, result => {
    noWrites(result);
    assert.equal(result.reply.ui.travelContext?.locationDeclined, true);
    assert.ok(!result.reply.ui.quickReplies?.some(reply => reply.action === 'request_location'));
  });
  const completeChain = await fixture();
  await turn(completeChain, 'save-reviewed-complete-chain', '请保存完整往返交通，出发和返回都在桂林站。以下接驳时间已由我向司机确认：10月15日05:40从桂林站乘预约出租车到杨堤乡停车场，07:00到达；07:00至07:15从停车场步行到杨堤乡漓江步道起点；徒步后16:50从兴坪镇徒步终点乘预约出租车返回桂林站，18:20到达。保留07:30至16:10徒步，去程留15分钟准备，返程留40分钟余量。不需要搜索或住宿。先检查完整交通链衔接，再保存这些交通，不改徒步、日期或装备。', undefined, result => {
    assert.deepEqual(result.after.journey, result.before.journey);
    assert.deepEqual(result.after.packing, result.before.packing);
    for (const row of result.before.rows) assert.deepEqual(result.after.rows.find(item => item.id === row.id), row);
    assert.equal(result.after.rows.length, result.before.rows.length + 3);
    assert.equal(result.reply.ui.taskOutcome.status, 'completed');
    assert.ok(result.calls.some(call => call.name === 'review_transport_plan'), 'Full chain saved without consistency review');
    assert.deepEqual(result.task.decision.requiredOperations, ['add_itinerary_items'], 'Transport must not require hiking endpoint writes');
  });
  const routing = await fixture();
  await turn(routing, 'transport-source-routing', '从南宁出发，徒步结束后回南宁，2名成人，保留10月15日07:30至16:10徒步。请比较10月14日去程和15日返程的铁路与航空选择，先分别检查铁路和航班数据源是否可用，并检查杨堤、兴坪接驳资料。没有接入就明确告诉我，不要拿小红书或抖音当车次航班依据，不要重复换关键词搜索，不保存行程。', undefined, result => {
    noWrites(result);
    const transport = result.providerCalls.filter(call => call.tool_name === 'search_transport');
    assert.ok(transport.some(call => call.arguments.mode === 'rail'), 'Rail query bypassed dedicated tool');
    assert.ok(transport.some(call => call.arguments.mode === 'flight'), 'Flight query bypassed dedicated tool');
    for (const call of result.providerCalls.filter(call => call.tool_name === 'search_travel_web')) {
      assert.equal(call.arguments.purpose, 'transport');
      assert.ok(!call.output.sources?.some(source => ['xhs', 'douyin'].includes(source.source)), 'Community crawler used for transport');
    }
    assert.match(result.reply.content, /未接入|未连接|未配置|不可用|无法.*查询/);
  });
  const railLive = await fixture(liveDate);
  await turn(railLive, 'rail-readonly-live', `仅查询，不保存：2名成人，${liveDate}从南宁东到桂林北；徒步后当天从阳朔站回南宁东，返程只看18点之后。请分别用铁路只读工具查两个方向，出发到达站不能替换，标明票价是每位成人还是总价以及查询时间。保留原徒步时间、日期和装备。先不用查接驳，不要买票；不能衔接原徒步就明确说明。`, undefined, result => {
    noWrites(result);
    const rail = result.providerCalls.filter(call => call.tool_name === 'search_transport' && call.arguments.mode === 'rail');
    assert.ok(rail.some(call => call.arguments.origin === '南宁东' && call.arguments.destination === '桂林北' && call.output.status === 'results'), 'No live outbound rail results');
    assert.ok(rail.some(call => call.arguments.origin === '阳朔' && call.arguments.destination === '南宁东' && call.arguments.earliestHour === 18 && call.output.status === 'results'), 'No live evening return results');
    assert.match(result.reply.content, /每人|每位|单人|成人/);
    assert.match(result.reply.content, /07:30|7:30/);
    assert.match(result.reply.content, /无法衔接|不能衔接|赶不上|晚于|来不及|无法赶上/);
    for (const call of rail.filter(call => call.output.status === 'results')) {
      assert.ok(call.output.retrievedAt);
      assert.ok(call.output.offers.every(offer => offer.from === call.arguments.origin && offer.to === call.arguments.destination && offer.pricedAdults === 1));
    }
    assert.ok(!result.providerCalls.some(call => call.tool_name === 'search_travel_web'), 'Unnecessary web lookup');
  });
  const interline = await fixture(liveDate);
  await turn(interline, 'rail-connection-live', `只读验证，不保存、不购票、不改动原徒步、日期和装备。请查询${liveDate}18点后阳朔到南宁东、经桂林北的铁路中转候选。必须使用带viaStation的铁路工具，逐项解释换乘校验结果，特别核对是否其实是同车改号分段票，不能把四分钟当成可靠换乘。不查网页，不换站重试，也不另查直达。`, undefined, result => {
    noWrites(result);
    const calls = result.providerCalls.filter(call => call.tool_name === 'search_transport');
    assert.equal(calls.length, 1, 'Repeated or substituted railway query');
    const call = calls[0];
    assert.equal(call.arguments.viaStation, '桂林北');
    assert.equal(call.output.status, 'results');
    assert.ok(call.output.offers.some(o => o.connection?.status === 'same_train_split' && !o.connection.usableForPlanning));
    assert.match(result.reply.content, /同车|同一列|同一趟|同一辆/);
    assert.match(result.reply.content, /分段/);
    assert.match(result.reply.content, /不能|不可|不应|不属于|不是/);
    assert.ok(!result.providerCalls.some(call => call.tool_name === 'search_travel_web'));
  });
  const buffered = await fixture(liveDate);
  await turn(buffered, 'rail-transfer-buffer-live', `独立只读查询，不关联修改当前徒步，不保存、不购票：2名成人，${liveDate}南宁东到上海虹桥，经长沙南，查询一页铁路中转候选。只调用一次带viaStation的铁路工具，不查网页或其他车站。分别说明哪些候选达到保守换乘时间门槛、哪些不足、哪些是同车分段。时间够不代表车站通道、延误或余票有保证，票价按段按成人说明，不编造联程报价。`, undefined, result => {
    noWrites(result);
    const calls = result.providerCalls.filter(call => call.tool_name === 'search_transport');
    assert.equal(calls.length, 1);
    assert.equal(calls[0].arguments.viaStation, '长沙南');
    assert.equal(calls[0].output.status, 'results');
    assert.ok(calls[0].output.offers.some(o => o.connection?.status === 'buffer_met'));
    assert.ok(calls[0].output.offers.some(o => o.connection?.status === 'insufficient_buffer'));
    assert.match(result.reply.content, /45/);
    assert.match(result.reply.content, /不足|不达标|低于|未达到/);
    assert.match(result.reply.content, /不保证|不代表|不是.*保证|无.*保证|不等于/);
    assert.ok(!result.providerCalls.some(call => call.tool_name === 'search_travel_web'));
  });
  report.passed = report.results.length > 0 && report.results.every(result => result.passed);
  if (!report.passed) process.exitCode = 1;
} finally {
  if (userId) {
    await checked(admin.from('journeys').delete().eq('user_id', userId));
    await checked(admin.auth.admin.deleteUser(userId));
    report.cleanedUp = true;
    console.log('Disposable transport account and journeys removed.');
  }
  report.finishedAt = new Date().toISOString();
  if (reportPath) await writeFile(reportPath, JSON.stringify(report, null, 2));
}
