-- Prevent regular client sessions from modifying the shared route catalog.
-- Existing catalog rows with created_by = null remain readable but immutable.
drop policy if exists "routes_insert" on public.routes;
drop policy if exists "routes_update" on public.routes;
drop policy if exists "routes_insert_owner" on public.routes;
drop policy if exists "routes_update_owner" on public.routes;

create policy "routes_insert_owner" on public.routes for insert to authenticated
  with check (created_by = auth.uid());

create policy "routes_update_owner" on public.routes for update to authenticated
  using (created_by = auth.uid())
  with check (created_by = auth.uid());
