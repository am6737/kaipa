begin;

create function pg_temp.gap_check(ok boolean, message text) returns void language plpgsql as $$ begin
  if ok is distinct from true then raise exception '%', message; end if;
end $$;

select set_config('test.gap_route', 'gap-test-' || gen_random_uuid()::text, true);
select set_config('test.gap_run', gen_random_uuid()::text, true);
insert into public.routes (id, name, region, lng, lat, tone)
values (current_setting('test.gap_route'), '线路缺口测试', 'Test', 110, 25, 'forest');

set local role service_role;
select pg_temp.gap_check(public.record_route_guide_gaps(
  current_setting('test.gap_route'), array['access', '*', 'access'], current_setting('test.gap_run')::uuid
) = 2, 'Insert must touch two distinct gaps');
select pg_temp.gap_check((select count(*) = 2 and bool_and(hit_count = 1 and resolved_at is null)
  from public.route_guide_gaps where route_id = current_setting('test.gap_route')), 'Inserted gap defaults incorrect');

-- now() is fixed within a transaction; age this timestamp to verify the bump.
update public.route_guide_gaps set last_seen_at = now() - interval '1 day'
where route_id = current_setting('test.gap_route') and section = 'access';
select pg_temp.gap_check(public.record_route_guide_gaps(current_setting('test.gap_route'), array['access']) = 1,
  'Repeat must touch one gap');
select pg_temp.gap_check((select hit_count = 2 and last_seen_at = now() and first_seen_at = now() and last_run_id is null
  from public.route_guide_gaps where route_id = current_setting('test.gap_route') and section = 'access'),
  'Repeat must increment, bump timestamp, preserve first_seen_at and set last_run_id');
select pg_temp.gap_check(public.record_route_guide_gaps('missing-' || gen_random_uuid()::text, array['access']) = 0,
  'Unknown route must return zero');
select pg_temp.gap_check(public.record_route_guide_gaps(current_setting('test.gap_route'), array[]::text[]) = 0,
  'Empty sections must return zero');
do $$ begin
  perform public.record_route_guide_gaps(current_setting('test.gap_route'), array['gear', 'invalid']);
  raise exception 'Invalid section accepted';
exception when invalid_parameter_value then null; end $$;
do $$ begin
  perform public.record_route_guide_gaps(current_setting('test.gap_route'), array[null]::text[]);
  raise exception 'Null section accepted';
exception when invalid_parameter_value then null; end $$;
select pg_temp.gap_check(not exists (select 1 from public.route_guide_gaps
  where route_id = current_setting('test.gap_route') and section = 'gear'), 'Validation must be atomic');

update public.route_guide_gaps set resolved_at = now()
where route_id = current_setting('test.gap_route') and section = 'access';
select pg_temp.gap_check(public.record_route_guide_gaps(current_setting('test.gap_route'), array['access'],
  current_setting('test.gap_run')::uuid) = 1, 'Resolved gap must allow a new open row');
select pg_temp.gap_check((select count(*) = 2 and count(*) filter (where resolved_at is null) = 1
  from public.route_guide_gaps where route_id = current_setting('test.gap_route') and section = 'access'),
  'Resolved history was lost or open gaps duplicated');
select pg_temp.gap_check((select hit_count = 1 and last_run_id = current_setting('test.gap_run')::uuid
  from public.route_guide_gaps where route_id = current_setting('test.gap_route') and section = 'access' and resolved_at is null),
  'New open gap must start at one');
select pg_temp.gap_check((select count(*) = 2 and bool_and(route_name = '线路缺口测试')
  from public.route_guide_gap_queue where route_id = current_setting('test.gap_route')), 'Queue must show only open named gaps');
reset role;

select pg_temp.gap_check((select relrowsecurity from pg_class where oid = 'public.route_guide_gaps'::regclass), 'RLS disabled');
select pg_temp.gap_check(not has_table_privilege('anon', 'public.route_guide_gaps', 'SELECT')
  and not has_table_privilege('authenticated', 'public.route_guide_gaps', 'INSERT')
  and not has_table_privilege('authenticated', 'public.route_guide_gap_queue', 'SELECT')
  and not has_function_privilege('anon', 'public.record_route_guide_gaps(text,text[],uuid)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.record_route_guide_gaps(text,text[],uuid)', 'EXECUTE'),
  'End-user privileges leaked');

rollback;
