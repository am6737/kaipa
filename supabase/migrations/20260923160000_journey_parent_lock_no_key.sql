-- Which lock mode the parent journey row takes when a writer touches it.
--
-- The journeys row lock is the serialization point for every journey write: the
-- version triggers, the agent's context lock and the restore all take it. Its
-- only job is to keep version_number = max(version_number) + 1 honest against
-- journey_versions' unique (journey_id, version_number) and to stop agent writes
-- from interleaving with the user's.
--
-- That needs writers to exclude each other. It does NOT need to exclude the
-- foreign-key checks that every child insert performs against that same row
-- (inspo_media.journey_id, timeline_rows.journey_id, journey_versions.journey_id,
-- ...). FOR UPDATE conflicts with the FOR KEY SHARE those checks take, so two
-- concurrent child writes on one journey can each hold KEY SHARE and each wait
-- for the other to release its stronger lock. That cycle is not resolved by the
-- deadlock detector, and each request then dies on the authenticated role's 8s
-- statement_timeout — which is how a moments upload storm took every timeline
-- write of the same journey down with it on 2026-09-23.
--
-- FOR NO KEY UPDATE is still an exclusive lock for writer-against-writer
-- exclusion (it conflicts with itself, with FOR SHARE and with FOR UPDATE) and is
-- compatible with the FK's KEY SHARE, so no ordering of child-write statements
-- can form that cycle again. Keep this mode when redefining these functions.

-- ─── save_journey_version ───

create or replace function public.save_journey_version(
  target_journey_id text,
  version_fields text[],
  requested_kind text default 'update'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  editor_name text := '';
  existing_version public.journey_versions%rowtype;
  next_snapshot jsonb;
  next_version integer;
  current_transaction bigint := txid_current();
  requested_agent_run text;
  current_agent_run uuid;
  current_agent_run_created_at timestamptz;
  journey_created_at timestamptz;
  initial_changed_fields text[];
begin
  if current_setting('app.journey_version_suppressed', true) = 'true' then
    return;
  end if;

  requested_agent_run := coalesce(
    nullif(current_setting('request.headers', true), ''),
    '{}'
  )::jsonb ->> 'x-kaipa-agent-run-id';

  select run.id, run.created_at
  into current_agent_run, current_agent_run_created_at
  from public.agent_runs run
  where run.id::text = requested_agent_run
    and run.user_id = auth.uid()
    and run.status = 'running';

  select journey.created_at
  into journey_created_at
  from public.journeys journey
  where journey.id = target_journey_id
  for no key update;
  if not found then return; end if;

  next_snapshot := public.build_journey_version_snapshot(target_journey_id);
  if next_snapshot is null then return; end if;

  select coalesce(nullif(nick, ''), nullif(display_name, ''), '')
  into editor_name
  from public.profiles
  where id = auth.uid();

  select * into existing_version
  from public.journey_versions
  where journey_id = target_journey_id
    and (
      (current_agent_run is not null and agent_run_id = current_agent_run)
      or (current_agent_run is null and transaction_id = current_transaction)
    )
  order by version_number desc
  limit 1;

  -- The smart-plan sheet creates the journey immediately before opening its
  -- agent run. Fold those setup snapshots into the same user action too.
  if not found
    and current_agent_run is not null
    and journey_created_at between current_agent_run_created_at - interval '30 seconds'
                               and current_agent_run_created_at
    and not exists (
      select 1
      from public.journey_versions version
      where version.journey_id = target_journey_id
        and version.agent_run_id is not null
    )
    and not exists (
      select 1
      from public.journey_versions version
      where version.journey_id = target_journey_id
        and version.changed_at > current_agent_run_created_at
    )
  then
    select * into existing_version
    from public.journey_versions
    where journey_id = target_journey_id
    order by version_number
    limit 1;

    if found then
      select coalesce(array_agg(distinct field_name order by field_name), '{}')
      into initial_changed_fields
      from public.journey_versions initial_version
      cross join lateral unnest(initial_version.changed_fields) field_name
      where initial_version.journey_id = target_journey_id;

      delete from public.journey_versions
      where journey_id = target_journey_id
        and id <> existing_version.id;

      update public.journey_versions
      set agent_run_id = current_agent_run,
          changed_fields = initial_changed_fields,
          change_kind = 'create'
      where id = existing_version.id;
      existing_version.agent_run_id := current_agent_run;
      existing_version.changed_fields := initial_changed_fields;
      existing_version.change_kind := 'create';
    end if;
  end if;

  if found then
    update public.journey_versions
    set snapshot = next_snapshot,
        changed_fields = array(
          select distinct field_name
          from unnest(existing_version.changed_fields || coalesce(version_fields, '{}')) field_name
          order by field_name
        ),
        change_kind = case
          when requested_kind = 'restore' then 'restore'
          when existing_version.change_kind = 'create' then 'create'
          else 'update'
        end,
        changed_at = clock_timestamp()
    where id = existing_version.id;
    return;
  end if;

  select coalesce(max(version_number), 0) + 1
  into next_version
  from public.journey_versions
  where journey_id = target_journey_id;

  insert into public.journey_versions (
    journey_id, version_number, snapshot, changed_fields, change_kind,
    changed_by, changed_by_name, changed_at, transaction_id, agent_run_id
  ) values (
    target_journey_id,
    next_version,
    next_snapshot,
    coalesce(version_fields, '{}'),
    case when requested_kind in ('create', 'restore') then requested_kind else 'update' end,
    auth.uid(),
    coalesce(editor_name, ''),
    clock_timestamp(),
    current_transaction,
    current_agent_run
  );
end;
$$;

-- ─── agent_bump_journey_revision ───

create or replace function public.agent_bump_journey_revision() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  before_data jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) else '{}'::jsonb end;
  after_data jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) else '{}'::jsonb end;
  target text;
  old_target text;
  new_target text;
  track_keys text[] := array['track_id','dist','asc_'];
  track_changed boolean;
  track_coords jsonb;
  track_waypoints jsonb;
begin
  if tg_op = 'UPDATE' and before_data - 'updated_at' = after_data - 'updated_at' then return new; end if;
  if tg_table_name = 'journeys' then
    -- Related-row cascade triggers can queue an AFTER UPDATE after the parent
    -- has already been deleted in the same statement. Never resurrect its state.
    if not exists(select 1 from public.journeys where id=new.id) then return new; end if;
    track_changed := tg_op = 'INSERT' or exists(select 1 from unnest(track_keys) k where before_data->k is distinct from after_data->k);
    if new.track_id is not null then
      select t.coords, t.waypoints into track_coords, track_waypoints
      from public.tracks t where t.id = new.track_id;
    end if;
    insert into public.agent_journey_revisions(journey_id, track_summary)
      values(new.id, case when track_changed then public.agent_track_summary(track_coords,track_waypoints,new.dist,new.asc_) end)
      on conflict(journey_id) do update set
        journey = agent_journey_revisions.journey + case when before_data - track_keys - 'updated_at' is distinct from after_data - track_keys - 'updated_at' then 1 else 0 end,
        track = agent_journey_revisions.track + case when track_changed then 1 else 0 end,
        track_summary = case when track_changed then excluded.track_summary else agent_journey_revisions.track_summary end;
    return new;
  end if;
  if tg_table_name = 'journey_packing_items' then
    select journey_id into old_target from public.journey_packing_lists where id = (before_data->>'list_id')::uuid;
    select journey_id into new_target from public.journey_packing_lists where id = (after_data->>'list_id')::uuid;
  else
    old_target := before_data->>'journey_id'; new_target := after_data->>'journey_id';
  end if;
  -- Every writer (App, collaborator, restore, agent) takes the same parent lock.
  for target in select distinct id from unnest(array[old_target,new_target]) id where id is not null order by id loop
    perform 1 from public.journeys where id = target for no key update;
    -- The parent may already be gone during ON DELETE CASCADE. Its revision
    -- row will be cascaded too; updating it now would recheck a missing FK.
    if not found then continue; end if;
    update public.agent_journey_revisions set
      itinerary = itinerary + case when tg_table_name in ('timeline_rows','timeline_groups') then 1 else 0 end,
      packing = packing + case when tg_table_name in ('journey_packing_lists','journey_packing_items','companions') then 1 else 0 end,
      journey = journey + case when tg_table_name = 'companions' then 1 else 0 end
    where journey_id = target;
  end loop;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

-- ─── agent_bump_track_referrers ───

create or replace function public.agent_bump_track_referrers() returns trigger
language plpgsql security definer set search_path = public as $$
declare referrer record;
begin
  -- The trigger fires on any write that names coords/waypoints, including ones
  -- that set the same value back. Bumping for those would make every referrer
  -- re-read an unchanged track, so compare the values, as the journey trigger does.
  if new.coords is not distinct from old.coords and new.waypoints is not distinct from old.waypoints then
    return new;
  end if;
  for referrer in
    select j.id, j.dist, j.asc_ from public.journeys j
    where j.track_id = new.id order by j.id
  loop
    perform 1 from public.journeys where id = referrer.id for no key update;
    if not found then continue; end if;
    update public.agent_journey_revisions set
      track = track + 1,
      track_summary = public.agent_track_summary(new.coords, new.waypoints, referrer.dist, referrer.asc_)
    where journey_id = referrer.id;
  end loop;
  return new;
end;
$$;

-- ─── restore_journey_version ───

create or replace function public.restore_journey_version(target_version_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target_version public.journey_versions%rowtype;
  current_journey public.journeys%rowtype;
  restored public.journeys%rowtype;
  snapshot jsonb;
  payload jsonb;
begin
  if auth.uid() is null then
    raise exception 'JOURNEY_VERSION_AUTH_REQUIRED';
  end if;

  select * into target_version
  from public.journey_versions
  where id = target_version_id;
  if not found then raise exception 'JOURNEY_VERSION_NOT_FOUND'; end if;

  select * into current_journey
  from public.journeys
  where id = target_version.journey_id
  for no key update;
  if not found or current_journey.user_id <> auth.uid() then
    raise exception 'JOURNEY_VERSION_RESTORE_FORBIDDEN';
  end if;

  snapshot := target_version.snapshot;
  payload := coalesce(snapshot -> 'journey', snapshot);
  perform set_config('app.journey_version_suppressed', 'true', true);
  perform set_config('app.journey_change_kind', 'restore', true);

  delete from public.journey_packing_items
  where list_id in (select id from public.journey_packing_lists where journey_id = target_version.journey_id);
  delete from public.journey_packing_lists where journey_id = target_version.journey_id;
  delete from public.timeline_rows where journey_id = target_version.journey_id;
  delete from public.timeline_groups where journey_id = target_version.journey_id;
  delete from public.inspo_media where journey_id = target_version.journey_id;
  delete from public.companions where journey_id = target_version.journey_id;

  update public.journeys set
    route_id = payload ->> 'route_id',
    name = coalesce(payload ->> 'name', ''),
    region = coalesce(payload ->> 'region', ''),
    coord = payload ->> 'coord',
    lng = coalesce((payload ->> 'lng')::float8, 0),
    lat = coalesce((payload ->> 'lat')::float8, 0),
    dist = payload ->> 'dist',
    asc_ = payload ->> 'asc_',
    diff = payload ->> 'diff',
    tone = coalesce(payload ->> 'tone', 'forest'),
    "desc" = payload ->> 'desc',
    date = payload ->> 'date',
    days = payload ->> 'days',
    planned_date = payload ->> 'planned_date',
    countdown = (payload ->> 'countdown')::int4,
    day_index = (payload ->> 'day_index')::int4,
    total_days = (payload ->> 'total_days')::int4,
    fav = coalesce((payload ->> 'fav')::boolean, false),
    -- Null when the track has since been deleted, so an old version cannot trip the FK.
    track_id = (select t.id from public.tracks t where t.id = nullif(payload ->> 'track_id', '')::uuid),
    hero_mode = payload ->> 'hero_mode',
    track_public = coalesce((payload ->> 'track_public')::boolean, false),
    route_show_photos = coalesce((payload ->> 'route_show_photos')::boolean, true),
    route_show_timeline = coalesce((payload ->> 'route_show_timeline')::boolean, true),
    participant_permissions = coalesce(nullif(payload -> 'participant_permissions', 'null'::jsonb), current_journey.participant_permissions),
    photo_uris = nullif(payload -> 'photo_uris', 'null'::jsonb),
    updated_at = now()
  where id = target_version.journey_id
  returning * into restored;

  insert into public.companions
  select * from jsonb_populate_recordset(
    null::public.companions,
    coalesce(snapshot -> 'companions', '[]'::jsonb)
  );

  if exists (select 1 from public.companions) then
    perform setval(
      pg_get_serial_sequence('public.companions', 'id'),
      greatest((select max(id) from public.companions), (select last_value from public.companions_id_seq)),
      true
    );
  end if;

  insert into public.timeline_groups
  select * from jsonb_populate_recordset(
    null::public.timeline_groups,
    coalesce(snapshot -> 'timelineGroups', '[]'::jsonb)
  );
  insert into public.timeline_rows
  select * from jsonb_populate_recordset(
    null::public.timeline_rows,
    coalesce(snapshot -> 'timelineRows', '[]'::jsonb)
  );
  insert into public.inspo_media
  select * from jsonb_populate_recordset(
    null::public.inspo_media,
    coalesce(snapshot -> 'moments', '[]'::jsonb)
  );
  insert into public.journey_packing_lists
  select * from jsonb_populate_recordset(
    null::public.journey_packing_lists,
    coalesce(snapshot -> 'packingLists', '[]'::jsonb)
  );
  insert into public.journey_packing_items
  select * from jsonb_populate_recordset(
    null::public.journey_packing_items,
    coalesce(snapshot -> 'packingItems', '[]'::jsonb)
  );

  perform set_config('app.journey_version_suppressed', 'false', true);
  perform public.save_journey_version(target_version.journey_id, array['restore'], 'restore');
  return public.build_journey_version_snapshot(restored.id);
end;
$$;

-- ─── agent_lock_context ───

create or replace function public.agent_lock_context(p_journey_id text default null) returns void
language plpgsql security definer set search_path=public as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  perform set_config('lock_timeout', '5000', true);
  begin
    if p_journey_id is not null then
      if not public.is_journey_member(p_journey_id) then raise exception 'Journey unavailable'; end if;
      perform 1 from public.journeys where id=p_journey_id and deleted_at is null for no key update;
      if not found then raise exception 'Journey unavailable'; end if;
    end if;
    perform 1 from public.agent_personal_revisions where user_id=auth.uid() for update;
  exception when lock_not_available then
    raise exception using errcode='PT409',
      message='agent_context_conflict: concurrent agent write in progress; read current sections before replanning';
  end;
end $$;

