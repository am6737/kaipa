-- Run against the existing self-hosted schema. No migrations; disposable fixtures.
-- ON_ERROR_STOP closes an unsuccessful psql session and rolls back its transaction.
begin;
do $$
declare
  owner_id uuid := gen_random_uuid();
  fixture_journey_id text := 'qa-share-expiry-' || gen_random_uuid()::text;
  share_code text;
  guest_token text;
begin
  insert into auth.users(id,email,role,aud,is_anonymous)
  values(owner_id, 'qa-expiry-' || owner_id::text || '@example.test', 'authenticated', 'authenticated', false);
  insert into public.profiles(id,display_name) values(owner_id,'QA expiry owner') on conflict(id) do nothing;
  perform set_config('request.jwt.claim.sub',owner_id::text,true);
  insert into public.journeys(id,user_id,name,region,lng,lat,tone)
  values(fixture_journey_id,owner_id,'QA expiry fixture','QA',110,25,'forest');
  share_code := public.ensure_journey_share(fixture_journey_id)->>'code';
  guest_token := public.open_resource_guest_session(share_code,null,null)->>'token';
  if guest_token is null then raise exception 'QA setup did not open a guest session'; end if;
  perform public.resource_guest_snapshot(guest_token);

  -- No wall-clock wait: make only this fixture's share unambiguously expired.
  update public.journey_shares set expires_at = '-infinity'::timestamptz where journey_id = fixture_journey_id;
  if public.open_resource_guest_session(share_code,null,null)->>'status' is distinct from 'busy' then
    raise exception 'QA setup: expired code unexpectedly opened a new session';
  end if;
  begin
    perform public.resource_guest_snapshot(guest_token);
  exception when no_data_found or insufficient_privilege then
    return; -- Expected: the established session no longer grants share access.
  end;
  raise exception 'QA defect: existing guest session still reads an expired journey share';
end $$;
rollback;
