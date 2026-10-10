begin;

create table if not exists public.route_observations (
  id uuid primary key default gen_random_uuid(),
  route_id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  author_name text not null default 'Kaipa 用户',
  visited_at timestamptz not null default now(),
  section text not null default '',
  body text not null default '',
  media jsonb not null default '[]'::jsonb,
  moderation_status text not null default 'pending' check (moderation_status in ('pending','approved','rejected')),
  helpful_count integer not null default 0 check (helpful_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint route_observations_content_check check (length(trim(body)) > 0 or jsonb_array_length(media) > 0)
);

create index if not exists route_observations_route_idx on public.route_observations(route_id, created_at desc);
alter table public.route_observations enable row level security;
drop policy if exists route_observations_read on public.route_observations;
create policy route_observations_read on public.route_observations for select to anon, authenticated
  using (moderation_status = 'approved' or user_id = auth.uid());
drop policy if exists route_observations_insert on public.route_observations;
create policy route_observations_insert on public.route_observations for insert to authenticated
  with check (user_id = auth.uid());
drop policy if exists route_observations_update on public.route_observations;
create policy route_observations_update on public.route_observations for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create or replace function public.route_observation_helpful(p_id uuid)
returns void language sql security invoker as $$
  update public.route_observations set helpful_count = helpful_count + 1, updated_at = now()
  where id = p_id and (moderation_status = 'approved' or user_id = auth.uid());
$$;
notify pgrst, 'reload schema';
commit;
