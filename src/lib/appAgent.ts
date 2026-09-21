import { supabase } from './supabase';
import { withAgentDeadline } from './agentRecovery';

export interface AgentQuickReply {
  label: string;
  message: string;
  action?: 'upload_track' | 'skip_track' | 'retry_run' | 'supplement_plan' | 'request_location';
  runId?: string;
}

export interface AgentSource {
  title: string;
  url: string;
  source?: string;
  snippet?: string;
  publishedAt?: string;
}

export interface AgentAttachment {
  kind: 'image' | 'file';
  name: string;
  url: string;
  mimeType: string;
  size?: number;
}

export interface AgentPlanPreview {
  journeyId: string;
  title: string;
  dateLabel?: string;
  days: Array<{
    label: string;
    items: Array<{ title: string; timeStart?: number; timeEnd?: number }>;
  }>;
}

export interface AgentUndoAction {
  runId: string;
  undoneAt?: string;
}

export interface AgentModelMetric {
  stage: string;
  durationMs: number;
  success: boolean;
}

export type AgentStageName = 'interpret' | 'research' | 'transport' | 'plan' | 'save' | 'packing' | 'respond';

/** Durable progress of a staged pipeline run; empty for the interactive path. */
export interface AgentStage {
  stage: AgentStageName;
  // 'degraded' is a finished stage whose artifact is usable but incomplete,
  // such as a plan that fell back to the journey without any itinerary.
  status: 'queued' | 'running' | 'completed' | 'skipped' | 'failed' | 'degraded';
  attempt: number;
  startedAt?: string;
  finishedAt?: string;
  error?: string;
}

export interface AgentMessageUi {
  travelContext?: import('../../supabase/functions/app-agent/travel-context').TravelContext | null;
  requestId?: string;
  quickReplies?: AgentQuickReply[];
  sources?: AgentSource[];
  planPreview?: AgentPlanPreview;
  activities?: AgentRunActivity[];
  modelMetrics?: AgentModelMetric[];
  runTiming?: { startedAt: string; finishedAt?: string };
  attachments?: AgentAttachment[];
  undoAction?: AgentUndoAction;
  createJourneyFlow?: { step: 'collect_date' | 'collect_duration' | 'collect_date_and_duration' | 'ask_track'; originalMessage: string };
  trackPrompt?: { message: string; intent?: AgentIntent };
}

export interface AgentRunActivity {
  toolName: string;
  status: 'running' | 'completed' | 'failed';
  startedAt?: string;
  finishedAt?: string;
  durationMs?: number;
  arguments: Record<string, unknown>;
  output?: unknown;
}

export type AgentIntent = 'plan_journey';

export interface AgentTurnResponse {
  threadId: string;
  runId: string;
  status: 'completed' | 'running' | 'failed';
  message?: string;
  quickReplies?: AgentQuickReply[];
  ui?: AgentMessageUi;
}

export interface AgentHistoryMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  ui?: AgentMessageUi;
  created_at: string;
}

export interface AgentHistoryResponse {
  thread: { id: string; title: string; current_journey_id: string | null };
  messages: AgentHistoryMessage[];
  activeRun?: {
    id: string;
    status: 'running';
    activities: AgentRunActivity[];
    modelMetrics?: AgentModelMetric[];
    runTiming?: { startedAt: string; finishedAt?: string };
    stage?: AgentStageName | null;
    stages?: AgentStage[];
  };
}

export interface AgentThreadSummary {
  id: string;
  title: string;
  current_journey_id: string | null;
  created_at: string;
  updated_at: string;
  journeys: { name: string; photo_uris: unknown; deleted_at: string | null } | Array<{ name: string; photo_uris: unknown; deleted_at: string | null }> | null;
}

async function invoke<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await withAgentDeadline((signal) => supabase.functions.invoke<T>('app-agent', { body, signal }));
  if (error) throw new Error(error.message || 'App agent request failed');
  if (!data) throw new Error('App agent returned no data');
  return data;
}

export function sendAgentTurn(args: { message: string; displayMessage?: string; threadId?: string; currentJourneyId?: string; currentLocation?: import('./agentLocation').AgentLocation; intent?: AgentIntent; locale?: 'zh' | 'en'; clientRunId?: string; attachments?: AgentAttachment[]; clientLocalDate?: string; clientLocalTime?: string; clientTimeZone?: string; clientTimestamp?: string }) {
  return invoke<AgentTurnResponse>({ action: 'turn', ...args });
}

export function getAgentHistory(threadId: string) {
  return invoke<AgentHistoryResponse>({ action: 'history', threadId });
}

export function retryAgentRun(runId: string) {
  return invoke<AgentTurnResponse>({ action: 'retry_run', runId });
}

export function cancelAgentRun(runId: string) {
  return invoke<{ cancelled: true }>({ action: 'cancel_run', runId });
}

export async function getAgentThreads() {
  const result = await supabase
    .from('agent_threads')
    .select('id,title,current_journey_id,created_at,updated_at,journeys(name,photo_uris,deleted_at)')
    .order('updated_at', { ascending: false })
    .limit(50);
  if (result.error) throw result.error;
  const threads = (result.data || []) as AgentThreadSummary[];
  return {
    threads: threads.filter((thread) => {
      if (!thread.current_journey_id) return true;
      const journey = Array.isArray(thread.journeys) ? thread.journeys[0] : thread.journeys;
      return Boolean(journey && !journey.deleted_at);
    }),
  };
}

export async function getJourneyAgentThread(journeyId: string) {
  const result = await withAgentDeadline(async (signal) => supabase
    .from('agent_threads')
    .select('id')
    .eq('current_journey_id', journeyId)
    .order('updated_at', { ascending: false })
    .limit(1)
    .abortSignal(signal)
    .maybeSingle());
  if (result.error) throw result.error;
  return { threadId: result.data?.id || null };
}

export async function getAgentRunActivity(runId: string) {
  const [run, calls, metrics, stages] = await withAgentDeadline(async (signal) => Promise.all([
    supabase.from('agent_runs').select('status,thread_id,created_at,updated_at,execution_mode,stage').eq('id', runId).abortSignal(signal).maybeSingle(),
    supabase.from('agent_tool_calls').select('tool_name,status,arguments,output,created_at,updated_at').eq('run_id', runId).order('created_at').abortSignal(signal),
    supabase.from('agent_model_metrics').select('stage,duration_ms,success').eq('run_id', runId).order('created_at').abortSignal(signal),
    supabase.from('agent_stages').select('stage,status,attempt,created_at,updated_at,error').eq('run_id', runId).order('created_at').abortSignal(signal),
  ]));
  if (run.error) throw run.error;
  if (calls.error) throw calls.error;
  if (metrics.error) throw metrics.error;
  // The staged pipeline is newer than some deployed databases; progress simply
  // falls back to the client-side inference when the table is unavailable.
  const stageRows = stages.error ? [] : (stages.data || []);
  return {
    status: run.data?.status as 'running' | 'completed' | 'failed' | undefined,
    threadId: run.data?.thread_id as string | undefined,
    createdAt: run.data?.created_at as string | undefined,
    runTiming: run.data?.created_at ? {
      startedAt: run.data.created_at as string,
      finishedAt: run.data.status && run.data.status !== 'running' ? run.data.updated_at as string : undefined,
    } : undefined,
    executionMode: run.data?.execution_mode as string | undefined,
    stage: (run.data?.stage as AgentStageName | null | undefined) ?? null,
    stages: stageRows.map((row) => ({
      stage: row.stage as AgentStageName,
      status: row.status as AgentStage['status'],
      attempt: Number(row.attempt) || 0,
      startedAt: row.created_at as string,
      finishedAt: row.status === 'running' ? undefined : row.updated_at as string,
      error: (row.error as string | null) ?? undefined,
    })),
    modelMetrics: (metrics.data || []).map((metric) => ({ stage: metric.stage, durationMs: Number(metric.duration_ms) || 0, success: metric.success })),
    activities: (calls.data || []).map((activity) => ({
      toolName: activity.tool_name,
      status: activity.status,
      startedAt: activity.created_at,
      finishedAt: activity.status === 'running' ? undefined : activity.updated_at,
      durationMs: activity.status === 'running' || !activity.updated_at ? undefined : Math.max(0, Date.parse(activity.updated_at) - Date.parse(activity.created_at)),
      arguments: activity.arguments || {},
      output: activity.output,
    })) as AgentRunActivity[],
  };
}

export function deleteAgentThread(threadId: string) {
  return invoke<{ deleted: true }>({ action: 'delete_thread', threadId });
}

export function undoAgentRun(runId: string) {
  return invoke<{ undone: true; undoneAt: string; journeyId?: string; affectedOperations: number }>({ action: 'undo', runId });
}
