declare const Deno: { env: { get(name: string): string | undefined }; serve(handler: (req: Request) => Response | Promise<Response>): void };

// @ts-ignore Deno npm specifier
import { createClient } from 'npm:@supabase/supabase-js@2.108.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

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
  return scheme.toLowerCase() === 'bearer' ? token : '';
}

function randomSecret(byteLength = 32) {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: { code: 'method_not_allowed', message: 'Method not allowed' } }, 405);

  const supabaseUrl = env('SUPABASE_URL');
  const serviceRoleKey = env('SUPABASE_SERVICE_ROLE_KEY');
  const anonKey = env('SUPABASE_ANON_KEY');
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const auth = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const token = bearerToken(req);
  if (!token) return json({ error: { code: 'unauthorized', message: '缺少游客认证信息' } }, 401);

  const { data: { user }, error: userError } = await admin.auth.getUser(token);
  if (userError || !user) return json({ error: { code: 'unauthorized', message: '游客认证信息无效' } }, 401);
  if (!user.is_anonymous) return json({ error: { code: 'not_anonymous', message: '当前账号不是待创建的游客账号' } }, 409);

  const metadata = user.user_metadata as { guest_email?: unknown; nickname?: unknown };
  const email = typeof metadata.guest_email === 'string' ? metadata.guest_email.trim().toLowerCase() : '';
  const nickname = typeof metadata.nickname === 'string' ? metadata.nickname.trim() : '';
  if (!/^[a-f0-9]{32}@guest\.kaipa\.app$/.test(email) || !nickname || nickname.length > 32) {
    await admin.auth.admin.deleteUser(user.id);
    return json({ error: { code: 'invalid_identity', message: '游客身份信息无效' } }, 400);
  }

  const password = randomSecret();
  try {
    const { error: updateError } = await admin.auth.admin.updateUserById(user.id, {
      email,
      password,
      email_confirm: true,
      user_metadata: {
        ...user.user_metadata,
        nickname,
        display_name: nickname,
        account_type: 'guest',
        generated_email: true,
      },
    });
    if (updateError) {
      console.error('[create-guest-account] upgrade failed', updateError.message);
      await admin.auth.admin.deleteUser(user.id);
      return json({ error: { code: 'create_failed', message: '游客账号创建失败' } }, 500);
    }

    const { error: profileError } = await admin
      .from('profiles')
      .update({ display_name: nickname, nick: nickname, avatar_ini: nickname.slice(0, 1) })
      .eq('id', user.id);
    if (profileError) {
      console.error('[create-guest-account] profile sync failed', profileError.message);
      await admin.auth.admin.deleteUser(user.id);
      return json({ error: { code: 'profile_failed', message: '游客资料初始化失败' } }, 500);
    }

    const { data: signedIn, error: signInError } = await auth.auth.signInWithPassword({ email, password });
    if (signInError || !signedIn.session) {
      console.error('[create-guest-account] sign-in failed', signInError?.message);
      await admin.auth.admin.deleteUser(user.id);
      return json({ error: { code: 'sign_in_failed', message: '游客账号登录失败' } }, 500);
    }

    return json({
      session: {
        access_token: signedIn.session.access_token,
        refresh_token: signedIn.session.refresh_token,
      },
      user: { id: user.id, email, nickname },
    });
  } catch (error) {
    console.error('[create-guest-account] unexpected failure', error);
    await admin.auth.admin.deleteUser(user.id);
    return json({ error: { code: 'request_failed', message: '游客登录失败，请稍后重试' } }, 500);
  }
});
