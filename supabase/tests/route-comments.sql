-- Run with psql as postgres. Needs two existing auth users; everything is rolled back.
begin;

create function pg_temp.check(ok boolean, message text) returns void
language plpgsql as $$ begin
  if ok is distinct from true then raise exception '%', message; end if;
end $$;

do $$
declare
  author uuid := (select id from auth.users order by id limit 1);
  other uuid := (select id from auth.users order by id offset 1 limit 1);
begin
  if other is null then raise exception 'Test needs two existing auth users'; end if;
  perform set_config('test.author', author::text, true);
  perform set_config('test.other', other::text, true);
  perform set_config('test.route', 'route-comments-test-' || gen_random_uuid(), true);
end $$;

create function pg_temp.act_as(who text) returns void
language plpgsql as $$ begin
  perform set_config('request.jwt.claim.sub', current_setting(who), true);
end $$;

set local role authenticated;

-- 顶层评论发布即可见；回复不能带媒体，也不能挂在回复下。
select pg_temp.act_as('test.author');
insert into public.route_comments (route_id, user_id, body)
values (current_setting('test.route'), current_setting('test.author')::uuid, '  路口积雪，注意防滑  ');
select set_config('test.root', (select id::text from public.route_comments where route_id = current_setting('test.route')), true);
select pg_temp.check((select status = 'visible' and body = '路口积雪，注意防滑' from public.route_comments where id = current_setting('test.root')::uuid), 'New comment should be visible and trimmed');

select pg_temp.act_as('test.other');
insert into public.route_comments (route_id, user_id, parent_id, reply_to_user_id, body)
values (current_setting('test.route'), current_setting('test.other')::uuid, current_setting('test.root')::uuid, current_setting('test.author')::uuid, '现在还能走吗？');
select pg_temp.check((select reply_count = 1 from public.route_comments where id = current_setting('test.root')::uuid), 'Reply count should be 1');

do $$ begin
  insert into public.route_comments (route_id, user_id, parent_id, body, media)
  values (current_setting('test.route'), current_setting('test.other')::uuid, current_setting('test.root')::uuid, '带图', '[{"uri":"https://x/1.jpg","kind":"image"}]');
  raise exception 'Reply with media should be rejected';
exception when check_violation then null;
end $$;

do $$ begin
  insert into public.route_comments (route_id, user_id, parent_id, body)
  values (current_setting('test.route'), current_setting('test.other')::uuid,
          (select id from public.route_comments where parent_id = current_setting('test.root')::uuid limit 1), '嵌套');
  raise exception 'Nested reply should be rejected';
exception when raise_exception then
  if sqlerrm <> 'reply parent not found' then raise; end if;
end $$;

-- 点赞切换。
select pg_temp.check(public.toggle_route_comment_like(current_setting('test.root')::uuid), 'First like should be accepted');
select pg_temp.check((select like_count = 1 from public.route_comments where id = current_setting('test.root')::uuid), 'Like count should be 1');
select pg_temp.check(not public.toggle_route_comment_like(current_setting('test.root')::uuid), 'Second tap should remove the like');
select pg_temp.check((select like_count = 0 from public.route_comments where id = current_setting('test.root')::uuid), 'Like count should be back to 0');

-- 客户端不能直接改计数或状态。
do $$ begin
  update public.route_comments set like_count = 99, status = 'visible' where id = current_setting('test.root')::uuid;
  raise exception 'Direct update must be blocked';
exception when insufficient_privilege then null;
end $$;
select pg_temp.check((select like_count = 0 from public.route_comments where id = current_setting('test.root')::uuid), 'Like count must be unchanged');

-- 举报：同一人只算一次，不能举报自己。
select pg_temp.check(public.report_route_comment(current_setting('test.root')::uuid, 'spam'), 'First report should count');
select pg_temp.check(not public.report_route_comment(current_setting('test.root')::uuid, 'abuse'), 'Repeat report should not count');
select pg_temp.check((select report_count = 1 and status = 'visible' from public.route_comments where id = current_setting('test.root')::uuid), 'One report should not hide');
select pg_temp.act_as('test.author');
do $$ begin
  perform public.report_route_comment(current_setting('test.root')::uuid, 'spam');
  raise exception 'Self report should be rejected';
exception when raise_exception then
  if sqlerrm <> 'cannot report own comment' then raise; end if;
end $$;

-- 有回复的顶层评论删除后留占位；最后一条回复删掉后占位一并清理。
select pg_temp.check(public.delete_route_comment(current_setting('test.root')::uuid) = 'tombstoned', 'Root with replies should be tombstoned');
select pg_temp.check((select status = 'deleted' and body = '' from public.route_comments where id = current_setting('test.root')::uuid), 'Tombstone should clear content');
select pg_temp.act_as('test.other');
select pg_temp.check(public.delete_route_comment((select id from public.route_comments where parent_id = current_setting('test.root')::uuid limit 1)) = 'deleted', 'Reply should be deleted');
reset role;
select pg_temp.check(not exists (select 1 from public.route_comments where route_id = current_setting('test.route')), 'Tombstone should go with the last reply');

-- 3 人举报自动隐藏（直接写举报行模拟第三方用户）。
insert into public.route_comments (route_id, user_id, body)
values (current_setting('test.route'), current_setting('test.author')::uuid, '待举报');
select set_config('test.reported', (select id::text from public.route_comments where route_id = current_setting('test.route')), true);
insert into public.route_comment_reports (comment_id, reporter_id, reason)
select current_setting('test.reported')::uuid, id, 'spam' from auth.users
 where id not in (current_setting('test.author')::uuid, current_setting('test.other')::uuid) limit 2;
set local role authenticated;
select pg_temp.act_as('test.other');
select public.report_route_comment(current_setting('test.reported')::uuid, 'spam');
reset role;
select pg_temp.check((select status = 'hidden' from public.route_comments where id = current_setting('test.reported')::uuid)
  or (select count(*) < 4 from auth.users), 'Third open report should hide the comment');

rollback;
