begin;

create table if not exists public.route_guides (
  id uuid primary key default gen_random_uuid(),
  route_id text not null references public.routes(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (length(trim(title)) > 0),
  intro text not null default '',
  reflection text not null default '',
  plan jsonb not null,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  rejection_reason text,
  helpful_count integer not null default 0 check (helpful_count >= 0),
  submitted_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists route_guides_route_status_idx on public.route_guides(route_id, status, updated_at desc);
create index if not exists route_guides_author_idx on public.route_guides(author_id, updated_at desc);
alter table public.route_guides enable row level security;
drop policy if exists route_guides_read on public.route_guides;
create policy route_guides_read on public.route_guides for select to anon, authenticated
  using (status = 'approved' or author_id = auth.uid());
drop policy if exists route_guides_insert on public.route_guides;
create policy route_guides_insert on public.route_guides for insert to authenticated
  with check (author_id = auth.uid());
drop policy if exists route_guides_update on public.route_guides;
create policy route_guides_update on public.route_guides for update to authenticated
  using (author_id = auth.uid()) with check (author_id = auth.uid());
grant select, insert, update on public.route_guides to authenticated;
grant select on public.route_guides to anon;
notify pgrst, 'reload schema';
commit;
