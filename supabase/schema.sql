-- kaipa schema — run against the shared Supabase Docker Postgres.
-- Tables are kaipa-specific; no naming conflicts with yibai.

-- ─── profiles ────────────────────────────────────────────────────────────────
create table if not exists profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  nick        text not null default '',
  username    text not null default '',
  bio         text not null default '',
  avatar_ini  text default '',
  avatar_color text default '#FF5C3A',
  avatar_url  text,
  gear_weight_unit text not null default 'kg' check (gear_weight_unit in ('kg','g','oz','lb')),
  created_at  timestamptz default now()
);
alter table profiles add column if not exists nick text not null default '';
alter table profiles add column if not exists username text not null default '';
alter table profiles add column if not exists bio text not null default '';
alter table profiles add column if not exists avatar_url text;
alter table profiles enable row level security;
create policy "profiles_select" on profiles for select to authenticated using (true);
create policy "profiles_update" on profiles for update to authenticated using (id = auth.uid());
create policy "profiles_insert" on profiles for insert to authenticated with check (id = auth.uid());

-- auto-create profile on signup
-- Private, optional inputs used for personal planning. Keep these separate
-- from profiles, whose public-facing fields are readable by signed-in users.
create table if not exists user_planning_profiles (
  user_id uuid primary key references profiles(id) on delete cascade,
  height_cm numeric check (height_cm is null or height_cm between 80 and 250),
  weight_kg numeric check (weight_kg is null or weight_kg between 25 and 300),
  age_years integer check (age_years is null or age_years between 10 and 100),
  dietary_restrictions text check (dietary_restrictions is null or char_length(dietary_restrictions) <= 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table user_planning_profiles enable row level security;
drop policy if exists "user_planning_profiles_select_own" on user_planning_profiles;
create policy "user_planning_profiles_select_own" on user_planning_profiles for select to authenticated using (user_id = auth.uid());
drop policy if exists "user_planning_profiles_insert_own" on user_planning_profiles;
create policy "user_planning_profiles_insert_own" on user_planning_profiles for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "user_planning_profiles_update_own" on user_planning_profiles;
create policy "user_planning_profiles_update_own" on user_planning_profiles for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "user_planning_profiles_delete_own" on user_planning_profiles;
create policy "user_planning_profiles_delete_own" on user_planning_profiles for delete to authenticated using (user_id = auth.uid());

create or replace function handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  profile_name text := coalesce(
    nullif(new.raw_user_meta_data ->> 'nickname', ''),
    nullif(new.raw_user_meta_data ->> 'display_name', ''),
    nullif(split_part(new.email, '@', 1), ''),
    '游客'
  );
begin
  insert into profiles (id, display_name, nick, avatar_ini)
  values (new.id, profile_name, profile_name, left(profile_name, 1));
  return new;
end;
$$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ─── routes (public catalog) ─────────────────────────────────────────────────
create table if not exists routes (
  id              text primary key,
  name            text not null,
  region          text not null,
  coord           text,
  lng             float8 not null,
  lat             float8 not null,
  dist            text,
  asc_            text,
  diff            text,
  rating          text,
  reviews         int4,
  tone            text not null,
  "desc"          text,
  track_coords    jsonb,
  track_elevation jsonb,
  track_duration_ms int8,
  track_waypoints jsonb,
  track_file_url  text,
  track_file_name text,
  photo_uris      jsonb,
  created_by      uuid references profiles(id) on delete set null,
  created_at      timestamptz default now()
);
alter table routes enable row level security;
alter table routes drop constraint if exists routes_created_by_fkey;
alter table routes
  add constraint routes_created_by_fkey
  foreign key (created_by) references profiles(id) on delete set null;
create policy "routes_select" on routes for select to authenticated using (true);
create policy "routes_insert" on routes for insert to authenticated with check (true);
drop policy if exists "routes_update" on routes;
create policy "routes_update" on routes for update to authenticated using (true) with check (true);

create or replace function public.account_storage_paths(account_id uuid)
returns table(path text)
language sql
security definer
set search_path = ''
as $$
  select objects.name
  from storage.objects
  where objects.bucket_id = 'kaipa'
    and (objects.owner_id = account_id::text or objects.owner = account_id);
$$;
revoke all on function public.account_storage_paths(uuid) from public, anon, authenticated;
grant execute on function public.account_storage_paths(uuid) to service_role;


-- migration: add columns/policies to existing routes tables (safe to re-run)
do $$ begin
  if not exists (select 1 from information_schema.columns where table_name='routes' and column_name='track_waypoints') then
    alter table routes add column track_waypoints jsonb;
  end if;
  if not exists (select 1 from information_schema.columns where table_name='routes' and column_name='track_file_url') then
    alter table routes add column track_file_url text;
  end if;
  if not exists (select 1 from information_schema.columns where table_name='routes' and column_name='track_file_name') then
    alter table routes add column track_file_name text;
  end if;
end $$;

-- ─── journeys (per-user) ─────────────────────────────────────────────────────
create table if not exists journeys (
  id              text primary key default 'j_' || gen_random_uuid()::text,
  user_id         uuid not null references profiles(id) on delete cascade,
  route_id        text references routes(id),
  name            text not null,
  region          text not null,
  coord           text,
  lng             float8 not null,
  lat             float8 not null,
  dist            text,
  asc_            text,
  diff            text,
  tone            text not null,
  "desc"          text,
  date            text,
  days            text,
  planned_date    text,
  countdown       int4,
  day_index       int4,
  total_days      int4,
  fav             boolean default false,
  track_coords    jsonb,
  track_elevation jsonb,
  track_duration_ms int8,
  track_waypoints jsonb,
  track_file_url  text,
  track_file_name text,
  hero_mode      text check (hero_mode in ('track', 'cover')),
  track_public    boolean default false,
  route_show_photos   boolean default true,
  route_show_timeline boolean default true,
  participant_permissions jsonb default '{"editTimeline":true,"addMoments":true,"editChecklist":false,"checkChecklistItems":true,"inviteParticipants":false}'::jsonb,
  photo_uris      jsonb,
  deleted_at      timestamptz,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);
alter table journeys add column if not exists deleted_at timestamptz;
alter table journeys enable row level security;
create policy "journeys_all" on journeys for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "journeys_public_select" on journeys for select to authenticated using (track_public = true and deleted_at is null);

-- migration: add columns to existing journeys tables (safe to re-run)
do $$ begin
  if not exists (select 1 from information_schema.columns where table_name='journeys' and column_name='hero_mode') then
    alter table journeys add column hero_mode text check (hero_mode in ('track', 'cover'));
  end if;
  if not exists (select 1 from information_schema.columns where table_name='journeys' and column_name='track_public') then
    alter table journeys add column track_public boolean default false;
  end if;
  if not exists (select 1 from information_schema.columns where table_name='journeys' and column_name='route_show_photos') then
    alter table journeys add column route_show_photos boolean default true;
  end if;
  if not exists (select 1 from information_schema.columns where table_name='journeys' and column_name='route_show_timeline') then
    alter table journeys add column route_show_timeline boolean default true;
  end if;
  if not exists (select 1 from information_schema.columns where table_name='journeys' and column_name='participant_permissions') then
    alter table journeys add column participant_permissions jsonb default '{"editTimeline":true,"addMoments":true,"editChecklist":false,"checkChecklistItems":true,"inviteParticipants":false}'::jsonb;
  end if;
  if not exists (select 1 from information_schema.columns where table_name='journeys' and column_name='track_file_url') then
    alter table journeys add column track_file_url text;
  end if;
  if not exists (select 1 from information_schema.columns where table_name='journeys' and column_name='track_file_name') then
    alter table journeys add column track_file_name text;
  end if;
  if not exists (select 1 from information_schema.columns where table_name='journeys' and column_name='track_waypoints') then
    alter table journeys add column track_waypoints jsonb;
  end if;
  if not exists (select 1 from information_schema.columns where table_name='journeys' and column_name='deleted_at') then
    alter table journeys add column deleted_at timestamptz;
  end if;
end $$;

-- ─── companions ──────────────────────────────────────────────────────────────
create table if not exists companions (
  id          serial primary key,
  user_id     uuid references profiles(id) on delete set null,
  journey_id  text not null references journeys(id) on delete cascade,
  ini         text not null,
  name        text not null,
  role        text,
  color       text not null,
  tone        text,
  avatar_url  text,
  trips       int4,
  is_host     boolean default false,
  is_self     boolean default false,
  sort_order  int4 default 0
);
do $$ begin
  if not exists (select 1 from information_schema.columns where table_name='companions' and column_name='avatar_url') then
    alter table companions add column avatar_url text;
  end if;
  if not exists (select 1 from information_schema.columns where table_name='companions' and column_name='user_id') then
    alter table companions add column user_id uuid references profiles(id) on delete set null;
  end if;
end $$;
alter table companions enable row level security;
create policy "companions_all" on companions for all to authenticated
  using (journey_id in (select id from journeys where user_id = auth.uid()))
  with check (journey_id in (select id from journeys where user_id = auth.uid()));

-- ─── gear_categories ─────────────────────────────────────────────────────────
create table if not exists gear_categories (
  id       text primary key default 'gc_' || gen_random_uuid()::text,
  user_id  uuid not null references profiles(id) on delete cascade,
  name     text not null,
  color    text not null,
  builtin  boolean default false,
  created_at timestamptz default now()
);
alter table gear_categories enable row level security;
create policy "gear_cats_select" on gear_categories for select to authenticated
  using (user_id = auth.uid());
create policy "gear_cats_insert" on gear_categories for insert to authenticated
  with check (user_id = auth.uid());
create policy "gear_cats_update" on gear_categories for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "gear_cats_delete" on gear_categories for delete to authenticated
  using (user_id = auth.uid());

-- Default categories are templates copied into each new user's own library.
-- After creation they behave exactly like categories created by the user.
create or replace function create_default_gear_categories()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into gear_categories (user_id, name, color, builtin) values
    (new.id, '背负系统', '#FF3B30', false),
    (new.id, '庇护系统', '#FF9500', false),
    (new.id, '睡眠系统', '#5856D6', false),
    (new.id, '服饰系统', '#34C759', false),
    (new.id, '饮食系统', '#00C7BE', false),
    (new.id, '电子导航', '#32ADE6', false),
    (new.id, '安全急救', '#FF2D55', false),
    (new.id, '其他', '#8E8E93', false);
  return new;
end;
$$;
drop trigger if exists on_profile_created_create_gear_categories on profiles;
create trigger on_profile_created_create_gear_categories
  after insert on profiles
  for each row execute function create_default_gear_categories();

-- ─── gear_items ──────────────────────────────────────────────────────────────
create table if not exists gear_items (
  id       serial primary key,
  user_id  uuid not null references profiles(id) on delete cascade,
  name     text not null,
  cat_id   text references gear_categories(id) on delete set null,
  weight   float8 not null,
  price    int4 not null,
  qty      int4 default 1,
  photo_uris jsonb,
  attrs    jsonb,
  note     text,
  status   text not null default 'packed' check (status in ('packed','worn','consumable','optional')),
  created_at timestamptz default now()
);
alter table gear_items enable row level security;
create policy "gear_items_all" on gear_items for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ─── gear_sets ───────────────────────────────────────────────────────────────
create table if not exists gear_sets (
  id       text primary key default 'gs_' || gen_random_uuid()::text,
  user_id  uuid not null references profiles(id) on delete cascade,
  name     text not null,
  description text,
  created_at timestamptz default now()
);
alter table gear_sets enable row level security;
create policy "gear_sets_all" on gear_sets for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create table if not exists gear_set_items (
  set_id  text not null references gear_sets(id) on delete cascade,
  item_id int4 not null references gear_items(id) on delete cascade,
  qty     int4 check (qty is null or qty > 0),
  status  text check (status is null or status in ('packed','worn','consumable','optional')),
  primary key (set_id, item_id)
);
alter table gear_set_items enable row level security;
create policy "gear_set_items_all" on gear_set_items for all to authenticated
  using (set_id in (select id from gear_sets where user_id = auth.uid()))
  with check (set_id in (select id from gear_sets where user_id = auth.uid()));

-- ─── notifications ───────────────────────────────────────────────────────────
create table if not exists notifications (
  id         text primary key default 'n_' || gen_random_uuid()::text,
  user_id    uuid not null references profiles(id) on delete cascade,
  kind       text not null,
  cat        text not null,
  bucket     text not null,
  time       text not null,
  who        text,
  avatar     text,
  color      text,
  verb       text not null,
  target     text,
  target_id  text,
  action     text,
  thumb      text,
  read       boolean default false,
  created_at timestamptz default now()
);
alter table notifications enable row level security;
create policy "notif_all" on notifications for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ─── timeline_rows ───────────────────────────────────────────────────────────
create table if not exists timeline_rows (
  id         text primary key,
  journey_id text not null references journeys(id) on delete cascade,
  user_id    uuid not null references profiles(id) on delete cascade,
  title      text not null,
  day        text not null,
  media        jsonb,
  time_mins    int4,
  time_end_mins int4,
  is_synth   boolean default false,
  is_custom  boolean default false,
  checked    boolean default false,
  sort_order int4 default 0
);
alter table timeline_rows enable row level security;
create policy "tl_all" on timeline_rows for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ─── timeline_groups ─────────────────────────────────────────────────────────
create table if not exists timeline_groups (
  id         text primary key default 'tg_' || gen_random_uuid()::text,
  journey_id text not null references journeys(id) on delete cascade,
  user_id    uuid not null references profiles(id) on delete cascade,
  name       text not null,
  deleted    boolean not null default false,
  sort_order int4 not null default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  route_end_meters float8,
  route_end_lng float8,
  route_end_lat float8,
  route_end_track_index int4,
  route_end_track_fraction float8,
  route_end_source text check (route_end_source is null or route_end_source in ('waypoint', 'map', 'distance')),
  route_location_name text,
  unique (journey_id, name)
);
alter table timeline_groups enable row level security;
create policy "timeline_groups_all" on timeline_groups for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ─── inspo_media ─────────────────────────────────────────────────────────────
create table if not exists inspo_media (
  id               text primary key default 'im_' || gen_random_uuid()::text,
  journey_id       text not null references journeys(id) on delete cascade,
  user_id          uuid not null references profiles(id) on delete cascade,
  uri              text not null,
  kind             text not null,
  thumbnail        text,
  duration         float8,
  paired_video_uri text,
  caption          text,
  created_at       timestamptz default now()
);
alter table inspo_media enable row level security;
create policy "inspo_all" on inspo_media for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());


-- ─── journey checklists ──────────────────────────────────────────────────────
-- Full idempotent migration and RLS policies live in supabase/journey-checklist.sql.





-- BEGIN journey-packing-lists.sql (kept in sync for fresh schema installs)
-- Per-participant packing lists plus one shared list for each journey.
-- This supersedes the earlier responsibility-board checklist model.

alter table companions add column if not exists user_id uuid references profiles(id) on delete set null;

-- Older journeys were created before companions.user_id existed. Link the host/self
-- companion to the journey owner so personal packing lists can sync under RLS.
update companions c
set user_id = j.user_id
from journeys j
where c.journey_id = j.id
  and c.user_id is null
  and (c.is_self = true or c.is_host = true);

create table if not exists journey_packing_lists (
  id uuid primary key default gen_random_uuid(),
  journey_id text not null references journeys(id) on delete cascade,
  kind text not null check (kind in ('personal', 'shared')),
  owner_companion_id integer references companions(id) on delete cascade,
  created_by uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((kind = 'shared' and owner_companion_id is null) or (kind = 'personal' and owner_companion_id is not null))
);

create unique index if not exists journey_packing_shared_unique on journey_packing_lists(journey_id) where kind = 'shared';
create unique index if not exists journey_packing_personal_unique on journey_packing_lists(journey_id, owner_companion_id) where kind = 'personal';

create table if not exists journey_packing_items (
  id uuid primary key default gen_random_uuid(),
  list_id uuid not null references journey_packing_lists(id) on delete cascade,
  source_type text not null check (source_type in ('gear', 'gearSet', 'recommendedTemplate', 'custom')),
  source_gear_item_id bigint references gear_items(id) on delete set null,
  name text not null,
  category_name text,
  category_color text,
  quantity integer not null default 1 check (quantity > 0),
  weight_kg numeric,
  weight_estimated boolean,
  carry_status text check (carry_status in ('packed', 'worn', 'consumable', 'optional')),
  attrs jsonb,
  note text,
  packed boolean not null default false,
  carrier_companion_id integer references companions(id) on delete set null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table journey_packing_items add column if not exists weight_estimated boolean;
alter table journey_packing_items add column if not exists carry_status text check (carry_status in ('packed', 'worn', 'consumable', 'optional'));
alter table journey_packing_items add column if not exists attrs jsonb;

create index if not exists journey_packing_items_list_idx on journey_packing_items(list_id);

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
grant execute on function public.is_journey_member(text) to authenticated;

alter table journey_packing_lists enable row level security;
alter table journey_packing_items enable row level security;

drop policy if exists "journey_packing_lists_select" on journey_packing_lists;
create policy "journey_packing_lists_select" on journey_packing_lists for select to authenticated
  using (public.is_journey_member(journey_id));

drop policy if exists "journey_packing_lists_insert" on journey_packing_lists;
create policy "journey_packing_lists_insert" on journey_packing_lists for insert to authenticated with check (
  created_by = auth.uid() and public.is_journey_member(journey_id)
);

drop policy if exists "journey_packing_lists_update" on journey_packing_lists;
create policy "journey_packing_lists_update" on journey_packing_lists for update to authenticated using (
  public.is_journey_member(journey_id)
) with check (public.is_journey_member(journey_id));

drop policy if exists "journey_packing_lists_delete" on journey_packing_lists;
create policy "journey_packing_lists_delete" on journey_packing_lists for delete to authenticated using (
  exists (select 1 from journeys j where j.id = journey_id and j.user_id = auth.uid())
);

drop policy if exists "journey_packing_items_select" on journey_packing_items;
create policy "journey_packing_items_select" on journey_packing_items for select to authenticated using (
  exists (select 1 from journey_packing_lists l where l.id = list_id and public.is_journey_member(l.journey_id))
);

drop policy if exists "journey_packing_items_insert" on journey_packing_items;
create policy "journey_packing_items_insert" on journey_packing_items for insert to authenticated with check (
  exists (
    select 1 from journey_packing_lists l
    join journeys j on j.id = l.journey_id
    left join companions owner on owner.id = l.owner_companion_id
    where l.id = list_id and (
      j.user_id = auth.uid()
      or owner.user_id = auth.uid()
      or (l.kind = 'shared' and coalesce((j.participant_permissions->>'editChecklist')::boolean, false))
    )
  )
);

drop policy if exists "journey_packing_items_update" on journey_packing_items;
create policy "journey_packing_items_update" on journey_packing_items for update to authenticated using (
  exists (
    select 1 from journey_packing_lists l
    join journeys j on j.id = l.journey_id
    left join companions owner on owner.id = l.owner_companion_id
    left join companions carrier on carrier.id = carrier_companion_id
    where l.id = list_id and (
      j.user_id = auth.uid()
      or owner.user_id = auth.uid()
      or (l.kind = 'shared' and (
        coalesce((j.participant_permissions->>'editChecklist')::boolean, false)
        or carrier.user_id = auth.uid()
        or carrier_companion_id is null
      ))
    )
  )
) with check (
  exists (select 1 from journey_packing_lists l where l.id = list_id and public.is_journey_member(l.journey_id))
);

drop policy if exists "journey_packing_items_delete" on journey_packing_items;
create policy "journey_packing_items_delete" on journey_packing_items for delete to authenticated using (
  exists (
    select 1 from journey_packing_lists l
    join journeys j on j.id = l.journey_id
    left join companions owner on owner.id = l.owner_companion_id
    where l.id = list_id and (j.user_id = auth.uid() or owner.user_id = auth.uid() or coalesce((j.participant_permissions->>'editChecklist')::boolean, false))
  )
);

create or replace function public.send_journey_packing_reminder(target_companion_id integer, remaining_count integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_companion companions%rowtype;
  source_companion companions%rowtype;
  target_journey journeys%rowtype;
begin
  select * into target_companion from companions where id = target_companion_id;
  if target_companion.id is null or target_companion.user_id is null then return; end if;
  if not public.is_journey_member(target_companion.journey_id) then
    raise exception 'not a journey member';
  end if;
  select * into target_journey from journeys where id = target_companion.journey_id;
  select * into source_companion from companions where journey_id = target_companion.journey_id and user_id = auth.uid() limit 1;
  insert into notifications (user_id, kind, cat, bucket, time, who, avatar, color, verb, target, target_id, action)
  values (
    target_companion.user_id,
    'trip',
    'social',
    'today',
    '刚刚',
    coalesce(source_companion.name, '旅程伙伴'),
    source_companion.avatar_url,
    source_companion.color,
    '提醒你还有 ' || greatest(remaining_count, 0) || ' 件装备未准备',
    target_journey.name,
    target_journey.id,
    '查看装备清单'
  );
end;
$$;

grant execute on function public.send_journey_packing_reminder(integer, integer) to authenticated;

-- BEGIN app-agent.sql (kept in sync for fresh schema installs)
create table if not exists agent_threads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  current_journey_id text references journeys(id) on delete cascade,
  title text not null default '新对话',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table agent_threads add column if not exists current_journey_id text references journeys(id) on delete cascade;
create table if not exists agent_session_items (
  id bigint generated always as identity primary key,
  thread_id uuid not null references agent_threads(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  item jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists agent_session_items_thread_idx on agent_session_items(thread_id, id);
create table if not exists agent_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references agent_threads(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  ui jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
alter table agent_messages add column if not exists ui jsonb not null default '{}'::jsonb;
create index if not exists agent_messages_thread_idx on agent_messages(thread_id, created_at);
create table if not exists agent_runs (
  id uuid primary key,
  thread_id uuid not null references agent_threads(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  status text not null check (status in ('running', 'completed', 'failed')),
  final_output text,
  error text,
  agent_version text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists agent_runs_thread_idx on agent_runs(thread_id, created_at desc);
create unique index if not exists agent_runs_thread_active_unique
  on agent_runs(thread_id) where status = 'running';
create table if not exists agent_tool_calls (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references agent_runs(id) on delete cascade,
  thread_id uuid not null references agent_threads(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  tool_name text not null,
  arguments jsonb not null,
  arguments_hash text not null,
  status text not null check (status in ('running', 'completed', 'failed')),
  output jsonb,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (run_id, tool_name, arguments_hash)
);
alter table agent_tool_calls add column if not exists undo_payload jsonb;
alter table agent_tool_calls add column if not exists undone_at timestamptz;
alter table agent_threads enable row level security;
alter table agent_session_items enable row level security;
alter table agent_messages enable row level security;
alter table agent_runs enable row level security;
alter table agent_tool_calls enable row level security;
drop policy if exists "agent_threads_own" on agent_threads;
create policy "agent_threads_own" on agent_threads for all to authenticated
  using (
    user_id = auth.uid()
    and (
      current_journey_id is null
      or exists (select 1 from journeys j where j.id = current_journey_id and j.deleted_at is null)
    )
  )
  with check (
    user_id = auth.uid()
    and (
      current_journey_id is null
      or exists (select 1 from journeys j where j.id = current_journey_id and j.deleted_at is null)
    )
  );
drop policy if exists "agent_session_items_own" on agent_session_items;
create policy "agent_session_items_own" on agent_session_items for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "agent_messages_own" on agent_messages;
create policy "agent_messages_own" on agent_messages for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "agent_runs_own" on agent_runs;
create policy "agent_runs_own" on agent_runs for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "agent_tool_calls_own" on agent_tool_calls;
create policy "agent_tool_calls_own" on agent_tool_calls for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create or replace function public.apply_agent_itinerary(p_itinerary_rows jsonb, p_itinerary_groups jsonb)
returns void language plpgsql set search_path = public as $$
begin
  insert into timeline_groups (journey_id, user_id, name, deleted, sort_order, updated_at)
  select journey_id, user_id, name, deleted, sort_order, updated_at
  from jsonb_to_recordset(coalesce(p_itinerary_groups, '[]'::jsonb)) as item(journey_id text, user_id uuid, name text, deleted boolean, sort_order int4, updated_at timestamptz)
  on conflict (journey_id, name) do nothing;
  insert into timeline_rows (id, journey_id, user_id, title, day, time_mins, time_end_mins, is_synth, is_custom, checked, sort_order)
  select id, journey_id, user_id, title, day, time_mins, time_end_mins, is_synth, is_custom, checked, sort_order
  from jsonb_to_recordset(coalesce(p_itinerary_rows, '[]'::jsonb)) as item(id text, journey_id text, user_id uuid, title text, day text, time_mins int4, time_end_mins int4, is_synth boolean, is_custom boolean, checked boolean, sort_order int4);
end;
$$;
grant execute on function public.apply_agent_itinerary(jsonb, jsonb) to authenticated;
create or replace function public.finalize_agent_run(target_run_id uuid, assistant_message text, message_ui jsonb)
returns void language plpgsql set search_path = public as $$
declare
  run_record agent_runs%rowtype;
begin
  select * into run_record from agent_runs where id = target_run_id and user_id = auth.uid() and status = 'running' for update;
  if not found then raise exception 'Agent run is not active'; end if;
  update agent_runs set status = 'completed', final_output = assistant_message, updated_at = now() where id = target_run_id;
  insert into agent_messages (thread_id, user_id, role, content, ui) values (run_record.thread_id, run_record.user_id, 'assistant', assistant_message, coalesce(message_ui, '{}'::jsonb));
  update agent_threads set updated_at = now() where id = run_record.thread_id;
end;
$$;
grant execute on function public.finalize_agent_run(uuid, text, jsonb) to authenticated;
create or replace function public.undo_agent_run(target_run_id uuid)
returns jsonb language plpgsql set search_path = public as $$
declare
  call_record record;
  payload jsonb;
  undo_time timestamptz := now();
  previous_undo_time timestamptz;
  affected_count int := 0;
  affected_journey_id text;
begin
  if not exists (select 1 from agent_runs where id = target_run_id and user_id = auth.uid() and status = 'completed') then
    raise exception 'Agent run is not available for undo';
  end if;
  for call_record in
    select id, undo_payload from agent_tool_calls
    where run_id = target_run_id and user_id = auth.uid() and status = 'completed' and undo_payload is not null and undone_at is null
    order by created_at desc, id desc for update
  loop
    payload := call_record.undo_payload;
    affected_journey_id := coalesce(payload->>'journeyId', affected_journey_id);
    if payload->>'kind' = 'set_journey_map_location' then
      if exists (
        select 1
        from journeys current_journey
        where current_journey.id = payload->>'journeyId'
          and (
            current_journey.region is distinct from payload->'applied'->>'region'
            or current_journey.coord is distinct from payload->'applied'->>'coord'
            or current_journey.lng is distinct from (payload->'applied'->>'lng')::float8
            or current_journey.lat is distinct from (payload->'applied'->>'lat')::float8
          )
      ) then
        raise exception 'Journey map location changed after this agent run';
      end if;
      update journeys
      set region = payload->'previous'->>'region',
          coord = payload->'previous'->>'coord',
          lng = (payload->'previous'->>'lng')::float8,
          lat = (payload->'previous'->>'lat')::float8,
          updated_at = undo_time
      where id = payload->>'journeyId';
    elsif payload->>'kind' = 'add_packing_items' then
      delete from journey_packing_items where list_id = (payload->>'listId')::uuid and id in (select value::uuid from jsonb_array_elements_text(payload->'itemIds'));
      if coalesce((payload->>'createdList')::boolean, false) then
        delete from journey_packing_lists list where list.id = (payload->>'listId')::uuid and not exists (select 1 from journey_packing_items item where item.list_id = list.id);
      end if;
    elsif payload->>'kind' = 'set_itinerary_group_endpoints' then
      if exists (
        select 1
        from jsonb_to_recordset(payload->'applied') as expected(name text, route_end_meters float8, route_end_lng float8, route_end_lat float8, route_end_track_index int4, route_end_track_fraction float8, route_end_source text, route_location_name text)
        left join timeline_groups current_group on current_group.journey_id = payload->>'journeyId' and current_group.name = expected.name
        where current_group.name is null
          or current_group.route_end_meters is distinct from expected.route_end_meters
          or current_group.route_end_lng is distinct from expected.route_end_lng
          or current_group.route_end_lat is distinct from expected.route_end_lat
          or current_group.route_end_track_index is distinct from expected.route_end_track_index
          or current_group.route_end_track_fraction is distinct from expected.route_end_track_fraction
          or current_group.route_end_source is distinct from expected.route_end_source
          or current_group.route_location_name is distinct from expected.route_location_name
      ) then
        raise exception 'Itinerary endpoints changed after this agent run';
      end if;
      update timeline_groups group_row
      set route_end_meters = previous.route_end_meters, route_end_lng = previous.route_end_lng, route_end_lat = previous.route_end_lat,
          route_end_track_index = previous.route_end_track_index, route_end_track_fraction = previous.route_end_track_fraction,
          route_end_source = previous.route_end_source, route_location_name = previous.route_location_name, updated_at = undo_time
      from jsonb_to_recordset(payload->'previous') as previous(name text, route_end_meters float8, route_end_lng float8, route_end_lat float8, route_end_track_index int4, route_end_track_fraction float8, route_end_source text, route_location_name text)
      where group_row.journey_id = payload->>'journeyId' and group_row.name = previous.name;
    elsif payload->>'kind' = 'add_itinerary_items' then
      delete from timeline_rows where journey_id = payload->>'journeyId' and id in (select value from jsonb_array_elements_text(payload->'rowIds'));
      delete from timeline_groups group_row
      where group_row.journey_id = payload->>'journeyId'
        and group_row.name in (select value from jsonb_array_elements_text(payload->'createdGroupNames'))
        and group_row.route_end_meters is null
        and not exists (select 1 from timeline_rows row_item where row_item.journey_id = group_row.journey_id and row_item.day = group_row.name);
    else
      raise exception 'Unsupported agent undo operation';
    end if;
    update agent_tool_calls set undone_at = undo_time, updated_at = undo_time where id = call_record.id;
    affected_count := affected_count + 1;
  end loop;
  if affected_count = 0 then
    select max(undone_at) into previous_undo_time from agent_tool_calls where run_id = target_run_id and user_id = auth.uid() and undo_payload is not null;
    if previous_undo_time is null then raise exception 'Agent run has no reversible changes'; end if;
    undo_time := previous_undo_time;
  end if;
  update agent_messages
  set ui = jsonb_set(ui, '{undoAction,undoneAt}', to_jsonb(undo_time::text), true)
  where thread_id = (select thread_id from agent_runs where id = target_run_id) and ui->'undoAction'->>'runId' = target_run_id::text;
  return jsonb_build_object('undone', true, 'undoneAt', undo_time, 'journeyId', affected_journey_id, 'affectedOperations', affected_count);
end;
$$;
grant execute on function public.undo_agent_run(uuid) to authenticated;
-- END app-agent.sql

create index if not exists companions_user_id_idx on companions(user_id);

drop policy if exists "journeys_member_select" on journeys;
create policy "journeys_member_select" on journeys for select to authenticated
  using (deleted_at is null and public.is_journey_member(id));

drop policy if exists "companions_member_select" on companions;
create policy "companions_member_select" on companions for select to authenticated
  using (public.is_journey_member(journey_id));

-- Tighten item writes: personal lists are editable only by their owner; shared
-- lists are editable by the host or members with checklist-edit permission.
drop policy if exists "journey_packing_items_insert" on journey_packing_items;
create policy "journey_packing_items_insert" on journey_packing_items for insert to authenticated with check (
  exists (
    select 1 from journey_packing_lists l
    join journeys j on j.id = l.journey_id
    left join companions owner on owner.id = l.owner_companion_id
    where l.id = list_id and public.is_journey_member(l.journey_id) and (
      (l.kind = 'personal' and (owner.user_id = auth.uid() or j.user_id = auth.uid()))
      or (l.kind = 'shared' and (j.user_id = auth.uid() or coalesce((j.participant_permissions->>'editChecklist')::boolean, false)))
    )
  )
);

drop policy if exists "journey_packing_items_update" on journey_packing_items;
create policy "journey_packing_items_update" on journey_packing_items for update to authenticated using (
  exists (
    select 1 from journey_packing_lists l
    join journeys j on j.id = l.journey_id
    left join companions owner on owner.id = l.owner_companion_id
    left join companions carrier on carrier.id = carrier_companion_id
    where l.id = list_id and public.is_journey_member(l.journey_id) and (
      (l.kind = 'personal' and (owner.user_id = auth.uid() or j.user_id = auth.uid()))
      or (l.kind = 'shared' and (
        j.user_id = auth.uid()
        or coalesce((j.participant_permissions->>'editChecklist')::boolean, false)
        or carrier.user_id = auth.uid()
        or carrier_companion_id is null
      ))
    )
  )
) with check (
  exists (select 1 from journey_packing_lists l where l.id = list_id and public.is_journey_member(l.journey_id))
);

drop policy if exists "journey_packing_items_delete" on journey_packing_items;
create policy "journey_packing_items_delete" on journey_packing_items for delete to authenticated using (
  exists (
    select 1 from journey_packing_lists l
    join journeys j on j.id = l.journey_id
    left join companions owner on owner.id = l.owner_companion_id
    where l.id = list_id and public.is_journey_member(l.journey_id) and (
      (l.kind = 'personal' and (owner.user_id = auth.uid() or j.user_id = auth.uid()))
      or (l.kind = 'shared' and (j.user_id = auth.uid() or coalesce((j.participant_permissions->>'editChecklist')::boolean, false)))
    )
  )
);

-- END journey-packing-lists.sql

-- BEGIN journey version history
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
    journey_id, version_number, snapshot, changed_fields, change_kind,
    changed_by, changed_by_name, changed_at
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
  journey_id, version_number, snapshot, changed_fields, change_kind,
  changed_by, changed_by_name, changed_at
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
-- END journey version history
