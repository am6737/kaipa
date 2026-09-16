alter table public.journeys
  add column if not exists deleted_at timestamptz;

create index if not exists journeys_owner_deleted_at_idx
  on public.journeys (user_id, deleted_at);

create or replace function public.is_journey_member(target_journey_id text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from journeys j where j.id = target_journey_id and j.deleted_at is null and (
      j.user_id = auth.uid() or exists (
        select 1 from companions c where c.journey_id = target_journey_id and c.user_id = auth.uid()
      )
    )
  );
$$;

create or replace function public.is_journey_shared_active(target_journey_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from journeys j
    join journey_shares js on js.journey_id = j.id
    where j.id = target_journey_id
      and j.deleted_at is null
      and js.active = true
  );
$$;
revoke all on function public.is_journey_shared_active(text) from public;
grant execute on function public.is_journey_shared_active(text) to anon, authenticated;

drop policy if exists "shares_anon_select" on public.journey_shares;
create policy "shares_anon_select" on public.journey_shares for select to anon
  using (active = true and public.is_journey_shared_active(journey_id));

drop policy if exists "moments_anon_select" on public.shared_moments;
create policy "moments_anon_select" on public.shared_moments for select to anon
  using (public.is_journey_shared_active(journey_id) and share_id in (select id from journey_shares where active = true));

drop policy if exists "moments_anon_insert" on public.shared_moments;
create policy "moments_anon_insert" on public.shared_moments for insert to anon
  with check (public.is_journey_shared_active(journey_id) and share_id in (select id from journey_shares where active = true));

drop policy if exists "moments_anon_delete" on public.shared_moments;
create policy "moments_anon_delete" on public.shared_moments for delete to anon
  using (public.is_journey_shared_active(journey_id) and share_id in (select id from journey_shares where active = true));

drop policy if exists "companions_anon_via_share" on public.companions;
create policy "companions_anon_via_share" on public.companions for select to anon
  using (public.is_journey_shared_active(journey_id));

drop policy if exists "inspo_anon_via_share" on public.inspo_media;
create policy "inspo_anon_via_share" on public.inspo_media for select to anon
  using (public.is_journey_shared_active(journey_id));

drop policy if exists "journeys_public_select" on public.journeys;
create policy "journeys_public_select" on public.journeys for select to authenticated
  using (track_public = true and deleted_at is null);

drop policy if exists "journeys_member_select" on public.journeys;
create policy "journeys_member_select" on public.journeys for select to authenticated
  using (deleted_at is null and public.is_journey_member(id));

drop policy if exists "journeys_anon_via_share" on public.journeys;
create policy "journeys_anon_via_share" on public.journeys for select to anon
  using (public.is_journey_shared_active(id));

create or replace function public.join_journey_by_invite(invite_slug text, invite_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  target_journey_id text;
  profile_name text;
  profile_avatar text;
  next_sort_order integer;
begin
  if current_user_id is null then
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

  select coalesce(nullif(nick, ''), nullif(display_name, ''), '伙伴'), avatar_url
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

revoke all on function public.join_journey_by_invite(text, text) from public;
revoke all on function public.join_journey_by_invite(text, text) from anon;
grant execute on function public.join_journey_by_invite(text, text) to authenticated;

drop policy if exists "agent_threads_own" on public.agent_threads;
create policy "agent_threads_own" on public.agent_threads for all to authenticated
  using (
    user_id = auth.uid()
    and (
      current_journey_id is null
      or exists (
        select 1 from public.journeys j
        where j.id = current_journey_id and j.deleted_at is null
      )
    )
  )
  with check (
    user_id = auth.uid()
    and (
      current_journey_id is null
      or exists (
        select 1 from public.journeys j
        where j.id = current_journey_id and j.deleted_at is null
      )
    )
  );
