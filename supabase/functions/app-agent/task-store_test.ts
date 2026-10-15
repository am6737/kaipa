import { prepareTask } from './task-store.ts';
import { taskClarification, taskDecisionSchema } from './task.ts';
import { TOPIC_POLICY_VERSION } from './topic-boundary.ts';

Deno.test('task preparation supplies bound-track metadata and persists missing full-plan endpoint dependency', async () => {
  for (const hasTrack of [true, false]) {
    let inserted: any;
    let interpreted: any;
    const client = { from(table: string) {
      const chain = {
        select: () => chain, eq: () => chain, is: () => chain, order: () => chain, limit: () => chain,
        maybeSingle: () => ({ error: null, data: table === 'journeys' && hasTrack
          ? { tracks: { file_name: 'route.gpx', coords: [[100, 30], [100.1, 30.1]] } } : null }),
        insert: (value: unknown) => { inserted = value; return { error: null }; },
        then: (resolve: (value: unknown) => unknown) => resolve({ error: null, data: [] }),
      };
      return chain;
    } };
    const task = await prepareTask(client, client, { runId: 'run', threadId: 'thread', userId: 'user', journeyId: 'journey',
      message: 'save', intent: 'plan_journey', temporalContext: '2026-09-10 UTC', attachments: [] }, async input => {
      interpreted = input;
      return taskDecisionSchema.parse({ objective: 'Plan full hike', offTopic: true, mode: 'execute', continuation: false, authorizationQuote: 'save',
        operations: ['add_itinerary_items', 'add_packing_items'], requiredOperations: ['add_itinerary_items', 'add_packing_items'],
        days: null, derivedDays: null, plannedDate: null, dateUndecided: true, destination: 'Route', trackAttachmentName: null, packingMode: 'full', constraints: [] });
    }, async () => ({ allowed: true, policyVersion: TOPIC_POLICY_VERSION, checkedAt: '2026-10-08T00:00:00Z' }));
    if (interpreted.boundTrack.available !== hasTrack) throw new Error('Track metadata missing');
    if (task.decision.requiredOperations.includes('set_itinerary_group_endpoints') !== hasTrack) throw new Error('Wrong endpoint dependency');
    if (inserted.state !== task || task.decision.days !== null) throw new Error('Scope not persisted or duration changed');
    if (task.decision.offTopic) throw new Error('Interpreter overrode NeMo verdict');
  }
});

Deno.test('older saved runs get NeMo once without reinterpreting existing authorization', async () => {
  const original = taskDecisionSchema.parse({ objective: 'Plan full hike', mode: 'execute', continuation: false,
    authorizationQuote: 'save', operations: ['add_itinerary_items'], requiredOperations: ['add_itinerary_items'],
    days: 3, plannedDate: null, dateUndecided: true, destination: 'Route', trackAttachmentName: null, packingMode: 'none', constraints: [] });
  let saved: any = { runId: 'run', journeyId: 'journey', decision: original, outcome: null };
  const client = { from(table: string) {
    if (table === 'journeys') throw new Error('Migration reread journey context');
    let isRun = false;
    let updated: any;
    const chain = { select: () => chain, eq: (key: string) => { if (key === 'run_id') isRun = true; return chain; },
      order: () => chain, limit: () => chain, maybeSingle: () => ({ error: null, data: isRun ? { state: saved } : null }),
      update: (value: any) => { updated = value; return chain; },
      then: (resolve: (value: unknown) => unknown) => { if (updated) saved = updated.state; return resolve({ error: null, data: [] }); } };
    return chain;
  } };
  const task = await prepareTask(client, client, { runId: 'run', threadId: 'thread', userId: 'user', journeyId: 'journey',
    message: 'save', temporalContext: 'today', attachments: [] }, async () => { throw new Error('Scope was reinterpreted'); },
    async () => ({ allowed: true, policyVersion: TOPIC_POLICY_VERSION, checkedAt: 'now' }));
  if (!task.topicCheck?.allowed || task.decision.operations.join() !== original.operations.join()) throw new Error('Original scope changed');
});

Deno.test('NeMo rejection precedes interpretation and journey reads and survives worker retries', async () => {
  let persisted: any = null;
  let classified = 0;
  let interpreted = 0;
  const client = { from(table: string) {
    if (table === 'journeys') throw new Error('Rejected request read journey context');
    let runQuery = false;
    const chain = {
      select: () => chain, eq: (column: string) => { if (column === 'run_id') runQuery = true; return chain; },
      order: () => chain, limit: () => chain,
      maybeSingle: () => ({ error: null, data: runQuery && persisted ? { state: persisted.state } : null }),
      insert: (value: unknown) => { persisted = value; return { error: null }; },
      then: (resolve: (value: unknown) => unknown) => resolve({ error: null, data: [] }),
    };
    return chain;
  } };
  const args = { runId: 'run', threadId: 'thread', userId: 'user', journeyId: 'journey',
    message: '生成一个骑车鹅的 SVG', intent: 'plan_journey', temporalContext: 'today', attachments: [] };
  for (let attempt = 0; attempt < 2; attempt++) {
    const task = await prepareTask(client, client, args,
      async () => { interpreted++; throw new Error('Rejected request reached interpreter'); },
      async input => {
        classified++;
        if (input.latestMessage !== args.message) throw new Error('Wrong request checked');
        return { allowed: false, policyVersion: TOPIC_POLICY_VERSION, checkedAt: 'now' };
      });
    if (!task.decision.offTopic || task.decision.operations.length) throw new Error('Rejection not enforced');
  }
  if (classified !== 1 || interpreted !== 0) throw new Error('Retry duplicated classification or ran interpreter');
});

Deno.test('unavailable NeMo cannot authorize or persist a task', async () => {
  let writes = 0;
  const client = { from() {
    const chain = { select: () => chain, eq: () => chain, order: () => chain, limit: () => chain,
      maybeSingle: () => ({ error: null, data: null }), insert: () => { writes++; },
      then: (resolve: (value: unknown) => unknown) => resolve({ error: null, data: [] }) };
    return chain;
  } };
  try {
    await prepareTask(client, client, { runId: 'run', threadId: 'thread', userId: 'user', journeyId: null,
      message: 'save', temporalContext: 'today', attachments: [] },
      async () => { throw new Error('Interpreter must not run'); },
      async () => { throw new Error('topic_check_unavailable'); });
  } catch (error) {
    if (!(error instanceof Error) || error.message !== 'topic_check_unavailable' || writes) throw error;
    return;
  }
  throw new Error('Unavailable guard passed');
});

Deno.test('a routed clarification is persisted and reused on retry', async () => {
  let persisted: any = null;
  let interpreted = 0;
  let routed = 0;
  const client = { from(table: string) {
    let runQuery = false;
    const chain = {
      select: () => chain, eq: (column: string) => { if (column === 'run_id') runQuery = true; return chain; },
      is: () => chain, order: () => chain, limit: () => chain,
      maybeSingle: () => ({ error: null, data: runQuery && persisted ? { state: persisted.state } : null }),
      insert: (value: unknown) => { persisted = value; return { error: null }; },
      then: (resolve: (value: unknown) => unknown) => resolve({ error: null, data: [] }),
    };
    return chain;
  } };
  const args = { runId: 'run', threadId: 'thread', userId: 'user', journeyId: 'journey',
    message: '添加一顶帐篷', temporalContext: 'today', attachments: [], routerMode: 'on' as const };
  for (let attempt = 0; attempt < 2; attempt++) {
    const task = await prepareTask(client, client, args, async () => {
      interpreted++;
      return taskDecisionSchema.parse({ objective: 'add tent', mode: 'execute', continuation: false, authorizationQuote: '添加一顶帐篷',
        operations: ['add_packing_items'], requiredOperations: ['add_packing_items'], days: null, plannedDate: null, dateUndecided: false,
        destination: null, trackAttachmentName: null, packingMode: 'incremental', constraints: [] });
    }, async () => ({ allowed: true, policyVersion: TOPIC_POLICY_VERSION, checkedAt: 'now' }), async input => {
      routed++;
      if (input.latestMessage !== args.message || !input.hasCurrentJourney) throw new Error('Wrong router input');
      return { intent: 'clarify', alternatives: ['gear_add', 'packing_add'], clarifyQuestion: '加到哪里？',
        clarifyOptions: [{ label: '装备库', message: '把帐篷录入我的装备库' }, { label: '这次清单', message: '把帐篷加到这次旅程的装备清单' }] };
    });
    const clarification = taskClarification(task);
    if (clarification?.question !== '加到哪里？' || clarification.options.length !== 2) throw new Error('Clarification missing');
    if (task.decision.mode === 'execute' || task.decision.operations.length) throw new Error('Clarification kept writes');
  }
  if (persisted.state.routing?.intent !== 'clarify') throw new Error('Routing not persisted');
  if (interpreted !== 1 || routed !== 1) throw new Error('Retry re-ran interpretation or routing');
});

Deno.test('task preparation passes the router mode through', async () => {
  for (const routerMode of ['off', 'shadow'] as const) {
    let routed = 0;
    const client = { from() {
      const chain = { select: () => chain, eq: () => chain, is: () => chain, order: () => chain, limit: () => chain,
        maybeSingle: () => ({ error: null, data: null }), insert: () => ({ error: null }),
        then: (resolve: (value: unknown) => unknown) => resolve({ error: null, data: [] }) };
      return chain;
    } };
    const task = await prepareTask(client, client, { runId: 'run', threadId: 'thread', userId: 'user', journeyId: null,
      message: '记上我的新头灯', temporalContext: 'today', attachments: [], routerMode }, async () => taskDecisionSchema.parse({
      objective: 'gear', mode: 'execute', continuation: false, authorizationQuote: '记上我的新头灯', operations: ['add_gear'],
      requiredOperations: ['add_gear'], days: null, plannedDate: null, dateUndecided: false, destination: null, trackAttachmentName: null,
      packingMode: 'none', constraints: [] }), async () => ({ allowed: true, policyVersion: TOPIC_POLICY_VERSION, checkedAt: 'now' }),
    async () => { routed++; return { intent: 'discuss', alternatives: [], clarifyQuestion: null, clarifyOptions: [] }; });
    if (routed !== (routerMode === 'off' ? 0 : 1)) throw new Error(`${routerMode}: router calls ${routed}`);
    if (task.decision.operations.join() !== 'add_gear' || task.routing?.applied) throw new Error(`${routerMode}: decision changed`);
  }
});
