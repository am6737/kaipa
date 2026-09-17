import assert from 'node:assert/strict';
import { packingActivityPresentation } from '../src/components/assistant/packingActivityPresentation.ts';

const packing = (status, journeyId = 'journey-1') => ({
  toolName: 'add_packing_items', status, arguments: { journeyId },
});
const other = { toolName: 'add_itinerary_items', status: 'failed', arguments: {} };
const statuses = (activities, running) => packingActivityPresentation(activities, running).map(item => item.status);

assert.deepEqual(statuses([packing('failed')], true), ['running']);
assert.deepEqual(statuses([packing('failed'), packing('running')], true), ['running']);
assert.deepEqual(statuses([packing('failed'), packing('failed')], true), ['running']);
for (const running of [true, false]) {
  assert.deepEqual(statuses([packing('failed'), packing('completed')], running), ['completed']);
}
assert.deepEqual(statuses([packing('failed')], false), ['failed']);
assert.deepEqual(statuses([packing('running')], false), ['failed']);
assert.deepEqual(statuses([packing('completed'), packing('failed')], false), ['failed']);
assert.deepEqual(statuses([packing('failed'), packing('completed', 'journey-2')], false), ['failed', 'completed']);
const activities = [packing('failed'), other, packing('completed')];
const snapshot = structuredClone(activities);
assert.deepEqual(packingActivityPresentation(activities, false), [packing('completed'), other]);
assert.deepEqual(activities, snapshot);
assert.deepEqual(packingActivityPresentation([], true), []);
console.log('Packing activity presentation tests passed.');
