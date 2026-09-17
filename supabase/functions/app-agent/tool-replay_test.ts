import assert from 'node:assert/strict';
import { canReplayToolResult } from './tool-replay.ts';

Deno.test('recovery refreshes mutable state instead of replaying pre-write snapshots', () => {
  for (const name of ['get_app_context', 'get_journey_details', 'search_journeys', 'list_gear', 'estimate_personal_packing_needs']) {
    assert.equal(canReplayToolResult(name), false, name);
  }
});

Deno.test('successful writes and research remain replayable within the same run', () => {
  for (const name of ['create_journey', 'add_itinerary_items', 'add_packing_items', 'search_travel_web', 'search_routes']) {
    assert.equal(canReplayToolResult(name), true, name);
  }
});
