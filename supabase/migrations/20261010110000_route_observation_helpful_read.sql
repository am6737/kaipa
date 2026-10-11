begin;

grant select on public.route_observation_helpful_votes to anon, authenticated;
create policy route_observation_helpful_votes_read_own
  on public.route_observation_helpful_votes
  for select to authenticated
  using (user_id = auth.uid());

notify pgrst, 'reload schema';
commit;
