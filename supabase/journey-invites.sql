-- Authenticated app users can redeem an active web invite and become a member.
-- The join body lives in _perform_share_join so the manual 口令 entry path
-- (join_journey_by_code in migrations/*journey_passphrase.sql) shares it.

create or replace function public._perform_share_join(target_journey_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  profile_name text;
  profile_avatar text;
  next_sort_order integer;
begin
  if current_user_id is null then
    raise exception 'JOURNEY_INVITE_AUTH_REQUIRED';
  end if;

  perform pg_advisory_xact_lock(hashtext(target_journey_id));

  if exists (
    select 1 from journeys where id = target_journey_id and user_id = current_user_id
  ) or exists (
    select 1 from companions where journey_id = target_journey_id and user_id = current_user_id
  ) then
    return jsonb_build_object('status', 'already_joined', 'journey_id', target_journey_id);
  end if;

  if (select count(*) from companions where journey_id = target_journey_id) >= 10 then
    raise exception 'JOURNEY_FULL';
  end if;

  -- Light anti-brute-force: codes are only 4 digits, so cap how many journeys
  -- one account can join in a short window.
  if (select count(*) from companions where user_id = current_user_id and created_at > now() - interval '10 minutes') >= 5 then
    raise exception 'JOURNEY_JOIN_LIMIT';
  end if;

  select
    coalesce(nullif(nick, ''), nullif(display_name, ''), '伙伴'),
    avatar_url
  into profile_name, profile_avatar
  from profiles
  where id = current_user_id;

  select coalesce(max(sort_order), -1) + 1 into next_sort_order
  from companions
  where journey_id = target_journey_id;

  insert into companions (
    user_id, journey_id, ini, name, color, avatar_url, is_host, is_self, sort_order
  ) values (
    current_user_id,
    target_journey_id,
    left(coalesce(profile_name, '伙伴'), 1),
    coalesce(profile_name, '伙伴'),
    '#2E7D5B',
    profile_avatar,
    false,
    false,
    next_sort_order
  );

  return jsonb_build_object('status', 'joined', 'journey_id', target_journey_id);
end;
$$;

create or replace function public.join_journey_by_invite(invite_slug text, invite_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target_journey_id text;
begin
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

revoke all on function public.join_journey_by_invite(text, text) from public;
revoke all on function public.join_journey_by_invite(text, text) from anon;
grant execute on function public.join_journey_by_invite(text, text) to authenticated;
