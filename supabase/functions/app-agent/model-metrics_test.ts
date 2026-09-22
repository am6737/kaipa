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

// The `aborted` flag is what keeps a stage budget from censoring the
// distribution it was set from: a call cut by its own ceiling must not be
// counted as evidence that calls are fast. Only the two names a budget actually
// produces qualify, so a provider that merely words its failure 'aborted' stays
// a real failure rather than silently disappearing from the latency sample.
async function classify(thrown: unknown) {
  const metrics: ModelMetric[] = [];
  const provider = { getModel: async () => ({ getResponse: async () => { throw thrown; } }) } as unknown as ModelProvider;
  try { await measuredModel(provider, 'test', 'research', async m => { metrics.push(m); }).getResponse({} as never); } catch { /* expected */ }
  return metrics[0];
}

Deno.test('a budget ceiling is flagged as censoring, not as a fast call', async () => {
  const timeout = await classify(new DOMException('The operation timed out', 'TimeoutError'));
  if (!timeout || timeout.aborted !== true) throw new Error('AbortSignal.timeout() must be recorded as aborted');
  const controller = await classify(new DOMException('aborted', 'AbortError'));
  if (!controller || controller.aborted !== true) throw new Error('AbortController abort must be recorded as aborted');
  // The shape this stack really produces: a plain Error carrying the fetch
  // library's wording. It is the dominant abort in the recorded failures, so a
  // name-only check classifies every one of them as an ordinary failure and the
  // censored distribution looks clean.
  const plain = await classify(new Error('Request was aborted.'));
  if (!plain || plain.aborted !== true) throw new Error("'Request was aborted.' on a plain Error must be recorded as aborted");
});

Deno.test('a provider failure is not mistaken for a budget ceiling', async () => {
  const generic = await classify(new Error('aborted'));
  if (!generic || generic.aborted !== false || generic.success !== false) throw new Error('a generic failure must stay a failure, not a censored sample');
  const refused = await classify(new Error('upstream 503'));
  if (!refused || refused.aborted !== false) throw new Error('an unavailable provider is not a ceiling');
  // Schema rejection is the other dominant failure and must never be absorbed
  // into the abort bucket, or the re-ask loop stops being visible.
  const invalid = await classify(new Error('Invalid output type: final assistant output failed schema validation'));
  if (!invalid || invalid.aborted !== false) throw new Error('a schema validation failure is not a ceiling');
});
