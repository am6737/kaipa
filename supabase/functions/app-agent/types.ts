export type AgentContext = {
  userId: string;
  threadId: string;
  runId: string;
  currentJourneyId?: string;
  currentLocation?: import('./location.ts').AgentLocation;
  task?: import('./task.ts').TaskState;
  originalUserMessage?: string;
  attachments?: AgentAttachment[];
  dataContext?: import('./context.ts').ContextState;
  writeReceipt?: { callId: string; expected: import('./context.ts').ContextVersions; committed: boolean };
};

export type AgentQuickReply = {
  label: string;
  message: string;
  action?: 'upload_track' | 'skip_track' | 'retry_run' | 'supplement_plan' | 'request_location';
  runId?: string;
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
  travelContext?: import('./travel-context.ts').TravelContext | null;
  taskOutcome?: import('./task.ts').TaskOutcome;
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
};

export type AgentRunActivity = {
  toolName: string;
  status: 'running' | 'completed' | 'failed';
  startedAt?: string;
  finishedAt?: string;
  durationMs?: number;
  arguments: Record<string, unknown>;
  output?: unknown;
};

export type AgentModelMetric = {
  stage: string;
  durationMs: number;
  success: boolean;
};

export type AgentIntent = 'plan_journey';

export type AgentResponse = {
  threadId: string;
  runId: string;
  status: 'completed';
  message?: string;
  quickReplies?: AgentQuickReply[];
  ui?: AgentMessageUi;
};
