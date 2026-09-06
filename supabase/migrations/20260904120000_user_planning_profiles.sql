-- Private optional inputs used only to personalize the current user's plans.
create table if not exists public.user_planning_profiles (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  height_cm numeric check (height_cm is null or height_cm between 80 and 250),
  weight_kg numeric check (weight_kg is null or weight_kg between 25 and 300),
  age_years integer check (age_years is null or age_years between 10 and 100),
  dietary_restrictions text check (dietary_restrictions is null or char_length(dietary_restrictions) <= 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.user_planning_profiles enable row level security;

drop policy if exists "user_planning_profiles_select_own" on public.user_planning_profiles;
create policy "user_planning_profiles_select_own"
  on public.user_planning_profiles for select to authenticated
  using (user_id = auth.uid());

drop policy if exists "user_planning_profiles_insert_own" on public.user_planning_profiles;
create policy "user_planning_profiles_insert_own"
  on public.user_planning_profiles for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists "user_planning_profiles_update_own" on public.user_planning_profiles;
create policy "user_planning_profiles_update_own"
  on public.user_planning_profiles for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "user_planning_profiles_delete_own" on public.user_planning_profiles;
create policy "user_planning_profiles_delete_own"
  on public.user_planning_profiles for delete to authenticated
  using (user_id = auth.uid());
