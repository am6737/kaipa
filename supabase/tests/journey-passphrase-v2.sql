begin;
create or replace function pg_temp.check(ok boolean, message text) returns void language plpgsql as $$ begin if not ok then raise exception 'check failed: %', message; end if; end $$;
select set_config('test.owner', gen_random_uuid()::text, true);
select set_config('test.member', gen_random_uuid()::text, true);
select set_config('test.guest', gen_random_uuid()::text, true);
insert into auth.users(id,email,role,aud,is_anonymous) values
 (current_setting('test.owner')::uuid,'v2-owner@example.test','authenticated','authenticated',false),
 (current_setting('test.member')::uuid,'v2-member@example.test','authenticated','authenticated',false),
 (current_setting('test.guest')::uuid,'v2-guest@example.test','authenticated','authenticated',false)
on conflict (id) do nothing;
insert into profiles(id,display_name) values (current_setting('test.owner')::uuid,'Owner'),(current_setting('test.member')::uuid,'Member'),(current_setting('test.guest')::uuid,'Guest') on conflict (id) do nothing;
insert into journeys(id,user_id,name,region,lng,lat,tone,deleted_at) values ('v2-test-journey',current_setting('test.owner')::uuid,'V2 Test','Test',0,0,'calm',null) on conflict (id) do nothing;
insert into companions(user_id,journey_id,ini,name,color,is_host,is_self,sort_order) values (current_setting('test.member')::uuid,'v2-test-journey','M','Member','#2E7D5B',false,false,0) on conflict do nothing;
select set_config('request.jwt.claim.sub',current_setting('test.owner'),true);
select pg_temp.check((public.ensure_journey_share('v2-test-journey')->>'code')=(public.ensure_journey_share('v2-test-journey')->>'code'),'ensure reuses code');
update journey_shares set expires_at=now()-interval '1 second' where journey_id='v2-test-journey';
select pg_temp.check((public.ensure_journey_share('v2-test-journey')->>'code') <> (select code from journey_shares where journey_id='v2-test-journey' order by created_at limit 1),'expired share rotates');
select pg_temp.check((select count(*)=1 from journey_shares where journey_id='v2-test-journey' and active),'one active share');
select set_config('request.jwt.claim.sub',current_setting('test.guest'),true);
do $$ begin perform public.ensure_journey_share('v2-test-journey'); raise exception 'non-member check failed'; exception when others then if sqlerrm not like '%FORBIDDEN%' then raise; end if; end $$;
select set_config('request.jwt.claim.sub',current_setting('test.owner'),true);
select pg_temp.check((public.rotate_journey_share('v2-test-journey')->>'code') is not null,'rotate owner');
select pg_temp.check((public.set_journey_invite_enabled('v2-test-journey',false)->>'invite_enabled')='false','disable invites');
select pg_temp.check((public.set_journey_invite_enabled('v2-test-journey',true)->>'invite_enabled')='true','enable invites');
do $$ declare c text; first text; i int; offset1 int; offset2 int; begin
 if not ('AB9Z' ~ '^[0-9A-Z]{4}$') then raise exception 'code check failed'; end if;
 first:=public._share_code();
 offset1:=((strpos('0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ',substr(first,4,1))-strpos('0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ',substr(first,1,1)))+36)%36;
 for i in 1..200 loop c:=public._share_code(); offset2:=((strpos('0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ',substr(c,4,1))-strpos('0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ',substr(c,1,1)))+36)%36; if offset2<>offset1 then return; end if; end loop;
 raise exception 'fixed relation';
end $$;
do $$ begin
 if has_function_privilege('authenticated','public.join_journey_by_code(uuid,text,text,text)','execute') then raise exception 'join privilege'; end if;
 if has_function_privilege('authenticated','public._perform_share_join(text,uuid)','execute') then raise exception 'perform privilege'; end if;
 if has_function_privilege('anon','public.open_resource_guest_session(text,text,text)','execute') then raise exception 'guest privilege'; end if;
end $$;
select exists(select 1 from pg_indexes where indexname='journey_shares_active_code_key');
select exists(select 1 from pg_constraint where conname='journey_shares_code_check');
select public.open_resource_guest_session('NOPE',null,'test-ip')->>'status'='busy';
select count(*) >= 1 from public.journey_join_failures where ip_hash='test-ip';
-- join_journey_by_code: auth, failure counting, lockout, join outcomes.
select set_config('test.joiner', gen_random_uuid()::text, true);
select set_config('test.anon', gen_random_uuid()::text, true);
select set_config('test.locked', gen_random_uuid()::text, true);
insert into auth.users(id,email,role,aud,is_anonymous) values
 (current_setting('test.joiner')::uuid,'v2-joiner@example.test','authenticated','authenticated',false),
 (current_setting('test.anon')::uuid,null,'authenticated','authenticated',true),
 (current_setting('test.locked')::uuid,'v2-locked@example.test','authenticated','authenticated',false);
select set_config('request.jwt.claim.sub',current_setting('test.owner'),true);
select set_config('test.code', public.ensure_journey_share('v2-test-journey')->>'code', true);
select pg_temp.check(current_setting('test.code') ~ '^[0-9A-Z]{4}$','fresh code after stop');
select pg_temp.check(public.join_journey_by_code(null,current_setting('test.code'),null,null)->>'status'='auth_required','null user');
select pg_temp.check(public.join_journey_by_code(current_setting('test.anon')::uuid,current_setting('test.code'),null,null)->>'status'='auth_required','anonymous user');
select pg_temp.check((select count(*)=0 from journey_join_failures where user_id=current_setting('test.anon')::uuid),'auth_required is not a failure');
do $$ declare i int; begin
 for i in 1..5 loop
  if public.join_journey_by_code(current_setting('test.locked')::uuid,'@@@@',null,'v2-dev')->>'status' <> 'busy' then raise exception 'wrong code not busy'; end if;
 end loop;
end $$;
select pg_temp.check((select count(*)=5 from journey_join_failures where user_id=current_setting('test.locked')::uuid),'failures recorded');
select pg_temp.check(public.join_journey_by_code(current_setting('test.locked')::uuid,current_setting('test.code'),null,null)->>'status'='busy','user locked after 5 failures');
select pg_temp.check(not exists(select 1 from companions where user_id=current_setting('test.locked')::uuid),'locked user not joined');
select pg_temp.check(public.join_journey_by_code(current_setting('test.joiner')::uuid,lower(current_setting('test.code')),null,null)->>'status'='joined','lowercase code joins');
select pg_temp.check(public.join_journey_by_code(current_setting('test.joiner')::uuid,current_setting('test.code'),null,null)->>'status'='already_joined','already joined');
insert into companions(journey_id,ini,name,color,is_host,is_self,sort_order)
 select 'v2-test-journey','F','Filler','#2E7D5B',false,false,100+g from generate_series(1,10) g;
select pg_temp.check(public.join_journey_by_code(current_setting('test.guest')::uuid,current_setting('test.code'),null,null)->>'status'='full','full journey');
do $$ begin
 if has_function_privilege('authenticated','public._share_code()','execute') then raise exception 'share_code privilege'; end if;
 if has_function_privilege('anon','public.ensure_journey_share(text)','execute') then raise exception 'anon ensure privilege'; end if;
 if has_function_privilege('anon','public.rotate_journey_share(text)','execute') then raise exception 'anon rotate privilege'; end if;
end $$;
rollback;
