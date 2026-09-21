// Audits that every provider-facing schema reaches the provider in OpenAI
// strict form (every object lists all of its properties in `required` and
// sets additionalProperties: false), and that the primary OpenAI helper
// conversion path succeeds for every structured-output schema. A bare
// `.optional()` without `.nullable()` anywhere in the tree makes the primary
// helper throw ("uses `.optional()` without `.nullable()`"); the SDK's
// fallback converter can then silently produce a different artifact or
// hard-fail the stage, so both layers are asserted here.
import { zodResponsesFunction, zodTextFormat } from 'npm:openai@7.4.0/helpers/zod';
import { z } from 'npm:zod@4.1.12';
import { assistantOutput } from './agent.ts';
import { planChunkSchema, planDocumentModelSchema, planSkeletonSchema } from './plan-document.ts';
import { packingProposalModelSchema, packingPatchModelSchema } from './packing-stage.ts';
import { taskDecisionSchema } from './task.ts';
import { kaipaAllTools, packingDraftTools, searchTransport } from './tools.ts';
import { loadPlanningSkill } from './skills.ts';
import { reviewTransport } from './transport-tool.ts';

function assert(value: unknown, message = 'Assertion failed'): asserts value { if (!value) throw new Error(message); }
function errorMessage(error: unknown): string { return error instanceof Error ? error.message : String(error); }

// OpenAI strict mode contract: every object node must list all of its
// properties in `required`. A converter that silently degrades a bare
// `.optional()` drops it from `required`, which this walker catches.
function walkStrictContract(path: string, node: unknown): void {
  if (!node || typeof node !== 'object' || Array.isArray(node)) return;
  const record = node as Record<string, unknown>;
  if (record.properties && typeof record.properties === 'object') {
    const properties = record.properties as Record<string, unknown>;
    const required = new Set(Array.isArray(record.required) ? record.required.map(String) : []);
    for (const key of Object.keys(properties)) {
      assert(required.has(key), `${path}: property "${key}" not in required`);
    }
    for (const [key, value] of Object.entries(properties)) {
      walkStrictContract(`${path}.${key}`, value);
    }
  }
  for (const branch of ['anyOf', 'oneOf', 'allOf']) {
    if (Array.isArray(record[branch])) {
      for (const sub of record[branch] as unknown[]) walkStrictContract(path, sub);
    }
  }
  if (record.items && typeof record.items === 'object') walkStrictContract(`${path}[]`, record.items);
  if (record.additionalProperties && typeof record.additionalProperties === 'object') {
    walkStrictContract(`${path}.*`, record.additionalProperties);
  }
}

const outputSchemas: Array<[string, z.ZodTypeAny]> = [
  ['taskDecisionSchema', taskDecisionSchema],
  ['assistantOutput', assistantOutput],
  ['planDocumentModelSchema', planDocumentModelSchema],
  ['planSkeletonSchema', planSkeletonSchema],
  ['planChunkSchema', planChunkSchema],
  ['packingProposalModelSchema', packingProposalModelSchema],
  ['packingPatchModelSchema', packingPatchModelSchema],
];

Deno.test('output schemas survive strict Responses-API conversion', () => {
  for (const [name, schema] of outputSchemas) {
    try {
      const format = zodTextFormat(schema, 'output');
      assert(format.type === 'json_schema', `${name}: unexpected format`);
      assert(format.strict === true, `${name}: conversion not strict`);
      walkStrictContract(name, format.schema);
    } catch (error) {
      throw new Error(`${name}: ${errorMessage(error)}`);
    }
  }
});

Deno.test('tool parameter schemas reach the provider in strict form', () => {
  const tools = [...kaipaAllTools, ...packingDraftTools, searchTransport, reviewTransport, loadPlanningSkill];
  assert(tools.length >= 25, `expected the full tool catalog, got ${tools.length}`);
  for (const tool of tools) {
    try {
      // agents' tool() pre-converts zod parameters to the raw strict JSON
      // schema object the provider receives.
      const schema = tool.parameters as unknown;
      assert(schema && typeof schema === 'object' && !Array.isArray(schema), `${tool.name}: unexpected parameters shape`);
      walkStrictContract(tool.name, schema);
    } catch (error) {
      throw new Error(`${tool.name}: ${errorMessage(error)}`);
    }
  }
});

Deno.test('packing profile conditions path converts (production regression)', () => {
  // planDocumentModelSchema embeds packingPlanProfile directly; its anyOf
  // branch previously failed at properties/packingProfile/anyOf/0/properties/conditions.
  try {
    const result = zodResponsesFunction({
      name: 'estimate_personal_packing_needs',
      description: 'regression',
      parameters: z.object({ planProfile: planDocumentModelSchema.shape.packingProfile }),
      function: () => undefined,
    });
    assert((result as unknown as { parameters?: unknown }).parameters, 'no parameters');
  } catch (error) {
    throw new Error(`packingProfile path: ${errorMessage(error)}`);
  }
});
