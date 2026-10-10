// Live, sequential evaluation. Only disposable users and their journeys are deleted.
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile, readFile, chmod } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { createClient } from '@supabase/supabase-js';

process.loadEnvFile(process.env.KAIPA_RUNTIME_ENV || 'infra/supabase/docker/.env');
const base = `http://127.0.0.1:${process.env.KONG_HTTP_PORT || 8010}`;
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(base, process.env.SERVICE_ROLE_KEY, options);
const out = '/tmp/kaipa-eval';
const secrets = Object.entries(process.env).filter(([k, v]) => /KEY|TOKEN|SECRET|PASSWORD/i.test(k) && v?.length >= 8).map(([, v]) => v);
function scrub(value) {
  if (typeof value === 'string') return secrets.reduce((s, secret) => s.split(secret).join('[REDACTED]'), value);
  if (Array.isArray(value)) return value.map(scrub);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, /^(?:.*secret.*|.*password.*|access_token|refresh_token|.*api_key.*|SERVICE_ROLE_KEY|ANON_KEY)$/i.test(k) ? '[REDACTED]' : scrub(v)]));
  return value;
}
const errText = e => scrub(e?.message || String(e));
async function checked(p) { const { data, error } = await p; if (error) throw new Error(errText(error)); return data; }
function sql(query) { return execFileSync('docker', ['exec', '-i', 'kaipa-supabase-db', 'psql', '-U', 'postgres', '-d', 'postgres', '-At', '-c', query], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }).trim(); }
const countQuery = "select count(*) from auth.users where email like '%@example.test';";
const probeCount = () => Number(sql(countQuery));
const scenarios = [
  ['S1', '我准备去党岭三湖连穿、雅拉温泉线、桑措玉琼（嘉措琼吉）徒步，天数还没确定，10月15日出发，帮我规划一下'],
  ['S2', '我准备去党岭三湖连穿徒步，天数还没确定，10月12日出发，帮我规划一下'],
  ['S3', '我准备去党岭三湖连穿徒步，全程6天，10月12日出发，帮我规划一下'],
  ['S4', '我准备去党岭三湖连穿徒步，今天出发，天数还没确定，帮我规划一下'],
];
function payload(message) {
  const now = new Date();
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now).map(p => [p.type, p.value]));
  return { action: 'turn', threadId: null, clientRunId: randomUUID(), message, intent: 'plan_journey', locale: 'zh', attachments: [],
    clientLocalDate: `${parts.year}-${parts.month}-${parts.day}`, clientLocalTime: `${parts.hour}:${parts.minute}`, clientTimeZone: 'Asia/Shanghai', clientTimestamp: now.toISOString(),
    currentLocation: { status: 'available', latitude: 22.75, longitude: 108.39, accuracy: 50, timestamp: now.getTime(), coordinateSystem: 'WGS84', placeName: '广西壮族自治区 南宁市 良庆区' } };
}
async function pages(table, columns, filter) {
  let rows = [];
  for (let offset = 0;; offset += 1000) {
    let q = admin.from(table).select(columns).range(offset, offset + 999);
    q = filter(q);
    const data = await checked(q); rows.push(...data);
    if (data.length < 1000) return rows;
  }
}
const latest = stages => Object.fromEntries([...stages].sort((a, b) => a.attempt - b.attempt || a.created_at.localeCompare(b.created_at)).map(s => [s.stage, s]));
function ordinal(day, date) {
  const m = String(day || '').match(/^(?:Day\s*|第\s*)?(\d+)(?:\s*[天日])?$/i);
  if (m) return Number(m[1]);
  if (/^\d{4}-\d{2}-\d{2}$/.test(day) && date) return 1 + Math.round((Date.parse(day) - Date.parse(date)) / 86400000);
  return null;
}
function departure(item, plannedDate) {
  const day = ordinal(item.day, plannedDate);
  if (!plannedDate || !day || !/^\d{1,2}:\d{2}$/.test(item.timeStart || '')) return null;
  const midnight = Date.parse(`${plannedDate}T00:00:00+08:00`);
  const [h, m] = item.timeStart.split(':').map(Number);
  return new Date(midnight + (day - 1) * 86400000 + (h * 60 + m) * 60000).toISOString();
}
function metrics(raw) {
  const ls = latest(raw.stages), plan = ls.plan?.artifact, save = ls.save?.artifact, packing = ls.packing?.artifact;
  const decision = raw.task?.state?.decision || null;
  const research = ls.research?.artifact;
  const search = raw.calls.filter(c => c.tool_name === 'search_travel_web').map(c => ({ id: c.id, status: c.status, argumentsQuery: c.arguments?.query ?? null, outputQuery: c.output?.query ?? null, cached: c.output?.cached === true, queryMismatch: typeof c.output?.query === 'string' && c.output.query !== c.arguments?.query, queryComparable: typeof c.output?.query === 'string' && typeof c.arguments?.query === 'string' }));
  const routes = research?.routes || [], identicalSources = [];
  for (let i = 0; i < routes.length; i++) for (let j = i + 1; j < routes.length; j++) {
    const a = [...new Set(routes[i].sourceUrls || [])].sort(), b = [...new Set(routes[j].sourceUrls || [])].sort();
    if (a.length && JSON.stringify(a) === JSON.stringify(b)) identicalSources.push([routes[i].name, routes[j].name]);
  }
  // 飞机坪 is a trail waypoint, not a flight. Activity/stay rows are not services.
  const trainFlight = i => i.kind !== 'activity' && i.kind !== 'stay' && /高铁|动车|火车|列车|卧铺|航班|飞机(?!坪)|\b(?:train|flight|[GDCZTKY]\d{1,5}|[A-Z][A-Z0-9]\d{3,4})\b/i.test(i.title || '') && !/^(?:抵达|到达)/.test(i.title || '');
  const date = plan?.journey?.plannedDate || plan?.schedule?.plannedDate || raw.journeys?.[0]?.planned_date;
  const mainRows = (ls.transport?.artifact?.mainTravel?.itineraryItems || []).filter(trainFlight);
  const planRows = (plan?.itineraryItems || []).filter(trainFlight);
  const transportRows = [...mainRows.map(i => ({ ...i, source: 'mainTravel' })), ...planRows.map(i => ({ ...i, source: 'plan' }))].map(i => { const dt = departure(i, date); return { ...i, departure: dt, tooEarly: dt ? Date.parse(dt) < Date.parse(raw.run.created_at) + 3600000 : null }; });
  const issues = plan?.feasibility?.issues || [], groupedIssues = {};
  for (const i of issues) { const key = `${i.code}/${i.severity}`; groupedIssues[key] = (groupedIssues[key] || 0) + 1; }
  const partialCalls = raw.calls.filter(c => c.tool_name === 'commit_packing_draft_partial');
  const toolFailures = raw.calls.filter(c => c.status === 'failed' || c.error || c.output?.error).map(c => ({ tool: c.tool_name, status: c.status, error: c.error || c.output?.error || null }));
  const providerLimitations = raw.calls.filter(c => c.output?.available === false || ['provider_error', 'unavailable', 'temporarily_unavailable', 'rate_limited'].includes(c.output?.status)).map(c => ({ tool: c.tool_name, status: c.output?.status ?? null, provider: c.output?.provider ?? null, reason: c.output?.reason ?? c.output?.unavailableReason ?? null, url: c.arguments?.url ?? null }));
  const text = raw.run.final_output || ls.respond?.artifact?.text || '';
  const final = ls.respond?.artifact || raw.assistantMessages?.at(-1)?.ui || {};
  const scan = JSON.stringify([raw.run.error, raw.stages.map(s => s.error), save?.failed, packing?.error, raw.calls.map(c => [c.error, c.output])]);
  return { runId: raw.run.id, scenario: raw.scenario, repetition: raw.repetition, elapsedSeconds: raw.elapsedSeconds, createdAt: raw.run.created_at, status: raw.run.status, error: raw.run.error, harnessError: raw.harnessError || null,
    stages: Object.values(ls).map(s => ({ stage: s.stage, status: s.status, attempt: s.attempt, error: s.error })), stageErrors: raw.stages.filter(s => s.error).map(s => ({ stage: s.stage, attempt: s.attempt, error: s.error })),
    decision, toolFailures, providerLimitations, requiredSchedule: decision?.requiredOperations?.includes('update_journey_schedule') ?? null, requiredMap: decision?.requiredOperations?.includes('set_journey_map_location') ?? null,
    save: save ? { saved: save.saved || [], failed: save.failed || [], skipped: save.skipped || [], repaired: save.repaired === true } : null,
    objectObjectError: scan.includes('[object Object]'), unauthorizedSkips: (save?.skipped || []).filter(s => s.reason === 'unauthorized'),
    packing: { stageStatus: ls.packing?.status ?? null, status: packing?.status ?? null, itemCount: packing?.itemCount ?? null, error: packing?.error ?? null, issues: packing?.issues || [], partialCalled: partialCalls.length > 0, partialCalls: partialCalls.map(c => ({ status: c.status, error: c.error, output: c.output })), taskScopeDenied: scan.includes('task_scope_denied'), persistedItemCount: raw.packingItems?.length ?? null },
    research: { searchCalls: search, queryMismatchCount: search.filter(s => s.queryMismatch).length, cachedCount: search.filter(s => s.cached).length, routes: routes.map(r => ({ name: r.name, sourceUrls: r.sourceUrls, unresolved: r.unresolved })), identicalSources },
    transport: { rows: transportRows, earlyDepartureCount: transportRows.filter(i => i.tooEarly).length, undatableCount: transportRows.filter(i => i.tooEarly === null).length },
    plan: plan ? { groupedIssues, issues, blocker: plan.blocker ?? null, pendingQuestion: plan.pendingQuestion ?? null, itineraryDays: new Set((plan.itineraryItems || []).map(i => i.day)).size, itineraryItems: plan.itineraryItems?.length || 0, journeyDays: plan.journey?.days ?? null, suggestedDays: ls.transport?.artifact?.mainTravel?.suggestedDays ?? null, maxItineraryDay: Math.max(0, ...(plan.itineraryItems || []).map(i => ordinal(i.day, date) || 0)), plannedDate: date ?? null } : null,
    persisted: raw.journeys ? { journeys: raw.journeys.map(j => ({ id: j.id, totalDays: j.total_days, plannedDate: j.planned_date })), rows: raw.rows.length, groups: raw.groups.length, groupsWithRouteEndMeters: raw.groups.filter(g => g.route_end_meters != null).length, packingLists: raw.packingLists.length, packingItems: raw.packingItems.length } : null,
    reply: { text: text.slice(0, 200), fullText: text, offerJourneyExtras: final.offerJourneyExtras ?? raw.assistantMessages?.at(-1)?.ui?.offerJourneyExtras ?? null, complete: text.startsWith('行程规划已完成并保存'), incomplete: text.startsWith('已保留本轮'), pendingQuestion: final.pendingQuestion ?? null }, cleanup: raw.cleanup ?? null };
}
async function collect(runId, ownUserId = null) {
  const [run, stages, calls, task] = await Promise.all([
    checked(admin.from('agent_runs').select('id,thread_id,status,error,final_output,created_at,updated_at,agent_version,stage').eq('id', runId).single()),
    pages('agent_stages', 'stage,status,attempt,artifact,error,created_at,updated_at', q => q.eq('run_id', runId).order('created_at')),
    pages('agent_tool_calls', 'id,tool_name,status,error,arguments,output,created_at,duration_ms', q => q.eq('run_id', runId).order('created_at')),
    checked(admin.from('agent_task_states').select('state').eq('run_id', runId).maybeSingle()),
  ]);
  const assistantMessages = await pages('agent_messages', 'content,ui,created_at', q => q.eq('thread_id', run.thread_id).eq('role', 'assistant').gte('created_at', run.created_at).lte('created_at', new Date(Date.parse(run.updated_at) + 2000).toISOString()).order('created_at'));
  const raw = { run, stages, calls, task, assistantMessages };
  if (ownUserId) {
    raw.journeys = await checked(admin.from('journeys').select('id,name,total_days,planned_date,days').eq('user_id', ownUserId));
    const ids = raw.journeys.map(j => j.id);
    [raw.rows, raw.groups, raw.packingLists, raw.packingDraft] = await Promise.all([
      ids.length ? pages('timeline_rows', '*', q => q.in('journey_id', ids).order('sort_order')) : [],
      ids.length ? pages('timeline_groups', '*', q => q.in('journey_id', ids).eq('deleted', false).order('sort_order')) : [],
      ids.length ? pages('journey_packing_lists', '*', q => q.in('journey_id', ids).order('created_at')) : [],
      checked(admin.from('agent_packing_drafts').select('revision,state,last_edit').eq('run_id', runId).maybeSingle()),
    ]);
    raw.packingItems = raw.packingLists.length ? await pages('journey_packing_items', '*', q => q.in('list_id', raw.packingLists.map(l => l.id)).order('sort_order')) : [];
  }
  return raw;
}
const pct = (n, d) => d ? `${n}/${d} (${(100 * n / d).toFixed(1)}%)` : 'N/A';
function aggregate(runs) {
  const packing = runs.filter(r => r.packing.stageStatus), saves = runs.filter(r => r.save), partial = runs.flatMap(r => r.packing.partialCalls), search = runs.flatMap(r => r.research.searchCalls);
  return { n: runs.length, success: pct(runs.filter(r => r.status === 'completed').length, runs.length), scheduleUnauthorized: pct(saves.filter(r => r.save.skipped.some(s => s.tool === 'update_journey_schedule' && s.reason === 'unauthorized')).length, saves.length), saveFailures: pct(saves.filter(r => r.save.failed.length).length, saves.length), packingCommitted: pct(packing.filter(r => r.packing.status === 'committed').length, packing.length), partialFailures: pct(partial.filter(c => c.status === 'failed' || c.error).length, partial.length), queryMismatch: `${search.filter(c => c.queryMismatch).length}/${search.filter(c => c.queryComparable).length} comparable (${search.length} calls, ${search.filter(c => c.cached).length} cached)`, complete: pct(runs.filter(r => r.reply.complete).length, runs.length), pending: runs.filter(r => r.plan?.pendingQuestion || r.reply.pendingQuestion).length, early: runs.filter(r => r.transport.earlyDepartureCount).length, avgSeconds: runs.length ? (runs.reduce((s, r) => s + r.elapsedSeconds, 0) / runs.length).toFixed(1) : 'N/A' };
}
function defects(runs) {
  const found = new Map();
  const add = (name, id, hypothesis) => { if (!found.has(name)) found.set(name, { ids: new Set(), hypothesis }); found.get(name).ids.add(id); };
  for (const r of runs) {
    if (r.status !== 'completed') add(`Run ended ${r.status}: ${r.error || r.harnessError || 'no error text'}`, r.runId, 'Hypothesis: inspect stage failures and worker deadlines; pipeline.ts:runStage owns stage retry/timeout behavior.');
    for (const s of r.stageErrors) add(`Stage ${s.stage}: ${s.error}`, r.runId, s.error.includes('without a journey') ? 'Hypothesis: pipeline.ts:finalizePlan clears journey for undecided-day requests when any blocker/pendingQuestion is present; pipeline.ts:planDegradeReason labels the remaining items degraded.' : 'Hypothesis: model output/provider latency or validation in pipeline.ts:runStage; an earlier failed attempt may have recovered.');
    for (const f of r.toolFailures || []) add(`Tool ${f.tool}: ${typeof f.error === 'object' ? JSON.stringify(f.error) : f.error || f.status}`, r.runId, f.tool === 'update_journey_schedule' ? 'Code-supported hypothesis: save-stage.ts:runSaveStage runs schedule before adding the itinerary. SQL agent_apply_schedule requires exactly the existing group names; the initial new journey has none, and the retry in this run supplied only five assignments after six groups existed.' : f.tool === 'set_itinerary_group_endpoints' ? 'Code-supported hypothesis: tools.ts:runSetItineraryGroupEndpoints rejects the planner assigning 卓雍措 to waypointIndex 93, whose recorded name is 甲依拉措. Save repair recovered the tool but left only 2/3 required day boundaries.' : f.tool === 'set_journey_map_location' ? 'Hypothesis: tools.ts:runSetJourneyMapLocation could not geocode the route-name query; the repair recovered with a location that could be resolved.' : 'Hypothesis: tools.ts tool validation, provider error or version-checked write rejection; see raw call arguments/output in results.json.');
    for (const p of r.providerLimitations || []) add(`Provider limitation ${p.tool}/${p.provider || 'guide'}/${p.status || 'unavailable'}`, r.runId, p.status === 'not_on_sale' ? 'Expected availability limit: rail return dates beyond the inclusive 15-day Shanghai sale window are not queryable; search/rail.ts reports this rather than claiming sold out.' : p.tool === 'read_travel_guide' ? 'Observed evidence limitation. Hypothesis: search/guide-reader.ts:readGuide cannot retrieve usable text for the selected YouTube/Zhihu page; detailed read output is retained.' : 'Observed provider failure, not proof that no flight exists. Hypothesis: search/flyai.ts:queryFlyai failed, timed out, or rejected the response schema; the returned reason does not distinguish these causes.');
    for (const f of r.save?.failed || []) add(`Save ${f.tool}: ${f.error}`, r.runId, 'Hypothesis: save-stage.ts:runSaveStage executes validated tools; tools.ts operation validation or database write guard rejected the operation.');
    for (const s of r.save?.skipped || []) add(`Skipped ${s.tool}: ${s.reason}`, r.runId, s.reason === 'unauthorized' ? 'Hypothesis: task.ts:normalizeTaskDecision scope and save-stage.ts:runSaveStage authorization disagree.' : 'Hypothesis: save-stage.ts:runSaveStage prerequisite or context unavailable.');
    if (r.objectObjectError) add('Unhelpful [object Object] error', r.runId, 'Hypothesis: object-to-string conversion at a tool/stage error boundary; tools.ts:errorText should preserve structured error.message.');
    if (r.packing.status === 'skipped' && r.packing.error) add(`Packing skipped: ${r.packing.error}`, r.runId, 'Hypothesis: packing-stage.ts:runPackingStage returns early without a bound/saved journey; this is downstream of the no-journey save result.');
    if (r.packing.status && !['committed', 'skipped'].includes(r.packing.status)) add(`Packing ${r.packing.status}: ${r.packing.error || 'needs repair'}`, r.runId, 'Hypothesis: packing-stage.ts:runPackingStage bounded repairs/commit did not produce a usable checklist.');
    for (const issue of r.packing.issues || []) add(`Packing validation ${issue.code}: ${issue.message}`, r.runId, 'Observed checklist validation gap. Hypothesis: packing-stage.ts:repairDraft exhausted bounded repairs; tools.ts:validateDraft retains item/coverage/nutrition feedback.');
    for (const c of r.packing.partialCalls) if (c.status === 'failed' || c.error) add(`Partial packing commit: ${c.error || c.status}`, r.runId, 'Hypothesis: tools.ts:runCommitPackingDraftBestEffort task scope/transaction validation rejected the partial write.');
    if (r.packing.taskScopeDenied) add('task_scope_denied', r.runId, 'Code-supported hypothesis: tools.ts:draftTool calls task.ts:assertTaskWrite for add_packing_items; this run has packingMode=full but that operation is absent. This failure occurred before any partial commit was attempted.');
    if (r.packing.issues.some(i => i.code === 'nutrition' && /防晒面罩/.test(i.message))) add('Sun mask misclassified as food', r.runId, 'Code-supported hypothesis: personal-planning.ts:isPlanningFoodItem uses FOOD_PATTERN containing the bare character 面, so 防晒面罩 is incorrectly required to supply calories; packing-coverage.ts food detection has the same broad substring.');
    const coverage = r.save?.saved.find(s => s.tool === 'set_itinerary_group_endpoints')?.output?.coverage;
    if (coverage && (!coverage.reachesTrackEnd || coverage.groupCount < coverage.requiredGroupCount)) add('Successful endpoint receipt has incomplete hiking-day coverage', r.runId, 'Hypothesis: save-stage.ts:runSaveStage repairs invalid endpoint arguments but accepts a partial coverage receipt; pipeline.ts:runRespond correctly keeps completion false.');
    if (r.persisted?.journeys.length && r.decision?.requiredOperations.includes('set_itinerary_group_endpoints') && !r.persisted.groupsWithRouteEndMeters) add('Saved hiking journey has zero required route endpoints', r.runId, 'Code-supported hypothesis: the plan artifact endpoints array is empty, so plan-document.ts:saveOperations emits no endpoint operation despite task.requiredOperations requiring it.');
    if (r.research.queryMismatchCount) add('Search query/cache cross-contamination', r.runId, 'Hypothesis: tools.ts:searchTravelWeb guide cache identity/reuse returns a result for another query.');
    if (r.research.identicalSources.length) add(`Identical route source sets: ${JSON.stringify(r.research.identicalSources)}`, r.runId, 'Hypothesis: pipeline.ts research synthesis or tools.ts cache reuse did not keep route evidence independent.');
    if (r.transport.earlyDepartureCount) add('Train/flight departure earlier than created_at + 60 minutes', r.runId, 'Hypothesis: main-transport.ts:providerItinerary filtering or plan merge leaked an obsolete departure.');
    for (const [code, count] of Object.entries(r.plan?.groupedIssues || {})) if (count) add(`Feasibility ${code}`, r.runId, 'Observed planning limitation, not automatically an agent defect. plan-feasibility.ts:validatePlanFeasibility detects the issue; inspect issue.detail in results.json for evidence.');
    if (r.plan?.issues.some(i => i.code === 'daily_load' && i.day === 'Day 1' && Math.abs((i.detail?.transferHours || 0) - 11.4333333333) < 0.01) && r.transport.rows.some(i => i.source === 'mainTravel' && i.timeStart === '07:45' && i.timeEnd === '13:28')) add('Possible duplicate train-duration accounting in feasibility', r.runId, 'Hypothesis: plan-feasibility.ts:allItems fails to deduplicate the reworded local row against the provider service after presentation; Day 1 transferHours=11.433 is exactly twice the 5h43 G3582 service window. Treat the heavy-load warning as uncertain until the merged view is inspected.');
    if (r.transport.rows.some(i => i.source === 'plan' && i.timeStart && i.timeStart === i.timeEnd)) add('Stored plan train service has equal start/end times', r.runId, 'Observed artifact inconsistency: the stored plan return-train range is 08:27–08:27 while the provider row is 08:27–15:30. Hypothesis: plan normalization/presentation or model output corrupted the end time; the saved repair and snapshot should be assessed separately.');
    if (r.plan?.pendingQuestion || r.reply.pendingQuestion) add(`Pending question: ${r.plan?.pendingQuestion || r.reply.pendingQuestion}`, r.runId, r.plan?.pendingQuestion === '无' ? 'Hypothesis: model uses a non-empty null sentinel; pipeline.ts:finalizePlan and runRespond treat it as a real pending question, block completion and append 无 to the reply.' : 'Hypothesis: travel-request.ts:travelIntake or plan finalization could not establish an executable plan. No follow-up was sent by design.');
    if (r.plan?.blocker) add(`Plan blocker: ${r.plan.blocker}`, r.runId, 'Observed incomplete plan. Hypothesis: pipeline.ts plan finalization preserves unresolved research, transport or feasibility gates.');
    if (r.plan?.journeyDays == null && r.plan?.itineraryItems > 0 && r.save?.skipped.some(s => s.reason === 'no_journey')) add('Undecided duration plus blocker discards candidate journey and prevents all persistence', r.runId, 'Code-supported hypothesis: pipeline.ts:finalizePlan sets plan.journey=null whenever decision.days is null and blocker/pendingQuestion is non-empty, even with mainTravel.suggestedDays; save-stage.ts:runSaveStage then skips writes and packing-stage.ts:runPackingStage skips the checklist.');
    if (r.requiredSchedule === false || r.requiredMap === false) add('Schedule/map missing from requiredOperations', r.runId, 'Hypothesis: task.ts:constrainTaskDecision did not recognize full planning authorization/intent.');
    if (r.decision?.packingMode === 'full' && !r.decision.operations.includes('add_packing_items')) add('Full packing mode without add_packing_items authorization', r.runId, 'Hypothesis: task interpreter selects full packing but omits its write operation; task.ts:constrainTaskDecision enforces schedule/map dependencies but does not add the packing dependency. tools.ts:draftTool requires add_packing_items, so a saved journey would still fail packing.');
    if (r.plan && r.plan.maxItineraryDay > (r.plan.journeyDays ?? r.plan.suggestedDays ?? Infinity)) add('Itinerary extends past proposed whole-trip day count', r.runId, 'Hypothesis: main-transport.ts:providerItinerary places overnight-flight arrival on the following calendar day; pipeline.ts duration/finalization does not reconcile that extra day.');
    if (r.scenario === 'S3' && r.persisted?.journeys.some(j => j.totalDays !== 6)) add('Fixed six-day request persisted a different total_days', r.runId, 'Hypothesis: pipeline.ts duration inference overwrote the requested whole-trip duration.');
  }
  return [...found].map(([name, v]) => ({ name, runIds: [...v.ids], hypothesis: v.hypothesis }));
}
function report(data) {
  const runs = data.runs.map(r => r.metrics), before = aggregate(data.baseline.map(r => r.metrics)), after = aggregate(runs), matched = aggregate(runs.filter(r => ['S1', 'S2'].includes(r.scenario)));
  const lines = ['# Kaipa live planning evaluation', '', `Started ${data.startedAt}; finished ${data.finishedAt || 'in progress'}. Real Asia/Shanghai time is captured separately for every request. Wall time: ${data.wallSeconds ?? 'in progress'} seconds. Runs executed: ${data.executedRuns}.`, '', 'Protocol: sequential, three fresh users per scenario; 3-second polling; 15-minute run limit; no answers to pending questions. Plain user text + plan_journey intent, zh locale, fresh Shanghai date/time/time zone/ISO timestamp and available WGS84 Nanning Liangqing location (22.75, 108.39; accuracy 50m). No prompt wrapper or attachments: AppAssistant.tsx:submit sends this suggestion-entry text directly. Historical journey-creation templates are different and often exclude round-trip transport, so this is an observational before/after comparison, not a controlled benchmark.', '', '| Run | ID | Seconds | Status | Days/items | Persisted days/rows/groups/endpoints | Packing (items; partial) | Save failures/skips | Reply |', '|---|---|---:|---|---|---|---|---|---|'];
  for (const r of runs) lines.push(`| ${r.scenario}.${r.repetition} | ${r.runId} | ${r.elapsedSeconds} | ${r.status} | ${r.plan?.itineraryDays ?? '—'}/${r.plan?.itineraryItems ?? '—'} | ${r.persisted?.journeys.map(j => j.totalDays).join(',') || '—'}/${r.persisted?.rows ?? '—'}/${r.persisted?.groups ?? '—'}/${r.persisted?.groupsWithRouteEndMeters ?? '—'} | ${r.packing.status || '—'} (${r.packing.itemCount ?? '—'}; ${r.packing.partialCalls.map(c => c.status).join(',') || 'no'}) | ${r.save?.failed.length ?? '—'}/${r.save?.skipped.length ?? '—'} | ${r.reply.complete ? 'complete' : r.plan?.pendingQuestion || r.reply.pendingQuestion ? 'pending' : 'incomplete/other'} |`);
  lines.push('', '| Scenario | Runs | Run success | Complete reply | Packing committed | Mean seconds | Pending | Early departure runs |', '|---|---:|---|---|---|---:|---:|---:|');
  for (const [s] of scenarios) { const a = aggregate(runs.filter(r => r.scenario === s)); lines.push(`| ${s} | ${a.n} | ${a.success} | ${a.complete} | ${a.packingCommitted} | ${a.avgSeconds} | ${a.pending} | ${a.early} |`); }
  lines.push('', ...scenarios.map(([s, m]) => `- ${s}: ${m}`), '', `Historical baseline: ${data.baseline.length} runs created before 2026-10-08 14:55 UTC with message containing 党岭三湖连穿 and undecided-day wording (天数…待定/没确定); includes S1-like multi-route and S2-like single-route messages. Read-only SQL identifies IDs via agent_jobs.payload.message. Admin reads stages/tool receipts/task states; deleted historical journeys are not reconstructed. Missing stage artifacts are excluded from stage-specific denominators.`, '', '| Headline | Before | After |', '|---|---|---|', ...[['Run success (completed)', 'success'], ['Schedule skipped unauthorized / save-stage runs', 'scheduleUnauthorized'], ['Save-stage failures / save-stage runs', 'saveFailures'], ['Packing committed / packing-stage runs', 'packingCommitted'], ['Partial-commit failed / partial-commit calls', 'partialFailures'], ['Search output.query mismatch / comparable queries', 'queryMismatch'], ['Complete-reply prefix / all runs', 'complete']].map(([label, key]) => `| ${label} | ${before[key]} | ${after[key]} |`), '', 'Run success means agent_runs.status=completed, independently of plan completeness. Complete reply requires the exact prefix 行程规划已完成并保存; historical alternate wording is not counted. Search calls without output.query are not comparable. Transport checks cover mainTravel and plan service departure rows independently (arrival rows excluded); duplicate rows across artifacts are retained with their source. Feasibility groups, latest stage attempts, all stage errors, save receipts, packing details, per-query cache flags, full replies and raw own-user snapshots are in results.json.', '', '## Distinct observed failures and limitations', '');
  const all = defects(runs);
  lines.splice(lines.indexOf('## Distinct observed failures and limitations') - 1, 0,
    `Additional headline checks: schedule and map operations are required in ${runs.filter(r => r.requiredSchedule && r.requiredMap).length}/${runs.length} runs; [object Object] errors ${runs.filter(r => r.objectObjectError).length}; task_scope_denied ${runs.filter(r => r.packing.taskScopeDenied).length}; identical non-empty route source sets ${runs.reduce((n, r) => n + r.research.identicalSources.length, 0)}; departures before created_at+60min ${runs.reduce((n, r) => n + r.transport.earlyDepartureCount, 0)} of ${runs.reduce((n, r) => n + r.transport.rows.length, 0)} service rows (${runs.reduce((n, r) => n + r.transport.rows.filter(t => t.source === 'mainTravel').length, 0)} mainTravel rows; remaining rows are plan views). offerJourneyExtras=true in ${runs.filter(r => r.reply.offerJourneyExtras === true).length} runs. The exact incomplete prefix 已保留本轮 occurs in ${runs.filter(r => r.reply.incomplete).length}/${runs.length}; other replies are replaced by response-presentation.ts:renderTaskResponse with explicit partial/draft text.`, '',
    `Like-scenario after subset (S1/S2, n=${matched.n}): run success ${matched.success}; schedule unauthorized ${matched.scheduleUnauthorized}; save failures ${matched.saveFailures}; packing committed ${matched.packingCommitted}; partial failures ${matched.partialFailures}; query mismatch ${matched.queryMismatch}; complete reply ${matched.complete}.`, '',
    'S4 requests ran at 23:19–23:21 on October 8, Shanghai. No obsolete service rows were emitted; same-day outbound rail was empty and flight queries returned provider_error. This demonstrates no leaked past departure for these observed responses, but did not exercise filtering of a provider response containing an obsolete outbound offer. Missing outbound transport remained an explicit blocker/question.', '',
    'Artifact limitation: save repairs do not rewrite the stored plan artifact or rerun checkPlanFeasibility (pipeline.ts:runSave). The per-run feasibility metrics therefore describe the stored pre-save document; saved receipts and persisted snapshots describe the actual final writes. Successful repair receipts can differ from the stored endpoint list.', '');
  if (!all.length) lines.push('None detected by these checks.');
  for (const d of all) lines.push(`- **${d.name.replaceAll('|', '\\|').replaceAll('\n', ' ')}** — runs: ${d.runIds.join(', ')}. ${d.hypothesis}`);
  lines.push('', '## Cleanup', '', `Count query (before and after): \`${countQuery}\``, '', `Before: **${data.cleanup.before}**. After: **${data.cleanup.after ?? 'pending'}**. Created: ${data.cleanup.created}; deleted: ${data.cleanup.deleted}; cleanup failures: ${data.cleanup.failures.length}. Existing example.test users were not touched.`, '', `Script: scripts/scenario-live-eval.mjs. Artifacts: ${out}/results.json (0600), ${out}/summary.md (0600). No deployments, migrations, agent-code changes or direct cache-table writes.`);
  return lines.join('\n') + '\n';
}
async function persist(data) {
  await mkdir(out, { recursive: true, mode: 0o700 });
  await chmod(out, 0o700);
  data.defects = defects(data.runs.map(r => r.metrics));
  await writeFile(`${out}/results.json`, JSON.stringify(scrub(data), null, 2), { mode: 0o600 }); await chmod(`${out}/results.json`, 0o600);
  await writeFile(`${out}/summary.md`, scrub(report(data)), { mode: 0o600 }); await chmod(`${out}/summary.md`, 0o600);
}
let interrupted = false;
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { interrupted = true; });
async function cleanup(userId) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try { await checked(admin.from('journeys').delete().eq('user_id', userId)); await checked(admin.auth.admin.deleteUser(userId)); return; }
    catch (e) { if (attempt === 3) throw e; await sleep(1000); }
  }
}
async function execute(data, scenario, message, repetition) {
  let userId, runId, client, raw, harnessError;
  const start = Date.now(), request = payload(message);
  try {
    const email = `live-eval-${randomUUID()}@example.test`, password = randomUUID(); secrets.push(password);
    userId = (await checked(admin.auth.admin.createUser({ email, password, email_confirm: true }))).user.id; data.cleanup.created++;
    client = createClient(base, process.env.ANON_KEY, options); await checked(client.auth.signInWithPassword({ email, password }));
    data.executedRuns++;
    const accepted = await checked(client.functions.invoke('app-agent', { body: request, signal: AbortSignal.timeout(60_000) }));
    runId = accepted.runId; if (!runId) throw new Error('Accepted response has no runId');
    console.log(JSON.stringify({ event: 'started', scenario, repetition, runId, localDate: request.clientLocalDate, localTime: request.clientLocalTime }));
    let lastStage;
    for (;;) {
      const run = await checked(admin.from('agent_runs').select('status,stage').eq('id', runId).single());
      if (run.stage !== lastStage) { lastStage = run.stage; console.log(JSON.stringify({ event: 'stage', runId, stage: run.stage, elapsedSeconds: Math.round((Date.now() - start) / 1000) })); }
      if (!['running', 'queued', 'pending'].includes(run.status)) break;
      if (interrupted || Date.now() - start >= 15 * 60_000) {
        harnessError = interrupted ? 'Evaluation interrupted' : '15-minute evaluation deadline exceeded';
        await checked(client.functions.invoke('app-agent', { body: { action: 'cancel_run', runId } }));
        break;
      }
      await sleep(3000);
    }
    raw = await collect(runId, userId);
  } catch (e) {
    harnessError = errText(e);
    // Invocation may have been accepted before an HTTP interruption.
    if (!runId && userId) { const row = await checked(admin.from('agent_runs').select('id').eq('id', request.clientRunId).eq('user_id', userId).maybeSingle()); runId = row?.id; }
    if (runId) raw = await collect(runId, userId);
  } finally {
    let cleanupError = null;
    if (userId) {
      try {
        // Cancel an own-user run before deletion if collection failed mid-flight.
        if (runId && (!raw || ['running', 'queued', 'pending'].includes(raw.run.status))) await checked(client.functions.invoke('app-agent', { body: { action: 'cancel_run', runId } }));
      } catch (e) { harnessError = [harnessError, `Cancel: ${errText(e)}`].filter(Boolean).join('; '); }
      try { await cleanup(userId); data.cleanup.deleted++; }
      catch (e) { cleanupError = errText(e); data.cleanup.failures.push({ runId, userId, error: cleanupError }); }
    }
    raw ||= { run: { id: runId || request.clientRunId, status: 'harness_failed', error: harnessError, created_at: request.clientTimestamp }, stages: [], calls: [], task: null, assistantMessages: [] };
    Object.assign(raw, { scenario, repetition, request, elapsedSeconds: +((Date.now() - start) / 1000).toFixed(1), harnessError, cleanup: { userCreated: Boolean(userId), userDeleted: Boolean(userId) && !cleanupError, error: cleanupError } });
    raw.metrics = metrics(raw); data.runs.push(raw); data.cleanup.after = probeCount(); await persist(data);
    console.log(JSON.stringify({ event: 'result', scenario, repetition, runId: raw.run.id, seconds: raw.elapsedSeconds, status: raw.run.status, packing: raw.metrics.packing.status, replyComplete: raw.metrics.reply.complete, cleanedUp: raw.cleanup.userDeleted, harnessError }));
    if (cleanupError) throw new Error(`Cleanup failed: ${cleanupError}`);
  }
}
async function main() {
  if (process.argv.includes('--report-only')) { const data = JSON.parse(await readFile(`${out}/results.json`, 'utf8')); for (const r of [...data.runs, ...data.baseline]) r.metrics = metrics(r); await persist(data); return; }
  const started = Date.now();
  const data = { startedAt: new Date(started).toISOString(), executedRuns: 0, baselineCutoff: '2026-10-08T14:55:00Z', baseline: [], runs: [], cleanup: { countQuery, before: probeCount(), after: null, created: 0, deleted: 0, failures: [] } };
  // Only IDs, message and timestamps are read here. No keys or auth identities.
  const historical = JSON.parse(sql("select coalesce(json_agg(x),'[]'::json) from (select r.id,j.payload->>'message' as message from agent_runs r join agent_jobs j on j.run_id=r.id where r.created_at < '2026-10-08 14:55:00+00' and j.payload->>'message' like '%党岭三湖连穿%' and j.payload->>'message' ~ '(天数.*(待定|没确定)|全程天数待定)' order by r.created_at) x;"));
  for (const h of historical) { const raw = await collect(h.id); Object.assign(raw, { scenario: h.message.includes('雅拉') ? 'S1-like' : 'S2-like', message: h.message, elapsedSeconds: +((Date.parse(raw.run.updated_at) - Date.parse(raw.run.created_at)) / 1000).toFixed(1) }); raw.metrics = metrics(raw); data.baseline.push(raw); }
  console.log(JSON.stringify({ event: 'baseline', runs: data.baseline.length, beforeProbeUsers: data.cleanup.before, headline: aggregate(data.baseline.map(r => r.metrics)) }));
  await persist(data);
  try { for (const [s, message] of scenarios) for (let repetition = 1; repetition <= 3 && !interrupted; repetition++) await execute(data, s, message, repetition); }
  finally { data.finishedAt = new Date().toISOString(); data.wallSeconds = +((Date.now() - started) / 1000).toFixed(1); data.cleanup.after = probeCount(); await persist(data); }
  console.log(JSON.stringify({ event: 'finished', executedRuns: data.executedRuns, wallSeconds: data.wallSeconds, beforeProbeUsers: data.cleanup.before, afterProbeUsers: data.cleanup.after, deleted: data.cleanup.deleted, paths: [`${out}/results.json`, `${out}/summary.md`] }));
}
main().catch(e => { console.error(errText(e)); process.exitCode = 1; });
