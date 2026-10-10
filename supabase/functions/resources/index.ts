import { createClient } from 'npm:@supabase/supabase-js@2.108.1';
import { authenticate, boundedJson, rate, resourceCors, resourceFailure, ResourceError, rpc, serviceClient } from '../_shared/resource-guard.ts';
const json = (body: unknown) => new Response(JSON.stringify(body), { headers: { ...resourceCors, 'Content-Type': 'application/json' } });

Deno.serve(async (req, info) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: resourceCors });
  if (req.method !== 'POST') return resourceFailure(new ResourceError('invalid_request', 405));
  let actor:string|null=null;
  let operation='resources';
  try {
    const db = serviceClient();
    const guestToken = req.headers.get('x-guest-session') || '';
    // Authentication is resolved before body parsing for signed-in calls.
    const bearer = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') || '';
    const internal = bearer === Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const isGuest = !bearer || bearer === Deno.env.get('SUPABASE_ANON_KEY');
    const auth = !isGuest && !internal ? await authenticate(req, db) : null;
    const body = await boundedJson(req, 128 * 1024);
    const action = body?.action;
    actor=auth?.user.id || null;
    operation=typeof action==='string'?action.slice(0,80):'resources';
    if (action === 'maintenance') {
      if (!internal) throw new ResourceError('forbidden', 403);
      const candidates = await rpc<{ bucket: string; path: string }[]>(db,'resource_maintenance_candidates');
      let removed = 0;
      for (const file of candidates) {
        const { error } = await db.storage.from(file.bucket).remove([file.path]);
        if (!error) removed++;
      }
      const report = await rpc(db,'reconcile_resource_usage');
      return json({ candidates: candidates.length, removed, report });
    }
    if (action === 'guest_open') {
      // Never trust X-Forwarded-For from a client. Bound both direct peer and
      // share attempts; the peer limit remains useful behind a shared gateway.
      const peer = 'hostname' in info.remoteAddr ? info.remoteAddr.hostname : 'gateway';
      await rate(db,'guest_session','peer:'+peer);
      await rate(db,'guest_session','share:'+String(body.slug).slice(0,120));
      await rpc(db,'reserve_service_budget',{p_service:'guest_requests',p_run_key:crypto.randomUUID(),p_units:1});
      return json(await rpc(db,'open_resource_guest_session',{p_slug:body.slug,p_code:body.code,p_token:guestToken || null}));
    }
    if (action?.startsWith('guest_')) {
      if (!guestToken || guestToken.length > 128) throw new ResourceError('forbidden',403);
      const snapshot = await rpc(db,'resource_guest_snapshot',{p_token:guestToken});
      actor=snapshot.share.user_id;
      await rate(db,'guest_write',snapshot.sessionId);
      await rpc(db,'reserve_service_budget',{p_service:'guest_requests',p_run_key:crypto.randomUUID(),p_units:1});
      if (action === 'guest_snapshot') return json(snapshot);
      if (action === 'guest_add') return json(await rpc(db,'write_resource_guest_moment',{p_token:guestToken,p_request:body.requestKey,p_moment:body.moment}));
      if (action === 'guest_delete') {
        const result = await rpc(db,'delete_resource_guest_moment',{p_token:guestToken,p_id:body.id});
        // Orphan cleanup retries failures; never pretend bytes were released.
        const path = result.uri?.split('/storage/v1/object/public/shared-moments/')[1];
        if (path) await db.storage.from('shared-moments').remove([decodeURIComponent(path)]);
        return json({ deleted:true });
      }
      if (action === 'guest_upload') {
        await rate(db,'guest_upload',snapshot.sessionId);
        const ticket = await rpc(db,'prepare_resource_upload',{p_user:null,p_purpose:'guest',p_scope:snapshot.share.id,p_bytes:body.bytes,p_mime:body.mime,p_guest_token:guestToken});
        const signed = await db.storage.from(ticket.bucket).createSignedUploadUrl(ticket.path);
        if (signed.error) { await rpc(db,'cancel_resource_upload',{p_id:ticket.id,p_user:null}); throw new ResourceError('service_unavailable',503); }
        return json({ ...ticket, token:signed.data.token });
      }
      throw new ResourceError('invalid_request',400);
    }
    if (!auth) throw new ResourceError('unauthorized',401);
    if (action === 'upload_prepare') {
      await rate(db,'uploads',auth.user.id);
      const ticket = await rpc(db,'prepare_resource_upload',{p_user:auth.user.id,p_purpose:body.purpose,p_scope:String(body.scope || ''),p_bytes:body.bytes,p_mime:body.mime});
      await rpc(db,'record_resource_admission',{p_user:actor,p_scope:'upload_prepare',p_result:'accepted'});
      return json(ticket);
    }
    if (action === 'upload_cancel') {
      await rate(db,'uploads',auth.user.id);
      await rpc(db,'cancel_resource_upload',{p_id:body.id,p_user:auth.user.id});
      await rpc(db,'record_resource_admission',{p_user:actor,p_scope:'upload_cancel',p_result:'cancelled'});
      return json({ cancelled:true });
    }
    const caller = createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_ANON_KEY')!,{global:{headers:{Authorization:`Bearer ${auth.token}`}},auth:{persistSession:false,autoRefreshToken:false}});
    if (action === 'status') return json(await rpc(caller,'get_membership_status'));
    if (action === 'admin_snapshot') {
      const [membership, runtime] = await Promise.all([
        rpc(caller,'membership_admin_snapshot'),
        rpc(caller,'runtime_controls_snapshot'),
      ]);
      return json({ ...membership, runtimeControls: runtime });
    }
    if (action === 'admin_configure') return json(await rpc(caller,'configure_membership',{p_action:body.operation,p_data:body.configuration,p_reason:body.reason}));
    if (action === 'runtime_configure') {
      await rpc(caller,'configure_runtime_control',{
        p_key:body.key,
        p_state:body.state,
        p_data:body.configuration || {},
        p_reason:body.reason,
      });
      const [membership, runtime] = await Promise.all([
        rpc(caller,'membership_admin_snapshot'),
        rpc(caller,'runtime_controls_snapshot'),
      ]);
      return json({ ...membership, runtimeControls: runtime });
    }
    if (action === 'purchase') throw new ResourceError('purchase_disabled',409);
    throw new ResourceError('invalid_request',400);
  } catch (error) {
    if(actor) {try {await rpc(serviceClient(),'record_resource_admission',{p_user:actor,p_scope:operation,p_result:error instanceof ResourceError?error.code:'service_unavailable'});} catch {/* denied operation remains denied */}}
    return resourceFailure(error);
  }
});
