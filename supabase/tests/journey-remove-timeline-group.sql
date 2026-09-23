-- Run as postgres on the self-hosted database; fixtures are always rolled back.
-- Covers journey_remove_timeline_group(): a day's rows and its group change in
-- one transaction, an empty day still records its group, and RLS decides whose
-- rows go.
begin;

create function pg_temp.check(ok boolean, message text) returns void language plpgsql as $$ begin
  if ok is distinct from true then raise exception '%', message; end if;
end $$;

select set_config('test.owner', (select id::text from public.profiles order by id limit 1), true);
select set_config('test.stranger', (select id::text from public.profiles order by id offset 1 limit 1), true);
select pg_temp.check(nullif(current_setting('test.stranger'), '') is not null, 'Requires two existing profiles');
select set_config('test.journey', 'remove-group-test-' || gen_random_uuid()::text, true);
select set_config('request.jwt.claim.sub', current_setting('test.owner'), true);

insert into public.journeys(id, user_id, name, region, lng, lat, tone)
values(current_setting('test.journey'), auth.uid(), 'Remove group test', 'Test', 110, 25, 'forest');

select public.journey_save_timeline_item('rg-day1-a', current_setting('test.journey'), true, '{"title":"a","day":"Day 1"}'::jsonb);
select public.journey_save_timeline_item('rg-day1-b', current_setting('test.journey'), true, '{"title":"b","day":"Day 1"}'::jsonb);
select public.journey_save_timeline_item('rg-day2', current_setting('test.journey'), true, '{"title":"c","day":"Day 2"}'::jsonb);

set local role authenticated;

-- 1. Deleting a day takes its rows and marks its group deleted, and touches no other day.
select public.journey_remove_timeline_group(current_setting('test.journey'), 'Day 1');
select pg_temp.check((select count(*) = 0 from public.timeline_rows
  where journey_id = current_setting('test.journey') and day = 'Day 1'), 'Deleting a day left its rows behind');
select pg_temp.check((select deleted from public.timeline_groups
  where journey_id = current_setting('test.journey') and name = 'Day 1'), 'Deleting a day did not mark its group deleted');
select pg_temp.check((select count(*) = 1 from public.timeline_rows
  where journey_id = current_setting('test.journey') and day = 'Day 2'), 'Deleting a day took another day with it');
select pg_temp.check((select deleted is false from public.timeline_groups
  where journey_id = current_setting('test.journey') and name = 'Day 2'), 'Deleting a day closed another day group');

-- 2. A day that holds no items still records its group, so an older group row
--    cannot bring the day back.
select public.journey_remove_timeline_group(current_setting('test.journey'), 'Day 9');
select pg_temp.check((select deleted from public.timeline_groups
  where journey_id = current_setting('test.journey') and name = 'Day 9'), 'Deleting an empty day did not record its group as deleted');

-- 3. A blank name is refused rather than matching every untitled row of the journey.
do $$
begin
  perform public.journey_remove_timeline_group(current_setting('test.journey'), '   ');
  raise exception 'A blank day name was accepted';
exception when invalid_parameter_value then
  null; -- 22023
end $$;

-- 4. A stranger's delete is refused outright and changes nothing. The group
--    upsert meets the owner's row through RLS, which refuses the write (42501);
--    because the whole call is one transaction, the stranger's own rows on that
--    day go back too rather than being deleted on the way to an error.
select set_config('request.jwt.claim.sub', current_setting('test.stranger'), true);
do $$
begin
  perform public.journey_remove_timeline_group(current_setting('test.journey'), 'Day 2');
  raise exception 'A stranger removed another user''s day';
exception when insufficient_privilege then
  null; -- 42501 from the group upsert
end $$;
select set_config('request.jwt.claim.sub', current_setting('test.owner'), true);
select pg_temp.check((select count(*) = 1 from public.timeline_rows
  where journey_id = current_setting('test.journey') and day = 'Day 2'), 'A stranger deleted another user''s day');
select pg_temp.check((select deleted is false from public.timeline_groups
  where journey_id = current_setting('test.journey') and name = 'Day 2'), 'A stranger closed another user''s day group');

rollback;
