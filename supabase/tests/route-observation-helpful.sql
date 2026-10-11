-- Run with psql as postgres. All fixtures and votes are rolled back.
begin;

create function pg_temp.check(ok boolean, message text) returns void
language plpgsql as $$ begin
  if ok is distinct from true then raise exception '%', message; end if;
end $$;

do $$
declare
  test_user uuid := (select id from auth.users order by id limit 1);
  observation uuid := gen_random_uuid();
begin
  if test_user is null then raise exception 'Test needs an existing auth user'; end if;
  perform set_config('test.helpful_user', test_user::text, true);
  perform set_config('test.observation', observation::text, true);
  perform set_config('request.jwt.claim.sub', test_user::text, true);
  insert into public.route_observations (id, route_id, user_id, body, moderation_status)
  values (observation, 'helpful-regression-test', test_user, 'Helpfulness regression test', 'approved');
end $$;

set local role authenticated;
select pg_temp.check(not exists (
  select 1 from public.route_observation_helpful_votes
  where observation_id = current_setting('test.observation')::uuid
), 'New report should not be marked helpful');
select pg_temp.check(public.route_observation_helpful(current_setting('test.observation')::uuid), 'First vote was not accepted');
select pg_temp.check(not public.route_observation_helpful(current_setting('test.observation')::uuid), 'Second click did not remove the vote');
select pg_temp.check((select helpful_count = 0 from public.route_observations
  where id = current_setting('test.observation')::uuid), 'Removing the vote did not decrease the count');
select pg_temp.check(public.route_observation_helpful(current_setting('test.observation')::uuid), 'Third click did not restore the vote');
select pg_temp.check((select helpful_count = 1 from public.route_observations
  where id = current_setting('test.observation')::uuid), 'Restoring the vote did not increase the count');
select pg_temp.check((select count(*) = 1 from public.route_observation_helpful_votes
  where observation_id = current_setting('test.observation')::uuid), 'Own vote is not readable');

-- A different account must not see another user's marked state.
do $$ begin
  perform set_config('request.jwt.claim.sub', gen_random_uuid()::text, true);
end $$;
select pg_temp.check(not exists (select 1 from public.route_observation_helpful_votes
  where observation_id = current_setting('test.observation')::uuid), 'Other account can read the vote');

-- Re-entering with the original account must restore the marked state.
do $$ begin
  perform set_config('request.jwt.claim.sub', current_setting('test.helpful_user'), true);
end $$;
select pg_temp.check(exists (select 1 from public.route_observation_helpful_votes
  where observation_id = current_setting('test.observation')::uuid), 'Returning account lost its marked state');

set local role anon;
select pg_temp.check(not exists (select 1 from public.route_observation_helpful_votes
  where observation_id = current_setting('test.observation')::uuid), 'Guest can read votes');
select pg_temp.check(exists (select 1 from public.route_observations
  where id = current_setting('test.observation')::uuid), 'Guest cannot read approved reports');

rollback;
