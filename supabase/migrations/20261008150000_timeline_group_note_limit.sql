begin;

-- Preserve existing longer notes; new saves are limited to 100 characters.
create or replace function public.journey_save_timeline_group_note(
  p_journey_id text, p_day text, p_note text
) returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  perform 1 from public.journeys
    where id = p_journey_id and user_id = auth.uid()
    for no key update;
  if not found then
    raise exception 'Journey is not writable by this user' using errcode = '42501';
  end if;
  if p_day is null or char_length(coalesce(p_note, '')) > 100 then
    raise exception 'Invalid group note' using errcode = '22023';
  end if;
  if exists (select 1 from public.timeline_groups where journey_id = p_journey_id and name = p_day and deleted) then
    raise exception 'Timeline group is no longer available' using errcode = '22023';
  end if;
  insert into public.timeline_groups (journey_id, user_id, name, note, updated_at)
  values (p_journey_id, auth.uid(), p_day, nullif(btrim(p_note), ''), now())
  on conflict (journey_id, name) do update
    set note = excluded.note, updated_at = excluded.updated_at;
end;
$$;
revoke execute on function public.journey_save_timeline_group_note(text, text, text) from public, anon;
grant execute on function public.journey_save_timeline_group_note(text, text, text) to authenticated;

notify pgrst, 'reload schema';
commit;
