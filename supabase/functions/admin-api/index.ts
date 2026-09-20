declare const Deno: { env: { get(name: string): string | undefined }; serve(handler: (req: Request) => Response | Promise<Response>): void };
// @ts-ignore Deno npm specifier
import { createClient } from 'npm:@supabase/supabase-js@2.108.1';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS' };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const env = (name: string) => { const value = Deno.env.get(name)?.trim(); if (!value) throw new Error(`Missing ${name}`); return value; };

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const service = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false, autoRefreshToken: false } });
    const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
    if (!token) return json({ error: 'unauthorized' }, 401);
    const { data: auth, error: authError } = await service.auth.getUser(token);
    if (authError || !auth.user) return json({ error: 'unauthorized' }, 401);
    const role = String(auth.user.app_metadata?.role || '');
    if (!['owner', 'admin', 'editor', 'viewer'].includes(role)) return json({ error: 'forbidden' }, 403);
    const url = new URL(req.url);
    const resource = url.searchParams.get('resource') || 'overview';
    if (req.method === 'POST') {
      const body = await req.json().catch(() => ({})) as { action?: string; id?: string; role?: string; status?: string; title?: string; message?: string; caption?: string; name?: string; region?: string; dist?: string; asc_?: string; diff?: string; lng?: string; lat?: string; tone?: string; file_name?: string; file_format?: string; file_url?: string; dist_m?: string; asc_m?: string; point_count?: string; email?: string; password?: string; display_name?: string; username?: string; bio?: string; ban_duration?: string };
      if (!body.action || (body.action !== 'broadcast-notification' && !body.id)) return json({ error: 'invalid_request' }, 400);
      const editors = ['owner', 'admin', 'editor'];
      if (!editors.includes(role)) return json({ error: 'write_forbidden' }, 403);
      if (body.action === 'set-user-role') {
        if (role !== 'owner') return json({ error: 'owner_required' }, 403);
        if (!['owner', 'admin', 'editor', 'viewer', 'none'].includes(body.role || '')) return json({ error: 'invalid_role' }, 400);
        const { data: target, error: getError } = await service.auth.admin.getUserById(body.id);
        if (getError || !target.user) return json({ error: 'user_not_found' }, 404);
        const nextMetadata = { ...target.user.app_metadata };
        if (body.role === 'none') delete nextMetadata.role;
        else nextMetadata.role = body.role;
        const updated = await service.auth.admin.updateUserById(body.id, { app_metadata: nextMetadata });
        if (updated.error) throw updated.error;
      } else if (body.action === 'create-user') {
        if (role !== 'owner' && role !== 'admin') return json({ error: 'admin_required' }, 403);
        if (!body.email || !body.password || body.password.length < 8) return json({ error: 'email_and_8_char_password_required' }, 400);
        const created = await service.auth.admin.createUser({ email: body.email, password: body.password, email_confirm: true, app_metadata: { role: body.role && ['admin', 'editor', 'viewer'].includes(body.role) ? body.role : 'viewer' }, user_metadata: { display_name: body.display_name || body.email.split('@')[0] } });
        if (created.error || !created.data.user) throw created.error || new Error('user_create_failed');
        if (body.display_name || body.username || body.bio) {
          const profile = await service.from('profiles').update({ display_name: body.display_name || body.email.split('@')[0], username: body.username || '', bio: body.bio || '' }).eq('id', created.data.user.id);
          if (profile.error) throw profile.error;
        }
        body.id = created.data.user.id;
      } else if (body.action === 'update-user') {
        if (!body.id || !body.email) return json({ error: 'user_id_and_email_required' }, 400);
        if (body.role && !['owner', 'admin', 'editor', 'viewer', 'none'].includes(body.role)) return json({ error: 'invalid_role' }, 400);
        if (body.role && role !== 'owner') return json({ error: 'owner_required_for_role_change' }, 403);
        const target = await service.auth.admin.getUserById(body.id);
        if (target.error || !target.data.user) throw target.error || new Error('user_not_found');
        const appMetadata = { ...target.data.user.app_metadata };
        if (body.role === 'none') delete appMetadata.role;
        else if (body.role) appMetadata.role = body.role;
        const updated = await service.auth.admin.updateUserById(body.id, { email: body.email, ...(body.password ? { password: body.password } : {}), app_metadata: appMetadata, user_metadata: { display_name: body.display_name || '', username: body.username || '' } });
        if (updated.error) throw updated.error;
        const profile = await service.from('profiles').update({ display_name: body.display_name || '', username: body.username || '', bio: body.bio || '' }).eq('id', body.id);
        if (profile.error) throw profile.error;
      } else if (body.action === 'ban-user' || body.action === 'unban-user') {
        if (body.action === 'ban-user' && role !== 'owner' && role !== 'admin') return json({ error: 'admin_required' }, 403);
        const updated = await service.auth.admin.updateUserById(body.id, { ban_duration: body.action === 'ban-user' ? (body.ban_duration || '876000h') : 'none' });
        if (updated.error) throw updated.error;
      } else if (body.action === 'delete-user') {
        if (role !== 'owner') return json({ error: 'owner_required' }, 403);
        if (body.id === auth.user.id) return json({ error: 'cannot_delete_self' }, 400);
        const deleted = await service.auth.admin.deleteUser(body.id);
        if (deleted.error) throw deleted.error;
      } else if (body.action === 'delete-journey' || body.action === 'restore-journey') {
        const deleted_at = body.action === 'delete-journey' ? new Date().toISOString() : null;
        const updated = await service.from('journeys').update({ deleted_at }).eq('id', body.id).select('id').maybeSingle();
        if (updated.error) throw updated.error;
        if (!updated.data) return json({ error: 'journey_not_found' }, 404);
      } else if (body.action === 'moderate-content') {
        if (!['approved', 'rejected', 'pending'].includes(body.status || '')) return json({ error: 'invalid_moderation_status' }, 400);
        const updated = await service.from('inspo_media').update({ moderation_status: body.status, reviewed_by: auth.user.id, reviewed_at: new Date().toISOString() }).eq('id', body.id).select('id').maybeSingle();
        if (updated.error) throw updated.error;
        if (!updated.data) return json({ error: 'content_not_found' }, 404);
      } else if (body.action === 'update-content') {
        if (typeof body.caption !== 'string') return json({ error: 'caption_required' }, 400);
        const updated = await service.from('inspo_media').update({ caption: body.caption }).eq('id', body.id).select('id').maybeSingle();
        if (updated.error) throw updated.error;
        if (!updated.data) return json({ error: 'content_not_found' }, 404);
      } else if (body.action === 'delete-content') {
        const deleted = await service.from('inspo_media').delete().eq('id', body.id).select('id').maybeSingle();
        if (deleted.error) throw deleted.error;
        if (!deleted.data) return json({ error: 'content_not_found' }, 404);
      } else if (body.action === 'broadcast-notification') {
        if (role === 'viewer' || role === 'editor') return json({ error: 'admin_required' }, 403);
        if (!body.title || !body.message) return json({ error: 'title_and_message_required' }, 400);
        const { data: recipients, error: recipientError } = await service.from('profiles').select('id');
        if (recipientError) throw recipientError;
        const rows = (recipients || []).map((recipient) => ({ user_id: recipient.id, kind: 'system', cat: 'admin', bucket: 'system', time: new Date().toISOString(), who: 'Kaipa', verb: body.title, target: body.message, action: 'open', read: false }));
        if (rows.length) {
          const inserted = await service.from('notifications').insert(rows);
          if (inserted.error) throw inserted.error;
        }
      } else if (body.action === 'delete-notification') {
        const deleted = await service.from('notifications').delete().eq('id', body.id).select('id').maybeSingle();
        if (deleted.error) throw deleted.error;
        if (!deleted.data) return json({ error: 'notification_not_found' }, 404);
      } else if (body.action === 'create-route' || body.action === 'update-route') {
        if (!body.name || !body.region) return json({ error: 'route_name_and_region_required' }, 400);
        const route = { name: body.name, region: body.region, dist: body.dist || null, asc_: body.asc_ || null, diff: body.diff || null, tone: body.tone || 'forest', lng: Number(body.lng || 0), lat: Number(body.lat || 0), created_by: auth.user.id };
        const result = body.action === 'create-route'
          ? await service.from('routes').insert({ ...route, id: `admin-${crypto.randomUUID()}` }).select('id').single()
          : await service.from('routes').update(route).eq('id', body.id).select('id').maybeSingle();
        if (result.error) throw result.error;
        if (!result.data) return json({ error: 'route_not_found' }, 404);
      } else if (body.action === 'delete-route') {
        const deleted = await service.from('routes').delete().eq('id', body.id).select('id').maybeSingle();
        if (deleted.error) throw deleted.error;
        if (!deleted.data) return json({ error: 'route_not_found' }, 404);
      } else if (body.action === 'create-track' || body.action === 'update-track') {
        if (!body.name) return json({ error: 'track_name_required' }, 400);
        const track = { name: body.name, file_name: body.file_name || null, file_format: body.file_format || null, file_url: body.file_url || null, dist_m: Number(body.dist_m || 0) || null, asc_m: Number(body.asc_m || 0) || null, point_count: Number(body.point_count || 0) || null, updated_at: new Date().toISOString() };
        const result = body.action === 'create-track'
          ? await service.from('tracks').insert({ ...track, user_id: auth.user.id }).select('id').single()
          : await service.from('tracks').update(track).eq('id', body.id).select('id').maybeSingle();
        if (result.error) throw result.error;
        if (!result.data) return json({ error: 'track_not_found' }, 404);
      } else if (body.action === 'delete-track') {
        const existing = await service.from('tracks').select('file_url').eq('id', body.id).maybeSingle();
        if (existing.error) throw existing.error;
        const deleted = await service.from('tracks').delete().eq('id', body.id).select('id').maybeSingle();
        if (deleted.error) throw deleted.error;
        if (!deleted.data) return json({ error: 'track_not_found' }, 404);
        const fileUrl = existing.data?.file_url;
        const marker = '/storage/v1/object/public/kaipa/';
        if (fileUrl?.includes(marker)) await service.storage.from('kaipa').remove([decodeURIComponent(fileUrl.split(marker)[1])]);
      } else {
        return json({ error: 'unknown_action' }, 400);
      }
      const audit = await service.from('admin_audit_logs').insert({ actor_id: auth.user.id, action: body.action, resource_type: resource, resource_id: body.id, metadata: { role: body.role || null } });
      if (audit.error) throw audit.error;
      return json({ ok: true });
    }
    if (resource === 'overview') {
      const [profiles, journeys, gearItems, recent] = await Promise.all([
        service.from('profiles').select('id', { count: 'exact', head: true }),
        service.from('journeys').select('id', { count: 'exact', head: true }).is('deleted_at', null),
        service.from('gear_items').select('id', { count: 'exact', head: true }),
        service.from('journeys').select('id,name,created_at,user_id').is('deleted_at', null).order('created_at', { ascending: false }).limit(5),
      ]);
      const error = profiles.error || journeys.error || gearItems.error || recent.error;
      if (error) throw error;
      return json({ users: profiles.count || 0, journeys: journeys.count || 0, gearItems: gearItems.count || 0, recentJourneys: recent.data || [] });
    }
    if (resource === 'users') {
      const [authUsers, profiles] = await Promise.all([
        service.auth.admin.listUsers({ page: 1, perPage: 500 }),
        service.from('profiles').select('id,display_name,nick,username,avatar_url,created_at,onboarded_at'),
      ]);
      if (authUsers.error || profiles.error) throw authUsers.error || profiles.error;
      const byId = new Map((profiles.data || []).map((profile) => [profile.id, profile]));
      return json({ data: authUsers.data.users.map((user) => ({ ...byId.get(user.id), id: user.id, email: user.email, role: user.app_metadata?.role || '', last_sign_in_at: user.last_sign_in_at, created_at: user.created_at })) });
    }
    const tables: Record<string, { table: string; select: string; order: string }> = {
      journeys: { table: 'journeys', select: 'id,name,region,created_at,planned_date,total_days,user_id,deleted_at', order: 'created_at' },
      gear: { table: 'gear_items', select: 'id,name,brand,weight,price,user_id,created_at', order: 'created_at' },
      routes: { table: 'routes', select: 'id,name,region,dist,asc_,diff,created_by,created_at', order: 'created_at' },
      tracks: { table: 'tracks', select: 'id,name,file_name,file_format,file_size,dist_m,asc_m,point_count,user_id,created_at', order: 'created_at' },
      notifications: { table: 'notifications', select: 'id,user_id,kind,cat,verb,target,read,created_at', order: 'created_at' },
      content: { table: 'inspo_media', select: 'id,journey_id,user_id,uri,thumbnail,kind,caption,moderation_status,moderation_reason,reviewed_at,created_at', order: 'created_at' },
      agentRuns: { table: 'agent_runs', select: 'id,user_id,status,error,agent_version,created_at,updated_at', order: 'created_at' },
      audit: { table: 'admin_audit_logs', select: 'id,actor_id,action,resource_type,resource_id,metadata,created_at', order: 'created_at' },
    };
    const config = tables[resource];
    if (!config) return json({ error: 'unknown_resource' }, 400);
    let query = service.from(config.table).select(config.select).order(config.order, { ascending: false }).limit(500);
    const result = await query;
    if (result.error) throw result.error;
    await service.from('admin_audit_logs').insert({ actor_id: auth.user.id, action: 'read', resource_type: resource, metadata: { count: result.data?.length || 0 } });
    return json({ data: result.data || [] });
  } catch (error) {
    console.error('[admin-api]', error);
    return json({ error: error instanceof Error ? error.message : 'internal_error' }, 500);
  }
});
