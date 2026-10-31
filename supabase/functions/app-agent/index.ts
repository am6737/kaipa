import { boundedJson, modelBudget, rate, ResourceError, resourceFailure, rpc as resourceRpc, serviceClient } from '../_shared/resource-guard.ts';
declare const Deno: { env: { get(name: string): string | undefined }; serve(handler: (req: Request) => Response | Promise<Response>): void };

// @ts-ignore Deno npm specifier
import { createClient } from 'npm:@supabase/supabase-js@2.108.1';
import { AGENT_VERSION, createAgentRuntime } from './agent.ts';
import { buildItineraryCard, extractItineraryBrief } from './itinerary-card.ts';
import { SupabaseAgentSession } from './session.ts';
import { addGear, bindRunClient, parseJsonString, releaseRunClient } from './tools.ts';
import { gearFastPathReply } from './gear-fast-path.ts';
import { bindPackingDraftStore, releasePackingDraftStore, readPackingDraft } from './packing-draft-store.ts';
import type { ModelMetric } from './model-metrics.ts';
import type { AgentAttachment, AgentContext, AgentIntent, AgentMessageUi, AgentModelMetric, AgentQuickReply, AgentResponse, AgentRunActivity, AgentSource } from './types.ts';
import { guideSourceChips, factSourceChips, routeFactSourcesFromArtifact, type RouteFactSource } from './route-fact-sources.ts';
import { loadSavedPlanPreview, previewJourneyId } from './plan-preview.ts';
import { normalizePlanningFollowUps, planningFollowUpReplies } from './planning-follow-ups.ts';
import { conversationAttachments } from './conversation-attachments.ts';
import { normalizeAgentLocation } from './location.ts';
import { latestTravelContext, travelContextSchema } from './travel-context-schema.ts';
import type { TravelContext } from './travel-context.ts';
import { prepareAgentContext } from './context.ts';
import { prepareTask } from './task-store.ts';
import { loadSmartPlanJourney, smartPlanMessage } from './smart-plan.ts';
import { answeredDeparturePrompt, departurePromptUi, departureQuestion, pendingDeparturePrompt, stoppedRunDeparturePrompt } from './departure-prompt.ts';
import { checkTopic, offTopicResponse } from './topic-boundary.ts';
import { runPipeline, useStagedPipeline } from './pipeline.ts';
import { renderTaskResponse } from './response-presentation.ts';
import { planDraftSchema, taskClarification, taskOutcome, type PlanDraft } from './task.ts';
import { intentRouterMode, isAgentIntent } from './intent-router.ts';
import { planningSkills } from './skills.ts';
import { assistantStoragePath, InvalidTrackError, isTrackAttachment, readAttachment, trackInput } from './attachments.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, 'Content-Type': 'application/json', 'X-Kaipa-Agent-Version': AGENT_VERSION },
});

function env(name: string) {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

function agentModelConfig() {
  const dedicatedApiKey = Deno.env.get('KAIPA_AI_API_KEY')?.trim();
  const openRouterApiKey = Deno.env.get('OPENROUTER_API_KEY')?.trim();
  const apiKey = dedicatedApiKey || openRouterApiKey;
  if (!apiKey) throw new Error('Missing KAIPA_AI_API_KEY or OPENROUTER_API_KEY');
  return {
    apiKey,
    baseUrl: (
      Deno.env.get('KAIPA_AI_BASE_URL')?.trim()
      || (dedicatedApiKey ? 'https://ai.dootask.com/v1' : 'https://openrouter.ai/api/v1')
    ).replace(/\/$/, ''),
    model: Deno.env.get('KAIPA_AI_MODEL')?.trim()
      || Deno.env.get('OPENROUTER_MODEL')?.trim()
      || 'openai/gpt-4.1-mini',
    // 轻角色（解释、检索、清单、记忆）模型；未配置时回退主模型。
    flashModel: Deno.env.get('KAIPA_AI_FLASH_MODEL')?.trim() || undefined,
    // DeepSeek 官方 API 必须走 Responses API（chat completions 不支持 json_schema 结构化输出）。
    useResponses: Deno.env.get('KAIPA_AI_USE_RESPONSES')?.trim() === 'true',
  };
}

function bearerToken(req: Request) {
  const header = req.headers.get('authorization') || '';
  const [scheme, token] = header.split(' ');
  return scheme?.toLowerCase() === 'bearer' ? token : '';
}

function normalizeQuickReplies(value: unknown): AgentQuickReply[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const record = item as Record<string, unknown>;
    const label = typeof record.label === 'string' ? record.label.trim().slice(0, 24) : '';
    const message = typeof record.message === 'string' ? record.message.trim().slice(0, 200) : '';
    const action: AgentQuickReply['action'] = record.action === 'upload_track' || record.action === 'skip_track' || record.action === 'request_location' ? record.action : undefined;
    return label && message ? [{ label, message, action }] : [];
  }).slice(0, 4);
}

function finalMessage(value: unknown): { text: string; quickReplies: AgentQuickReply[]; travelContext?: TravelContext | null; offerJourneyExtras?: boolean; pendingQuestion: string | null; draft: PlanDraft | null; blocker?: string | null; followUpSuggestion?: string | null } {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    return {
      text: typeof record.text === 'string' ? record.text.trim() : '',
      travelContext: record.travelContext == null ? null : travelContextSchema.parse(record.travelContext),
      quickReplies: normalizeQuickReplies(record.quickReplies),
      offerJourneyExtras: record.offerJourneyExtras === true,
      pendingQuestion: typeof record.pendingQuestion === 'string' ? record.pendingQuestion : null,
      blocker: typeof record.blocker === 'string' ? record.blocker : null,
      followUpSuggestion: typeof record.followUpSuggestion === 'string' ? record.followUpSuggestion : null,
      draft: record.draft == null ? null : planDraftSchema.parse(record.draft),
    };
  }
  if (typeof value === 'string') {
    const text = value.trim();
    const parsed = parseJsonString(text);
    if (parsed && typeof parsed === 'object') return finalMessage(parsed);
    return { text, quickReplies: [], pendingQuestion: null, draft: null };
  }
  return { text: value == null ? '' : String(value), quickReplies: [], pendingQuestion: null, draft: null };
}

function isFinalOutputError(error: unknown) {
  const text = error instanceof Error ? `${error.name} ${error.message}` : String(error);
  return /Invalid output type|final assistant output|failed schema validation|is not valid JSON/i.test(text);
}

function assistantText(item: unknown): string {
  const record = item as { role?: string; content?: unknown } | null;
  if (!record || record.role !== 'assistant') return '';
  if (typeof record.content === 'string') return record.content.trim();
  if (!Array.isArray(record.content)) return '';
  return record.content
    .flatMap((part) => (part && typeof part === 'object' && typeof (part as { text?: unknown }).text === 'string' ? [(part as { text: string }).text] : []))
    .join('\n')
    .trim();
}

// Returns the plain-text answer the model already produced, or undefined when
// this failure is not a rejected final output.
async function salvagedAnswer(error: unknown, session: SupabaseAgentSession) {
  if (!isFinalOutputError(error)) return undefined;
  const items = await session.getItems().catch(() => []);
  const text = [...items].reverse().map(assistantText).find(Boolean);
  if (!text) return undefined;
  console.warn('[AppAgent] using the prose answer after a rejected final output');
  return { text, blocker: text.slice(0, 1000), pendingQuestion: null, draft: null, quickReplies: [], offerJourneyExtras: false, travelContext: null };
}

const STALE_RUN_AFTER_MS = 5 * 60 * 1000 + 15 * 1000;

async function failStaleRuns(client: any, userId: string, threadId?: string) {
  let query = client
    .from('agent_runs')
    .update({
      status: 'failed',
      error: 'Agent worker exceeded its execution limit',
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId)
    .eq('status', 'running')
    .eq('execution_mode', 'request')
    .lt('created_at', new Date(Date.now() - STALE_RUN_AFTER_MS).toISOString());
  if (threadId) query = query.eq('thread_id', threadId);
  const stale = await query.select('id,thread_id');
  if (stale.error) throw stale.error;
  if (!stale.data?.length) return;

  const runIds = stale.data.map((run: { id: string }) => run.id);
  const failedAt = new Date().toISOString();
  const calls = await client
    .from('agent_tool_calls')
    .update({ status: 'failed', error: 'Agent worker exceeded its execution limit', updated_at: failedAt })
    .in('run_id', runIds)
    .eq('status', 'running');
  if (calls.error) throw calls.error;

  const threadIds = [...new Set(stale.data.map((run: { thread_id: string }) => run.thread_id))] as string[];
  const messages = await client.from('agent_messages').insert(threadIds.map((staleThreadId) => ({
    thread_id: staleThreadId,
    user_id: userId,
    role: 'assistant',
    content: '上一次规划因运行超时未能完成，请重新发送需求。',
    ui: {},
  })));
  if (messages.error) throw messages.error;
  const threads = await client.from('agent_threads').update({ updated_at: failedAt }).in('id', threadIds);
  if (threads.error) throw threads.error;
}

function validClientRunId(value?: string) {
  return value && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
    ? value
    : undefined;
}


function validIsoLocalDate(value?: string) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? value : undefined;
}

function addDaysIso(localDate: string, days: number) {
  const [year, month, day] = localDate.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

function validLocalTime(value?: string) {
  return value && /^([01]\d|2[0-3]):[0-5]\d$/.test(value) ? value : undefined;
}

function validTimeZone(value?: string) {
  return value && /^[A-Za-z0-9_+./-]{1,80}$/.test(value) ? value : undefined;
}

function validIsoTimestamp(value?: string) {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : undefined;
}

function agentTemporalContext(body: { clientLocalDate?: string; clientLocalTime?: string; clientTimeZone?: string; clientTimestamp?: string }) {
  const fallbackDate = new Date();
  const localDate = validIsoLocalDate(body.clientLocalDate) || fallbackDate.toISOString().slice(0, 10);
  const localTime = validLocalTime(body.clientLocalTime);
  const timeZone = validTimeZone(body.clientTimeZone);
  const timestamp = validIsoTimestamp(body.clientTimestamp) || fallbackDate.toISOString();
  return [
    '运行上下文（用于解析相对日期，不要原样展示给用户）：',
    `用户本地日期：${localDate}`,
    localTime ? `用户本地时间：${localTime}` : undefined,
    timeZone ? `用户时区：${timeZone}` : undefined,
    `请求时间戳：${timestamp}`,
    `相对日期参考：今天=${localDate}，明天=${addDaysIso(localDate, 1)}，后天=${addDaysIso(localDate, 2)}，大后天=${addDaysIso(localDate, 3)}。`,
    '日期处理要求：今天/明天/后天/大后天/本周/下周等能唯一确定的表达直接换算为具体 YYYY-MM-DD；只有含义不唯一时才追问。',
  ].filter(Boolean).join('\n');
}



function isValidAssistantAttachmentUrl(url: string, userId: string) {
  return assistantStoragePath(url, userId) !== null;
}

function validAttachments(value: unknown, userId: string): AgentAttachment[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 6).flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const attachment = item as Record<string, unknown>;
    const kind = attachment.kind === 'image' || attachment.kind === 'file' ? attachment.kind : undefined;
    const name = typeof attachment.name === 'string' ? attachment.name.trim().slice(0, 160) : '';
    const url = typeof attachment.url === 'string' ? attachment.url : '';
    const mimeType = typeof attachment.mimeType === 'string' ? attachment.mimeType.slice(0, 100) : '';
    if (!kind || !name || !mimeType || !isValidAssistantAttachmentUrl(url, userId)) return [];
    const size = Number(attachment.size);
    return [{ kind, name, url, mimeType, size: Number.isFinite(size) && size >= 0 ? size : undefined }];
  });
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
}

async function attachmentInput(attachment: AgentAttachment, client: any, userId: string) {
  if (isTrackAttachment(attachment)) return trackInput(client, attachment, userId);
  const bytes = await readAttachment(client, attachment, userId);
  if (attachment.kind === 'image') {
    return { type: 'input_image' as const, image: `data:${attachment.mimeType};base64,${bytesToBase64(bytes)}`, detail: 'auto' };
  }
  return {
    type: 'input_file' as const,
    file: `data:${attachment.mimeType};base64,${bytesToBase64(bytes)}`,
    filename: attachment.name,
  };
}

// Row → DTO mapping shared by message UI, run_activity and history, so the
// timing rules and metric projection cannot drift between the three surfaces.
function activityRow(call: any): AgentRunActivity {
  return {
    toolName: call.tool_name,
    status: call.status,
    startedAt: call.created_at,
    finishedAt: call.status === 'running' ? undefined : call.updated_at,
    durationMs: call.status === 'running' || !call.updated_at ? undefined : Math.max(0, Date.parse(call.updated_at) - Date.parse(call.created_at)),
    arguments: call.arguments || {},
  };
}

function metricRow(metric: any): AgentModelMetric {
  return { stage: metric.stage, durationMs: Number(metric.duration_ms) || 0, success: metric.success === true };
}

// Only expose the small fields required by progress UI. Full tool payloads
// can contain private or very large journey records.
function activityOutput(call: any): unknown {
  // Search hits keep id and name so the reply can link the routes and
  // journeys it talks about.
  if (call.tool_name === 'search_routes' && Array.isArray(call.output)) {
    return { resultCount: call.output.length, routes: call.output.map((row: any) => ({ id: row.id, name: row.name })) };
  }
  if (call.tool_name === 'search_journeys' && Array.isArray(call.output)) {
    return { resultCount: call.output.length, journeys: call.output.map((row: any) => ({ id: row.id, name: row.name })) };
  }
  if (Array.isArray(call.output)) return { resultCount: call.output.length };
  if (call.tool_name === 'undo_last_agent_changes' && call.output && typeof call.output === 'object') {
    return { journeyId: call.output.journeyId ?? null, affectedOperations: call.output.affectedOperations };
  }
  if (typeof call.output?.added === 'number' || typeof call.output?.deleted === 'number') {
    return { journeyId: call.output.journeyId, added: call.output.added, deleted: call.output.deleted, skippedDuplicates: call.output.skippedDuplicates };
  }
  // The result card opens the saved item, so it needs the row id.
  if (call.tool_name === 'add_gear' && call.output && typeof call.output === 'object') {
    return { id: call.output.id, name: call.output.name, existing: call.output.existing === true || undefined };
  }
  if (call.tool_name === 'set_itinerary_group_endpoints') {
    return { coverage: {
      groupCount: typeof call.output?.coverage?.groupCount === 'number' ? call.output.coverage.groupCount : 0,
      requiredGroupCount: typeof call.output?.coverage?.requiredGroupCount === 'number' ? call.output.coverage.requiredGroupCount : 0,
      reachesTrackEnd: call.output?.coverage?.reachesTrackEnd === true,
    } };
  }
  if (call.tool_name === 'add_gear_set_items' && call.output && typeof call.output === 'object') {
    const count = (value: unknown) => Array.isArray(value) ? value.length : 0;
    return { set: { id: call.output.set?.id, name: call.output.set?.name }, createdSet: call.output.createdSet === true,
      addedOwned: count(call.output.addedOwned), addedToBuy: count(call.output.addedToBuy), skipped: count(call.output.skipped) };
  }
  if (call.tool_name === 'read_route_guide') {
    return { available: call.output?.available, status: call.output?.status, cached: call.output?.cached, reused: call.output?.reused };
  }
  if (call.tool_name === 'search_ground_transport') {
    return { status: call.output?.status, available: call.output?.available, distanceKm: call.output?.distanceKm, durationMinutes: call.output?.durationMinutes };
  }
  if (call.tool_name === 'search_transport') {
    return { status: call.output?.status, available: call.output?.available, provider: call.output?.provider, cached: call.output?.cached, retrievedAt: call.output?.retrievedAt, count: call.output?.offers?.length || 0 };
  }
  if (call.tool_name === 'get_journey_details' && call.output && typeof call.output === 'object') {
    return {
      // The track section is the only place a journey's track shows up; the
      // journey section itself carries no track facts.
      hasTrack: Boolean(call.output.trackSummary),
      distance: typeof call.output.trackSummary?.distance === 'string' ? call.output.trackSummary.distance : call.output.journey?.dist,
      ascent: typeof call.output.trackSummary?.ascent === 'string' ? call.output.trackSummary.ascent : call.output.journey?.asc_,
      totalKm: typeof call.output.trackSummary?.totalKm === 'number' ? call.output.trackSummary.totalKm : undefined,
    };
  }
  return undefined;
}

// The route facts this run planned with, as recorded on its research stage row.
// Every failure returns no facts rather than failing the run: the UI is being
// assembled here, and a missing citation is not worth losing the message over.
async function loadRunFactSources(client: any, runId: string): Promise<{ facts: RouteFactSource[]; guides: AgentSource[] }> {
  try {
    const row = await client.from('agent_stages')
      .select('route_facts,artifact').eq('run_id', runId).eq('stage', 'research')
      .order('attempt', { ascending: false }).limit(1);
    if (row.error) return { facts: [], guides: [] };
    const latest = (row.data || [])[0] as { route_facts?: unknown; artifact?: { guideEvidence?: Array<{ sources?: unknown }> } } | undefined;
    return { facts: routeFactSourcesFromArtifact(latest?.route_facts),
      guides: (latest?.artifact?.guideEvidence ?? []).flatMap(guide => guideSourceChips(guide.sources)) };
  } catch {
    return { facts: [], guides: [] };
  }
}

async function messageUiForRun(client: any, runId: string, quickReplies: AgentQuickReply[], offerJourneyExtras = false, locale?: 'zh' | 'en', currentJourneyId?: string | null): Promise<AgentMessageUi> {
  const [calls, metricsResult, timingResult, factResult] = await Promise.all([
    client.from('agent_tool_calls')
      .select('tool_name,arguments,output,status,undo_payload,undone_at,created_at,updated_at')
      .eq('run_id', runId)
      .order('created_at'),
    client.from('agent_model_metrics').select('stage,duration_ms,success').eq('run_id', runId).order('created_at'),
    client.from('agent_runs').select('created_at').eq('id', runId).maybeSingle(),
    loadRunFactSources(client, runId),
  ]);
  if (calls.error) throw calls.error;
  if (metricsResult.error) throw metricsResult.error;
  if (timingResult.error) throw timingResult.error;

  quickReplies = planningFollowUpReplies(offerJourneyExtras, quickReplies, calls.data || [], locale);

  const sourcesByUrl = new Map<string, AgentSource>();
  const guideSources = [...factResult.guides];
  const completedCalls = (calls.data || []).filter((call: any) => call.status === 'completed');
  for (const call of completedCalls) {
    if (call.tool_name === 'read_route_guide') guideSources.push(...guideSourceChips(call.output?.sources));
    if (call.tool_name !== 'search_transport') continue;
    const results = call.output && typeof call.output === 'object' && Array.isArray(call.output.results)
      ? call.output.results
      : [];
    for (const result of results) {
      if (!result || typeof result !== 'object') continue;
      const title = typeof result.title === 'string' ? result.title : '';
      const url = typeof result.url === 'string' ? result.url : '';
      if (!title || !/^https?:\/\//i.test(url) || sourcesByUrl.has(url)) continue;
      sourcesByUrl.set(url, {
        title,
        url,
        source: typeof result.source === 'string' ? result.source : undefined,
        snippet: typeof result.snippet === 'string' ? result.snippet : undefined,
        publishedAt: typeof result.publishedAt === 'string' ? result.publishedAt : undefined,
      });
    }
  }

  // Recovery/failure paths also need the existing journey, even without a write.
  if (!currentJourneyId) {
    const run = await client.from('agent_runs').select('thread_id').eq('id', runId).maybeSingle();
    if (run.error) throw run.error;
    if (run.data?.thread_id) {
      const thread = await client.from('agent_threads').select('current_journey_id').eq('id', run.data.thread_id).maybeSingle();
      if (thread.error) throw thread.error;
      currentJourneyId = thread.data?.current_journey_id;
    }
  }
  const changedJourneyId = previewJourneyId(calls.data || [], currentJourneyId);
  const planPreview = typeof changedJourneyId === "string" ? await loadSavedPlanPreview(client, changedJourneyId) : undefined;

  // Preserve action receipts, including failures; gap telemetry is internal.
  const activities: AgentRunActivity[] = (calls.data || [])
    .filter((call: any) => call.tool_name !== 'record_route_guide_gaps')
    .map((call: any) => ({ ...activityRow(call), output: activityOutput(call) }));
  const modelMetrics: AgentModelMetric[] = (metricsResult.data || []).map(metricRow);

  // Maintained facts and all guide sources are retained. Only operational
  // reference links use the legacy web cap.
  const sources = factSourceChips(factResult.facts, [...guideSources, ...sourcesByUrl.values()], { webLimit: 8 });

  return {
    quickReplies: quickReplies.length ? quickReplies : undefined,
    sources: sources.length ? sources : undefined,
    planPreview,
    activities: activities.length ? activities : undefined,
    modelMetrics: modelMetrics.length ? modelMetrics : undefined,
    runTiming: timingResult.data?.created_at ? { startedAt: timingResult.data.created_at, finishedAt: new Date().toISOString() } : undefined,
    undoAction: completedCalls.some((call: any) => call.undo_payload && !call.undone_at)
      ? { runId }
      : undefined,
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: { code: 'method_not_allowed', message: 'Method not allowed' } }, 405);

  let activeRunId: string | undefined;
  let activeClient: any;
  let activeThreadId: string | undefined;
  let activeUserId: string | undefined;
  let shouldPersistFailure = false;
  let jobLease: string | undefined;
  let jobAdmin: any;
  let jobAttempt = 0;
  try {
    const token = bearerToken(req);
    if (!token) return json({ error: { code: 'unauthorized', message: '请先登录' } }, 401);
    const supabaseUrl = env('SUPABASE_URL');
    const anonKey = env('SUPABASE_ANON_KEY');
    const client = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    activeClient = client;
    const { data: { user }, error: userError } = await client.auth.getUser(token);
    if (userError || !user) return json({ error: { code: 'unauthorized', message: '登录状态已失效' } }, 401);
    activeUserId = user.id;

    let body = await boundedJson(req) as {
      action?: 'turn' | 'history' | 'threads' | 'journey_thread' | 'gear_set_thread' | 'run_activity' | 'delete_thread' | 'undo' | 'execute_job' | 'retry_run' | 'cancel_run';
      leaseToken?: string;
      threadId?: string;
      runId?: string;
      clientRunId?: string;
      message?: string;
      displayMessage?: string;
      currentJourneyId?: string;
      // The gear set (装备清单) this turn works on; its thread is reused across
      // taps instead of starting a new conversation each time.
      currentGearSetId?: string;
      // Set contents the app is reviewing, stored on the thread so the next tap
      // can tell whether 清单判官 has anything new to look at.
      gearSetReviewFingerprint?: string;
      currentLocation?: unknown;
      // Departure the user picked in the app before planning; it confirms the
      // trip's origin without another model turn.
      departure?: unknown;
      // The departure travels with this message (a device fix or a change of
      // origin) instead of answering a stored question.
      departureWithRequest?: boolean;
      // Store a departure question for this plan request instead of running
      // it; the answer starts the plan.
      askDeparture?: boolean;
      // Set by the server on queued payloads only.
      resumeWaitingPlan?: boolean;
      intent?: AgentIntent;
      locale?: 'zh' | 'en';
      attachments?: AgentAttachment[];
      conversationAttachments?: AgentAttachment[];
      clientLocalDate?: string;
      clientLocalTime?: string;
      clientTimeZone?: string;
      clientTimestamp?: string;
    };

    // This gate only applies to new planning work. Existing history, status,
    // cancellation and read operations remain available during maintenance.
    if (!body.action || body.action === 'turn' || body.action === 'retry_run') {
      const { data: featureState, error: featureError } = await client.rpc('feature_control_state', { p_key: 'smart_planning' });
      if (featureError) throw featureError;
      if (featureState === 'disabled') throw new ResourceError('feature_disabled', 503);
    }

    // A stored departure question runs no model, so it is not AI usage.
    if (((!body.action || body.action === 'turn') && !body.askDeparture) || body.action === 'retry_run') await rate(serviceClient(),'ai',user.id);

    if (body.action === 'retry_run') {
      const retried = await client.rpc('retry_agent_job', { p_run_id: body.runId });
      if (retried.error) return json({ error: { code: 'retry_unavailable', message: '这次规划无法继续，请在当前对话发送新的需求。' } }, 409);
      return json(retried.data);
    }

    if (body.action === 'cancel_run') {
      if (!body.runId) return json({ error: { code: 'run_required', message: '请选择要停止的处理' } }, 400);
      const cancelled = await client.from('agent_runs').update({
        status: 'failed',
        error: 'cancelled_by_user',
        updated_at: new Date().toISOString(),
      }).eq('id', body.runId).eq('user_id', user.id).eq('status', 'running').select('id').maybeSingle();
      if (cancelled.error) throw cancelled.error;
      if (cancelled.data) {
        const jobAdmin = createClient(supabaseUrl, env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false, autoRefreshToken: false } });
        const job = await jobAdmin.from('agent_jobs').update({ state: 'failed', last_error: 'cancelled_by_user', lease_token: null, lease_until: null }).eq('run_id', body.runId);
        if (job.error) console.warn('Could not cancel agent job', job.error);
        // Fail rows the pipeline could otherwise resume on the next attempt.
        const calls = await client.from('agent_tool_calls')
          .update({ status: 'failed', error: 'cancelled_by_user', updated_at: new Date().toISOString() })
          .eq('run_id', body.runId).eq('status', 'running');
        if (calls.error) console.warn('Could not cancel agent tool calls', calls.error);
        // agent_stages has no UPDATE policy for users, so the service-role
        // client is required here.
        const stages = await jobAdmin.from('agent_stages')
          .update({ status: 'failed', error: 'cancelled_by_user' })
          .eq('run_id', body.runId).eq('status', 'running');
        if (stages.error) console.warn('Could not cancel agent stages', stages.error);
      }
      return json({ cancelled: true });
    }

    if (body.action === 'execute_job') {
      if (!body.runId || !body.leaseToken) return json({ error: { code: 'lease_required', message: 'Missing lease' } }, 403);
      jobAdmin = createClient(supabaseUrl, env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false, autoRefreshToken: false } });
      // maybeSingle, not single: a run cancelled between enqueue and claim is
      // gone rather than malformed, and .single() threw here and surfaced as a
      // worker-side HTTP 500 instead of a clean release.
      const owned = await client.from('agent_runs').select('id,thread_id').eq('id', body.runId).eq('status', 'running').maybeSingle();
      if (owned.error) throw owned.error;
      if (!owned.data) return json({ error: { code: 'run_unavailable', message: 'Run unavailable' } }, 409);
      const claimed = await jobAdmin.from('agent_jobs').update({ state: 'executing' })
        .eq('run_id', body.runId).eq('lease_token', body.leaseToken).eq('state', 'leased')
        .gt('lease_until', new Date().toISOString()).select('payload,attempts').maybeSingle();
      if (claimed.error) throw claimed.error;
      if (!claimed.data) return json({ error: { code: 'lease_unavailable', message: 'Lease unavailable' } }, 409);
      jobLease = body.leaseToken;
      jobAttempt = claimed.data.attempts;
      activeRunId = body.runId;
      // A previous attempt died mid-stage, so its row still says running: an
      // edge execution killed by its own ceiling leaves no chance to finalize.
      // loadStageState reads a running row as "an earlier attempt that did not
      // get this stage done", which is correct, but the rows also accumulate and
      // make every stage-failure report ambiguous about what is still in flight.
      // Close them before this attempt starts so agent_zombie_stages stays empty.
      if (jobAttempt > 1) {
        const orphaned = await jobAdmin.from('agent_stages').update({
          status: 'failed',
          error: 'abandoned_by_superseding_attempt',
          updated_at: new Date().toISOString(),
        }).eq('run_id', body.runId).eq('status', 'running').lt('attempt', jobAttempt);
        if (orphaned.error) console.warn('Could not close abandoned agent stages', orphaned.error);
      }
      body = { ...claimed.data.payload, action: 'turn', clientRunId: body.runId, threadId: owned.data.thread_id };
    }

    if (body.action === 'threads') {
      const threads = await client
        .from('agent_threads')
        .select('id,title,current_journey_id,created_at,updated_at,journeys(name,photo_uris,deleted_at)')
        .order('updated_at', { ascending: false })
        .limit(50);
      if (threads.error) throw threads.error;
      return json({
        threads: (threads.data || []).filter((thread: any) => {
          if (!thread.current_journey_id) return true;
          const journey = Array.isArray(thread.journeys) ? thread.journeys[0] : thread.journeys;
          return Boolean(journey && !journey.deleted_at);
        }),
      });
    }

    if (body.action === 'journey_thread') {
      if (!body.currentJourneyId) return json({ error: { code: 'journey_required', message: '请选择旅程' } }, 400);
      const thread = await client
        .from('agent_threads')
        .select('id')
        .eq('current_journey_id', body.currentJourneyId)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (thread.error) throw thread.error;
      return json({ threadId: thread.data?.id || null });
    }

    if (body.action === 'gear_set_thread') {
      if (!body.currentGearSetId) return json({ error: { code: 'gear_set_required', message: '请选择装备清单' } }, 400);
      const thread = await client
        .from('agent_threads')
        .select('id,gear_set_review_fingerprint')
        .eq('gear_set_id', body.currentGearSetId)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (thread.error) throw thread.error;
      let reviewFingerprint = thread.data?.gear_set_review_fingerprint || null;
      // The fingerprint is written when the review is submitted, so a run that
      // never produced its answer must not count: its status is 'failed' (a user
      // 停止 stores that same status with cancelled_by_user), and the next tap has
      // to review again instead of opening a thread with no review in it.
      if (reviewFingerprint && thread.data) {
        const latestRun = await client
          .from('agent_runs')
          .select('status')
          .eq('thread_id', thread.data.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (latestRun.error) throw latestRun.error;
        if (latestRun.data?.status === 'failed') reviewFingerprint = null;
      }
      return json({ threadId: thread.data?.id || null, reviewFingerprint });
    }

    if (body.action === 'run_activity') {
      if (!body.runId) return json({ activities: [] });
      await failStaleRuns(client, user.id);
      const [run, activities, metrics] = await Promise.all([
        client.from('agent_runs').select('status,created_at,updated_at').eq('id', body.runId).maybeSingle(),
        client.from('agent_tool_calls').select('tool_name,status,arguments,output,created_at,updated_at').eq('run_id', body.runId).order('created_at'),
        client.from('agent_model_metrics').select('stage,duration_ms,success').eq('run_id', body.runId).order('created_at'),
      ]);
      if (run.error) throw run.error;
      if (activities.error) throw activities.error;
      if (metrics.error) throw metrics.error;
      return json({
        status: run.data?.status,
        runTiming: run.data?.created_at ? { startedAt: run.data.created_at, finishedAt: run.data.status === 'running' ? undefined : run.data.updated_at } : undefined,
        // Raw output: the poll/recovery UI renders search and journey-detail
        // results from these rows, unlike the message UI's filtered projection.
        activities: (activities.data || []).map((activity: any) => ({ ...activityRow(activity), output: activity.output })),
        modelMetrics: (metrics.data || []).map(metricRow),
      });
    }

    if (body.action === 'delete_thread') {
      if (!body.threadId) return json({ error: { code: 'thread_required', message: '请选择要删除的对话' } }, 400);
      const deleted = await client.from('agent_threads').delete().eq('id', body.threadId).select('id').maybeSingle();
      if (deleted.error) throw deleted.error;
      if (!deleted.data) return json({ error: { code: 'thread_not_found', message: '对话不存在' } }, 404);
      return json({ deleted: true });
    }

    if (body.action === 'undo') {
      if (!body.runId) return json({ error: { code: 'run_required', message: '请选择要撤销的操作' } }, 400);
      const undone = await client.rpc('undo_agent_run', { target_run_id: body.runId });
      if (undone.error) {
        console.warn('Could not undo agent run', undone.error);
        return json({ error: { code: 'undo_unavailable', message: '这次更改已无法撤销' } }, 409);
      }
      return json(undone.data);
    }

    if (body.action === 'history') {
      if (!body.threadId) return json({ messages: [] });
      await failStaleRuns(client, user.id, body.threadId);
      const [thread, messages, activeRun] = await Promise.all([
        client.from('agent_threads').select('id,title,current_journey_id').eq('id', body.threadId).maybeSingle(),
        client.from('agent_messages').select('id,role,content,ui,created_at').eq('thread_id', body.threadId).order('created_at'),
        client.from('agent_runs').select('id,status,created_at').eq('thread_id', body.threadId).eq('status', 'running').maybeSingle(),
      ]);
      if (thread.error) throw thread.error;
      if (!thread.data) return json({ error: { code: 'thread_not_found', message: '对话不存在' } }, 404);
      if (messages.error) throw messages.error;
      if (activeRun.error) throw activeRun.error;
      const lastAssistant = [...(messages.data || [])].reverse().find(message => message.role === 'assistant');
      // A turn waiting on the user wrote nothing, so it gets no journey card.
      if (lastAssistant && !lastAssistant.ui?.planPreview && lastAssistant.ui?.taskOutcome?.status !== 'waiting' && thread.data.current_journey_id) {
        const planPreview = await loadSavedPlanPreview(client, thread.data.current_journey_id);
        if (planPreview) lastAssistant.ui = { ...lastAssistant.ui, planPreview };
      }
      if (!activeRun.data) {
        const latestRun = await client.from('agent_runs').select('id,status,execution_mode,created_at,updated_at')
          .eq('thread_id', body.threadId).order('created_at', { ascending: false }).limit(1).maybeSingle();
        if (latestRun.error) throw latestRun.error;
        const lastMessage = messages.data?.at(-1);
        if (latestRun.data?.status === 'failed' && latestRun.data.execution_mode === 'request'
          && lastMessage?.role === 'assistant' && !lastMessage.ui?.createJourneyFlow
          && Date.parse(lastMessage.created_at) >= Date.parse(latestRun.data.created_at)) {
          lastMessage.ui = { ...lastMessage.ui, quickReplies: [{ label: '继续规划', message: '继续规划', action: 'retry_run', runId: latestRun.data.id }] };
        }
      }
      let activities: AgentRunActivity[] = [];
      let modelMetrics: AgentModelMetric[] = [];
      let stages: Array<{ stage: string; status: string; attempt: number; created_at: string; updated_at: string; error: string | null }> = [];
      let runStage: string | null = null;
      if (activeRun.data) {
        const [calls, metrics, stageRows, runRow] = await Promise.all([
          client.from('agent_tool_calls').select('tool_name,status,arguments,output,created_at,updated_at').eq('run_id', activeRun.data.id).order('created_at'),
          client.from('agent_model_metrics').select('stage,duration_ms,success').eq('run_id', activeRun.data.id).order('created_at'),
          client.from('agent_stages').select('stage,status,attempt,created_at,updated_at,error').eq('run_id', activeRun.data.id).order('created_at'),
          client.from('agent_runs').select('stage').eq('id', activeRun.data.id).maybeSingle(),
        ]);
        if (calls.error) throw calls.error;
        if (metrics.error) throw metrics.error;
        if (!stageRows.error) stages = stageRows.data || [];
        runStage = runRow.error ? null : (runRow.data?.stage as string | null) ?? null;
        // Raw output: history turns render action results (gear added,
        // packing committed) from these rows.
        activities = (calls.data || []).map((activity: any) => ({ ...activityRow(activity), output: activity.output }));
        modelMetrics = (metrics.data || []).map(metricRow);
      }
      return json({
        thread: thread.data,
        messages: (messages.data || []).map((message: { ui?: AgentMessageUi }) => ({
          ...message,
          ui: message.ui?.quickReplies ? { ...message.ui, quickReplies: normalizePlanningFollowUps(message.ui.quickReplies) } : message.ui,
        })),
        activeRun: activeRun.data ? {
          id: activeRun.data.id, status: 'running', activities, modelMetrics,
          stage: runStage,
          stages: stages.map((row) => ({
            stage: row.stage, status: row.status, attempt: row.attempt,
            startedAt: row.created_at,
            finishedAt: row.status === 'running' ? undefined : row.updated_at,
            error: row.error ?? undefined,
          })),
          runTiming: { startedAt: activeRun.data.created_at },
        } : undefined,
      });
    }

    if (body.action !== 'turn' || !body.message?.trim()) return json({ error: { code: 'message_required', message: '请输入内容' } }, 400);
    // Older and newer clients may send intents this version does not know;
    // they are treated as absent so the request still runs through the router.
    if (!isAgentIntent(body.intent)) body.intent = undefined;
    if (!jobLease && validClientRunId(body.clientRunId)) {
      const existingRun = await client.from('agent_runs').select('id,thread_id,status,final_output').eq('id', body.clientRunId).maybeSingle();
      if (existingRun.error) throw existingRun.error;
      if (existingRun.data) {
        const run = existingRun.data;
        const reply = await client.from('agent_messages').select('ui').eq('thread_id', run.thread_id)
          .eq('role', 'assistant').contains('ui', { requestId: run.id }).maybeSingle();
        if (reply.error) throw reply.error;
        const ui = reply.data?.ui || (run.status === 'completed' ? await messageUiForRun(client, run.id, []) : undefined);
        return json({ runId: run.id, threadId: run.thread_id, status: run.status, message: run.final_output,
          ui, quickReplies: ui?.quickReplies });
      }
      if (body.askDeparture) {
        const asked = await client.from('agent_messages').select('id,thread_id,content,ui').eq('role', 'assistant')
          .contains('ui', { requestId: body.clientRunId }).maybeSingle();
        if (asked.error) throw asked.error;
        if (asked.data) return json({ runId: body.clientRunId, threadId: asked.data.thread_id, status: 'completed',
          message: asked.data.content, ui: asked.data.ui, messageId: asked.data.id });
      }
    }
    const displayMessage = body.displayMessage?.trim() || body.message.trim();
    let threadId = body.threadId;
    let resolvedCurrentJourneyId = body.currentJourneyId;
    if (body.currentJourneyId && !jobLease) {
      const existing = await client
        .from('agent_threads')
        .select('id')
        .eq('current_journey_id', body.currentJourneyId)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (existing.error) throw existing.error;
      // A journey has one active conversation in the product UI. Treat the
      // newest server thread as authoritative so stale devices cannot keep
      // writing to an older thread with the same journey title.
      threadId = existing.data?.id || threadId;
    }
    // 清单判官 records what it reviewed; anything else leaves the fingerprint of
    // the last review alone.
    const gearSetReviewFingerprint = body.currentGearSetId && body.intent === 'gear_set_review'
      ? body.gearSetReviewFingerprint?.trim().slice(0, 200) || undefined
      : undefined;
    if (body.currentGearSetId && !jobLease) {
      const existing = await client
        .from('agent_threads')
        .select('id')
        .eq('gear_set_id', body.currentGearSetId)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (existing.error) throw existing.error;
      // A gear set has one conversation, for the same reason a journey does.
      threadId = existing.data?.id || threadId;
    }
    if (threadId) {
      const thread = await client.from('agent_threads').select('id,current_journey_id,gear_set_id').eq('id', threadId).single();
      if (thread.error) return json({ error: { code: 'thread_not_found', message: '对话不存在' } }, 404);
      if (body.currentJourneyId && thread.data.current_journey_id && thread.data.current_journey_id !== body.currentJourneyId) {
        return json({ error: { code: 'journey_thread_mismatch', message: '该会话属于另一个旅程' } }, 409);
      }
      if (body.currentGearSetId && thread.data.gear_set_id && thread.data.gear_set_id !== body.currentGearSetId) {
        return json({ error: { code: 'gear_set_thread_mismatch', message: '该会话属于另一个装备清单' } }, 409);
      }
      const links: Record<string, unknown> = {};
      if (body.currentJourneyId) links.current_journey_id = body.currentJourneyId;
      if (body.currentGearSetId) links.gear_set_id = body.currentGearSetId;
      if (gearSetReviewFingerprint) links.gear_set_review_fingerprint = gearSetReviewFingerprint;
      if (Object.keys(links).length) {
        const updated = await client.from('agent_threads').update(links).eq('id', threadId);
        if (updated.error) throw updated.error;
      }
      resolvedCurrentJourneyId = body.currentJourneyId || thread.data.current_journey_id || undefined;
    } else {
      const newThreadId = validClientRunId(body.clientRunId) || crypto.randomUUID();
      const created = await client.from('agent_threads').upsert({ id: newThreadId, user_id: user.id, current_journey_id: body.currentJourneyId || null, gear_set_id: body.currentGearSetId || null, gear_set_review_fingerprint: gearSetReviewFingerprint || null, title: displayMessage.slice(0, 36) }, { onConflict: 'id', ignoreDuplicates: true });
      if (created.error) throw created.error;
      threadId = newThreadId;
    }
    if (!threadId) throw new Error('Thread could not be resolved');
    activeThreadId = threadId;

    const uploadedNow = validAttachments(body.attachments, user.id);
    const conversationFiles: AgentAttachment[][] = [];
    if (!jobLease) {
      for (let offset = 0; ; offset += 100) {
        const history = await client.from('agent_messages').select('ui').eq('thread_id', threadId)
          .eq('role', 'user').not('ui->attachments', 'is', null)
          .order('created_at', { ascending: false }).range(offset, offset + 99);
        if (history.error) throw history.error;
        for (const message of history.data || []) conversationFiles.push(validAttachments(message.ui?.attachments, user.id));
        if ((history.data?.length || 0) < 100) break;
      }
    }
    const availableAttachments = conversationAttachments(uploadedNow,
      validAttachments(body.conversationAttachments, user.id), conversationFiles);
    // Keep the most recent track available even when newer uploads are photos/documents.
    const latestTrack = availableAttachments.find(isTrackAttachment);
    let attachments = (latestTrack
      ? [latestTrack, ...availableAttachments.filter((attachment) => !isTrackAttachment(attachment))]
      : availableAttachments).slice(0, 6);
    let effectiveMessage = body.message.trim();
    const departure = typeof body.departure === 'string' ? body.departure.trim().slice(0, 200) : '';
    const runId = validClientRunId(body.clientRunId) || crypto.randomUUID();

    if (!jobLease && body.askDeparture) {
      const ui = departurePromptUi({ message: effectiveMessage, intent: body.intent }, runId, body.locale);
      const question = departureQuestion(body.locale);
      // Separate statements, so the question sorts after the request.
      const asked = await client.from('agent_messages').insert({ thread_id: threadId, user_id: user.id, role: 'user', content: displayMessage, ui: { attachments: uploadedNow } });
      if (asked.error) throw asked.error;
      const prompt = await client.from('agent_messages').insert({ thread_id: threadId, user_id: user.id, role: 'assistant', content: question, ui }).select('id').single();
      if (prompt.error) throw prompt.error;
      const touched = await client.from('agent_threads').update({ updated_at: new Date().toISOString() }).eq('id', threadId);
      if (touched.error) throw touched.error;
      return json({ threadId, runId, status: 'completed', message: question, ui, messageId: prompt.data.id });
    }

    // A departure answers the newest question. One stored with a plan request
    // starts that plan; one a stopped run asked resumes the run's task.
    const departureAnswers = Boolean(departure) && body.departureWithRequest !== true;
    let resumeWaitingPlan = jobLease ? (body.resumeWaitingPlan ?? departureAnswers) : departureAnswers;
    let answeredPrompt: { id: string; ui: AgentMessageUi } | null = null;
    if (!jobLease && departureAnswers) {
      const latest = await client.from('agent_messages').select('id,ui').eq('thread_id', threadId).eq('role', 'assistant')
        .order('created_at', { ascending: false }).limit(1).maybeSingle();
      if (latest.error) throw latest.error;
      const prompt = pendingDeparturePrompt(latest.data);
      if (prompt && latest.data) {
        answeredPrompt = latest.data;
        if (prompt.request) {
          effectiveMessage = prompt.request.message;
          body.intent = isAgentIntent(prompt.request.intent) ? prompt.request.intent : undefined;
          resumeWaitingPlan = false;
        }
      }
    }
    await failStaleRuns(client, user.id, threadId);
    if (!jobLease) {
      const queued = await client.rpc('enqueue_agent_job', {
        p_run_id: runId, p_thread_id: threadId, p_display_message: displayMessage, p_version: AGENT_VERSION,
        p_payload: { message: effectiveMessage, displayMessage, currentJourneyId: resolvedCurrentJourneyId, intent: body.intent,
          locale: body.locale, currentLocation: normalizeAgentLocation(body.currentLocation), departure: departure || undefined, resumeWaitingPlan, attachments: uploadedNow, conversationAttachments: attachments, clientLocalDate: body.clientLocalDate, clientLocalTime: body.clientLocalTime,
          clientTimeZone: body.clientTimeZone, clientTimestamp: body.clientTimestamp },
      });
      if (queued.error) {
        const code = ['quota_exceeded','concurrency_exceeded'].find(code=>queued.error.message.includes(code));
        if (code) throw new ResourceError(code);
        throw queued.error;
      }
      if (answeredPrompt) {
        const answered = await client.from('agent_messages').update({ ui: answeredDeparturePrompt(answeredPrompt.ui, departure) }).eq('id', answeredPrompt.id);
        if (answered.error) console.warn('Could not mark the departure question answered', answered.error);
      }
      return json(queued.data, 202);
    }
    activeRunId = runId;
    shouldPersistFailure = true;
    const config = agentModelConfig();
    const temporalContext = agentTemporalContext(body);
    const recordMetric = async (metric: ModelMetric) => {
      // attempt matches the agent_stages attempt the pipeline runs under, so a
      // resumed job's model calls stay separable from the attempt that made
      // them. Without it, summing a stage's calls attributed three aborted
      // attempts to one stage and made model time look larger than wall time.
      const result = await jobAdmin.from('agent_model_metrics').insert({ ...metric, attempt: Math.max(1, jobAttempt), run_id: runId, user_id: user.id });
      if (result.error) throw result.error;
    };
    const budget = modelBudget(jobAdmin,'run:'+runId);
    const interpretation = createAgentRuntime(config, false, undefined, recordMetric, budget);
    // The smart plan command carries no text the server trusts: the request is
    // rebuilt from the journey it names. A journey that cannot be read leaves
    // the app's message to the checked model path.
    const smartPlan = body.intent === 'smart_plan' && resolvedCurrentJourneyId
      ? await loadSmartPlanJourney(client, resolvedCurrentJourneyId) : null;
    if (smartPlan) effectiveMessage = smartPlanMessage(smartPlan, body.locale);
    const task = await prepareTask(client, jobAdmin, {
      runId, threadId, userId: user.id, journeyId: resolvedCurrentJourneyId || null,
      message: effectiveMessage, intent: body.intent, temporalContext,
      attachments: attachments.map(({ name, kind }) => ({ name, kind })),
      routerMode: intentRouterMode(Deno.env.get('KAIPA_INTENT_ROUTER')),
      resumeWaitingPlan,
      // Kill switch for the rule-based gear add (gear-fast-path.ts).
      gearFastPath: Deno.env.get('KAIPA_GEAR_FAST_PATH')?.trim().toLowerCase() !== 'off',
      turnHasAttachments: uploadedNow.length > 0,
      smartPlan,
    }, interpretation.interpret,
    input => checkTopic(input, { url: Deno.env.get('TOPIC_GUARD_URL') || '',
      token: Deno.env.get('TOPIC_GUARD_TOKEN') || '', budget, recordMetric }),
    interpretation.route);
    if (task.decision.offTopic) {
      // Stop before context hydration, attachment parsing, plan quota and the
      // conversational runtime. No business tool is exposed for this turn.
      const output = offTopicResponse(body.locale);
      const ui: AgentMessageUi = {
        requestId: runId, quickReplies: output.quickReplies,
        taskOutcome: taskOutcome(task, output, []),
      };
      const finalized = await client.rpc('finalize_agent_run', {
        target_run_id: runId, assistant_message: output.text, message_ui: ui,
      });
      if (finalized.error) throw finalized.error;
      const finished = await jobAdmin.rpc('finish_agent_job', { p_run_id: runId, p_lease: jobLease });
      if (finished.error) throw finished.error;
      shouldPersistFailure = false;
      return json({ threadId, runId, status: 'completed', message: output.text,
        quickReplies: ui.quickReplies, ui } satisfies AgentResponse);
    }
    const clarification = taskClarification(task);
    if (clarification) {
      // The routed request could write different data or lacks its target.
      // Ask before any pipeline, conversational runtime or plan quota; each
      // option sends a complete instruction that authorizes the next turn.
      const output = {
        text: clarification.question,
        quickReplies: clarification.options.map(({ label, message }): AgentQuickReply => ({ label, message })),
        pendingQuestion: clarification.question, draft: null,
      };
      const ui: AgentMessageUi = {
        requestId: runId, quickReplies: output.quickReplies,
        taskOutcome: taskOutcome(task, output, []),
      };
      const finalized = await client.rpc('finalize_agent_run', {
        target_run_id: runId, assistant_message: output.text, message_ui: ui,
      });
      if (finalized.error) throw finalized.error;
      const finished = await jobAdmin.rpc('finish_agent_job', { p_run_id: runId, p_lease: jobLease });
      if (finished.error) throw finished.error;
      shouldPersistFailure = false;
      return json({ threadId, runId, status: 'completed', message: output.text,
        quickReplies: ui.quickReplies, ui } satisfies AgentResponse);
    }
    // Tool writes carry the run id so the database attributes them to this run.
    const agentClient = createClient(supabaseUrl, anonKey, {
      global: {
        headers: {
          Authorization: `Bearer ${token}`,
          'x-kaipa-agent-run-id': runId,
        },
      },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    if (task.rules?.intent === 'gear_add') {
      // Rules already parsed the items. Each one goes through the add_gear tool
      // (scope check, dedupe, tool-call audit) one at a time, then the outcome
      // is checked against the recorded calls like any other turn.
      const context: AgentContext = { userId: user.id, threadId, runId, task, originalUserMessage: effectiveMessage, locale: body.locale };
      bindRunClient(runId, agentClient, jobAdmin);
      const added: string[] = [], existing: string[] = [], failed: string[] = [];
      for (const item of task.rules.items) {
        const result = await addGear.invoke({ context } as never, JSON.stringify(item), undefined);
        // The SDK turns a thrown tool error into a message string.
        const output = (typeof result === 'string' ? parseJsonString(result) : result) as { id?: unknown; name?: string; existing?: boolean } | string | null;
        const name = output && typeof output === 'object' && output.name || item.name;
        if (output && typeof output === 'object' && output.id) {
          if (output.existing) existing.push(name);
          else added.push(item.quantity > 1 ? `${name} ×${item.quantity}` : name);
        } else failed.push(item.name);
      }
      const output = { text: gearFastPathReply(added, existing, failed, body.locale), quickReplies: [] as AgentQuickReply[],
        pendingQuestion: null, draft: null, blocker: failed.length ? failed.join('、') : null };
      const ui = await messageUiForRun(client, runId, [], false, body.locale, null);
      ui.taskOutcome = taskOutcome(task, output, ui.activities || []);
      ui.requestId = runId;
      // Partial keeps the item-by-item reply; the generic partial text would hide which ones failed.
      const message = output.text;
      const finalized = await client.rpc('finalize_agent_run', { target_run_id: runId, assistant_message: message, message_ui: ui });
      if (finalized.error) throw finalized.error;
      const finished = await jobAdmin.rpc('finish_agent_job', { p_run_id: runId, p_lease: jobLease });
      if (finished.error) throw finished.error;
      shouldPersistFailure = false;
      // Later model turns in this thread read the session, not agent_messages.
      try {
        await new SupabaseAgentSession(client, threadId, user.id, interpretation.summarize).addItems([
          { type: 'message', role: 'user', content: effectiveMessage },
          { type: 'message', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text: message }] },
        ]);
      } catch (error) {
        console.warn('[AppAgent] session history unavailable', error instanceof Error ? error.message : error);
      }
      return json({ threadId, runId, status: 'completed', message, quickReplies: ui.quickReplies, ui } satisfies AgentResponse);
    }
    if (task.decision.mode === 'execute' && task.decision.fullHikingPlan === true && !resolvedCurrentJourneyId) {
      const itineraryCard = await buildItineraryCard({ message: effectiveMessage, temporalContext,
        currentJourneyId: resolvedCurrentJourneyId }, {
        extract: input => extractItineraryBrief(interpretation, input),
        loadPlans: async () => {
          const plans = [];
          for (let offset = 0; ; offset += 500) {
            const result = await jobAdmin.from('route_itineraries')
              .select('id,version,route_id,is_default,payload').eq('status', 'published')
              .order('id').range(offset, offset + 499);
            if (result.error) throw result.error;
            plans.push(...(result.data || []));
            if ((result.data?.length || 0) < 500) break;
          }
          return plans;
        },
        loadRoutes: async ids => {
          if (!ids.length) return [];
          const result = await jobAdmin.from('routes').select('id,name').in('id', ids);
          if (result.error) throw result.error;
          return result.data || [];
        },
      });
      if (itineraryCard) {
        const message = body.locale === 'en'
          ? `${itineraryCard.routeName} has an official plan. Open it to review and save it as a journey.`
          : `${itineraryCard.routeName}有官方方案，点开查看后可以保存为旅程。`;
        const ui: AgentMessageUi = { requestId: runId, itineraryCard,
          taskOutcome: { status: 'completed', pendingQuestion: null, draft: null, missingOperations: [] } };
        const finalized = await client.rpc('finalize_agent_run', {
          target_run_id: runId, assistant_message: message, message_ui: ui,
        });
        if (finalized.error) throw finalized.error;
        const finished = await jobAdmin.rpc('finish_agent_job', { p_run_id: runId, p_lease: jobLease });
        if (finished.error) throw finished.error;
        shouldPersistFailure = false;
        return json({ threadId, runId, status: 'completed', message, ui } satisfies AgentResponse);
      }
    }
    if (task.decision.mode === 'execute' && (task.decision.fullHikingPlan || task.decision.packingMode === 'full' || task.decision.domain === 'transport')) {
      const reservation = await resourceRpc(jobAdmin,'reserve_resource',{p_user:user.id,p_resource:'ai_plans',p_request_key:'run:'+runId,p_amount:1,p_ttl_seconds:3600});
      if (reservation.state === 'released') await resourceRpc(jobAdmin,'reopen_resource_reservation',{p_id:reservation.id});
    }
    attachments = attachments.filter(attachment => !isTrackAttachment(attachment) || attachment.name === task.decision.trackAttachmentName);
    const runtime = createAgentRuntime(config, Boolean(resolvedCurrentJourneyId), task, recordMetric, budget);
    const context: AgentContext = {
      userId: user.id,
      threadId,
      runId,
      currentJourneyId: resolvedCurrentJourneyId,
      currentLocation: normalizeAgentLocation(body.currentLocation),
      task,
      originalUserMessage: effectiveMessage,
      attachments,
    };
    // Tool reads/writes use the user-scoped client; shared external cache access
    // is isolated behind service-role RPCs and never exposed to the client JWT.
    bindRunClient(runId, agentClient, jobAdmin);
    bindPackingDraftStore(runId, jobAdmin);
    const touchedThread = await client.from('agent_threads').update({ updated_at: new Date().toISOString() }).eq('id', threadId);
    if (touchedThread.error) throw touchedThread.error;

    const session = new SupabaseAgentSession(client, threadId, user.id, runtime.summarize);
    shouldPersistFailure = true;
    const dataContext = await prepareAgentContext(agentClient, context);
    // Once a file is bound to a journey, use its versioned summary instead of
    // downloading and parsing the same GPX/KML again on every conversation turn.
    const boundTrack = resolvedCurrentJourneyId && attachments.some(isTrackAttachment)
      ? await client.from('journeys').select('tracks ( file_url )').eq('id', resolvedCurrentJourneyId).single()
      : { data: null, error: null };
    if (boundTrack.error) throw boundTrack.error;
    const boundTrackUrl = (boundTrack.data?.tracks as { file_url?: string | null } | null)?.file_url;
    const attachmentInputs = await Promise.all(attachments.map(attachment => isTrackAttachment(attachment) && attachment.url === boundTrackUrl
      ? { type: 'input_text' as const, text: `轨迹文件“${attachment.name}”已绑定当前旅程。使用本轮有效 track 摘要；缺失时只读取 track 分区，不必重新解析原文件。` }
      : attachmentInput(attachment, client, user.id)));
    const uploadedTrack = attachments.find(isTrackAttachment);
    const attachmentContext = uploadedTrack && resolvedCurrentJourneyId
      ? `\n系统附件状态：会话已有轨迹“${uploadedTrack.name}”。当前旅程已存在，以其版本化轨迹摘要为准，不创建另一旅程，不重复要求上传。`
      : uploadedTrack
      ? `\n系统附件状态：本任务已选择可用轨迹“${uploadedTrack.name}”。只有任务允许创建时才绑定该文件；讨论和比较不创建旅程。不重复要求上传。`
      : attachments.length
      ? `\n系统附件状态：当前会话可用的附件（包括先前消息）：${attachments.map((attachment) => attachment.name).join('、')}。`
      : '';
    const previousCalls = await client.from('agent_tool_calls').select('id').eq('run_id', runId).eq('status', 'completed').limit(1);
    if (previousCalls.error) throw previousCalls.error;
    const recoveryContext = previousCalls.data?.length || jobAttempt > 1
      ? '\n这是同一任务的恢复执行。先读取当前旅程及已保存的数据，只补齐尚未完成的内容，不要重复创建旅程或重复添加已存在的旅程和装备。复用本任务已有的攻略搜索结果和已读取正文，不要换近义关键词重新检索；恢复执行不会重置搜索额度。'
        + (jobAttempt > 1 ? '上一次执行没有产出符合结构要求的结果：本轮必须以结构化结果结束。写入被拒绝时把原因写进 blocker 并在正文说明，不要只输出一段解释性文字。' : '')
      : '';
    const savedPackingDraft = task.decision.packingMode === 'full' ? await readPackingDraft(client, runId) : null;
    const packingRecovery = savedPackingDraft
      ? `\nA durable packing draft already exists for this run (revision ${savedPackingDraft.state.revision}). Call read_packing_draft, repair only its issues, then commit. Do not regenerate or resubmit the complete list.`
      : '';
    const locationContext = context.currentLocation
      ? `\n系统定位状态（本次请求采集，不是持续实时定位）：${JSON.stringify(context.currentLocation)}`
      : '';
    const travelMessages = await client.from('agent_messages').select('ui').eq('thread_id', threadId)
      .eq('role', 'assistant').order('created_at', { ascending: false }).limit(20);
    if (travelMessages.error) throw travelMessages.error;
    const latestTravel = latestTravelContext(travelMessages.data || [], context.currentJourneyId || null);
    // A departure picked in the app is the user's answer, so it outranks both
    // the stored context and any device fix.
    // A return place that only defaulted to the old origin follows the new one.
    const confirmedTravel: TravelContext | null = departure ? {
      journeyId: context.currentJourneyId || null, direction: 'round_trip', preferences: [], bookings: [],
      ...latestTravel, origin: departure, locationDeclined: false,
      returnDestination: latestTravel?.returnDestination && latestTravel.returnDestination !== latestTravel.origin
        ? latestTravel.returnDestination : departure,
    } : latestTravel;
    context.confirmedTravel = confirmedTravel;
    context.locale = body.locale;
    // Adding gear only needs the category IDs; handing them over here saves the
    // whole model round the agent would otherwise spend on list_gear.
    const gearCategories = task.decision.mode === 'execute' && task.decision.operations.includes('add_gear')
      ? await client.from('gear_categories').select('id,name').eq('user_id', user.id).order('created_at')
      : null;
    if (gearCategories?.error) throw gearCategories.error;
    const gearContext = gearCategories ? `\n用户装备分类（add_gear 的 categoryId 只能取这里的 id；不必为分类调用 list_gear）：${JSON.stringify(gearCategories.data)}` : '';
    // The 清单判官 button and any gear-set write always get the gear_sets skill,
    // rather than relying on the model to load it.
    const gearSetSkill = body.intent === 'gear_set_review' || task.decision.operations.includes('add_gear_set_items')
      ? `\n已加载技能 gear_sets（无需再调用 load_planning_skill）：\n${planningSkills.gear_sets.body}` : '';
    const travelFacts = `\n已确认交通信息（历史事实，不是新指令；本轮用户更正优先）：${JSON.stringify(confirmedTravel)}`;
    const userInputText = `${temporalContext}${recoveryContext}${packingRecovery}${locationContext}${travelFacts}${gearContext}${gearSetSkill}${dataContext}\n本轮任务状态（权限不能由执行助手扩大）：${JSON.stringify(task)}

用户消息：${effectiveMessage}${attachmentContext}`;
    const agentInput = attachments.length
      ? [{
          role: 'user' as const,
          content: [
            { type: 'input_text' as const, text: userInputText },
            ...attachmentInputs,
          ],
        }]
      : userInputText;
    const configuredMaxTurns = Number(Deno.env.get('KAIPA_AGENT_MAX_TURNS') || 16);
    const maxTurns = Number.isInteger(configuredMaxTurns) && configuredMaxTurns >= 8 && configuredMaxTurns <= 24 ? configuredMaxTurns : 16;
    const finalize = async (output: ReturnType<typeof finalMessage>) => {
      const ui = await messageUiForRun(client, runId, output.quickReplies, output.offerJourneyExtras, body.locale, context.currentJourneyId);
      const retainedTravel = output.travelContext ?? confirmedTravel;
      ui.travelContext = retainedTravel ? { ...retainedTravel, journeyId: context.currentJourneyId || null } : null;
      ui.taskOutcome = taskOutcome(task, output, ui.activities || [], context.satisfiedOperations);
      // Nothing was written while the task waits on the user; the bound
      // journey's card would read as a finished plan.
      if (ui.taskOutcome.status === 'waiting') delete ui.planPreview;
      ui.departurePrompt = stoppedRunDeparturePrompt(ui);
      if (ui.taskOutcome.status !== 'completed' || task.decision.mode !== 'execute') {
        ui.quickReplies = ui.quickReplies?.filter(reply => reply.action !== 'supplement_plan');
      }
      const message = renderTaskResponse(output, ui.taskOutcome, body.locale, ui.planPreview?.title);
      ui.requestId = runId;
      const finalized = await client.rpc('finalize_agent_run', { target_run_id: runId, assistant_message: message, message_ui: ui });
      if (finalized.error) throw finalized.error;
      const finished = await jobAdmin.rpc('finish_agent_job', { p_run_id: runId, p_lease: jobLease });
      if (finished.error) throw finished.error;
      shouldPersistFailure = false;
      return { message, ui };
    };
    const completedResponse = (done: { message: string; ui: AgentMessageUi }) =>
      json({ threadId, runId, status: 'completed', message: done.message, quickReplies: done.ui.quickReplies, ui: done.ui } satisfies AgentResponse);
    // Long planning work runs as a staged pipeline; single edits, deletions,
    // undo and discussion keep the interactive loop unchanged.
    let output: ReturnType<typeof finalMessage>;
    if (useStagedPipeline(task.decision)) {
      // Pipeline stages run on in-memory sessions, so the user turn must reach
      // session history before any model work: a retried attempt then reuses
      // the persisted item instead of appending a duplicate (session items
      // carry no run id).
      if (jobAttempt <= 1) {
        try {
          await session.addItems([{ type: 'message', role: 'user', content: userInputText }]);
        } catch (error) {
          console.warn('[AppAgent] session history unavailable', error instanceof Error ? error.message : error);
        }
      }
      const result = await runPipeline({
        admin: jobAdmin, client: agentClient, context, task, runId, userId: user.id,
        attempt: jobAttempt, signal: req.signal, userInput: userInputText, agentInput,
        stageAgent: runtime.stageAgent, model: runtime.model, flashModel: runtime.flashModel,
        invoke: (agent, input, options) => runtime.runner
          .run(agent as never, input as never, { context, maxTurns: options.maxTurns, signal: options.signal, session: options.session as never })
          .then(run => run.finalOutput),
      });
      // The run was cancelled or reclaimed while this execution was working;
      // the job row already reflects that, so there is nothing to finalize.
      if (result.aborted) return json({ accepted: true });
      output = finalMessage(result.finalOutput);
      const done = await finalize(output);
      // Losing the assistant reply must not fail an otherwise saved plan.
      try {
        await session.addItems([
          { type: 'message', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text: done.message }] },
        ]);
      } catch (error) {
        console.warn('[AppAgent] session history unavailable', error instanceof Error ? error.message : error);
      }
      return completedResponse(done);
    }
    let agentOutput: unknown;
    try {
      // A regenerate turn (read, estimate, delete, full draft, commit) needs
      // more than one draft model call; 210s aborted exactly as durable drafts
      // finished writing. Keep well under the worker's 700s fetch timeout.
      const result = await runtime.runner.run(runtime.agent, agentInput, { context, session, maxTurns, signal: AbortSignal.timeout(420000) });
      agentOutput = result.finalOutput;
    } catch (error) {
      // The configured provider sometimes answers in prose instead of the
      // structured result, for example when a write was rejected and the
      // explanation is the useful part. The answer itself is already in the
      // session, so keep it as plain text instead of failing the whole turn.
      const salvaged = await salvagedAnswer(error, session);
      if (salvaged === undefined) throw error;
      agentOutput = salvaged;
    }
    output = finalMessage(agentOutput);
    const done = await finalize(output);
    return completedResponse(done);
  } catch (error) {
    console.error('app-agent failed', error);
    if (activeUserId && error instanceof ResourceError) {
      try {await resourceRpc(serviceClient(),'record_resource_admission',{p_user:activeUserId,p_scope:'ai',p_result:error.code});} catch { /* retain denial */ }
    }
    if (jobLease && jobAdmin && activeRunId) {
      const errorText = error instanceof Error ? error.message : String(error);
      const invalidTrack = error instanceof InvalidTrackError;
      // A stage budget abort is deterministic for the same input. Retrying the
      // research stage repeats the same expensive searches and leaves the UI
      // looking stuck for three lease attempts, without adding evidence.
      const retryable = !invalidTrack && !(error instanceof ResourceError)
        && !/quota_exceeded|service_budget_exceeded|concurrency_exceeded/.test(errorText)
        && !/Request was aborted|AbortError|signal is aborted/i.test(errorText)
        && !/\b(400|401|403|404|422)\b/.test(errorText);
      const ui = activeClient ? await messageUiForRun(activeClient, activeRunId, []).catch(() => ({} as AgentMessageUi)) : {};
      const finished = await jobAdmin.rpc('finish_agent_job', {
        p_run_id: activeRunId, p_lease: jobLease, p_error: invalidTrack ? `invalid_track:${errorText}` : errorText,
        p_retryable: retryable, p_activities: ui.activities || [],
      });
      if (finished.error) console.error('Could not persist job outcome', finished.error);
      return json({ accepted: true });
    }
    if (activeRunId && activeClient) {
      await activeClient.from('agent_runs').update({
        status: 'failed',
        error: error instanceof Error ? error.message : String(error),
        updated_at: new Date().toISOString(),
      }).eq('id', activeRunId).eq('status', 'running');
    }
    if (shouldPersistFailure && activeClient && activeThreadId && activeUserId) {
      const failedAt = new Date().toISOString();
      await Promise.all([
        activeClient.from('agent_messages').insert({
          thread_id: activeThreadId,
          user_id: activeUserId,
          role: 'assistant',
          content: '这次处理没有完成，请稍后重试。',
          ui: {},
        }),
        activeClient.from('agent_threads').update({ updated_at: failedAt }).eq('id', activeThreadId),
      ]);
    }
    if (error instanceof ResourceError) return resourceFailure(error);
    return json({ error: { code: 'agent_failed', message: 'AI 助手暂时不可用，请稍后重试' } }, 500);
  } finally {
    if (activeRunId) { releaseRunClient(activeRunId); releasePackingDraftStore(activeRunId); }
  }
});
