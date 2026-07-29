-- Journeys no longer have a lifecycle status. Sharing is controlled only by track_public.
drop policy if exists "journeys_public_select" on journeys;
create policy "journeys_public_select" on journeys
  for select to authenticated
  using (track_public = true);

alter table journeys drop column if exists status;
