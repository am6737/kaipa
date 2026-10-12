-- Journey passphrase v2: cryptographic 4-character codes, expiry and abuse limits.
drop function if exists public.join_journey_by_code(text);
drop function if exists public.join_journey_by_code(uuid, text, text, text);
drop function if exists public.join_journey_by_invite(text, text);
drop function if exists public.open_resource_guest_session(text, text, text);
drop function if exists public._perform_share_join(text);

alter table public.journey_shares drop column if exists slug;
alter table public.journey_shares add column if not exists expires_at timestamptz;
update public.journey_shares
set expires_at = coalesce(expires_at, now() - interval '1 second'),
    active = false
where expires_at is null;
alter table public.journey_shares alter column expires_at set default (now() + interval '7 days');
alter table public.journey_shares alter column expires_at set not null;
alter table public.journey_shares drop constraint if exists journey_shares_slug_code_key;
alter table public.journey_shares drop constraint if exists journey_shares_code_check;
alter table public.journey_shares
  add constraint journey_shares_code_check check (code ~ '^[0-9A-Z]{4}$');
drop index if exists public.journey_shares_slug_code_key;
create unique index if not exists journey_shares_active_code_key
  on public.journey_shares(code) where active;
create unique index if not exists journey_shares_active_journey_key
  on public.journey_shares(journey_id) where active;

create table if not exists public.journey_join_failures(
  user_id uuid,
  ip_hash text,
  device_hash text,
  created_at timestamptz not null default now()
);
create index if not exists journey_join_failures_user_idx
  on public.journey_join_failures(user_id, created_at);
create index if not exists journey_join_failures_ip_idx
  on public.journey_join_failures(ip_hash, created_at);
create index if not exists journey_join_failures_device_idx
  on public.journey_join_failures(device_hash, created_at);
alter table public.journey_join_failures enable row level security;
drop policy if exists journey_join_failures_service on public.journey_join_failures;
create policy journey_join_failures_service on public.journey_join_failures
  for all to service_role using (true) with check (true);

-- Uniform over 0-9A-Z: one random byte per character, rejecting 252..255 so
-- byte % 36 has no modulo bias.
create or replace function public._share_code()
returns text
language plpgsql volatile security definer
set search_path = public
as $$
declare
  b bytea;
  s text;
  n int;
  bad text[] := array['FUCK', 'SHIT', 'CUNT', 'DICK', 'PISS'];
begin
  loop
    s := '';
    for n in 1..4 loop
      loop
        b := extensions.gen_random_bytes(1);
        exit when get_byte(b, 0) < 252;
      end loop;
      s := s || substr('0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ', (get_byte(b, 0) % 36) + 1, 1);
    end loop;
    if not (s = any(bad)) and position('SB' in s) = 0 then
      return s;
    end if;
  end loop;
end $$;
revoke all on function public._share_code() from public, anon, authenticated;

create or replace function public._perform_share_join(target_journey_id text, p_user uuid)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  profile_name text;
  profile_avatar text;
  next_sort_order int;
begin
  perform pg_advisory_xact_lock(hashtext(target_journey_id));

  if exists(select 1 from journeys where id = target_journey_id and user_id = p_user)
     or exists(select 1 from companions where journey_id = target_journey_id and user_id = p_user) then
    return jsonb_build_object('status', 'already_joined', 'journey_id', target_journey_id);
  end if;

  if (select count(*) from companions where journey_id = target_journey_id) >= 10 then
    return jsonb_build_object('status', 'full');
  end if;

  if (select count(*) from companions
      where user_id = p_user and created_at > now() - interval '10 minutes') >= 3 then
    return jsonb_build_object('status', 'busy');
  end if;

  select coalesce(nullif(nick, ''), nullif(display_name, ''), '伙伴'), avatar_url
  into profile_name, profile_avatar
  from profiles where id = p_user;

  select coalesce(max(sort_order), -1) + 1 into next_sort_order
  from companions where journey_id = target_journey_id;

  insert into companions(user_id, journey_id, ini, name, color, avatar_url, is_host, is_self, sort_order)
  values (
    p_user, target_journey_id,
    left(coalesce(profile_name, '伙伴'), 1), coalesce(profile_name, '伙伴'),
    '#2E7D5B', profile_avatar, false, false, next_sort_order
  );
  return jsonb_build_object('status', 'joined', 'journey_id', target_journey_id);
end $$;
revoke all on function public._perform_share_join(text, uuid) from public, anon, authenticated;

create or replace function public.ensure_journey_share(p_journey_id text)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  u uuid := auth.uid();
  r journey_shares%rowtype;
  c text;
  i int;
begin
  if u is null or (select coalesce(is_anonymous, false) from auth.users where id = u) then
    raise exception 'JOURNEY_INVITE_AUTH_REQUIRED';
  end if;
  if not exists(select 1 from journeys where id = p_journey_id and deleted_at is null and user_id = u)
     and not exists(select 1 from companions where journey_id = p_journey_id and user_id = u) then
    raise exception 'JOURNEY_SHARE_FORBIDDEN';
  end if;

  perform pg_advisory_xact_lock(hashtext(p_journey_id));

  select * into r from journey_shares
  where journey_id = p_journey_id and active and expires_at > now()
  limit 1;
  if found then
    return jsonb_build_object('code', r.code, 'expires_at', r.expires_at);
  end if;

  update journey_shares set active = false where journey_id = p_journey_id and active;

  for i in 1..50 loop
    c := _share_code();
    begin
      insert into journey_shares(journey_id, user_id, code, active, expires_at)
      values (p_journey_id, u, c, true, now() + interval '7 days');
      return jsonb_build_object('code', c, 'expires_at', now() + interval '7 days');
    exception when unique_violation then
      -- Either the code is taken by another journey (retry) or a concurrent
      -- call already created this journey's share (reuse it).
      select * into r from journey_shares
      where journey_id = p_journey_id and active and expires_at > now()
      limit 1;
      if found then
        return jsonb_build_object('code', r.code, 'expires_at', r.expires_at);
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
  r jsonb;
begin
  if not exists(select 1 from journeys where id = p_journey_id and user_id = u and deleted_at is null) then
    raise exception 'JOURNEY_SHARE_FORBIDDEN';
  end if;
  update journey_shares set active = false where journey_id = p_journey_id and active;
  select public.ensure_journey_share(p_journey_id) into r;
  return r;
end $$;
revoke all on function public.rotate_journey_share(text) from public, anon, authenticated;
grant execute on function public.rotate_journey_share(text) to authenticated;

create or replace function public.stop_journey_share(p_journey_id text)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
begin
  if not exists(select 1 from journeys where id = p_journey_id and user_id = auth.uid() and deleted_at is null) then
    raise exception 'JOURNEY_SHARE_FORBIDDEN';
  end if;
  update journey_shares set active = false where journey_id = p_journey_id and active;
  return jsonb_build_object('status', 'stopped');
end $$;
revoke all on function public.stop_journey_share(text) from public, anon, authenticated;
grant execute on function public.stop_journey_share(text) to authenticated;

-- Called only by the journey-join Edge Function. Every miss is recorded and
-- answered with the same 'busy' status so callers cannot tell a wrong code
-- from a lockout.
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
  where js.code = c and js.active and js.expires_at > now() and j.deleted_at is null
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

insert into public.resource_rate_rules(scope, max_requests, window_seconds)
values ('journey_join', 20, 600), ('journey_join_peer', 60, 600)
on conflict (scope) do update
set max_requests = excluded.max_requests,
    window_seconds = excluded.window_seconds;

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
  where s.code = upper(trim(p_code)) and s.active and s.expires_at > now() and j.deleted_at is null;

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
