import { createClient } from 'npm:@supabase/supabase-js@2.108.1';
import { createAgentRuntime } from './agent.ts';
import { bindRunClient, releaseRunClient, setItineraryGroupEndpoints } from './tools.ts';
import { prepareAgentContext, readJourneySections } from './context.ts';
import { constrainTaskDecision, taskDecisionSchema, taskOutcome, type TaskState } from './task.ts';
import { SupabaseAgentSession } from './session.ts';
import { buildAgentTrackData, computeTrackStats, parseTrackBytes, snapTrackWaypoints } from './track.ts';
import { endpointAtDistance, trackLengthMeters } from './route-endpoints.ts';
import type { AgentContext } from './types.ts';

function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }
async function checked<T extends { data: unknown; error: unknown }>(request: PromiseLike<T>): Promise<NonNullable<T['data']>> {
  const result = await request;
  if (result.error) throw result.error;
  return result.data as NonNullable<T['data']>;
}
const sourceId = Deno.args[0];
const writeOnly = Deno.args.includes('--write-only');
assert(sourceId, 'Supply the existing source journey ID; it is only read');
const base = `http://127.0.0.1:${Deno.env.get('KONG_HTTP_PORT') || '8010'}`;
const admin = createClient(base, Deno.env.get('SERVICE_ROLE_KEY')!, { auth: { persistSession: false, autoRefreshToken: false } });
const client = createClient(base, Deno.env.get('ANON_KEY')!, { auth: { persistSession: false, autoRefreshToken: false } });
const config = {
  apiKey: Deno.env.get('KAIPA_AI_API_KEY') || Deno.env.get('OPENROUTER_API_KEY') || '',
  baseUrl: Deno.env.get('KAIPA_AI_BASE_URL') || 'https://ai.dootask.com/v1',
  model: Deno.env.get('KAIPA_AI_MODEL') || '',
};
assert(config.apiKey && config.model, 'Supply the deployed model configuration via environment');
const journeyId = `hatian-five-day-${crypto.randomUUID()}`;
const runId = crypto.randomUUID();
let userId: string | undefined;
const started = Date.now();
try {
  const source = await checked(admin.from('journeys').select('name,region,lng,lat,coord,tracks ( file_name, file_url )').eq('id', sourceId).single());
  const sourceTrack = source.tracks!;
  assert(sourceTrack?.file_url, 'Source journey has no bound track');
  const path = new URL(sourceTrack.file_url).pathname;
  const prefix = '/storage/v1/object/public/kaipa/';
  assert(path.startsWith(prefix), 'Source track must be in workspace storage');
  const file = await checked(admin.storage.from('kaipa').download(decodeURIComponent(path.slice(prefix.length))));
  assert(file.size <= 15 * 1024 * 1024, 'Source track exceeds attachment limit');
  const parsed = await parseTrackBytes(new Uint8Array(await file.arrayBuffer()), sourceTrack.file_name);
  const stats = computeTrackStats(parsed.points)!;
  assert(stats, 'Source track must parse');
  const track = buildAgentTrackData(stats);
  const waypoints = snapTrackWaypoints(parsed.waypoints, stats)!;
  assert(Math.abs(trackLengthMeters(track.trackCoords) - stats.distM) < 0.01, 'Imported geometry changed the track length');
  assert(waypoints.some(point => point.name.includes('陈家窝子')), 'Original camps were lost');
  const password = crypto.randomUUID();
  const email = `hatian-five-day-${crypto.randomUUID()}@example.test`;
  userId = (await checked(admin.auth.admin.createUser({ email, password, email_confirm: true }))).user!.id;
  await checked(client.auth.signInWithPassword({ email, password }));
  // The copy owns its own library row so the source track stays untouched.
  const trackId = (await checked(client.from('tracks').insert({ user_id: userId, name: source.name,
    file_name: sourceTrack.file_name, file_format: /\.(gpx|kml|kmz)$/i.exec(sourceTrack.file_name || '')?.[1].toLocaleLowerCase() || 'gpx',
    file_url: sourceTrack.file_url, coords: track.trackCoords, elevation: track.trackElevation,
    duration_ms: track.trackDurationMs, waypoints, dist_m: Math.round(stats.distM),
    asc_m: stats.hasEle ? stats.ascent : null, point_count: stats.points.length }).select('id').single())).id;
  await checked(client.from('journeys').insert({ id: journeyId, user_id: userId, name: source.name, tone: 'forest',
    region: source.region, lng: source.lng, lat: source.lat, coord: source.coord, total_days: 5, days: '5 天',
    planned_date: '2026-10-10', date: '2026-10-10', dist: track.dist, asc_: track.asc, track_id: trackId }));
  const thread = await checked(client.from('agent_threads').insert({ user_id: userId, current_journey_id: journeyId, title: '五日规划隔离验证' }).select('id').single());
  await checked(client.from('agent_runs').insert({ id: runId, thread_id: thread.id, user_id: userId, status: 'running', agent_version: 'hatian-five-day-local-test' }));
  const message = '请按当前绑定的哈天线轨迹，帮我规划并保存五天重装帐篷露营行程，写清每天走多少公里、在哪里扎营和补水，并标在地图上。保留五天目标，无法合理安排时明确告诉我；装备和往返交通不用安排。';
  const first = createAgentRuntime(config, true);
  const decision = writeOnly ? taskDecisionSchema.parse({ objective: 'Isolated endpoint write test', mode: 'execute', continuation: false,
    authorizationQuote: message, operations: ['set_itinerary_group_endpoints'], requiredOperations: ['set_itinerary_group_endpoints'],
    destination: '哈天线', plannedDate: '2026-10-10', dateUndecided: false, days: 5, trackAttachmentName: null, packingMode: 'none', constraints: [] })
    : constrainTaskDecision(await first.interpret({ latestMessage: message, currentJourneyId: journeyId, availableAttachments: [],
    temporalContext: '2026-09-09 UTC', previousTask: null, recentMessages: [] }), message, null, journeyId);
  assert(decision.mode === 'execute' && decision.packingMode === 'none', 'Task scope was misinterpreted');
  const task: TaskState = { runId, journeyId, decision, outcome: null };
  const context: AgentContext = { userId, threadId: thread.id, runId, currentJourneyId: journeyId, task, originalUserMessage: message };
  bindRunClient(runId, client);
  const data = await prepareAgentContext(client, context);
  if (writeOnly) {
    await checked(client.from('timeline_groups').insert(Array.from({ length: 5 }, (_, index) => ({ journey_id: journeyId, user_id: userId,
      name: `Day ${index + 1}`, sort_order: index, deleted: false }))));
    // Controlled evidence tests persistence only; it does not certify this as an outdoor itinerary.
    const sourceUrl = 'https://guides.example.com/controlled-fixture';
    const campQuote = 'Fixture: overnight stay at the named Chenjiawozi camp.';
    await checked(client.from('agent_tool_calls').insert({ run_id: runId, thread_id: thread.id, user_id: userId, tool_name: 'read_travel_guide',
      arguments: { url: sourceUrl }, arguments_hash: crypto.randomUUID(), status: 'completed', output: { url: sourceUrl, available: true, text: campQuote } }));
    await readJourneySections(client, context, journeyId, ['journey', 'track', 'itinerary']);
    const camp = waypoints.find(point => point.name.includes('陈家窝子'))!;
    const firstCamp = waypoints.find(point => point.name === '第一天营地')!;
    await setItineraryGroupEndpoints.invoke({ context } as never, JSON.stringify({ journeyId, endpoints: [
      { day: 'Day 1', endDistanceKm: firstCamp.km, locationName: firstCamp.name },
      { day: 'Day 2', endDistanceKm: camp.km, locationName: camp.name, overnightReview: { sourceUrl, campQuote,
        waterStatus: 'unknown', waterQuote: '', waterPlan: 'Controlled test: carry water; no current supply is asserted.',
        effortAssessment: 'Controlled persistence test only; this does not approve daily hiking feasibility.' } },
      { day: 'Day 5', endDistanceKm: stats.distM / 1000 },
    ] }));
    const saved = await checked(client.from('timeline_groups').select('name,route_end_meters,route_end_lng,route_end_lat,route_location_name').eq('journey_id', journeyId).not('route_end_meters', 'is', null).order('sort_order'));
    assert(saved.length === 3, 'Grounded endpoints did not commit');
    assert(saved[0].route_location_name?.includes('扎营条件待核实') && Math.abs(saved[0].route_end_meters / 1000 - firstCamp.km) < 1e-7, 'First-night candidate without guide proof was not saved with uncertainty');
    for (const group of saved) {
      const expected = endpointAtDistance(track.trackCoords, Number(group.route_end_meters));
      assert(Math.abs(group.route_end_lng - expected.coordinate[0]) < 1e-7 && Math.abs(group.route_end_lat - expected.coordinate[1]) < 1e-7, 'Committed map marker drifted');
    }
    assert(Math.abs(saved[2].route_end_meters - stats.distM) < 0.01, 'Track finish was truncated');
    await checked(client.from('journeys').update({ dist: '90 km' }).eq('id', journeyId));
    await readJourneySections(client, context, journeyId, ['journey', 'track', 'itinerary']);
    await setItineraryGroupEndpoints.invoke({ context } as never, JSON.stringify({ journeyId, endpoints: [{ day: 'Day 5', endDistanceKm: stats.distM / 1000 - 0.00001 }] }));
    const failed = await checked(client.from('agent_tool_calls').select('error').eq('run_id', runId).eq('tool_name', 'set_itinerary_group_endpoints').eq('status', 'failed'));
    assert(failed.some(call => call.error?.includes('原始轨迹')), 'Legacy geometry mismatch was not rejected by the real write tool');
    console.log(JSON.stringify({ event: 'write-path-validated', firstCampWithoutGuideKm: saved[0].route_end_meters / 1000, candidateLabelSaved: true, namedCampKm: camp.km, actualFinishKm: saved[2].route_end_meters / 1000,
      correctMapPositions: true, legacyMismatchRejected: true, outdoorPlanApproved: false }));
  } else {
  const runtime = createAgentRuntime(config, true, task);
  const session = new SupabaseAgentSession(client, thread.id, userId);
  console.log(JSON.stringify({ event: 'started', geometryKm: stats.distM / 1000, points: track.trackCoords.length, namedWaypoints: waypoints.length, targetDays: 5 }));
  const result = await runtime.runner.run(runtime.agent, `${data}\n本轮任务状态：${JSON.stringify(task)}\n用户消息：${message}`, {
    context, session, maxTurns: 20, signal: AbortSignal.timeout(210000),
  });
  const output = result.finalOutput!;
  assert(output, 'No structured planning result');
  const calls = await checked(client.from('agent_tool_calls').select('tool_name,status,arguments,output,error').eq('run_id', runId).order('created_at'));
  const groups = await checked(client.from('timeline_groups').select('name,route_end_meters,route_end_lng,route_end_lat,route_location_name').eq('journey_id', journeyId).eq('deleted', false).order('sort_order'));
  const rows = await checked(client.from('timeline_rows').select('day,title,time_mins,time_end_mins').eq('journey_id', journeyId).order('sort_order'));
  const journey = await checked(client.from('journeys').select('total_days,planned_date').eq('id', journeyId).single());
  const outcome = taskOutcome(task, output, calls.map(call => ({ toolName: call.tool_name, status: call.status, output: call.output })));
  const boundaries = groups.filter(group => group.route_end_meters != null);
  const report = { elapsedSeconds: Math.round((Date.now() - started) / 1000), model: config.model, decision, outcome, output, journey, rows, groups,
    calls: calls.map(call => ({ tool: call.tool_name, status: call.status, error: call.error,
      args: ['set_itinerary_group_endpoints', 'read_travel_guide'].includes(call.tool_name) ? call.arguments : undefined,
      available: call.output?.available, textLength: call.output?.text?.length })) };
  await Deno.writeTextFile('/tmp/kaipa-hatian-five-day-local.json', JSON.stringify(report, null, 2), { mode: 0o600 });
  assert(journey.total_days === 5 && journey.planned_date === '2026-10-10', 'User duration/date was changed');
  assert(!/\bDay\s*[6-9]\b|第[六七八九]天/.test(output.draft?.body || ''), 'Main draft silently substituted a longer itinerary');
  assert(!calls.some(call => ['add_packing_items', 'create_journey', 'update_journey_schedule'].includes(call.tool_name)), 'Planning escaped requested scope');
  for (const boundary of boundaries) {
    const marker = endpointAtDistance(track.trackCoords, Number(boundary.route_end_meters));
    assert(Math.abs(marker.coordinate[0] - boundary.route_end_lng) < 1e-7 && Math.abs(marker.coordinate[1] - boundary.route_end_lat) < 1e-7, 'Saved map marker does not match measured GPX distance');
  }
  if (outcome.status === 'completed') {
    assert(boundaries.length === 5 && new Set(rows.map(row => row.day)).size === 5, 'A partial endpoint write was incorrectly marked complete');
    assert(Math.abs(Number(boundaries.at(-1)!.route_end_meters) - stats.distM) < 1, 'Final day does not end at the actual track end');
  } else {
    assert(output.blocker?.trim() || output.pendingQuestion?.trim(), 'Incomplete plan must explain concrete missing evidence');
  }
  console.log(JSON.stringify({ event: 'validated', outcome, output, savedBoundaries: boundaries.length, report: '/tmp/kaipa-hatian-five-day-local.json' }, null, 2));
  }
} finally {
  releaseRunClient(runId);
  if (userId) {
    await checked(admin.from('journeys').delete().eq('id', journeyId).eq('user_id', userId));
    await checked(admin.auth.admin.deleteUser(userId));
    console.log('Temporary account and journey removed. Original journey unchanged.');
  }
}
