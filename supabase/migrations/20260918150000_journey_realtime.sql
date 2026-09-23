-- Broadcast journey and membership changes to every authorized signed-in device.
-- FULL identity keeps update/delete events useful for reconciliation.
-- But `replica identity full` takes ACCESS EXCLUSIVE, and journeys is the one table
-- every journey write locks, so only issue it when the identity is not already
-- FULL — otherwise re-applying this file freezes live journey editing for seconds
-- (measured 4.8 s on the dev database).
do $$
declare
  table_name text;
begin
  foreach table_name in array array['journeys', 'companions'] loop
    if exists (
      select 1 from pg_class
      where relnamespace = 'public'::regnamespace
        and relname = table_name
        and relreplident <> 'f'
    ) then
      execute format('alter table public.%I replica identity full', table_name);
    end if;
  end loop;
end;
$$;

do $$
declare
  table_name text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    return;
  end if;

  foreach table_name in array array['journeys', 'companions'] loop
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = table_name
    ) then
      execute format('alter publication supabase_realtime add table public.%I', table_name);
    end if;
  end loop;
end;
$$;
