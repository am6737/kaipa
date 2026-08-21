declare const Deno: { env: { get(name: string): string | undefined }; serve(handler: (req: Request) => Response | Promise<Response>): void };

// @ts-ignore Deno npm specifier
import { createClient } from 'npm:@supabase/supabase-js@2.108.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const BUCKET = 'kaipa';

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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: { code: 'method_not_allowed' } }, 405);

  try {
    const token = bearerToken(req);
    if (!token) return json({ error: { code: 'unauthorized' } }, 401);

    const admin = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: { user }, error: userError } = await admin.auth.getUser(token);
    if (userError || !user) return json({ error: { code: 'unauthorized' } }, 401);

    const { data: objects, error: objectError } = await admin
      .rpc('account_storage_paths', { account_id: user.id });
    if (objectError) throw objectError;

    const allPaths = (objects || []).map((object: { path: string }) => object.path);
    for (let index = 0; index < allPaths.length; index += 100) {
      const { error } = await admin.storage.from(BUCKET).remove(allPaths.slice(index, index + 100));
      if (error) throw error;
    }

    const { error: deleteError } = await admin.auth.admin.deleteUser(user.id);
    if (deleteError) throw deleteError;

    return json({ deleted: true });
  } catch (error) {
    console.error('[delete-account]', error);
    return json({ error: { code: 'delete_failed' } }, 500);
  }
});
