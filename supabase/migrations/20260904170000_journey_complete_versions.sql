alter table public.journey_versions
  add column if not exists transaction_id bigint;

create index if not exists journey_versions_journey_transaction_idx
  on public.journey_versions (journey_id, transaction_id)
  where transaction_id is not null;

create or replace function public.build_journey_version_snapshot(target_journey_id text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'journey', to_jsonb(journey),
    'companions', coalesce((
      select jsonb_agg(to_jsonb(companion) order by companion.sort_order, companion.id)
      from public.companions companion
      where companion.journey_id = journey.id
    ), '[]'::jsonb),
    'timelineGroups', coalesce((
      select jsonb_agg(to_jsonb(group_row) order by group_row.sort_order, group_row.id)
      from public.timeline_groups group_row
      where group_row.journey_id = journey.id
    ), '[]'::jsonb),
    'timelineRows', coalesce((
      select jsonb_agg(to_jsonb(timeline_row) order by timeline_row.sort_order, timeline_row.id)
      from public.timeline_rows timeline_row
      where timeline_row.journey_id = journey.id
    ), '[]'::jsonb),
    'moments', coalesce((
      select jsonb_agg(to_jsonb(moment) order by moment.created_at, moment.id)
      from public.inspo_media moment
      where moment.journey_id = journey.id
    ), '[]'::jsonb),
    'packingLists', coalesce((
      select jsonb_agg(to_jsonb(packing_list) order by packing_list.created_at, packing_list.id)
      from public.journey_packing_lists packing_list
      where packing_list.journey_id = journey.id
    ), '[]'::jsonb),
    'packingItems', coalesce((
      select jsonb_agg(to_jsonb(packing_item) order by packing_item.sort_order, packing_item.id)
      from public.journey_packing_items packing_item
      join public.journey_packing_lists packing_list on packing_list.id = packing_item.list_id
      where packing_list.journey_id = journey.id
    ), '[]'::jsonb)
  )
  from public.journeys journey
  where journey.id = target_journey_id;
$$;

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
begin
  if current_setting('app.journey_version_suppressed', true) = 'true' then
    return;
  end if;

  perform 1 from public.journeys where id = target_journey_id for update;
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
    and transaction_id = current_transaction
  order by version_number desc
  limit 1;

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
    changed_by, changed_by_name, changed_at, transaction_id
  ) values (
    target_journey_id,
    next_version,
    next_snapshot,
    coalesce(version_fields, '{}'),
    case when requested_kind in ('create', 'restore') then requested_kind else 'update' end,
    auth.uid(),
    coalesce(editor_name, ''),
    clock_timestamp(),
    current_transaction
  );
end;
$$;

create or replace function public.record_journey_version()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  previous_snapshot jsonb;
  next_snapshot jsonb := to_jsonb(new);
  version_fields text[] := '{}';
begin
  if tg_op = 'UPDATE' then
    previous_snapshot := to_jsonb(old);
    select coalesce(array_agg(key order by key), '{}')
    into version_fields
    from jsonb_object_keys(next_snapshot - 'updated_at') as key
    where (previous_snapshot - 'updated_at') -> key is distinct from (next_snapshot - 'updated_at') -> key;

    if coalesce(array_length(version_fields, 1), 0) = 0 then
      return new;
    end if;
  end if;

  perform public.save_journey_version(
    new.id,
    version_fields,
    case when tg_op = 'INSERT' then 'create'
         when current_setting('app.journey_change_kind', true) = 'restore' then 'restore'
         else 'update' end
  );
  return new;
end;
$$;

create or replace function public.record_journey_related_version()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_journey_id text;
  target_list_id uuid;
begin
  if current_setting('app.journey_version_suppressed', true) = 'true' then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  if tg_table_name = 'journey_packing_items' then
    if tg_op = 'DELETE' then target_list_id := old.list_id;
    else target_list_id := new.list_id;
    end if;
    select journey_id into target_journey_id
    from public.journey_packing_lists
    where id = target_list_id;
  else
    if tg_op = 'DELETE' then target_journey_id := old.journey_id;
    else target_journey_id := new.journey_id;
    end if;
  end if;

  if target_journey_id is not null then
    perform public.save_journey_version(target_journey_id, array[tg_argv[0]], 'update');
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists companions_record_journey_version on public.companions;
create trigger companions_record_journey_version
  after insert or update or delete on public.companions
  for each row execute function public.record_journey_related_version('companions');

drop trigger if exists timeline_groups_record_journey_version on public.timeline_groups;
create trigger timeline_groups_record_journey_version
  after insert or update or delete on public.timeline_groups
  for each row execute function public.record_journey_related_version('timeline');

drop trigger if exists timeline_rows_record_journey_version on public.timeline_rows;
create trigger timeline_rows_record_journey_version
  after insert or update or delete on public.timeline_rows
  for each row execute function public.record_journey_related_version('timeline');

drop trigger if exists inspo_media_record_journey_version on public.inspo_media;
create trigger inspo_media_record_journey_version
  after insert or update or delete on public.inspo_media
  for each row execute function public.record_journey_related_version('moments');

drop trigger if exists packing_lists_record_journey_version on public.journey_packing_lists;
create trigger packing_lists_record_journey_version
  after insert or update or delete on public.journey_packing_lists
  for each row execute function public.record_journey_related_version('checklist');

drop trigger if exists packing_items_record_journey_version on public.journey_packing_items;
create trigger packing_items_record_journey_version
  after insert or update or delete on public.journey_packing_items
  for each row execute function public.record_journey_related_version('checklist');

update public.journey_versions version
set snapshot = jsonb_set(
  public.build_journey_version_snapshot(version.journey_id),
  '{journey}',
  version.snapshot,
  true
)
where version.snapshot ? 'id';

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
    track_coords = nullif(payload -> 'track_coords', 'null'::jsonb),
    track_elevation = nullif(payload -> 'track_elevation', 'null'::jsonb),
    track_duration_ms = (payload ->> 'track_duration_ms')::int8,
    track_waypoints = nullif(payload -> 'track_waypoints', 'null'::jsonb),
    track_file_url = payload ->> 'track_file_url',
    track_file_name = payload ->> 'track_file_name',
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
