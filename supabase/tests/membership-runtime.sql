create function pg_temp.assert_runtime(ok boolean,message text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception '%',message; end if; end $$;
select set_config('storage.allow_delete_query','true',true);
select set_config('test.runtime_user',gen_random_uuid()::text,true);
select set_config('test.runtime_other',gen_random_uuid()::text,true);
insert into auth.users(id,raw_user_meta_data) values
 (current_setting('test.runtime_user')::uuid,'{"nickname":"Runtime test"}'),
 (current_setting('test.runtime_other')::uuid,'{"nickname":"Runtime other"}');
select set_config('request.jwt.claim.sub',current_setting('test.runtime_user'),true);
select set_config('request.jwt.claims',json_build_object('sub',current_setting('test.runtime_user'),'role','authenticated')::text,true);
set local role authenticated;
select pg_temp.assert_runtime(public.get_membership_status()->>'purchaseEnabled'='false','Purchases unexpectedly enabled');
select pg_temp.assert_runtime(not exists(select 1 from jsonb_array_elements(public.get_membership_status()->'resources') r where r->>'tracking'<>'live'),'Resource not connected');
do $$ begin
 begin perform public.membership_admin_snapshot();raise exception 'Ordinary user read admin configuration';exception when insufficient_privilege then null;end;
 begin perform public.configure_membership('set_stage','{"stage":"paid"}','test');raise exception 'Ordinary user changed configuration';exception when insufficient_privilege then null;end;
end $$;
reset role;

select set_config('test.ticket',public.prepare_resource_upload(current_setting('test.runtime_user')::uuid,'gear','test',100,'image/jpeg')::text,true);
select pg_temp.assert_runtime((select reserved=100 and used=0 from public.resource_usage where user_id=current_setting('test.runtime_user')::uuid and resource='storage_bytes'),'Upload failed to reserve');
-- Storage rolls back its INSERT permission probe before uploading bytes.
savepoint storage_probe;
set local role authenticated;
insert into storage.objects(bucket_id,name,owner_id) values('kaipa-gear',current_setting('test.ticket')::jsonb->>'path',current_setting('test.runtime_user'));
rollback to storage_probe;
select pg_temp.assert_runtime((select state='reserved' from public.resource_upload_tickets where id=(current_setting('test.ticket')::jsonb->>'id')::uuid),'Probe spent ticket');
insert into storage.objects(bucket_id,name,owner_id,metadata) values('kaipa-gear',current_setting('test.ticket')::jsonb->>'path',current_setting('test.runtime_user'),'{"size":80,"mimetype":"image/jpeg"}');
select pg_temp.assert_runtime((select used=80 and reserved=0 from public.resource_usage where user_id=current_setting('test.runtime_user')::uuid and resource='storage_bytes'),'Actual measured bytes not settled');
update storage.objects set last_accessed_at=now() where bucket_id='kaipa-gear' and name=current_setting('test.ticket')::jsonb->>'path';
select pg_temp.assert_runtime((select used=80 from public.resource_usage where user_id=current_setting('test.runtime_user')::uuid and resource='storage_bytes'),'Access time update changed accounting');
do $$ begin
 begin insert into storage.objects(bucket_id,name,metadata) values('kaipa','media/forged.jpg','{"size":10,"mimetype":"image/jpeg"}');raise exception 'Unreserved upload succeeded';exception when insufficient_privilege then null;end;
end $$;
select set_config('test.ticket2',public.prepare_resource_upload(current_setting('test.runtime_user')::uuid,'gear','test',100,'image/jpeg')::text,true);
do $$ begin
 begin insert into storage.objects(bucket_id,name,owner_id,metadata) values('kaipa-gear',current_setting('test.ticket2')::jsonb->>'path',current_setting('test.runtime_user'),'{"size":101,"mimetype":"image/jpeg"}');raise exception 'Larger actual upload accepted';exception when sqlstate '22023' then null;end;
end $$;
select public.cancel_resource_upload((current_setting('test.ticket2')::jsonb->>'id')::uuid,current_setting('test.runtime_user')::uuid);
select pg_temp.assert_runtime((select reserved=0 from public.resource_usage where user_id=current_setting('test.runtime_user')::uuid and resource='storage_bytes'),'Cancel failed to release');
select set_config('request.jwt.claim.sub',current_setting('test.runtime_other'),true);
set local role authenticated;
delete from storage.objects where bucket_id='kaipa-gear' and name=current_setting('test.ticket')::jsonb->>'path';
reset role;
select pg_temp.assert_runtime(exists(select 1 from storage.objects where bucket_id='kaipa-gear' and name=current_setting('test.ticket')::jsonb->>'path'),'Other user deleted photo');
-- A closed global service must still allow cleanup.
update public.service_budgets set enabled=false where service='stored_bytes';
select set_config('request.jwt.claim.sub',current_setting('test.runtime_user'),true);
set local role authenticated;
delete from storage.objects where bucket_id='kaipa-gear' and name=current_setting('test.ticket')::jsonb->>'path';
reset role;
select pg_temp.assert_runtime((select used=0 from public.resource_usage where user_id=current_setting('test.runtime_user')::uuid and resource='storage_bytes'),'Delete failed to release actual bytes');
update public.service_budgets set enabled=true where service='stored_bytes';

-- Tiny/empty objects cannot bypass platform protection through byte quotas.
select set_config('test.object_cap',(select daily_units::text from public.service_budgets where service='stored_objects'),true);
select set_config('test.tiny_ticket',public.prepare_resource_upload(current_setting('test.runtime_user')::uuid,'gear','tiny',1,'image/jpeg')::text,true);
update public.service_budgets set daily_units=1+(select used from public.service_budget_usage where service='stored_objects' and day='2000-01-01') where service='stored_objects';
insert into storage.objects(bucket_id,name,metadata) values('kaipa-gear',current_setting('test.tiny_ticket')::jsonb->>'path','{"size":0,"mimetype":"image/jpeg"}');
select set_config('test.tiny_ticket2',public.prepare_resource_upload(current_setting('test.runtime_user')::uuid,'gear','tiny',1,'image/jpeg')::text,true);
do $$ begin
 begin insert into storage.objects(bucket_id,name,metadata) values('kaipa-gear',current_setting('test.tiny_ticket2')::jsonb->>'path','{"size":0,"mimetype":"image/jpeg"}');raise exception 'Tiny object bypassed global object capacity';
 exception when sqlstate 'P0001' then if sqlerrm<>'service_budget_exceeded' then raise;end if;end;
end $$;
update public.service_budgets set daily_units=current_setting('test.object_cap')::bigint where service='stored_objects';
delete from storage.objects where bucket_id='kaipa-gear' and name=current_setting('test.tiny_ticket')::jsonb->>'path';
select public.cancel_resource_upload((current_setting('test.tiny_ticket2')::jsonb->>'id')::uuid,current_setting('test.runtime_user')::uuid);

-- Editing a set must be atomic even when child validation fails.
select set_config('request.jwt.claim.sub',current_setting('test.runtime_user'),true);
with inserted as (insert into public.gear_items(user_id,name,weight,price) values(current_setting('test.runtime_user')::uuid,'Runtime gear',1,1) returning id)
select set_config('test.gear_id',id::text,true) from inserted;
set local role authenticated;
select set_config('test.gear_set',public.save_resource_gear_set(null,'Original',null,jsonb_build_array(jsonb_build_object('id',current_setting('test.gear_id')::integer,'qty',1)))::text,true);
do $$ begin
 begin
  perform public.save_resource_gear_set(current_setting('test.gear_set')::jsonb->>'id','Changed',null,jsonb_build_array(jsonb_build_object('id',current_setting('test.gear_id')::integer,'qty',-1)));
  raise exception 'Invalid set quantity saved';
 exception when check_violation then null;end;
end $$;
select pg_temp.assert_runtime((select name='Original' from public.gear_sets where id=current_setting('test.gear_set')::jsonb->>'id'),'Failed set edit changed name');
select pg_temp.assert_runtime((select qty=1 from public.gear_set_items where set_id=current_setting('test.gear_set')::jsonb->>'id'),'Failed set edit deleted links');
reset role;

-- Persistent rate RPCs return rejection without rolling back their counters.
update public.resource_rate_rules set max_requests=1 where scope='gear';
select pg_temp.assert_runtime((public.consume_resource_rate('gear','runtime-test')->>'allowed')::boolean,'First rate request rejected');
select pg_temp.assert_runtime(not (public.consume_resource_rate('gear','runtime-test')->>'allowed')::boolean,'Second rate request accepted');
update public.service_budget_usage set used=0 where service='gear_requests' and day=(now() at time zone 'UTC')::date;
update public.service_budgets set daily_units=10,per_run_units=10 where service='gear_requests';
select set_config('test.budget',public.reserve_service_budget('gear_requests','runtime-test',7)::text,true);
do $$ begin
 begin perform public.reserve_service_budget('gear_requests','runtime-test',4);raise exception 'Global budget exceeded';exception when sqlstate 'P0001' then if sqlerrm<>'service_budget_exceeded' then raise;end if;end;
end $$;
select public.settle_service_budget(current_setting('test.budget')::uuid,3);
select public.settle_service_budget(current_setting('test.budget')::uuid,3);
select pg_temp.assert_runtime((select actual_units=3 from public.service_budget_calls where id=current_setting('test.budget')::uuid),'Budget settlement failed');

insert into public.journeys(id,user_id,name,region,lng,lat,tone) values('j_runtime_test',current_setting('test.runtime_user')::uuid,'Test','Test',0,0,'river');
insert into public.journey_shares(id,journey_id,user_id,slug,code) values('js_runtime_test','j_runtime_test',current_setting('test.runtime_user')::uuid,'runtime-test-'||current_setting('test.runtime_user'),'1234');
select set_config('test.guest1',public.open_resource_guest_session('runtime-test-'||current_setting('test.runtime_user'),'1234')::text,true);
select set_config('test.guest2',public.open_resource_guest_session('runtime-test-'||current_setting('test.runtime_user'),'1234')::text,true);
select pg_temp.assert_runtime(public.open_resource_guest_session('runtime-test-'||current_setting('test.runtime_user'),'1234',current_setting('test.guest1')::jsonb->>'token')->>'sessionId'=current_setting('test.guest1')::jsonb->>'sessionId','Renewal changed guest identity');
select set_config('test.moment',public.write_resource_guest_moment(current_setting('test.guest1')::jsonb->>'token','test-request','{"guest_name":"Same name","caption":"Hello","is_text":true}')::text,true);
select pg_temp.assert_runtime(public.write_resource_guest_moment(current_setting('test.guest1')::jsonb->>'token','test-request','{"guest_name":"Same name","caption":"Hello","is_text":true}')->>'id'=current_setting('test.moment')::jsonb->>'id','Guest retry duplicated content');
do $$ begin
 begin perform public.delete_resource_guest_moment(current_setting('test.guest2')::jsonb->>'token',current_setting('test.moment')::jsonb->>'id');raise exception 'Guest deleted someone else';exception when insufficient_privilege then null;end;
end $$;
set local role anon;
select pg_temp.assert_runtime((select count(*)=0 from public.journey_shares where id='js_runtime_test'),'Anon enumerated share code');
do $$ begin
 begin insert into public.shared_moments(share_id,journey_id,guest_name) values('js_runtime_test','j_runtime_test','Attacker');raise exception 'Anon bypassed guest session';exception when insufficient_privilege then null;end;
end $$;
reset role;
select public.delete_resource_guest_moment(current_setting('test.guest1')::jsonb->>'token',current_setting('test.moment')::jsonb->>'id');

select set_config('test.thread',gen_random_uuid()::text,true);
select set_config('test.run',gen_random_uuid()::text,true);
insert into public.agent_threads(id,user_id) values(current_setting('test.thread')::uuid,current_setting('test.runtime_user')::uuid);
insert into public.agent_runs(id,thread_id,user_id,status,agent_version) values(current_setting('test.run')::uuid,current_setting('test.thread')::uuid,current_setting('test.runtime_user')::uuid,'running','test');
select pg_temp.assert_runtime((select reserved=1 from public.resource_usage where user_id=current_setting('test.runtime_user')::uuid and resource='ai_requests'),'AI admission not reserved');
select public.reserve_resource(current_setting('test.runtime_user')::uuid,'ai_plans','run:'||current_setting('test.run'),1);
update public.agent_runs set status='failed' where id=current_setting('test.run')::uuid;
select pg_temp.assert_runtime((select reserved=0 and used=0 from public.resource_usage where user_id=current_setting('test.runtime_user')::uuid and resource='ai_requests'),'Failed AI was charged');
update public.agent_runs set status='running' where id=current_setting('test.run')::uuid;
update public.agent_runs set status='completed' where id=current_setting('test.run')::uuid;
select pg_temp.assert_runtime((select reserved=0 and used=1 from public.resource_usage where user_id=current_setting('test.runtime_user')::uuid and resource='ai_plans'),'Recovered AI plan not settled');

select pg_temp.assert_runtime(public.reconcile_resource_usage()->>'usageMismatchCount'='0','Usage reconciliation disagrees with ledger');
select pg_temp.assert_runtime(public.reconcile_resource_usage()->>'fileMismatchCount'='0','Storage reconciliation disagrees with metadata');
select pg_temp.assert_runtime(public.reconcile_resource_usage()->>'reservedMismatchCount'='0','Reserved usage drifted');

select pg_temp.assert_runtime(not exists(select 1 from public.resource_usage_events where user_id=current_setting('test.runtime_user')::uuid and (membership_plan<>'free' or access_source<>'campaign' or operation_stage<>'open_access')),'Telemetry forged a paid identity for open access');

-- Open ending freezes a shrinking baseline. It never deletes existing data.
insert into public.resource_usage(user_id,resource,period_key,used) values(current_setting('test.runtime_other')::uuid,'storage_bytes','lifetime',600000000) on conflict(user_id,resource,period_key) do update set used=excluded.used;
update public.operation_campaigns set starts_at=now()-interval '3 days',ends_at=now()-interval '1 day';
select pg_temp.assert_runtime((public.membership_resource_limit(current_setting('test.runtime_other')::uuid,'storage_bytes')->>'enforcedLimit')::bigint=600000000,'Existing usage lost transition protection');
update public.resource_usage set used=550000000 where user_id=current_setting('test.runtime_other')::uuid and resource='storage_bytes';
select pg_temp.assert_runtime((public.membership_resource_limit(current_setting('test.runtime_other')::uuid,'storage_bytes')->>'enforcedLimit')::bigint=550000000,'Transition baseline did not shrink');
select pg_temp.assert_runtime((select count(*)=1 from public.journeys where id='j_runtime_test'),'Campaign expiry deleted data');

select set_config('request.jwt.claim.sub',current_setting('test.runtime_user'),true);
select set_config('request.jwt.claims',json_build_object('sub',current_setting('test.runtime_user'),'role','authenticated','app_metadata',json_build_object('role','viewer'))::text,true);
set local role authenticated;
select pg_temp.assert_runtime(public.membership_admin_snapshot()->'runtime' is not null,'Viewer cannot read');
do $$ begin
 begin perform public.configure_membership('set_stage','{"stage":"trial_operation"}','test reason');raise exception 'Viewer changed configuration';exception when insufficient_privilege then null;end;
end $$;
reset role;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('test.runtime_user'),'role','authenticated','app_metadata',json_build_object('role','owner'))::text,true);
set local role authenticated;
select pg_temp.assert_runtime(public.configure_membership('set_stage','{"stage":"trial_operation"}','runtime test')->'runtime'->>'stage'='trial_operation','Owner change failed');
reset role;
select set_config('test.gift_request',gen_random_uuid()::text,true);
set local role authenticated;
select public.configure_membership('gift',jsonb_build_object('userId',current_setting('test.runtime_user'),'requestId',current_setting('test.gift_request'),'endsAt',now()+interval '1 month','isLifetime',false),'runtime gift');
select public.configure_membership('gift',jsonb_build_object('userId',current_setting('test.runtime_user'),'requestId',current_setting('test.gift_request'),'endsAt',now()+interval '1 month','isLifetime',false),'runtime gift');
select pg_temp.assert_runtime((select count(*)=1 from public.membership_grants where source_key='gift:'||current_setting('test.gift_request')),'Gift replay duplicated grant');
reset role;
select pg_temp.assert_runtime(exists(select 1 from public.admin_audit_logs where actor_id=current_setting('test.runtime_user')::uuid and action='membership.set_stage'),'Admin action not audited');
set local role service_role;
select pg_temp.assert_runtime(jsonb_typeof(public.resource_maintenance_candidates())='array','Maintenance candidate scan failed');
reset role;
