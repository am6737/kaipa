-- Per-itinerary-group route boundary. The boundary is stored as cumulative
-- distance along the imported track plus its original segment position so
-- loops and self-intersections remain unambiguous.
alter table timeline_groups add column if not exists route_end_meters float8;
alter table timeline_groups add column if not exists route_end_lng float8;
alter table timeline_groups add column if not exists route_end_lat float8;
alter table timeline_groups add column if not exists route_end_track_index int4;
alter table timeline_groups add column if not exists route_end_track_fraction float8;
alter table timeline_groups add column if not exists route_end_source text
  check (route_end_source is null or route_end_source in ('waypoint', 'map', 'distance'));
alter table timeline_groups add column if not exists route_location_name text;
