import { intentCases } from './intent-cases.ts';
import {
  applyIntent, appIntentRoutes, clarifyDefinition, continuationGate, declinesPending, guardQuotedAuthorization, intentDefinitions, intentRouterMode,
  intentFromDecision, isAgentIntent, normalizeRoute, resolveTask, routerIntents, unsupportedDefinition, type ResolveTaskArgs, type RouterOutput,
} from './intent-router.ts';
import { taskDecisionSchema, type TaskDecision, type TaskState, type WriteOperation, writeOperations } from './task.ts';
import { useStagedPipeline } from './pipeline.ts';

function decision(overrides: Partial<TaskDecision> = {}): TaskDecision {
  return { ...taskDecisionSchema.parse({ objective: 'request', mode: 'execute', continuation: false, authorizationQuote: '保存',
    operations: ['add_itinerary_items'], requiredOperations: ['add_itinerary_items'], destination: null, plannedDate: null,
    dateUndecided: false, days: null, trackAttachmentName: null, packingMode: 'none', constraints: [] }), ...overrides };
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const packingRank = { none: 0, incremental: 1, full: 2 } as const;

// Every interpreter shape the router can be combined with.
function decisions(): TaskDecision[] {
  const list: TaskDecision[] = [];
  const opSets: WriteOperation[][] = [[], ['add_gear'], ['add_packing_items'], ['add_packing_items', 'delete_packing_items'],
    ['add_itinerary_items', 'update_journey_schedule'], ['delete_itinerary_items'], ['undo_last_agent_changes'],
    ['create_journey', 'add_itinerary_items', 'update_journey_schedule', 'set_journey_map_location'], [...writeOperations]];
  for (const mode of ['execute', 'discuss', 'stop'] as const) {
    for (const operations of opSets) {
      for (const packingMode of ['none', 'incremental', 'full'] as const) {
        for (const fullHikingPlan of [true, false]) {
          for (const domain of ['hiking', 'transport', 'packing', 'routes', 'general', null] as const) {
            list.push(decision({ mode, operations, requiredOperations: operations, packingMode, fullHikingPlan, domain,
              domainQuote: domain === 'transport' ? '交通' : null }));
          }
        }
      }
    }
  }
  return list;
}

function assertNarrower(before: TaskDecision, after: TaskDecision, label: string) {
  assert(after.operations.every(op => before.operations.includes(op)), `${label}: added operations ${after.operations}`);
  assert(after.requiredOperations.every(op => before.requiredOperations.includes(op) || before.operations.includes(op)), `${label}: added required`);
  assert(after.mode !== 'execute' || before.mode === 'execute', `${label}: turned execute on`);
  assert(!after.fullHikingPlan || before.fullHikingPlan, `${label}: turned full plan on`);
  assert(packingRank[after.packingMode] <= packingRank[before.packingMode], `${label}: raised packing mode`);
}

Deno.test('applyIntent never adds permissions', () => {
  for (const intent of routerIntents) {
    for (const raw of decisions()) {
      for (const journeyId of ['journey', null]) {
        const label = `${intent}/${raw.mode}/${raw.operations.join('+')}/${raw.packingMode}/${raw.fullHikingPlan}/${raw.domain}/${journeyId}`;
        const result = applyIntent(intent, raw, { journeyId, message: '保存' });
        assertNarrower(raw, result.decision, label);
        if (result.decision.mode === 'execute') {
          assert(intent === 'hiking_plan' || result.decision.operations.length > 0, `${label}: execute without writes`);
        }
      }
    }
  }
});

Deno.test('the routed decision never exceeds the interpreter after constraints', async () => {
  const outputs: RouterOutput[] = routerIntents.map(intent => ({ intent, alternatives: [], clarifyQuestion: null, clarifyOptions: [] }));
  const raws = decisions().filter((_, index) => index % 7 === 0);
  for (const output of outputs) {
    for (const raw of raws) {
      const args: ResolveTaskArgs = { message: '保存', journeyId: 'journey', previous: null, appIntent: 'plan_journey',
        hasBoundTrack: false, mode: 'on', recentMessages: [], interpretInput: {} };
      const routed = await resolveTask(args, async () => raw, async () => output);
      const plain = await resolveTask({ ...args, mode: 'off' }, async () => raw);
      const label = `${output.intent}/${raw.mode}/${raw.operations.join('+')}`;
      if (output.intent !== 'hiking_plan') {
        assert(routed.decision.operations.every(op => plain.decision.operations.includes(op)), `${label}: routed added ${routed.decision.operations}`);
        assert(!useStagedPipeline(routed.decision) || useStagedPipeline(plain.decision), `${label}: routed entered pipeline`);
      } else {
        assert(routed.decision.operations.join() === plain.decision.operations.join(), `${label}: hiking plan changed scope`);
      }
    }
  }
});

Deno.test('an execute request whose writes the intent forbids asks for confirmation', () => {
  const raw = decision({ domain: 'packing', operations: ['add_packing_items'], requiredOperations: ['add_packing_items'], packingMode: 'full' });
  const result = applyIntent('gear_add', raw, { journeyId: 'journey', message: '保存' });
  assert(result.decision.mode === 'discuss' && !result.decision.operations.length && result.authorizationUnconfirmed, JSON.stringify(result));
  assert(!applyIntent('discuss', raw, { journeyId: 'journey', message: '保存' }).authorizationUnconfirmed, 'discussion is not unconfirmed');
});

Deno.test('a full plan with nowhere to go asks for a destination', async () => {
  const raw = decision({ fullHikingPlan: true, domain: 'hiking', destination: null,
    operations: ['create_journey', 'add_itinerary_items'], requiredOperations: ['create_journey', 'add_itinerary_items'] });
  const base = { message: '帮我规划一次徒步并保存', journeyId: null, previous: null, appIntent: 'plan_journey', hasBoundTrack: false,
    mode: 'on' as const, recentMessages: [], interpretInput: {} };
  const route = async (): Promise<RouterOutput> => ({ intent: 'hiking_plan', alternatives: [], clarifyQuestion: null, clarifyOptions: [] });
  const nowhere = await resolveTask(base, async () => raw, route);
  assert(nowhere.routing.clarify?.question && !nowhere.decision.operations.length && !useStagedPipeline(nowhere.decision), 'no destination planned');
  for (const [label, args, value] of [
    ['destination', base, { ...raw, destination: '四姑娘山' }],
    ['journey', { ...base, journeyId: 'journey' }, raw],
    ['track', { ...base, hasBoundTrack: true }, raw],
  ] as const) {
    const planned = await resolveTask(args, async () => value, route);
    assert(!planned.routing.clarify && planned.decision.operations.includes('add_itinerary_items'), `${label}: plan blocked`);
  }
});

Deno.test('a move is an edit, not a delete', () => {
  assert(intentFromDecision(decision({ operations: ['delete_itinerary_items', 'add_itinerary_items'] })) === 'itinerary_edit', 'move');
  assert(intentFromDecision(decision({ operations: ['delete_itinerary_items'] })) === 'delete', 'delete');
  assert(intentFromDecision(decision({ operations: ['delete_packing_items', 'add_itinerary_items'] })) === 'delete', 'mixed delete');
});

Deno.test('quoted destructive words are content, not commands', () => {
  for (const [message, quote] of [
    ['朋友说“把第一天删了”是什么意思', '把第一天删了'],
    ['如果我说"撤销刚才的修改"，会撤销什么', '撤销刚才的修改'],
    ['按钮上写着「删除清单」，点了会怎样', '删除清单'],
    ['‘删掉保温杯’这个提示是谁发的', '删掉保温杯'],
    ['『删除行程』功能在哪', '删除行程'],
  ]) {
    for (const op of ['delete_itinerary_items', 'delete_packing_items', 'undo_last_agent_changes'] as const) {
      const guarded = guardQuotedAuthorization(decision({ authorizationQuote: quote, operations: [op], requiredOperations: [op] }), message);
      assert(!guarded.operations.length && guarded.mode === 'discuss', `${message}: ${op} survived`);
    }
  }
  const mixed = guardQuotedAuthorization(decision({ authorizationQuote: '把第一天删了',
    operations: ['add_itinerary_items', 'delete_itinerary_items'], requiredOperations: ['delete_itinerary_items'] }), '他说“把第一天删了”，你先加个营地');
  assert(mixed.mode === 'execute' && mixed.operations.join() === 'add_itinerary_items' && !mixed.requiredOperations.length, JSON.stringify(mixed));
  for (const [message, quote] of [['把“观景台”删掉', '把观景台删掉'], ['删掉第一天的观景台', '删掉第一天的观景台'],
    ['他说“删掉观景台”，那就删掉观景台吧', '删掉观景台']]) {
    const kept = guardQuotedAuthorization(decision({ authorizationQuote: quote, operations: ['delete_itinerary_items'],
      requiredOperations: ['delete_itinerary_items'] }), message);
    assert(kept.operations.join() === 'delete_itinerary_items' && kept.mode === 'execute', `${message}: user's own delete dropped`);
  }
});

Deno.test('app entry intents map without calling the router', async () => {
  const raw = decision({ domain: 'packing', operations: ['add_packing_items', 'add_gear', 'add_gear_set_items', 'add_itinerary_items'],
    requiredOperations: ['add_packing_items'], packingMode: 'full' });
  const expected: Record<string, { intent: string; ops: string }> = {
    packing_full: { intent: 'packing_full', ops: 'add_packing_items' },
    transport_supplement: { intent: 'transport_chain', ops: 'add_itinerary_items' },
    stay_supplement: { intent: 'itinerary_edit', ops: 'add_itinerary_items' },
    gear_onboarding: { intent: 'gear_add', ops: 'add_gear' },
    gear_set_onboarding: { intent: 'gear_set', ops: 'add_gear_set_items' },
    journey_review: { intent: 'discuss', ops: '' },
  };
  for (const [appIntent, want] of Object.entries(expected)) {
    for (const mode of ['on', 'shadow', 'off'] as const) {
      const result = await resolveTask({ message: '保存', journeyId: 'journey', previous: null, appIntent, hasBoundTrack: false, mode,
        recentMessages: [], interpretInput: {} }, async () => raw, async () => { throw new Error('router called for app entry'); });
      assert(result.routing.source === 'app' && result.routing.applied && result.routing.intent === want.intent, `${appIntent}/${mode}: ${JSON.stringify(result.routing)}`);
      assert(result.decision.operations.join() === want.ops, `${appIntent}/${mode}: ${result.decision.operations}`);
    }
  }
  const noJourney = await resolveTask({ message: '生成装备清单', journeyId: null, previous: null, appIntent: 'packing_full',
    hasBoundTrack: false, mode: 'on', recentMessages: [], interpretInput: {} }, async () => raw);
  assert(noJourney.routing.clarify?.question && !noJourney.decision.operations.length && !useStagedPipeline(noJourney.decision),
    'packing_full without a journey must clarify');

  let routed = 0;
  const hint = await resolveTask({ message: '规划一次徒步', journeyId: null, previous: null, appIntent: 'plan_journey', hasBoundTrack: false,
    mode: 'on', recentMessages: [], interpretInput: {} }, async () => decision({ mode: 'discuss', operations: [], requiredOperations: [] }),
    async input => { routed++; assert(input.appEntry === 'plan_journey', 'hint not passed'); return { intent: 'discuss', alternatives: [], clarifyQuestion: null, clarifyOptions: [] }; });
  assert(routed === 1 && hint.routing.source === 'router' && hint.routing.appIntent === 'plan_journey', 'plan_journey stays a router hint');

  assert(Object.keys(appIntentRoutes).every(isAgentIntent), 'every app intent is accepted');
  for (const value of ['bogus', '', null, undefined, 3, 'toString', '__proto__']) assert(!isAgentIntent(value), `accepted ${String(value)}`);
  const unknown = await resolveTask({ message: '保存', journeyId: 'journey', previous: null, appIntent: 'bogus', hasBoundTrack: false,
    mode: 'on', recentMessages: [], interpretInput: {} }, async () => raw,
    async () => ({ intent: 'packing_full', alternatives: [], clarifyQuestion: null, clarifyOptions: [] }));
  assert(unknown.routing.source === 'router' && !unknown.routing.appIntent, 'unknown app intent treated as absent');
});

function pending(mode: TaskDecision['mode'], journeyId: string | null = 'journey'): TaskState {
  return { runId: 'previous', journeyId, decision: decision({ mode, operations: mode === 'execute' ? ['add_itinerary_items'] : [] }),
    outcome: { status: 'waiting', pendingQuestion: '从哪里出发？', draft: null, missingOperations: [] } };
}

Deno.test('answers to a question asked while executing skip the router', async () => {
  assert(continuationGate(pending('execute'), 'journey'), 'execute question gates');
  assert(!continuationGate(pending('discuss'), 'journey'), 'discussion question does not gate');
  assert(!continuationGate(pending('execute'), 'other'), 'other journey does not gate');
  assert(!continuationGate({ ...pending('execute'), outcome: { status: 'completed', pendingQuestion: null, draft: null, missingOperations: [] } }, 'journey'), 'finished task does not gate');

  const raw = decision({ continuation: true, domain: 'transport', domainQuote: '高铁', authorizationQuote: '' });
  const gated = await resolveTask({ message: '高铁', journeyId: 'journey', previous: pending('execute'), hasBoundTrack: false, mode: 'on',
    recentMessages: [], interpretInput: {} }, async () => raw, async () => { throw new Error('router called for a continuation'); });
  assert(gated.routing.source === 'continuation' && !gated.routing.applied, JSON.stringify(gated.routing));

  const escalated = await resolveTask({ message: '高铁', journeyId: 'journey', previous: pending('execute'), hasBoundTrack: false, mode: 'on',
    recentMessages: [], interpretInput: {} }, async () => ({ ...raw, fullHikingPlan: true, domain: 'hiking' }));
  assert(!escalated.decision.fullHikingPlan && escalated.decision.domain !== 'hiking', 'continuation escalated to a full plan');
  const widened = await resolveTask({ message: '高铁', journeyId: 'journey', previous: pending('execute'), hasBoundTrack: false, mode: 'on',
    recentMessages: [], interpretInput: {} }, async () => ({ ...raw, fullHikingPlan: true, domain: 'hiking',
    operations: ['create_journey', 'add_itinerary_items'], requiredOperations: ['create_journey', 'add_itinerary_items'] }));
  assert(widened.applied.operations.join() === 'add_itinerary_items', `continuation widened scope: ${widened.applied.operations}`);
  const replan = await resolveTask({ message: '重新规划整个行程', journeyId: 'journey', previous: pending('execute'), hasBoundTrack: false, mode: 'on',
    recentMessages: [], interpretInput: {} }, async () => ({ ...raw, continuation: false, fullHikingPlan: true, domain: 'hiking' }));
  assert(replan.decision.mode === 'discuss' && replan.decision.authorizationUnconfirmed && !useStagedPipeline(replan.decision), 'unrouted replan ran');
  const previousPlan = pending('execute');
  previousPlan.decision = { ...previousPlan.decision, fullHikingPlan: true, domain: 'hiking' };
  const kept = await resolveTask({ message: '成都出发', journeyId: 'journey', previous: previousPlan, hasBoundTrack: false, mode: 'on',
    recentMessages: [], interpretInput: {} }, async () => ({ ...raw, fullHikingPlan: true, domain: 'hiking' }));
  assert(kept.applied.fullHikingPlan, 'answer to a full plan question lost its scope');

  let seen: string | null = null;
  await resolveTask({ message: '成都', journeyId: 'journey', previous: pending('discuss'), hasBoundTrack: false, mode: 'on',
    recentMessages: [], interpretInput: {} }, async () => raw,
    async input => { seen = input.pendingQuestion; return { intent: 'discuss', alternatives: [], clarifyQuestion: null, clarifyOptions: [] }; });
  assert(seen === '从哪里出发？', 'router receives the pending question');
});

Deno.test('a bare refusal of a pending question writes nothing', async () => {
  for (const message of ['不用了', '不用了，谢谢', '算了吧', '先不用', 'No thanks!', 'never mind']) assert(declinesPending(message), message);
  for (const message of ['不要了', '取消', '不用了，改成坐高铁', '算了，换成武功山', 'no, use the train']) assert(!declinesPending(message), message);
  const raw = decision({ continuation: true, domain: 'transport', domainQuote: null, authorizationQuote: '' });
  for (const previous of [pending('execute'), pending('discuss')]) {
    const result = await resolveTask({ message: '不用了', journeyId: 'journey', previous, hasBoundTrack: false, mode: 'on',
      recentMessages: [], interpretInput: {} }, async () => raw,
      async () => ({ intent: 'transport_chain', alternatives: [], clarifyQuestion: null, clarifyOptions: [] }));
    assert(result.decision.mode === 'stop' && !result.decision.operations.length, `${previous.decision.mode}: refusal executed`);
  }
  const fresh = await resolveTask({ message: '不用了', journeyId: 'journey', previous: null, hasBoundTrack: false, mode: 'off',
    recentMessages: [], interpretInput: {} }, async () => raw);
  assert(fresh.decision.mode !== 'stop', 'no pending question, no refusal');
});

Deno.test('a failed router falls back to the interpreter', async () => {
  const warnings: string[] = [];
  const raw = decision({ operations: ['add_gear'], requiredOperations: ['add_gear'], authorizationQuote: '保存' });
  const result = await resolveTask({ message: '保存', journeyId: null, previous: null, hasBoundTrack: false, mode: 'on',
    recentMessages: [], interpretInput: {} }, async () => raw, async () => { throw new Error('timeout'); }, message => warnings.push(message));
  assert(warnings.length === 1 && result.routing.source === 'interpreter' && result.routing.error === 'timeout', JSON.stringify(result.routing));
  assert(result.decision.mode === 'execute' && result.decision.operations.join() === 'add_gear', 'interpreter decision kept');
  const invalid = await resolveTask({ message: '保存', journeyId: null, previous: null, hasBoundTrack: false, mode: 'on',
    recentMessages: [], interpretInput: {} }, async () => raw, async () => ({ intent: 'nope' } as unknown as RouterOutput), () => {});
  assert(invalid.routing.source === 'interpreter' && invalid.decision.operations.join() === 'add_gear', 'invalid router output falls back');
});

Deno.test('KAIPA_INTENT_ROUTER off skips and shadow records without applying', async () => {
  assert(intentRouterMode(undefined) === 'on' && intentRouterMode('ON') === 'on' && intentRouterMode('garbage') === 'on', 'default on');
  assert(intentRouterMode(' shadow ') === 'shadow' && intentRouterMode('Off') === 'off', 'shadow and off');
  const raw = decision({ domain: 'packing', operations: ['add_packing_items'], requiredOperations: ['add_packing_items'], packingMode: 'full',
    authorizationQuote: '保存' });
  const clarify = async (): Promise<RouterOutput> => ({ intent: 'clarify', alternatives: ['gear_add'], clarifyQuestion: '存到哪里？',
    clarifyOptions: [{ label: '装备库', message: '把它录入我的装备库' }] });
  const base = { message: '保存', journeyId: 'journey', previous: null, hasBoundTrack: false, recentMessages: [], interpretInput: {} };

  let calls = 0;
  const off = await resolveTask({ ...base, mode: 'off' }, async () => raw, async () => { calls++; return clarify(); });
  assert(calls === 0 && off.routing.source === 'interpreter' && !off.routing.error && useStagedPipeline(off.decision), 'off ran the router');
  const offQuote = await resolveTask({ ...base, message: '他说“删掉保温杯”', mode: 'off' },
    async () => decision({ authorizationQuote: '删掉保温杯', operations: ['delete_packing_items'], requiredOperations: ['delete_packing_items'] }));
  assert(offQuote.decision.mode !== 'execute', 'quote guard applies with the router off');

  const shadow = await resolveTask({ ...base, mode: 'shadow' }, async () => raw, clarify);
  assert(shadow.routing.source === 'router' && shadow.routing.intent === 'clarify' && !shadow.routing.applied, JSON.stringify(shadow.routing));
  assert(shadow.decision.operations.join() === off.decision.operations.join() && useStagedPipeline(shadow.decision), 'shadow changed the decision');

  const on = await resolveTask({ ...base, mode: 'on' }, async () => raw, clarify);
  assert(on.routing.applied && on.routing.clarify?.question === '存到哪里？' && !on.decision.operations.length, JSON.stringify(on.routing));
});

Deno.test('router output is normalized', () => {
  const clarify = normalizeRoute({ intent: 'clarify', alternatives: [], clarifyQuestion: ' ', clarifyOptions: [{ label: ' ', message: 'x' }] }, 'add my tent');
  assert(clarify.clarifyQuestion?.startsWith('What') && !clarify.clarifyOptions.length, JSON.stringify(clarify));
  const plain = normalizeRoute({ intent: 'gear_add', alternatives: [], clarifyQuestion: '?', clarifyOptions: [{ label: 'a', message: 'b' }] }, '保存');
  assert(plain.clarifyQuestion === null && !plain.clarifyOptions.length, 'non-clarify output keeps no question');
});

Deno.test('definition examples stay disjoint from eval cases', () => {
  const examples = [...Object.values(intentDefinitions), unsupportedDefinition, clarifyDefinition].flatMap(definition => definition.examples);
  for (const testCase of intentCases) {
    for (const example of examples) {
      assert(example !== testCase.message, `${testCase.id} copies an example`);
      if (testCase.message.length >= 6) assert(!example.includes(testCase.message), `${testCase.id} is inside an example`);
    }
  }
});

Deno.test('a failed router still asks for missing planning premises', async () => {
  const failing = async (): Promise<RouterOutput> => { throw new Error('router down'); };
  const base = { previous: null, hasBoundTrack: false, mode: 'on' as const, recentMessages: [], interpretInput: {} };
  const packing = await resolveTask({ ...base, message: '补充高海拔三天两夜的装备清单', journeyId: null },
    async () => decision({ domain: 'packing', operations: ['add_packing_items'], requiredOperations: ['add_packing_items'], packingMode: 'full' }),
    failing, () => {});
  assert(packing.routing.source === 'interpreter' && packing.routing.clarify?.question && !useStagedPipeline(packing.decision),
    `packing without a journey ran: ${JSON.stringify(packing.routing)}`);
  const plan = await resolveTask({ ...base, message: '帮我规划一下', journeyId: null },
    async () => decision({ fullHikingPlan: true }), failing, () => {});
  assert(plan.routing.clarify?.question && !useStagedPipeline(plan.decision), `plan with nowhere to go ran: ${JSON.stringify(plan.routing)}`);
  const kept = await resolveTask({ ...base, message: '保存', journeyId: 'journey' },
    async () => decision({ domain: 'packing', operations: ['add_packing_items'], requiredOperations: ['add_packing_items'], packingMode: 'full' }),
    failing, () => {});
  assert(!kept.routing.clarify && useStagedPipeline(kept.decision), 'a journey checklist must still run');
});

Deno.test('gear set intent keeps only its write and never plans', () => {
  const raw = decision({ domain: 'packing', operations: ['add_gear_set_items', 'add_packing_items'], requiredOperations: ['add_gear_set_items'],
    packingMode: 'full', fullHikingPlan: true });
  const result = applyIntent('gear_set', raw, { journeyId: null, message: '补充高海拔三天两夜清单' });
  assert(result.decision.operations.join() === 'add_gear_set_items' && !result.clarification, JSON.stringify(result));
  assert(!useStagedPipeline(result.decision), 'gear set ran the pipeline');
  assert(intentFromDecision(decision({ operations: ['add_gear_set_items'], requiredOperations: ['add_gear_set_items'] })) === 'gear_set', 'reverse map');
});
