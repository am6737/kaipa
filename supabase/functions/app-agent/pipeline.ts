// Staged pipeline for the tasks that used to blow a single model-loop budget.
//
// A full plan is minutes of model work: research, an itinerary over a real
// track, a checklist. One 210s runner budget could never cover it, so every
// such turn timed out, retried from scratch and left an abandoned execution
// holding journey locks. Here each stage has its own budget, its own durable
// artifact and its own retry, and the planner no longer loops freely: it emits
// one declarative PlanDocument that deterministic code saves.
import { assistantOutput } from './agent.ts';
import { planningSkills } from './skills.ts';
import { travelContextSchema } from './travel-context-schema.ts';
import { planChunkSchema, planDocumentModelSchema, planDocumentSchema, planDraftFrom, planSkeletonSchema, researchBriefSchema, saveToolNames, transportPlanSchema, type PlanChunk, type PlanDocument, type ResearchBrief, type TransportPlan } from './plan-document.ts';
import { boundJourneyId, runSaveStage, type SaveArtifact } from './save-stage.ts';
import { contextPrompt, readJourneySections } from './context.ts';
import { packingPatchModelSchema, packingProposalModelSchema, runPackingStage, type PackingArtifact } from './packing-stage.ts';
import { allowGuideQueries, allowGuideReads, clearGuideQueries, getAppContext, getJourneyDetails, listGear, parseJsonString, readConversationHistory, runReadTravelGuide, runReadTravelGuideImages, runSearchTravelWeb, searchRoutes } from './tools.ts';
import { GUIDE_LIMITS } from './search/guide-reader.ts';
import { reviewTransport } from './transport-tool.ts';
import { overnightReviewSchema } from './hiking-boundaries.ts';
import type { TaskDecision, TaskState } from './task.ts';
import type { AgentContext } from './types.ts';

export type StageName = 'interpret' | 'research' | 'transport' | 'plan' | 'save' | 'packing' | 'respond';

// Stage budgets sum below the worker's fetch timeout and the job lease. Two
// stages are near-synchronous: interpret returns the already-prepared decision
// and save is deterministic code, so their budgets bound only the save stage's
// optional repair round, not a model loop.
// Budgets are calibrated against measured model latency, not guesses. Over a
// four-day sample the research synthesis call ran p50 6s / p90 54s / max 105s
// and the planner p50 8s / p90 106s / max 180s, so a 75s/90s pair aborted the
// normal path: research fell back to the deterministic brief on almost every
// run, and one plan in eight died mid-output. The plan and packing stages get
// the room their worst case needs, because an aborted plan costs the whole
// itinerary while an aborted reply costs a sentence. interpret and respond
// carry the most headroom (interpret makes no model call, and respond measured
// max 8.5s), so they give the margin back: the sum is 630s, leaving 70s under
// the worker's 700s fetch timeout and the 12-minute job lease.
export const STAGE_BUDGETS: Record<StageName, number> = {
  interpret: 30_000,
  research: 120_000,
  transport: 30_000,
  plan: 180_000,
  // Saving may need one deterministic evidence downgrade plus a complete
  // versioned write round; 30s routinely aborted valid repairs mid-flight, and
  // the repair round is itself a tool-using model call.
  save: 90_000,
  packing: 150_000,
  respond: 60_000,
};

const ARTIFACT_LIMIT_BYTES = 1_000_000;

export type StageAgentFactory = (options: {
  name: string;
  instructions: string;
  tools: unknown[];
  outputType: unknown;
  model: string;
  stage: string;
  temperature: number;
}) => unknown;

export type AgentInvoker = (agent: unknown, input: unknown, options: { maxTurns: number; signal: AbortSignal; session?: unknown }) => Promise<unknown>;

export type PipelineDeps = {
  admin: any;
  client: any;
  context: AgentContext;
  task: TaskState;
  runId: string;
  userId: string;
  attempt: number;
  signal: AbortSignal;
  /** The composed light-path input: temporal, recovery, location, travel facts, verified context, task scope and the user message. */
  userInput: string;
  /** The composed light-path model input, attachments included; the research stage swaps in its own text. */
  agentInput: unknown;
  stageAgent: StageAgentFactory;
  invoke: AgentInvoker;
  model: string;
  flashModel: string;
};

// Long-form work goes through the pipeline; single edits, deletions, undo and
// discussion keep the interactive loop. Transport counts because a connection
// chain is the same shape of work as a hike: research, one plan, one save.
// The gate is what the staged path can express, not a guess about the work's
// size: a task enters only when every authorized write is a PlanDocument save
// tool, plus packing items only for a full-checklist task (the packing stage
// writes those). A task that also carries any other write — a deletion, an
// incremental packing addition — is a correction and stays interactive.
export function useStagedPipeline(decision: TaskDecision) {
  if (decision.mode !== 'execute') return false;
  if (!decision.operations.length) return false;
  const expressible = decision.operations.every(operation =>
    (saveToolNames as readonly string[]).includes(operation)
    || (operation === 'add_packing_items' && decision.packingMode === 'full'));
  if (!expressible) return false;
  return decision.fullHikingPlan === true || decision.packingMode === 'full' || decision.domain === 'transport';
}

export async function runPipeline(pipeline: PipelineDeps): Promise<{ finalOutput: unknown; aborted: boolean }> {
  const state = await loadStageState(pipeline.admin, pipeline.runId);
  const domain = pipeline.task.decision.domain ?? 'general';
  const transport = domain === 'transport';

  // A full hiking plan must be based on the current journey and its real
  // track. Keep this deterministic: relying on the plan model to remember a
  // read-only tool call allowed generic "front half / back half" plans to be
  // saved even when a valid track was already attached.
  if (pipeline.task.decision.fullHikingPlan && pipeline.context.currentJourneyId) {
    await readJourneySections(pipeline.client, pipeline.context, pipeline.context.currentJourneyId, ['journey', 'track', 'itinerary']);
    pipeline.userInput += `\n\n服务端已强制核验当前旅程与轨迹；以下快照是本轮规划的事实来源：${contextPrompt(pipeline.context)}`;
  }

  const interpret = await runStage({ name: 'interpret', state, pipeline, execute: async () => pipeline.task.decision });
  if (interpret.aborted) return aborted();

  const research = await runStage<ResearchBrief>({
    name: 'research', state, pipeline,
    execute: signal => runResearch(pipeline, signal, transport),
  });
  if (research.aborted) return aborted();

  const multiRoute = isMultiRouteRequest(pipeline.task.decision.destination);
  const transportPlan = multiRoute ? await runStage<TransportPlan>({
    name: 'transport', state, pipeline,
    execute: signal => runTransport(pipeline, signal, research.artifact),
  }) : { artifact: null as TransportPlan | null, aborted: false };
  if (transportPlan.aborted) return aborted();

  // Keep the user's omission distinct from the researched estimate. The
  // estimate is still auditable in the ResearchBrief and can be revised by a
  // later user instruction without pretending they supplied a duration.
  if (pipeline.task.decision.days == null) {
    const researchedDays = research.artifact?.routes || [];
    const routeDays = researchedDays.length > 0 && researchedDays.every(route => Number.isInteger(route.hikingDays) && (route.hikingDays || 0) > 0)
      ? researchedDays.reduce((sum, route) => sum + (route.hikingDays || 0), 0)
      : null;
    pipeline.task.decision.derivedDays = transportPlan.artifact?.recommendedDays
      ?? research.artifact?.suggestedDays
      ?? routeDays;
  }

  let plan = await runStage<PlanDocument>({
    name: 'plan', state, pipeline,
    execute: signal => runPlan(pipeline, signal, research.artifact, transport, transportPlan.artifact),
    degrade: plan => planDegradeReason(plan, Boolean(boundJourneyId(pipeline.context))),
  });
  if (plan.aborted) return aborted();

  const save = await runStage<SaveArtifact>({
    name: 'save', state, pipeline,
    execute: signal => runSave(pipeline, signal, plan.artifact as PlanDocument, research.artifact),
  });
  if (save.aborted) return aborted();

  let packing: PackingArtifact | null = null;
  if (pipeline.task.decision.packingMode === 'full') {
    // Both packing model calls are one-shot with a structured schema, so the
    // only difference is the instructions and the shape they must return.
    const packingCall = (name: string, instructions: string, outputType: unknown) =>
      (input: string, budget: AbortSignal) => stageCall(pipeline, pipeline.stageAgent({
        name, instructions, tools: [], outputType, 
        model: pipeline.flashModel, stage: 'packing', temperature: 0,
      }), input, { maxTurns: 1, signal: budget }, value => value);
    const packed = await runStage<PackingArtifact>({
      name: 'packing', state, pipeline,
      execute: signal => runPackingStage({
        client: pipeline.client,
        context: pipeline.context,
        signal,
        planProfile: (plan.artifact as PlanDocument).packingProfile,
        planInput: pipeline.userInput,
        generate: packingCall('Kaipa Packing Planner', [packingInstructions, planningSkills.packing.body].join('\n\n'), packingProposalModelSchema),
        repair: packingCall('Kaipa Packing Repair', packingRepairInstructions, packingPatchModelSchema),
      }),
    });
    if (packed.aborted) return aborted();
    packing = packed.artifact;
  }

  const respond = await runStage<unknown>({
    name: 'respond', state, pipeline,
    execute: signal => runRespond(pipeline, signal, {
      plan: plan.artifact as PlanDocument,
      save: save.artifact,
      packing,
    }),
  });
  if (respond.aborted) return aborted();

  return { finalOutput: withDeterministicDraft(respond.artifact, plan.artifact, save.artifact), aborted: false };
}

// The reply never has to reproduce the plan text: when nothing was saved the
// proposal is rendered from the artifact the planner already produced. A bare
// created journey counts as nothing: the itinerary itself still needs to show.
function withDeterministicDraft(output: unknown, plan: PlanDocument | null, save: SaveArtifact | null) {
  const record: Record<string, unknown> = output && typeof output === 'object' && !Array.isArray(output)
    ? { ...(output as Record<string, unknown>) }
    : { text: String(output ?? '') };
  const savedAnything = Boolean(save?.saved.some(entry => entry.tool !== 'create_journey'));
  if (!savedAnything && plan) record.draft = planDraftFrom(plan);
  // Retention of the previously confirmed travel facts already covers an
  // unusable one; a malformed object must not fail a completed plan.
  const travel = travelContextSchema.safeParse(record.travelContext);
  record.travelContext = travel.success ? travel.data : null;
  return record;
}

// Structured output is validated by the provider's SDK, which redacts the
// reason. A rejected one-shot stage is a single cheap model call to re-ask;
// a rejected multi-turn stage would re-run its whole loop, so those fail here
// and the job retry resumes the stage from its own budget instead.
// The re-ask prompt needs the concrete validation failure: zod issues become
// compact `path: message` lines, anything else (prose instead of JSON, a
// provider error) is truncated text the model can still act on.
function rejectionHint(error: unknown): string {
  if (error && typeof error === 'object' && 'issues' in error && Array.isArray((error as { issues?: unknown }).issues)) {
    const issues = (error as { issues: Array<{ path?: unknown[]; message?: string }> }).issues.slice(0, 6)
      .map(issue => [issue.path?.join('.'), issue.message].filter(Boolean).join(': '));
    if (issues.length) return `上一次输出未通过结构校验，具体问题：${issues.join('；')}。`;
  }
  const message = error instanceof Error ? error.message : String(error);
  const reason = message.includes('Max turns')
    ? '工具调用轮次已经用尽，还没有给出最终输出。'
    : message.includes('JSON')
      ? '上一轮没有输出 JSON，只给出了文字说明。'
      : '上一次输出未通过结构校验。';
  return `${reason}校验信息：${message.slice(0, 300)}`;
}

async function stageCall<T>(pipeline: PipelineDeps, agent: unknown, input: AgentInput, options: { maxTurns: number; signal: AbortSignal; reask?: { maxTurns: number; allowTools: boolean; note?: string } }, parse: (value: unknown) => T): Promise<T> {
  // One shared session per call: the model's tool calls and results stay in
  // memory, so the single retry below asks only for the missing JSON instead
  // of paying for the searches and reads again.
  const session = new StageSession();
  const invoke = (text: AgentInput, maxTurns: number) => pipeline.invoke(agent, text, { ...options, maxTurns, session });
  try {
    return parse(parseJsonString(await invoke(input, options.maxTurns)));
  } catch (error) {
    if (options.signal.aborted) throw error;
    const message = error instanceof Error ? error.message : String(error);
    console.warn('[AppAgent] stage output rejected, re-asking with the evidence in hand', message.slice(0, 1200));
    // The re-ask carries the concrete failure (field path + reason) so the
    // model fixes the right thing instead of guessing; the SDK's redaction is
    // disabled in createAgentRuntime for exactly this. The plan stage may
    // re-read data on its re-ask: without tools a rejected plan would
    // otherwise "give up" into a blocker instead of fixing the fields.
    const reask = options.reask ?? { maxTurns: 1, allowTools: false };
    const guidance = reask.allowTools
      ? '请直接输出一份修正后的完整 JSON；如确有必要，最多再调用一次只读工具核实数据，之后必须输出完整 JSON，不要解释。'
      : '请直接输出一份修正后的完整 JSON，不要解释，也不要调用任何工具。';
    const note = reask.note ? `\n${reask.note}` : '';
    try {
      return parse(parseJsonString(await invoke(`${rejectionHint(error)}${guidance}${note}`, reask.maxTurns)));
    } catch (retryError) {
      // Preserve the actionable first rejection when the repair call is
      // interrupted by the runtime. Otherwise stage persistence only records
      // the opaque final AbortError and the original field/path is lost.
      if (options.signal.aborted || /Request was aborted|AbortError|signal is aborted/i.test(retryError instanceof Error ? retryError.message : String(retryError))) {
        const retryMessage = retryError instanceof Error ? retryError.message : String(retryError);
        throw new Error(`Initial stage output validation failed: ${rejectionHint(error)} Repair attempt ended: ${retryMessage}`);
      }
      throw retryError;
    }
  }
}

// One read-tool set per stage, so a new read tool added to the interactive
// catalog cannot silently stay invisible to the pipeline.
const planTools = [getAppContext, getJourneyDetails, listGear, readConversationHistory, searchRoutes];

function isMultiRouteRequest(destination: string | null) {
  if (!destination) return false;
  return destination.split(/[、，,;/；|]/).map(item => item.trim()).filter(Boolean).length > 1;
}

// ---- Deterministic research stage ----
//
// The model no longer drives the search loop: it rephrased queries, merged
// route queries into one search and kept opening sources until the stage
// budget aborted the run. The pipeline now fires one fixed discovery search
// per route and reads the top guides (plus selected images) itself, so route
// coverage is decided by code. Guide reads hit the persistent article cache
// first, so extra sources mostly cost a DB roundtrip, and the collection
// deadline still bounds fresh extractions. The model only synthesizes the
// collected evidence into a ResearchBrief, and a deterministic fallback
// builds the brief without any model call when synthesis fails.
const RESEARCH_COLLECT_BUDGET_MS = 45_000;
const RESEARCH_REUSE_MAX_AGE_MS = 14 * 86_400_000;
const GUIDE_RESULTS_PER_ROUTE = 6;
// Interactive guidance already suggests 1-3 guides per topic; the collector
// follows the same bound per route, registered as planned reads so the
// interactive page budget does not truncate multi-route collection.
const GUIDES_TO_READ_PER_ROUTE = 3;
const GUIDE_BODY_SYNTHESIS_CHARS = 6_000;
// Reading several guides made collection cheap (the article cache answers most
// of it) but the synthesis call pays for every character: three uncapped
// bodies pushed a p50 6s call past 75s. The digest is what reaches planning,
// so the evidence is capped in total rather than per guide.
const GUIDE_EVIDENCE_TOTAL_CHARS = 15_000;
const GUIDE_BODY_IMAGE_THRESHOLD_CHARS = 2_500;

export type CatalogRouteWaypoint = { index: number; name: string; distanceKm: number; elevationMeters: number | null };

export type CatalogRoute = {
  routeId: string;
  name: string;
  /** The destination token this row resolved from; the interpreter may shorten
   * a route name ("党岭" for "党岭三湖连穿"), so name equality is not a join. */
  matchedName: string;
  region: string | null;
  distanceKm: number | null;
  hikingDays: number | null;
  trackFileName: string | null;
  start: { longitude: number; latitude: number } | null;
  end: { longitude: number; latitude: number } | null;
  waypoints: CatalogRouteWaypoint[];
};

export type RouteEvidence = {
  name: string;
  catalog: CatalogRoute | null;
  /** Entry carried over from a recent prior run; skips collection. */
  carried: ResearchBrief['routes'][number] | null;
  results: Array<Record<string, unknown>>;
  guideBody: string | null;
  imageText: string | null;
  collected: string[];
  error: string | null;
};

function destinationNames(destination: string | null): string[] {
  return (destination || '').split(/[、，,;/；|]/).map(name => name.trim()).filter(Boolean);
}

export function normalizedDestination(destination: string | null): string {
  return destinationNames(destination).map(name => name.toLocaleLowerCase()).sort().join('|');
}

export function isResolvedRoute(route: ResearchBrief['routes'][number] | null | undefined): boolean {
  if (!route) return false;
  return route.unresolved.length === 0 && route.summary.trim().length > 0
    && (route.hikingDays != null || route.distanceKm != null);
}

// A recent completed brief for the same destination set is reused instead of
// re-searching: route facts (GPX-derived days/distance) do not change between
// a first plan and its replan. Only resolved route entries carry over; a
// partial match becomes evidence the synthesis model may reuse per route.
async function findRecentBrief(pipeline: PipelineDeps, names: string[]): Promise<ResearchBrief | null> {
  if (!names.length) return null;
  const rows = await pipeline.admin.from('agent_stages')
    .select('artifact,updated_at').eq('stage', 'research').eq('status', 'completed').eq('user_id', pipeline.userId)
    .order('updated_at', { ascending: false }).limit(8);
  if (rows.error) throw rows.error;
  const wanted = normalizedDestination(pipeline.task.decision.destination);
  for (const row of (rows.data || []) as Array<{ artifact: unknown; updated_at: string }>) {
    const parsed = researchBriefSchema.safeParse(row.artifact);
    if (!parsed.success || !parsed.data.routes.length) continue;
    if (normalizedDestination(parsed.data.destination) !== wanted) continue;
    if (Date.parse(row.updated_at) < Date.now() - RESEARCH_REUSE_MAX_AGE_MS) continue;
    return parsed.data;
  }
  return null;
}

// Catalog facts are deterministic (GPX-recorded duration and track
// coordinates) and must always win over anything a model writes.
export function bindCatalogFacts(brief: ResearchBrief, catalogFacts: CatalogRoute[]): ResearchBrief {
  return {
    ...brief,
    routes: brief.routes.map((route) => {
      const catalogRoute = catalogFacts.find((item) => item.matchedName === route.name);
      return catalogRoute ? {
        ...route,
        routeId: catalogRoute.routeId,
        distanceKm: catalogRoute.distanceKm,
        hikingDays: catalogRoute.hikingDays,
        start: catalogRoute.start ? { name: `${route.name} 起点`, ...catalogRoute.start } : route.start,
        end: catalogRoute.end ? { name: `${route.name} 终点`, ...catalogRoute.end } : route.end,
        waypoints: catalogRoute.waypoints,
      } : { ...route, waypoints: [] };
    }),
  };
}

// A recorded track can carry hundreds of named points. The planner needs
// candidates spread along the whole route — camping and resupply notes cluster
// near the days they belong to — so an even sample keeps every stretch
// represented while the original index stays valid for waypointIndex.
const CATALOG_WAYPOINTS_PER_ROUTE = 40;

// True when the catalog already answers what the plan stage needs for every
// requested route, so guide reading and the synthesis call would only add
// prose. Skipping them is what removes the research stage's two-minute tail;
// the deterministic brief still reports the guides as unread.
export function catalogCoversPlanning(names: string[], catalogFacts: CatalogRoute[]): boolean {
  if (!names.length) return false;
  return names.every((name) => {
    const route = catalogFacts.find(item => item.matchedName === name);
    return Boolean(route && route.hikingDays != null && route.waypoints.length > 0);
  });
}

export function sampleCatalogWaypoints(values: unknown): CatalogRouteWaypoint[] {
  if (!Array.isArray(values)) return [];
  const named = values.flatMap((value, index) => {
    if (!value || typeof value !== 'object') return [];
    const point = value as Record<string, unknown>;
    const name = typeof point.name === 'string' ? point.name.trim() : '';
    if (!name) return [];
    const distanceKm = Number(point.km);
    return [{
      index,
      name: name.slice(0, 120),
      distanceKm: Number.isFinite(distanceKm) && distanceKm >= 0 ? Number(distanceKm.toFixed(3)) : 0,
      elevationMeters: Number.isFinite(Number(point.elevationMeters)) ? Math.round(Number(point.elevationMeters)) : null,
    }];
  });
  if (named.length <= CATALOG_WAYPOINTS_PER_ROUTE) return named;
  const step = (named.length - 1) / (CATALOG_WAYPOINTS_PER_ROUTE - 1);
  return Array.from({ length: CATALOG_WAYPOINTS_PER_ROUTE }, (_, position) => named[Math.round(position * step)]);
}

async function loadCatalogFacts(pipeline: PipelineDeps, names: string[]): Promise<CatalogRoute[]> {
  const columns = 'id,name,region,dist,track_coords,track_duration_ms,track_file_name,track_waypoints';
  const catalog = names.length ? await pipeline.client.from('routes').select(columns).in('name', names).limit(20) : { data: [], error: null };
  if (catalog.error) throw catalog.error;
  const matchedNames = new Map<string, string>();
  for (const route of (catalog.data || []) as any[]) matchedNames.set(route.id, route.name);
  const found: any[] = [...(catalog.data || [])];
  // The interpreter writes the destination in its own words and can shorten a
  // route name ("党岭三湖" for "党岭三湖连穿"). Without a fallback the exact
  // match misses and that route loses its GPX days and waypoints, so an
  // unmatched name gets one bounded containment lookup.
  for (const name of names) {
    if (found.some((route: any) => route.name === name)) continue;
    const loose = await pipeline.client.from('routes').select(columns).ilike('name', `%${name}%`).limit(3);
    if (loose.error) throw loose.error;
    const exact = (loose.data || []).find((route: any) => route.name === name);
    const candidate = exact ?? (loose.data || [])[0];
    if (candidate && !found.some((route: any) => route.id === candidate.id)) {
      found.push(candidate);
      matchedNames.set(candidate.id, name);
    }
  }
  return found.map((route: any) => {
    const coords = Array.isArray(route.track_coords) ? route.track_coords : [];
    const start = coords[0];
    const end = coords[coords.length - 1];
    const durationMs = Number(route.track_duration_ms);
    return { routeId: route.id, name: route.name, matchedName: matchedNames.get(route.id) ?? route.name, region: route.region, distanceKm: Number.parseFloat(String(route.dist || '').replace(/[^0-9.]/g, '')) || null, hikingDays: Number.isFinite(durationMs) && durationMs > 0 ? Math.ceil(durationMs / 86_400_000) : null, trackFileName: route.track_file_name, start: Array.isArray(start) ? { longitude: start[0], latitude: start[1] } : null, end: Array.isArray(end) ? { longitude: end[0], latitude: end[1] } : null, waypoints: sampleCatalogWaypoints(route.track_waypoints) };
  });
}

async function collectRouteEvidence(pipeline: PipelineDeps, signal: AbortSignal, names: string[], catalogFacts: CatalogRoute[], previous: ResearchBrief | null): Promise<RouteEvidence[]> {
  const evidence: RouteEvidence[] = [];
  const deadline = Date.now() + RESEARCH_COLLECT_BUDGET_MS;
  const runContext = { context: pipeline.context };
  // The fixed per-route queries bypass the interactive one-discovery guard;
  // journal receipts still dedupe them across retries of this run.
  allowGuideQueries(pipeline.runId, names.map(name => `${name} 徒步 攻略`));
  try {
    for (const name of names) {
      const catalog = catalogFacts.find(route => route.matchedName === name) || null;
      const carried = previous?.routes.find(route => route.name === name) || null;
      if (isResolvedRoute(carried)) {
        evidence.push({ name, catalog, carried, results: [], guideBody: null, imageText: null, collected: ['上一轮已核验，本轮复用'], error: null });
        continue;
      }
      if (signal.aborted || Date.now() > deadline) {
        evidence.push({ name, catalog, carried, results: [], guideBody: null, imageText: null, collected: ['研究阶段预算不足，未检索'], error: null });
        continue;
      }
      await collectOneRoute(pipeline, signal, runContext, deadline, name, catalog, evidence);
    }
    return evidence;
  } finally {
    clearGuideQueries(pipeline.runId);
  }
}

async function collectOneRoute(pipeline: PipelineDeps, signal: AbortSignal, runContext: { context: AgentContext }, deadline: number, name: string, catalog: CatalogRoute | null, evidence: RouteEvidence[]): Promise<void> {
  void pipeline;
  const collected: string[] = [];
  const results: Array<Record<string, unknown>> = [];
  let guideBody: string | null = null;
  let imageText: string | null = null;
  try {
    const search = await runSearchTravelWeb({ query: `${name} 徒步 攻略`, purpose: 'guide' }, runContext);
    const searchObject = typeof search === 'string' ? null : (search as Record<string, unknown> | null);
    if (searchObject === null && typeof search === 'string') collected.push(`检索工具报错：${search.slice(0, 200)}`);
    const found = Array.isArray(searchObject?.results) ? searchObject.results.slice(0, GUIDE_RESULTS_PER_ROUTE).filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object')) : [];
    results.push(...found);
    if (typeof search !== 'string') collected.push(found.length ? `检索到 ${found.length} 条结果` : '检索无结果');
    const candidates = found.filter(item => typeof item.url === 'string' && (item.url as string).length <= 2048);
    if (candidates.length && Date.now() <= deadline && !signal.aborted) {
      // Registered before reading so the interactive page budget cannot
      // truncate the deterministic collection; the collector's own deadline
      // and the cache-first read path keep the cost bounded.
      allowGuideReads(runContext.context.runId, candidates.slice(0, GUIDES_TO_READ_PER_ROUTE).map(item => item.url as string));
      const bodies: string[] = [];
      for (const [index, item] of candidates.slice(0, GUIDES_TO_READ_PER_ROUTE).entries()) {
        if (Date.now() > deadline || signal.aborted) {
          collected.push('研究阶段预算不足，未读取剩余攻略');
          break;
        }
        const guideUrl = item.url as string;
        const page = await runReadTravelGuide({ url: guideUrl }, runContext);
        const pageObject = typeof page === 'string' ? null : (page as Record<string, unknown> | null);
        if (typeof page === 'string') collected.push(`攻略读取报错：${page.slice(0, 200)}`);
        const pageAvailable = pageObject?.available === true && typeof pageObject.text === 'string' && Boolean(pageObject.text);
        if (!pageAvailable) {
          collected.push('攻略正文不可用，仅保留检索摘要');
          continue;
        }
        const pageText = String(pageObject!.text);
        const title = typeof item.title === 'string' && item.title ? ` ${item.title}` : '';
        bodies.push(`【攻略 ${index + 1}${title}】\n${pageText.slice(0, GUIDE_BODY_SYNTHESIS_CHARS)}`);
        collected.push(`已读取攻略正文 ${pageText.slice(0, GUIDE_BODY_SYNTHESIS_CHARS).length} 字`);
        // Vision stays a first-guide-only fallback: images are the expensive
        // step, and later guides usually repeat the same trail photos. Short
        // bodies often leave the day/camp tables inside images.
        if (index === 0 && pageText.length < GUIDE_BODY_IMAGE_THRESHOLD_CHARS && Array.isArray(pageObject!.images) && pageObject!.images.length > 0 && Date.now() <= deadline && !signal.aborted) {
          const ids = (pageObject!.images as Array<{ id: number }>).slice(0, GUIDE_LIMITS.batch).map(image => image.id);
          if (ids.length) {
            const observed = await runReadTravelGuideImages({ url: guideUrl, imageIds: ids }, runContext);
            const observedObject = typeof observed === 'string' ? null : (observed as Record<string, unknown> | null);
            if (typeof observed === 'string') collected.push(`图片读取报错：${observed.slice(0, 200)}`);
            if (observedObject?.available === true && Array.isArray(observedObject.images)) {
              imageText = (observedObject.images as Array<Record<string, unknown>>).map(image => {
                const kind = typeof image.kind === 'string' ? `[${image.kind}]` : '';
                const text = typeof image.visibleText === 'string' ? image.visibleText : '';
                const notes = Array.isArray(image.observations) ? (image.observations as string[]).join('；') : '';
                return [kind, text, notes].filter(Boolean).join(' ').slice(0, 1000);
              }).join('\n').slice(0, 4000);
              collected.push('已读取攻略图片中的行程/提示信息');
            }
          }
        }
      }
      guideBody = bodies.join('\n\n').slice(0, GUIDE_EVIDENCE_TOTAL_CHARS);
      if (bodies.join('\n\n').length > GUIDE_EVIDENCE_TOTAL_CHARS) collected.push('攻略正文总量已按综合阶段预算截断');
    }
    evidence.push({ name, catalog, carried: null, results, guideBody, imageText, collected, error: null });
  } catch (error) {
    if (signal.aborted) {
      evidence.push({ name, catalog, carried: null, results, guideBody, imageText, collected: collected.concat('研究阶段预算用尽'), error: null });
      return;
    }
    evidence.push({ name, catalog, carried: null, results, guideBody, imageText, collected, error: error instanceof Error ? error.message : String(error) });
  }
}

function composeResearchText(pipeline: PipelineDeps, names: string[], catalogFacts: CatalogRoute[], evidence: RouteEvidence[], previous: ResearchBrief | null): string {
  const lines: string[] = [pipeline.userInput];
  if (previous?.facts.length) lines.push(`上一轮同一目的地的已核验事实（可直接复用）：${JSON.stringify(previous.facts)}`);
  if (previous?.overnightCandidates.length) lines.push(`上一轮同一目的地已核验的过夜候选（可复用）：${JSON.stringify(previous.overnightCandidates)}`);
  if (previous?.waterAndResupply.length) lines.push(`上一轮同一目的地已核验的补水与补给（可复用）：${JSON.stringify(previous.waterAndResupply)}`);
  lines.push(`路线目录确定事实（每条路线独立使用，不要合并查询）：${JSON.stringify(catalogFacts)}`);
  const evidenceLines = evidence.map((item) => {
    const parts: string[] = [`=== 路线：${item.name} ===`];
    if (item.carried) {
      parts.push(`上一轮已核验，直接复用该条目：${JSON.stringify(item.carried)}`);
      return parts.join('\n');
    }
    parts.push(`采集情况：${item.collected.join('；') || '未采集'}`);
    if (item.error) parts.push(`采集错误：${item.error}`);
    for (const result of item.results) {
      const title = typeof result.title === 'string' ? result.title : '';
      const snippet = typeof result.snippet === 'string' ? result.snippet.slice(0, 450) : '';
      const url = typeof result.url === 'string' ? `（${result.url}）` : '';
      if (title || snippet) parts.push(`- ${[title, snippet].filter(Boolean).join('：')}${url}`);
    }
    if (item.guideBody) parts.push(`攻略正文：\n${item.guideBody}`);
    if (item.imageText) parts.push(`攻略图片观察：\n${item.imageText}`);
    return parts.join('\n');
  });
  lines.push(`系统检索证据（按路线整理；未列出的字段没有证据，写入 unresolved，不要编造）：\n${evidenceLines.join('\n\n')}`);
  lines.push('');
  lines.push('本轮只做资料综合，不保存任何数据，也不向用户提问。请输出 ResearchBrief。每个用户路线必须单独对应 routes 条目；已有路线目录事实优先保留，缺少道路接驳信息时写入 unresolved。');
  return lines.join('\n');
}

async function synthesizeResearchBrief(pipeline: PipelineDeps, signal: AbortSignal, transport: boolean, text: string): Promise<ResearchBrief> {
  const agent = pipeline.stageAgent({
    name: 'Kaipa Research',
    instructions: [researchInstructions, transport ? planningSkills.travel.body : planningSkills.hiking.body].join('\n\n'),
    tools: [],
    outputType: researchBriefSchema,
    model: pipeline.flashModel,
    stage: 'research',
    temperature: 0.2,
  });
  return await stageCall(pipeline, agent, stageInput(pipeline.agentInput, text), {
    maxTurns: 2,
    signal,
    reask: { maxTurns: 1, allowTools: false, note: '证据已足够；缺失信息写入 unresolved，不要继续搜索。' },
  }, value => researchBriefSchema.parse(value));
}

// Model-free degradation: the collected evidence already carries the catalog
// facts and everything the search/read tools returned, so a failed synthesis
// never loses the run.
export function deterministicBrief(pipeline: PipelineDeps, evidence: RouteEvidence[]): ResearchBrief {
  const facts: Array<{ fact: string; sourceUrl: string | null }> = [];
  const routes = evidence.map((item) => {
    if (item.carried) return item.carried;
    const catalog = item.catalog;
    const summaries: string[] = [];
    for (const result of item.results) {
      const title = typeof result.title === 'string' ? result.title : '';
      const snippet = typeof result.snippet === 'string' ? result.snippet.slice(0, 450) : '';
      const fact = [title, snippet].filter(Boolean).join('：').slice(0, 500);
      if (!fact) continue;
      if (snippet) summaries.push(snippet);
      if (facts.length < 30) facts.push({ fact, sourceUrl: typeof result.url === 'string' ? result.url : null });
    }
    const budgetGap = item.collected.includes('研究阶段预算不足，未检索') || item.collected.includes('研究阶段预算用尽');
    const unresolved = [
      item.error ? `检索出错：${item.error}` : null,
      budgetGap ? '研究阶段预算不足，该路线未完成检索' : null,
      !item.guideBody && !item.error && !budgetGap ? '攻略正文未读取，营地与补水信息未核验' : null,
    ].filter((text): text is string => Boolean(text)).slice(0, 8);
    return {
      name: item.name,
      routeId: catalog?.routeId ?? null,
      distanceKm: catalog?.distanceKm ?? null,
      hikingDays: catalog?.hikingDays ?? null,
      summary: summaries.join('；').slice(0, 800),
      sourceUrls: item.results.flatMap(result => typeof result.url === 'string' ? [result.url] : []).slice(0, 8),
      unresolved,
      start: catalog?.start ? { name: `${item.name} 起点`, ...catalog.start } : null,
      end: catalog?.end ? { name: `${item.name} 终点`, ...catalog.end } : null,
      // The named points come straight from the catalog. Synthesis aborts on
      // most runs, so this fallback is the brief the planner usually sees; a
      // brief without waypoints is a plan without overnight points or
      // endpoints.
      waypoints: catalog?.waypoints ?? [],
    };
  });
  const routeDays = routes.length > 0 && routes.every(route => Number.isInteger(route.hikingDays) && (route.hikingDays || 0) > 0)
    ? routes.reduce((sum, route) => sum + (route.hikingDays || 0), 0)
    : null;
  const incomplete = routes.some(route => route.unresolved.length > 0);
  return researchBriefSchema.parse({
    destination: pipeline.task.decision.destination || '',
    routes,
    facts,
    unresolved: incomplete ? ['资料搜集阶段未能完成全部核验，以下规划不得把缺失信息当作已确认事实。'] : [],
    suggestedDays: routeDays,
    durationBasis: routeDays != null ? '由路线目录 GPX 徒步时长推算，未含路线间交通与缓冲。' : '',
  });
}

async function runResearch(pipeline: PipelineDeps, signal: AbortSignal, transport: boolean): Promise<ResearchBrief> {
  const names = destinationNames(pipeline.task.decision.destination);
  const catalogFacts = await loadCatalogFacts(pipeline, names);
  const previous = await findRecentBrief(pipeline, names);
  if (previous && names.every(name => isResolvedRoute(previous.routes.find(route => route.name === name)))) {
    // Same destination recently researched with every requested route
    // resolved: route facts have not changed, so reuse the brief wholesale.
    return bindCatalogFacts(previous, catalogFacts);
  }
  // When every requested route already has a recorded track with named points,
  // the deterministic brief carries everything planning uses: route ids, GPX
  // day counts and the waypoints overnight points are chosen from. The
  // synthesis then only rewrites that into prose, at a measured ~2 minutes per
  // run against a schema it has never once returned inside its budget, so it is
  // skipped. A route without recorded geometry still takes the full path: there
  // the guide text is the only overnight evidence available.
  const covered = catalogCoversPlanning(names, catalogFacts);
  // Guide reading stays: its bodies are what keeps a route entry "resolved" for
  // cross-run reuse, and they are cache-backed. Only the synthesis call is
  // skipped, because it rewrites evidence the plan already has.
  const evidence = await collectRouteEvidence(pipeline, signal, names, catalogFacts, previous);
  const deterministic = bindCatalogFacts(deterministicBrief(pipeline, evidence), catalogFacts);
  if (covered) return deterministic;
  try {
    return bindCatalogFacts(await synthesizeResearchBrief(pipeline, signal, transport, composeResearchText(pipeline, names, catalogFacts, evidence, previous)), catalogFacts);
  } catch (error) {
    // Search providers and guide readers are external dependencies, and the
    // synthesis call may miss the stage budget. The deterministic brief below
    // keeps the collected evidence as an explicitly incomplete handoff, so
    // transport and planning can still explain the gaps instead of retrying
    // the whole stage for minutes.
    console.warn('[AppAgent] research synthesis failed, falling back to the deterministic brief', (error instanceof Error ? error.message : String(error)).slice(0, 600));
    return deterministic;
  }
}
async function runTransport(pipeline: PipelineDeps, signal: AbortSignal, research: ResearchBrief | null): Promise<TransportPlan> {
  // Route-to-route mountain transport is not a live rail/flight booking
  // problem. Keep this handoff deterministic: the plan stage receives explicit
  // unknown legs instead of waiting on another model/tool loop that may ignore
  // cancellation after an external search returns.
  void signal;
  void signal;
  const names = (pipeline.task.decision.destination || '').split(/[、，,;/；|]/).map(name => name.trim()).filter(Boolean);
  const routes = names.map((name) => research?.routes.find((route) => route.name === name)).filter(Boolean) as ResearchBrief['routes'];
  return transportPlanSchema.parse({
    segments: names.slice(1).map((name, index) => ({
      fromRoute: names[index], toRoute: name, from: names[index], to: name,
      mode: 'unknown', durationMinutes: null, overnightRequired: false, verified: false,
      sourceUrl: null, note: '路线起终点已从 GPX 读取，道路接驳时间待核实',
      fromLocation: routes[index]?.end,
      toLocation: routes[index + 1]?.start,
    })),
    totalTransportMinutes: null,
    recommendedDays: null,
    basis: '当前任务不安排往返大交通；路线间接驳需要根据实际起终点和当地车辆确认。',
    unresolved: ['路线间交通起终点和耗时尚未核实，不将铁路或航班结果代替山路接驳。'],
  });
}

async function runPlan(pipeline: PipelineDeps, signal: AbortSignal, research: ResearchBrief | null, transport: boolean, transportPlan: TransportPlan | null): Promise<PlanDocument> {
  const domain = pipeline.task.decision.domain ?? 'general';
  const skill = domain === 'transport' ? planningSkills.travel
    : domain === 'packing' ? planningSkills.packing
    : domain === 'routes' ? planningSkills.routes
    : planningSkills.hiking;
  const agent = pipeline.stageAgent({
    name: 'Kaipa Planner',
    instructions: [planInstructions, skill.body].join('\n\n'),
    tools: transport ? [...planTools, reviewTransport] : planTools,
    outputType: planDocumentModelSchema,
    // The research handoff and server snapshot already contain the expensive
    // evidence. Keep the long-form planner on the bounded model so a slow main
    // model cannot consume the whole worker lease after research completes.
    model: pipeline.flashModel,
    stage: 'plan',
    temperature: 0.25,
  });
  const effectiveDays = pipeline.task.decision.days ?? pipeline.task.decision.derivedDays;
  const text = `${planStageText(pipeline, research, transportPlan, effectiveDays)}\n\n本轮只输出一份 PlanDocument，不保存任何数据。只使用上面的检索结果与已核验上下文；没有证据的内容写入 unverified，不要编造。`;
  // The initial plan has the verified journey snapshot and research handoff.
  // A rejected structured output must be repaired from that evidence in one
  // short no-tool turn; allowing another read loop can exceed the Edge
  // Runtime wall-clock limit and leave the whole run unfinished.
  const startedAt = Date.now();
  try {
    // Three turns leave room for one exploration call plus the document; at two
    // a planner that reads before writing ran out of turns and lost the run.
    const plan = await stageCall(pipeline, agent, text, { maxTurns: 3, signal, reask: { maxTurns: 1, allowTools: false, note: '只根据上一轮已有证据修正字段并立即输出完整 PlanDocument，不要调用工具。' } }, value => finalizePlan(value, pipeline, research, transportPlan, effectiveDays));
    // A document that parses but carries no day content would save an empty
    // plan. Refine day by day while the stage budget still has room; the
    // transport domain relies on the reviewTransport tool loop that chunks
    // cannot reproduce, so it keeps the single-shot result.
    if (plan.itineraryItems.length === 0 && plan.journey != null && effectiveDays != null && plan.pendingQuestion == null && !transport) {
      console.warn('[AppAgent] plan parsed with no itinerary items, refining day by day');
      return chunkedPlan(pipeline, signal, research, transportPlan, effectiveDays, plan, startedAt);
    }
    return plan;
  } catch (error) {
    if (signal.aborted || transport) {
      console.warn('[AppAgent] plan generation unavailable, keeping a resumable partial result', error instanceof Error ? error.message : error);
      return fallbackPlan(pipeline, research, effectiveDays);
    }
    console.warn('[AppAgent] single-shot plan rejected, retrying as chunked refinement', error instanceof Error ? error.message : error);
    return chunkedPlan(pipeline, signal, research, transportPlan, effectiveDays, null, startedAt);
  }
}

function normalizeOptionalPlanFields(candidate: unknown): string[] {
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return [];
  const record = candidate as Record<string, unknown>;
  if (Array.isArray(record.itineraryItems)) {
    record.itineraryItems = record.itineraryItems.map(item => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) return item;
      const normalized = { ...(item as Record<string, unknown>) };
      for (const key of ['timeStart', 'timeEnd', 'transport']) if (normalized[key] == null) delete normalized[key];
      return normalized;
    });
  }
  if (Array.isArray(record.endpoints)) {
    record.endpoints = record.endpoints.map(endpoint => {
      if (!endpoint || typeof endpoint !== 'object' || Array.isArray(endpoint)) return endpoint;
      const normalized = { ...(endpoint as Record<string, unknown>) };
      for (const key of ['waypointIndex', 'trackFinish', 'endDistanceKm', 'locationName', 'estimateBasis', 'userDistanceQuote']) {
        if (normalized[key] == null) delete normalized[key];
      }
      const review = normalized.overnightReview;
      if (review == null || !overnightReviewSchema.safeParse(review).success) delete normalized.overnightReview;
      return normalized;
    });
    // A day the planner could not locate is emitted as a bare day name, which
    // the endpoint tool rejects outright ("choose waypointIndex, trackFinish or
    // an explicit endDistanceKm"). Dropping those entries cannot lose
    // information, and rejecting the whole save for them cost a run its
    // itinerary; the affected days are disclosed as unverified instead.
    const dropped: string[] = [];
    record.endpoints = (record.endpoints as unknown[]).filter(endpoint => {
      if (!endpoint || typeof endpoint !== 'object' || Array.isArray(endpoint)) return true;
      const entry = endpoint as Record<string, unknown>;
      if (entry.waypointIndex != null || entry.trackFinish === true || entry.endDistanceKm != null) return true;
      if (typeof entry.day === 'string' && entry.day) dropped.push(entry.day);
      return false;
    });
    return dropped;
  }
  return [];
}

// Composes the shared evidence preamble for every plan-shaped call: user
// message, research handoff, transport facts and the decision-stage facts the
// planner copies into journey instead of re-deriving through tool calls.
function planStageText(pipeline: PipelineDeps, research: ResearchBrief | null, transportPlan: TransportPlan | null, effectiveDays: number | null): string {
  const facts = pipeline.task.decision;
  return [
    pipeline.userInput,
    research ? `\n上一阶段检索结果（ResearchBrief，事实来源）：${JSON.stringify(research)}` : '',
    transportPlan ? `\n独立交通阶段结果（TransportPlan，路线之间的交通事实）：${JSON.stringify(transportPlan)}` : '',
    `\n任务状态已确认的事实（需求解释阶段已核对，journey 字段直接采用）：目的地=${facts.destination ?? '无'}；出发日期=${facts.plannedDate ?? (facts.dateUndecided ? '未定' : '无')}；用户指定天数=${facts.days ?? '无'}；系统根据路线与中转推算天数=${facts.derivedDays ?? '无'}；本次编排采用天数=${effectiveDays ?? '无'}；轨迹文件名=${facts.trackAttachmentName ?? '无'}。`,
  ].join('\n');
}

// Shared post-processing for every plan-shaped output: deterministic duration
// fill, optional-field normalization, estimate annotation, journey-null guard
// and endpoint-gap disclosure. strictJourney turns a null journey into a
// concrete issue so the repair re-ask fills it; the chunked merge passes
// false because its structure was already validated there.
export function finalizePlan(candidate: unknown, pipeline: PipelineDeps, research: ResearchBrief | null, transportPlan: TransportPlan | null, effectiveDays: number | null, options: { strictJourney?: boolean; endpointGap?: boolean } = {}): PlanDocument {
  const strictJourney = options.strictJourney ?? true;
  const value = candidate && typeof candidate === 'object' && !Array.isArray(candidate)
    ? { ...(candidate as Record<string, unknown>) }
    : candidate;
  const candidateJourney = value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>).journey
    : null;
  // A missing estimate must not invalidate an otherwise complete plan: when
  // the task facts already pin the duration, fill it deterministically before
  // schema parsing so the provider's null/0 shorthand cannot trigger a slow
  // repair turn that re-reads context without adding evidence.
  if (value && typeof value === 'object' && !Array.isArray(value)
    && candidateJourney && typeof candidateJourney === 'object' && !Array.isArray(candidateJourney)
    && ((candidateJourney as Record<string, unknown>).days == null
      || (typeof (candidateJourney as Record<string, unknown>).days === 'number'
        && Number((candidateJourney as Record<string, unknown>).days) < 1))) {
    if (effectiveDays != null && Number(effectiveDays) >= 1) {
      (candidateJourney as Record<string, unknown>).days = Number(effectiveDays);
    } else {
      (value as Record<string, unknown>).journey = null;
      if (!(value as Record<string, unknown>).pendingQuestion) {
        (value as Record<string, unknown>).pendingQuestion = '路线资料已整理，但暂时无法可靠推算总天数；请确认按建议天数规划，或补充总天数。';
      }
    }
  }
  const unlocatableEndpoints = normalizeOptionalPlanFields(value);
  const plan = planDocumentSchema.parse(value);
  // One journey binds one track. A day on any other route has no position on
  // it, and sending that day's index anyway produced a decreasing sequence
  // ("endpoints must increase along the itinerary"), which failed the whole
  // save. The planner still names those days' overnight points in the item
  // titles; only the track-bound endpoint is dropped.
  const unknownRouteEndpoints = endpointDaysWithUnknownRoute(plan, research);
  if (unknownRouteEndpoints.length) {
    plan.endpoints = plan.endpoints.filter(endpoint => !unknownRouteEndpoints.includes(endpoint.day));
    plan.unverified = [...plan.unverified, `${unknownRouteEndpoints.join('、')} 的终点标注了本次没有核对到的路线，这些日期的累计里程终点未保存，避免被当成绑定轨迹上的位置。`].slice(0, 30);
  }
  if (unlocatableEndpoints.length) {
    plan.unverified = [...plan.unverified, `${unlocatableEndpoints.join('、')} 的徒步终点没有给出可核验的轨迹标注点或累计里程，本轮的这些终点未保存。`].slice(0, 30);
  }
  if ((transportPlan?.recommendedDays ?? research?.suggestedDays) != null) {
    const estimateDays = transportPlan?.recommendedDays ?? research?.suggestedDays;
    const basis = transportPlan?.basis || research?.durationBasis || '已核验路线时长与路线衔接信息';
    const estimate = `系统按路线徒步时长、中转与必要缓冲估算 ${estimateDays} 天：${basis}`;
    if (!plan.assumptions.some(item => item.includes('系统按路线徒步时长'))) {
      plan.assumptions = [...plan.assumptions, estimate].slice(0, 12);
    }
  }
  // A plan that drops the journey without a bound one and without a stated
  // reason would silently save nothing; surface it as a concrete issue so the
  // re-ask either fills the journey or records a blocker.
  if (plan.journey === null && !boundJourneyId(pipeline.context) && !plan.blocker && !plan.pendingQuestion) {
    if (effectiveDays == null) {
      plan.pendingQuestion = '路线建议已经整理好，但无法从现有路线资料可靠推算总天数。请补充总天数或更完整的轨迹资料。';
    } else if (strictJourney) {
      throw { issues: [{ path: ['journey'], message: '不能为 null：任务事实已确认时填写旅程，确有缺漏则写入 blocker 或 pendingQuestion 说明原因' }] };
    } else {
      plan.pendingQuestion = '旅程结构未能确定，已保留本轮生成的行程内容；请在补充信息后重试。';
    }
  }
  if (options.endpointGap === false) return plan;
  const journeyId = pipeline.context.currentJourneyId;
  const track = journeyId
    ? pipeline.context.dataContext?.snapshots[`${journeyId}:track`]?.data.trackSummary
    : undefined;
  const requiredDays = Number(effectiveDays || (pipeline.context.dataContext?.snapshots[`${journeyId || ''}:journey`]?.data.journey as { total_days?: number } | undefined)?.total_days || 0);
  if (pipeline.task.decision.fullHikingPlan && track && requiredDays > 0 && plan.endpoints.length < requiredDays && !plan.blocker && !plan.pendingQuestion) {
    const endpointGap = `已读取有效轨迹，但目前只能确认 ${plan.endpoints.length}/${requiredDays} 个徒步日终点；未确认的终点不会被编造，保存后仍需核实。`;
    plan.unverified = [...plan.unverified, endpointGap].slice(0, 30);
  }
  return plan;
}

// Long-output fallback for the plan stage: outline first, then one call per
// day group. Each small output fits the provider limit that rejected the
// single-shot document, and a failed group costs only its own days.
const PLAN_CHUNK_DAYS = 5;
const PLAN_CHUNK_RESERVE_MS = 8_000;

async function chunkedPlan(pipeline: PipelineDeps, signal: AbortSignal, research: ResearchBrief | null, transportPlan: TransportPlan | null, effectiveDays: number | null, base: PlanDocument | null, startedAt: number): Promise<PlanDocument> {
  const factsText = planStageText(pipeline, research, transportPlan, effectiveDays);
  // The merge below must finish inside the plan stage budget.
  const deadline = startedAt + STAGE_BUDGETS.plan - PLAN_CHUNK_RESERVE_MS;
  // A parsed-but-empty single-shot already validated the structure, so only
  // a rejected one needs the outline call.
  let structure: PlanDocument;
  let dayNames: string[];
  if (base) {
    structure = base;
    dayNames = Array.from({ length: base.journey?.days ?? 0 }, (_, index) => `Day ${index + 1}`);
  } else {
    try {
      const skeletonAgent = pipeline.stageAgent({
        name: 'Kaipa Planner Outline',
        instructions: planSkeletonInstructions,
        tools: [],
        outputType: planSkeletonSchema,
        model: pipeline.flashModel,
        stage: 'plan',
        temperature: 0.25,
      });
      const outline = await stageCall(pipeline, skeletonAgent, `${factsText}\n\n先输出不含 itineraryItems 与 endpoints 的 PlanSkeleton 骨架，dayNames 必须与 journey.days 一致；不要调用工具。`, { maxTurns: 1, signal, reask: { maxTurns: 1, allowTools: false, note: '只修正骨架字段并立即输出 PlanSkeleton JSON，不要调用工具。' } }, value => {
        const doc = finalizePlan(value, pipeline, research, transportPlan, effectiveDays, { endpointGap: false });
        const raw = value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>).dayNames : undefined;
        return { doc, dayNames: Array.isArray(raw) ? raw.filter((name): name is string => typeof name === 'string' && name.length >= 1 && name.length <= 40).slice(0, 40) : [] };
      });
      structure = outline.doc;
      dayNames = outline.dayNames;
    } catch (error) {
      console.warn('[AppAgent] plan skeleton unavailable, keeping the degraded plan', error instanceof Error ? error.message : error);
      return fallbackPlan(pipeline, research, effectiveDays);
    }
  }
  if (!dayNames.length && structure.journey?.days) {
    dayNames = Array.from({ length: structure.journey.days }, (_, index) => `Day ${index + 1}`);
  }
  if (!dayNames.length) return structure;
  const chunkAgent = pipeline.stageAgent({
    name: 'Kaipa Planner Day Chunk',
    instructions: planChunkInstructions,
    tools: [],
    outputType: planChunkSchema,
    model: pipeline.flashModel,
    stage: 'plan',
    temperature: 0.25,
  });
  const frame = JSON.stringify({
    journey: structure.journey,
    schedule: structure.schedule,
    transport: structure.transport,
    packingProfile: structure.packingProfile,
  });
  const collected: PlanChunk[] = [];
  const gapDays: string[] = [];
  for (let index = 0; index < dayNames.length; index += PLAN_CHUNK_DAYS) {
    const days = dayNames.slice(index, index + PLAN_CHUNK_DAYS);
    if (signal.aborted || Date.now() > deadline) { gapDays.push(...days); continue; }
    try {
      const chunk = await stageCall(pipeline, chunkAgent, `${factsText}\n\n整体框架（已确定，只作参考，不要重复输出这些字段）：${frame}\n\n本组只编排以下日期：${days.join('、')}。其余日期由其他轮次处理。`, { maxTurns: 1, signal, reask: { maxTurns: 1, allowTools: false, note: '只修正本组字段并立即输出 PlanChunk JSON，不要调用工具。' } }, value => planChunkSchema.parse(value));
      collected.push(chunk);
    } catch (error) {
      console.warn(`[AppAgent] plan chunk failed for days ${days.join(', ')}`, error instanceof Error ? error.message : error);
      gapDays.push(...days);
    }
  }
  const merged = finalizePlan({
    journey: structure.journey,
    mapLocation: structure.mapLocation,
    schedule: structure.schedule,
    transport: structure.transport,
    packingProfile: structure.packingProfile,
    assumptions: structure.assumptions,
    unverified: structure.unverified,
    blocker: structure.blocker,
    pendingQuestion: structure.pendingQuestion,
    itineraryItems: collected.flatMap(chunk => chunk.itineraryItems).slice(0, 80),
    endpoints: collected.flatMap(chunk => chunk.endpoints).slice(0, 30),
  }, pipeline, research, transportPlan, effectiveDays, { strictJourney: false });
  if (gapDays.length) {
    merged.unverified = [...merged.unverified, `${gapDays.join('、')} 的行程细节未能在本轮生成，其余天数已保留；请补充信息或继续规划。`].slice(0, 30);
  }
  return merged;
}

// Every day of a multi-route trip is measured on its own route's track, so an
// endpoint tagged with a route the research handoff knows about is resolved
// there. An endpoint tagged with an id nothing matched is the one case a write
// cannot interpret: it would silently resolve on the journey's bound track and
// place the day somewhere it is not.
export function endpointDaysWithUnknownRoute(plan: PlanDocument, research: ResearchBrief | null): string[] {
  const known = new Set<string>([...(research?.routes || []).flatMap(route => route.routeId ? [route.routeId] : [])]);
  if (plan.journey?.routeId) known.add(plan.journey.routeId);
  return [...new Set(plan.endpoints.flatMap(endpoint => endpoint.routeId && !known.has(endpoint.routeId) ? [endpoint.day] : []))];
}

// The deterministic fallback keeps the journey and the research handoff so the
// next turn can continue, but it carries no daily plan. Saying so plainly is
// the whole point: the raw failure (a rejected schema, an expired stage budget)
// belongs in the worker log and in the stage row, never in user-facing text.
export function planDegradeReason(plan: PlanDocument, hasBoundJourney = false): string | null {
  // Every write is journey-scoped, so a plan that names no journey saves
  // nothing at all. It looked complete because it carried itinerary items,
  // which is how a run reported success after writing zero rows.
  if (!plan.journey && !hasBoundJourney && plan.itineraryItems.length > 0) {
    return 'plan produced itinerary items without a journey to save them to; see the worker log for the rejected journey fields';
  }
  if (plan.itineraryItems.length > 0) return null;
  // No itinerary was produced, so the stage is incomplete however it got here.
  // The reason distinguishes stopping to ask from failing, because only the
  // latter needs the worker log.
  if (plan.pendingQuestion && !plan.blocker) return 'plan stage stopped to ask the user before producing any itinerary items';
  return plan.journey
    ? 'plan stage produced no itinerary items, so only the journey was saved; see the worker log for the rejected output'
    : 'plan stage produced neither a journey nor itinerary items; see the worker log for the rejected output';
}

export function fallbackPlan(pipeline: PipelineDeps, research: ResearchBrief | null, effectiveDays: number | null): PlanDocument {
  const decision = pipeline.task.decision;
  const canCreate = !boundJourneyId(pipeline.context) && Boolean(decision.destination && effectiveDays);
  return planDocumentSchema.parse({
    journey: canCreate ? {
      name: decision.destination,
      region: '',
      plannedDate: decision.plannedDate,
      days: effectiveDays,
      trackAttachmentName: decision.trackAttachmentName,
    } : null,
    itineraryItems: [], endpoints: [], mapLocation: null, schedule: null, transport: null,
    packingProfile: null,
    assumptions: effectiveDays ? [`系统根据已核验路线时长推算 ${effectiveDays} 天`] : [],
    unverified: [...(research?.unresolved || []), '详细日程未能在本轮生成：本轮的编排输出没有通过校验或超出了阶段时间预算，已保留路线研究与可恢复进度，尚未编造任何日程内容。'].slice(0, 30),
    blocker: '详细日程未能在本轮生成，已保留路线研究与可恢复进度。',
    pendingQuestion: effectiveDays ? null : '暂时无法可靠推算总天数，请补充计划天数。',
  });
}

async function runSave(pipeline: PipelineDeps, signal: AbortSignal, plan: PlanDocument, research: ResearchBrief | null): Promise<SaveArtifact> {
  const artifact = await runSaveStage(pipeline.client, pipeline.context, plan);
  if (!artifact.failed.length) return artifact;
  if (artifact.skipped.some(entry => entry.reason === 'journey_create_failed')) return artifact;
  const patched = await repairPlan(pipeline, signal, plan, artifact, research);
  if (!patched) return artifact;
  // Already-saved operations are pinned to the arguments that produced their
  // receipts, so the repair round can only change what actually failed.
  const merged = mergeSavedOperations(plan, patched, artifact);
  const retried = await runSaveStage(pipeline.client, pipeline.context, merged);
  return { ...retried, repaired: true };
}

async function repairPlan(pipeline: PipelineDeps, signal: AbortSignal, plan: PlanDocument, artifact: SaveArtifact, research: ResearchBrief | null): Promise<PlanDocument | null> {
  try {
    const agent = pipeline.stageAgent({
      name: 'Kaipa Planner Repair',
      instructions: [planInstructions, planRepairInstructions].join('\n\n'),
      tools: planTools,
      outputType: planDocumentModelSchema,
      model: pipeline.model,
      stage: 'plan',
      temperature: 0.25,
    });
    const text = [
      pipeline.userInput,
      research ? `\n检索结果（ResearchBrief）：${JSON.stringify(research)}` : '',
      `\n上一版 PlanDocument：${JSON.stringify(plan)}`,
      `\n保存结果：已成功 ${JSON.stringify(artifact.saved.map(entry => entry.tool))}；失败 ${JSON.stringify(artifact.failed)}。`,
      '',
      '只修正失败的操作，输出完整的修补后 PlanDocument。已成功的操作必须原样保留，不要改动它们的参数。',
    ].join('\n');
    return stageCall(pipeline, agent, text, { maxTurns: 6, signal }, value => {
      const candidate = value && typeof value === 'object' && !Array.isArray(value)
        ? { ...(value as Record<string, unknown>) }
        : value;
      const journey = candidate && typeof candidate === 'object' && !Array.isArray(candidate)
        ? (candidate as Record<string, unknown>).journey
        : null;
      if (journey && typeof journey === 'object' && !Array.isArray(journey)
        && (journey as Record<string, unknown>).days == null) {
        (candidate as Record<string, unknown>).journey = plan.journey;
      }
      normalizeOptionalPlanFields(candidate);
      return planDocumentSchema.parse(candidate);
    });
  } catch (error) {
    console.warn('[AppAgent] plan repair unavailable', error instanceof Error ? error.message : error);
    return null;
  }
}

// Pins every already-saved section back to the original document.
function mergeSavedOperations(original: PlanDocument, patched: PlanDocument, artifact: SaveArtifact): PlanDocument {
  const saved = new Set(artifact.saved.map(entry => entry.tool));
  return {
    ...patched,
    journey: saved.has('create_journey') ? original.journey : patched.journey,
    schedule: saved.has('update_journey_schedule') ? original.schedule : patched.schedule,
    itineraryItems: saved.has('add_itinerary_items') ? original.itineraryItems : patched.itineraryItems,
    endpoints: saved.has('set_itinerary_group_endpoints') ? original.endpoints : patched.endpoints,
    mapLocation: saved.has('set_journey_map_location') ? original.mapLocation : patched.mapLocation,
  };
}

async function runRespond(pipeline: PipelineDeps, signal: AbortSignal, results: {
  plan: PlanDocument;
  save: SaveArtifact | null;
  packing: PackingArtifact | null;
}): Promise<unknown> {
  void pipeline;
  void signal;
  const saved = results.save?.saved.map(entry => entry.tool) || [];
  const failed = results.save?.failed || [];
  const packingFailed = results.packing && !['committed', 'skipped'].includes(results.packing.status);
  const complete = saved.length > 0 && failed.length === 0 && !results.plan.blocker && !packingFailed;
  return assistantOutput.parse({
    text: complete ? '行程规划已完成并保存。' : '已保留本轮能够确认的规划结果，未完成部分可以继续补齐。',
    pendingQuestion: results.plan.pendingQuestion,
    blocker: results.plan.blocker || (failed.length ? '部分规划内容保存失败。' : packingFailed ? '装备清单尚未完整生成。' : null),
    offerJourneyExtras: complete,
    travelContext: null,
  });
}

const researchInstructions = `你是 Kaipa 的资料综合阶段：系统已完成确定性检索，你只负责把检索证据整理成 ResearchBrief。没有搜索工具，不要尝试搜索，也不要向用户提问。
每个用户选择的路线都必须有一条独立研究条目：优先保留路线目录确定事实（routeId、距离、徒步天数、起终点），再根据系统检索证据填写 summary、sourceUrls 与 unresolved。证据不足时保留条目并填写 unresolved，不要为了凑齐资料编造内容。
overnightCandidates 只能来自检索证据中真实出现的过夜/营地描述（攻略正文或图片观察），并记录 guideSourceUrl 与 guideQuote；没有证据就不要填写。区分攻略与轨迹标注点提供的候选过夜位置，不要凭距离或时长平均分配。
routes[].waypoints 由系统从路线 GPX 标注点填充，你必须输出空数组，不要编造任何标注点；编排阶段会拿到系统填充后的完整列表。
facts 逐条记录事实与其来源链接；无法核实的写入 unresolved。
当用户没有提供总天数时，综合已核验的各路线徒步天数、必要住宿转换和安全缓冲，输出 suggestedDays（1-30 的整数）以及 durationBasis；只能基于检索证据估算；证据不足时两者留空，并把缺口写入 unresolved。
输出只包含 ResearchBrief 结构化结果。`;

const planInstructions = `你是 Kaipa 的行程编排阶段，只做只读查询并输出方案，不保存任何数据，也不向用户提问。
工具调用轮次有限，最后一轮必须直接输出 PlanDocument JSON，不允许用文字代替。
上面的 ResearchBrief 与已确认事实就是本轮的主要依据，直接据此编排即可。只有确实需要当前旅程或轨迹数据时才调用只读工具，且最多调用一次；未绑定旅程、轨迹已在 ResearchBrief 里时不要调用工具，更不要用工具结果缺失当作没有证据的理由。
硬性约束：
- journey 字段只能填写任务状态里已确认的事实（目的地、日期、天数、轨迹文件名）。用户未填写日期时可保持 plannedDate=null；用户未填写天数时，若 ResearchBrief 提供了有依据的 suggestedDays，则使用系统推算天数创建，并在 assumptions 中说明依据，不要追问用户。
- planProfile 之外的行程与装备判断都写入 itineraryItems 与 endpoints。
- 多日徒步：先确定真实轨迹上的过夜点，再据此推导当日里程；禁止按天数或时长平均分配；每天一个终点。
- 多路线旅程中，每个徒步 activity itineraryItem 必须填写对应 ResearchBrief.routes 的 routeId，确保每条已有 GPX 独立绑定；交通项 routeId=null。
- ResearchBrief.routes.hikingDays 是根据 GPX 录制时长得到的确定日数；每条路线必须连续生成相同数量的徒步日，不能用“待核实”自定义项占位。
- ResearchBrief.routes.waypoints 是该路线 GPX 上的真实标注点（按轨迹顺序，含累计里程 distanceKm 与原始序号 index）。过夜点与每日终点只能从这些标注点中选择，并在 itineraryItems 的 title 里写出标注点名称与累计里程；禁止按天数或时长平均分配，也不要编造标注点里没有的地名或里程。
- endpoints 每项必须给出 waypointIndex、trackFinish=true 或明确的 endDistanceKm 之一；无法定位的日期不要为它输出空条目（只有 day 的条目会被拒绝），改为把缺口写入 unverified。
- 一次出行可以走多条路线（走完 A 再走 B）。每个徒步日的终点必须填写 routeId，指向该天所属路线的目录 ID；该天的 waypointIndex 与累计里程按**这条路线自己的轨迹**解析，不同路线各自从 0 开始，不需要跨路线递增。
- 纯接驳、住宿或休整日不属于任何路线：不要为它们输出终点条目，把地点与安排写在 itineraryItems 里。
- journey.routeId 绑定第一条路线的目录 ID（若提供了轨迹文件名则优先与它匹配的那条）。
- 交通接驳段作为普通 itineraryItems 记录，不要为交通单独设置徒步日终点；交通项必须 kind=transport，并填写 transport.from、transport.to、mode 和 status。只有检索结果提供了坐标或导航 geometry 时才填写对应字段，否则保留地点名称并将 status 设为 unknown，不能编造路线。
- 没有证据的内容写入 unverified，不要编造时间、价格、水源或营地。
- 无法完成的部分用 blocker 说明具体原因，需要用户决定时用 pendingQuestion，并把已经能确定的部分照常输出。
输出只包含 PlanDocument 结构化结果。`;

const planRepairInstructions = `这是同一次任务的修复轮。上一轮保存时部分操作校验失败，请只修正失败的部分。
工具调用最多 6 轮，最后一轮必须直接输出修补后的 PlanDocument JSON，不允许用文字代替。
已经被校验拒绝的字段必须换成真实数据或删除该操作；不要用重复调用绕过校验，不要改动已经成功保存的操作。`;

const planSkeletonInstructions = `你是 Kaipa 的行程编排骨架轮，只做只读编排并输出方案，不保存任何数据，也不向用户提问。不要调用工具，直接依据上面已核验的事实输出。
先输出不含 itineraryItems 与 endpoints 的 PlanSkeleton 骨架：确定 journey、mapLocation、schedule、transport、packingProfile、assumptions、unverified、blocker、pendingQuestion，并给出 dayNames（按顺序列出全部行程日，如 Day 1、Day 2，必须与 journey.days 一致）。
硬性约束与完整编排轮相同：journey 字段只能填写任务状态里已确认的事实（目的地、日期、天数、轨迹文件名），多路线旅程绑定第一条路线的目录 ID；用户未填写天数时，若 ResearchBrief 提供了有依据的 suggestedDays，则使用系统推算天数并在 assumptions 中说明依据，不要追问；没有证据的内容写入 unverified，不要编造；无法完成的部分用 blocker 说明具体原因，需要用户决定时用 pendingQuestion。
dayNames 无法确定时留空并写入 blocker 或 pendingQuestion。只输出 PlanSkeleton 结构化结果。`;

const planChunkInstructions = `你是 Kaipa 的行程编排逐日细化轮，只做只读编排并输出方案，不保存任何数据，也不向用户提问。不要调用工具，只依据本轮提供的 ResearchBrief、TransportPlan、整体框架与已核验事实编排。
系统把全部天数分成若干组，你只负责其中一组：只输出该组覆盖天数的 itineraryItems 与 endpoints，不要输出其他天，也不要输出旅程、交通或装备框架字段。
硬性约束与完整编排轮相同：多日徒步只能从 ResearchBrief.routes.waypoints（该路线 GPX 的真实标注点，含累计里程）中选择过夜点与每日终点，禁止按天数或时长平均分配，禁止编造标注点里没有的地名或里程，每天一个终点，endpoints 只填本组徒步日；每个徒步日终点必须填 routeId（该天所属路线），waypointIndex 与里程按该路线自己的轨迹解析、各自从 0 开始；endpoints 每项必须给出 waypointIndex、trackFinish=true 或明确的 endDistanceKm 之一，无法定位的日期不要输出空条目，改为写入 unverified；纯接驳/住宿日不设终点；多路线旅程中每个徒步 activity itineraryItem 必须填写对应 ResearchBrief.routes 的 routeId，交通项 routeId=null；交通接驳段必须 kind=transport 并填写 transport.from、transport.to、mode 和 status，没有坐标时 status=unknown；没有证据的时间、价格、水源或营地不要编造，缺少证据的条目宁可省略。
只输出 PlanChunk 结构化结果。`;

const packingInstructions = `你是 Kaipa 的装备清单阶段，只输出一份完整的个人清单草稿，不保存任何数据。
依据行程、攻略事实与个人需求估算判断住宿、补水、餐食与天气条件；未知项填 unknown。
清单中路餐与补给的总热量（estimatedEnergyKcalPerUnit × quantity）必须落在个人需求估算的 carriedFoodEnergyKcal 区间内，不要明显超出；mealPreparation 为 provided 时清单不含正餐，只带少量补给零食。
只输出结构化结果，不要解释计算过程，也不要输出用户可见的说明文字。`;

const packingRepairInstructions = `这是同一份装备清单草稿的修复轮。只针对给出问题的条目提交补丁，不要重新生成整份清单。
补丁中 changes 只能使用给出的稳定 ID，additions 用于补齐缺失类别，removals 用于删除多余的条目（例如超出热量目标的正餐）。`;

const respondInstructions = `你是 Kaipa 的回复阶段。没有工具，不能保存数据。
根据"实际保存结果"如实回复：已保存的部分说明清楚，跳过或失败的部分照实说明原因，不要把未保存的方案描述成已经保存。
text 是显示给用户的主要中文正文，简洁、具体，不要复述工具名或内部字段。
pendingQuestion 只在确实需要用户决定时填写；blocker 只在方案因客观原因无法完成时填写具体原因。
draft 固定输出 null。travelContext 沿用已确认的交通事实，本轮确认了新的出发地、返回地、方向、偏好或票务时写入更新值，否则输出 null。
offerJourneyExtras 仅当完整徒步核心计划（旅程、行程、每日终点）全部保存且没有待决问题时为 true，其余情况为 false。
quickReplies 最多 4 条，可为空数组。`;

// Attachments are understood once, by the stage that reads sources; later
// stages receive its artifact instead of re-sending the same images. The
// research stage reuses the composed light-path input and only swaps its text,
// so attachment assembly cannot drift between the two paths.
// A stage prompt is either plain text or the composed light-path input array
// with its input_text part swapped — the latter keeps attachments available.
type AgentInput = string | Array<{ role: string; content: Array<{ type: string; text?: string }> }>;

// Stages run on in-memory sessions so a rejected structured output can re-ask
// the model with the evidence it already gathered, instead of redoing the
// whole stage at the job level.
class StageSession {
  private items: unknown[] = [];
  getSessionId(): Promise<string> { return Promise.resolve(`stage-${Math.random().toString(36).slice(2)}`); }
  getItems(limit?: number): Promise<unknown[]> {
    return Promise.resolve(limit ? this.items.slice(-limit) : [...this.items]);
  }
  addItems(items: unknown[]): Promise<void> { this.items.push(...items); return Promise.resolve(); }
  popItem(): Promise<unknown> { return Promise.resolve(this.items.pop()); }
  clearSession(): Promise<void> { this.items = []; return Promise.resolve(); }
}

function stageInput(agentInput: unknown, text: string): AgentInput {
  if (!Array.isArray(agentInput) || !agentInput.length) return text;
  const first = agentInput[0] as { role: string; content: Array<{ type: string }> } | null;
  if (!first || !Array.isArray(first.content)) return text;
  return [{ role: first.role, content: [{ type: 'input_text', text }, ...first.content.filter(part => part.type !== 'input_text')] }];
}

function aborted() {
  return {
    finalOutput: {
      text: '本次处理已停止，已经保存的内容会保留。',
      pendingQuestion: null, blocker: null, draft: null,
      quickReplies: [], offerJourneyExtras: false, travelContext: null,
    },
    aborted: true,
  };
}

type StageRow = { stage: StageName; status: string; artifact: unknown; attempt?: number };

async function loadStageState(admin: any, runId: string) {
  // A retried job writes another attempt for the same stage, so ordering is
  // what decides which artifact a resume reuses. Without it the map kept
  // whichever row the database happened to return last, which could be the
  // previous attempt's.
  const rows = await admin.from('agent_stages').select('stage,status,artifact,attempt').eq('run_id', runId).order('attempt', { ascending: true });
  if (rows.error) throw rows.error;
  const state = new Map<StageName, StageRow>();
  for (const row of (rows.data || []) as StageRow[]) state.set(row.stage, row);
  return state;
}

async function writeStage(admin: any, args: { runId: string; userId: string; stage: StageName; attempt: number; status: string; artifact?: unknown; error?: string }) {
  const written = await admin.from('agent_stages').upsert({
    run_id: args.runId, user_id: args.userId, stage: args.stage, attempt: args.attempt, status: args.status,
    artifact: args.artifact === undefined ? null : args.artifact,
    error: args.error ?? null,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'run_id,stage,attempt' });
  if (written.error) throw written.error;
}

export async function runStage<T>(deps: {
  name: StageName;
  state: Map<StageName, StageRow>;
  pipeline: PipelineDeps;
  execute: (signal: AbortSignal) => Promise<T>;
  // Returns a reason when the stage finished with a usable but incomplete
  // artifact, such as the plan stage's deterministic fallback. Persisting that
  // as 'completed' reported a fallback as a finished plan, so it gets its own
  // status; the reason is recorded in the stage's error column for operators.
  degrade?: (artifact: T) => string | null;
}): Promise<{ artifact: T | null; aborted: boolean }> {
  const { name, state, pipeline } = deps;
  const previous = state.get(name);
  // Completed and degraded rows are reused; failed and running rows belong to
  // an earlier attempt that did not get this stage done. A degraded row is
  // deliberately reused rather than re-planned: the later stages were already
  // written against its artifact, and re-running only this stage would leave
  // them pinned to the previous attempt's result.
  if (previous?.status === 'completed' || previous?.status === 'degraded') {
    return { artifact: (previous.artifact ?? null) as T | null, aborted: false };
  }
  // Also the cancellation check: cancel_run marks the run failed and the job
  // cancelled, and nothing in this invocation can be reached from outside.
  const current = await pipeline.admin.from('agent_runs').update({ stage: name }).eq('id', pipeline.runId).eq('status', 'running').select('id').maybeSingle();
  if (current.error) throw current.error;
  if (!current.data) return { artifact: null, aborted: true };
  await writeStage(pipeline.admin, { runId: pipeline.runId, userId: pipeline.userId, stage: name, attempt: pipeline.attempt, status: 'running' });
  try {
    const artifact = await deps.execute(withBudget(pipeline.signal, STAGE_BUDGETS[name]));
    const size = JSON.stringify(artifact ?? null).length;
    if (size > ARTIFACT_LIMIT_BYTES) throw new Error(`Stage ${name} artifact is too large to persist (${size} bytes)`);
    const degraded = deps.degrade?.(artifact) ?? null;
    await writeStage(pipeline.admin, {
      runId: pipeline.runId, userId: pipeline.userId, stage: name, attempt: pipeline.attempt,
      status: degraded ? 'degraded' : 'completed', artifact, error: degraded ?? undefined,
    });
    return { artifact, aborted: false };
  } catch (error) {
    await writeStage(pipeline.admin, {
      runId: pipeline.runId, userId: pipeline.userId, stage: name, attempt: pipeline.attempt, status: 'failed',
      error: (error instanceof Error ? error.message : String(error)).slice(0, 2000),
    });
    throw error;
  }
}

// Wraps the request signal so an abandoned edge execution dies with the client
// connection instead of holding locks through the next attempt.
function withBudget(signal: AbortSignal, budgetMs: number): AbortSignal {
  const timeout = AbortSignal.timeout(budgetMs);
  const anySignal = (AbortSignal as unknown as { any?: (signals: AbortSignal[]) => AbortSignal }).any;
  if (typeof anySignal === 'function') return anySignal.call(AbortSignal, [signal, timeout]);
  const controller = new AbortController();
  if (signal.aborted || timeout.aborted) {
    controller.abort(signal.aborted ? signal.reason : timeout.reason);
    return controller.signal;
  }
  signal.addEventListener('abort', () => controller.abort(signal.reason), { once: true });
  timeout.addEventListener('abort', () => controller.abort(timeout.reason), { once: true });
  return controller.signal;
}
