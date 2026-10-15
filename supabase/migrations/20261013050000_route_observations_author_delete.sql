begin;

-- Authors may remove their own observations outright (pending or approved);
-- helpful votes cascade with the row.
drop policy if exists route_observations_delete on public.route_observations;
create policy route_observations_delete on public.route_observations for delete to authenticated
  using (user_id = auth.uid());

notify pgrst, 'reload schema';
commit;
