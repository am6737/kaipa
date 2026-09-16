create table if not exists public.journey_versions (
  id uuid primary key default gen_random_uuid(),
  journey_id text not null references public.journeys(id) on delete cascade,
  version_number integer not null check (version_number > 0),
  snapshot jsonb not null,
  changed_fields text[] not null default '{}',
  change_kind text not null default 'update' check (change_kind in ('create', 'update', 'restore')),
  changed_by uuid references public.profiles(id) on delete set null,
  changed_by_name text not null default '',
  changed_at timestamptz not null default now(),
  unique (journey_id, version_number)
);

create index if not exists journey_versions_journey_changed_at_idx
  on public.journey_versions (journey_id, changed_at desc);

alter table public.journey_versions enable row level security;

drop policy if exists "journey_versions_member_select" on public.journey_versions;
create policy "journey_versions_member_select" on public.journey_versions
  for select to authenticated
  using (public.is_journey_member(journey_id));

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
  editor_name text := '';
  next_version integer;
  requested_kind text := current_setting('app.journey_change_kind', true);
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

  select coalesce(nullif(nick, ''), nullif(display_name, ''), '')
  into editor_name
  from public.profiles
  where id = auth.uid();

  select coalesce(max(version_number), 0) + 1
  into next_version
  from public.journey_versions
  where journey_id = new.id;

  insert into public.journey_versions (
    journey_id,
    version_number,
    snapshot,
    changed_fields,
    change_kind,
    changed_by,
    changed_by_name,
    changed_at
  ) values (
    new.id,
    next_version,
    next_snapshot,
    version_fields,
    case when tg_op = 'INSERT' then 'create'
         when requested_kind = 'restore' then 'restore'
         else 'update' end,
    auth.uid(),
    coalesce(editor_name, ''),
    case when tg_op = 'INSERT' then coalesce(new.created_at, now()) else now() end
  );

  return new;
end;
$$;

drop trigger if exists journeys_record_version on public.journeys;
create trigger journeys_record_version
  after insert or update on public.journeys
  for each row execute function public.record_journey_version();

insert into public.journey_versions (
  journey_id,
  version_number,
  snapshot,
  changed_fields,
  change_kind,
  changed_by,
  changed_by_name,
  changed_at
)
select
  journey.id,
  1,
  to_jsonb(journey),
  '{}',
  'create',
  journey.user_id,
  coalesce(nullif(profile.nick, ''), nullif(profile.display_name, ''), ''),
  coalesce(journey.updated_at, journey.created_at, now())
from public.journeys journey
left join public.profiles profile on profile.id = journey.user_id
where not exists (
  select 1 from public.journey_versions version where version.journey_id = journey.id
);

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
  payload jsonb;
begin
  if auth.uid() is null then
    raise exception 'JOURNEY_VERSION_AUTH_REQUIRED';
  end if;

  select * into target_version
  from public.journey_versions
  where id = target_version_id;

  if not found then
    raise exception 'JOURNEY_VERSION_NOT_FOUND';
  end if;

  select * into current_journey
  from public.journeys
  where id = target_version.journey_id
  for update;

  if not found or current_journey.user_id <> auth.uid() then
    raise exception 'JOURNEY_VERSION_RESTORE_FORBIDDEN';
  end if;

  payload := target_version.snapshot;
  perform set_config('app.journey_change_kind', 'restore', true);

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
    participant_permissions = coalesce(nullif(payload -> 'participant_permissions', 'null'::jsonb), participant_permissions),
    photo_uris = nullif(payload -> 'photo_uris', 'null'::jsonb),
    updated_at = now()
  where id = target_version.journey_id
  returning * into restored;

  return to_jsonb(restored);
end;
$$;

revoke all on function public.restore_journey_version(uuid) from public, anon;
grant execute on function public.restore_journey_version(uuid) to authenticated;
