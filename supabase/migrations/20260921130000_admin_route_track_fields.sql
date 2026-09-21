-- Routes created from uploaded user tracks retain the parsed geometry and file.
do $$ begin
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='routes' and column_name='track_coords') then alter table public.routes add column track_coords jsonb; end if;
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='routes' and column_name='track_elevation') then alter table public.routes add column track_elevation jsonb; end if;
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='routes' and column_name='track_duration_ms') then alter table public.routes add column track_duration_ms int8; end if;
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='routes' and column_name='track_waypoints') then alter table public.routes add column track_waypoints jsonb; end if;
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='routes' and column_name='track_file_url') then alter table public.routes add column track_file_url text; end if;
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='routes' and column_name='track_file_name') then alter table public.routes add column track_file_name text; end if;
end $$;
