-- Run as postgres on the self-hosted database; fixtures are always rolled back.
-- Covers journey_rename_timeline_group(): a day's rows, both group rows and its
-- place on the route move in one transaction, a merge keeps the route only when
-- the day being renamed had one, and RLS decides who may rename.
begin;

create function pg_temp.check(ok boolean, message text) returns void language plpgsql as $$ begin
  if ok is distinct from true then raise exception '%', message; end if;
end $$;

select set_config('test.owner', (select id::text from public.profiles order by id limit 1), true);
select set_config('test.stranger', (select id::text from public.profiles order by id offset 1 limit 1), true);
select pg_temp.check(nullif(current_setting('test.stranger'), '') is not null, 'Requires two existing profiles');
select set_config('test.journey', 'rename-group-test-' || gen_random_uuid()::text, true);
select set_config('request.jwt.claim.sub', current_setting('test.owner'), true);

insert into public.journeys(id, user_id, name, region, lng, lat, tone)
values(current_setting('test.journey'), auth.uid(), 'Rename group test', 'Test', 110, 25, 'forest');

-- Day A carries a route end, Day B does not, Day C has its own (2000).
select public.journey_save_timeline_item('rn-a1', current_setting('test.journey'), true, '{"title":"a1","day":"Day A"}'::jsonb);
select public.journey_save_timeline_item('rn-a2', current_setting('test.journey'), true, '{"title":"a2","day":"Day A"}'::jsonb);
select public.journey_save_timeline_item('rn-b1', current_setting('test.journey'), true, '{"title":"b1","day":"Day B"}'::jsonb);
select public.journey_save_timeline_item('rn-c1', current_setting('test.journey'), true, '{"title":"c1","day":"Day C"}'::jsonb);
update public.timeline_groups set route_end_meters = 1000, route_end_lng = 110.1, route_end_lat = 24.9,
  route_end_source = 'map', route_location_name = 'A end'
 where journey_id = current_setting('test.journey') and name = 'Day A';
update public.timeline_groups set route_end_meters = 2000, route_end_lng = 110.2, route_end_lat = 24.8,
  route_end_source = 'map', route_location_name = 'C end'
 where journey_id = current_setting('test.journey') and name = 'Day C';

set local role authenticated;

-- 1. Renaming moves the day's items, retires the old name and opens the new one,
--    and the day keeps its place on the route.
select public.journey_rename_timeline_group(current_setting('test.journey'), 'Day A', 'Day A2');
select pg_temp.check((select count(*) = 2 from public.timeline_rows
  where journey_id = current_setting('test.journey') and day = 'Day A2'), 'Renaming a day did not move its items');
select pg_temp.check((select count(*) = 0 from public.timeline_rows
  where journey_id = current_setting('test.journey') and day = 'Day A'), 'Renaming a day left items under the old name');
select pg_temp.check((select not deleted and route_end_meters = 1000 and route_location_name = 'A end'
  from public.timeline_groups where journey_id = current_setting('test.journey') and name = 'Day A2'),
  'The renamed day did not take over the route end');
select pg_temp.check((select deleted from public.timeline_groups
  where journey_id = current_setting('test.journey') and name = 'Day A'), 'The old name was left open');
select pg_temp.check((select not deleted and route_end_meters = 2000 from public.timeline_groups
  where journey_id = current_setting('test.journey') and name = 'Day C'), 'Renaming a day disturbed another day');

-- 2. Renaming a day that has no route end onto one that has keeps the target's
--    route: a day with nothing to hand over must not wipe it.
select public.journey_rename_timeline_group(current_setting('test.journey'), 'Day B', 'Day C');
select pg_temp.check((select count(*) = 2 from public.timeline_rows
  where journey_id = current_setting('test.journey') and day = 'Day C'), 'Merging a day did not move its items');
select pg_temp.check((select not deleted and route_end_meters = 2000 and route_location_name = 'C end'
  from public.timeline_groups where journey_id = current_setting('test.journey') and name = 'Day C'),
  'A day without a route end wiped the route of the day it merged into');

-- 3. The other way round: a day that does have a route end hands it over.
select public.journey_rename_timeline_group(current_setting('test.journey'), 'Day A2', 'Day C');
select pg_temp.check((select route_end_meters = 1000 and route_location_name = 'A end'
  from public.timeline_groups where journey_id = current_setting('test.journey') and name = 'Day C'),
  'A day with a route end did not hand it to the day it merged into');

-- 4. Names are checked before they can match every untitled row.
do $$
begin
  perform public.journey_rename_timeline_group(current_setting('test.journey'), 'Day C', '   ');
  raise exception 'A blank target name was accepted';
exception when invalid_parameter_value then
  null; -- 22023
end $$;

-- 5. A stranger cannot rename: the group rows are owner-scoped, so the whole call
--    is refused and the day is left as it was.
select set_config('request.jwt.claim.sub', current_setting('test.stranger'), true);
do $$
begin
  perform public.journey_rename_timeline_group(current_setting('test.journey'), 'Day C', 'Day Z');
  raise exception 'A stranger renamed another user''s day';
exception when insufficient_privilege then
  null; -- 42501 from the group upsert
end $$;
select set_config('request.jwt.claim.sub', current_setting('test.owner'), true);
select pg_temp.check((select count(*) = 4 from public.timeline_rows
  where journey_id = current_setting('test.journey') and day = 'Day C'), 'A stranger moved another user''s items');
select pg_temp.check((select not exists (select 1 from public.timeline_groups
  where journey_id = current_setting('test.journey') and name = 'Day Z')), 'A stranger opened a day group');

rollback;
