-- Self-hosted database integration test; all fixtures roll back.
begin;
create function pg_temp.check(ok boolean, message text) returns void language plpgsql as $$ begin
  if ok is distinct from true then raise exception '%', message; end if;
end $$;
select set_config('test.owner', (select id::text from public.profiles order by id limit 1), true);
select set_config('test.member', (select id::text from public.profiles order by id offset 1 limit 1), true);
select pg_temp.check(nullif(current_setting('test.member'), '') is not null, 'Requires two profiles');
select set_config('test.journey', 'reorder-test-' || gen_random_uuid()::text, true);
select set_config('request.jwt.claim.sub', current_setting('test.owner'), true);
insert into public.journeys(id, user_id, name, region, lng, lat, tone)
values(current_setting('test.journey'), auth.uid(), 'Reorder test', 'Test', 110, 25, 'forest');
insert into public.companions(journey_id, user_id, ini, name, color)
values(current_setting('test.journey'), current_setting('test.member')::uuid, 'T', 'Test member', '#808080');
insert into public.timeline_rows(id, journey_id, user_id, title, day, sort_order, time_mins)
values ('reorder-a', current_setting('test.journey'), auth.uid(), 'A', 'Day 1', 0, 480),
       ('reorder-b', current_setting('test.journey'), auth.uid(), 'B', 'Day 1', 1, 1080),
       ('reorder-c', current_setting('test.journey'), auth.uid(), 'C', 'Day 2', 7, null),
       ('reorder-p1', current_setting('test.journey'), auth.uid(), 'Pending 1', '', 8, null),
       ('reorder-p2', current_setting('test.journey'), auth.uid(), 'Pending 2', '', 9, null);
set local role authenticated;
select pg_temp.check(jsonb_array_length(public.journey_reorder_timeline_items(current_setting('test.journey'), 'Day 1', array['reorder-b','reorder-a'])) = 2, 'Missing saved rows');
select pg_temp.check((select array_agg(id order by sort_order) = array['reorder-b','reorder-a'] from public.timeline_rows where journey_id = current_setting('test.journey') and day = 'Day 1'), 'Order did not persist');
select pg_temp.check((select sort_order = 7 from public.timeline_rows where id = 'reorder-c'), 'Another day changed');
select pg_temp.check((select time_mins = 480 and title = 'A' from public.timeline_rows where id = 'reorder-a'), 'Reorder changed item content');
select public.journey_reorder_timeline_items(current_setting('test.journey'), '', array['reorder-p2','reorder-p1']);
select pg_temp.check((select sort_order = 0 from public.timeline_rows where id = 'reorder-p2'), 'Pending reorder failed');
do $$ begin
  begin
    perform public.journey_reorder_timeline_items(current_setting('test.journey'), 'Day 1', array['reorder-a']);
    raise exception 'Stale subset accepted';
  exception when invalid_parameter_value then null; end;
  begin
    perform public.journey_reorder_timeline_items(current_setting('test.journey'), 'Day 1', array['reorder-a','reorder-a']);
    raise exception 'Duplicate accepted';
  exception when invalid_parameter_value then null; end;
  begin
    perform public.journey_reorder_timeline_items(current_setting('test.journey'), 'Day 1', array['reorder-a','reorder-c']);
    raise exception 'Cross-day id accepted';
  exception when invalid_parameter_value then null; end;
  begin
    perform public.journey_reorder_timeline_items(current_setting('test.journey'), 'Day 1', array['reorder-a','missing']);
    raise exception 'Unknown id accepted';
  exception when invalid_parameter_value then null; end;
end $$;
select pg_temp.check((select sort_order = 0 from public.timeline_rows where id = 'reorder-b'), 'Rejected reorder partially wrote');
select set_config('request.jwt.claim.sub', current_setting('test.member'), true);
do $$ begin
  begin
    perform public.journey_reorder_timeline_items(current_setting('test.journey'), 'Day 1', array['reorder-a','reorder-b']);
    raise exception 'Read-only member reordered owner items';
  exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claim.sub', current_setting('test.owner'), true);
select pg_temp.check((select sort_order = 0 from public.timeline_rows where id = 'reorder-b'), 'Member reorder changed the list');
rollback;
