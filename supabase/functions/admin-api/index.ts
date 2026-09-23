declare const Deno: { env: { get(name: string): string | undefined }; serve(handler: (req: Request) => Response | Promise<Response>): void };
// @ts-ignore Deno npm specifier
import { createClient } from 'npm:@supabase/supabase-js@2.108.1';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS' };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const env = (name: string) => { const value = Deno.env.get(name)?.trim(); if (!value) throw new Error(`Missing ${name}`); return value; };

type RouteFactField = { key?: unknown; type?: unknown; required?: unknown; options?: unknown };

// The revision RPCs guard their own preconditions and their messages are the
// only error surface they expose, so they are mapped onto status codes here
// rather than re-derived from the row state.
function routeFactRevisionError(message: string): { error: string; status: number } {
  const fieldToken = message.match(/route_fact_field_\w+:[^,\s]*/);
  if (fieldToken) return { error: fieldToken[0], status: 400 };
  if (message.includes('is not a revision')) return { error: 'route_fact_revision_not_a_revision', status: 409 };
  if (message.includes('not a pending suggestion')) return { error: 'route_fact_revision_not_pending', status: 409 };
  if (message.includes('unknown target entry') || message.includes('target entry is archived')) return { error: 'route_fact_revision_target_unavailable', status: 409 };
  if (message.includes('unknown suggestion')) return { error: 'route_fact_not_found', status: 404 };
  return { error: 'route_fact_revision_failed', status: 500 };
}

function validateRouteFactFields(schema: unknown, fields: Record<string, unknown>): string | null {
  if (!Array.isArray(schema)) return 'route_fact_category_schema_invalid';
  for (const candidate of schema as RouteFactField[]) {
    if (typeof candidate.key !== 'string' || !candidate.key) continue;
    const value = fields[candidate.key];
    const empty = value == null || (typeof value === 'string' && !value.trim());
    if (candidate.required === true && empty) return `route_fact_field_required:${candidate.key}`;
    if (empty) continue;
    if (candidate.type === 'number' && (typeof value !== 'number' || !Number.isFinite(value))) return `route_fact_field_number:${candidate.key}`;
    if (candidate.type === 'select' && Array.isArray(candidate.options) && !candidate.options.includes(value)) return `route_fact_field_option:${candidate.key}`;
  }
  return null;
}

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
      const body = await req.json().catch(() => ({})) as { action?: string; id?: string; role?: string; status?: string; title?: string; message?: string; caption?: string; name?: string; region?: string; dist?: string; asc_?: string; diff?: string; lng?: string; lat?: string; tone?: string; coord?: string; track_coords?: string; track_elevation?: string; track_duration_ms?: string; track_waypoints?: string; track_file_url?: string; track_file_name?: string; file_name?: string; file_format?: string; file_url?: string; dist_m?: string; asc_m?: string; point_count?: string; email?: string; password?: string; display_name?: string; username?: string; bio?: string; ban_duration?: string; user_id?: string; weight?: string; price?: string; qty?: string; route_id?: string; category_slug?: string; fields?: string; source_url?: string; review_due_at?: string; accepted_fields?: string; note?: string };
      const createsWithoutId = body.action === 'broadcast-notification' || body.action === 'create-route' || body.action === 'create-track' || body.action === 'create-gear' || body.action === 'create-user' || body.action === 'save-route-fact';
      if (!body.action || (!createsWithoutId && !body.id)) return json({ error: 'invalid_request' }, 400);
      const editors = ['owner', 'admin', 'editor'];
      if (!editors.includes(role)) return json({ error: 'write_forbidden' }, 403);
      // Applying or rejecting a revision returns the resulting entry so the
      // console can refresh without re-reading, and the audit insert below
      // still runs for every write.
      let revisionResult: unknown = null;
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
      } else if (body.action === 'create-gear' || body.action === 'update-gear') {
        if (!body.name?.trim() || !body.user_id || body.weight == null || body.price == null) return json({ error: 'gear_name_user_weight_price_required' }, 400);
        const gear = { name: body.name.trim(), user_id: body.user_id, weight: Number(body.weight), price: Number(body.price), qty: Math.max(1, Number(body.qty || 1)) };
        if (!Number.isFinite(gear.weight) || !Number.isFinite(gear.price)) return json({ error: 'gear_weight_and_price_must_be_numbers' }, 400);
        const result = body.action === 'create-gear'
          ? await service.from('gear_items').insert(gear).select('id').single()
          : await service.from('gear_items').update(gear).eq('id', body.id).select('id').maybeSingle();
        if (result.error) throw result.error;
        if (!result.data) return json({ error: 'gear_not_found' }, 404);
      } else if (body.action === 'delete-gear') {
        const deleted = await service.from('gear_items').delete().eq('id', body.id).select('id').maybeSingle();
        if (deleted.error) throw deleted.error;
        if (!deleted.data) return json({ error: 'gear_not_found' }, 404);
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
        if (!body.name) return json({ error: 'route_name_required' }, 400);
        const jsonValue = (value?: string) => {
          if (!value) return null;
          try { return JSON.parse(value); } catch { return null; }
        };
        const route = { name: body.name, region: body.region || '未分类', coord: body.coord || null, dist: body.dist || null, asc_: body.asc_ || null, diff: body.diff || null, tone: body.tone || 'forest', lng: Number(body.lng || 0), lat: Number(body.lat || 0), track_coords: jsonValue(body.track_coords), track_elevation: jsonValue(body.track_elevation), track_duration_ms: Number(body.track_duration_ms || 0) || null, track_waypoints: jsonValue(body.track_waypoints), track_file_url: body.track_file_url || null, track_file_name: body.track_file_name || null, created_by: auth.user.id };
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
      } else if (body.action === 'save-route-fact' || body.action === 'confirm-route-fact' || body.action === 'archive-route-fact'
        || body.action === 'review-route-fact' || body.action === 'apply-route-fact-revision' || body.action === 'reject-route-fact-revision') {
        if (body.action === 'save-route-fact') {
          let fields: unknown = null;
          try { fields = JSON.parse(body.fields || 'null'); } catch { fields = null; }
          if (!body.route_id || !body.category_slug || !body.title?.trim() || !fields || typeof fields !== 'object' || Array.isArray(fields)) return json({ error: 'route_fact_route_category_title_fields_required' }, 400);
          const category = await service.from('route_fact_categories').select('field_schema').eq('slug', body.category_slug).maybeSingle();
          if (category.error) throw category.error;
          if (!category.data) return json({ error: 'route_fact_category_not_found' }, 404);
          const fieldError = validateRouteFactFields(category.data.field_schema, fields as Record<string, unknown>);
          if (fieldError) return json({ error: fieldError }, 400);
          const values = { route_id: body.route_id, category_slug: body.category_slug, title: body.title.trim(), fields, source_url: body.source_url || null, status: ['confirmed', 'suggested', 'archived'].includes(body.status || '') ? body.status : 'confirmed', review_due_at: body.review_due_at ? new Date(body.review_due_at).toISOString() : null };
          const result = body.id
            ? await service.from('route_fact_entries').update({ ...values, updated_by: auth.user.id }).eq('id', body.id).select('id').maybeSingle()
            : await service.from('route_fact_entries').insert({ ...values, created_by: auth.user.id }).select('id').single();
          if (result.error) throw result.error;
          if (body.id && !result.data) return json({ error: 'route_fact_not_found' }, 404);
          body.id = result.data?.id || body.id;
        } else if (body.action === 'confirm-route-fact') {
          const current = await service.from('route_fact_entries').select('target_entry_id').eq('id', body.id).maybeSingle();
          if (current.error) throw current.error;
          if (!current.data) return json({ error: 'route_fact_not_found' }, 404);
          // A revision proposal is not a new fact. Confirming one as if it were
          // would create the second, contradicting row that this flow exists to
          // prevent; it has to go through the review dialog.
          if (current.data.target_entry_id) return json({ error: 'route_fact_revision_requires_review' }, 409);
          const updated = await service.from('route_fact_entries')
            .update({ status: 'confirmed', confirmed_at: new Date().toISOString(), review_due_at: null, updated_by: auth.user.id })
            .eq('id', body.id).select('id').maybeSingle();
          if (updated.error) throw updated.error;
          if (!updated.data) return json({ error: 'route_fact_not_found' }, 404);
        } else if (body.action === 'review-route-fact') {
          // "I checked, it is still correct": moves the review clock without
          // touching the fact. Confirmed rows only, because reviewing a draft
          // would otherwise confirm it through a side door. A blank due date is
          // handed to the trigger, which derives the next one from reviewed_at.
          const current = await service.from('route_fact_entries').select('status').eq('id', body.id).maybeSingle();
          if (current.error) throw current.error;
          if (!current.data) return json({ error: 'route_fact_not_found' }, 404);
          if (current.data.status !== 'confirmed') return json({ error: 'route_fact_not_confirmed' }, 409);
          const updated = await service.from('route_fact_entries')
            .update({ reviewed_at: new Date().toISOString(), review_due_at: null, updated_by: auth.user.id })
            .eq('id', body.id).select('id').maybeSingle();
          if (updated.error) throw updated.error;
          if (!updated.data) return json({ error: 'route_fact_not_found' }, 404);
        } else if (body.action === 'apply-route-fact-revision' || body.action === 'reject-route-fact-revision') {
          // accepted_fields arrives JSON-encoded for the same reason fields
          // does: the mutation body is a flat string map.
          let accepted: string[] | null = null;
          if (body.action === 'apply-route-fact-revision' && typeof body.accepted_fields === 'string' && body.accepted_fields.trim()) {
            let parsed: unknown = null;
            try { parsed = JSON.parse(body.accepted_fields); } catch { return json({ error: 'route_fact_accepted_fields_invalid' }, 400); }
            if (!Array.isArray(parsed) || parsed.length > 32
              || parsed.some(key => typeof key !== 'string' || !key.trim() || key.length > 64)) {
              return json({ error: 'route_fact_accepted_fields_invalid' }, 400);
            }
            accepted = parsed as string[];
          }
          // The actor has to be passed in: admin-api writes through the service
          // role, where auth.uid() is null inside the definer functions.
          const call = body.action === 'apply-route-fact-revision'
            ? await service.rpc('apply_route_fact_revision', { p_suggestion_id: body.id, p_accepted_fields: accepted, p_actor: auth.user.id, p_note: body.note || null })
            : await service.rpc('reject_route_fact_revision', { p_suggestion_id: body.id, p_actor: auth.user.id, p_note: body.note || null });
          if (call.error) {
            const mapped = routeFactRevisionError(call.error.message || '');
            return json({ error: mapped.error }, mapped.status);
          }
          // Deliberately no early return: falling through keeps this action in
          // admin_audit_logs like every other write.
          revisionResult = call.data ?? null;
        } else {
          const updated = await service.from('route_fact_entries')
            .update({ status: 'archived', updated_by: auth.user.id })
            .eq('id', body.id).select('id').maybeSingle();
          if (updated.error) throw updated.error;
          if (!updated.data) return json({ error: 'route_fact_not_found' }, 404);
        }
      } else {
        return json({ error: 'unknown_action' }, 400);
      }
      const audit = await service.from('admin_audit_logs').insert({ actor_id: auth.user.id, action: body.action, resource_type: resource, resource_id: body.id, metadata: { role: body.role || null } });
      if (audit.error) throw audit.error;
      return json({ ok: true, data: revisionResult });
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
      return json({ data: authUsers.data.users.map((user) => ({ ...byId.get(user.id), id: user.id, email: user.email, role: user.app_metadata?.role || '', last_sign_in_at: user.last_sign_in_at, banned_until: user.banned_until, created_at: user.created_at })) });
    }
    if (resource === 'routeFacts') {
      const result = await service.from('route_fact_entries')
        .select('id,route_id,category_slug,title,fields,source_url,status,origin,target_entry_id,resolution,resolved_at,confirmed_at,reviewed_at,review_due_at,created_at,updated_at,created_by,updated_by,route:routes(name),category:route_fact_categories(name)')
        .order('updated_at', { ascending: false }).limit(1000);
      if (result.error) throw result.error;
      await service.from('admin_audit_logs').insert({ actor_id: auth.user.id, action: 'read', resource_type: resource, metadata: { count: result.data?.length || 0 } });
      return json({ data: result.data || [] });
    }
    // Change history for 线路资料. Read whole and filtered by entry in the
    // console: the volume is small, and adminApi's url builder takes no query
    // parameters, so adding a filter would mean widening that helper for one
    // caller.
    if (resource === 'routeFactRevisions') {
      const result = await service.from('route_fact_revisions')
        .select('id,entry_id,revision,action,changed_fields,fields_before,fields_after,source_url,source_entry_id,note,applied_at,applied_by,applied_by_name')
        .order('applied_at', { ascending: false }).limit(500);
      if (result.error) throw result.error;
      await service.from('admin_audit_logs').insert({ actor_id: auth.user.id, action: 'read', resource_type: resource, metadata: { count: result.data?.length || 0 } });
      return json({ data: result.data || [] });
    }
    const tables: Record<string, { table: string; select: string; order: string }> = {
      journeys: { table: 'journeys', select: 'id,name,region,created_at,planned_date,total_days,user_id,deleted_at', order: 'created_at' },
      // `gear_items` stores the user-maintained item name and measurements;
      // branding is not a column in the current schema.
      gear: { table: 'gear_items', select: 'id,name,weight,price,user_id,created_at', order: 'created_at' },
      routes: { table: 'routes', select: 'id,name,region,dist,asc_,diff,created_by,track_file_url,track_file_name,created_at', order: 'created_at' },
      tracks: { table: 'tracks', select: 'id,name,file_name,file_format,file_url,file_size,dist_m,asc_m,point_count,user_id,created_at', order: 'created_at' },
      notifications: { table: 'notifications', select: 'id,user_id,kind,cat,verb,target,read,created_at', order: 'created_at' },
      content: { table: 'inspo_media', select: 'id,journey_id,user_id,uri,thumbnail,kind,caption,moderation_status,moderation_reason,reviewed_at,created_at', order: 'created_at' },
      agentRuns: { table: 'agent_runs', select: 'id,user_id,status,error,agent_version,created_at,updated_at', order: 'created_at' },
      audit: { table: 'admin_audit_logs', select: 'id,actor_id,action,resource_type,resource_id,metadata,created_at', order: 'created_at' },
      // Ordered descending by the generic path; the route-facts UI re-sorts by sort_order.
      routeFactCategories: { table: 'route_fact_categories', select: 'slug,name,description,field_schema,review_interval_days,sort_order', order: 'sort_order' },
    };
    const config = tables[resource];
    if (!config) return json({ error: 'unknown_resource' }, 400);
    let query = service.from(config.table).select(config.select).order(config.order, { ascending: false }).limit(500);
    const result = await query;
    if (result.error) throw result.error;
    await service.from('admin_audit_logs').insert({ actor_id: auth.user.id, action: 'read', resource_type: resource, metadata: { count: result.data?.length || 0 } });
    const userKey = resource === 'routes' ? 'created_by' : resource === 'audit' ? 'actor_id' : ['journeys', 'gear', 'tracks', 'notifications', 'content', 'agentRuns'].includes(resource) ? 'user_id' : null;
    if (userKey) {
      const rows = result.data || [];
      const userIds = [...new Set(rows.map((row) => row[userKey]).filter(Boolean))];
      const profiles = userIds.length
        ? await service.from('profiles').select('id,display_name,nick,username,avatar_url').in('id', userIds)
        : { data: [], error: null };
      if (profiles.error) throw profiles.error;
      const profileById = new Map((profiles.data || []).map((profile) => [profile.id, profile]));
      return json({ data: rows.map((row) => ({ ...row, user: profileById.get(row[userKey]) || null })) });
    }
    return json({ data: result.data || [] });
  } catch (error) {
    console.error('[admin-api]', error);
    return json({ error: error instanceof Error ? error.message : 'internal_error' }, 500);
  }
});
