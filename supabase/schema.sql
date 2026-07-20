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
  status          text not null default 'planning',
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
  track_public    boolean default false,
  route_show_photos   boolean default true,
  route_show_timeline boolean default true,
  photo_uris      jsonb,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);
alter table journeys enable row level security;
create policy "journeys_all" on journeys for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "journeys_public_select" on journeys for select to authenticated using (track_public = true and status = 'completed');

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
  if not exists (select 1 from information_schema.columns where table_name='journeys' and column_name='track_waypoints') then
    alter table journeys add column track_waypoints jsonb;
  end if;
end $$;

-- ─── companions ──────────────────────────────────────────────────────────────
create table if not exists companions (
  id          serial primary key,
  journey_id  text not null references journeys(id) on delete cascade,
  ini         text not null,
  name        text not null,
  role        text,
  color       text not null,
  tone        text,
  trips       int4,
  is_host     boolean default false,
  is_self     boolean default false,
  sort_order  int4 default 0
);
alter table companions enable row level security;
create policy "companions_all" on companions for all to authenticated
  using (journey_id in (select id from journeys where user_id = auth.uid()))
  with check (journey_id in (select id from journeys where user_id = auth.uid()));

-- ─── gear_categories ─────────────────────────────────────────────────────────
create table if not exists gear_categories (
  id       text primary key default 'gc_' || gen_random_uuid()::text,
  user_id  uuid references profiles(id) on delete cascade,
  name     text not null,
  color    text not null,
  builtin  boolean default false,
  created_at timestamptz default now()
);
alter table gear_categories enable row level security;
create policy "gear_cats_select" on gear_categories for select to authenticated
  using (builtin = true or user_id = auth.uid());
create policy "gear_cats_insert" on gear_categories for insert to authenticated
  with check (user_id = auth.uid());
create policy "gear_cats_update" on gear_categories for update to authenticated
  using (user_id = auth.uid());
create policy "gear_cats_delete" on gear_categories for delete to authenticated
  using (user_id = auth.uid());

-- ─── gear_items ──────────────────────────────────────────────────────────────
create table if not exists gear_items (
  id       serial primary key,
  user_id  uuid not null references profiles(id) on delete cascade,
  name     text not null,
  cat_id   text not null references gear_categories(id),
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
