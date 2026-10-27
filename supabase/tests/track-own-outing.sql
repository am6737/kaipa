-- 导入以前的轨迹回归测试：psql 以 postgres 运行，数据在事务内回滚。
-- docker exec -i kaipa-supabase-db psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres < supabase/tests/track-own-outing.sql
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

-- 按标题找时间线里的一条，没有就是 null。
create function pg_temp.outing(p_user text, p_title text) returns jsonb
language sql as $$
  select o from jsonb_array_elements(public.profile_outings(current_setting(p_user)::uuid)) o
   where o->>'title' = p_title
$$;

select set_config('test.alice', gen_random_uuid()::text, true);
select set_config('test.bob', gen_random_uuid()::text, true);

insert into auth.users(id,email,role,aud,is_anonymous) values
 (current_setting('test.alice')::uuid,'outing-alice@example.test','authenticated','authenticated',false),
 (current_setting('test.bob')::uuid,'outing-bob@example.test','authenticated','authenticated',false)
on conflict (id) do nothing;
insert into profiles(id,display_name,nick,username) values
 (current_setting('test.alice')::uuid,'阿丽','阿丽测试','outing_alice_t'),
 (current_setting('test.bob')::uuid,'阿博','阿博测试','outing_bob_t')
on conflict (id) do update set display_name = excluded.display_name, nick = excluded.nick, username = excluded.username;

-- 本人走客户端同样的路径写入：authenticated + RLS。
select pg_temp.as_user('test.alice');
insert into public.tracks (user_id, name, file_format, dist_m, started_at)
values (current_setting('test.alice')::uuid, '测试录制', null, 5000, '2026-10-01T08:00:00Z');
insert into public.tracks (user_id, name, file_format, dist_m, started_at)
values (current_setting('test.alice')::uuid, '测试路线文件', 'gpx', 12000, '2021-05-01T08:00:00Z');
insert into public.tracks (user_id, name, file_format, dist_m, started_at, own_outing, visibility, coords)
values (current_setting('test.alice')::uuid, '测试鳌太线', 'gpx', 78600, '2023-05-02T00:30:00Z', true, 'public',
        (select jsonb_agg(jsonb_build_array(107.5 + g * 0.001, 33.9)) from generate_series(0, 50) g));

-- 自己的时间线：录制的照旧，路线文件不进，标记过的导入文件进且带 imported。
select pg_temp.check(pg_temp.outing('test.alice', '测试录制') is not null, 'recorded track missing');
select pg_temp.check((pg_temp.outing('test.alice', '测试录制')->>'imported')::boolean = false, 'recorded track marked imported');
select pg_temp.check(pg_temp.outing('test.alice', '测试路线文件') is null, 'route file on timeline');
select pg_temp.check(pg_temp.outing('test.alice', '测试鳌太线') is not null, 'own imported track missing');
select pg_temp.check((pg_temp.outing('test.alice', '测试鳌太线')->>'imported')::boolean, 'own imported track not marked');
select pg_temp.check(pg_temp.outing('test.alice', '测试鳌太线')->>'occurredAt' like '2023-05-02%', 'imported track not dated by its start');

-- 给「我的轨迹」里已有的文件补标记，它就进时间线（导入时遇到重复走的路径）。
update public.tracks set own_outing = true where name = '测试路线文件' and user_id = current_setting('test.alice')::uuid;
select pg_temp.check(pg_temp.outing('test.alice', '测试路线文件') is not null, 'marking an existing file does not add it');

-- 别人看：公开的导入条目可见并带标签，起终点裁剪照旧；仅自己的看不到。
select pg_temp.as_user('test.bob');
select pg_temp.check(pg_temp.outing('test.alice', '测试鳌太线') is not null, 'public imported track hidden from others');
select pg_temp.check((pg_temp.outing('test.alice', '测试鳌太线')->>'imported')::boolean, 'imported tag hidden from others');
select pg_temp.check((pg_temp.outing('test.alice', '测试鳌太线')->>'endsHidden')::boolean, 'ends not hidden for others');
select pg_temp.check(pg_temp.outing('test.alice', '测试录制') is null, 'private recorded track visible to others');
select pg_temp.check((public.profile_summary(current_setting('test.alice')::uuid)->>'outings')::int = 1, 'summary count wrong for others');

-- 别人不能替作者打标记。
update public.tracks set own_outing = true where user_id = current_setting('test.alice')::uuid;
reset role;
select pg_temp.check(
  (select count(*) from public.tracks where user_id = current_setting('test.alice')::uuid and own_outing) = 2,
  'non-owner changed own_outing');

select 'track-own-outing ok';
rollback;
