-- Run only in the disposable database built by scripts/qa/issue11-isolated.cjs.
-- Keep all failures visible, rather than stopping after the first expiry gap.
begin;
create temporary table issue11_results(label text, passed boolean);
create function pg_temp.denied(label text, statement text) returns void language plpgsql as $$
begin
  begin
    execute statement;
  exception when no_data_found or insufficient_privilege then
    insert into issue11_results values(label,true);
    return;
  end;
  insert into issue11_results values(label,false);
end $$;
do $$
declare
  owner_id uuid := gen_random_uuid();
  member_id uuid := gen_random_uuid();
  jid text := 'issue11-' || gen_random_uuid()::text;
  code text;
  token text;
  v_share_id text;
  moment_id text;
  snapshot_call text;
  add_call text;
  delete_call text;
  upload_call text;
  object_call text;
  ticket jsonb;
  mode text;
  other_token text;
  cancel_id uuid;
  deletable text;
begin
  insert into auth.users(id,email,role,aud,is_anonymous) values
    (owner_id,owner_id || '@example.test','authenticated','authenticated',false),
    (member_id,member_id || '@example.test','authenticated','authenticated',false);
  insert into public.profiles(id,display_name) values(owner_id,'Owner'),(member_id,'Member') on conflict(id) do nothing;
  perform set_config('request.jwt.claim.sub',owner_id::text,true);
  insert into public.journeys(id,user_id,name,region,lng,lat,tone)
    values(jid,owner_id,'Issue 11 fixture','Test',110,25,'forest');
  insert into public.companions(user_id,journey_id,ini,name,color,is_host,is_self,sort_order)
    values(member_id,jid,'M','Member','#2E7D5B',false,false,0);
  if not public.is_journey_member(jid) then raise exception 'SETUP: owner membership'; end if;
  perform set_config('request.jwt.claim.sub',member_id::text,true);
  if not public.is_journey_member(jid) then raise exception 'SETUP: member membership'; end if;
  insert into issue11_results values('legal owner and companion membership',true);
  perform set_config('request.jwt.claim.sub',owner_id::text,true);
  code := public.ensure_journey_share(jid)->>'code';
  token := public.open_resource_guest_session(code,null,null)->>'token';
  if token is null then raise exception 'SETUP: valid passphrase did not open'; end if;
  v_share_id := public.resource_guest_snapshot(token)->'share'->>'id';
  moment_id := public.write_resource_guest_moment(token,'valid-text','{"caption":"fixture","is_text":true}'::jsonb)->>'id';
  ticket := public.prepare_resource_upload(null,'guest',v_share_id,128,'image/jpeg',token);
  insert into storage.buckets(id,name,public) values('shared-moments','shared-moments',true) on conflict do nothing;
  object_call := format('insert into storage.objects(bucket_id,name,metadata) values(%L,%L,%L::jsonb)',ticket->>'bucket',ticket->>'path','{"size":128,"mimetype":"image/jpeg"}');
  if moment_id is null or v_share_id is null then raise exception 'SETUP: valid guest content'; end if;
  insert into issue11_results values('valid anonymous guest open/read/text/upload preparation',true);
  snapshot_call := format('select public.resource_guest_snapshot(%L)',token);
  add_call := format('select public.write_resource_guest_moment(%L,%L,%L::jsonb)',token,'expired-text','{"caption":"expired","is_text":true}');
  delete_call := format('select public.delete_resource_guest_moment(%L,%L)',token,moment_id);
  upload_call := format('select public.prepare_resource_upload(null,%L,%L,128,%L,%L)','guest',v_share_id,'image/jpeg',token);

  -- Only expire the fixture share; the established session remains unexpired.
  update public.journey_shares set expires_at='-infinity'::timestamptz where id=v_share_id;
  if public.open_resource_guest_session(code,null,null)->>'status' is distinct from 'busy' then
    raise exception 'SETUP: expired code opened a new session';
  end if;
  insert into issue11_results values('expired passphrase rejects new session',true);
  perform pg_temp.denied('expired share rejects established-session read',snapshot_call);
  perform pg_temp.denied('expired share rejects text write',add_call);
  perform pg_temp.denied('expired share rejects content deletion',delete_call);
  perform pg_temp.denied('expired share rejects upload preparation',upload_call);
  perform pg_temp.denied('expired share rejects privileged actual object insert',object_call);

  update public.journey_shares set expires_at=now()+interval '7 days' where id=v_share_id;
  perform public.resource_guest_snapshot(token);
  insert into issue11_results values('valid share restores established-session read',true);
  update public.resource_guest_sessions gs set expires_at='-infinity'::timestamptz where gs.share_id=v_share_id;
  perform pg_temp.denied('expired session rejects read',snapshot_call);
  perform pg_temp.denied('expired session rejects text write',add_call);
  update public.resource_guest_sessions gs set expires_at=now()+interval '90 days' where gs.share_id=v_share_id;
  -- Scope and ownership are independent of nickname, and retries stay idempotent.
  perform pg_temp.denied('guest upload rejects another share scope',format('select public.prepare_resource_upload(null,%L,%L,128,%L,%L)','guest','wrong-share','image/jpeg',token));
  if public.write_resource_guest_moment(token,'valid-text','{"caption":"duplicate","is_text":true}'::jsonb)->>'id' <> moment_id then raise exception 'Idempotency lost'; end if;
  insert into issue11_results values('guest write idempotency preserved',true);
  deletable:=public.write_resource_guest_moment(token,'valid-delete','{"is_text":true}'::jsonb)->>'id';
  perform public.delete_resource_guest_moment(token,deletable);
  if exists(select 1 from public.shared_moments where id=deletable) then raise exception 'Valid guest deletion failed'; end if;
  insert into issue11_results values('valid guest deletes own content',true);
  other_token:=public.open_resource_guest_session(code,null,null)->>'token';
  perform pg_temp.denied('another guest cannot delete content by matching nickname',format('select public.delete_resource_guest_moment(%L,%L)',other_token,moment_id));
  foreach mode in array array['session','ticket','deleted','disabled','inactive'] loop
    if mode='session' then update public.resource_guest_sessions set expires_at='-infinity' where share_id=v_share_id;
    elsif mode='ticket' then update public.resource_upload_tickets set expires_at='-infinity' where id=(ticket->>'id')::uuid;
    elsif mode='deleted' then update public.journeys set deleted_at=now() where id=jid;
    elsif mode='disabled' then update public.journeys set invite_enabled=false where id=jid;
    else update public.journey_shares set active=false where id=v_share_id; end if;
    if mode<>'ticket' then
      perform pg_temp.denied(mode||' rejects read',snapshot_call);
      perform pg_temp.denied(mode||' rejects write',add_call);
      perform pg_temp.denied(mode||' rejects delete',delete_call);
      perform pg_temp.denied(mode||' rejects prepare',upload_call);
    end if;
    perform pg_temp.denied(mode||' rejects actual object insert',object_call);
    update public.resource_guest_sessions set expires_at=now()+interval '90 days' where share_id=v_share_id;
    update public.resource_upload_tickets set expires_at=now()+interval '2 minutes' where id=(ticket->>'id')::uuid;
    update public.journeys set deleted_at=null,invite_enabled=true where id=jid;
    update public.journey_shares set active=true where id=v_share_id;
  end loop;
  if has_function_privilege('anon','public.require_resource_guest(text,text,uuid)','EXECUTE')
    or has_function_privilege('authenticated','public.require_resource_guest(text,text,uuid)','EXECUTE')
    or has_function_privilege('service_role','public.require_resource_guest(text,text,uuid)','EXECUTE') then raise exception 'Internal guest validator exposed'; end if;
  insert into issue11_results values('internal guest validator privileges restricted',true);
  if (ticket->>'expires_at')::timestamptz-now() not between interval '119 seconds' and interval '121 seconds' then raise exception 'Small-ticket TTL tuning lost'; end if;
  insert into issue11_results values('small-ticket 2-minute TTL tuning preserved',true);
  execute object_call;
  if not exists(select 1 from public.resource_upload_tickets where id=(ticket->>'id')::uuid and state='completed') then raise exception 'Valid object completion failed'; end if;
  insert into issue11_results values('valid privileged object insert completes/accounting intact',true);
  -- Keep the tuned eight-slot admission cap and release/accounting behavior.
  while (select count(*) from public.resource_upload_tickets where user_id=owner_id and state='reserved' and expires_at>now())<8 loop
    perform public.prepare_resource_upload(null,'guest',v_share_id,128,'image/jpeg',token);
  end loop;
  begin
    perform public.prepare_resource_upload(null,'guest',v_share_id,128,'image/jpeg',token);
    raise exception 'Concurrency cap lost';
  exception when raise_exception then
    if sqlerrm<>'concurrency_exceeded' then raise; end if;
  end;
  insert into issue11_results values('tuned eight-ticket concurrency cap preserved',true);
  for cancel_id in select id from public.resource_upload_tickets where user_id=owner_id and state='reserved' loop
    perform public.cancel_resource_upload(cancel_id,null);
  end loop;
  -- Rotate invalidates established session and already issued tickets.
  ticket := public.prepare_resource_upload(null,'guest',v_share_id,128,'image/jpeg',token);
  object_call := format('insert into storage.objects(bucket_id,name,metadata) values(%L,%L,%L::jsonb)',ticket->>'bucket',ticket->>'path','{"size":128,"mimetype":"image/jpeg"}');
  perform public.rotate_journey_share(jid);
  perform pg_temp.denied('rotated passphrase rejects established read',snapshot_call);
  perform pg_temp.denied('rotated passphrase rejects actual object insert',object_call);
  -- Existing invitation regression continues with a fresh valid session.
  code := public.ensure_journey_share(jid)->>'code';
  token := public.open_resource_guest_session(code,null,null)->>'token';
  snapshot_call := format('select public.resource_guest_snapshot(%L)',token);
  add_call := format('select public.write_resource_guest_moment(%L,%L,%L::jsonb)',token,'after-rotation','{"is_text":true}');
  perform public.set_journey_invite_enabled(jid,false);
  perform pg_temp.denied('disabled invitation rejects existing read',snapshot_call);
  perform pg_temp.denied('disabled invitation rejects existing text write',add_call);
  perform public.set_journey_invite_enabled(jid,true);
  perform public.ensure_journey_share(jid);
  perform pg_temp.denied('re-enabled invitation does not revive old session',snapshot_call);
end $$;
select label, case when passed then 'PASS' else 'FAIL: unauthorized operation accepted' end as result
from issue11_results;
select count(*) filter(where passed) as passed, count(*) filter(where not passed) as failed from issue11_results;
-- Preserve the summary above and still return a nonzero psql exit for gaps.
do $$ begin
  if exists(select 1 from issue11_results where not passed) then
    raise exception 'Issue 11 guest access boundary regression failed';
  end if;
end $$;
rollback;
