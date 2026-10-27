import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

// Real worker/model evaluation of adding gear to the library by naming it.
// Runs on a disposable account that is deleted afterwards; see docs/agent-gear-sets.md.
//   node scripts/evaluate-agent-gear.mjs [--report=/tmp/kaipa-gear.json]
//   ONLY=single-item,all-duplicate node scripts/evaluate-agent-gear.mjs
process.loadEnvFile(process.env.KAIPA_RUNTIME_ENV || 'infra/supabase/docker/.env');
const url = process.env.KAIPA_BASE_URL || `http://127.0.0.1:${process.env.KONG_HTTP_PORT || '8010'}`;
const reportPath = process.argv.find(arg => arg.startsWith('--report='))?.slice(9);
const admin = createClient(url, process.env.SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const client = createClient(url, process.env.ANON_KEY, { auth: { persistSession: false } });
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function checked(p) { const r = await p; if (r.error) throw r.error; return r.data; }
let userId;
const results = [];
const gear = () => checked(client.from('gear_items').select('id,name,cat_id,weight,price,qty,status,owned').eq('user_id', userId).order('id'));
const setLinks = () => checked(client.from('gear_set_items').select('set_id,item_id'));

async function turn(conv, id, message, verify) {
  if (process.env.ONLY && !process.env.ONLY.split(',').includes(id)) return {};
  const before = await gear(); const linksBefore = await setLinks(); const t0 = Date.now();
  const r = { id, message };
  try {
    const acc = await checked(client.functions.invoke('app-agent', { body: { action: 'turn', threadId: conv.threadId, currentJourneyId: conv.journeyId, clientRunId: randomUUID(), message, locale: 'zh', clientLocalDate: '2026-10-27', clientTimeZone: 'Asia/Shanghai' } }));
    conv.threadId = acc.threadId;
    let run;
    while (true) { run = await checked(client.from('agent_runs').select('status,error').eq('id', acc.runId).single()); if (run.status !== 'running') break; if (Date.now() - t0 > 5 * 60_000) throw new Error('timeout'); await sleep(500); }
    const task = (await checked(client.from('agent_task_states').select('state').eq('run_id', acc.runId).maybeSingle()))?.state;
    const calls = await checked(client.from('agent_tool_calls').select('tool_name,status,arguments,output').eq('run_id', acc.runId).order('created_at'));
    const reply = (await checked(client.from('agent_messages').select('content').eq('thread_id', acc.threadId).eq('role', 'assistant').contains('ui', { requestId: acc.runId })))[0]?.content || '';
    const metrics = await checked(admin.from('agent_model_metrics').select('stage,model,duration_ms').eq('run_id', acc.runId).order('created_at'));
    const after = await gear();
    Object.assign(r, { task, sec: +((Date.now() - t0) / 1000).toFixed(1), run: run.status, err: run.error, mode: task?.decision?.mode, ops: task?.decision?.operations,
      outcome: task?.outcome?.status, pending: task?.outcome?.pendingQuestion, calls: calls.map(c => c.tool_name + (c.output?.existing ? '(existing)' : '') + (c.status !== 'completed' ? `:${c.status}` : '')),
      added: after.filter(x => !before.some(b => b.id === x.id)), linksAdded: (await setLinks()).length - linksBefore.length, reply,
      stages: metrics.map(m => `${m.stage}${m.stage === 'execution' ? '[' + m.model + ']' : ''}:${(m.duration_ms / 1000).toFixed(1)}s`) });
    assert.equal(run.status, 'completed', run.error || 'run not completed');
    await verify(r);
    r.passed = true;
  } catch (e) { r.passed = false; r.failure = e.message; }
  results.push(r);
  console.log(`${r.passed ? 'PASS' : 'FAIL'} ${id} ${r.sec}s | ${r.outcome} | added=${JSON.stringify((r.added || []).map(a => [a.name, a.qty, a.weight, a.price]))} | ${r.stages?.join(' ')}${r.failure ? '\n     -> ' + r.failure : ''}\n     reply: ${(r.reply || '').replace(/\n/g, ' ').slice(0, 160)}`);
  return r;
}
const names = r => r.added.map(a => a.name);
const done = r => { assert.equal(r.outcome, 'completed', 'outcome ' + r.outcome); assert.equal(r.pending ?? null, null, 'asked: ' + r.pending); };
const has = (r, re, check) => { const item = r.added.find(a => re.test(a.name)); assert.ok(item, `missing ${re} in ${names(r)}`); check?.(item); return item; };
const noGearWrites = r => { assert.equal(r.added.length, 0, 'added ' + names(r)); assert.ok(!r.calls.includes('add_gear'), 'called add_gear'); };

await (async () => {
  const email = `gear-eval-${randomUUID()}@example.test`, password = randomUUID();
  userId = (await checked(admin.auth.admin.createUser({ email, password, email_confirm: true }))).user.id;
  try {
    await checked(client.auth.signInWithPassword({ email, password }));
    const thread = {};
    await turn(thread, 'prefill-three', '添加装备：黑钻头灯、2L水袋、萨洛蒙登山鞋', r => { done(r); assert.equal(r.added.length, 3); has(r, /头灯/); has(r, /水袋/); has(r, /登山鞋/); });
    await turn(thread, 'same-thread-followup', '再加一个水壶', r => { done(r); assert.equal(r.added.length, 1); has(r, /水壶/); });
    await turn({}, 'details', '添加装备：MSR Hubba 帐篷 1.3kg 2800元，羽绒睡袋，登山杖两根', r => {
      done(r); assert.equal(r.added.length, 3);
      has(r, /Hubba/, i => { assert.equal(+i.weight, 1.3); assert.equal(+i.price, 2800); });
      has(r, /登山杖/, i => assert.equal(i.qty, 2));
    });
    await turn({}, 'lazy-no-gear-word', '帮我加一下始祖鸟冲锋衣、火枫炉头、防晒袖套', r => { done(r); assert.equal(r.added.length, 3); });
    await turn({}, 'single-item', '加个头盔', r => { done(r); assert.equal(r.added.length, 1); has(r, /头盔/); });
    await turn({}, 'newline-list', '添加装备\n防潮垫\n充气枕\n营地灯', r => { done(r); assert.equal(r.added.length, 3); });
    await turn({}, 'grams', '添加装备：鹅绒睡袋 850g，羽绒马甲 320克', r => {
      done(r); has(r, /睡袋/, i => assert.equal(+i.weight, 0.85)); has(r, /马甲/, i => assert.equal(+i.weight, 0.32));
    });
    await turn({}, 'chinese-quantities', '加三个气罐、两双羊毛袜', r => {
      done(r); has(r, /气罐/, i => assert.equal(i.qty, 3)); has(r, /羊毛袜/, i => assert.equal(i.qty, 2));
    });
    await turn({}, 'english', 'add a water filter and a sit pad to my gear', r => { done(r); assert.equal(r.added.length, 2); });
    await turn({}, 'brand-model-kept', '添加装备：Osprey Exos 58 背包', r => { done(r); has(r, /Osprey Exos 58/i); });
    await turn({}, 'conversational', '我新买了个 Garmin inReach 和一个急救包，记一下', r => { done(r); assert.equal(r.added.length, 2); has(r, /inReach/i); has(r, /急救包/); });
    await turn({}, 'long-list-8', '添加装备：头巾、手套、雪套、太阳镜、防晒霜、护膝、哨子、保温杯', r => { done(r); assert.equal(r.added.length, 8); });
    await turn({}, 'partial-duplicate', '添加装备：黑钻头灯、冰爪', r => { done(r); assert.deepEqual(names(r).length, 1); has(r, /冰爪/); });
    await turn({}, 'all-duplicate', '添加装备：MSR Hubba 帐篷、羽绒睡袋', r => { done(r); assert.equal(r.added.length, 0); assert.match(r.reply, /已在|已经有|已存在|已有/); });
    await turn({}, 'duplicate-case-space', '添加装备：msr hubba帐篷', r => { done(r); assert.equal(r.added.length, 0); });
    await turn({}, 'question-not-write', '我的装备里有头灯吗？', noGearWrites);
    await turn({}, 'recommendation-not-write', '冬天爬雪山需要什么装备？', noGearWrites);
    // A gear set request must stay a gear set, not turn into library adds.
    await checked(admin.from('gear_sets').insert({ user_id: userId, name: '周末露营' }));
    await turn({}, 'gear-set-still-routes', '给周末露营清单加上帐篷和睡袋', r => { assert.ok(r.calls.includes('add_gear_set_items'), 'no add_gear_set_items: ' + r.calls); assert.ok(!r.calls.includes('add_gear'), 'used add_gear'); });
    // With a trip open, a bare "add" is ambiguous between library and trip list.
    const journeyId = `gear-eval-${randomUUID()}`;
    await checked(admin.from('journeys').insert({ id: journeyId, user_id: userId, name: '武功山两日', region: '萍乡', lng: 114.2, lat: 27.5, tone: 'forest', planned_date: '2026-11-08', total_days: 2, days: '2 天' }));
    await turn({ journeyId }, 'journey-open-ambiguous', '添加头灯', r => { assert.ok(!r.calls.includes('add_gear'), 'wrote library without asking'); });
    console.log('final gear', (await gear()).length);
  } finally {
    await admin.auth.admin.deleteUser(userId);
    const passed = results.filter(r => r.passed).length;
    const secs = results.map(r => r.sec).filter(Boolean).sort((a, b) => a - b);
    console.log(`\n${passed}/${results.length} passed; median ${secs[Math.floor(secs.length / 2)]}s, max ${secs.at(-1)}s; deleted user`);
    if (reportPath) writeFileSync(reportPath, JSON.stringify(results, null, 1));
    if (passed !== results.length) process.exitCode = 1;
  }
})().catch(e => { console.error(e); process.exit(1); });
