export type AgentContext = {
  userId: string;
  threadId: string;
  runId: string;
  currentJourneyId?: string;
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
};

export type AgentSource = {
  title: string;
  url: string;
  source?: string;
  snippet?: string;
  publishedAt?: string;
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

export type AgentMessageUi = {
  quickReplies?: AgentQuickReply[];
  sources?: AgentSource[];
  planPreview?: AgentPlanPreview;
  activities?: AgentRunActivity[];
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
