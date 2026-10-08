create function pg_temp.assert_member(ok boolean, message text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception '%', message; end if; end $$;
select set_config('test.member_user', gen_random_uuid()::text, true);
select set_config('test.other_user', gen_random_uuid()::text, true);
insert into auth.users(id,raw_user_meta_data) values
  (current_setting('test.member_user')::uuid,'{"nickname":"Membership test"}'),
  (current_setting('test.other_user')::uuid,'{"nickname":"Other test"}');
select set_config('request.jwt.claim.sub', current_setting('test.member_user'), true);
set local role authenticated;
select pg_temp.assert_member(public.get_membership_status()->>'membershipPlan'='free','Campaign forged membership');
select pg_temp.assert_member(public.get_membership_status()->>'accessSource'='campaign','Open access missing');
select pg_temp.assert_member(public.get_membership_status()->>'purchaseEnabled'='false','Purchases enabled');
select pg_temp.assert_member(not has_table_privilege('authenticated','public.membership_grants','INSERT,UPDATE,DELETE'),'Clients can forge grants');
select pg_temp.assert_member(not has_function_privilege('authenticated','public.reserve_resource(uuid,text,text,bigint,integer)','EXECUTE'),'Clients can reserve arbitrary subjects');
select pg_temp.assert_member(not has_table_privilege('authenticated','public.membership_runtime','UPDATE'),'Clients can change stage');
reset role;

update public.operation_campaigns set starts_at=now()-interval '2 days',ends_at=now()-interval '1 day';
select pg_temp.assert_member(public.get_membership_status()->>'accessSource'='free','Expired active campaign still applies');
select pg_temp.assert_member((public.membership_resource_limit(current_setting('test.member_user')::uuid,'storage_bytes')->>'limit')::bigint=524288000,'Free storage is not 500 MiB');
insert into public.membership_grants(user_id,source,source_key,policy_version,ends_at,reason)
values(current_setting('test.member_user')::uuid,'gift','test-month','member-v1',now()+interval '1 month','test');
insert into public.membership_grants(user_id,source,source_key,policy_version,is_lifetime,reason)
values(current_setting('test.member_user')::uuid,'gift','test-lifetime','member-v1',true,'test');
update public.membership_grants set revoked_at=now() where source_key='test-month';
select pg_temp.assert_member(public.get_membership_status()->>'membershipPlan'='member','Revocation wiped another grant');
select pg_temp.assert_member(public.get_membership_status()->>'isLifetime'='true','Lifetime missing');
select pg_temp.assert_member((public.membership_resource_limit(current_setting('test.member_user')::uuid,'storage_bytes')->>'limit')::bigint=2147483648,'Member storage is not 2 GiB');
set local role authenticated;
select pg_temp.assert_member((select count(*)=2 from public.membership_grants),'Owner cannot read grants');
reset role;
select set_config('request.jwt.claim.sub', current_setting('test.other_user'), true);
set local role authenticated;
select pg_temp.assert_member((select count(*)=0 from public.membership_grants),'Other user sees grants');
reset role;

-- Test limits at small values rather than creating thousands of fake objects.
insert into public.resource_policies(version,features) values('test-free-v1','{}');
insert into public.resource_policy_limits select 'test-free-v1',resource,period,
  case when resource='gear_items' then 1 when resource='ai_requests' then 2 else commercial_limit end,
  case when resource='gear_items' then 2 when resource='ai_requests' then 4 else hard_limit end,mode
  from public.resource_policy_limits where policy_version='free-v1';
update public.membership_runtime set free_policy='test-free-v1';
do $$ begin
  begin update public.resource_policy_limits set commercial_limit=0 where policy_version='free-v1' and resource='gear_items';
    raise exception 'Published policy was mutated';
  exception when sqlstate '22023' then null; end;
end $$;
insert into public.gear_items(user_id,name,weight,price) values(current_setting('test.other_user')::uuid,'One',1,1);
do $$ begin
  begin
    insert into public.gear_items(user_id,name,weight,price) values(current_setting('test.other_user')::uuid,'Two',1,1);
    raise exception 'Quota did not reject second item';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'quota_exceeded' then raise; end if;
  end;
end $$;
select pg_temp.assert_member((select used=1 from public.resource_usage where user_id=current_setting('test.other_user')::uuid and resource='gear_items'),'Rejected insert changed usage');
delete from public.gear_items where user_id=current_setting('test.other_user')::uuid;
select pg_temp.assert_member((select used=0 from public.resource_usage where user_id=current_setting('test.other_user')::uuid and resource='gear_items'),'Delete did not release stock');

select set_config('test.reservation', (public.reserve_resource(current_setting('test.other_user')::uuid,'ai_requests','request-1',2)->>'id'),true);
select pg_temp.assert_member(public.reserve_resource(current_setting('test.other_user')::uuid,'ai_requests','request-1',2)->>'id'=current_setting('test.reservation'),'Replay created new reservation');
select pg_temp.assert_member((select reserved=2 from public.resource_usage where user_id=current_setting('test.other_user')::uuid and resource='ai_requests'),'Replay double counted');
do $$ begin
  begin
    perform public.reserve_resource(current_setting('test.other_user')::uuid,'ai_requests','request-2',1);
    raise exception 'Quota did not include reservations';
  exception when sqlstate 'P0001' then if sqlerrm <> 'quota_exceeded' then raise; end if; end;
end $$;
select public.finish_resource_reservation(current_setting('test.reservation')::uuid,1);
select public.finish_resource_reservation(current_setting('test.reservation')::uuid,1);
select pg_temp.assert_member((select used=1 and reserved=0 from public.resource_usage where user_id=current_setting('test.other_user')::uuid and resource='ai_requests'),'Settlement replay changed usage');
do $$ begin
  begin
    perform public.finish_resource_reservation(current_setting('test.reservation')::uuid,0,true);
    raise exception 'Conflicting settlement was accepted';
  exception when sqlstate '22023' then null; end;
end $$;

-- Open access can observe commercial overages but cannot bypass safety caps.
update public.operation_campaigns set ends_at=null;
insert into public.resource_policies(version,features) values('test-open-v1','{}');
insert into public.resource_policy_limits select 'test-open-v1',resource,period,
  case when resource='ai_requests' then 1 else commercial_limit end,
  case when resource='ai_requests' then 4 else hard_limit end,mode
  from public.resource_policy_limits where policy_version='open-v1';
update public.operation_campaigns set policy_version='test-open-v1';
select set_config('test.open_reservation',(public.reserve_resource(current_setting('test.other_user')::uuid,'ai_requests','open-1',3)->>'id'),true);
select pg_temp.assert_member((select shadow_exceeded from public.resource_reservations where id=current_setting('test.open_reservation')::uuid),'Shadow overage not recorded');
select public.finish_resource_reservation(current_setting('test.open_reservation')::uuid,0,true);
select pg_temp.assert_member((select used=1 and reserved=0 from public.resource_usage where user_id=current_setting('test.other_user')::uuid and resource='ai_requests'),'Release erased settled usage');

select set_config('test.expiring',(public.reserve_resource(current_setting('test.other_user')::uuid,'storage_bytes','expiring-upload',100)->>'id'),true);
update public.resource_reservations set expires_at=now()-interval '1 second' where id=current_setting('test.expiring')::uuid;
do $$ begin
  begin
    perform public.reserve_resource(current_setting('test.other_user')::uuid,'storage_bytes','expiring-upload',100);
    raise exception 'Expired reservation was reissued';
  exception when sqlstate '22023' then null; end;
end $$;
select pg_temp.assert_member((select reserved=100 from public.resource_usage where user_id=current_setting('test.other_user')::uuid and resource='storage_bytes'),'Expiry released possibly uploaded bytes');
select public.finish_resource_reservation(current_setting('test.expiring')::uuid,80);
select pg_temp.assert_member((select used=80 and reserved=0 from public.resource_usage where user_id=current_setting('test.other_user')::uuid and resource='storage_bytes'),'Late file settlement lost actual bytes');

select set_config('request.jwt.claim.sub','',true);
do $$ begin
  begin perform public.get_membership_status(); raise exception 'Unauthenticated status accepted';
  exception when insufficient_privilege then null; end;
end $$;
