import type { AgentRunActivity } from '../../lib/appAgent';

export function packingActivityPresentation(activities: AgentRunActivity[], running: boolean): AgentRunActivity[] {
  const packingPositions = new Map<unknown, number>();
  const result: AgentRunActivity[] = [];
  for (const activity of activities) {
    if (activity.toolName !== 'add_packing_items') {
      result.push(activity);
      continue;
    }
    // Keep retries in one stable row; only report failure once the run ends.
    const presented: AgentRunActivity = {
      ...activity,
      status: activity.status === 'completed' ? 'completed' : running ? 'running' : 'failed',
    };
    const journeyId = activity.arguments.journeyId;
    const position = packingPositions.get(journeyId);
    if (position === undefined) {
      packingPositions.set(journeyId, result.length);
      result.push(presented);
    } else {
      result[position] = presented;
    }
  }
  return result;
}
