create or replace function public.trim_journey_versions()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.journey_versions version
  where version.journey_id = new.journey_id
    and version.id in (
      select older.id
      from public.journey_versions older
      where older.journey_id = new.journey_id
      order by older.version_number desc
      offset 10
    );
  return new;
end;
$$;

drop trigger if exists journey_versions_trim_history on public.journey_versions;
create trigger journey_versions_trim_history
  after insert on public.journey_versions
  for each row execute function public.trim_journey_versions();

delete from public.journey_versions version
where version.id in (
  select old_version.id
  from (
    select id, row_number() over (partition by journey_id order by version_number desc) as position
    from public.journey_versions
  ) old_version
  where old_version.position > 10
);
