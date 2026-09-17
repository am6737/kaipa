import { measuredModel, type ModelMetric } from './model-metrics.ts';
import type { ModelProvider } from 'npm:@openai/agents@0.16.1';

Deno.test('model metrics classify generation and count usage without recording content', async () => {
  const metrics: ModelMetric[] = [];
  const provider = { getModel: async () => ({ getResponse: async () => ({ output: [{ type: 'function_call', name: 'prepare_packing_draft' }], usage: { inputTokens: 12, outputTokens: 34, totalTokens: 46 } }) }) } as unknown as ModelProvider;
  await measuredModel(provider, 'test', 'execution', async metric => { metrics.push(metric); }).getResponse({} as never);
  if (metrics.length !== 1 || metrics[0].stage !== 'packing_generation' || metrics[0].usage?.totalTokens !== 46 || !metrics[0].success) throw new Error('Usage metric lost');
});
Deno.test('aborted model attempts record unknown usage instead of zero cost', async () => {
  const metrics: ModelMetric[] = [];
  const provider = { getModel: async () => ({ getResponse: async () => { throw new Error('aborted'); } }) } as unknown as ModelProvider;
  let failed = false;
  try { await measuredModel(provider, 'test', 'execution', async metric => { metrics.push(metric); }).getResponse({} as never); } catch { failed = true; }
  if (!failed || metrics.length !== 1 || metrics[0].success || metrics[0].usage !== null) throw new Error('Failure usage incorrectly reported');
});
