begin;

-- Keep the refresh consistent with journey writes and their revision triggers.
set local lock_timeout = '10s';
lock table public.journeys in share row exclusive mode;

create or replace function public.agent_track_summary(coords jsonb, waypoints jsonb, distance text, ascent text)
returns jsonb language sql immutable set search_path = public as $$
  with points as (
    select ord, (point->>0)::double precision as lng, (point->>1)::double precision as lat
    from jsonb_array_elements(case when jsonb_typeof(coords) = 'array' then coords else '[]'::jsonb end) with ordinality as p(point, ord)
    where jsonb_typeof(point) = 'array' and jsonb_typeof(point->0) = 'number' and jsonb_typeof(point->1) = 'number'
      and abs((point->>0)::double precision) <= 180 and abs((point->>1)::double precision) <= 90
  ), segments as (
    select *, lag(lng) over(order by ord) as prev_lng, lag(lat) over(order by ord) as prev_lat from points
  )
  select case when count(*) < 2 then null else jsonb_build_object(
    'hasTrack', true, 'distance', distance, 'ascent', ascent, 'coordinateSystem', 'WGS84',
    -- PostgreSQL LEAST(1, NULL) is 1, so exclude the first point from the sum.
    'totalKm', coalesce(sum(6371 * 2 * asin(sqrt(least(1.0,
      power(sin(radians(lat-prev_lat)/2),2) + cos(radians(lat))*cos(radians(prev_lat))*power(sin(radians(lng-prev_lng)/2),2)))))
      filter (where prev_lng is not null and prev_lat is not null),0),
    'start', (select jsonb_build_array(lng,lat) from points order by ord limit 1),
    'end', (select jsonb_build_array(lng,lat) from points order by ord desc limit 1),
    'waypoints', coalesce(waypoints,'[]'::jsonb)
  ) end from segments;
$$;

-- Bump only changed track tokens so cached summaries and stale writes expire.
insert into public.agent_journey_revisions as revisions (journey_id, track_summary)
select id, public.agent_track_summary(track_coords, track_waypoints, dist, asc_)
from public.journeys
on conflict (journey_id) do update
set track_summary = excluded.track_summary, track = revisions.track + 1
where revisions.track_summary is distinct from excluded.track_summary;

commit;
