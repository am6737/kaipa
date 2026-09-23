// Live check that long-form work takes the staged pipeline and short work does
// not. Uses the deployed self-hosted worker and the configured model with a
// disposable account, and removes its data afterwards.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
import { createClient } from '@supabase/supabase-js';

process.loadEnvFile(process.env.KAIPA_RUNTIME_ENV || '../kaipa-supabase-docker/.env');
const url = `http://127.0.0.1:${process.env.KONG_HTTP_PORT || '8010'}`;
const admin = createClient(url, process.env.SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const client = createClient(url, process.env.ANON_KEY, { auth: { persistSession: false } });
const checked = async (request) => { const result = await request; if (result.error) throw result.error; return result.data; };
const deadlineMs = Number(process.env.KAIPA_E2E_DEADLINE_MS || 10 * 60_000);
let userId;
let threadId;
// Declared out here because the finally block cleans it up: the seeded fact
// outlives the disposable harness account it was created for.
let factEntryId = null;

async function turn(message, options = {}) {
  const started = Date.now();
  const accepted = await checked(client.functions.invoke('app-agent', {
    body: { action: 'turn', threadId, clientRunId: randomUUID(), message, locale: 'zh', clientLocalDate: '2026-09-08', clientTimeZone: 'Asia/Shanghai', ...options },
  }));
  assert.equal(accepted.status, 'running', 'every natural-language request uses the durable queue');
  threadId = accepted.threadId;
  for (;;) {
    const run = await checked(client.from('agent_runs').select('status,error').eq('id', accepted.runId).single());
    if (run.status !== 'running') { assert.equal(run.status, 'completed', run.error); break; }
    assert.ok(Date.now() - started < deadlineMs, `pipeline deadline exceeded for: ${message}`);
    await sleep(2000);
  }
  const state = await checked(client.from('agent_task_states').select('state').eq('run_id', accepted.runId).single());
  const calls = await checked(client.from('agent_tool_calls').select('tool_name,status').eq('run_id', accepted.runId));
  const stages = await checked(client.from('agent_stages').select('stage,status,attempt,artifact,route_facts,route_fact_stats').eq('run_id', accepted.runId).order('created_at'));
  const elapsedMs = Date.now() - started;
  console.log(JSON.stringify({ message, elapsedMs, domain: state.state.decision.domain, stages: stages.map((stage) => `${stage.stage}:${stage.status}@${stage.attempt}`) }));
  return { task: state.state, calls, stages, elapsedMs, runId: accepted.runId };
}

function stageNames(stages) {
  return [...new Set(stages.filter((stage) => stage.status === 'completed').map((stage) => stage.stage))].sort();
}

try {
  const email = `pipeline-${randomUUID()}@example.test`, password = randomUUID();
  userId = (await checked(admin.auth.admin.createUser({ email, password, email_confirm: true }))).user.id;
  await checked(client.auth.signInWithPassword({ email, password }));

  // 0. A maintained 线路资料 entry for the route step 1 plans. Without one the
  //    fact path is untestable: the library was empty for its whole first life,
  //    and a broken read is indistinguishable from an empty one, so the run has
  //    to be made to carry a fact and then checked for it end to end.
  const factRouteId = 'trk018'; // 桂林阳朔漓江精华段
  const factFields = { from: '阳朔', to: '兴坪', mode: '班车', schedule: 'e2e 冒烟：每 20 分钟一班', price_min: 20, unit: '每人' };
  try {
    const inserted = await checked(admin.from('route_fact_entries').insert({
      route_id: factRouteId, category_slug: 'access_transport', title: 'e2e 冒烟：阳朔—兴坪接驳',
      fields: factFields, source_url: 'https://example.com/e2e', status: 'confirmed', origin: 'manual',
    }).select('id').single());
    factEntryId = inserted.id;
  } catch (error) {
    console.log(`route facts: no confirmed fact could be seeded (${error.message}); the citation assertions are skipped`);
  }

  // 1. A full hiking plan is long-form work: research, plan, save and reply are
  //    separate stages, and the whole thing finishes well inside the old budget.
  const planned = await turn('帮我规划一个明天的漓江一日徒步，日期就按明天算。包含当天行程安排，不需要装备清单。');
  assert.equal(planned.task.decision.fullHikingPlan, true);
  assert.equal(planned.task.decision.mode, 'execute');
  assert.deepEqual(stageNames(planned.stages), ['interpret', 'plan', 'research', 'respond', 'save']);
  assert.ok(planned.elapsedMs < 5 * 60_000, `a one-day plan took ${planned.elapsedMs}ms`);

  // 1b. The fact seeded in step 0 has to survive the whole path: read with the
  //     service-role client, recorded on the research stage, and cited in the
  //     message the user actually receives.
  if (factEntryId) {
    const research = planned.stages.find((stage) => stage.stage === 'research');
    assert.ok(Array.isArray(research.route_facts) && research.route_facts.length > 0,
      `the loaded fact must be recorded on the research stage: ${JSON.stringify(research.route_facts)}`);
    assert.ok(research.route_facts.some((fact) => fact.entryId === factEntryId),
      'the recorded facts must include the entry this run was given');
    assert.ok(Number(research.route_fact_stats?.injected) >= 1,
      `the fact must be reported as injected, got ${JSON.stringify(research.route_fact_stats)}`);
    // Messages hang off the thread, not the run; the assistant reply for this
    // run is the newest one on it.
    const messages = await checked(client.from('agent_messages').select('ui').eq('thread_id', threadId).eq('role', 'assistant').order('created_at', { ascending: false }).limit(1));
    const sources = messages[0]?.ui?.sources || [];
    assert.ok(sources.some((source) => source.kind === 'fact' && source.factId === factEntryId),
      `the reply must cite the verified fact, got ${JSON.stringify(sources)}`);
    console.log(`Route facts: ${research.route_facts.length} recorded, ${research.route_fact_stats.injected} injected, cited in the reply.`);
  }
  const journeys = await checked(client.from('journeys').select('id,name,planned_date,total_days'));
  assert.equal(journeys.length, 1, `the plan must save exactly one journey: ${JSON.stringify(planned.stages.map((stage) => ({ stage: stage.stage, status: stage.status, artifact: stage.artifact })))}`);
  const journeyId = journeys[0].id;
  assert.equal(journeys[0].planned_date, '2026-09-09');
  const rows = await checked(client.from('timeline_rows').select('id,day,title').eq('journey_id', journeyId));
  assert.ok(rows.length > 0, 'the itinerary must be saved');

  // 2. Undo reverses the whole pipeline run, not only its last write.
  const undone = await turn('撤销刚才的规划。', { currentJourneyId: journeyId });
  assert.equal(undone.task.decision.operations.join(), 'undo_last_agent_changes');
  const rowsAfterUndo = await checked(client.from('timeline_rows').select('id').eq('journey_id', journeyId));
  assert.equal(rowsAfterUndo.length, 0, `undo must remove every saved itinerary row, ${rowsAfterUndo.length} left`);

  // 3. A single edit stays interactive: no stage rows are written for it.
  const edited = await turn('在当前旅程的 Day 1 增加一项 17:30 至 18:30 从兴坪古镇返回阳朔县城的班车。', { currentJourneyId: journeyId });
  assert.equal(edited.task.decision.mode, 'execute');
  assert.equal(edited.stages.length, 0, `a single edit must not start the pipeline: ${JSON.stringify(edited.stages)}`);
  assert.ok(edited.calls.some((call) => call.tool_name === 'add_itinerary_items' && call.status === 'completed'));
  const rowsAfterEdit = await checked(client.from('timeline_rows').select('id').eq('journey_id', journeyId));
  assert.equal(rowsAfterEdit.length, rowsAfterUndo.length + 1, 'the edit must add exactly one item');

  // 4. A transport chain is the same shape of work and takes the same pipeline.
  const transport = await turn('帮我规划从成都到阳朔的往返交通接驳方案，去程和返程都要，保存到当前旅程。', { currentJourneyId: journeyId });
  assert.equal(transport.task.decision.domain, 'transport', `transport must be classified, got ${transport.task.decision.domain}`);
  assert.ok(transport.stages.length > 0, 'a transport chain must use the pipeline');

  // 5. A full checklist is another staged deliverable: it generates, validates
  //    and commits through the packing stage rather than the interactive loop.
  const packed = await turn('给当前旅程生成一份完整的装备清单。', { currentJourneyId: journeyId });
  assert.equal(packed.task.decision.packingMode, 'full');
  assert.ok(packed.stages.some((stage) => stage.stage === 'packing' && stage.status === 'completed'), `packing must run as a stage: ${JSON.stringify(packed.stages)}`);
  const lists = await checked(client.from('journey_packing_lists').select('id').eq('journey_id', journeyId));
  const packingArtifact = packed.stages.find((stage) => stage.stage === 'packing');
  assert.ok(lists.length > 0, `the checklist must be saved: ${JSON.stringify(packingArtifact)}`);
  const packingItems = await checked(client.from('journey_packing_items').select('id').in('list_id', lists.map((list) => list.id)));
  assert.ok(packingItems.length >= 10, `a full checklist must be itemized, got ${packingItems.length}`);

  console.log('Pipeline harness: staged plan, interactive edit, undo, transport dispatch and full packing passed.');
} finally {
  // The seeded fact outlives the harness account, so it is removed by id.
  if (factEntryId) {
    await checked(admin.from('route_fact_entries').delete().eq('id', factEntryId));
    console.log('Smoke route fact removed.');
  }
  if (userId) {
    await checked(admin.from('journeys').delete().eq('user_id', userId));
    await checked(admin.auth.admin.deleteUser(userId));
    console.log('Disposable harness account and data removed.');
  }
}
