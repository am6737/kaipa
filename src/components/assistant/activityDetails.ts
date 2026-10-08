import type { AgentRunActivity } from '../../lib/appAgent';

/** Summaries use receipts, never infer a successful read/write from arguments. */
export function activityDetails(activity: AgentRunActivity): string[] {
  // Transport rows already show the route and result summary.
  if (activity.toolName === 'search_transport') return [];
  const args = activity.arguments;
  const output = activity.output && typeof activity.output === 'object'
    ? activity.output as Record<string, unknown> : {};
  const details: string[] = [];
  for (const [field, label] of [['query', '查询'], ['url', '攻略'], ['sourceUrl', '来源'], ['name', '名称'], ['origin', '出发'], ['destination', '到达'], ['departureDate', '日期']] as const) {
    if (typeof args[field] === 'string' && args[field]) details.push(`${label}：${args[field]}`);
  }
  if (activity.status === 'completed') {
    const count = Array.isArray(activity.output) ? activity.output.length : output.resultCount;
    if (typeof count === 'number') details.push(`返回 ${count} 条结果`);
    for (const [field, label] of [['added', '已写入'], ['deleted', '已删除'], ['skippedDuplicates', '跳过重复']] as const) {
      if (typeof output[field] === 'number') details.push(`${label} ${output[field]} 项`);
    }
    if (output.cached === true || output.reused === true) details.push('使用已缓存或已读取的资料');
  }
  return details;
}

export function hasResearchActivity(activities: AgentRunActivity[]) {
  return activities.some(({ toolName }) => /^(search_routes|search_travel_web|read_travel_guide|read_travel_guide_images|get_route_facts|get_journey_details|search_transport|search_ground_transport)$/.test(toolName));
}
