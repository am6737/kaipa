import { newPackingDraft, patchPackingDraft, draftFeedback } from './packing-draft.ts';
import { createAgentRuntime } from './agent.ts';
import type { TaskState } from './task.ts';

function assert(value: unknown, message = 'Assertion failed'): asserts value { if (!value) throw new Error(message); }
function throws(fn: () => unknown) { let failed = false; try { fn(); } catch { failed = true; } assert(failed, 'Expected rejection'); }
const profile = { accommodation: 'day_trip', waterRefill: 'none', mealPreparation: 'no_cook' } as const;
const item = { name: 'Water', quantity: 4, weightKg: 0.5, weightEstimated: true, carryStatus: 'consumable' as const };

Deno.test('draft patch preserves unrelated items and omitted fields without applying quantity defaults', () => {
  const draft = newPackingDraft('journey', profile, [item, { ...item, name: 'Food' }]);
  const patched = patchPackingDraft(draft, { revision: 1, changes: [{ id: 'item-1', patch: { attributes: [{ name: 'Capacity', value: '500ml' }] } }], additions: [], removals: [] });
  assert(patched.items[0].value.quantity === 4);
  assert(JSON.stringify(patched.items[1]) === JSON.stringify(draft.items[1]));
  assert(draft.items[0].value.attributes === undefined);
  assert(patched.revision === 2 && patched.repairs === 1);
});
Deno.test('draft revisions and stable IDs constrain local changes', () => {
  let draft = newPackingDraft('journey', profile, [item]);
  const patch = { revision: 1, changes: [{ id: 'item-1', patch: { quantity: 2 } }], additions: [], removals: [] };
  throws(() => patchPackingDraft(draft, { ...patch, revision: 2 }));
  throws(() => patchPackingDraft(draft, { ...patch, removals: ['other'] }));
  throws(() => patchPackingDraft(draft, { ...patch, removals: ['item-1'] }));
  throws(() => patchPackingDraft(draft, { revision: 1, changes: [], additions: [], removals: [] }));
});
Deno.test('internal repairs can continue past three revisions before one final commit', () => {
  let draft = newPackingDraft('journey', profile, [item]);
  for (let i = 0; i < 5; i++) {
    draft = patchPackingDraft(draft, { revision: draft.revision,
      changes: [{ id: 'item-1', patch: { quantity: i + 1 } }], additions: [], removals: [] });
  }
  assert(draft.repairs === 5 && draft.revision === 6);
  const feedback = draftFeedback(draft, [{ code: 'item', itemIds: ['item-1'], field: 'attributes', message: 'Missing capacity' }]);
  assert(feedback.status === 'needs_repair' && feedback.next.includes('Patch only'));
  assert(!('repairsRemaining' in feedback));
  const ready = draftFeedback(draft, []);
  assert(ready.status === 'ready' && ready.next.includes('commit_packing_draft'));
  assert(ready.next.includes('nothing is saved'));
});
Deno.test('feedback returns affected items instead of the entire draft and is not a save receipt', () => {
  const draft = newPackingDraft('journey', profile, [item, { ...item, name: 'Food' }]);
  const feedback = draftFeedback(draft, [{ code: 'item', itemIds: ['item-1'], field: 'attributes', message: 'Missing capacity' }]);
  assert(feedback.items.length === 1 && feedback.items[0].id === 'item-1');
  assert(feedback.status === 'needs_repair');
  assert(draftFeedback(draft, []).status === 'ready');
});
Deno.test('full packing exposes draft tools while incremental and discuss retain their boundaries', () => {
  const task: TaskState = { runId: 'r', journeyId: 'j', outcome: null, decision: {
    objective: 'Packing', mode: 'execute', continuation: false, authorizationQuote: 'Save', operations: ['add_packing_items'], requiredOperations: ['add_packing_items'],
    destination: null, plannedDate: null, dateUndecided: false, days: 1, trackAttachmentName: null, packingMode: 'full', constraints: [],
  } };
  const names = () => createAgentRuntime({ model: 'test', apiKey: 'test', baseUrl: 'https://example.test' }, true, task).agent.tools.map(tool => tool.name);
  assert(names().includes('prepare_packing_draft') && !names().includes('add_packing_items'));
  task.decision.packingMode = 'incremental';
  assert(names().includes('add_packing_items') && !names().includes('repair_packing_draft'));
  task.decision.mode = 'discuss';
  assert(!names().includes('add_packing_items') && !names().includes('commit_packing_draft'));
});
