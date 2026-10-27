export type AgentContext = {
  userId: string;
  threadId: string;
  runId: string;
  currentJourneyId?: string;
  confirmedTravel?: import('./travel-context.ts').TravelContext | null;
  locale?: string;
  currentLocation?: import('./location.ts').AgentLocation;
  task?: import('./task.ts').TaskState;
  satisfiedOperations?: import('./task.ts').WriteOperation[];
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
  // Sent back with the message when tapped, so the button decides the intent.
  intent?: AgentIntent;
};

export type AgentSource = {
  title: string;
  // A route fact cites a maintained entry, not a page, so it may have no url to
  // open. Absent url means the chip renders without a link rather than calling
  // openURL(undefined).
  url?: string;
  source?: string;
  snippet?: string;
  publishedAt?: string;
  // 'fact' marks an entry from the maintained 线路资料 library, shown with a
  // verified badge and the date a human last confirmed or reviewed it.
  // undefined means a plain web result.
  kind?: 'fact' | 'guide';
  platform?: string;
  observedOn?: string;
  factId?: string;
  verifiedAt?: string;
  stale?: boolean;
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
  itineraryCard?: {
    routeId: string; routeName: string;
    planId: string; planVersion: number; planName: string; hikeDays: number;
    trekStartDate: string | null;
    preferredHikeDays: number | null;
  };
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
  departurePrompt?: DeparturePrompt;
};

// A departure question the app renders as a card. `request` is a plan the app
// held back before any run; without it a run stopped to ask, and the answer
// resumes that task.
export type DeparturePrompt = {
  status: 'pending' | 'answered';
  place?: string;
  request?: { message: string; intent?: AgentIntent };
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

// App entry intents, identical to the client's union. The server validates
// body.intent against intent-router.ts appIntentRoutes; unknown values are ignored.
export type AgentIntent = 'plan_journey' | 'packing_full' | 'transport_supplement' | 'stay_supplement'
  | 'gear_onboarding' | 'gear_set_onboarding' | 'journey_review' | 'smart_plan';

export type AgentResponse = {
  threadId: string;
  runId: string;
  status: 'completed';
  message?: string;
  quickReplies?: AgentQuickReply[];
  ui?: AgentMessageUi;
};
