-- kaipa schema — run against the shared Supabase Docker Postgres.
-- Tables are kaipa-specific; no naming conflicts with yibai.

-- ─── profiles ────────────────────────────────────────────────────────────────
create table if not exists profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  avatar_ini  text default '',
  avatar_color text default '#FF5C3A',
  gear_weight_unit text not null default 'kg' check (gear_weight_unit in ('kg','g','oz','lb')),
  created_at  timestamptz default now()
);
alter table profiles enable row level security;
create policy "profiles_select" on profiles for select to authenticated using (true);
create policy "profiles_update" on profiles for update to authenticated using (id = auth.uid());
create policy "profiles_insert" on profiles for insert to authenticated with check (id = auth.uid());

-- auto-create profile on signup
create or replace function handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into profiles (id, display_name, avatar_ini)
  values (new.id, coalesce(split_part(new.email, '@', 1), ''), '');
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
  created_by      uuid references profiles(id),
  created_at      timestamptz default now()
);
alter table routes enable row level security;
create policy "routes_select" on routes for select to authenticated using (true);
create policy "routes_insert" on routes for insert to authenticated with check (true);
drop policy if exists "routes_update" on routes;
create policy "routes_update" on routes for update to authenticated using (true) with check (true);


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
  track_public    boolean default false,
  route_show_photos   boolean default true,
  route_show_timeline boolean default true,
  participant_permissions jsonb default '{"editTimeline":true,"addMoments":true,"editChecklist":false,"checkChecklistItems":true,"inviteParticipants":false}'::jsonb,
  photo_uris      jsonb,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);
alter table journeys enable row level security;
create policy "journeys_all" on journeys for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "journeys_public_select" on journeys for select to authenticated using (track_public = true);

-- migration: add columns to existing journeys tables (safe to re-run)
do $$ begin
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
  note text,
  packed boolean not null default false,
  carrier_companion_id integer references companions(id) on delete set null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists journey_packing_items_list_idx on journey_packing_items(list_id);

create or replace function public.is_journey_member(target_journey_id text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from journeys j where j.id = target_journey_id and (
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

create index if not exists companions_user_id_idx on companions(user_id);

drop policy if exists "journeys_member_select" on journeys;
create policy "journeys_member_select" on journeys for select to authenticated
  using (public.is_journey_member(id));

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
      (l.kind = 'personal' and owner.user_id = auth.uid())
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
      (l.kind = 'personal' and owner.user_id = auth.uid())
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
      (l.kind = 'personal' and owner.user_id = auth.uid())
      or (l.kind = 'shared' and (j.user_id = auth.uid() or coalesce((j.participant_permissions->>'editChecklist')::boolean, false)))
    )
  )
);

-- END journey-packing-lists.sql
