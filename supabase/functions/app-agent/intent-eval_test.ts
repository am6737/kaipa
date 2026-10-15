import { intentCases } from './intent-cases.ts';
import { intentDefinitions, intentFromDecision, intents, routeWithThreshold, scoreCase, summarize, type IntentCase } from './intent-eval.ts';
import { constrainTaskDecision, type TaskDecision } from './task.ts';
import { useStagedPipeline } from './pipeline.ts';

function decision(overrides: Partial<TaskDecision> = {}): TaskDecision {
  return { includeRoundTripTransport: true, objective: 'request', mode: 'execute', domain: null, domainQuote: null,
    authorizationUnconfirmed: false, fullHikingPlan: false, activeHoursPerDay: null, continuation: false, authorizationQuote: 'save',
    operations: ['add_itinerary_items'], requiredOperations: ['add_itinerary_items'], destination: null,
    plannedDate: null, dateUndecided: false, days: null, derivedDays: null, trackAttachmentName: null,
    packingMode: 'none', constraints: [], ...overrides };
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

Deno.test('intent cases are well formed', () => {
  const ids = new Set<string>();
  for (const testCase of intentCases) {
    assert(!ids.has(testCase.id), `duplicate case ${testCase.id}`);
    ids.add(testCase.id);
    const { intent, acceptable = [], forbidden = [] } = testCase.expect;
    for (const value of [intent, ...acceptable, ...forbidden]) assert(intents.includes(value), `${testCase.id}: unknown intent ${value}`);
    assert(!forbidden.includes(intent), `${testCase.id}: expected intent is forbidden`);
    assert(!acceptable.some(value => forbidden.includes(value)), `${testCase.id}: acceptable overlaps forbidden`);
  }
  assert(intentCases.length >= 180, 'intent suite should cover at least 180 cases');
  for (const intent of intents.filter(value => value !== 'clarify')) {
    assert(intentCases.some(testCase => testCase.expect.intent === intent), `no case targets ${intent}`);
    assert(intent in intentDefinitions, `no definition for ${intent}`);
  }
});

Deno.test('today\'s decisions map onto the intent taxonomy', () => {
  assert(intentFromDecision(decision({ operations: ['add_gear'] })) === 'gear_add', 'gear');
  assert(intentFromDecision(decision({ operations: ['add_packing_items'], packingMode: 'full' })) === 'packing_full', 'full packing');
  assert(intentFromDecision(decision({ operations: ['add_packing_items'], packingMode: 'incremental' })) === 'packing_add', 'packing add');
  assert(intentFromDecision(decision({ fullHikingPlan: true })) === 'hiking_plan', 'hiking');
  assert(intentFromDecision(decision({ operations: ['create_journey'] })) === 'hiking_plan', 'journey creation');
  assert(intentFromDecision(decision({ domain: 'transport' })) === 'transport_chain', 'transport');
  assert(intentFromDecision(decision({ operations: ['delete_packing_items'] })) === 'delete', 'delete');
  assert(intentFromDecision(decision({ operations: ['undo_last_agent_changes'] })) === 'undo', 'undo');
  assert(intentFromDecision(decision({ mode: 'discuss', operations: [], domain: 'routes' })) === 'route_explore', 'routes');
  assert(intentFromDecision(decision({ mode: 'stop', operations: [] })) === 'stop', 'stop');
});

Deno.test('the misrouted gear request is scored as harmful', () => {
  const testCase = intentCases.find(value => value.id === 'amb-create-gear') as IntentCase;
  const raw = decision({ authorizationQuote: '帮我创建装备', domain: 'packing', operations: ['add_packing_items'], requiredOperations: ['add_packing_items'], packingMode: 'full' });
  const constrained = constrainTaskDecision(raw, testCase.message, null, null, { hasBoundTrack: false });
  const score = scoreCase(testCase, { intent: intentFromDecision(raw), operations: constrained.operations,
    pipeline: useStagedPipeline(constrained), latencyMs: 1 });
  assert(score.harmful && !score.acceptable, `expected harmful: ${score.reasons.join('; ')}`);
  assert(score.reasons.some(reason => reason.includes('pipeline')), 'pipeline entry should be reported');
});

Deno.test('clarification answers score as exact and write nothing', () => {
  const testCase = intentCases.find(value => value.id === 'amb-create-gear') as IntentCase;
  const score = scoreCase(testCase, { intent: 'clarify', operations: [], pipeline: false, latencyMs: 1 });
  assert(score.exact && score.acceptable && !score.harmful, score.reasons.join('; '));
});

Deno.test('low confidence routes to clarification', () => {
  assert(routeWithThreshold('gear_add', 0.4, 0.6) === 'clarify', 'low confidence');
  assert(routeWithThreshold('gear_add', 0.9, 0.6) === 'gear_add', 'high confidence');
  assert(routeWithThreshold('gear_add', null, 0.6) === 'gear_add', 'no confidence');
});

Deno.test('pass^k requires every repeat to pass', () => {
  const testCase = intentCases.find(value => value.id === 'gear-add-tent') as IntentCase;
  const good = { intent: 'gear_add' as const, latencyMs: 10 };
  const bad = { intent: 'packing_full' as const, latencyMs: 20 };
  const summary = summarize('t', [testCase], [
    { caseId: testCase.id, prediction: good, score: scoreCase(testCase, good) },
    { caseId: testCase.id, prediction: bad, score: scoreCase(testCase, bad) },
  ]);
  assert(summary.passK === 0 && summary.acceptableRate === 0.5 && summary.harmfulRate === 0.5, JSON.stringify(summary));
});

Deno.test('app-intent cases mirror app cases and send a known intent', () => {
  const appi = intentCases.filter(testCase => testCase.id.startsWith('appi-'));
  assert(appi.length >= 15, 'appi group missing');
  for (const testCase of appi) {
    assert(intentCases.some(value => value.id === testCase.id.replace(/^appi-/, 'app-') && value.message === testCase.message), `${testCase.id}: no app twin`);
    assert(testCase.context?.appIntent, `${testCase.id}: no appIntent`);
  }
});
