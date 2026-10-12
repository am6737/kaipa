-- Run as postgres on the self-hosted database; fixtures are always rolled back.
begin;

create function pg_temp.check(ok boolean, message text)
returns void language plpgsql as $$
begin
  if ok is distinct from true then raise exception '%', message; end if;
end $$;

select set_config('test.host', gen_random_uuid()::text, true);
select set_config('test.anon', gen_random_uuid()::text, true);
select set_config('test.joiner', gen_random_uuid()::text, true);
insert into auth.users(id, raw_user_meta_data) values
 (current_setting('test.host')::uuid, '{"nickname":"Share host"}');
insert into auth.users(id, raw_user_meta_data, is_anonymous) values
 (current_setting('test.anon')::uuid, '{"nickname":"Anonymous"}', true);
insert into auth.users(id, raw_user_meta_data) values
 (current_setting('test.joiner')::uuid, '{"nickname":"Real account"}');

select set_config('test.journey', 'j-join-test-' || gen_random_uuid()::text, true);
insert into public.journeys(id, user_id, name, region, lng, lat, tone)
values(current_setting('test.journey'), current_setting('test.host')::uuid, 'Join test', 'Test', 110, 25, 'forest');

-- A code no other active share occupies, so the assertions below only ever see this fixture.
select set_config('test.code', coalesce((
  select c from (select (1000 + floor(random() * 9000))::int::text as c from generate_series(1, 50)) cand
  where not exists (
    select 1 from public.journey_shares js where js.active = true and js.code = cand.c
  )
  limit 1), ''), true);
select pg_temp.check(nullif(current_setting('test.code'), '') <> '', 'No free 4-digit code available');
select set_config('test.slug', 'join-test-' || substr(current_setting('test.code'), 1, 4), true);
insert into public.journey_shares(journey_id, user_id, slug, code, active)
values(current_setting('test.journey'), current_setting('test.host')::uuid, current_setting('test.slug'), current_setting('test.code'), true);

-- Anonymous sessions are rejected before the passphrase is ever looked up, so
-- neither RPC can answer "does this code exist".
select set_config('request.jwt.claim.sub', current_setting('test.anon'), true);
select set_config('request.jwt.claims', json_build_object('sub', current_setting('test.anon'), 'role', 'authenticated', 'is_anonymous', true)::text, true);
set local role authenticated;
do $$
begin
  begin
    perform public.join_journey_by_code(current_setting('test.code'));
    raise exception 'Anonymous session joined by code';
  exception when raise_exception then
    if sqlerrm <> 'JOURNEY_INVITE_AUTH_REQUIRED' then raise exception 'join_journey_by_code gave: %', sqlerrm; end if;
  end;
  begin
    perform public.join_journey_by_invite(current_setting('test.slug'), '0000');
    raise exception 'Anonymous session reached the invite lookup';
  exception when raise_exception then
    if sqlerrm <> 'JOURNEY_INVITE_AUTH_REQUIRED' then raise exception 'join_journey_by_invite gave: %', sqlerrm; end if;
  end;
end $$;
reset role;
select pg_temp.check(
  not exists (
    select 1 from public.companions
    where journey_id = current_setting('test.journey') and user_id = current_setting('test.anon')::uuid
  ), 'Anonymous session became a companion');

-- The internal join body is not an RPC: a signed-in account must not be able to
-- enter a journey by id without a passphrase.
set local role authenticated;
select set_config('request.jwt.claim.sub', current_setting('test.joiner'), true);
select set_config('request.jwt.claims', json_build_object('sub', current_setting('test.joiner'), 'role', 'authenticated')::text, true);
do $$
begin
  begin
    perform public._perform_share_join(current_setting('test.journey'));
    raise exception 'Signed-in account joined by journey id';
  exception when insufficient_privilege then null;
  end;
end $$;

-- A real account with the right 口令 still joins.
select pg_temp.check(
  public.join_journey_by_code(current_setting('test.code'))->>'status' = 'joined',
  'Real account rejected by the passphrase entry path');
select pg_temp.check(
  public.join_journey_by_invite(current_setting('test.slug'), current_setting('test.code'))->>'status' = 'already_joined',
  'Real account rejected by the invite link path');
reset role;
select pg_temp.check(
  exists (
    select 1 from public.companions
    where journey_id = current_setting('test.journey') and user_id = current_setting('test.joiner')::uuid
  ), 'Join wrote no companion row');

rollback;
