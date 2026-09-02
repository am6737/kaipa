declare const Deno: { env: { get(name: string): string | undefined }; serve(handler: (req: Request) => Response | Promise<Response>): void };

// @ts-ignore Deno npm specifier
import { createClient } from 'npm:@supabase/supabase-js@2.108.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const REQUEST_TTL_MS = 5 * 60 * 1000;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function env(name: string) {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

function bearerToken(req: Request) {
  const header = req.headers.get('authorization') || '';
  const [scheme, token] = header.split(' ');
  return scheme?.toLowerCase() === 'bearer' ? token : '';
}

function randomSecret(byteLength = 32) {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: { code: 'method_not_allowed', message: 'Method not allowed' } }, 405);

  try {
    const supabaseUrl = env('SUPABASE_URL');
    const serviceRoleKey = env('SUPABASE_SERVICE_ROLE_KEY');
    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const body = await req.json().catch(() => ({})) as { action?: string; id?: string; secret?: string };

    if (body.action === 'create') {
      const secret = randomSecret();
      const expiresAt = new Date(Date.now() + REQUEST_TTL_MS).toISOString();
      const { data, error } = await admin
        .from('qr_login_requests')
        .insert({ secret_hash: await sha256(secret), expires_at: expiresAt })
        .select('id')
        .single();
      if (error || !data) throw error || new Error('Unable to create QR login request');
      return json({ id: data.id, secret, expires_at: expiresAt });
    }

    if (!body.id || !body.secret) return json({ error: { code: 'invalid_request', message: '扫码登录请求无效' } }, 400);
    const secretHash = await sha256(body.secret);
    const { data: request, error: requestError } = await admin
      .from('qr_login_requests')
      .select('id, secret_hash, status, user_id, expires_at, token_hash, verification_type')
      .eq('id', body.id)
      .maybeSingle();
    if (requestError) throw requestError;
    if (!request || request.secret_hash !== secretHash) return json({ error: { code: 'not_found', message: '扫码登录请求无效' } }, 404);
    if (new Date(request.expires_at).getTime() <= Date.now()) return json({ status: 'expired' }, 410);

    if (body.action === 'status') return json({ status: request.status });

    if (body.action === 'scan') {
      if (request.status !== 'pending') return json({ status: request.status });
      const token = bearerToken(req);
      if (!token) return json({ error: { code: 'unauthorized', message: '请先登录后再扫描' } }, 401);
      const { data: { user }, error: userError } = await admin.auth.getUser(token);
      if (userError || !user) return json({ error: { code: 'unauthorized', message: '登录状态已失效' } }, 401);

      const { data: updated, error: updateError } = await admin
        .from('qr_login_requests')
        .update({ status: 'scanned', user_id: user.id, scanned_at: new Date().toISOString() })
        .eq('id', body.id)
        .eq('status', 'pending')
        .select('status')
        .maybeSingle();
      if (updateError) throw updateError;
      return json({ status: updated?.status || 'scanned' });
    }

    if (body.action === 'approve') {
      if (request.status !== 'pending' && request.status !== 'scanned') return json({ status: request.status });
      const token = bearerToken(req);
      if (!token) return json({ error: { code: 'unauthorized', message: '请先登录后再确认' } }, 401);
      const { data: { user }, error: userError } = await admin.auth.getUser(token);
      if (userError || !user) return json({ error: { code: 'unauthorized', message: '登录状态已失效' } }, 401);
      if (request.status === 'scanned' && request.user_id && request.user_id !== user.id) {
        return json({ error: { code: 'user_mismatch', message: '请使用刚才扫码的账号确认登录' } }, 403);
      }
      if (!user.email) return json({ error: { code: 'email_required', message: '当前账号暂不支持扫码登录' } }, 409);

      const { data: link, error: linkError } = await admin.auth.admin.generateLink({
        type: 'magiclink',
        email: user.email,
      });
      if (linkError || !link.properties?.hashed_token) throw linkError || new Error('Unable to create login token');

      const { data: updated, error: updateError } = await admin
        .from('qr_login_requests')
        .update({
          status: 'approved',
          user_id: user.id,
          token_hash: link.properties.hashed_token,
          verification_type: link.properties.verification_type,
          approved_at: new Date().toISOString(),
        })
        .eq('id', body.id)
        .in('status', ['pending', 'scanned'])
        .select('status')
        .maybeSingle();
      if (updateError) throw updateError;
      return json({ status: updated?.status || 'approved' });
    }

    if (body.action === 'consume') {
      if (request.status === 'pending' || request.status === 'scanned') return json({ status: request.status });
      if (request.status !== 'approved' || !request.token_hash) return json({ status: request.status }, 409);
      const { data: consumed, error: consumeError } = await admin
        .from('qr_login_requests')
        .update({ status: 'consumed', consumed_at: new Date().toISOString() })
        .eq('id', body.id)
        .eq('status', 'approved')
        .select('id')
        .maybeSingle();
      if (consumeError) throw consumeError;
      if (!consumed) return json({ status: 'consumed' }, 409);
      return json({ status: 'approved', token_hash: request.token_hash, type: request.verification_type || 'magiclink' });
    }

    return json({ error: { code: 'invalid_action', message: 'Unknown action' } }, 400);
  } catch (error) {
    console.error('[qr-login]', error);
    return json({ error: { code: 'server_error', message: '扫码登录服务暂时不可用' } }, 500);
  }
});
