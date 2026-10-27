-- 关注体系回归测试：psql 以 postgres 运行，数据在事务内回滚。
-- docker exec -i kaipa-supabase-db psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres < supabase/tests/social-follows.sql
-- RPC 用 set role authenticated + request.jwt.claim.sub 模拟调用人；断言前 reset role。
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
select set_config('test.carol', gen_random_uuid()::text, true);
select set_config('test.track', gen_random_uuid()::text, true);
select set_config('test.solo', gen_random_uuid()::text, true);

insert into auth.users(id,email,role,aud,is_anonymous) values
 (current_setting('test.alice')::uuid,'social-alice@example.test','authenticated','authenticated',false),
 (current_setting('test.bob')::uuid,'social-bob@example.test','authenticated','authenticated',false),
 (current_setting('test.carol')::uuid,'social-carol@example.test','authenticated','authenticated',false)
on conflict (id) do nothing;
insert into profiles(id,display_name,nick,username) values
 (current_setting('test.alice')::uuid,'阿丽','阿丽','social_alice_t'),
 (current_setting('test.bob')::uuid,'阿博','阿博','social_bob_t'),
 (current_setting('test.carol')::uuid,'卡萝','卡萝','social_carol_t')
on conflict (id) do update set display_name = excluded.display_name, nick = excluded.nick, username = excluded.username;

-- alice 的内容：一段挂轨迹的旅程（粉丝可见）、一条独立录制轨迹（公开）、一段只有自己可见的已完成旅程。
-- 轨迹沿经线走约 1.1 km，每点约 111 m。
insert into public.tracks (id, user_id, name, coords, dist_m, asc_m, duration_ms, started_at, visibility)
values
 (current_setting('test.track')::uuid, current_setting('test.alice')::uuid, '旅程轨迹',
  (select jsonb_agg(jsonb_build_array(100.0, 30.0 + g * 0.001)) from generate_series(0, 10) g),
  1110, 50, 3600000, now() - interval '2 days', 'private'),
 (current_setting('test.solo')::uuid, current_setting('test.alice')::uuid, '独立徒步',
  (select jsonb_agg(jsonb_build_array(101.0, 31.0 + g * 0.001)) from generate_series(0, 10) g),
  1110, 20, 1800000, now() - interval '1 day', 'public');
insert into public.journeys (id, user_id, name, region, lng, lat, tone, status, track_id, visibility, created_at)
values
 ('social-j-track', current_setting('test.alice')::uuid, '粉丝可见的旅程', '测试', 100, 30, 'calm', 'completed',
  current_setting('test.track')::uuid, 'followers', now() - interval '3 days'),
 ('social-j-private', current_setting('test.alice')::uuid, '自己的旅程', '测试', 100, 30, 'calm', 'completed',
  null, 'private', now() - interval '4 days');
insert into public.inspo_media (id, journey_id, user_id, uri, kind, moderation_status) values
 ('social-m-ok', 'social-j-track', current_setting('test.alice')::uuid, 'a.jpg', 'photo', 'approved'),
 ('social-m-pending', 'social-j-track', current_setting('test.alice')::uuid, 'b.jpg', 'photo', 'pending');

-- 裁剪：每端 200 m 去掉 2 个点（0 m、111 m），只剩中间段；太短的轨迹整条不给。
select pg_temp.check(jsonb_array_length(public.outing_preview_coords(
  (select coords from tracks where id = current_setting('test.track')::uuid), 200, 160)) = 7,
  'trim 200 m should keep the 7 middle points');
select pg_temp.check(public.outing_preview_coords(
  (select coords from tracks where id = current_setting('test.track')::uuid), 0, 160)
  = (select coords from tracks where id = current_setting('test.track')::uuid),
  'no trim and enough budget should return the full line');
select pg_temp.check(jsonb_array_length(public.outing_preview_coords(
  (select coords from tracks where id = current_setting('test.track')::uuid), 600, 160)) = 0,
  'a track shorter than both trims should return nothing');
select pg_temp.check(jsonb_array_length(public.outing_preview_coords(
  (select coords from tracks where id = current_setting('test.track')::uuid), 0, 4)) between 4 and 6,
  'downsampling should respect the point budget');

-- 本人：三条出行都在，坐标不裁剪，待审照片也能看到。
select pg_temp.as_user('test.alice');
select set_config('test.out', public.profile_outings(current_setting('test.alice')::uuid)::text, true);
reset role;
select pg_temp.check(jsonb_array_length(current_setting('test.out')::jsonb) = 3, 'owner should see all 3 outings');
select pg_temp.check((current_setting('test.out')::jsonb -> 0 ->> 'kind') = 'track', 'newest outing should be the standalone track');
select pg_temp.check((select (o ->> 'photoCount')::int from jsonb_array_elements(current_setting('test.out')::jsonb) o
  where o ->> 'id' = 'j:social-j-track') = 2, 'owner should count pending photos');
select pg_temp.check((select jsonb_array_length(o -> 'coords') from jsonb_array_elements(current_setting('test.out')::jsonb) o
  where o ->> 'id' = 'j:social-j-track') = 11, 'owner should get untrimmed coords');

-- bob 未关注：只看到公开的独立轨迹，且坐标被裁剪。
select pg_temp.as_user('test.bob');
select set_config('test.out', public.profile_outings(current_setting('test.alice')::uuid)::text, true);
reset role;
select pg_temp.check(jsonb_array_length(current_setting('test.out')::jsonb) = 1, 'stranger should only see the public outing');
select pg_temp.check(jsonb_array_length(current_setting('test.out')::jsonb -> 0 -> 'coords') = 7, 'stranger should get trimmed coords');
select pg_temp.check((current_setting('test.out')::jsonb -> 0 ->> 'endsHidden')::boolean, 'stranger view should flag hidden ends');
select pg_temp.as_user('test.bob');
select pg_temp.check((public.profile_summary(current_setting('test.alice')::uuid) ->> 'hiddenOutings')::int = 1,
  'stranger should be told about 1 followers-only outing');
reset role;

-- bob 关注 alice（公开账号直接通过），能看到粉丝可见的旅程，但待审照片不算。
select pg_temp.as_user('test.bob');
select pg_temp.check(public.follow_user(current_setting('test.alice')::uuid) = 'accepted', 'public account follow should be accepted');
select set_config('test.out', public.profile_outings(current_setting('test.alice')::uuid)::text, true);
select set_config('test.summary', public.profile_summary(current_setting('test.alice')::uuid)::text, true);
reset role;
select pg_temp.check(jsonb_array_length(current_setting('test.out')::jsonb) = 2, 'follower should see public + followers outings');
select pg_temp.check((select (o ->> 'photoCount')::int from jsonb_array_elements(current_setting('test.out')::jsonb) o
  where o ->> 'id' = 'j:social-j-track') = 1, 'follower should only count approved photos');
select pg_temp.check((current_setting('test.summary')::jsonb ->> 'followers')::int = 1, 'alice should have 1 follower');
select pg_temp.check((current_setting('test.summary')::jsonb -> 'relation' ->> 'following') = 'accepted', 'relation should show accepted');
select pg_temp.check((current_setting('test.summary')::jsonb ->> 'outings')::int = 2, 'summary should count visible outings');
select pg_temp.check(exists (select 1 from notifications where kind = 'follow'
  and user_id = current_setting('test.alice')::uuid and actor_user_id = current_setting('test.bob')::uuid),
  'follow should notify alice');

-- 私密账号：carol 关注 alice 变成待通过，期间连公开内容也看不到。
update profiles set is_private = true where id = current_setting('test.alice')::uuid;
select pg_temp.as_user('test.carol');
select pg_temp.check(public.follow_user(current_setting('test.alice')::uuid) = 'pending', 'private account follow should be pending');
select pg_temp.check(jsonb_array_length(public.profile_outings(current_setting('test.alice')::uuid)) = 0,
  'pending follower should see nothing on a private account');
select pg_temp.check((public.profile_summary(current_setting('test.alice')::uuid) ->> 'canView')::boolean = false,
  'pending follower should not be able to view');
select pg_temp.check(jsonb_array_length(public.profile_follow_list(current_setting('test.alice')::uuid, 'followers')) = 0,
  'pending follower should not see the follower list');
reset role;
select pg_temp.check(exists (select 1 from notifications where kind = 'follow_request'
  and user_id = current_setting('test.alice')::uuid and actor_user_id = current_setting('test.carol')::uuid),
  'follow request should notify alice');

select pg_temp.as_user('test.alice');
select pg_temp.check(jsonb_array_length(public.follow_requests()) = 1, 'alice should have 1 pending request');
select pg_temp.check((public.profile_summary(current_setting('test.carol')::uuid) -> 'relation' ->> 'requestedMe')::boolean,
  'alice should see that carol requested to follow her');
select public.respond_follow_request(current_setting('test.carol')::uuid, true);
select pg_temp.as_user('test.carol');
select pg_temp.check(jsonb_array_length(public.profile_outings(current_setting('test.alice')::uuid)) = 2,
  'accepted follower should see public + followers outings on a private account');
reset role;
select pg_temp.check(exists (select 1 from notifications where kind = 'follow_accepted'
  and user_id = current_setting('test.carol')::uuid), 'accepting should notify carol');

-- 别人不能直接写 follows。
select pg_temp.as_user('test.carol');
do $$ begin
  insert into public.follows (follower_id, followee_id) values
    (current_setting('test.carol')::uuid, current_setting('test.bob')::uuid);
  raise exception 'direct insert into follows should be rejected';
exception when insufficient_privilege then null;
end $$;
reset role;

-- 拉黑：alice 拉黑 bob，双方关注解除，bob 拿不到 alice 的主页，也搜不到她。
select pg_temp.as_user('test.alice');
select public.block_user(current_setting('test.bob')::uuid);
select pg_temp.as_user('test.bob');
select pg_temp.check(public.profile_summary(current_setting('test.alice')::uuid) is null, 'blocked user should get no summary');
select pg_temp.check(jsonb_array_length(public.search_profiles('social_alice')) = 0, 'blocked user should not find alice');
do $$ begin
  perform public.follow_user(current_setting('test.alice')::uuid);
  raise exception 'blocked user should not be able to follow';
exception when raise_exception then
  if sqlerrm <> 'blocked' then raise; end if;
end $$;
reset role;
select pg_temp.check(not exists (select 1 from follows where follower_id = current_setting('test.bob')::uuid
  and followee_id = current_setting('test.alice')::uuid), 'block should remove the follow');

-- 关掉私密：待处理的请求自动通过。
select pg_temp.as_user('test.bob');
select public.unblock_user(current_setting('test.alice')::uuid); -- 不是 bob 拉黑的，无效果
reset role;
select pg_temp.as_user('test.alice');
select public.unblock_user(current_setting('test.bob')::uuid);
reset role;
select pg_temp.as_user('test.bob');
select pg_temp.check(public.follow_user(current_setting('test.alice')::uuid) = 'pending', 'still private, should be pending');
select pg_temp.as_user('test.alice');
select public.set_account_private(false);
reset role;
select pg_temp.check((select status from follows where follower_id = current_setting('test.bob')::uuid
  and followee_id = current_setting('test.alice')::uuid) = 'accepted', 'going public should accept pending requests');

-- 搜索与列表。
select pg_temp.as_user('test.carol');
select pg_temp.check(jsonb_array_length(public.search_profiles('social_alice')) = 1, 'search by username prefix');
select pg_temp.check(not exists (select 1 from jsonb_array_elements(public.search_profiles('%')) x
  where x ->> 'id' = current_setting('test.alice')), 'percent should be matched literally');
select pg_temp.check(jsonb_array_length(public.profile_follow_list(current_setting('test.alice')::uuid, 'followers')) = 2,
  'alice should list 2 followers');
reset role;
select set_config('request.jwt.claim.sub', '', true);

do $$ begin
  perform public.follow_user(current_setting('test.alice')::uuid);
  raise exception 'anonymous follow should fail';
exception when raise_exception then
  if sqlerrm <> 'not authenticated' then raise; end if;
end $$;

rollback;
