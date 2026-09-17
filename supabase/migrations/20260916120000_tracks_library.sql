-- tracks_library.sql — tracks become a first-class, reusable entity.
--
-- Before this, a "track" was six columns duplicated on journeys and routes:
--   track_coords, track_elevation, track_duration_ms,
--   track_waypoints, track_file_url, track_file_name
--
-- A GPX could therefore only exist attached to a journey or a route. There was
-- no way to keep a track that is not applied to anything, and no file-centric
-- view (name / format / size / point count) to manage them with.
--
-- The six columns are dropped from both tables. journeys.track_id points at a
-- track. routes lose their columns outright: seed.sql never populated them and
-- routes_update_owner (20260915120000) rejects client writes, so they held no
-- data and had no writer.
--
-- Journey version history needs no change to its snapshot side — record_journey_version
-- snapshots to_jsonb(new) and diffs by key, so it picks up track_id by itself.
-- Only the restore side names columns explicitly.

begin;

-- ─── tracks ─────────────────────────────────────────────────────────────────

create table if not exists public.tracks (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles(id) on delete cascade,
  name         text not null,
  file_name    text,
  file_format  text check (file_format in ('gpx','kml','kmz')),
  file_url     text,
  file_size    int8,
  coords       jsonb,
  elevation    jsonb,
  duration_ms  int8,
  waypoints    jsonb,
  dist_m       int8,
  asc_m        int8,
  point_count  int4,
  started_at   timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists tracks_user_created_idx
  on public.tracks (user_id, created_at desc);

alter table public.tracks enable row level security;

drop policy if exists tracks_own on public.tracks;
create policy tracks_own on public.tracks for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ─── link journeys to tracks ────────────────────────────────────────────────

-- on delete set null: deleting a track unlinks it from every journey that used
-- it. The app warns with a usage count before deleting.
alter table public.journeys
  add column if not exists track_id uuid references public.tracks(id) on delete set null;

create index if not exists journeys_track_id_idx on public.journeys (track_id);

-- Companions still need the line of a journey shared with them. Declared here
-- rather than with the other tracks policies because it reads journeys.track_id.
drop policy if exists tracks_member_select on public.tracks;
create policy tracks_member_select on public.tracks for select to authenticated
  using (exists (
    select 1 from public.journeys j
    where j.track_id = tracks.id and public.is_journey_member(j.id)
  ));

-- ─── agent revision: resolve the track through track_id ─────────────────────
--
-- Redefined before the old columns are dropped so that the backfill below
-- (which sets track_id on existing journeys) already computes its summary from
-- the library row.
--
-- Body copied from 20260907180000_agent_context_revisions.sql with two changes:
-- track_keys no longer names the dropped columns, and the summary resolves
-- coords/waypoints from the linked track.

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
    perform 1 from public.journeys where id = target for update;
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

-- ─── agent revision: invalidate when a track's own geometry changes ─────────
--
-- agent_journey_revisions.track_summary is a derived cache of the track's
-- geometry. Editing a track row does not touch any journeys row, so the trigger
-- above would never fire and every journey referencing it would keep a stale
-- summary. This is cache invalidation, not data mirroring — the geometry itself
-- lives only in tracks.

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
    perform 1 from public.journeys where id = referrer.id for update;
    if not found then continue; end if;
    update public.agent_journey_revisions set
      track = track + 1,
      track_summary = public.agent_track_summary(new.coords, new.waypoints, referrer.dist, referrer.asc_)
    where journey_id = referrer.id;
  end loop;
  return new;
end;
$$;

drop trigger if exists agent_track_revision on public.tracks;
create trigger agent_track_revision
  after update of coords, waypoints on public.tracks
  for each row execute function public.agent_bump_track_referrers();

-- ─── backfill: inline geometry becomes library rows ─────────────────────────
--
-- The project is pre-release, but this database is not empty: it holds the
-- 哈天线 journey the agent regression fixtures point at. Every journey that
-- carries inline geometry gets its own library row first, so the drop below
-- takes no data with it.
--
-- dist_m/asc_m are recomputed rather than parsed out of journeys.dist/asc_:
-- those are display strings ("90 km") and were never a measurement.

do $$
declare
  source record;
  created uuid;
  distance int8;
  climb int8;
begin
  -- Re-running after the drop must be a no-op, not a missing-column error.
  if not exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'journeys' and column_name = 'track_coords') then
    return;
  end if;

  for source in
    select id, user_id, name, file_name, file_url, coords, elevation, duration_ms, waypoints
    from (
      select id, user_id, name, track_file_name as file_name, track_file_url as file_url,
             track_coords as coords, track_elevation as elevation,
             track_duration_ms as duration_ms, track_waypoints as waypoints
      from public.journeys
      where jsonb_array_length(
              case when jsonb_typeof(track_coords) = 'array' then track_coords else '[]'::jsonb end) > 1
    ) candidates
  loop
    -- Same haversine the agent summary uses, summed over every segment.
    -- The first point has no predecessor, and PostgreSQL's LEAST(1.0, NULL) is
    -- 1.0 rather than NULL, so it is excluded explicitly instead of summing a
    -- spurious half-circumference.
    select coalesce(round(sum(segment_km) * 1000), 0)::int8
    into distance
    from (
      select case when prev_lat is null or prev_lng is null then 0 else
               6371 * 2 * asin(sqrt(least(1.0,
                 power(sin(radians(lat - prev_lat) / 2), 2)
                 + cos(radians(lat)) * cos(radians(prev_lat)) * power(sin(radians(lng - prev_lng) / 2), 2))))
             end as segment_km
      from (
        select (point->>0)::float8 as lng, (point->>1)::float8 as lat,
               lag((point->>0)::float8) over (order by ord) as prev_lng,
               lag((point->>1)::float8) over (order by ord) as prev_lat
        from jsonb_array_elements(source.coords) with ordinality as p(point, ord)
        where jsonb_typeof(point) = 'array'
          and jsonb_typeof(point->0) = 'number' and jsonb_typeof(point->1) = 'number'
      ) points
    ) segments;

    select coalesce(sum(greatest(ele - prev_ele, 0)), 0)::int8
    into climb
    from (
      select (point->>'ele')::float8 as ele,
             lag((point->>'ele')::float8) over (order by ord) as prev_ele
      from jsonb_array_elements(
             case when jsonb_typeof(source.elevation) = 'array' then source.elevation else '[]'::jsonb end
           ) with ordinality as p(point, ord)
      where jsonb_typeof(point->'ele') = 'number'
    ) climbs;

    insert into public.tracks (user_id, name, file_name, file_format, file_url, coords, elevation,
                               duration_ms, waypoints, point_count, dist_m, asc_m)
    values (source.user_id, coalesce(nullif(btrim(source.name), ''), '轨迹'), source.file_name,
            case when lower(coalesce(source.file_name, '')) like '%.kmz' then 'kmz'
                 when lower(coalesce(source.file_name, '')) like '%.kml' then 'kml'
                 when lower(coalesce(source.file_name, '')) like '%.gpx' then 'gpx' end,
            source.file_url, source.coords, source.elevation, source.duration_ms, source.waypoints,
            jsonb_array_length(source.coords), distance, climb)
    returning id into created;

    update public.journeys set track_id = created where id = source.id;
  end loop;
end $$;

-- ─── drop the embedded-track columns ────────────────────────────────────────

alter table public.journeys
  drop column if exists track_coords,
  drop column if exists track_elevation,
  drop column if exists track_duration_ms,
  drop column if exists track_waypoints,
  drop column if exists track_file_url,
  drop column if exists track_file_name;

alter table public.routes
  drop column if exists track_coords,
  drop column if exists track_elevation,
  drop column if exists track_duration_ms,
  drop column if exists track_waypoints,
  drop column if exists track_file_url,
  drop column if exists track_file_name;

-- ─── journey version restore: track_id instead of six columns ───────────────
--
-- Body copied from 20260904170000_journey_complete_versions.sql with the six
-- track columns replaced by a single track_id. The lookup returns null when the
-- track has since been deleted, so restoring an old version cannot trip the FK.
--
-- Note that versions reference the track rather than copying it: editing a
-- track's geometry also changes what older versions show. That follows from
-- journeys pointing at one shared track, and the version UI does not surface a
-- per-version track diff.

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
  for update;
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

revoke all on function public.restore_journey_version(uuid) from public, anon;
grant execute on function public.restore_journey_version(uuid) to authenticated;

-- ─── agent journey creation: bind track_id instead of six columns ───────────
--
-- Body copied from 20260907130000_agent_background_jobs.sql. Dropping a column
-- does not invalidate a plpgsql body, so leaving the old version in place would
-- have failed at runtime on "column track_coords does not exist". The agent's
-- create_journey tool now creates the tracks row first and passes its id.

create or replace function public.create_agent_journey(p_thread_id uuid, p_journey jsonb, p_companion jsonb)
returns jsonb language plpgsql set search_path = public as $$
declare linked text; saved journeys%rowtype;
begin
  select current_journey_id into linked from agent_threads where id = p_thread_id and user_id = auth.uid() for update;
  if not found then raise exception 'Thread not found'; end if;
  if linked is not null then
    select * into saved from journeys where id = linked and deleted_at is null;
    if not found then raise exception 'Journey unavailable'; end if;
    return jsonb_build_object('id', saved.id, 'name', saved.name, 'region', saved.region, 'planned_date', saved.planned_date, 'total_days', saved.total_days);
  end if;
  if p_journey->>'user_id' <> auth.uid()::text or p_companion->>'user_id' <> auth.uid()::text or p_companion->>'journey_id' <> p_journey->>'id' then raise exception 'Owner mismatch'; end if;
  saved := jsonb_populate_record(null::journeys, p_journey);
  -- Ignore a track_id the caller does not own rather than failing the whole
  -- journey creation on a foreign-key violation.
  if saved.track_id is not null and not exists (
    select 1 from tracks where id = saved.track_id and user_id = auth.uid()
  ) then
    saved.track_id := null;
  end if;
  insert into journeys(id, user_id, route_id, name, region, coord, lng, lat, dist, asc_, diff, tone, "desc", date,
    planned_date, days, total_days, track_id)
  values(saved.id, auth.uid(), saved.route_id, saved.name, saved.region, saved.coord, saved.lng, saved.lat, saved.dist,
    saved.asc_, saved.diff, saved.tone, saved."desc", saved.date, saved.planned_date, saved.days, saved.total_days,
    saved.track_id)
  returning * into saved;
  insert into companions(user_id, journey_id, ini, name, color, is_host, is_self, sort_order)
    values(auth.uid(), saved.id, p_companion->>'ini', p_companion->>'name', p_companion->>'color', true, true, 0);
  update agent_threads set current_journey_id = saved.id where id = p_thread_id;
  return jsonb_build_object('id', saved.id, 'name', saved.name, 'region', saved.region, 'planned_date', saved.planned_date, 'total_days', saved.total_days);
end;
$$;
revoke all on function public.create_agent_journey(uuid, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.create_agent_journey(uuid, jsonb, jsonb) to authenticated;

commit;
