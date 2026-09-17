-- Run as postgres on the self-hosted database; fixtures are always rolled back.
begin;
create function pg_temp.check(ok boolean, message text) returns void language plpgsql as $$ begin
  if ok is distinct from true then raise exception '%', message; end if;
end $$;

select set_config('test.owner', (select id::text from public.profiles order by id limit 1), true);
select set_config('test.member', (select id::text from public.profiles order by id offset 1 limit 1), true);
select pg_temp.check(nullif(current_setting('test.member'), '') is not null, 'Requires two existing profiles');
select set_config('test.journey', 'member-read-test-' || gen_random_uuid()::text, true);
select set_config('request.jwt.claim.sub', current_setting('test.owner'), true);

insert into public.journeys(id, user_id, name, region, lng, lat, tone)
values(current_setting('test.journey'), auth.uid(), 'Member read test', 'Test', 110, 25, 'forest');
insert into public.companions(journey_id, user_id, ini, name, color)
values(current_setting('test.journey'), current_setting('test.member')::uuid, 'T', 'Test member', '#808080');
insert into public.timeline_rows(id, journey_id, user_id, title, day)
values(current_setting('test.journey'), current_setting('test.journey'), auth.uid(), 'Saved itinerary', 'Day 1');
insert into public.timeline_groups(journey_id, user_id, name, route_end_meters)
values(current_setting('test.journey'), auth.uid(), 'Day 1', 1000);

set local role authenticated;
select pg_temp.check((select count(*) = 1 from public.timeline_rows where journey_id = current_setting('test.journey')), 'Owner cannot read itinerary');
select pg_temp.check((select count(*) = 1 from public.timeline_groups where journey_id = current_setting('test.journey')), 'Owner cannot read groups');
select set_config('request.jwt.claim.sub', current_setting('test.member'), true);
select pg_temp.check((select count(*) = 1 from public.timeline_rows where journey_id = current_setting('test.journey')), 'Member cannot read itinerary');
select pg_temp.check((select count(*) = 1 from public.timeline_groups where journey_id = current_setting('test.journey') and route_end_meters = 1000), 'Member cannot read group endpoints');

with changed as (update public.timeline_rows set title = 'Unauthorized' where journey_id = current_setting('test.journey') returning id)
select pg_temp.check((select count(*) = 0 from changed), 'Read policy granted row updates');
with changed as (update public.timeline_groups set route_end_meters = 2000 where journey_id = current_setting('test.journey') returning id)
select pg_temp.check((select count(*) = 0 from changed), 'Read policy granted group updates');
with removed as (delete from public.timeline_rows where journey_id = current_setting('test.journey') returning id)
select pg_temp.check((select count(*) = 0 from removed), 'Read policy granted row deletion');
with removed as (delete from public.timeline_groups where journey_id = current_setting('test.journey') returning id)
select pg_temp.check((select count(*) = 0 from removed), 'Read policy granted group deletion');

select set_config('request.jwt.claim.sub', gen_random_uuid()::text, true);
select pg_temp.check((select count(*) = 0 from public.timeline_rows where journey_id = current_setting('test.journey')), 'Non-member can read itinerary');
select pg_temp.check((select count(*) = 0 from public.timeline_groups where journey_id = current_setting('test.journey')), 'Non-member can read groups');

reset role;
delete from public.companions where journey_id = current_setting('test.journey');
set local role authenticated;
select set_config('request.jwt.claim.sub', current_setting('test.member'), true);
select pg_temp.check((select count(*) = 0 from public.timeline_rows where journey_id = current_setting('test.journey')), 'Former member can read itinerary');
select pg_temp.check((select count(*) = 0 from public.timeline_groups where journey_id = current_setting('test.journey')), 'Former member can read groups');
rollback;
