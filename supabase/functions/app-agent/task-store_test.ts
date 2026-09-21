import { prepareTask } from './task-store.ts';
import { taskDecisionSchema } from './task.ts';

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
      return taskDecisionSchema.parse({ objective: 'Plan full hike', mode: 'execute', continuation: false, authorizationQuote: 'save',
        operations: ['add_itinerary_items', 'add_packing_items'], requiredOperations: ['add_itinerary_items', 'add_packing_items'],
        days: null, derivedDays: null, plannedDate: null, dateUndecided: true, destination: 'Route', trackAttachmentName: null, packingMode: 'full', constraints: [] });
    });
    if (interpreted.boundTrack.available !== hasTrack) throw new Error('Track metadata missing');
    if (task.decision.requiredOperations.includes('set_itinerary_group_endpoints') !== hasTrack) throw new Error('Wrong endpoint dependency');
    if (inserted.state !== task || task.decision.days !== null) throw new Error('Scope not persisted or duration changed');
  }
});
