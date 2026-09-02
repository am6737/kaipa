import { supabase } from './supabase';

export interface AgentApproval {
  callId: string;
  toolName: string;
  arguments: Record<string, unknown>;
  title: string;
  detail: string;
  destructive?: boolean;
}

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
  status: 'completed' | 'pending_approval';
  message?: string;
  quickReplies?: AgentQuickReply[];
  approvals?: AgentApproval[];
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
  pendingRun: { id: string; status: 'pending_approval'; pending_approvals: AgentApproval[] } | null;
}

export interface AgentThreadSummary {
  id: string;
  title: string;
  current_journey_id: string | null;
  created_at: string;
  updated_at: string;
  journeys: { name: string; photo_uris: unknown } | Array<{ name: string; photo_uris: unknown }> | null;
}

async function invoke<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke<T>('app-agent', { body });
  if (error) throw new Error(error.message || 'App agent request failed');
  if (!data) throw new Error('App agent returned no data');
  return data;
}

export function sendAgentTurn(args: { message: string; threadId?: string; currentJourneyId?: string; intent?: AgentIntent; locale?: 'zh' | 'en'; clientRunId?: string; attachments?: AgentAttachment[]; clientLocalDate?: string; clientLocalTime?: string; clientTimeZone?: string; clientTimestamp?: string }) {
  return invoke<AgentTurnResponse>({ action: 'turn', ...args });
}

export function resolveAgentRun(args: { runId: string; decisions: Array<{ callId: string; approved: boolean }>; currentJourneyId?: string }) {
  return invoke<AgentTurnResponse>({ action: 'resolve', ...args });
}

export function getAgentHistory(threadId: string) {
  return invoke<AgentHistoryResponse>({ action: 'history', threadId });
}

export function getAgentThreads() {
  return invoke<{ threads: AgentThreadSummary[] }>({ action: 'threads' });
}

export function getJourneyAgentThread(journeyId: string) {
  return invoke<{ threadId: string | null }>({ action: 'journey_thread', currentJourneyId: journeyId });
}

export function getAgentRunActivity(runId: string) {
  return invoke<{ activities: AgentRunActivity[] }>({ action: 'run_activity', runId });
}

export function deleteAgentThread(threadId: string) {
  return invoke<{ deleted: true }>({ action: 'delete_thread', threadId });
}

export function undoAgentRun(runId: string) {
  return invoke<{ undone: true; undoneAt: string; journeyId?: string; affectedOperations: number }>({ action: 'undo', runId });
}
