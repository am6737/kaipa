import { STAGE_BUDGETS, useStagedPipeline } from './pipeline.ts';
import { constrainTaskDecision, taskDecisionSchema, type TaskDecision } from './task.ts';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function decisionOf(patch: Partial<TaskDecision>): TaskDecision {
  return taskDecisionSchema.parse({
    objective: '任务', mode: 'execute', continuation: false, authorizationQuote: '帮我安排',
    operations: [], requiredOperations: [], fullHikingPlan: false, destination: null, plannedDate: null,
    dateUndecided: false, days: null, trackAttachmentName: null, packingMode: 'none', constraints: [],
    ...patch,
  });
}

// The interactive loop and the staged pipeline must not swap roles: a full plan
// is minutes of work, while a single edit is a few seconds and must stay cheap.
Deno.test('long-form work goes to the pipeline and single edits stay interactive', () => {
  const cases: Array<[string, Partial<TaskDecision>, boolean]> = [
    ['full hiking plan', { fullHikingPlan: true, operations: ['create_journey', 'add_itinerary_items'] }, true],
    ['full packing list', { packingMode: 'full', operations: ['add_packing_items'] }, true],
    ['transport chain', { domain: 'transport', operations: ['add_itinerary_items'] }, true],
    ['undo of a transport plan', { domain: 'transport', operations: ['undo_last_agent_changes'] }, false],
    ['deleting a planned item', { fullHikingPlan: true, operations: ['delete_itinerary_items'] }, false],
    ['one train item', { domain: 'general', operations: ['add_itinerary_items'] }, false],
    ['discussion of a full plan', { mode: 'discuss', fullHikingPlan: true }, false],
    ['incremental packing', { packingMode: 'incremental', operations: ['add_packing_items'] }, false],
    ['packing additions during a full plan', { fullHikingPlan: true, packingMode: 'incremental', operations: ['add_packing_items'] }, false],
    ['full plan with full packing', { fullHikingPlan: true, packingMode: 'full', operations: ['add_itinerary_items', 'add_packing_items'] }, true],
    ['deletion', { domain: 'general', operations: ['delete_itinerary_items'] }, false],
    ['undo', { domain: 'general', operations: ['undo_last_agent_changes'] }, false],
    ['route exploration', { mode: 'discuss', domain: 'routes' }, false],
    ['stopped task', { mode: 'stop', fullHikingPlan: true }, false],
  ];
  for (const [label, patch, expected] of cases) {
    assert(useStagedPipeline(decisionOf(patch)) === expected, `${label} must ${expected ? '' : 'not '}use the pipeline`);
  }
});

Deno.test('a legacy task state without a domain still resolves one', () => {
  const stored = { objective: '任务', mode: 'execute', continuation: false, authorizationQuote: '帮我安排',
    operations: ['create_journey'], requiredOperations: ['create_journey'], fullHikingPlan: false,
    destination: null, plannedDate: null, dateUndecided: false, days: null, trackAttachmentName: null,
    packingMode: 'none', constraints: [] } as TaskDecision;
  const normalized = constrainTaskDecision(stored, '帮我安排', null, null, { hasBoundTrack: false });
  assert(normalized.domain === 'general', `a plain edit must default to general, got ${normalized.domain}`);

  const hiking = constrainTaskDecision({ ...stored, fullHikingPlan: true }, '帮我安排', null, null, { hasBoundTrack: false });
  assert(hiking.domain === 'hiking', `a full hiking plan must resolve to hiking, got ${hiking.domain}`);

  const packing = constrainTaskDecision({ ...stored, packingMode: 'full' }, '帮我安排', null, null, { hasBoundTrack: false });
  assert(packing.domain === 'packing', `a full checklist must resolve to packing, got ${packing.domain}`);
});

Deno.test('a transport domain survives only with verbatim chain wording, never from operations alone', () => {
  const transport = constrainTaskDecision(decisionOf({ domain: 'transport', domainQuote: '火车接驳方案', operations: ['add_itinerary_items'], authorizationQuote: '帮我安排' }), '帮我安排火车接驳方案', null, null, { hasBoundTrack: false });
  assert(transport.domain === 'transport', 'a quoted transport span must keep its domain');
  // Same operations, no domain: an unrelated single item must not become a chain.
  const single = constrainTaskDecision(decisionOf({ operations: ['add_itinerary_items'] }), '帮我安排', null, null, { hasBoundTrack: false });
  assert(single.domain === 'general', `operations alone must not imply transport, got ${single.domain}`);
  // A classification without a verbatim quote is a model misread, not a chain.
  const unquoted = constrainTaskDecision(decisionOf({ domain: 'transport', operations: ['add_itinerary_items'], authorizationQuote: '帮我安排' }), '帮我安排火车接驳方案', null, null, { hasBoundTrack: false });
  assert(unquoted.domain === 'general', `an unquoted transport claim must fall back to general, got ${unquoted.domain}`);
  // Paraphrase is not a quote; the check is exact, mirroring authorization.
  const paraphrased = constrainTaskDecision(decisionOf({ domain: 'transport', domainQuote: '火车接驳方案', operations: ['add_itinerary_items'], authorizationQuote: '帮我安排' }), '帮我安排火车往返方案', null, null, { hasBoundTrack: false });
  assert(paraphrased.domain === 'general', `a paraphrase must fall back to general, got ${paraphrased.domain}`);
});

Deno.test('routing a chain into the pipeline needs chain wording from the user', () => {
  const chain = constrainTaskDecision(decisionOf({ domain: 'transport', domainQuote: '从成都到阳朔的往返交通接驳方案', operations: ['add_itinerary_items'], authorizationQuote: '帮我规划' }), '帮我规划从成都到阳朔的往返交通接驳方案', null, null, { hasBoundTrack: false });
  assert(chain.domain === 'transport', `an explicit chain must keep its domain, got ${chain.domain}`);
  assert(useStagedPipeline(chain), 'a chain with chain wording must use the pipeline');
  // The same classification on a single-item edit must not buy a pipeline run.
  const single = constrainTaskDecision(decisionOf({ domain: 'transport', operations: ['add_itinerary_items'], authorizationQuote: '增加一项' }), '在当前旅程的 Day 1 增加一项 17:30 至 18:30 从兴坪古镇返回阳朔县城的班车。', null, null, { hasBoundTrack: false });
  assert(single.domain === 'general', `a single item must fall back to the interactive path, got ${single.domain}`);
  assert(!useStagedPipeline(single), 'a single item must stay interactive');
});

Deno.test('withdrawn authorization clears the work the pipeline would have done', () => {
  const withdrawn = constrainTaskDecision(
    decisionOf({ domain: 'transport', fullHikingPlan: true, operations: ['create_journey', 'add_itinerary_items'], authorizationQuote: '帮我安排' }),
    '这个方案怎么样？', null, null, { hasBoundTrack: false },
  );
  assert(withdrawn.mode === 'discuss' && withdrawn.operations.length === 0, 'a quote absent from the message cannot authorize writes');
  assert(!useStagedPipeline(withdrawn), 'an unauthorized task must never start the pipeline');
});

Deno.test('stage budgets stay inside the worker and lease ceilings', () => {
  const total = Object.values(STAGE_BUDGETS).reduce((sum, budget) => sum + budget, 0);
  assert(total < 700_000, `stage budgets (${total}ms) must fit the worker fetch timeout`);
  assert(total < 12 * 60_000, `stage budgets (${total}ms) must fit the job lease`);
  for (const [stage, budget] of Object.entries(STAGE_BUDGETS)) {
    assert(budget > 0 && budget <= 180_000, `${stage} has an unreasonable budget of ${budget}ms`);
  }
  // Finalize (message UI queries + finalize_agent_run + finish_agent_job) runs
  // inside the same fetch after the last stage; the model budgets must leave it
  // room even when every stage spends its full budget.
  const modelLoop = Object.entries(STAGE_BUDGETS)
    .filter(([stage]) => ['research', 'plan', 'packing', 'respond'].includes(stage))
    .reduce((sum, [, budget]) => sum + budget, 0);
  assert(700_000 - modelLoop >= 150_000, `only ${700_000 - modelLoop}ms remain for the non-model stages and finalize`);
});
