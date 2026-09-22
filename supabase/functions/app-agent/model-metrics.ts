import type { Model, ModelProvider } from 'npm:@openai/agents@0.16.1';

export type ModelMetric = { stage: string; model: string; duration_ms: number; success: boolean; aborted: boolean; usage: Record<string, number> | null };

// An abort is a budget firing, not the model being wrong. It has to be recorded
// rather than dropped: stage budgets were previously calibrated from this table
// while aborted calls were indistinguishable from absent ones, so the
// distribution used to pick a budget had already been truncated by that same
// budget at every ceiling.
//
// Detection matches the message, not error.name, because that is what this
// stack actually throws: pipeline.ts and index.ts already classify abandonment
// with the same pattern, and the recorded failures read 'Request was aborted.'
// on a plain Error whose name is 'Error'. A name-only check would have missed
// every real ceiling and reported the censoring as absent.
const ABORT_PATTERN = /Request was aborted|AbortError|signal is aborted|The operation was aborted|timed? ?out/i;

function isAbort(error: unknown) {
  if (error && typeof error === 'object') {
    const { name, message } = error as { name?: unknown; message?: unknown };
    if (name === 'AbortError' || name === 'TimeoutError') return true;
    if (typeof message === 'string' && ABORT_PATTERN.test(message)) return true;
  }
  return typeof error === 'string' && ABORT_PATTERN.test(error);
}

export function measuredModel(provider: ModelProvider, model: string, stage: string, record?: (metric: ModelMetric) => Promise<void>): Model {
  return {
    async getResponse(request) {
      const delegate = await provider.getModel(model);
      const started = Date.now();
      let metric: ModelMetric = { stage, model, duration_ms: 0, success: false, aborted: false, usage: null };
      try {
        const response = await delegate.getResponse(request);
        const tool = response.output.find(item => item.type === 'function_call');
        const name = tool && 'name' in tool ? tool.name : '';
        const phase = name === 'prepare_packing_draft' ? 'packing_generation' : name === 'repair_packing_draft' ? 'packing_repair' : name === 'commit_packing_draft' ? 'packing_commit_decision' : stage;
        const usage = response.usage;
        metric = { ...metric, stage: phase, success: true, usage: usage?.totalTokens > 0 ? {
          inputTokens: usage.inputTokens, outputTokens: usage.outputTokens, totalTokens: usage.totalTokens,
        } : null };
        return response;
      } catch (error) {
        metric = { ...metric, aborted: isAbort(error) };
        throw error;
      } finally {
        metric.duration_ms = Date.now() - started;
        try { await record?.(metric); } catch { console.warn('[AppAgent] model metrics unavailable'); }
      }
    },
    async *getStreamedResponse(request) { yield* (await provider.getModel(model)).getStreamedResponse(request); },
  };
}
