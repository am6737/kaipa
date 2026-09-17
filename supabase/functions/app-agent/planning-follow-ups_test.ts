import { normalizePlanningFollowUps, planningFollowUpReplies } from './planning-follow-ups.ts';
import type { AgentQuickReply } from './types.ts';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const saved = { tool_name: 'add_itinerary_items', status: 'completed', output: { added: 3 } };

Deno.test('offers two independent localized extras only after a saved core plan', () => {
  for (const locale of ['zh', 'en'] as const) {
    const replies = planningFollowUpReplies(true, [], [saved], locale);
    assert(replies.length === 2, 'expected transport and accommodation without a combined option');
    assert(replies.every((reply) => reply.action === 'supplement_plan'), 'options must remain visible alongside undo');
    assert(replies.every((reply) => reply.label.length <= 24 && reply.message.length <= 200), 'reply limits');
    assert(replies[0].label === (locale === 'zh' ? '安排往返交通' : 'Arrange transport'), 'localized label');
  }
});

Deno.test('does not offer extras for failed, unsaved, empty or undone planning', () => {
  for (const calls of [[], [{ ...saved, status: 'failed' }], [{ ...saved, output: { added: 0 } }],
    [{ ...saved, undone_at: '2026-09-07' }], [{ ...saved, tool_name: 'add_packing_items' }]]) {
    assert(planningFollowUpReplies(true, [], calls).length === 0, 'no saved plan must mean no extras');
  }
});

Deno.test('preserves clarifications and suppresses extras on supplemental or declined plans', () => {
  const question: AgentQuickReply[] = [{ label: 'Tomorrow', message: 'Tomorrow' }];
  assert(planningFollowUpReplies(true, question, [saved]) === question, 'do not replace a pending question');
  assert(planningFollowUpReplies(false, [], [saved]).length === 0, 'model must identify completed core planning');
});

Deno.test('recovered planning can offer extras when rows were already saved', () => {
  const replies = planningFollowUpReplies(true, [], [{ ...saved, output: { added: 0, skippedDuplicates: 3 } }]);
  assert(replies.length === 2, 'recovery must retain follow-up options');
});

Deno.test('existing history adopts two entries without changing submitted messages or clarifications', () => {
  const old: AgentQuickReply[] = ['补充往返交通', '补充住宿', '补充交通和住宿'].map((label) => ({ label, message: label, action: 'supplement_plan' }));
  const normalized = normalizePlanningFollowUps(old);
  assert(normalized.length === 2 && normalized[0].label === '安排往返交通' && normalized[1].label === '安排住宿', 'normalize existing entries');
  assert(normalized[0].message === old[0].message && old.length === 3, 'do not mutate stored history');
  const clarification = { label: '补充交通和住宿', message: 'both' };
  assert(normalizePlanningFollowUps([clarification])[0] === clarification, 'leave ordinary clarification options intact');
});
