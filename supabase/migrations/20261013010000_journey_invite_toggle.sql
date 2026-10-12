-- Per-journey "allow invites" switch, and enforce the inviteParticipants
-- permission when companions ask for the passphrase.
alter table public.journeys
  add column if not exists invite_enabled boolean not null default true;

create or replace function public._guard_journey_invite_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null and auth.uid() <> old.user_id
     and (new.invite_enabled is distinct from old.invite_enabled
       or new.participant_permissions is distinct from old.participant_permissions) then
    raise exception 'JOURNEY_SHARE_FORBIDDEN';
  end if;
  return new;
end $$;

drop trigger if exists journeys_guard_journey_invite_fields on public.journeys;
create trigger journeys_guard_journey_invite_fields
  before update on public.journeys
  for each row execute function public._guard_journey_invite_fields();

create or replace function public.set_journey_invite_enabled(p_journey_id text, p_enabled boolean)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not exists(
    select 1 from journeys where id = p_journey_id and user_id = auth.uid() and deleted_at is null
  ) then
    raise exception 'JOURNEY_SHARE_FORBIDDEN';
  end if;
  update journeys set invite_enabled = p_enabled where id = p_journey_id;
  if not p_enabled then
    update journey_shares set active = false where journey_id = p_journey_id and active;
  end if;
  return jsonb_build_object('invite_enabled', p_enabled);
end $$;
revoke all on function public.set_journey_invite_enabled(text, boolean) from public, anon, authenticated;
grant execute on function public.set_journey_invite_enabled(text, boolean) to authenticated;

-- Owner always gets the code; companions only with inviteParticipants. With
-- invites switched off nobody gets one, so no new code is ever generated.
create or replace function public.ensure_journey_share(p_journey_id text)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  u uuid := auth.uid();
  j journeys%rowtype;
  is_owner boolean;
  r journey_shares%rowtype;
  c text;
  i int;
begin
  if u is null or (select coalesce(is_anonymous, false) from auth.users where id = u) then
    raise exception 'JOURNEY_INVITE_AUTH_REQUIRED';
  end if;

  select * into j from journeys where id = p_journey_id and deleted_at is null;
  if not found then
    raise exception 'JOURNEY_SHARE_FORBIDDEN';
  end if;
  is_owner := j.user_id = u;
  if not is_owner
     and not exists(select 1 from companions where journey_id = p_journey_id and user_id = u) then
    raise exception 'JOURNEY_SHARE_FORBIDDEN';
  end if;

  if not j.invite_enabled then
    return jsonb_build_object('status', 'disabled');
  end if;
  if not is_owner and not coalesce((j.participant_permissions ->> 'inviteParticipants')::boolean, false) then
    return jsonb_build_object('status', 'no_permission');
  end if;

  perform pg_advisory_xact_lock(hashtext(p_journey_id));

  select * into r from journey_shares
  where journey_id = p_journey_id and active and expires_at > now()
  limit 1;
  if found then
    return jsonb_build_object('status', 'active', 'code', r.code, 'expires_at', r.expires_at);
  end if;

  update journey_shares set active = false where journey_id = p_journey_id and active;

  for i in 1..50 loop
    c := _share_code();
    begin
      insert into journey_shares(journey_id, user_id, code, active, expires_at)
      values (p_journey_id, u, c, true, now() + interval '7 days');
      return jsonb_build_object('status', 'active', 'code', c, 'expires_at', now() + interval '7 days');
    exception when unique_violation then
      -- Either the code is taken by another journey (retry) or a concurrent
      -- call already created this journey's share (reuse it).
      select * into r from journey_shares
      where journey_id = p_journey_id and active and expires_at > now()
      limit 1;
      if found then
        return jsonb_build_object('status', 'active', 'code', r.code, 'expires_at', r.expires_at);
      end if;
    end;
  end loop;
  raise exception 'JOURNEY_SHARE_COLLISION';
end $$;
revoke all on function public.ensure_journey_share(text) from public, anon, authenticated;
grant execute on function public.ensure_journey_share(text) to authenticated;

create or replace function public.rotate_journey_share(p_journey_id text)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  u uuid := auth.uid();
  enabled boolean;
  r jsonb;
begin
  select invite_enabled into enabled
  from journeys where id = p_journey_id and user_id = u and deleted_at is null;
  if not found then
    raise exception 'JOURNEY_SHARE_FORBIDDEN';
  end if;
  if not enabled then
    raise exception 'JOURNEY_INVITE_DISABLED';
  end if;
  update journey_shares set active = false where journey_id = p_journey_id and active;
  select public.ensure_journey_share(p_journey_id) into r;
  return r;
end $$;
revoke all on function public.rotate_journey_share(text) from public, anon, authenticated;
grant execute on function public.rotate_journey_share(text) to authenticated;

drop function if exists public.stop_journey_share(text);

-- Same as v2, plus the journey must still allow invites.
create or replace function public.join_journey_by_code(p_user uuid, p_code text, p_ip_hash text, p_device_hash text)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  c text := upper(trim(p_code));
  r journey_shares%rowtype;
begin
  delete from journey_join_failures where created_at < now() - interval '2 days';

  if p_user is null or exists(select 1 from auth.users where id = p_user and is_anonymous) then
    return jsonb_build_object('status', 'auth_required');
  end if;

  if (select count(*) from journey_join_failures
      where user_id = p_user and created_at > now() - interval '15 minutes') >= 5
     or (select count(*) from journey_join_failures
         where user_id = p_user and created_at > now() - interval '24 hours') >= 20
     or (p_ip_hash is not null and (select count(*) from journey_join_failures
         where ip_hash = p_ip_hash and created_at > now() - interval '1 hour') >= 30)
     or (p_device_hash is not null and (select count(*) from journey_join_failures
         where device_hash = p_device_hash and created_at > now() - interval '15 minutes') >= 10) then
    return jsonb_build_object('status', 'busy');
  end if;

  select js.* into r
  from journey_shares js
  join journeys j on j.id = js.journey_id
  where js.code = c and js.active and js.expires_at > now()
    and j.deleted_at is null and j.invite_enabled
  limit 1;

  if not found or c !~ '^[0-9A-Z]{4}$' then
    insert into journey_join_failures(user_id, ip_hash, device_hash)
    values (p_user, p_ip_hash, p_device_hash);
    return jsonb_build_object('status', 'busy');
  end if;

  return public._perform_share_join(r.journey_id, p_user);
end $$;
revoke all on function public.join_journey_by_code(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.join_journey_by_code(uuid, text, text, text) to service_role;

create or replace function public.open_resource_guest_session(p_code text, p_token text default null, p_ip_hash text default null)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  share public.journey_shares%rowtype;
  token text := replace(extensions.gen_random_uuid()::text || extensions.gen_random_uuid()::text, '-', '');
  v_id uuid;
begin
  if p_ip_hash is not null and (select count(*) from public.journey_join_failures
      where ip_hash = p_ip_hash and created_at > now() - interval '1 hour') >= 10 then
    return jsonb_build_object('status', 'busy');
  end if;

  select s.* into share
  from public.journey_shares s
  join public.journeys j on j.id = s.journey_id
  where s.code = upper(trim(p_code)) and s.active and s.expires_at > now()
    and j.deleted_at is null and j.invite_enabled;

  if not found then
    insert into public.journey_join_failures(ip_hash) values (p_ip_hash);
    return jsonb_build_object('status', 'busy');
  end if;

  if p_token is not null then
    update public.resource_guest_sessions
    set expires_at = now() + interval '90 days'
    where share_id = share.id
      and token_hash = encode(extensions.digest(convert_to(p_token, 'UTF8'), 'sha256'), 'hex')
    returning id into v_id;
    if found then
      return jsonb_build_object('sessionId', v_id, 'token', p_token, 'shareId', share.id);
    end if;
  end if;

  insert into public.resource_guest_sessions(share_id, token_hash)
  values (share.id, encode(extensions.digest(convert_to(token, 'UTF8'), 'sha256'), 'hex'))
  returning id into v_id;
  return jsonb_build_object('sessionId', v_id, 'token', token, 'shareId', share.id);
end $$;
revoke all on function public.open_resource_guest_session(text, text, text) from public, anon, authenticated;
grant execute on function public.open_resource_guest_session(text, text, text) to service_role;
