// The app-realistic variant: the journey already exists and is bound to a
// catalog route's GPX (as Discover creates it), and the user then asks for the
// plan. This is the state the reported failing runs were in.
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
const message = process.argv[2];
const reportPath = process.argv[3] || '/tmp/kaipa-route-bound-probe.json';
const routeId = process.argv[4] || 'trk008';
let userId;

try {
  const email = `routeprobe-${randomUUID()}@example.test`, password = randomUUID();
  userId = (await checked(admin.auth.admin.createUser({ email, password, email_confirm: true }))).user.id;
  await checked(client.auth.signInWithPassword({ email, password }));
  const route = await checked(admin.from('routes').select('*').eq('id', routeId).single());
  const trackId = (await checked(client.from('tracks').insert({
    user_id: userId, name: route.name, file_name: route.track_file_name || `${route.name}.kml`,
    file_format: 'kml', coords: route.track_coords, elevation: route.track_elevation,
    duration_ms: route.track_duration_ms, waypoints: route.track_waypoints,
  }).select('id').single())).id;
  const journeyId = `probe-${randomUUID()}`;
  await checked(client.from('journeys').insert({
    id: journeyId, user_id: userId, track_id: trackId, route_id: route.id, name: route.name,
    region: route.region, coord: route.coord, lng: route.lng, lat: route.lat,
    dist: route.dist, asc_: route.asc_, tone: route.tone, desc: route.desc,
  }));
  console.log(JSON.stringify({ event: 'setup', journeyId, trackId, route: route.name, waypoints: (route.track_waypoints || []).length }));
  const started = Date.now();
  const accepted = await checked(client.functions.invoke('app-agent', {
    body: { action: 'turn', clientRunId: randomUUID(), currentJourneyId: journeyId, message, locale: 'zh', clientLocalDate: '2026-09-22', clientTimeZone: 'Asia/Shanghai' },
  }));
  const runId = accepted.runId;
  let run;
  for (;;) {
    run = await checked(client.from('agent_runs').select('status,error,final_output').eq('id', runId).single());
    if (run.status !== 'running') break;
    assert.ok(Date.now() - started < 20 * 60_000, 'probe deadline exceeded');
    await sleep(3000);
  }
  const stages = await checked(client.from('agent_stages').select('stage,status,attempt,artifact,error').eq('run_id', runId).order('created_at'));
  const calls = await checked(client.from('agent_tool_calls').select('tool_name,status,error,arguments').eq('run_id', runId).order('created_at'));
  const rows = await checked(client.from('timeline_rows').select('day,title,time_mins,time_end_mins,sort_order').eq('journey_id', journeyId).order('sort_order'));
  const groups = await checked(client.from('timeline_groups').select('name,route_end_meters,route_location_name').eq('journey_id', journeyId).eq('deleted', false).order('sort_order'));
  const metrics = await checked(client.from('agent_model_metrics').select('stage,duration_ms,success').eq('run_id', runId));
  const plan = stages.find(stage => stage.stage === 'plan')?.artifact;
  const report = {
    message, routeBound: route.name, elapsedSeconds: Math.round((Date.now() - started) / 1000),
    status: run.status, error: run.error, reply: run.final_output,
    stages: stages.map(stage => ({ stage: stage.stage, status: stage.status, attempt: stage.attempt, error: stage.error,
      items: stage.stage === 'plan' ? (stage.artifact?.itineraryItems || []).length : undefined,
      blocker: stage.stage === 'plan' ? stage.artifact?.blocker : undefined })),
    plan: plan ? { journey: plan.journey, items: plan.itineraryItems, endpoints: plan.endpoints, unverified: plan.unverified, assumptions: plan.assumptions } : null,
    research: stages.find(stage => stage.stage === 'research')?.artifact,
    counts: { rows: rows.length, groups: groups.length, groupsWithEnd: groups.filter(group => group.route_end_meters != null).length },
    rows, groups, metrics,
    calls: calls.map(call => ({ tool: call.tool_name, status: call.status, error: call.error, url: call.arguments?.url, query: call.arguments?.query })),
  };
  await writeFile(reportPath, JSON.stringify(report, null, 2), { mode: 0o600 });
  console.log(JSON.stringify({ event: 'result', reportPath, elapsedSeconds: report.elapsedSeconds, status: report.status,
    stages: report.stages, counts: report.counts, journey: report.plan?.journey, days: [...new Set((report.plan?.items || []).map(item => item.day))] }, null, 2));
} finally {
  if (userId) {
    await checked(admin.from('journeys').delete().eq('user_id', userId));
    await checked(admin.auth.admin.deleteUser(userId));
    console.log('Probe account removed.');
  }
}
