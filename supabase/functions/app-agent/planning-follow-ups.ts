import type { AgentQuickReply } from './types.ts';

type ToolCall = {
  tool_name: string;
  status: string;
  output?: { added?: number; skippedDuplicates?: number } | null;
  undone_at?: string | null;
};

export function planningFollowUpReplies(
  offerJourneyExtras: boolean,
  quickReplies: AgentQuickReply[],
  calls: ToolCall[],
  locale?: 'zh' | 'en',
): AgentQuickReply[] {
  // Model intent alone is insufficient: only offer extras after a saved plan.
  const savedPlan = calls.some((call) => call.tool_name === 'add_itinerary_items'
    && call.status === 'completed' && !call.undone_at
    && ((call.output?.added ?? 0) > 0 || (call.output?.skippedDuplicates ?? 0) > 0));
  if (!offerJourneyExtras || quickReplies.length || !savedPlan) return quickReplies;

  const options = locale === 'en'
    ? [
        ['Arrange transport', 'Plan round-trip transport with trail transfers. Reuse confirmed places or suggest device location for confirmation. Compare feasible options, ask only key questions, and preserve my hike.'],
        ['Arrange accommodation', 'Help me add accommodation around the hike just planned. Ask only for missing accommodation details and preserve my existing itinerary.'],
      ]
    : [
        ['安排往返交通', '帮我安排完整往返交通，包含到徒步起点和从终点离开的接驳。复用已确认地点；缺少出发地时可建议本次定位，并确认是否往返这里。先分析可行方案，只问关键问题，保留已有徒步行程。'],
        ['安排住宿', '帮我为刚规划的旅程补充徒步前后的住宿，只询问缺失的住宿需求，保留已有行程。'],
      ];
  return options.map(([label, message]) => ({ label, message, action: 'supplement_plan' }));
}

export function normalizePlanningFollowUps(replies: AgentQuickReply[]): AgentQuickReply[] {
  const labels: Record<string, string> = {
    '补充往返交通': '安排往返交通',
    '补充住宿': '安排住宿',
    'Add transport': 'Arrange transport',
    'Add accommodation': 'Arrange accommodation',
  };
  return replies.flatMap((reply) => {
    if (reply.action !== 'supplement_plan') return [reply];
    if (reply.label === '补充交通和住宿' || reply.label === 'Add both') return [];
    return [{ ...reply, label: labels[reply.label] || reply.label }];
  });
}
