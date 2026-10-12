-- Joining a journey requires a real account. Anonymous sessions are free to
-- mint, so for an anonymous session the 4-digit 口令 was the only thing between
-- a stranger and someone else's journey; the app upgrades anonymous sessions on
-- boot (src/AppRoot.tsx), which makes this rejection invisible to real users.
-- Both checks run before the code lookup, so a rejected caller cannot use either
-- RPC as a passphrase existence oracle. The error string stays
-- JOURNEY_INVITE_AUTH_REQUIRED, which the client already maps to its sign-in
-- prompt (JourneyCodeEntrySheet -> passphrase.authRequired).

create or replace function public.join_journey_by_code(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  target_journey_id text;
  candidates jsonb;
begin
  if current_user_id is null then
    raise exception 'JOURNEY_INVITE_AUTH_REQUIRED';
  end if;

  if exists (
    select 1 from auth.users u
    where u.id = current_user_id and u.is_anonymous
  ) then
    raise exception 'JOURNEY_INVITE_AUTH_REQUIRED';
  end if;

  if not exists (
    select 1
    from journey_shares js
    join journeys j on j.id = js.journey_id
    where js.code = p_code and js.active = true and j.deleted_at is null
  ) then
    raise exception 'JOURNEY_INVITE_INVALID';
  end if;

  select jsonb_agg(item) into candidates
  from (
    select distinct on (js.journey_id)
      jsonb_build_object('journey_id', js.journey_id, 'slug', js.slug, 'name', j.name) as item
    from journey_shares js
    join journeys j on j.id = js.journey_id
    where js.code = p_code and js.active = true and j.deleted_at is null
    order by js.journey_id, js.created_at desc
  ) rows_;

  if jsonb_array_length(candidates) > 1 then
    return jsonb_build_object('status', 'ambiguous', 'candidates', candidates);
  end if;

  select (candidates -> 0 ->> 'journey_id') into target_journey_id;
  return public._perform_share_join(target_journey_id);
end;
$$;

create or replace function public.join_journey_by_invite(invite_slug text, invite_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  target_journey_id text;
begin
  if current_user_id is null then
    raise exception 'JOURNEY_INVITE_AUTH_REQUIRED';
  end if;

  if exists (
    select 1 from auth.users u
    where u.id = current_user_id and u.is_anonymous
  ) then
    raise exception 'JOURNEY_INVITE_AUTH_REQUIRED';
  end if;

  select js.journey_id into target_journey_id
  from journey_shares js
  join journeys j on j.id = js.journey_id
  where js.slug = invite_slug
    and js.code = invite_code
    and js.active = true
    and j.deleted_at is null
  limit 1;

  if target_journey_id is null then
    raise exception 'JOURNEY_INVITE_INVALID';
  end if;

  return public._perform_share_join(target_journey_id);
end;
$$;

-- _perform_share_join takes a journey id instead of a passphrase, so it was
-- never meant to be an RPC: while it kept its default grants, any signed-in
-- account could join any journey by guessing a j-<timestamp> id. Definer
-- callers above run as the owner and keep access.
revoke all on function public._perform_share_join(text) from public;
revoke all on function public._perform_share_join(text) from anon;
revoke all on function public._perform_share_join(text) from authenticated;
