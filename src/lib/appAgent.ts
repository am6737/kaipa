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

export interface AgentMessageUi {
  travelContext?: import('../../supabase/functions/app-agent/travel-context').TravelContext | null;
  requestId?: string;
  quickReplies?: AgentQuickReply[];
  sources?: AgentSource[];
  planPreview?: AgentPlanPreview;
  activities?: AgentRunActivity[];
  attachments?: AgentAttachment[];
  undoAction?: AgentUndoAction;
  createJourneyFlow?: { step: 'collect_date' | 'collect_duration' | 'collect_date_and_duration' | 'ask_track'; originalMessage: string };
  trackPrompt?: { message: string; intent?: AgentIntent };
}

export interface AgentRunActivity {
  toolName: string;
  status: 'running' | 'completed' | 'failed';
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
  const [run, calls] = await withAgentDeadline(async (signal) => Promise.all([
    supabase.from('agent_runs').select('status,thread_id,created_at,execution_mode').eq('id', runId).abortSignal(signal).maybeSingle(),
    supabase.from('agent_tool_calls').select('tool_name,status,arguments,output,created_at').eq('run_id', runId).order('created_at').abortSignal(signal),
  ]));
  if (run.error) throw run.error;
  if (calls.error) throw calls.error;
  return {
    status: run.data?.status as 'running' | 'completed' | 'failed' | undefined,
    threadId: run.data?.thread_id as string | undefined,
    createdAt: run.data?.created_at as string | undefined,
    executionMode: run.data?.execution_mode as string | undefined,
    activities: (calls.data || []).map((activity) => ({
      toolName: activity.tool_name,
      status: activity.status,
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
