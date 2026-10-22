begin;

-- Archived is final: a row that left publication must not come back unreviewed,
-- and the version a journey receipt points at must keep the content it had.
-- To bring a plan back, insert the next version and publish that.
create or replace function public.route_itineraries_guard() returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    if old.status = 'published' then raise exception 'published itinerary cannot be deleted'; end if;
    return old;
  end if;
  if tg_op = 'UPDATE' then
    if new.id is distinct from old.id or new.version is distinct from old.version or new.route_id is distinct from old.route_id then
      raise exception 'itinerary identity and route cannot change';
    end if;
    if old.status = 'archived' then
      raise exception 'archived itinerary cannot change; publish a new version';
    end if;
    if old.status = 'published' then
      if new.status not in ('published', 'archived')
        or (to_jsonb(new) - 'status' - 'is_default' - 'updated_at') is distinct from (to_jsonb(old) - 'status' - 'is_default' - 'updated_at') then
        raise exception 'published itinerary can only be archived or change its default';
      end if;
    end if;
    new.updated_at := now();
  else
    if exists (select 1 from public.route_itineraries where id = new.id and route_id <> new.route_id) then
      raise exception 'itinerary id belongs to another route';
    end if;
    -- Serialize inserts for one logical itinerary so concurrent versions cannot diverge.
    perform pg_advisory_xact_lock(hashtextextended(new.id::text, 0));
    if exists (select 1 from public.route_itineraries where id = new.id and route_id <> new.route_id) then
      raise exception 'itinerary id belongs to another route';
    end if;
  end if;
  return new;
end;
$$;

commit;
