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
  const before = await gear(); const linksBefore = await setLinks(); let t0 = Date.now();
  const r = { id, message };
  try {
    const body = { action: 'turn', threadId: conv.threadId, currentJourneyId: conv.journeyId, clientRunId: randomUUID(), message, locale: 'zh', clientLocalDate: '2026-10-27', clientTimeZone: 'Asia/Shanghai' };
    // Rule-handled turns finish in about two seconds, so the suite outruns the
    // per-user AI rate limit (6 a minute); wait it out instead of failing.
    let accepted;
    while (true) {
      accepted = await client.functions.invoke('app-agent', { body });
      if (accepted.error?.context?.status !== 429) break;
      const wait = Number(accepted.error.context.headers.get('retry-after')) || 10;
      await sleep(wait * 1000);
      t0 = Date.now();
    }
    if (accepted.error) throw accepted.error;
    const acc = accepted.data;
    conv.threadId = acc.threadId;
    let run;
    while (true) { run = await checked(client.from('agent_runs').select('status,error').eq('id', acc.runId).single()); if (run.status !== 'running') break; if (Date.now() - t0 > 5 * 60_000) throw new Error('timeout'); await sleep(500); }
    const task = (await checked(client.from('agent_task_states').select('state').eq('run_id', acc.runId).maybeSingle()))?.state;
    const calls = await checked(client.from('agent_tool_calls').select('tool_name,status,arguments,output,error').eq('run_id', acc.runId).order('created_at'));
    const reply = (await checked(client.from('agent_messages').select('content').eq('thread_id', acc.threadId).eq('role', 'assistant').contains('ui', { requestId: acc.runId })))[0]?.content || '';
    const metrics = await checked(admin.from('agent_model_metrics').select('stage,model,duration_ms').eq('run_id', acc.runId).order('created_at'));
    const after = await gear();
    Object.assign(r, { task, sec: +((Date.now() - t0) / 1000).toFixed(1), run: run.status, err: run.error, mode: task?.decision?.mode, ops: task?.decision?.operations,
      outcome: task?.outcome?.status, pending: task?.outcome?.pendingQuestion, calls: calls.map(c => c.tool_name + (c.output?.existing ? '(existing)' : '') + (c.status !== 'completed' ? `:${c.status}(${String(c.error || '').slice(0, 200)})` : '')),
      added: after.filter(x => !before.some(b => b.id === x.id)), linksAdded: (await setLinks()).length - linksBefore.length, reply,
      path: task?.routing?.source === 'rules' ? 'rules' : 'model', stages: metrics.map(m => `${m.stage}${m.stage === 'execution' ? '[' + m.model + ']' : ''}:${(m.duration_ms / 1000).toFixed(1)}s`) });
    assert.equal(run.status, 'completed', run.error || 'run not completed');
    await verify(r);
    r.passed = true;
  } catch (e) { r.passed = false; r.failure = e.message; }
  results.push(r);
  console.log(`${r.passed ? 'PASS' : 'FAIL'} ${id} ${r.sec}s | ${r.path} ${r.outcome} | added=${JSON.stringify((r.added || []).map(a => [a.name, a.qty, a.weight, a.price]))} | ${r.stages?.join(' ')}${r.failure ? '\n     -> ' + r.failure : ''}\n     reply: ${(r.reply || '').replace(/\n/g, ' ').slice(0, 160)}`);
  return r;
}
const names = r => r.added.map(a => a.name);
const done = r => { assert.equal(r.outcome, 'completed', 'outcome ' + r.outcome); assert.equal(r.pending ?? null, null, 'asked: ' + r.pending); };
const has = (r, re, check) => { const item = r.added.find(a => re.test(a.name)); assert.ok(item, `missing ${re} in ${names(r)}`); check?.(item); return item; };
const noGearWrites = r => { assert.equal(r.added.length, 0, 'added ' + names(r)); assert.ok(!r.calls.includes('add_gear'), 'called add_gear'); };
// Which path took the turn: plain adds must stay on the rules, anything the
// grammar should abstain on must reach the model.
const rules = r => assert.equal(r.path, 'rules', 'expected the rule path');
const model = r => assert.equal(r.path, 'model', 'expected the model path');
const categoryNames = async () => new Map((await checked(client.from('gear_categories').select('id,name').eq('user_id', userId))).map(c => [c.id, c.name]));

await (async () => {
  const email = `gear-eval-${randomUUID()}@example.test`, password = randomUUID();
  userId = (await checked(admin.auth.admin.createUser({ email, password, email_confirm: true }))).user.id;
  try {
    await checked(client.auth.signInWithPassword({ email, password }));
    const thread = {};
    await turn(thread, 'prefill-three', '添加装备：黑钻头灯、2L水袋、萨洛蒙登山鞋', r => { done(r); rules(r); assert.equal(r.added.length, 3); has(r, /头灯/); has(r, /水袋/); has(r, /登山鞋/); });
    await turn(thread, 'same-thread-followup', '再加一个水壶', r => { done(r); rules(r); assert.equal(r.added.length, 1); has(r, /水壶/); });
    await turn(thread, 'same-thread-duplicate', '再加一个黑钻头灯', r => { done(r); rules(r); assert.equal(r.added.length, 0); assert.match(r.reply, /已在装备库/); });
    // Rule turns still land in the session, so the model can recall them.
    await turn(thread, 'session-recall', '我刚才加了哪些装备？', r => { model(r); noGearWrites(r); assert.match(r.reply, /头灯/); assert.match(r.reply, /水壶/); });
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
    await turn({}, 'categories-assigned', '添加装备：Big Agnes 睡垫、Zpacks 天幕、Hyperlite 背包、Jetboil 炉具、佳明手表、急救毯、抓绒衣', async r => {
      done(r); rules(r); assert.equal(r.added.length, 7);
      const cats = await categoryNames();
      const expected = [[/睡垫/, '睡眠系统'], [/天幕/, '庇护系统'], [/背包/, '背负系统'], [/炉具/, '饮食系统'], [/手表/, '电子导航'], [/急救毯/, '安全急救'], [/抓绒/, '服饰系统']];
      for (const [re, cat] of expected) has(r, re, i => assert.equal(cats.get(i.cat_id), cat, `${i.name} in ${cats.get(i.cat_id)}`));
    });
    await turn({}, 'fullwidth-punctuation', '添加装备：头带；雨衣，徒步鞋。', r => { done(r); rules(r); assert.deepEqual(names(r).sort(), ['头带', '徒步鞋', '雨衣'].sort()); });
    await turn({}, 'ascii-commas', '添加装备: headlamp, water bladder, trekking poles', r => { done(r); rules(r); assert.equal(r.added.length, 3); has(r, /^water bladder$/i); });
    await turn({}, 'suffix-form', '把冰镐和安全带都加到装备库', r => { done(r); rules(r); assert.equal(r.added.length, 2); has(r, /冰镐/); has(r, /安全带/); });
    await turn({}, 'multiplier-and-yuan-sign', '添加到装备库：钛杯 ×2，折叠碗 ¥39', r => {
      done(r); rules(r); has(r, /钛杯/, i => assert.equal(i.qty, 2)); has(r, /折叠碗/, i => assert.equal(+i.price, 39));
    });
    await turn({}, 'jin', '添加装备：双人帐 3斤', r => { done(r); rules(r); has(r, /双人帐/, i => assert.equal(+i.weight, 1.5)); });
    // The library stores whole yuan.
    await turn({}, 'decimal-price', '添加装备：软壳裤 299.5元', r => { done(r); rules(r); has(r, /软壳裤/, i => assert.equal(+i.price, 300)); });
    await turn({}, 'english-numbers', 'add 2 tent stakes and a stove to my gear', r => { done(r); rules(r); assert.equal(r.added.length, 2); has(r, /tent stakes/i, i => assert.equal(i.qty, 2)); });
    await turn({}, 'english-log', 'log a bear canister, a trowel to my inventory', r => { done(r); rules(r); assert.equal(r.added.length, 2); });
    await turn({}, 'polite-prefix', '麻烦帮我录入装备：护目镜、绑腿', r => { done(r); rules(r); assert.equal(r.added.length, 2); });
    const twenty = ['帽子', '围巾', '雨裤', '雨伞', '指南针', '打火机', '净水片', '能量胶', '创可贴', '绷带', '头灯电池', '充电宝', '对讲机', '坐垫', '垃圾袋', '防水袋', '收纳袋', '登山绳', '冰锥', '求生毯'];
    await turn({}, 'long-list-20', `添加装备：${twenty.join('、')}`, r => { done(r); rules(r); assert.equal(r.added.length, 20); });
    // A renamed default category still receives its kind of gear.
    await checked(admin.from('gear_categories').update({ name: '睡眠' }).eq('user_id', userId).eq('name', '睡眠系统'));
    await turn({}, 'renamed-category', '添加装备：充气睡垫', async r => { done(r); rules(r); const item = has(r, /充气睡垫/); assert.equal((await categoryNames()).get(item.cat_id), '睡眠'); });
    // Phrasings the grammar abstains on: the model still has to get them right.
    await turn({}, 'attribute-in-list', '录入装备：信封睡袋，舒适温度零下10度', r => { done(r); model(r); assert.equal(r.added.length, 1, 'added ' + names(r)); has(r, /睡袋/); });
    await turn({}, 'ambiguous-kuai', '添加装备：速干毛巾3块', r => { done(r); model(r); assert.equal(r.added.length, 1); has(r, /毛巾/); });
    await turn({}, 'space-separated', '添加装备 速干衣 速干裤', r => { done(r); model(r); assert.equal(r.added.length, 2, 'added ' + names(r)); });
    await turn({}, 'unknown-gear-no-gear-word', '加两个Nalgene', r => { model(r); assert.equal(r.added.length, 1, 'added ' + names(r)); has(r, /Nalgene/i, i => assert.equal(i.qty, 2)); });
    await turn({}, 'negation', '不用添加头灯了', r => { model(r); noGearWrites(r); });
    await turn({}, 'not-gear-code', '添加一个 Python 函数', r => { model(r); noGearWrites(r); });
    await turn({}, 'not-gear-friends', '添加两个好友', r => { model(r); noGearWrites(r); });
    await turn({}, 'question-not-write', '我的装备里有头灯吗？', r => { model(r); noGearWrites(r); });
    await turn({}, 'recommendation-not-write', '冬天爬雪山需要什么装备？', r => { model(r); noGearWrites(r); });
    // A gear set request must stay a gear set, not turn into library adds.
    await checked(admin.from('gear_sets').insert({ user_id: userId, name: '周末露营' }));
    await turn({}, 'gear-set-still-routes', '给周末露营清单加上帐篷和睡袋', r => { model(r); assert.ok(r.calls.includes('add_gear_set_items'), 'no add_gear_set_items: ' + r.calls); assert.ok(!r.calls.includes('add_gear'), 'used add_gear'); });
    // With a trip open, a bare "add" is ambiguous between library and trip list.
    const journeyId = `gear-eval-${randomUUID()}`;
    await checked(admin.from('journeys').insert({ id: journeyId, user_id: userId, name: '武功山两日', region: '萍乡', lng: 114.2, lat: 27.5, tone: 'forest', planned_date: '2026-11-08', total_days: 2, days: '2 天' }));
    await turn({}, 'english-list-target', 'add a tent to my weekend camping list', r => { model(r); assert.ok(!r.calls.includes('add_gear'), 'used add_gear'); });
    await turn({ journeyId }, 'journey-open-ambiguous', '添加头灯', r => { model(r); assert.ok(!r.calls.includes('add_gear'), 'wrote library without asking'); });
    // Edits of existing gear run last because the model may really apply them.
    await turn({}, 'edit-not-add', '把头灯的重量改成 80g', r => { model(r); assert.ok(!r.calls.includes('add_gear'), 'used add_gear'); assert.equal(r.added.length, 0); });
    await turn({}, 'delete-not-add', '把装备库里的水壶删掉', r => { model(r); assert.ok(!r.calls.includes('add_gear'), 'used add_gear'); assert.equal(r.added.length, 0); });
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
