-- How many walking days a route takes, as the set of usual ways to walk it:
-- {1,2,3} = a long day or split over two or three; {3,5} = three or five days,
-- with no common four-day plan. Null = unknown. Same shape as best_months.
alter table public.routes add column if not exists days smallint[];

-- Replaces the short-lived days_min / days_max pair: expand each range.
do $$ begin
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'routes' and column_name = 'days_min') then
    update public.routes
      set days = array(select generate_series(days_min::int, coalesce(days_max, days_min)::int)::smallint)
      where days_min is not null and days is null;
    alter table public.routes drop constraint if exists routes_days_range_check;
    alter table public.routes drop column days_min;
    alter table public.routes drop column if exists days_max;
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'routes_days_check') then
    alter table public.routes add constraint routes_days_check check (
      days is null or (cardinality(days) > 0 and 1 <= all(days) and 60 >= all(days))
    );
  end if;
end $$;
