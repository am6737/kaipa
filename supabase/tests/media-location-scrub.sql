-- Media scrub queue RPCs (supabase/migrations/20261027160000_media_location_scrub.sql).
-- Runs inside a transaction that rolls back; storage.objects inserts ride on
-- reserved upload tickets so the accounting trigger accepts them without
-- metadata and stays inert.
begin;
create function pg_temp.assert_scrub(ok boolean, message text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception '%', message; end if; end $$;

select pg_temp.assert_scrub(has_function_privilege('service_role','public.media_scrub_pending(integer)','EXECUTE'),'service_role cannot list the scrub queue');
select pg_temp.assert_scrub(has_function_privilege('service_role','public.media_scrub_record(uuid,text,text)','EXECUTE'),'service_role cannot record scrub results');
select pg_temp.assert_scrub(not has_function_privilege('authenticated','public.media_scrub_pending(integer)','EXECUTE'),'Clients can list the scrub queue');
select pg_temp.assert_scrub(not has_function_privilege('anon','public.media_scrub_pending(integer)','EXECUTE'),'Anon can list the scrub queue');
select pg_temp.assert_scrub(not has_function_privilege('authenticated','public.media_scrub_record(uuid,text,text)','EXECUTE'),'Clients can record scrub results');
select pg_temp.assert_scrub(not has_function_privilege('anon','public.media_scrub_record(uuid,text,text)','EXECUTE'),'Anon can record scrub results');
select pg_temp.assert_scrub(not has_table_privilege('authenticated','public.media_location_scrub','SELECT,INSERT,UPDATE,DELETE'),'Clients can touch the scrub ledger');

select set_config('test.scrub_user', gen_random_uuid()::text, true);
insert into auth.users(id,raw_user_meta_data) values(current_setting('test.scrub_user')::uuid,'{"nickname":"Scrub test"}');
insert into public.profiles(id) values(current_setting('test.scrub_user')::uuid) on conflict do nothing;
insert into public.resource_usage(user_id,resource,period_key) values(current_setting('test.scrub_user')::uuid,'storage_bytes','lifetime') on conflict do nothing;
insert into public.resource_reservations(id,user_id,resource,period_key,request_key,amount,policy_versions,shadow_exceeded,expires_at)
values('00000000-0000-4000-8000-000000000001',current_setting('test.scrub_user')::uuid,'storage_bytes','lifetime','scrub-test',1048576,'{}',false,now()+interval '1 hour');
select set_config('test.scrub_reservation','00000000-0000-4000-8000-000000000001',true);

create function pg_temp.scrub_object(p_bucket text, p_name text, p_age interval) returns uuid language plpgsql as $$
declare v_id uuid;
begin
  -- The objects trigger demands a reserved ticket but returns early for
  -- metadata-less rows, so accounting never runs.
  insert into public.resource_upload_tickets(user_id,reservation_id,bucket,path,purpose,mime_type,max_bytes,expires_at)
  values(current_setting('test.scrub_user')::uuid,current_setting('test.scrub_reservation')::uuid,
         p_bucket,p_name,'media','application/octet-stream',1048576,now()+interval '1 hour');
  insert into storage.objects(bucket_id,name,version,created_at,metadata)
  values(p_bucket,p_name,gen_random_uuid()::text,now()-p_age,null)
  returning id into v_id;
  return v_id;
end $$;

select set_config('test.scrub_media', pg_temp.scrub_object('kaipa','moments/scrub-test/a.heic','10 minutes')::text,true);
select set_config('test.scrub_track', pg_temp.scrub_object('kaipa','tracks/scrub-test/b.gpx','9 minutes')::text,true);
select set_config('test.scrub_assistant', pg_temp.scrub_object('kaipa','assistant/scrub-test/c.json','8 minutes')::text,true);
select set_config('test.scrub_gear', pg_temp.scrub_object('kaipa-gear','gear/scrub-test/d.jpg','7 minutes')::text,true);
select set_config('test.scrub_shared', pg_temp.scrub_object('shared-moments','shared/scrub-test/e.mp4','6 minutes')::text,true);
select set_config('test.scrub_private', pg_temp.scrub_object('kaipa-private','scrub-test/f.jpg','5 minutes')::text,true);

-- p_limit is honoured, order is newest first, and only in-scope rows lead.
select pg_temp.assert_scrub(
  (select array_agg(name order by ord) from public.media_scrub_pending(3) with ordinality as p(object_id,bucket_id,name,version,content_type,cache_control,ord))
  = array['shared/scrub-test/e.mp4','gear/scrub-test/d.jpg','moments/scrub-test/a.heic'],'Queue is not newest-first within scope');
select pg_temp.assert_scrub(
  (select count(*)=0 from public.media_scrub_pending(10000) p where p.name like 'tracks/%' or p.name like 'assistant/%' or p.bucket_id='kaipa-private'),
  'Queue contains out-of-scope objects');

-- Recording drops the current version from the queue.
select pg_temp.assert_scrub(public.media_scrub_record(current_setting('test.scrub_media')::uuid,'clean',null),'Record rejected a live object');
select pg_temp.assert_scrub(
  (select version from public.media_location_scrub where object_id=current_setting('test.scrub_media')::uuid)
  = (select version from storage.objects where id=current_setting('test.scrub_media')::uuid),'Ledger did not store the current version');
select pg_temp.assert_scrub(
  not exists(select 1 from public.media_scrub_pending(10000) p where p.object_id=current_setting('test.scrub_media')::uuid),
  'Recorded object is still queued');
select pg_temp.assert_scrub(
  (select array_agg(name order by ord) from public.media_scrub_pending(2) with ordinality as p(object_id,bucket_id,name,version,content_type,cache_control,ord))
  = array['shared/scrub-test/e.mp4','gear/scrub-test/d.jpg'],'Queue kept the recorded object');

-- A re-upload changes the version, so the object becomes eligible again.
update storage.objects set version=gen_random_uuid()::text where id=current_setting('test.scrub_media')::uuid;
select pg_temp.assert_scrub(
  exists(select 1 from public.media_scrub_pending(10000) p where p.object_id=current_setting('test.scrub_media')::uuid),
  'New version did not reappear in the queue');
select pg_temp.assert_scrub(public.media_scrub_record(current_setting('test.scrub_media')::uuid,'stripped','2 tags'),'Re-record failed');
select pg_temp.assert_scrub(
  (select result from public.media_location_scrub where object_id=current_setting('test.scrub_media')::uuid)='stripped','Ledger kept the old result');
select pg_temp.assert_scrub(
  not exists(select 1 from public.media_scrub_pending(10000) p where p.object_id=current_setting('test.scrub_media')::uuid),
  'Re-recorded object is still queued');

select pg_temp.assert_scrub(not public.media_scrub_record(gen_random_uuid(),'clean'),'Record accepted a missing object');
do $$ begin
  begin perform public.media_scrub_record(current_setting('test.scrub_gear')::uuid,'bogus');
    raise exception 'Ledger accepted an unknown result';
  exception when check_violation then null; end;
end $$;

-- Clients cannot reach the queue or the ledger even as calls, not just grants.
select set_config('request.jwt.claim.sub', current_setting('test.scrub_user'), true);
set local role authenticated;
do $$ begin
  begin perform public.media_scrub_pending(1);
    raise exception 'Authenticated listed the scrub queue';
  exception when insufficient_privilege then null; end;
  begin perform public.media_scrub_record(gen_random_uuid(),'clean');
    raise exception 'Authenticated recorded a scrub result';
  exception when insufficient_privilege then null; end;
  begin perform 1 from public.media_location_scrub;
    raise exception 'Authenticated read the scrub ledger';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
select set_config('request.jwt.claim.sub', current_setting('test.scrub_user'), true);
set local role anon;
do $$ begin
  begin perform public.media_scrub_pending(1);
    raise exception 'Anon listed the scrub queue';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

drop function pg_temp.scrub_object(text,text,interval);

rollback;
