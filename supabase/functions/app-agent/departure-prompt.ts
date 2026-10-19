import type { AgentIntent, AgentMessageUi, DeparturePrompt } from './types.ts';

export function departureQuestion(locale = 'zh') {
  return locale.startsWith('en')
    ? 'Where are you leaving from? I need it to plan the round trip.'
    : '从哪里出发？我用它来安排往返交通。';
}

// The question a plan request gets before any run, stored with the request so
// the answer can start it from any device.
export function departurePromptUi(request: { message: string; intent?: AgentIntent }, requestId: string, locale = 'zh'): AgentMessageUi {
  return {
    requestId,
    departurePrompt: { status: 'pending', request },
    taskOutcome: { status: 'waiting', pendingQuestion: departureQuestion(locale), draft: null, missingOperations: [] },
  };
}

// The newest assistant message is the only question a departure can answer;
// an older one was passed over by the conversation.
export function pendingDeparturePrompt(latestAssistant: { ui?: AgentMessageUi | null } | null | undefined): DeparturePrompt | null {
  const prompt = latestAssistant?.ui?.departurePrompt;
  return prompt?.status === 'pending' ? prompt : null;
}

// A run that stopped for a missing origin offers the location reply; the card
// replaces it in newer apps while older ones keep the reply.
export function stoppedRunDeparturePrompt(ui: AgentMessageUi): DeparturePrompt | undefined {
  return ui.taskOutcome?.status === 'waiting' && ui.quickReplies?.some(reply => reply.action === 'request_location')
    ? { status: 'pending' } : undefined;
}

export function answeredDeparturePrompt(ui: AgentMessageUi, place: string): AgentMessageUi {
  return ui.departurePrompt ? { ...ui, departurePrompt: { ...ui.departurePrompt, status: 'answered', place } } : ui;
}
