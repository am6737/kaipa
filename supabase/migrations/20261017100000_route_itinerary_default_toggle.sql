begin;

-- The default flag is the route's recommendation, not plan content: changing it
-- must not mint a new version, which would strand open previews pinned to the
-- old one. Everything else on a published row stays frozen; swap defaults by
-- clearing the old one before setting the new one in one transaction.
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
