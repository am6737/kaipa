import { supabase } from './supabase';

export interface AgentQuickReply {
  label: string;
  message: string;
  action?: 'upload_track' | 'skip_track';
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
  status: 'completed';
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
  const { data, error } = await supabase.functions.invoke<T>('app-agent', { body });
  if (error) throw new Error(error.message || 'App agent request failed');
  if (!data) throw new Error('App agent returned no data');
  return data;
}

export function sendAgentTurn(args: { message: string; displayMessage?: string; threadId?: string; currentJourneyId?: string; intent?: AgentIntent; locale?: 'zh' | 'en'; clientRunId?: string; attachments?: AgentAttachment[]; clientLocalDate?: string; clientLocalTime?: string; clientTimeZone?: string; clientTimestamp?: string }) {
  return invoke<AgentTurnResponse>({ action: 'turn', ...args });
}

export function getAgentHistory(threadId: string) {
  return Promise.all([
    supabase.from('agent_threads').select('id,title,current_journey_id').eq('id', threadId).maybeSingle(),
    supabase.from('agent_messages').select('id,role,content,ui,created_at').eq('thread_id', threadId).order('created_at'),
  ]).then(([thread, messages]) => {
    if (thread.error) throw thread.error;
    if (!thread.data) throw new Error('Conversation not found');
    if (messages.error) throw messages.error;
    return {
      thread: thread.data,
      messages: (messages.data || []) as AgentHistoryMessage[],
    };
  });
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
  const result = await supabase
    .from('agent_threads')
    .select('id')
    .eq('current_journey_id', journeyId)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (result.error) throw result.error;
  return { threadId: result.data?.id || null };
}

export async function getAgentRunActivity(runId: string) {
  const result = await supabase
    .from('agent_tool_calls')
    .select('tool_name,status,arguments,output,created_at')
    .eq('run_id', runId)
    .order('created_at');
  if (result.error) throw result.error;
  return {
    activities: (result.data || []).map((activity) => ({
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
