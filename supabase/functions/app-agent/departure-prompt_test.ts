import assert from 'node:assert/strict';
import { answeredDeparturePrompt, departurePromptUi, pendingDeparturePrompt, stoppedRunDeparturePrompt } from './departure-prompt.ts';

Deno.test('a plan request held for its departure is stored as a waiting question', () => {
  const ui = departurePromptUi({ message: '帮我规划党岭三湖连穿', intent: 'plan_journey' }, 'run-1');
  assert.deepEqual(ui.requestId, 'run-1');
  assert.deepEqual(ui.taskOutcome?.status, 'waiting');
  assert.deepEqual(pendingDeparturePrompt({ ui })?.request, { message: '帮我规划党岭三湖连穿', intent: 'plan_journey' });
});

Deno.test('only a pending question takes a departure answer', () => {
  const ui = departurePromptUi({ message: '规划' }, 'run-1');
  const answered = answeredDeparturePrompt(ui, '成都');
  assert.deepEqual(answered.departurePrompt, { status: 'answered', place: '成都', request: { message: '规划' } });
  assert.deepEqual(pendingDeparturePrompt({ ui: answered }), null);
  assert.deepEqual(pendingDeparturePrompt({ ui: {} }), null);
  assert.deepEqual(pendingDeparturePrompt(null), null);
});

Deno.test('a run that stopped for its origin gets the departure card', () => {
  const quickReplies = [{ label: '设置出发地', message: '获取当前位置作为出发地。', action: 'request_location' as const }];
  const waiting = { status: 'waiting' as const, pendingQuestion: '请设置出发地', draft: null, missingOperations: [] };
  assert.deepEqual(stoppedRunDeparturePrompt({ taskOutcome: waiting, quickReplies }), { status: 'pending' });
  assert.deepEqual(stoppedRunDeparturePrompt({ taskOutcome: waiting, quickReplies: [] }), undefined);
  assert.deepEqual(stoppedRunDeparturePrompt({ taskOutcome: { ...waiting, status: 'completed' }, quickReplies }), undefined);
});
