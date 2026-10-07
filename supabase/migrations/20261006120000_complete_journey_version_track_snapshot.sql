-- Historical journey previews must be self-contained. The journey row stores only
-- track_id, so capture the referenced track row in the same immutable snapshot.
create or replace function public.build_journey_version_snapshot(target_journey_id text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'journey', to_jsonb(journey),
    'track', (
      select to_jsonb(track)
      from public.tracks track
      where track.id = journey.track_id
    ),
    'companions', coalesce((
      select jsonb_agg(to_jsonb(companion) order by companion.sort_order, companion.id)
      from public.companions companion
      where companion.journey_id = journey.id
    ), '[]'::jsonb),
    'timelineGroups', coalesce((
      select jsonb_agg(to_jsonb(group_row) order by group_row.sort_order, group_row.id)
      from public.timeline_groups group_row
      where group_row.journey_id = journey.id
    ), '[]'::jsonb),
    'timelineRows', coalesce((
      select jsonb_agg(to_jsonb(timeline_row) order by timeline_row.sort_order, timeline_row.id)
      from public.timeline_rows timeline_row
      where timeline_row.journey_id = journey.id
    ), '[]'::jsonb),
    'moments', coalesce((
      select jsonb_agg(to_jsonb(moment) order by moment.created_at, moment.id)
      from public.inspo_media moment
      where moment.journey_id = journey.id
    ), '[]'::jsonb),
    'packingLists', coalesce((
      select jsonb_agg(to_jsonb(packing_list) order by packing_list.created_at, packing_list.id)
      from public.journey_packing_lists packing_list
      where packing_list.journey_id = journey.id
    ), '[]'::jsonb),
    'packingItems', coalesce((
      select jsonb_agg(to_jsonb(packing_item) order by packing_item.sort_order, packing_item.id)
      from public.journey_packing_items packing_item
      join public.journey_packing_lists packing_list on packing_list.id = packing_item.list_id
      where packing_list.journey_id = journey.id
    ), '[]'::jsonb)
  )
  from public.journeys journey
  where journey.id = target_journey_id;
$$;
