import { tool } from 'npm:@openai/agents@0.16.1';
import { z } from 'npm:zod@4.1.12';
import { assistantOutput } from './agent.ts';
import { transportEndpointsSchema } from './main-transport.ts';
import { packingPatchModelSchema, packingProposalModelSchema } from './packing-stage.ts';
import { planChunkSchema, planDocumentModelSchema, planSkeletonSchema, researchBriefSchema } from './plan-document.ts';
import { taskDecisionSchema } from './task.ts';

// Stage agents pass these as outputType. The SDK converts them to strict JSON
// Schema at run time, and a field it cannot convert (for example `.optional()`
// without `.nullable()`) fails every call while plain `.parse()` unit tests
// still pass. tool() runs the same strict conversion eagerly.
const schemas: Record<string, unknown> = {
  assistantOutput,
  taskDecision: taskDecisionSchema.omit({ offTopic: true }),
  researchBrief: researchBriefSchema,
  transportEndpoints: transportEndpointsSchema,
  planDocumentModel: planDocumentModelSchema,
  planSkeleton: planSkeletonSchema,
  planChunk: planChunkSchema,
  packingProposalModel: packingProposalModelSchema,
  packingPatchModel: packingPatchModelSchema,
  summary: z.object({ summary: z.string().min(1).max(10000) }),
};

for (const [name, schema] of Object.entries(schemas)) {
  Deno.test(`${name} converts to a strict structured-output schema`, () => {
    tool({ name: `probe_${name}`, description: name, parameters: schema as never, execute: async () => '' });
  });
}
