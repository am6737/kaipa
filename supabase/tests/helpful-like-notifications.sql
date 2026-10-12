-- 点赞通知的回归测试：psql 以 postgres 运行，数据在事务内回滚。
-- docker exec -i kaipa-supabase-db psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres < supabase/tests/helpful-like-notifications.sql
-- notifications 有属主可见的 RLS，所以每次调用完 RPC 都要 reset role 回 postgres，
-- 否则下面的 exists 断言会被策略挡住而变成假阴性。
begin;

create function pg_temp.check(ok boolean, message text) returns void
language plpgsql as $$ begin
  if ok is distinct from true then raise exception '%', message; end if;
end $$;

select set_config('test.like_author', gen_random_uuid()::text, true);
select set_config('test.like_voter', gen_random_uuid()::text, true);
select set_config('test.observation', gen_random_uuid()::text, true);
select set_config('test.guide', gen_random_uuid()::text, true);

insert into auth.users(id,email,role,aud,is_anonymous) values
 (current_setting('test.like_author')::uuid,'like-author@example.test','authenticated','authenticated',false),
 (current_setting('test.like_voter')::uuid,'like-voter@example.test','authenticated','authenticated',false)
on conflict (id) do nothing;
insert into profiles(id,display_name) values
 (current_setting('test.like_author')::uuid,'路过的作者'),
 (current_setting('test.like_voter')::uuid,'点赞的路人')
-- handle_new_user 触发器已经按邮箱前缀建好档案，这里必须覆盖才能断言 who。
on conflict (id) do update set display_name = excluded.display_name;
insert into public.routes (id, name, region, lng, lat, tone)
values ('like-notify-route', '测试路线', '测试', 0, 0, 'calm') on conflict (id) do nothing;

insert into public.route_observations (id, route_id, user_id, body, moderation_status)
values (current_setting('test.observation')::uuid, 'like-notify-route',
        current_setting('test.like_author')::uuid, '山顶有雪', 'approved')
on conflict (id) do nothing;

insert into public.route_guides (id, route_id, author_id, title, plan, status)
values (current_setting('test.guide')::uuid, 'like-notify-route',
        current_setting('test.like_author')::uuid, '测试路书', '[]'::jsonb, 'approved')
on conflict (id) do nothing;

-- 作者给自己的内容点赞：不产生任何通知。
select set_config('request.jwt.claim.sub', current_setting('test.like_author'), true);
set local role authenticated;
select pg_temp.check(public.route_observation_helpful(current_setting('test.observation')::uuid),
  'Self-vote on observation was rejected');
select pg_temp.check(public.route_guide_helpful(current_setting('test.guide')::uuid),
  'Self-vote on guide was rejected');
reset role;
select pg_temp.check((select count(*) = 0 from public.notifications
  where kind in ('observation_like', 'guide_like')),
  'Self-vote notified its author');

-- 别人点赞：通知作者，带触发者 id 供前端取实时头像。
select set_config('request.jwt.claim.sub', current_setting('test.like_voter'), true);
set local role authenticated;
select pg_temp.check(public.route_observation_helpful(current_setting('test.observation')::uuid),
  'Other account vote on observation was rejected');
select pg_temp.check(public.route_guide_helpful(current_setting('test.guide')::uuid),
  'Other account vote on guide was rejected');
reset role;
select pg_temp.check(exists (select 1 from public.notifications n
  where n.kind = 'observation_like' and n.cat = 'social'
    and n.user_id = current_setting('test.like_author')::uuid
    and n.actor_user_id = current_setting('test.like_voter')::uuid
    and n.who = '点赞的路人' and n.target = '测试路线'
    and n.target_id = 'like-notify-route' and n.read = false),
  'Observation like did not notify the author');
select pg_temp.check(exists (select 1 from public.notifications n
  where n.kind = 'guide_like' and n.cat = 'social'
    and n.user_id = current_setting('test.like_author')::uuid
    and n.actor_user_id = current_setting('test.like_voter')::uuid
    and n.who = '点赞的路人'
    and n.target = '测试路书' and n.target_id = 'like-notify-route'),
  'Guide like did not notify the author');

-- 取消再点赞：24 小时内同一人不重复提醒。
set local role authenticated;
select pg_temp.check(not public.route_observation_helpful(current_setting('test.observation')::uuid),
  'Second click did not remove the observation vote');
select pg_temp.check(public.route_observation_helpful(current_setting('test.observation')::uuid),
  'Third click did not restore the observation vote');
reset role;
select pg_temp.check((select count(*) = 1 from public.notifications n
  where n.kind = 'observation_like' and n.actor_user_id = current_setting('test.like_voter')::uuid),
  'Re-liking sent a duplicate notification');

-- 计数与投票行一致：作者自赞 + 路人一票。
select pg_temp.check((select helpful_count = 2 from public.route_observations
  where id = current_setting('test.observation')::uuid),
  'Observation helpful count drifted');
select pg_temp.check((select helpful_count = (select count(*) from public.route_observation_helpful_votes
  where observation_id = current_setting('test.observation')::uuid)
  from public.route_observations where id = current_setting('test.observation')::uuid),
  'Observation count no longer matches its votes');
select pg_temp.check((select helpful_count = 2 from public.route_guides
  where id = current_setting('test.guide')::uuid),
  'Guide helpful count drifted');

rollback;
