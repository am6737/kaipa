const liveStateTools = new Set([
  'prepare_packing_draft', 'read_packing_draft', 'repair_packing_draft', 'commit_packing_draft',
  'get_app_context', 'get_journey_details', 'search_journeys', 'list_gear', 'estimate_personal_packing_needs', 'read_conversation_history',
]);

export function canReplayToolResult(toolName: string) {
  return !liveStateTools.has(toolName);
}
