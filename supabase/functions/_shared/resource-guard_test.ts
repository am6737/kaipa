import { boundedJson, rate, ResourceError, rpc } from './resource-guard.ts';
Deno.test('chunked oversized requests are rejected even without Content-Length',async()=>{
  const stream=new ReadableStream({start(controller){controller.enqueue(new TextEncoder().encode('{"text":"'));controller.enqueue(new Uint8Array(100));controller.close();}});
  try {await boundedJson(new Request('http://test',{method:'POST',body:stream}),64);throw new Error('Oversize accepted');}
  catch(error){if(!(error instanceof ResourceError) || error.status!==413) throw error;}
});
Deno.test('rate limit commits response and exposes retry hint',async()=>{
  const db={rpc:async()=>({data:{allowed:false,retryAfterSeconds:7},error:null})} as never;
  try {await rate(db,'gear','user');throw new Error('Rate accepted');}
  catch(error){if(!(error instanceof ResourceError) || error.code!=='rate_limited' || error.retryAfter!==7) throw error;}
});
Deno.test('quota failures return a public code and database outage fails closed',async()=>{
  for(const [error,code] of [[{message:'quota_exceeded',code:'P0001'},'quota_exceeded'],[{message:'Private DB detail',code:'XX000'},'service_unavailable']] as const){
    const db={rpc:async()=>({error,data:null})} as never;
    try{await rpc(db,'test');throw new Error('RPC failure accepted');}catch(cause){if(!(cause instanceof ResourceError) || cause.code!==code || cause.message.includes('Private')) throw cause;}
  }
});
