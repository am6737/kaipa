-- 发布轨迹回归测试：psql 以 postgres 运行，数据在事务内回滚。
-- docker exec -i kaipa-supabase-db psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres < supabase/tests/track-publish.sql
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
 (current_setting('test.alice')::uuid,'publish-alice@example.test','authenticated','authenticated',false),
 (current_setting('test.bob')::uuid,'publish-bob@example.test','authenticated','authenticated',false)
on conflict (id) do nothing;
insert into profiles(id,display_name,nick,username) values
 (current_setting('test.alice')::uuid,'阿丽','阿丽测试','publish_alice_t'),
 (current_setting('test.bob')::uuid,'阿博','阿博测试','publish_bob_t')
on conflict (id) do update set display_name = excluded.display_name, nick = excluded.nick, username = excluded.username;

insert into public.tracks (id, user_id, name, coords, dist_m, asc_m)
values (current_setting('test.track')::uuid, current_setting('test.alice')::uuid, '发布测试鳌太线',
        (select jsonb_agg(jsonb_build_array(100.0, 30.0 + g * 0.001)) from generate_series(0, 10) g), 1110, 50);

-- 未发布：别人搜不到、打不开。
select pg_temp.as_user('test.bob');
select pg_temp.check(jsonb_array_length(public.search_published_tracks('发布测试鳌太')) = 0, 'unpublished track is searchable');
select pg_temp.check(public.published_track(current_setting('test.track')::uuid) is null, 'unpublished track opens');
-- 别人不能替作者发布。
do $$ begin
  perform public.set_track_published(current_setting('test.track')::uuid, true);
  raise exception 'non-owner published';
exception when insufficient_privilege then null;
end $$;

-- 作者发布后，按名字和按昵称都能搜到，打开拿到完整坐标和昵称。
select pg_temp.as_user('test.alice');
select pg_temp.check(public.set_track_published(current_setting('test.track')::uuid, true) is not null, 'publish returned null');
select pg_temp.as_user('test.bob');
select pg_temp.check(jsonb_array_length(public.search_published_tracks('发布测试鳌太')) = 1, 'not found by name');
select pg_temp.check(jsonb_array_length(public.search_published_tracks('阿丽测试')) = 1, 'not found by nick');
select pg_temp.check((public.search_published_tracks('鳌太') -> 0 -> 'owner' ->> 'nick') = '阿丽测试', 'owner nick missing');
select pg_temp.check(jsonb_array_length(public.published_track(current_setting('test.track')::uuid) -> 'coords') = 11, 'coords trimmed');
select pg_temp.check(not (public.published_track(current_setting('test.track')::uuid) ? 'file_url'), 'file url leaked');
-- 通配符按字面匹配。
select pg_temp.check(not exists (
  select 1 from jsonb_array_elements(public.search_published_tracks('%')) e
   where e ->> 'id' = current_setting('test.track')), 'percent matched everything');

-- 拉黑后互相看不到。
select pg_temp.as_user('test.alice');
select public.block_user(current_setting('test.bob')::uuid);
select pg_temp.as_user('test.bob');
select pg_temp.check(jsonb_array_length(public.search_published_tracks('发布测试鳌太')) = 0, 'blocked user finds track');
select pg_temp.check(public.published_track(current_setting('test.track')::uuid) is null, 'blocked user opens track');
select pg_temp.as_user('test.alice');
select public.unblock_user(current_setting('test.bob')::uuid);

-- 取消发布后又搜不到。
select pg_temp.check(public.set_track_published(current_setting('test.track')::uuid, false) is null, 'unpublish kept time');
select pg_temp.as_user('test.bob');
select pg_temp.check(jsonb_array_length(public.search_published_tracks('发布测试鳌太')) = 0, 'unpublished track still searchable');

reset role;
select 'track-publish ok';
rollback;
