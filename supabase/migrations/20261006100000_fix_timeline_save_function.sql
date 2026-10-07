create or replace function public.journey_save_timeline_item(
  p_id text, p_journey_id text, p_is_new boolean, p_fields jsonb
) returns jsonb
language plpgsql security invoker set search_path = public as $$
declare saved public.timeline_rows%rowtype; group_name text;
begin
  if p_is_new then
    insert into public.timeline_rows (
      id, journey_id, user_id, title, day, media, time_mins, time_end_mins,
      is_synth, is_custom, checked, item_kind, location, sort_order
    ) values (
      p_id, p_journey_id, auth.uid(), coalesce(p_fields->>'title', ''), coalesce(p_fields->>'day', ''),
      nullif(p_fields->'media', 'null'::jsonb), (p_fields->>'timeStart')::int4, (p_fields->>'timeEnd')::int4,
      false, true, false, coalesce(p_fields->>'kind', 'activity'),
      nullif(p_fields->'location', 'null'::jsonb), coalesce((p_fields->>'sortOrder')::int4, 0)
    ) returning * into saved;
  else
    update public.timeline_rows target set
      title = coalesce(p_fields->>'title', title),
      day = coalesce(p_fields->>'day', day),
      media = case when jsonb_exists(p_fields, 'media') then nullif(p_fields->'media', 'null'::jsonb) else media end,
      time_mins = case when jsonb_exists(p_fields, 'timeStart') then (p_fields->>'timeStart')::int4 else time_mins end,
      time_end_mins = case when jsonb_exists(p_fields, 'timeEnd') then (p_fields->>'timeEnd')::int4 else time_end_mins end,
      item_kind = coalesce(p_fields->>'kind', item_kind),
      location = case when jsonb_exists(p_fields, 'location') then nullif(p_fields->'location', 'null'::jsonb) else location end,
      sort_order = coalesce((p_fields->>'sortOrder')::int4, sort_order)
    where target.id = p_id and target.journey_id = p_journey_id
    returning * into saved;
    if not found then raise exception 'Timeline row is not writable by this user' using errcode = '42501'; end if;
  end if;
  group_name := nullif(saved.day, '');
  if group_name is not null then
    insert into public.timeline_groups (journey_id, user_id, name, deleted, updated_at)
    values (p_journey_id, auth.uid(), group_name, false, now())
    on conflict (journey_id, name) do update set deleted = false, updated_at = now();
  end if;
  return to_jsonb(saved);
end;
$$;

revoke execute on function public.journey_save_timeline_item(text, text, boolean, jsonb) from public, anon;
grant execute on function public.journey_save_timeline_item(text, text, boolean, jsonb) to authenticated;
