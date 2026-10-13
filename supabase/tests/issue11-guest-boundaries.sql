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
  perform public.prepare_resource_upload(null,'guest',v_share_id,128,'image/jpeg',token);
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

  update public.journey_shares set expires_at=now()+interval '7 days' where id=v_share_id;
  perform public.resource_guest_snapshot(token);
  insert into issue11_results values('valid share restores established-session read',true);
  update public.resource_guest_sessions gs set expires_at='-infinity'::timestamptz where gs.share_id=v_share_id;
  perform pg_temp.denied('expired session rejects read',snapshot_call);
  perform pg_temp.denied('expired session rejects text write',add_call);
  update public.resource_guest_sessions gs set expires_at=now()+interval '90 days' where gs.share_id=v_share_id;
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
