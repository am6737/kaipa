import type { AgentQuickReply } from './types.ts';
import type { ModelBudget } from '../_shared/resource-guard.ts';
import type { ModelMetric } from './model-metrics.ts';

export const TOPIC_POLICY_VERSION = 'kaipa-travel-v1';
export type TopicInput = {
  latestMessage: string;
  recentMessages: Array<{ role: string; content: string }>;
  pendingQuestion: string | null;
};
export type TopicCheck = { allowed: boolean; policyVersion: string; checkedAt: string };

export async function checkTopic(input: TopicInput, options: {
  url: string; token: string; fetcher?: typeof fetch;
  budget?: ModelBudget; recordMetric?: (metric: ModelMetric) => Promise<void>;
}): Promise<TopicCheck> {
  if (!options.url || !options.token) throw new Error('topic_guard_configuration_missing');
  const started = Date.now();
  let model = 'NeMo topic guard';
  let success = false;
  let aborted = false;
  try {
    const body = JSON.stringify(input);
    // Reserve the classifier call too; no provider-usage receipt means retain
    // the conservative charge, matching existing model-budget behavior.
    await options.budget?.reserve(new TextEncoder().encode(body).length + 8192);
    const response = await (options.fetcher || fetch)(`${options.url.replace(/\/$/, '')}/check`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${options.token}` },
      body, signal: AbortSignal.timeout(35000),
    });
    if (!response.ok) throw new Error('topic_check_unavailable');
    const result = await response.json();
    if (typeof result.allowed !== 'boolean' || result.policyVersion !== TOPIC_POLICY_VERSION
      || typeof result.model !== 'string' || !result.model.trim()) throw new Error('invalid_topic_check_result');
    model = result.model;
    success = true;
    return { allowed: result.allowed, policyVersion: result.policyVersion, checkedAt: new Date().toISOString() };
  } catch (error) {
    aborted = error instanceof Error && ['AbortError', 'TimeoutError'].includes(error.name);
    throw error;
  } finally {
    try {
      await options.recordMetric?.({ stage: 'topic_check', model, duration_ms: Date.now() - started,
        success, aborted, usage: null });
    } catch { console.warn('[AppAgent] topic-check metrics unavailable'); }
  }
}

// Fixed copy prevents the conversational model from fulfilling rejected work.
export function offTopicResponse(locale?: string) {
  const english = locale === 'en';
  const quickReplies: AgentQuickReply[] = english ? [
    { label: 'Plan a trip', message: 'Help me plan a trip' },
    { label: 'Find hiking routes', message: 'Recommend some hiking routes' },
    { label: 'Prepare my gear', message: 'Help me prepare gear for a trip' },
  ] : [
    { label: '帮我规划一次旅行', message: '帮我规划一次旅行' },
    { label: '推荐徒步路线', message: '帮我推荐徒步路线' },
    { label: '准备出行装备', message: '帮我准备出行装备' },
  ];
  return {
    text: english
      ? 'I can help with travel, outdoor activities, and gear. This request is outside that scope. Tell me about a trip or outdoor plan you have in mind.'
      : '我可以帮你规划旅行、查询户外路线和准备装备。这个请求不在我的服务范围内。你可以告诉我想去哪里，或有什么出行需求。',
    quickReplies, pendingQuestion: null, draft: null,
  };
}
