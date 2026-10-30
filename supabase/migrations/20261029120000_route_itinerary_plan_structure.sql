-- Official plans name where each walking day goes on the route's own track, and
-- where and when the trip meets its shared ride and gets back to town.
--
-- days[].stops: places on the route track with the route's stated km, at least
--   two on a walking day (its start and its end), never going back along the
--   track. A plan sets them on every walking day or on none.
-- access: the town and meeting point the walk's shared ride leaves from, the
--   latest train arrival that still makes it (arriveBy) and the stations to
--   arrive at. exit: the town the walk returns to, from when a train home can
--   be caught (readyAt) and the stations to leave from.
-- The planner reads these to set each day's end on the track and to decide from
-- the timetable whether the trip needs a travel day at either end.

create or replace function public.route_itinerary_plan_errors(payload jsonb)
returns text[] language plpgsql immutable set search_path = public as $$
declare
  errors text[] := array[]::text[];
  day jsonb;
  stop jsonb;
  station jsonb;
  side text;
  path text;
  i int;
  j int;
  first_km numeric;
  last_km numeric;
  previous_km numeric := null;
  staged int := 0;
  walking int := 0;
begin
  if jsonb_typeof(payload) is distinct from 'object' or jsonb_typeof(payload->'days') is distinct from 'array' then
    return errors;
  end if;

  foreach side in array array['access','exit'] loop
    continue when not payload ? side or jsonb_typeof(payload->side) = 'null';
    if jsonb_typeof(payload->side) is distinct from 'object' then
      errors := array_append(errors, side || ' must be an object or null');
      continue;
    end if;
    if jsonb_typeof(payload->side->'town') is distinct from 'string' or length(payload->side->>'town') not between 1 and 20 then
      errors := array_append(errors, side || '.town must be 1-20 characters');
    end if;
    if side = 'access' and (jsonb_typeof(payload->side->'meetingPoint') is distinct from 'string'
      or length(payload->side->>'meetingPoint') not between 1 and 40) then
      errors := array_append(errors, 'access.meetingPoint must be 1-40 characters');
    end if;
    path := side || case side when 'access' then '.arriveBy' else '.readyAt' end;
    if jsonb_typeof(payload #> string_to_array(replace(path, '.', ','), ',')) is distinct from 'string'
      or (payload #>> string_to_array(replace(path, '.', ','), ',')) !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then
      errors := array_append(errors, path || ' must be HH:MM');
    end if;
    if jsonb_typeof(payload->side->'stations') is distinct from 'array' or jsonb_array_length(payload->side->'stations') not between 1 and 3 then
      errors := array_append(errors, side || '.stations must contain 1-3 items');
    else
      for j in 0..jsonb_array_length(payload->side->'stations') - 1 loop
        station := payload->side->'stations'->j;
        if jsonb_typeof(station->'name') is distinct from 'string' or length(station->>'name') not between 1 and 20 then
          errors := array_append(errors, format('%s.stations[%s].name must be 1-20 characters', side, j));
        end if;
        if station ? 'note' and jsonb_typeof(station->'note') not in ('string','null') then
          errors := array_append(errors, format('%s.stations[%s].note must be text or null', side, j));
        elsif jsonb_typeof(station->'note') = 'string' and length(station->>'note') > 40 then
          errors := array_append(errors, format('%s.stations[%s].note exceeds 40 characters', side, j));
        end if;
      end loop;
    end if;
  end loop;

  for i in 0..jsonb_array_length(payload->'days') - 1 loop
    day := payload->'days'->i;
    path := format('days[%s]', i);
    if day->>'kind' = 'hike' then walking := walking + 1; end if;
    continue when not day ? 'stops' or jsonb_typeof(day->'stops') = 'null';
    if day->>'kind' is distinct from 'hike' then
      errors := array_append(errors, path || '.stops only belong to a hike day');
      continue;
    end if;
    if jsonb_typeof(day->'stops') is distinct from 'array' or jsonb_array_length(day->'stops') not between 2 and 20 then
      errors := array_append(errors, path || '.stops must contain 2-20 items');
      continue;
    end if;
    staged := staged + 1;
    first_km := null;
    for j in 0..jsonb_array_length(day->'stops') - 1 loop
      stop := day->'stops'->j;
      if jsonb_typeof(stop->'name') is distinct from 'string' or length(stop->>'name') not between 1 and 40 then
        errors := array_append(errors, format('%s.stops[%s].name must be 1-40 characters', path, j));
      end if;
      if jsonb_typeof(stop->'km') is distinct from 'number' or (stop->>'km')::numeric < 0 then
        errors := array_append(errors, format('%s.stops[%s].km must be a number of at least 0', path, j));
        continue;
      end if;
      if previous_km is not null and (stop->>'km')::numeric < previous_km then
        errors := array_append(errors, format('%s.stops[%s].km goes back along the track', path, j));
      end if;
      previous_km := (stop->>'km')::numeric;
      first_km := coalesce(first_km, previous_km);
      last_km := previous_km;
    end loop;
    if jsonb_typeof(day->'distanceKm') = 'number' and first_km is not null
      and abs((day->>'distanceKm')::numeric - (last_km - first_km)) > 0.15 then
      errors := array_append(errors, path || '.distanceKm must match its stops');
    end if;
  end loop;
  if staged > 0 and staged < walking then
    errors := array_append(errors, 'stops must be set on every hike day or on none');
  end if;
  return errors;
end;
$$;

alter table public.route_itineraries
  add constraint route_itineraries_plan_valid check (cardinality(public.route_itinerary_plan_errors(payload)) = 0);

-- A published plan's stops must lie on the route's track as it is stored now.
create or replace function public.route_itineraries_stops_on_track() returns trigger
language plpgsql set search_path = public as $$
declare
  track_km numeric;
  furthest numeric;
begin
  if new.status <> 'published' or (tg_op = 'UPDATE' and old.status = 'published') then
    return new;
  end if;
  select max((stop->>'km')::numeric) into furthest
  from jsonb_array_elements(new.payload->'days') day
  cross join lateral jsonb_array_elements(case when jsonb_typeof(day->'stops') = 'array' then day->'stops' else '[]'::jsonb end) stop;
  if furthest is null then return new; end if;
  select max((point->>'km')::numeric) into track_km
  from public.routes r
  cross join lateral jsonb_array_elements(case when jsonb_typeof(r.track_elevation) = 'array' then r.track_elevation else '[]'::jsonb end) point
  where r.id = new.route_id;
  if track_km is null then
    raise exception 'route % has no track profile to check plan stops against', new.route_id;
  end if;
  if furthest > track_km + 0.05 then
    raise exception 'plan stop at % km is beyond the route track (% km)', furthest, track_km;
  end if;
  return new;
end;
$$;

create trigger route_itineraries_stops_on_track before insert or update on public.route_itineraries
for each row execute function public.route_itineraries_stops_on_track();
