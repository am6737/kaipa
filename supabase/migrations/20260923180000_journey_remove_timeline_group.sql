-- Deleting a day was two client transactions — the day's rows, then its group
-- marked deleted — and every journey child write takes the journeys row lock and
-- rebuilds the version snapshot. So a single delete queued twice, and between the
-- two calls the rows were gone while the group still said otherwise.
-- journey_save_timeline_item() closed exactly that gap for a manual save; this
-- closes it for a day.
create or replace function public.journey_remove_timeline_group(
  p_journey_id text,
  p_day text
) returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  if p_day is null or btrim(p_day) = '' then
    raise exception 'A day group name is required' using errcode = '22023';
  end if;

  delete from public.timeline_rows
   where journey_id = p_journey_id
     and day = p_day;

  -- RLS filters a delete instead of refusing it, so "matched nothing" and "was
  -- not permitted" look alike from here. The caller drops the day locally on
  -- success, so a delete that left the caller's own rows behind has to be raised
  -- rather than reported as done. Another member's rows on that day are theirs to
  -- delete, not ours: they are not part of this check.
  if exists (
    select 1 from public.timeline_rows
    where journey_id = p_journey_id
      and day = p_day
      and user_id = auth.uid()
  ) then
    raise exception 'Timeline rows of this day are not writable by this user' using errcode = '42501';
  end if;

  insert into public.timeline_groups (journey_id, user_id, name, deleted, updated_at)
  values (p_journey_id, auth.uid(), p_day, true, now())
  on conflict (journey_id, name) do update set deleted = true, updated_at = now();
end;
$$;

comment on function public.journey_remove_timeline_group(text, text) is
  'Deletes a day''s itinerary rows and marks its group deleted in one transaction. An absent group is recorded as deleted so the day cannot return from leftover rows. The group policy is owner-scoped, so a non-owner''s call is refused whole (42501) rather than half-applied.';

revoke execute on function public.journey_remove_timeline_group(text, text) from public, anon;
grant execute on function public.journey_remove_timeline_group(text, text) to authenticated;
