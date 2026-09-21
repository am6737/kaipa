// One realistic planning turn against the deployed self-hosted stack, with the
// full stage artifacts dumped before cleanup. Used to inspect what the plan
// stage actually produced, not only whether the run reported success.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { setTimeout as sleep } from 'node:timers/promises';
import { createClient } from '@supabase/supabase-js';

process.loadEnvFile(process.env.KAIPA_RUNTIME_ENV || '../kaipa-supabase-docker/.env');
const base = `http://127.0.0.1:${process.env.KONG_HTTP_PORT || '8010'}`;
const admin = createClient(base, process.env.SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const client = createClient(base, process.env.ANON_KEY, { auth: { persistSession: false } });
const checked = async (request) => { const { data, error } = await request; if (error) throw error; return data; };
const message = process.argv[2] || '帮我规划一个明天的漓江一日徒步，日期就按明天算。包含当天行程安排，不需要装备清单。';
const reportPath = process.argv[3] || '/tmp/kaipa-plan-probe.json';
let userId;

try {
  const email = `probe-${randomUUID()}@example.test`, password = randomUUID();
  userId = (await checked(admin.auth.admin.createUser({ email, password, email_confirm: true }))).user.id;
  await checked(client.auth.signInWithPassword({ email, password }));
  const started = Date.now();
  const accepted = await checked(client.functions.invoke('app-agent', {
    body: { action: 'turn', threadId: null, clientRunId: randomUUID(), message, locale: 'zh', clientLocalDate: '2026-09-22', clientTimeZone: 'Asia/Shanghai' },
  }));
  const runId = accepted.runId;
  console.log(JSON.stringify({ event: 'started', runId }));
  let run;
  for (;;) {
    run = await checked(client.from('agent_runs').select('status,error,final_output').eq('id', runId).single());
    if (run.status !== 'running') break;
    assert.ok(Date.now() - started < 20 * 60_000, 'probe deadline exceeded');
    await sleep(3000);
  }
  const stages = await checked(client.from('agent_stages').select('stage,status,attempt,artifact,error').eq('run_id', runId).order('created_at'));
  const calls = await checked(client.from('agent_tool_calls').select('tool_name,status,error,arguments,output').eq('run_id', runId).order('created_at'));
  const journeys = await checked(client.from('journeys').select('id,name,total_days,planned_date').eq('user_id', userId));
  const rows = journeys.length ? await checked(client.from('timeline_rows').select('day,title,time_mins,sort_order').eq('journey_id', journeys[0].id).order('sort_order')) : [];
  const groups = journeys.length ? await checked(client.from('timeline_groups').select('name,route_end_meters,route_location_name').eq('journey_id', journeys[0].id).eq('deleted', false)) : [];
  const metrics = await checked(client.from('agent_model_metrics').select('stage,duration_ms,success').eq('run_id', runId));
  const task = await checked(client.from('agent_task_states').select('state').eq('run_id', runId).maybeSingle());
  const plan = stages.find(stage => stage.stage === 'plan')?.artifact;
  const report = {
    message, elapsedSeconds: Math.round((Date.now() - started) / 1000), status: run.status, error: run.error,
    decision: task?.state?.decision ? { domain: task.state.decision.domain, days: task.state.decision.days, derivedDays: task.state.decision.derivedDays, fullHikingPlan: task.state.decision.fullHikingPlan, packingMode: task.state.decision.packingMode, mode: task.state.decision.mode, operations: task.state.decision.operations } : null,
    stages: stages.map(stage => ({ stage: stage.stage, status: stage.status, attempt: stage.attempt, error: stage.error,
      items: stage.stage === 'plan' ? (stage.artifact?.itineraryItems || []).length : undefined,
      blocker: stage.stage === 'plan' ? stage.artifact?.blocker : undefined,
      pending: stage.stage === 'plan' ? stage.artifact?.pendingQuestion : undefined,
      unverified: stage.stage === 'plan' ? stage.artifact?.unverified : undefined })),
    plan: plan ? { journey: plan.journey, days: [...new Set((plan.itineraryItems || []).map(item => item.day))], items: plan.itineraryItems, endpoints: plan.endpoints, assumptions: plan.assumptions } : null,
    research: stages.find(stage => stage.stage === 'research')?.artifact,
    reply: run.final_output,
    counts: { journeys: journeys.length, rows: rows.length, groups: groups.length, modelCalls: metrics.length },
    rows, groups, metrics,
    calls: calls.map(call => ({ tool: call.tool_name, status: call.status, error: call.error, url: call.arguments?.url, query: call.arguments?.query })),
  };
  await writeFile(reportPath, JSON.stringify(report, null, 2), { mode: 0o600 });
  console.log(JSON.stringify({ event: 'result', reportPath, elapsedSeconds: report.elapsedSeconds, status: report.status,
    stages: report.stages, counts: report.counts, days: report.plan?.days, journey: report.plan?.journey, blocker: report.plan?.blocker, pending: report.plan?.pending }, null, 2));
} finally {
  if (userId) {
    await checked(admin.from('journeys').delete().eq('user_id', userId));
    await checked(admin.auth.admin.deleteUser(userId));
    console.log('Probe account removed.');
  }
}
