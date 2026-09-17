begin;

-- Sharing itinerary reads must not grant participants write access.
drop policy if exists "timeline_rows_member_select" on public.timeline_rows;
create policy "timeline_rows_member_select" on public.timeline_rows
  for select to authenticated
  using (public.is_journey_member(journey_id));

drop policy if exists "timeline_groups_member_select" on public.timeline_groups;
create policy "timeline_groups_member_select" on public.timeline_groups
  for select to authenticated
  using (public.is_journey_member(journey_id));

commit;
