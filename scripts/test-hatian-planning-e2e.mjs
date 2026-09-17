import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { setTimeout as sleep } from 'node:timers/promises';
import { createClient } from '@supabase/supabase-js';

process.loadEnvFile(process.env.KAIPA_RUNTIME_ENV || '../kaipa-supabase-docker/.env');
const base = `http://127.0.0.1:${process.env.KONG_HTTP_PORT || '8010'}`;
const admin = createClient(base, process.env.SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const client = createClient(base, process.env.ANON_KEY, { auth: { persistSession: false } });
const journeyId = `hatian-e2e-${randomUUID()}`;
const reportPath = '/tmp/kaipa-hatian-planning-e2e.json';
let userId;
let runId;
async function checked(request) { const { data, error } = await request; if (error) throw error; return data; }

try {
  const original = await checked(admin.from('journeys').select('id,region,coord,lng,lat,dist,asc_,tracks ( file_name, file_format, coords, elevation, duration_ms, waypoints )')
    .eq('id', 'j-1788932710935').eq('name', '哈天线').is('deleted_at', null).single());
  assert.ok(original.tracks?.coords?.length > 2, 'Original Hatian track is missing');
  const email = `hatian-e2e-${randomUUID()}@example.test`, password = randomUUID();
  userId = (await checked(admin.auth.admin.createUser({ email, password, email_confirm: true }))).user.id;
  await checked(client.auth.signInWithPassword({ email, password }));
  const { id: _sourceId, tracks: sourceTrack, ...track } = original;
  const trackId = (await checked(client.from('tracks').insert({ user_id: userId, name: '哈天线', file_name: sourceTrack.file_name,
    file_format: sourceTrack.file_format ?? 'gpx', coords: sourceTrack.coords, elevation: sourceTrack.elevation,
    duration_ms: sourceTrack.duration_ms, waypoints: sourceTrack.waypoints }).select('id').single())).id;
  await checked(client.from('journeys').insert({ ...track, id: journeyId, user_id: userId, track_id: trackId, name: '哈天线（隔离联调）',
    tone: 'forest', planned_date: '2026-10-10', date: '2026-10-10', days: '7 天', total_days: 7 }));
  await checked(client.from('companions').insert({ journey_id: journeyId, user_id: userId, ini: '测', name: '图文规划测试用户',
    color: '#4F8EF7', is_host: true, is_self: true, sort_order: 0 }));
  const started = Date.now();
  const accepted = await checked(client.functions.invoke('app-agent', { body: { action: 'turn', clientRunId: randomUUID(), currentJourneyId: journeyId,
    locale: 'zh', clientLocalDate: '2026-09-09', clientTimeZone: 'Asia/Shanghai',
    message: '请直接为当前哈天线旅程完成并保存完整徒步行程和我的个人装备清单。测试条件已确定：1人，2026年10月10日出发，7天6晚，沿已绑定轨迹顺序穿越，全程重装帐篷露营，自带食品、炉具燃料，自行净化天然水源，按高海拔低温条件准备，不安排徒步之外的往返交通和额外住宿。先做一次攻略搜索，优先阅读少量完整攻略正文；关键信息在配图里时再识别相关图片，资料足够就停止补搜。保留信息来源及不确定项，不把旧攻略当成当前水源或通行保证。保存每一天的明确行程和完整个人装备清单，并设置可核实的行程组轨迹终点。最后一个徒步组应结束于已绑定轨迹的总里程；没有可靠累计里程依据的中间营地不要猜，逐项说明未能设置的终点及原因。不要只给文字方案或留下未提交的清单草稿。',
  } }));
  runId = accepted.runId;
  assert.ok(runId);
  console.log(JSON.stringify({ event: 'started', runId, journeyId, trackPoints: sourceTrack.coords.length,
    verifiedWaypoints: sourceTrack.waypoints?.length || 0, testDate: '2026-10-10' }));
  let run;
  let lastProgress = '';
  const deadline = Date.now() + 15 * 60_000;
  for (;;) {
    run = await checked(client.from('agent_runs').select('status,error,final_output').eq('id', runId).single());
    const calls = await checked(client.from('agent_tool_calls').select('tool_name,status').eq('run_id', runId).order('created_at'));
    const progress = JSON.stringify(calls);
    if (progress !== lastProgress) {
      console.log(JSON.stringify({ event: 'progress', elapsedSeconds: Math.round((Date.now() - started) / 1000), calls }));
      lastProgress = progress;
    }
    if (run.status !== 'running') break;
    assert.ok(Date.now() < deadline, 'Planning exceeded the bounded test deadline');
    await sleep(3000);
  }
  const calls = await checked(client.from('agent_tool_calls').select('tool_name,status,arguments,output,error').eq('run_id', runId).order('created_at'));
  const rows = await checked(client.from('timeline_rows').select('id,day,title,time_mins,time_end_mins').eq('journey_id', journeyId).order('sort_order'));
  const groups = await checked(client.from('timeline_groups').select('name,route_end_meters,route_location_name').eq('journey_id', journeyId).eq('deleted', false).order('sort_order'));
  const lists = await checked(client.from('journey_packing_lists').select('id,kind,owner_companion_id').eq('journey_id', journeyId));
  const packing = lists.length ? await checked(client.from('journey_packing_items').select('name,quantity,weight_kg,attrs').in('list_id', lists.map(list => list.id))) : [];
  const draft = await checked(client.from('agent_packing_drafts').select('revision,state').eq('run_id', runId).maybeSingle());
  const task = await checked(client.from('agent_task_states').select('state').eq('run_id', runId).maybeSingle());
  const metrics = await checked(client.from('agent_model_metrics').select('stage,duration_ms,usage,success').eq('run_id', runId));
  const report = {
    elapsedSeconds: Math.round((Date.now() - started) / 1000), run, task: task?.state,
    counts: { searches: calls.filter(call => call.tool_name === 'search_travel_web').length,
      guideReads: calls.filter(call => call.tool_name === 'read_travel_guide' && call.output?.available).length,
      imageReads: calls.filter(call => call.tool_name === 'read_travel_guide_images' && call.output?.available).length,
      itineraryItems: rows.length, itineraryDays: new Set(rows.map(row => row.day)).size, packingItems: packing.length,
      endpointGroups: groups.filter(group => group.route_end_meters != null).length },
    rows, groups, lists, packing, draft: draft ? { revision: draft.revision, repairs: draft.state.repairs, items: draft.state.items.length } : null,
    calls: calls.map(call => ({ tool: call.tool_name, status: call.status, error: call.error,
      args: ['search_travel_web', 'read_travel_guide', 'read_travel_guide_images', 'set_itinerary_group_endpoints'].includes(call.tool_name) ? call.arguments : undefined,
      output: ['search_travel_web', 'set_itinerary_group_endpoints', 'commit_packing_draft', 'prepare_packing_draft', 'repair_packing_draft'].includes(call.tool_name) ? call.output
        : call.tool_name === 'read_travel_guide' ? { available: call.output?.available, textLength: call.output?.text?.length, imageCandidates: call.output?.images?.length } : undefined })),
    metrics,
  };
  await writeFile(reportPath, JSON.stringify(report, null, 2), { mode: 0o600 });
  console.log(JSON.stringify({ event: 'result', reportPath, elapsedSeconds: report.elapsedSeconds, status: run.status, error: run.error,
    counts: report.counts, groups, draft: report.draft, outcome: task?.state?.outcome, finalOutput: run.final_output }, null, 2));
  if (run.status !== 'completed' || report.counts.itineraryDays !== 7 || !packing.length || !report.counts.endpointGroups) process.exitCode = 1;
} finally {
  if (userId) {
    await checked(admin.from('journeys').delete().eq('id', journeyId).eq('user_id', userId));
    await checked(admin.auth.admin.deleteUser(userId));
    console.log('Disposable test account and journey removed; original journey unchanged.');
  }
}
