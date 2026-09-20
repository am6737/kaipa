-- Admin authorization is based on Supabase Auth app_metadata, which users
-- cannot edit themselves. Bootstrap the first owner with the SQL in the
-- admin README, then use the admin-api function for future role changes.
create or replace function public.admin_role()
returns text
language sql
stable
as $$
  select coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '');
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
as $$
  select public.admin_role() in ('owner', 'admin', 'editor', 'viewer');
$$;

create or replace function public.is_admin_editor()
returns boolean
language sql
stable
as $$
  select public.admin_role() in ('owner', 'admin', 'editor');
$$;

drop policy if exists profiles_admin_select on public.profiles;
create policy profiles_admin_select on public.profiles
  for select to authenticated using (public.is_admin());

drop policy if exists journeys_admin_select on public.journeys;
create policy journeys_admin_select on public.journeys
  for select to authenticated using (public.is_admin());

drop policy if exists journeys_admin_write on public.journeys;
create policy journeys_admin_write on public.journeys
  for all to authenticated using (public.is_admin_editor()) with check (public.is_admin_editor());

drop policy if exists gear_items_admin_select on public.gear_items;
create policy gear_items_admin_select on public.gear_items
  for select to authenticated using (public.is_admin());

drop policy if exists gear_items_admin_write on public.gear_items;
create policy gear_items_admin_write on public.gear_items
  for all to authenticated using (public.is_admin_editor()) with check (public.is_admin_editor());

create table if not exists public.admin_audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null references auth.users(id) on delete restrict,
  action text not null,
  resource_type text not null,
  resource_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
alter table public.admin_audit_logs enable row level security;
drop policy if exists admin_audit_logs_admin_select on public.admin_audit_logs;
create policy admin_audit_logs_admin_select on public.admin_audit_logs
  for select to authenticated using (public.is_admin());
revoke all on public.admin_audit_logs from anon, authenticated;
grant select on public.admin_audit_logs to authenticated;
grant all on public.admin_audit_logs to service_role;
