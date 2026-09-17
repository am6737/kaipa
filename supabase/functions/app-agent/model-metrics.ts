import type { Model, ModelProvider } from 'npm:@openai/agents@0.16.1';

export type ModelMetric = { stage: string; model: string; duration_ms: number; success: boolean; usage: Record<string, number> | null };
export function measuredModel(provider: ModelProvider, model: string, stage: string, record?: (metric: ModelMetric) => Promise<void>): Model {
  return {
    async getResponse(request) {
      const delegate = await provider.getModel(model);
      const started = Date.now();
      let metric: ModelMetric = { stage, model, duration_ms: 0, success: false, usage: null };
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
      } finally {
        metric.duration_ms = Date.now() - started;
        try { await record?.(metric); } catch { console.warn('[AppAgent] model metrics unavailable'); }
      }
    },
    async *getStreamedResponse(request) { yield* (await provider.getModel(model)).getStreamedResponse(request); },
  };
}
