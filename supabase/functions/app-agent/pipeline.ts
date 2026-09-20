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
import { planDocumentSchema, planDraftFrom, researchBriefSchema, saveToolNames, transportPlanSchema, type PlanDocument, type ResearchBrief, type TransportPlan } from './plan-document.ts';
import { boundJourneyId, runSaveStage, type SaveArtifact } from './save-stage.ts';
import { contextPrompt, readJourneySections } from './context.ts';
import { runPackingStage, type PackingArtifact } from './packing-stage.ts';
import { getAppContext, getJourneyDetails, listGear, parseJsonString, readConversationHistory, readTravelGuide, readTravelGuideImages, searchJourneys, searchRoutes, searchTravelWeb } from './tools.ts';
import { reviewTransport } from './transport-tool.ts';
import { draftPatchSchema } from './packing-draft.ts';
import { packingProposalSchema } from './packing-stage.ts';
import type { TaskDecision, TaskState } from './task.ts';
import type { AgentContext } from './types.ts';

export type StageName = 'interpret' | 'research' | 'transport' | 'plan' | 'save' | 'packing' | 'respond';

// Stage budgets sum below the worker's fetch timeout and the job lease. Two
// stages are near-synchronous: interpret returns the already-prepared decision
// and save is deterministic code, so their budgets bound only the save stage's
// optional repair round, not a model loop.
export const STAGE_BUDGETS: Record<StageName, number> = {
  interpret: 60_000,
  research: 120_000,
  transport: 30_000,
  plan: 180_000,
  // Saving may need one deterministic evidence downgrade plus a complete
  // versioned write round; 30s routinely aborted valid repairs mid-flight.
  save: 60_000,
  packing: 150_000,
  respond: 90_000,
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
    pipeline.task.decision.derivedDays = transportPlan.artifact?.recommendedDays ?? research.artifact?.suggestedDays ?? null;
  }

  let plan = await runStage<PlanDocument>({
    name: 'plan', state, pipeline,
    execute: signal => runPlan(pipeline, signal, research.artifact, transport, transportPlan.artifact),
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
        generate: packingCall('Kaipa Packing Planner', [packingInstructions, planningSkills.packing.body].join('\n\n'), packingProposalSchema),
        repair: packingCall('Kaipa Packing Repair', packingRepairInstructions, draftPatchSchema),
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
    return parse(parseJsonString(await invoke(`${rejectionHint(error)}${guidance}${note}`, reask.maxTurns)));
  }
}

// One read-tool set per stage, so a new read tool added to the interactive
// catalog cannot silently stay invisible to the pipeline.
const researchTools = [searchTravelWeb, readTravelGuide, readTravelGuideImages, searchRoutes, searchJourneys];
const planTools = [getAppContext, getJourneyDetails, listGear, readConversationHistory, searchRoutes];

function isMultiRouteRequest(destination: string | null) {
  if (!destination) return false;
  return destination.split(/[、，,;/；|]/).map(item => item.trim()).filter(Boolean).length > 1;
}

async function runResearch(pipeline: PipelineDeps, signal: AbortSignal, transport: boolean): Promise<ResearchBrief> {
  const agent = pipeline.stageAgent({
    name: 'Kaipa Research',
    instructions: [
      researchInstructions,
      planningSkills.tavily.body,
      planningSkills.routes.body,
      transport ? planningSkills.travel.body : planningSkills.hiking.body,
    ].join('\n\n'),
    tools: researchTools,
    outputType: researchBriefSchema,
    model: pipeline.flashModel,
    stage: 'research',
    temperature: 0.25,
  });
  const text = [pipeline.userInput, '', '本轮只做资料检索与阅读，不保存任何数据，也不向用户提问。请输出 ResearchBrief。'].join('\n');
  // Research must yield a structured handoff before the transport and plan
  // stages can start. A long multi-route search that keeps opening sources
  // indefinitely used to consume the whole stage budget and abort repeatedly.
  try {
    return await stageCall(pipeline, agent, stageInput(pipeline.agentInput, text), {
      // This is an infrastructure ceiling, not a requirement to stop after a
      // fixed number of sources. Completion is determined by route coverage.
      maxTurns: 10,
      signal,
      reask: { maxTurns: 1, allowTools: false, note: '资料已经足够时立即输出 ResearchBrief；不要继续搜索。' },
    }, value => researchBriefSchema.parse(value));
  } catch (error) {
    // Search providers and guide readers are external dependencies. If the
    // model has already collected usable results but misses the stage budget,
    // keep those results as an explicitly incomplete handoff so transport and
    // planning can still explain the gaps instead of retrying for six minutes.
    if (!/Request was aborted|AbortError|signal is aborted/i.test(error instanceof Error ? error.message : String(error))) throw error;
    const calls = await pipeline.client.from('agent_tool_calls')
      .select('tool_name,output,status').eq('run_id', pipeline.runId).eq('status', 'completed');
    const facts: Array<{ fact: string; sourceUrl: string | null }> = [];
    for (const call of calls.data || []) {
      if (call.tool_name !== 'search_routes' && call.tool_name !== 'search_travel_web' && call.tool_name !== 'read_travel_guide') continue;
      const output = call.output && typeof call.output === 'object' ? call.output as Record<string, unknown> : null;
      const results = Array.isArray(output?.results) ? output.results : [];
      for (const result of results.slice(0, 8)) {
        if (!result || typeof result !== 'object') continue;
        const item = result as Record<string, unknown>;
        const title = typeof item.title === 'string' ? item.title : '';
        const snippet = typeof item.snippet === 'string' ? item.snippet.slice(0, 450) : '';
        if (title || snippet) facts.push({ fact: [title, snippet].filter(Boolean).join('：'), sourceUrl: typeof item.url === 'string' ? item.url : null });
      }
    }
    return researchBriefSchema.parse({
      destination: pipeline.task.decision.destination || '',
      routes: (pipeline.task.decision.destination || '').split(/[、，,;/；|]/).map(name => name.trim()).filter(Boolean).map(name => ({
        name,
        summary: '',
        unresolved: ['研究阶段超时，路线资料未完成核验'],
      })),
      facts: facts.slice(0, 30),
      unresolved: ['资料搜集阶段超时，部分路线、起终点和营地信息仍需核实；以下规划不得把缺失信息当作已确认事实。'],
      suggestedDays: null,
      durationBasis: '',
    });
  }
}

async function runTransport(pipeline: PipelineDeps, signal: AbortSignal, research: ResearchBrief | null): Promise<TransportPlan> {
  // Route-to-route mountain transport is not a live rail/flight booking
  // problem. Keep this handoff deterministic: the plan stage receives explicit
  // unknown legs instead of waiting on another model/tool loop that may ignore
  // cancellation after an external search returns.
  void signal;
  void research;
  const names = (pipeline.task.decision.destination || '').split(/[、，,;/；|]/).map(name => name.trim()).filter(Boolean);
  return transportPlanSchema.parse({
    segments: names.slice(1).map((name, index) => ({
      fromRoute: names[index], toRoute: name, from: names[index], to: name,
      mode: 'unknown', durationMinutes: null, overnightRequired: false, verified: false,
      sourceUrl: null, note: '路线起终点和接驳时间待核实',
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
    outputType: planDocumentSchema,
    model: pipeline.model,
    stage: 'plan',
    temperature: 0.25,
  });
  const facts = pipeline.task.decision;
  const effectiveDays = facts.days ?? facts.derivedDays;
  const text = [
    pipeline.userInput,
    research ? `\n上一阶段检索结果（ResearchBrief，事实来源）：${JSON.stringify(research)}` : '',
    transportPlan ? `\n独立交通阶段结果（TransportPlan，路线之间的交通事实）：${JSON.stringify(transportPlan)}` : '',
    // The decision stage already confirmed these against the user message, so
    // the planner fills journey straight from them instead of re-deriving
    // (and occasionally misreading) the calendar facts through tool calls.
    `\n任务状态已确认的事实（需求解释阶段已核对，journey 字段直接采用）：目的地=${facts.destination ?? '无'}；出发日期=${facts.plannedDate ?? (facts.dateUndecided ? '未定' : '无')}；用户指定天数=${facts.days ?? '无'}；系统根据路线与中转推算天数=${facts.derivedDays ?? '无'}；本次编排采用天数=${effectiveDays ?? '无'}；轨迹文件名=${facts.trackAttachmentName ?? '无'}。`,
    '',
    '本轮只输出一份 PlanDocument，不保存任何数据。只使用上面的检索结果与已核验上下文；没有证据的内容写入 unverified，不要编造。',
  ].join('\n');
  return stageCall(pipeline, agent, text, { maxTurns: 12, signal, reask: { maxTurns: 2, allowTools: true, note: '上一轮已有的 blocker 或 pendingQuestion 保持不变；只修正本轮校验问题，不要因为需要重读数据而放弃输出。' } }, value => {
    const plan = planDocumentSchema.parse(value);
    if ((transportPlan?.recommendedDays ?? research?.suggestedDays) != null) {
      const estimateDays = transportPlan?.recommendedDays ?? research?.suggestedDays;
      const basis = transportPlan?.basis || research?.durationBasis || '已核验路线时长与路线衔接信息';
      const estimate = `系统按路线徒步时长、中转与必要缓冲估算 ${estimateDays} 天：${basis}`;
      if (!plan.assumptions.some(item => item.includes('系统按路线徒步时长'))) {
        plan.assumptions = [...plan.assumptions, estimate].slice(0, 12);
      }
    }
    // A plan that drops the journey without a bound one and without a stated
    // reason would silently save nothing; surface it as a concrete issue so
    // the re-ask either fills the journey or records a blocker.
    if (plan.journey === null && !boundJourneyId(pipeline.context) && !plan.blocker && !plan.pendingQuestion) {
      if (effectiveDays == null) {
        plan.pendingQuestion = '路线建议已经整理好，但无法从现有路线资料可靠推算总天数。请补充总天数或更完整的轨迹资料。';
      } else {
        throw { issues: [{ path: ['journey'], message: '不能为 null：任务事实已确认时填写旅程，确有缺漏则写入 blocker 或 pendingQuestion 说明原因' }] };
      }
    }
    const journeyId = pipeline.context.currentJourneyId;
    const track = journeyId
      ? pipeline.context.dataContext?.snapshots[`${journeyId}:track`]?.data.trackSummary
      : undefined;
    const requiredDays = Number(effectiveDays || (pipeline.context.dataContext?.snapshots[`${journeyId || ''}:journey`]?.data.journey as { total_days?: number } | undefined)?.total_days || 0);
    if (pipeline.task.decision.fullHikingPlan && track && requiredDays > 0 && plan.endpoints.length < requiredDays && !plan.blocker && !plan.pendingQuestion) {
      throw { issues: [{ path: ['endpoints'], message: `已读取有效轨迹，完整徒步计划必须为每个徒步日提供真实轨迹终点（需要 ${requiredDays} 个，当前 ${plan.endpoints.length} 个）` }] };
    }
    return plan;
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
      outputType: planDocumentSchema,
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
    return stageCall(pipeline, agent, text, { maxTurns: 6, signal }, value => planDocumentSchema.parse(value));
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
  const agent = pipeline.stageAgent({
    name: 'Kaipa Reply',
    instructions: respondInstructions,
    tools: [],
    outputType: assistantOutput,
    model: pipeline.model,
    stage: 'respond',
    temperature: 0,
  });
  const text = [
    pipeline.userInput,
    `\n计划内容（未保存部分不得描述为已保存）：${planDraftFrom(results.plan).body}`,
    results.plan.transport ? `\n交通方案：${JSON.stringify(results.plan.transport)}` : '',
    `\n实际保存结果：已保存 ${JSON.stringify(results.save?.saved.map(entry => entry.tool) || [])}；跳过 ${JSON.stringify(results.save?.skipped || [])}；失败 ${JSON.stringify(results.save?.failed || [])}；修复轮 ${results.save?.repaired === true ? '已执行' : '未执行'}。`,
    results.packing ? `\n装备清单阶段：${JSON.stringify({ status: results.packing.status, itemCount: results.packing.itemCount, issues: results.packing.issues, error: results.packing.error })}` : '',
    '',
    '请基于以上实际结果生成最终回复。只需要 text 一定有内容；其余字段没有把握时省略即可（系统会按需填充草案与交通事实）。',
  ].join('\n');
  // A rejected reply shape is cheap to retry here and must not cost the whole
  // plan its three job attempts.
  return stageCall(pipeline, agent, text, { maxTurns: 1, signal }, value => value);
}

const researchInstructions = `你是 Kaipa 的资料检索阶段，只负责取证。没有保存权限，也不要向用户提问。完成路线覆盖后直接输出 ResearchBrief JSON，不要为了增加来源而继续搜索。
先为每个用户选择的路线建立一条独立研究条目，再读取能够填补该路线关键字段的来源。资料不足时保留路线条目并填写 unresolved，不要为了凑齐资料反复搜索。研究完成的判断是路线覆盖完整，不是读取了多少篇文章；满足覆盖后直接输出 JSON。
把每条事实与它的来源链接一起记录；无法核实的写入 unresolved。区分攻略与轨迹标注点提供的候选过夜位置，不要凭距离或时长平均分配。
当用户没有提供总天数时，综合已核验的各路线徒步时长、必要住宿转换和安全缓冲，输出 suggestedDays（1-30 的整数）以及 durationBasis；路线之间的交通耗时由独立的 Transport 阶段处理。只能基于检索到的证据估算；证据不足时两者留空，并把缺口写入 unresolved。
输出只包含 ResearchBrief 结构化结果。`;

const planInstructions = `你是 Kaipa 的行程编排阶段，只做只读查询并输出方案，不保存任何数据，也不向用户提问。
工具调用轮次有限，最后一轮必须直接输出 PlanDocument JSON，不允许用文字代替。
先用只读工具读取当前旅程与轨迹的已核验数据，再编排方案。
硬性约束：
- journey 字段只能填写任务状态里已确认的事实（目的地、日期、天数、轨迹文件名）。用户未填写日期时可保持 plannedDate=null；用户未填写天数时，若 ResearchBrief 提供了有依据的 suggestedDays，则使用系统推算天数创建，并在 assumptions 中说明依据，不要追问用户。
- planProfile 之外的行程与装备判断都写入 itineraryItems 与 endpoints。
- 多日徒步：先确定真实轨迹上的过夜点，再据此推导当日里程；禁止按天数或时长平均分配；每天一个终点。
- 交通接驳段作为普通 itineraryItems 记录，不要为交通单独设置徒步日终点。
- 没有证据的内容写入 unverified，不要编造时间、价格、水源或营地。
- 无法完成的部分用 blocker 说明具体原因，需要用户决定时用 pendingQuestion，并把已经能确定的部分照常输出。
输出只包含 PlanDocument 结构化结果。`;

const planRepairInstructions = `这是同一次任务的修复轮。上一轮保存时部分操作校验失败，请只修正失败的部分。
工具调用最多 6 轮，最后一轮必须直接输出修补后的 PlanDocument JSON，不允许用文字代替。
已经被校验拒绝的字段必须换成真实数据或删除该操作；不要用重复调用绕过校验，不要改动已经成功保存的操作。`;

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

type StageRow = { stage: StageName; status: string; artifact: unknown };

async function loadStageState(admin: any, runId: string) {
  const rows = await admin.from('agent_stages').select('stage,status,artifact').eq('run_id', runId);
  if (rows.error) throw rows.error;
  const state = new Map<StageName, StageRow>();
  // Attempts are upserted on the same row, so one row per stage exists here.
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

async function runStage<T>(deps: {
  name: StageName;
  state: Map<StageName, StageRow>;
  pipeline: PipelineDeps;
  execute: (signal: AbortSignal) => Promise<T>;
}): Promise<{ artifact: T | null; aborted: boolean }> {
  const { name, state, pipeline } = deps;
  const previous = state.get(name);
  // Only completed rows are reused; failed and running rows belong to an
  // earlier attempt that did not get this stage done.
  if (previous?.status === 'completed') {
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
    await writeStage(pipeline.admin, { runId: pipeline.runId, userId: pipeline.userId, stage: name, attempt: pipeline.attempt, status: 'completed', artifact });
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
