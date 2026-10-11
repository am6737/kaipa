import { sendWithFailover, type SmsMessage, type SmsProvider } from '../_shared/sms-router.ts';
import { sendTencentSms } from '../_shared/tencent-sms.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.108.1';

function authorized(req: Request) {
  const expected = Deno.env.get('SMS_GATEWAY_SECRET');
  if (!expected) return false;
  const value = req.headers.get('authorization') || '';
  return value === `Bearer ${expected}` || req.headers.get('x-sms-hook-secret') === expected;
}

function messageFromBody(body: Record<string, unknown>): SmsMessage {
  const sms = (body.sms && typeof body.sms === 'object' ? body.sms : body) as Record<string, unknown>;
  const phone = String(sms.phone || sms.phone_number || '');
  const code = String(sms.code || sms.otp || '');
  const requestId = String(body.request_id || body.requestId || crypto.randomUUID());
  if (!/^\+[1-9]\d{7,14}$/.test(phone) || !/^\d{4,10}$/.test(code)) throw new Error('invalid SMS payload');
  return { requestId, phone, code, template: typeof sms.template === 'string' ? sms.template : undefined };
}

async function hashSecret(value: string) {
  const secret = Deno.env.get('SMS_HASH_SECRET');
  if (!secret) throw new Error('SMS_HASH_SECRET is not configured');
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const bytes = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value));
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function reserveSend(req: Request, message: SmsMessage, body: Record<string, unknown>) {
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  const forwarded = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '';
  const device = typeof body.device_id === 'string' ? body.device_id : '';
  const { data, error } = await db.rpc('consume_sms_send', {
    p_request_id: message.requestId,
    p_phone_hash: await hashSecret(message.phone),
    p_ip_hash: forwarded ? await hashSecret(forwarded) : '',
    p_device_hash: device ? await hashSecret(device) : '',
    p_phone_per_minute: Number(Deno.env.get('SMS_PHONE_PER_MINUTE') || 1),
    p_phone_per_hour: Number(Deno.env.get('SMS_PHONE_PER_HOUR') || 5),
    p_phone_per_day: Number(Deno.env.get('SMS_PHONE_PER_DAY') || 10),
    p_ip_per_hour: Number(Deno.env.get('SMS_IP_PER_HOUR') || 30),
    p_device_per_hour: Number(Deno.env.get('SMS_DEVICE_PER_HOUR') || 20),
    p_global_per_day: Number(Deno.env.get('SMS_GLOBAL_PER_DAY') || 10000),
  });
  if (error) throw new Error('SMS rate limiter unavailable');
  const decision = Array.isArray(data) ? data[0] : data;
  if (!decision?.allowed) throw new Error(`SMS rate limited: ${decision?.reason || 'limited'}`);
}

function providers(): SmsProvider[] {
  const all: Record<string, SmsProvider> = {
    tencent: { name: 'tencent', send: (message) => sendTencentSms(message) },
  };
  // Other vendors remain behind an internal gateway while their signing SDKs
  // are selected. This keeps failover available without exposing credentials.
  for (const name of ['volcano', 'aliyun', 'huawei']) {
    const endpoint = Deno.env.get(`SMS_${name.toUpperCase()}_ENDPOINT`);
    const secret = Deno.env.get(`SMS_${name.toUpperCase()}_SECRET`);
    if (!endpoint || !secret) continue;
    all[name] = {
      name,
      async send(message) {
        const response = await fetch(endpoint, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${secret}` }, body: JSON.stringify(message) });
        if (!response.ok) throw new Error(`${name} rejected SMS (${response.status})`);
      },
    };
  }
  const order = (Deno.env.get('SMS_PROVIDER_ORDER') || 'tencent,volcano,aliyun,huawei').split(',').map((name) => name.trim().toLowerCase());
  return order.map((name) => all[name]).filter(Boolean);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok');
  if (req.method !== 'POST' || !authorized(req)) return new Response('unauthorized', { status: 401 });
  try {
    const body = await req.json() as Record<string, unknown>;
    const message = messageFromBody(body);
    await reserveSend(req, message, body);
    const result = await sendWithFailover(message, providers());
    return Response.json({ ok: true, provider: result.provider });
  } catch (error) {
    console.error(JSON.stringify({ event: 'sms_failed', message: error instanceof Error ? error.message : 'unknown' }));
    return Response.json({ ok: false }, { status: 502 });
  }
});
