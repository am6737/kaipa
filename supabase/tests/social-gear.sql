-- 关注体系第 4 批回归测试：出行可见范围、装备清单公开与「存为我的清单」。
-- docker exec -i kaipa-supabase-db psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres < supabase/tests/social-gear.sql
begin;

create function pg_temp.check(ok boolean, message text) returns void
language plpgsql as $$ begin
  if ok is distinct from true then raise exception '%', message; end if;
end $$;

create function pg_temp.as_user(p_key text) returns void
language plpgsql as $$ begin
  perform set_config('request.jwt.claim.sub', current_setting(p_key), true);
  perform set_config('role', 'authenticated', true);
end $$;

select set_config('test.alice', gen_random_uuid()::text, true);
select set_config('test.bob', gen_random_uuid()::text, true);
select set_config('test.track', gen_random_uuid()::text, true);

insert into auth.users(id,email,role,aud,is_anonymous) values
 (current_setting('test.alice')::uuid,'gear-alice@example.test','authenticated','authenticated',false),
 (current_setting('test.bob')::uuid,'gear-bob@example.test','authenticated','authenticated',false)
on conflict (id) do nothing;
insert into profiles(id,display_name,nick) values
 (current_setting('test.alice')::uuid,'阿丽','阿丽'),
 (current_setting('test.bob')::uuid,'阿博','阿博')
on conflict (id) do update set nick = excluded.nick;

insert into public.tracks (id, user_id, name, coords, dist_m, started_at)
values (current_setting('test.track')::uuid, current_setting('test.alice')::uuid, '轨迹',
  (select jsonb_agg(jsonb_build_array(100.0, 30.0 + g * 0.001)) from generate_series(0, 10) g), 1110, now());
insert into public.journeys (id, user_id, name, region, lng, lat, tone, status)
values ('gear-j', current_setting('test.alice')::uuid, '旅程', '测试', 100, 30, 'calm', 'completed');

-- ── 出行可见范围 ──
select pg_temp.as_user('test.alice');
select public.set_outing_visibility('gear-j', null, 'public');
select public.set_outing_visibility(null, current_setting('test.track')::uuid, 'followers');
reset role;
select pg_temp.check((select visibility from journeys where id = 'gear-j') = 'public', 'owner should set journey visibility');
select pg_temp.check((select visibility from tracks where id = current_setting('test.track')::uuid) = 'followers', 'owner should set track visibility');
select pg_temp.check(not exists (
  select 1 from journey_versions where journey_id = 'gear-j' and 'visibility' = any(changed_fields)),
  'visibility change should not record a journey version');

select pg_temp.as_user('test.bob');
do $$ begin
  perform public.set_outing_visibility('gear-j', null, 'private');
  raise exception 'bob should not change alice''s journey';
exception when insufficient_privilege then null; end $$;
do $$ begin
  perform public.set_outing_visibility('gear-j', null, 'everyone');
  raise exception 'invalid visibility should fail';
exception when raise_exception then
  if sqlerrm <> 'invalid visibility' then raise; end if;
end $$;
reset role;

-- ── 装备清单 ──
insert into gear_categories(id, user_id, name, color) values
 ('gear-c-sleep', current_setting('test.alice')::uuid, '睡眠', '#336699'),
 ('gear-c-bob', current_setting('test.bob')::uuid, '睡眠', '#000000');
insert into gear_items(id, user_id, name, cat_id, weight, price, qty, status) values
 (900001, current_setting('test.alice')::uuid, '睡袋', 'gear-c-sleep', 0.9, 1200, 1, 'packed'),
 (900002, current_setting('test.alice')::uuid, '防潮垫', 'gear-c-sleep', 0.4, 300, 1, 'packed'),
 (900003, current_setting('test.alice')::uuid, '营地鞋', null, 0.3, 100, 1, 'optional'),
 (900004, current_setting('test.bob')::uuid, ' 睡袋 ', 'gear-c-bob', 1.1, 800, 1, 'packed');
insert into gear_sets(id, user_id, name, description, visibility) values
 ('gear-s-public', current_setting('test.alice')::uuid, '周末露营', '两天一夜', 'public'),
 ('gear-s-private', current_setting('test.alice')::uuid, '私人清单', null, 'private');
insert into gear_set_items(set_id, item_id, qty, status) values
 ('gear-s-public', 900001, null, null),
 ('gear-s-public', 900002, 2, null),
 ('gear-s-public', 900003, null, null),
 ('gear-s-private', 900001, null, null);

select pg_temp.as_user('test.bob');
select set_config('test.sets', public.profile_gear_sets(current_setting('test.alice')::uuid)::text, true);
select set_config('test.set', public.profile_gear_set('gear-s-public')::text, true);
select set_config('test.hidden', coalesce(public.profile_gear_set('gear-s-private')::text, 'null'), true);
select set_config('test.summary', public.profile_summary(current_setting('test.alice')::uuid)::text, true);
reset role;
select pg_temp.check(jsonb_array_length(current_setting('test.sets')::jsonb) = 1, 'stranger should see only the public set');
select pg_temp.check((current_setting('test.sets')::jsonb -> 0 ->> 'itemCount')::int = 3, 'card should count items');
select pg_temp.check(abs((current_setting('test.sets')::jsonb -> 0 ->> 'weightKg')::numeric - 1.7) < 0.001,
  'card weight should use per-set qty and skip optional items');
select pg_temp.check(jsonb_array_length(current_setting('test.set')::jsonb -> 'items') = 3, 'detail should list items');
select pg_temp.check(not ((current_setting('test.set')::jsonb -> 'items' -> 0) ? 'price'), 'detail should not expose price');
select pg_temp.check(current_setting('test.hidden') = 'null', 'private set should be hidden');
select pg_temp.check((current_setting('test.summary')::jsonb ->> 'gearSets')::int = 1, 'summary should count visible sets');

-- 存为我的清单：睡袋按名字复用 bob 自己的；防潮垫和营地鞋新建为待购，分类按名字对上 bob 的「睡眠」。
select pg_temp.as_user('test.bob');
select set_config('test.copy', public.copy_gear_set('gear-s-public'), true);
do $$ begin
  perform public.copy_gear_set('gear-s-private');
  raise exception 'copying a private set should fail';
exception when insufficient_privilege then null; end $$;
reset role;
select pg_temp.check((select name from gear_sets where id = current_setting('test.copy')) = '周末露营', 'copy should keep the name');
select pg_temp.check((select user_id from gear_sets where id = current_setting('test.copy')) = current_setting('test.bob')::uuid, 'copy should belong to bob');
select pg_temp.check((select count(*) from gear_set_items where set_id = current_setting('test.copy')) = 3, 'copy should have 3 items');
select pg_temp.check(exists (select 1 from gear_set_items where set_id = current_setting('test.copy') and item_id = 900004),
  'copy should reuse bob''s own sleeping bag');
select pg_temp.check((select count(*) from gear_items where user_id = current_setting('test.bob')::uuid) = 3,
  'copy should add only the two missing items');
select pg_temp.check((select bool_and(not owned and price = 0) from gear_items
  where user_id = current_setting('test.bob')::uuid and id <> 900004), 'new items should be 待购 with no price');
select pg_temp.check((select cat_id from gear_items where user_id = current_setting('test.bob')::uuid and name = '防潮垫') = 'gear-c-bob',
  'category should map to bob''s existing one by name');
select pg_temp.check((select si.qty from gear_set_items si join gear_items g on g.id = si.item_id
  where si.set_id = current_setting('test.copy') and g.name = '防潮垫') = 2, 'per-set qty should carry over');

select pg_temp.as_user('test.alice');
do $$ begin
  perform public.copy_gear_set('gear-s-public');
  raise exception 'copying your own set should fail';
exception when insufficient_privilege then null; end $$;
reset role;

rollback;
