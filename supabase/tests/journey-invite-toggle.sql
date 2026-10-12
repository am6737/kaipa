begin;
create or replace function pg_temp.check(ok boolean, message text) returns void language plpgsql as $$ begin if not ok then raise exception 'check failed: %', message; end if; end $$;
select set_config('test.owner',gen_random_uuid()::text,true), set_config('test.member',gen_random_uuid()::text,true);
insert into auth.users(id,email,role,aud,is_anonymous) values (current_setting('test.owner')::uuid,'invite-owner@test','authenticated','authenticated',false),(current_setting('test.member')::uuid,'invite-member@test','authenticated','authenticated',false);
insert into profiles(id,display_name) values(current_setting('test.owner')::uuid,'Owner'),(current_setting('test.member')::uuid,'Member') on conflict (id) do nothing;
insert into journeys(id,user_id,name,region,lng,lat,tone,participant_permissions) values('invite-test',current_setting('test.owner')::uuid,'Invite test','Test',0,0,'calm','{}');
insert into companions(user_id,journey_id,ini,name,color,is_host,is_self,sort_order) values(current_setting('test.member')::uuid,'invite-test','M','Member','#2E7D5B',false,false,0);
select set_config('request.jwt.claim.sub',current_setting('test.owner'),true);
select pg_temp.check((public.ensure_journey_share('invite-test')->>'status')='active','owner active');
select set_config('request.jwt.claim.sub',current_setting('test.member'),true);
select pg_temp.check((public.ensure_journey_share('invite-test')->>'status')='no_permission','member no permission');
select set_config('request.jwt.claim.sub',current_setting('test.owner'),true);
update journeys set participant_permissions='{"inviteParticipants":true}' where id='invite-test';
select set_config('request.jwt.claim.sub',current_setting('test.member'),true);
select pg_temp.check((public.ensure_journey_share('invite-test')->>'status')='active','member active');
do $$ begin update journeys set invite_enabled=false where id='invite-test'; raise exception 'member direct update'; exception when others then if sqlerrm not like '%FORBIDDEN%' then raise; end if; end $$;
do $$ begin perform public.set_journey_invite_enabled('invite-test',false); raise exception 'non-owner toggle'; exception when others then if sqlerrm not like '%FORBIDDEN%' then raise; end if; end $$;
select set_config('request.jwt.claim.sub',current_setting('test.owner'),true);
select set_config('test.old_code', public.ensure_journey_share('invite-test')->>'code', true);
select public.set_journey_invite_enabled('invite-test',false);
select pg_temp.check(not exists(select 1 from journey_shares where journey_id='invite-test' and active),'shares disabled');
select pg_temp.check((public.ensure_journey_share('invite-test')->>'status')='disabled','owner disabled');
select set_config('request.jwt.claim.sub',current_setting('test.member'),true);
select pg_temp.check((public.ensure_journey_share('invite-test')->>'status')='disabled','member disabled');
select set_config('request.jwt.claim.sub',current_setting('test.owner'),true);
do $$ begin perform public.rotate_journey_share('invite-test'); raise exception 'rotate disabled'; exception when others then if sqlerrm not like '%JOURNEY_INVITE_DISABLED%' then raise; end if; end $$;
select set_config('request.jwt.claim.sub',current_setting('test.owner'),true);
select public.set_journey_invite_enabled('invite-test',true);
select pg_temp.check((public.ensure_journey_share('invite-test')->>'status')='active','re-enabled');
select pg_temp.check(to_regprocedure('public.stop_journey_share(text)') is null,'stop removed');
-- Old code stops working once invites are off, and re-enabling issues a fresh one.
select set_config('test.joiner', gen_random_uuid()::text, true);
insert into auth.users(id,email,role,aud,is_anonymous)
values (current_setting('test.joiner')::uuid,'invite-joiner@test','authenticated','authenticated',false);
select pg_temp.check(
  (public.ensure_journey_share('invite-test')->>'code') <> current_setting('test.old_code'),
  'new code after re-enable');
select pg_temp.check(
  public.join_journey_by_code(current_setting('test.joiner')::uuid, current_setting('test.old_code'), null, null)->>'status' = 'busy',
  'old code rejected');
select public.set_journey_invite_enabled('invite-test',false);
update journeys set invite_enabled = true where id = 'invite-test';
select set_config('test.live_code', public.ensure_journey_share('invite-test')->>'code', true);
update journeys set invite_enabled = false where id = 'invite-test';
select pg_temp.check(
  public.join_journey_by_code(current_setting('test.joiner')::uuid, current_setting('test.live_code'), null, null)->>'status' = 'busy',
  'join checks invite_enabled even with an active share');
update journeys set invite_enabled = true where id = 'invite-test';
-- Deleted journeys and strangers never get a code.
select set_config('request.jwt.claim.sub', current_setting('test.joiner'), true);
do $$ begin
  perform public.ensure_journey_share('invite-test');
  raise exception 'stranger got a code';
exception when others then
  if sqlerrm not like '%FORBIDDEN%' then raise; end if;
end $$;
select set_config('request.jwt.claim.sub', current_setting('test.owner'), true);
update journeys set deleted_at = now() where id = 'invite-test';
do $$ begin
  perform public.ensure_journey_share('invite-test');
  raise exception 'deleted journey got a code';
exception when others then
  if sqlerrm not like '%FORBIDDEN%' then raise; end if;
end $$;
rollback;
