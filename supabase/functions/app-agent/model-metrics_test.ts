import { estimateModelUnits, measuredModel, type ModelMetric } from './model-metrics.ts';
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

Deno.test('budget rejection prevents provider execution and successful calls settle measured tokens',async()=>{
  let calls=0;let settled=0;let maxTokens=0;
  const provider={getModel:async()=>({getResponse:async(req:any)=>{calls++;maxTokens=req.modelSettings.maxTokens;return {output:[],usage:{inputTokens:2,outputTokens:3,totalTokens:5}}}})} as unknown as ModelProvider;
  let failed=false;
  try {await measuredModel(provider,'test','execution',undefined,{reserve:()=>Promise.reject(new Error('service_budget_exceeded')),settle:async()=>{}}).getResponse({} as never);} catch {failed=true;}
  if(!failed || calls!==0) throw new Error('Provider ran before budget admission');
  await measuredModel(provider,'test','execution',undefined,{reserve:async()=> 'ticket',settle:async(id,n)=>{if(id!=='ticket') throw new Error('Wrong ticket');settled=n;}}).getResponse({} as never);
  if(Number(calls)!==1 || settled!==5 || maxTokens!==8192) throw new Error('Budget settlement/output bound missing');
});
Deno.test('unknown provider failure retains cost reservation',async()=>{
  let reserved=0;let settled=false;
  const provider={getModel:async()=>({getResponse:async()=>{throw new Error('Network disconnected');}})} as unknown as ModelProvider;
  try {await measuredModel(provider,'test','execution',undefined,{reserve:async n=>{reserved=n;return 'ticket';},settle:async()=>{settled=true;}}).getResponse({} as never);} catch {/* expected */}
  if(reserved<=8192 || settled) throw new Error('Unknown provider cost refunded');
});

Deno.test('display sized images are budgeted by pixels instead of base64 text',()=>{
  const units=estimateModelUnits({input:[{type:'input_image',image:'data:image/jpeg;base64,'+'A'.repeat(800000)}]});
  if(units<65536 || units>100000) throw new Error('Image incorrectly tokenized as text');
});
