begin;

-- One transaction, so a failed/stale reorder cannot save only half the list.
create or replace function public.journey_reorder_timeline_items(
  p_journey_id text, p_day text, p_ids text[]
) returns jsonb
language plpgsql security invoker set search_path = public as $$
declare expected_count integer; changed_count integer; result jsonb;
begin
  -- Shares the lock taken by journey edits/version snapshots. RLS applies to
  -- both this lock and the UPDATE below; viewing a journey is not edit access.
  perform 1 from public.journeys where id = p_journey_id for update;
  if not found then
    raise exception 'Journey is not writable by this user' using errcode = '42501';
  end if;
  if p_day is null or p_ids is null or cardinality(p_ids) = 0
     or array_position(p_ids, null) is not null
     or (select count(distinct id) from unnest(p_ids) id) <> cardinality(p_ids) then
    raise exception 'A complete, unique list of item ids is required' using errcode = '22023';
  end if;
  select count(*) into expected_count from public.timeline_rows
    where journey_id = p_journey_id and day = p_day;
  if expected_count <> cardinality(p_ids) or exists (
    select 1 from unnest(p_ids) as requested(id) where not exists (
      select 1 from public.timeline_rows r
      where r.id = requested.id and r.journey_id = p_journey_id and r.day = p_day
    )
  ) then
    raise exception 'Timeline group changed; reload before reordering' using errcode = '22023';
  end if;
  update public.timeline_rows r set sort_order = ordered.position - 1
    from unnest(p_ids) with ordinality as ordered(id, position)
    where r.id = ordered.id and r.journey_id = p_journey_id and r.day = p_day;
  get diagnostics changed_count = row_count;
  if changed_count <> expected_count then
    raise exception 'Timeline group is not writable by this user' using errcode = '42501';
  end if;
  select jsonb_agg(to_jsonb(r) order by r.sort_order, r.id) into result
    from public.timeline_rows r where r.journey_id = p_journey_id and r.day = p_day;
  return result;
end;
$$;

revoke execute on function public.journey_reorder_timeline_items(text, text, text[]) from public, anon;
grant execute on function public.journey_reorder_timeline_items(text, text, text[]) to authenticated;
notify pgrst, 'reload schema';
commit;
