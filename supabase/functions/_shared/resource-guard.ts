import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2.108.1';

export const resourceCors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-guest-session',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
export class ResourceError extends Error {
  constructor(public code: string, public status = 429, public retryAfter = 60) { super(code); }
}
export function resourceFailure(error: unknown): Response {
  const e = error instanceof ResourceError ? error : new ResourceError('service_unavailable', 503);
  const messages: Record<string, string> = {
    unauthorized: '请先登录', rate_limited: '操作较频繁，请稍后再试', quota_exceeded: '当前用量已达到上限，请清理后再试',
    service_budget_exceeded: '服务今日用量已达到安全上限，请稍后再试', file_too_large: '文件过大，请压缩后再上传',
    concurrency_exceeded: '正在处理的任务较多，请等待完成后再试', payload_too_large: '提交内容过大',
    purchase_disabled: '目前免费开放，暂未开启购买', invalid_request: '请求无效', forbidden: '无权执行此操作',
  };
  return new Response(JSON.stringify({ error: { code: e.code, message: messages[e.code] || '服务暂时不可用，请稍后重试' } }), {
    status: e.status, headers: { ...resourceCors, 'Content-Type': 'application/json', 'Retry-After': String(e.retryAfter) },
  });
}
export function serviceClient() {
  return createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false, autoRefreshToken: false } });
}
export async function rpc<T = any>(db: SupabaseClient, name: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await db.rpc(name, args);
  if (error) {
    const code = ['quota_exceeded','service_budget_exceeded','concurrency_exceeded','file_too_large','gear_photo_limit','payload_too_large'].find(c => error.message.includes(c));
    if (code) throw new ResourceError(code, code === 'file_too_large' || code === 'payload_too_large' ? 413 : 429);
    if (error.code === '42501') throw new ResourceError('forbidden', 403);
    if (['22023','22P02','P0002','23502','23514','23503','23505'].includes(error.code)) throw new ResourceError('invalid_request', 400);
    throw new ResourceError('service_unavailable', 503);
  }
  return data as T;
}
export async function rate(db: SupabaseClient, scope: string, subject: string) {
  const result = await rpc(db, 'consume_resource_rate', { p_scope: scope, p_subject: subject });
  if (!result?.allowed) throw new ResourceError('rate_limited', 429, result?.retryAfterSeconds || 60);
}
export async function authenticate(req: Request, db = serviceClient()) {
  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') || '';
  if (!token) throw new ResourceError('unauthorized', 401);
  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user) throw new ResourceError('unauthorized', 401);
  return { db, user: data.user, token };
}
// Read incrementally: Content-Length is optional and untrusted.
export async function boundedJson(req: Request, limit = 512 * 1024): Promise<any> {
  if (Number(req.headers.get('content-length')) > limit) throw new ResourceError('payload_too_large', 413);
  const reader = req.body?.getReader();
  if (!reader) throw new ResourceError('invalid_request', 400);
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.length;
      if (size > limit) { await reader.cancel(); throw new ResourceError('payload_too_large', 413); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  try { return JSON.parse(new TextDecoder().decode(bytes)); } catch { throw new ResourceError('invalid_request', 400); }
}
export type ModelBudget = { reserve(units: number): Promise<string>; settle(id: string, units: number): Promise<void> };
export function modelBudget(db: SupabaseClient, run: string): ModelBudget {
  return {
    reserve: units => rpc(db, 'reserve_service_budget', { p_service: 'ai_tokens', p_run_key: run, p_units: units }),
    settle: (id, units) => rpc(db, 'settle_service_budget', { p_id: id, p_actual: units }),
  };
}
// Provider request budgets are charged even when the provider fails. User's
// monthly allowance is refunded on a failed result. An ambiguous termination
// conservatively retains reservations for maintenance/reconciliation.
export function protectEndpoint(scope: string, service?: string, resource?: string, maxBody = 512 * 1024) {
  return (handler: (req: Request) => Promise<Response>) => async (req: Request) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: resourceCors });
    if (req.method !== 'POST') return resourceFailure(new ResourceError('invalid_request', 405));
    let reservation: any; let db: SupabaseClient | undefined; let userId:string|undefined;
    try {
      const auth = await authenticate(req); db = auth.db; userId=auth.user.id;
      await rate(db, scope, auth.user.id);
      const body = await boundedJson(req, maxBody);
      if (service) await rpc(db, 'reserve_service_budget', { p_service: service, p_run_key: auth.user.id + ':' + new Date().toISOString().slice(0,10), p_units: 1 });
      if (resource) reservation = await rpc(db, 'reserve_resource', { p_user: auth.user.id, p_resource: resource, p_request_key: crypto.randomUUID(), p_amount: 1, p_ttl_seconds: 900 });
      const response = await handler(new Request(req.url, { method: 'POST', headers: req.headers, body: JSON.stringify(body), signal: req.signal }));
      if (reservation) await rpc(db, 'finish_resource_reservation', { p_id: reservation.id, p_actual: response.ok ? 1 : 0, p_release: !response.ok });
      try { await rpc(db,'record_resource_admission',{p_user:userId,p_scope:scope,p_result:response.ok?'accepted':'service_unavailable'}); } catch { /* telemetry must not manufacture provider retries */ }
      return response;
    } catch (error) {
      if (reservation && db) { try { await rpc(db,'finish_resource_reservation',{p_id:reservation.id,p_actual:0,p_release:true}); } catch { /* retained for reconciliation */ } }
      if (db && userId) {try {await rpc(db,'record_resource_admission',{p_user:userId,p_scope:scope,p_result:error instanceof ResourceError?error.code:'service_unavailable'});} catch { /* admission remains denied */ }}
      return resourceFailure(error);
    }
  };
}
