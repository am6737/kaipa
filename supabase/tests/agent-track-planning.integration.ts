// Opt-in live-model test. Copies a supplied journey's track into a disposable account.
import { createClient } from 'npm:@supabase/supabase-js@2.108.1';
import { createAgentRuntime } from '../functions/app-agent/agent.ts';
import { prepareTask } from '../functions/app-agent/task-store.ts';
import { taskOutcome } from '../functions/app-agent/task.ts';
import { bindRunClient, releaseRunClient } from '../functions/app-agent/tools.ts';
import { prepareAgentContext } from '../functions/app-agent/context.ts';
import { endpointAtDistance, trackLengthMeters } from '../functions/app-agent/route-endpoints.ts';
import type { AgentContext } from '../functions/app-agent/types.ts';

function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }
async function checked<T extends { data: unknown; error: unknown }>(request: PromiseLike<T>): Promise<NonNullable<T['data']>> {
  const result = await request;
  if (result.error) throw result.error;
  return result.data as NonNullable<T['data']>;
}
assert(Deno.args[0], 'Pass a source journey ID; source is read only');
const url = `http://127.0.0.1:${Deno.env.get('KONG_HTTP_PORT') || '8010'}`;
const auth = { persistSession: false, autoRefreshToken: false };
const admin = createClient(url, Deno.env.get('SERVICE_ROLE_KEY')!, { auth });
const client = createClient(url, Deno.env.get('ANON_KEY')!, { auth });
const config = { apiKey: Deno.env.get('KAIPA_AI_API_KEY') || Deno.env.get('OPENROUTER_API_KEY') || '',
  baseUrl: Deno.env.get('KAIPA_AI_BASE_URL') || 'https://ai.dootask.com/v1', model: Deno.env.get('KAIPA_AI_MODEL') || '' };
assert(config.apiKey && config.model, 'Model configuration required');
const journeyId = `track-plan-test-${crypto.randomUUID()}`;
const runId = crypto.randomUUID();
let userId: string | undefined;
try {
  const source = await checked(admin.from('journeys').select('name,region,lng,lat,coord,dist,asc_,tracks ( coords, waypoints, elevation, file_name )')
    .eq('id', Deno.args[0]).single());
  const { tracks: sourceTrack, ...sourceFacts } = source;
  assert(sourceTrack?.coords?.length > 1, 'Source requires track geometry');
  const email = `track-plan-${crypto.randomUUID()}@example.test`;
  const password = crypto.randomUUID();
  userId = (await checked(admin.auth.admin.createUser({ email, password, email_confirm: true }))).user!.id;
  await checked(client.auth.signInWithPassword({ email, password }));
  // The copy follows the source: one library track, one journey pointing at it.
  const format = /\.(gpx|kml|kmz)$/i.exec(sourceTrack.file_name || '')?.[1].toLocaleLowerCase() || 'gpx';
  const trackId = (await checked(client.from('tracks').insert({ user_id: userId, name: sourceTrack.file_name || source.name,
    file_name: sourceTrack.file_name, file_format: format, coords: sourceTrack.coords, waypoints: sourceTrack.waypoints,
    elevation: sourceTrack.elevation }).select('id').single())).id;
  await checked(client.from('journeys').insert({ ...sourceFacts, id: journeyId, user_id: userId, track_id: trackId, tone: 'forest', total_days: null, planned_date: null }));
  const thread = await checked(client.from('agent_threads').insert({ user_id: userId, current_journey_id: journeyId, title: 'Track planning regression' }).select('id').single());
  await checked(client.from('agent_runs').insert({ id: runId, thread_id: thread.id, user_id: userId, status: 'running', agent_version: 'track-plan-test' }));
  const message = `请为旅程“${source.name}”规划并保存每日徒步行程。日期和天数待定，请根据绑定轨迹建议天数，不要当作我已确定。装备和往返交通不用安排。`
    + (Deno.args.includes('--track-only') ? '本次只按原轨迹的营地标注安排候选行程，不搜索攻略，扎营条件和水源如实标注待核实。' : '');
  const task = await prepareTask(client, admin, { runId, threadId: thread.id, userId, journeyId, message,
    intent: 'plan_journey', temporalContext: '2026-09-10 UTC', attachments: [] }, createAgentRuntime(config).interpret);
  assert(task.decision.days === null && task.decision.requiredOperations.includes('set_itinerary_group_endpoints'), 'Undecided-duration plan lost mandatory endpoints');
  const context: AgentContext = { runId, threadId: thread.id, userId, currentJourneyId: journeyId, originalUserMessage: message, task };
  bindRunClient(runId, client);
  const data = await prepareAgentContext(client, context);
  const runtime = createAgentRuntime(config, true, task);
  console.log(JSON.stringify({ event: 'started', required: task.decision.requiredOperations }));
  const result = await runtime.runner.run(runtime.agent, `${data}\n本轮任务状态：${JSON.stringify(task)}\n用户消息：${message}`, {
    context, maxTurns: 20, signal: AbortSignal.timeout(210000),
  });
  const output = result.finalOutput!;
  const calls = await checked(client.from('agent_tool_calls').select('tool_name,status,output,error').eq('run_id', runId).order('created_at'));
  const groups = await checked(client.from('timeline_groups').select('name,route_end_meters,route_end_lng,route_end_lat,route_location_name')
    .eq('journey_id', journeyId).eq('deleted', false).order('sort_order'));
  const rows = await checked(client.from('timeline_rows').select('day').eq('journey_id', journeyId));
  const outcome = taskOutcome(task, output, calls.map(call => ({ toolName: call.tool_name, status: call.status, output: call.output })));
  console.log(JSON.stringify({ event: 'result', outcome, output, groups, calls: calls.map(call => ({ tool: call.tool_name, status: call.status, error: call.error })) }));
  const days = new Set(rows.map(row => row.day));
  assert(days.size > 1 && [...days].every(day => groups.some(group => group.name === day && group.route_end_meters != null)), 'Saved hiking days are missing endpoints');
  let previous = 0;
  for (const group of groups) {
    assert(group.route_end_meters > previous, 'Boundaries must advance along the track');
    const marker = endpointAtDistance(sourceTrack.coords, group.route_end_meters);
    assert(Math.abs(marker.coordinate[0] - group.route_end_lng) < 1e-7 && Math.abs(marker.coordinate[1] - group.route_end_lat) < 1e-7, 'Map position mismatch');
    previous = group.route_end_meters;
  }
  assert(Math.abs(previous - trackLengthMeters(sourceTrack.coords)) < 1, 'Plan does not cover the full track');
  const journey = await checked(client.from('journeys').select('total_days,planned_date').eq('id', journeyId).single());
  assert(journey.total_days === null && journey.planned_date === null, 'Unknown duration/date silently changed');
  console.log('PASS: all saved hiking days have measured endpoints; duration remains undecided.');
} catch (error) {
  console.error(JSON.stringify({ event: 'failed', name: error instanceof Error ? error.name : 'unknown',
    message: error instanceof Error ? error.message : 'Live execution did not complete' }));
  throw error;
} finally {
  releaseRunClient(runId);
  if (userId) {
    await checked(admin.from('journeys').delete().eq('id', journeyId).eq('user_id', userId));
    await checked(admin.auth.admin.deleteUser(userId));
  }
  console.log('Temporary account and journey removed; source unchanged.');
}
