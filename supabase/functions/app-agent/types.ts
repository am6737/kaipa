export type AgentContext = {
  userId: string;
  threadId: string;
  runId: string;
  currentJourneyId?: string;
  canUndoPreviousChanges?: boolean;
  originalUserMessage?: string;
  allowUndatedJourney?: boolean;
};

export type PendingApproval = {
  callId: string;
  toolName: string;
  arguments: Record<string, unknown>;
  title: string;
  detail: string;
  destructive?: boolean;
};

export type AgentQuickReply = {
  label: string;
  message: string;
  action?: 'upload_track' | 'skip_track';
};

export type AgentSource = {
  title: string;
  url: string;
  source?: string;
  snippet?: string;
  publishedAt?: string;
};

export type AgentAttachment = {
  kind: 'image' | 'file';
  name: string;
  url: string;
  mimeType: string;
  size?: number;
};

export type AgentPlanPreview = {
  journeyId: string;
  title: string;
  dateLabel?: string;
  days: Array<{
    label: string;
    items: Array<{ title: string; timeStart?: number; timeEnd?: number }>;
  }>;
};

export type AgentUndoAction = {
  runId: string;
  undoneAt?: string;
};

export type AgentMessageUi = {
  quickReplies?: AgentQuickReply[];
  sources?: AgentSource[];
  planPreview?: AgentPlanPreview;
  activities?: AgentRunActivity[];
  attachments?: AgentAttachment[];
  undoAction?: AgentUndoAction;
  createJourneyFlow?: { step: 'collect_date' | 'collect_duration' | 'collect_date_and_duration' | 'ask_track'; originalMessage: string };
  trackPrompt?: { message: string; intent?: AgentIntent };
};

export type AgentRunActivity = {
  toolName: string;
  status: 'running' | 'completed' | 'failed';
  arguments: Record<string, unknown>;
  output?: unknown;
};

export type AgentIntent = 'plan_journey';

export type AgentResponse = {
  threadId: string;
  runId: string;
  status: 'completed' | 'pending_approval';
  message?: string;
  quickReplies?: AgentQuickReply[];
  approvals?: PendingApproval[];
  ui?: AgentMessageUi;
};
