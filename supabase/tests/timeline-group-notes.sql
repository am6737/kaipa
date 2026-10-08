-- Run as postgres on the self-hosted database. No fixture changes survive.
begin;
create function pg_temp.check(ok boolean, message text) returns void language plpgsql as $$ begin
  if ok is distinct from true then raise exception '%', message; end if;
end $$;
select set_config('test.owner', gen_random_uuid()::text, true);
select set_config('test.stranger', gen_random_uuid()::text, true);
insert into auth.users(id, raw_user_meta_data) values
  (current_setting('test.owner')::uuid, '{"nickname":"Group note test"}'),
  (current_setting('test.stranger')::uuid, '{"nickname":"Other note test"}');
select set_config('test.journey', 'group-note-test-' || gen_random_uuid()::text, true);
select set_config('request.jwt.claim.sub', current_setting('test.owner'), true);
insert into public.journeys(id, user_id, name, region, lng, lat, tone)
values(current_setting('test.journey'), auth.uid(), 'Group note test', 'Test', 110, 25, 'forest');
set local role authenticated;

-- A note alone is sufficient for an empty day, including the pending group.
select public.journey_save_timeline_group_note(current_setting('test.journey'), 'Day 1', E'  抵达成都\n晚上自由活动  ');
select pg_temp.check((select note = E'抵达成都\n晚上自由活动' and not deleted from public.timeline_groups
  where journey_id=current_setting('test.journey') and name='Day 1'), 'Note did not preserve text/newlines');
select public.journey_save_timeline_group_note(current_setting('test.journey'), '', '待确认航班');
select pg_temp.check((select note='待确认航班' from public.timeline_groups
  where journey_id=current_setting('test.journey') and name=''), 'Pending group note was not saved');

-- Renaming back to a retired name must not duplicate the old note.
select public.journey_rename_timeline_group(current_setting('test.journey'), 'Day 1', '抵达成都');
select public.journey_rename_timeline_group(current_setting('test.journey'), '抵达成都', 'Day 1');
select pg_temp.check((select note=E'抵达成都\n晚上自由活动' from public.timeline_groups
  where journey_id=current_setting('test.journey') and name='Day 1'), 'Round-trip rename duplicated or lost note');
select public.journey_save_timeline_group_note(current_setting('test.journey'), 'Day 2', '穿舒服的鞋');
select public.journey_rename_timeline_group(current_setting('test.journey'), 'Day 1', 'Day 2');
select pg_temp.check((select note=E'穿舒服的鞋\n\n抵达成都\n晚上自由活动' from public.timeline_groups
  where journey_id=current_setting('test.journey') and name='Day 2'), 'Merge lost a group note');

reset role;
select pg_temp.check((select g->>'note'=E'穿舒服的鞋\n\n抵达成都\n晚上自由活动'
  from jsonb_array_elements(public.build_journey_version_snapshot(current_setting('test.journey'))->'timelineGroups') g
  where g->>'name'='Day 2'), 'Version snapshot omitted note');
set local role authenticated;
select public.journey_save_timeline_group_note(current_setting('test.journey'), 'Day 2', '  ');
select pg_temp.check((select note is null from public.timeline_groups
  where journey_id=current_setting('test.journey') and name='Day 2'), 'Clearing did not remove note');

-- Limits and stale group checks must refuse writes without resurrecting a day.
do $$ begin
  begin
    perform public.journey_save_timeline_group_note(current_setting('test.journey'), 'Day 2', repeat('字',1001));
    raise exception 'Oversized note accepted';
  exception when invalid_parameter_value then null; end;
  begin
    perform public.journey_save_timeline_group_note(current_setting('test.journey'), 'Day 1', 'stale');
    raise exception 'Deleted group resurrected';
  exception when invalid_parameter_value then null; end;
end $$;
select set_config('request.jwt.claim.sub', current_setting('test.stranger'), true);
do $$ begin
  begin
    perform public.journey_save_timeline_group_note(current_setting('test.journey'), 'Day 2', 'forged');
    raise exception 'Stranger edited note';
  exception when insufficient_privilege then null; end;
  begin
    perform public.journey_save_timeline_group_note(current_setting('test.journey'), 'Day 9', 'forged new group');
    raise exception 'Stranger created group';
  exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claim.sub', current_setting('test.owner'), true);
select pg_temp.check((select note is null from public.timeline_groups
  where journey_id=current_setting('test.journey') and name='Day 2'), 'Rejected write changed note');
select pg_temp.check(not exists(select 1 from public.timeline_groups
  where journey_id=current_setting('test.journey') and name='Day 9'), 'Rejected write created group');
rollback;
