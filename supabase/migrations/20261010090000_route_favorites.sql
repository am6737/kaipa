-- Per-user favorites for the public route catalog.
create table if not exists public.route_favorites (
  user_id uuid not null references public.profiles(id) on delete cascade,
  route_id text not null references public.routes(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, route_id)
);
alter table public.route_favorites enable row level security;
drop policy if exists "route_favorites_select_own" on public.route_favorites;
create policy "route_favorites_select_own" on public.route_favorites for select to authenticated using (user_id = auth.uid());
drop policy if exists "route_favorites_insert_own" on public.route_favorites;
create policy "route_favorites_insert_own" on public.route_favorites for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "route_favorites_delete_own" on public.route_favorites;
create policy "route_favorites_delete_own" on public.route_favorites for delete to authenticated using (user_id = auth.uid());
