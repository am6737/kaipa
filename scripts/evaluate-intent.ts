// Offline intent-routing evaluation. Calls models only; never touches the
// database. See docs/agent-intent-evaluation.md.
//
//   deno run --allow-env --allow-read --allow-net --allow-write scripts/evaluate-intent.ts \
//     --variants=current,router --repeat=5 --report=/tmp/kaipa-intent.json
//
// Variants:
//   current  today's Task Interpreter + constrainTaskDecision + useStagedPipeline
//   router   a short-prompt flash router over the shared intent definitions
//   phase1   the production path: continuation gate, intent router in parallel
//            with the interpreter, applyIntent, quote guard, constrainTaskDecision
//   jev      TypeSafe Jev Choice (opt-in only; blocked from mainland China, see docs)
// Router and Jev are reported at several confidence thresholds from the same calls.
import { z } from 'npm:zod@4.1.12';
import { createAgentRuntime } from '../supabase/functions/app-agent/agent.ts';
import { intentCases } from '../supabase/functions/app-agent/intent-cases.ts';
import { intentDefinitions, intentFromDecision, intents, routeWithThreshold, scoreCase, summarize, type Intent, type IntentCase, type Prediction } from '../supabase/functions/app-agent/intent-eval.ts';
import { clarifyDefinition, intentRouterMode, resolveTask } from '../supabase/functions/app-agent/intent-router.ts';
import { useStagedPipeline } from '../supabase/functions/app-agent/pipeline.ts';
import { constrainTaskDecision, taskDecisionSchema, type TaskState, type WriteOperation } from '../supabase/functions/app-agent/task.ts';

const args = new Map(Deno.args.filter(arg => arg.startsWith('--')).map(arg => {
  const [key, ...rest] = arg.slice(2).split('=');
  return [key, rest.join('=') || 'true'] as const;
}));
const variants = (args.get('variants') || 'current,router').split(',').map(value => value.trim());
const repeat = Math.max(1, Number(args.get('repeat') || 3));
const concurrency = Math.max(1, Number(args.get('concurrency') || 4));
const thresholds = (args.get('thresholds') || '0.5,0.6,0.7,0.8').split(',').map(Number);
const selected = args.get('cases')?.split(',');
const reportPath = args.get('report');
const dryRun = args.has('dry-run');
const jevModel = args.get('jev-model') || 'jev-1.13.0';
const localDate = args.get('date') || '2026-10-15';

// Same runtime env the deploy script reads (infra/supabase/deploy-functions.sh).
loadEnvFile(args.get('env-file') || Deno.env.get('KAIPA_RUNTIME_ENV')
  || new URL('../infra/supabase/docker/.env', import.meta.url).pathname);
const cases = selected ? intentCases.filter(testCase => selected.includes(testCase.id)) : intentCases;
if (!cases.length) throw new Error('No cases selected');

// Values are never printed; only presence is reported.
function loadEnvFile(path: string) {
  let text = '';
  try { text = Deno.readTextFileSync(path); } catch { return; }
  for (const line of text.split('\n')) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!match || Deno.env.get(match[1])) continue;
    Deno.env.set(match[1], match[2].replace(/^(['"])(.*)\1$/, '$2'));
  }
}

function modelConfig() {
  const dedicated = Deno.env.get('KAIPA_AI_API_KEY')?.trim();
  const apiKey = dedicated || Deno.env.get('OPENROUTER_API_KEY')?.trim();
  if (!apiKey) return null;
  return {
    apiKey,
    baseUrl: (Deno.env.get('KAIPA_AI_BASE_URL')?.trim() || (dedicated ? 'https://ai.dootask.com/v1' : 'https://openrouter.ai/api/v1')).replace(/\/$/, ''),
    model: Deno.env.get('KAIPA_AI_MODEL')?.trim() || Deno.env.get('OPENROUTER_MODEL')?.trim() || 'openai/gpt-4.1-mini',
    flashModel: Deno.env.get('KAIPA_AI_FLASH_MODEL')?.trim() || undefined,
    useResponses: Deno.env.get('KAIPA_AI_USE_RESPONSES')?.trim() === 'true',
  };
}

const temporalContext = [
  '运行上下文（用于解析相对日期，不要原样展示给用户）：',
  `用户本地日期：${localDate}`,
  '日期处理要求：今天/明天/后天/大后天/本周/下周等能唯一确定的表达直接换算为具体 YYYY-MM-DD；只有含义不唯一时才追问。',
].join('\n');

const hikingOperations: WriteOperation[] = ['add_itinerary_items', 'update_journey_schedule', 'set_journey_map_location', 'set_itinerary_group_endpoints', 'add_packing_items'];

function previousTask(testCase: IntentCase, journeyId: string | null): TaskState | null {
  const previous = testCase.context?.previous;
  if (!previous) return null;
  const operations = previous.operations || (previous.fullHikingPlan ? hikingOperations : []);
  const packingMode = previous.fullHikingPlan || operations.includes('add_packing_items') ? 'full' : 'none';
  // A question asked with nothing authorized (a clarification) comes from a
  // discussion turn; one asked mid-task comes from an execute turn.
  const mode = operations.length || previous.fullHikingPlan ? 'execute' : 'discuss';
  const decision = taskDecisionSchema.parse({
    objective: previous.pendingQuestion, mode, continuation: false, authorizationQuote: '',
    operations, requiredOperations: operations, fullHikingPlan: previous.fullHikingPlan ?? false,
    domain: previous.domain || (previous.fullHikingPlan ? 'hiking' : packingMode === 'full' ? 'packing' : 'general'),
    destination: previous.destination || null, plannedDate: null, dateUndecided: false, days: null,
    trackAttachmentName: null, packingMode, constraints: [],
  });
  return { runId: 'eval-previous', journeyId, decision,
    outcome: { status: 'waiting', pendingQuestion: previous.pendingQuestion, draft: null, missingOperations: operations } };
}

function recentMessages(testCase: IntentCase) {
  const recent = [...(testCase.context?.recent || [])];
  if (testCase.context?.previous) recent.push({ role: 'assistant', content: testCase.context.previous.pendingQuestion });
  return recent;
}

// The context the routers see: the same facts the interpreter gets, minus IDs.
function routerState(testCase: IntentCase) {
  return {
    latestMessage: testCase.message,
    hasCurrentJourney: Boolean(testCase.context?.journey),
    hasBoundTrack: Boolean(testCase.context?.track),
    appEntry: testCase.context?.appIntent || null,
    pendingQuestion: testCase.context?.previous?.pendingQuestion || null,
    recentMessages: recentMessages(testCase),
  };
}

const routeQuestion = '用户最新这句话想让助手做什么？结合是否已有当前旅程、轨迹和上一轮待回答的问题判断；回答上一轮问题时，延续那个任务的意图。';

const routerOutput = z.object({
  intent: z.enum(intents),
  confidence: z.number().min(0).max(1),
  alternatives: z.array(z.enum(intents)).max(3),
});
const routerInstructions = `你是 Kaipa 户外助手的意图路由器，只做分类，不回答用户。
${routeQuestion}
只能从下列意图中选择一个（JSON：what=是什么，not_for=不包括什么，examples=例句）：
${JSON.stringify({ ...intentDefinitions, clarify: clarifyDefinition })}
confidence 是你对所选意图正确的把握（0-1）；alternatives 列出其他说得通的意图。只输出结构化结果。`;

type Raw = { choice: Intent; confidence: number | null; alternatives?: Intent[]; operations?: WriteOperation[]; pipeline?: boolean; latencyMs: number; error?: string;
  routing?: { intent: string; source: string; applied: boolean; error?: string; interpreter?: Record<string, unknown> } };

async function runCurrent(runtime: ReturnType<typeof createAgentRuntime>, testCase: IntentCase): Promise<Raw> {
  const journeyId = testCase.context?.journey ? 'eval-journey' : null;
  const previous = previousTask(testCase, journeyId);
  const started = Date.now();
  const raw = await runtime.interpret(interpreterInput(testCase, journeyId, previous));
  const latencyMs = Date.now() - started;
  const constrained = constrainTaskDecision({ ...raw, offTopic: false, objective: raw.objective?.trim() || testCase.message },
    testCase.message, previous, journeyId, { hasBoundTrack: Boolean(testCase.context?.track), intent: testCase.context?.appIntent });
  return { choice: intentFromDecision(raw), confidence: null, operations: constrained.operations,
    pipeline: useStagedPipeline(constrained), latencyMs };
}

function interpreterInput(testCase: IntentCase, journeyId: string | null, previous: TaskState | null) {
  return {
    latestMessage: testCase.message,
    appIntent: testCase.context?.appIntent || null,
    currentJourneyId: journeyId,
    boundTrack: { available: Boolean(testCase.context?.track), filename: testCase.context?.track ? 'track.gpx' : null },
    temporalContext,
    availableAttachments: [],
    previousTask: previous,
    recentMessages: recentMessages(testCase),
  };
}

// Same helper prepareTask calls, minus the database. A clarification is
// scored as clarify; otherwise the intent is read from the decision after
// the routed intent and quote guard were applied, so an intent that ended up
// writing nothing scores as what actually runs. unsupported becomes discuss.
const phase1Mode = intentRouterMode(Deno.env.get('KAIPA_INTENT_ROUTER'));
async function runPhase1(runtime: ReturnType<typeof createAgentRuntime>, testCase: IntentCase): Promise<Raw> {
  const journeyId = testCase.context?.journey ? 'eval-journey' : null;
  const previous = previousTask(testCase, journeyId);
  const started = Date.now();
  const routerErrors: string[] = [];
  const resolved = await resolveTask({
    message: testCase.message, journeyId, previous, appIntent: testCase.context?.appIntent || null,
    hasBoundTrack: Boolean(testCase.context?.track), mode: phase1Mode,
    recentMessages: recentMessages(testCase), interpretInput: interpreterInput(testCase, journeyId, previous),
  }, runtime.interpret, runtime.route, (_message, detail) => routerErrors.push(String(detail)));
  const latencyMs = Date.now() - started;
  const { routing, decision, applied } = resolved;
  const choice: Intent = routing.applied && routing.clarify ? 'clarify' : intentFromDecision(applied);
  const alternatives = (routing.alternatives || []).map(intent => intent === 'unsupported' ? 'discuss' : intent);
  return { choice, confidence: null, alternatives, operations: decision.operations, pipeline: useStagedPipeline(decision), latencyMs,
    routing: { intent: routing.intent, source: routing.source, applied: routing.applied, error: routing.error || routerErrors[0],
      interpreter: { mode: resolved.raw.mode, continuation: resolved.raw.continuation, fullHikingPlan: resolved.raw.fullHikingPlan,
        domain: resolved.raw.domain, operations: resolved.raw.operations } } };
}

async function runRouter(runtime: ReturnType<typeof createAgentRuntime>, testCase: IntentCase): Promise<Raw> {
  const agent = runtime.stageAgent({ name: 'Kaipa Intent Router (eval)', instructions: routerInstructions, tools: [],
    outputType: routerOutput, model: runtime.flashModel, stage: 'interpretation', temperature: 0 });
  const started = Date.now();
  const result = await runtime.runner.run(agent, JSON.stringify(routerState(testCase)), { maxTurns: 1, signal: AbortSignal.timeout(60000) });
  const output = routerOutput.parse(result.finalOutput);
  return { choice: output.intent, confidence: output.confidence, alternatives: output.alternatives, latencyMs: Date.now() - started };
}

async function runJev(testCase: IntentCase): Promise<Raw> {
  const key = Deno.env.get('TYPESAFE_API_KEY')?.trim();
  if (!key) throw new Error('TYPESAFE_API_KEY missing');
  const criteria = { ...intentDefinitions, clarify: clarifyDefinition };
  const body = JSON.stringify({ model: jevModel, state: routerState(testCase),
    questions: { intent: { type: 'choice', instructions: routeQuestion, criteria } } });
  for (let attempt = 0; ; attempt++) {
    const started = Date.now();
    const response = await fetch('https://api.typesafe.ai/v1/systemone', {
      method: 'POST', body, signal: AbortSignal.timeout(20000),
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    });
    if ((response.status === 429 || response.status === 529) && attempt < 3) {
      await response.body?.cancel();
      await new Promise(resolve => setTimeout(resolve, 500 * 2 ** attempt));
      continue;
    }
    if (!response.ok) throw new Error(`jev ${response.status}: ${(await response.text()).slice(0, 200)}`);
    const answer = (await response.json()).answers?.intent;
    if (!answer || !intents.includes(answer.choice)) throw new Error('jev returned no valid choice');
    const ranked = Object.entries(answer.probabilities as Record<string, number>).sort((a, b) => b[1] - a[1]);
    return { choice: answer.choice, confidence: answer.confidence ?? null,
      alternatives: ranked.slice(1, 3).filter(([, p]) => p >= 0.1).map(([intent]) => intent as Intent), latencyMs: Date.now() - started };
  }
}

async function pool<T>(items: T[], limit: number, work: (item: T) => Promise<void>) {
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) await work(items[next++]);
  }));
}

const config = modelConfig();
const runtime = config ? createAgentRuntime(config) : null;
console.log(`cases=${cases.length} repeat=${repeat} variants=${variants.join(',')} model-config=${config ? 'present' : 'missing'} jev-key=${Deno.env.get('TYPESAFE_API_KEY') ? 'present' : 'missing'}`);
if (dryRun) Deno.exit(0);

const raws: Record<string, Array<{ caseId: string; raw: Raw }>> = {};
for (const variant of variants) {
  if ((variant === 'current' || variant === 'router' || variant === 'phase1') && !runtime) { console.warn(`skip ${variant}: KAIPA_AI_API_KEY/OPENROUTER_API_KEY missing`); continue; }
  if (variant === 'jev' && !Deno.env.get('TYPESAFE_API_KEY')) { console.warn('skip jev: TYPESAFE_API_KEY missing'); continue; }
  const jobs = cases.flatMap(testCase => Array.from({ length: repeat }, () => testCase));
  raws[variant] = [];
  let done = 0;
  await pool(jobs, concurrency, async testCase => {
    let raw: Raw;
    try {
      raw = variant === 'current' ? await runCurrent(runtime!, testCase)
        : variant === 'router' ? await runRouter(runtime!, testCase)
        : variant === 'phase1' ? await runPhase1(runtime!, testCase)
        : await runJev(testCase);
    } catch (error) {
      raw = { choice: 'discuss', confidence: null, latencyMs: 0, error: error instanceof Error ? error.message.slice(0, 300) : String(error) };
    }
    raws[variant].push({ caseId: testCase.id, raw });
    if (++done % 20 === 0) console.log(`${variant}: ${done}/${jobs.length}`);
  });
}

const summaries = [];
const details: Record<string, unknown[]> = {};
// Case groups are the id prefix (amb, app, real, cont, ...), so weak slices
// stay visible behind the overall rates.
const groupOf = (caseId: string) => caseId.split('-')[0];
const groups: Record<string, Record<string, string>> = {};
const byId = new Map(cases.map(testCase => [testCase.id, testCase]));
for (const [variant, list] of Object.entries(raws)) {
  const levels = variant === 'current' || variant === 'phase1' ? [null] : [null, ...thresholds];
  for (const threshold of levels) {
    const name = threshold == null ? variant : `${variant}@${threshold}`;
    const runs = list.map(({ caseId, raw }) => {
      const prediction: Prediction = { intent: threshold == null ? raw.choice : routeWithThreshold(raw.choice, raw.confidence, threshold),
        operations: raw.operations, pipeline: raw.pipeline, confidence: raw.confidence, alternatives: raw.alternatives,
        latencyMs: raw.latencyMs, error: raw.error };
      return { caseId, prediction, score: scoreCase(byId.get(caseId)!, prediction) };
    });
    summaries.push(summarize(name, cases, runs));
    if (threshold == null) {
      for (const group of [...new Set(cases.map(testCase => groupOf(testCase.id)))]) {
        const inGroup = runs.filter(run => groupOf(run.caseId) === group);
        const rate = (count: number) => `${Math.round(count / (inGroup.length || 1) * 100)}%`;
        groups[group] ??= { cases: String(cases.filter(testCase => groupOf(testCase.id) === group).length) };
        groups[group][`${variant} ok`] = rate(inGroup.filter(run => run.score.acceptable).length);
        groups[group][`${variant} harm`] = rate(inGroup.filter(run => run.score.harmful).length);
      }
    }
    details[name] = runs.filter(run => !run.score.acceptable || run.score.harmful)
      .map(run => ({ caseId: run.caseId, message: byId.get(run.caseId)!.message, got: run.prediction.intent,
        confidence: run.prediction.confidence, reasons: run.score.reasons,
        routing: list.find(item => item.caseId === run.caseId && item.raw.choice === run.prediction.intent)?.raw.routing }));
  }
}

const pct = (value: number) => `${(value * 100).toFixed(1)}%`;
console.table(summaries.map(summary => ({ variant: summary.variant, exact: pct(summary.exactRate), acceptable: pct(summary.acceptableRate),
  harmful: pct(summary.harmfulRate), [`pass^${repeat}`]: pct(summary.passK), errors: pct(summary.errorRate),
  p50ms: summary.latencyP50, p90ms: summary.latencyP90 })));
console.table(groups);
if (reportPath) {
  await Deno.writeTextFile(reportPath, JSON.stringify({ startedAt: new Date().toISOString(), repeat, jevModel,
    flashModel: config?.flashModel || config?.model || null, summaries, groups, failures: details, raw: raws }, null, 2));
  console.log(`report: ${reportPath}`);
}
