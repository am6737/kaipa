-- Run as postgres on the self-hosted database; fixtures are always rolled back.
-- Covers journey_save_timeline_item(): the key-presence contract the app relies on
-- (an itinerary item may carry text, a place and photos as any combination) and
-- that RLS still decides who may write.
begin;

create function pg_temp.check(ok boolean, message text) returns void language plpgsql as $$ begin
  if ok is distinct from true then raise exception '%', message; end if;
end $$;

select set_config('test.owner', (select id::text from public.profiles order by id limit 1), true);
select set_config('test.stranger', (select id::text from public.profiles order by id offset 1 limit 1), true);
select pg_temp.check(nullif(current_setting('test.stranger'), '') is not null, 'Requires two existing profiles');
select set_config('test.journey', 'save-item-test-' || gen_random_uuid()::text, true);
select set_config('request.jwt.claim.sub', current_setting('test.owner'), true);

insert into public.journeys(id, user_id, name, region, lng, lat, tone)
values(current_setting('test.journey'), auth.uid(), 'Save item test', 'Test', 110, 25, 'forest');

-- 1. A place with no text and no photos is a complete item.
select public.journey_save_timeline_item('si-place', current_setting('test.journey'), true,
  '{"title":"","day":"Day 1","kind":"activity","media":null,"timeStart":null,"timeEnd":null,
    "location":{"name":"Yangdi","source":"map","longitude":110.19,"latitude":24.94}}'::jsonb);
select pg_temp.check((select title = '' and jsonb_typeof(location) = 'object' and coalesce(jsonb_typeof(media), 'null') = 'null'
  and is_custom and item_kind = 'activity' from public.timeline_rows where id = 'si-place'), 'Location-only item is not saved as a manual activity');
select pg_temp.check((select deleted is false from public.timeline_groups
  where journey_id = current_setting('test.journey') and name = 'Day 1'), 'Saving an item does not open its day group');

-- 2. A patch names only what it changes; every other column keeps its value.
select public.journey_save_timeline_item('si-place', current_setting('test.journey'), false, '{"media":[{"uri":"https://x.invalid/a.jpg"}]}'::jsonb);
select pg_temp.check((select jsonb_array_length(media) = 1 and title = '' and jsonb_typeof(location) = 'object'
  from public.timeline_rows where id = 'si-place'), 'Media patch disturbs other columns');

-- 3. Clearing media and clearing the place store SQL NULL / an empty array, not jsonb 'null'.
select public.journey_save_timeline_item('si-place', current_setting('test.journey'), false, '{"media":[],"location":null}'::jsonb);
select pg_temp.check((select jsonb_array_length(media) = 0 and location is null
  from public.timeline_rows where id = 'si-place'), 'Clearing media or the place leaves a jsonb null behind');

-- 4. Moving an item to a new day opens that group, and times round-trip.
select public.journey_save_timeline_item('si-place', current_setting('test.journey'), false, '{"day":"Day 4","timeStart":450,"timeEnd":540}'::jsonb);
select pg_temp.check((select day = 'Day 4' and time_mins = 450 and time_end_mins = 540 from public.timeline_rows where id = 'si-place'), 'Day or time patch does not persist');
select pg_temp.check((select exists(select 1 from public.timeline_groups
  where journey_id = current_setting('test.journey') and name = 'Day 4')), 'Day patch does not open its group');
select public.journey_save_timeline_item('si-place', current_setting('test.journey'), false, '{"timeStart":null,"timeEnd":null}'::jsonb);
select pg_temp.check((select time_mins is null and time_end_mins is null and day = 'Day 4'
  from public.timeline_rows where id = 'si-place'), 'Clearing the time does not stick');

-- 5. Only the owner may write.
set local role authenticated;
select set_config('request.jwt.claim.sub', current_setting('test.stranger'), true);
do $$
begin
  perform public.journey_save_timeline_item('si-place', current_setting('test.journey'), false, '{"title":"taken over"}'::jsonb);
  raise exception 'A stranger wrote another user itinerary item';
exception when insufficient_privilege then
  null; -- journey_save_timeline_item raises 42501 when RLS matches no row
end $$;
select pg_temp.check((select count(*) = 0 from public.timeline_rows where id = 'si-place'),
  'A stranger can read another user itinerary item');
select set_config('request.jwt.claim.sub', current_setting('test.owner'), true);
select pg_temp.check((select title = '' from public.timeline_rows where id = 'si-place'), 'Stranger write changed the row anyway');

rollback;
