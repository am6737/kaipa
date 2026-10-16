begin;

create or replace function public.route_itinerary_payload_errors(payload jsonb)
returns text[] language plpgsql immutable set search_path = public as $$
declare
  errors text[] := array[]::text[];
  node jsonb;
  node_path text;
  day jsonb;
  transfer jsonb;
  stay jsonb;
  field text;
  path text;
  i int;
  j int;
  n int;
  phase int := 0;
  non_access int := 0;
  value_type text;
begin
  if jsonb_typeof(payload) is distinct from 'object' then
    return array['payload must be an object'];
  end if;

  -- Inspect every value, including strings under future or unknown keys.
  for node, node_path in
    with recursive values_tree(tree_value, tree_path) as (
      select payload, 'payload'::text
      union all
      select child.child_value, child.child_path from values_tree parent
      cross join lateral (
        select e.value as child_value, parent.tree_path || '.' || e.key as child_path
        from jsonb_each(case when jsonb_typeof(parent.tree_value) = 'object' then parent.tree_value else '{}'::jsonb end) e
        union all
        select a.value, parent.tree_path || '[' || (a.ordinality - 1) || ']'
        from jsonb_array_elements(case when jsonb_typeof(parent.tree_value) = 'array' then parent.tree_value else '[]'::jsonb end) with ordinality a
      ) child
    ) select tree_value, tree_path from values_tree
  loop
    if jsonb_typeof(node) = 'string' and (node #>> '{}') = '' then
      errors := array_append(errors, node_path || ' contains an empty string');
    end if;
    if jsonb_typeof(node) = 'string' and position('·' in node #>> '{}') > 0 then
      errors := array_append(errors, node_path || ' contains ·');
    end if;
  end loop;

  foreach field in array array['name','audience','summary'] loop
    n := case field when 'summary' then 150 else 40 end;
    if jsonb_typeof(payload->field) is distinct from 'string' or length(payload->>field) not between 1 and n then
      errors := array_append(errors, field || ' must be 1-' || n || ' characters');
    end if;
  end loop;
  if jsonb_typeof(payload->'lodging') is distinct from 'string' or payload->>'lodging' not in ('camp','lodge','mixed') then
    errors := array_append(errors, 'lodging invalid');
  end if;
  if jsonb_typeof(payload->'difficulty') is distinct from 'string' or payload->>'difficulty' not in ('易','中','中高','高') then
    errors := array_append(errors, 'difficulty invalid');
  end if;
  foreach field in array array['direction','seasonNote'] loop
    if payload ? field and jsonb_typeof(payload->field) not in ('string','null') then
      errors := array_append(errors, field || ' must be text or null');
    end if;
  end loop;
  if jsonb_typeof(payload->'notes') is distinct from 'array' then
    errors := array_append(errors, 'notes must be an array');
  else
    if jsonb_array_length(payload->'notes') > 5 then errors := array_append(errors, 'notes exceeds 5 items'); end if;
    for i in 0..jsonb_array_length(payload->'notes') - 1 loop
      node := payload->'notes'->i;
      if jsonb_typeof(node) is distinct from 'string' or length(node #>> '{}') not between 1 and 40 then
        errors := array_append(errors, format('notes[%s] must be 1-40 characters', i));
      end if;
    end loop;
  end if;
  if payload ? 'bestMonths' and jsonb_typeof(payload->'bestMonths') not in ('null','array') then
    errors := array_append(errors, 'bestMonths must be an array or null');
  elsif jsonb_typeof(payload->'bestMonths') = 'array' then
    for i in 0..jsonb_array_length(payload->'bestMonths') - 1 loop
      node := payload->'bestMonths'->i;
      if jsonb_typeof(node) is distinct from 'number' or node::text !~ '^[0-9]+$' or (node::text)::numeric not between 1 and 12 then
        errors := array_append(errors, format('bestMonths[%s] must be an integer 1-12', i));
      end if;
    end loop;
  end if;
  if jsonb_typeof(payload->'days') is distinct from 'array' then
    return array_append(errors, 'days must be an array');
  end if;
  n := jsonb_array_length(payload->'days');
  if n not between 1 and 30 then errors := array_append(errors, 'days must contain 1-30 items'); end if;
  for i in 0..n - 1 loop
    day := payload->'days'->i;
    path := format('days[%s]', i);
    if jsonb_typeof(day) is distinct from 'object' then
      errors := array_append(errors, path || ' must be an object');
      continue;
    end if;
    if jsonb_typeof(day->'kind') is distinct from 'string' or day->>'kind' not in ('access_in','hike','rest','access_out') then
      errors := array_append(errors, path || '.kind invalid');
    end if;
    if day->>'kind' = 'access_in' then
      if phase <> 0 then errors := array_append(errors, path || '.kind access_in must be at start'); end if;
    elsif day->>'kind' = 'access_out' then
      phase := 2;
    else
      if phase = 2 then errors := array_append(errors, path || '.kind access_out must be at end'); end if;
      phase := 1;
      non_access := non_access + 1;
    end if;
    if jsonb_typeof(day->'title') is distinct from 'string' or length(day->>'title') not between 1 and 80 then
      errors := array_append(errors, path || '.title must be 1-80 characters');
    end if;
    foreach field in array array['distanceKm','ascentM','descentM'] loop
      node := day->field;
      value_type := jsonb_typeof(node);
      if value_type is not null and value_type not in ('null','number') then
        errors := array_append(errors, path || '.' || field || ' must be numeric or null');
      elsif value_type = 'number' and field <> 'distanceKm' and node::text !~ '^-?[0-9]+$' then
        errors := array_append(errors, path || '.' || field || ' must be an integer');
      end if;
    end loop;
    if day->>'kind' in ('access_in','access_out') and jsonb_typeof(day->'distanceKm') is distinct from 'null' and day ? 'distanceKm' then
      errors := array_append(errors, path || '.distanceKm forbidden on access day');
    end if;
    foreach field in array array['duration','supply','tip','bailout'] loop
      if day ? field and jsonb_typeof(day->field) not in ('string','null') then
        errors := array_append(errors, path || '.' || field || ' must be text or null');
      end if;
    end loop;
    if jsonb_typeof(day->'tip') = 'string' and length(day->>'tip') > 100 then
      errors := array_append(errors, path || '.tip exceeds 100 characters');
    end if;
    if day->>'kind' = 'rest' and (jsonb_typeof(day->'tip') is distinct from 'string' or length(day->>'tip') = 0) then
      errors := array_append(errors, path || '.tip required for rest day');
    end if;
    if jsonb_typeof(day->'source') is distinct from 'string' or day->>'source' not in ('official','kb_generated','user_track') then
      errors := array_append(errors, path || '.source invalid');
    end if;
    if jsonb_typeof(day->'transfers') is distinct from 'array' then
      errors := array_append(errors, path || '.transfers must be an array');
    else
      if day->>'kind' in ('access_in','access_out') and jsonb_array_length(day->'transfers') = 0 then
        errors := array_append(errors, path || '.transfers required');
      end if;
      for j in 0..jsonb_array_length(day->'transfers') - 1 loop
        transfer := day->'transfers'->j;
        if jsonb_typeof(transfer) is distinct from 'object' then
          errors := array_append(errors, format('%s.transfers[%s] must be an object', path, j));
          continue;
        end if;
        foreach field in array array['from','to','duration','costRef','booking'] loop
          if transfer ? field and jsonb_typeof(transfer->field) not in ('string','null') then
            errors := array_append(errors, format('%s.transfers[%s].%s must be text or null', path, j, field));
          end if;
        end loop;
        if jsonb_typeof(transfer->'mode') is distinct from 'string' or transfer->>'mode' not in ('charter','shared','bus','shuttle') then
          errors := array_append(errors, format('%s.transfers[%s].mode invalid', path, j));
        end if;
        if jsonb_typeof(transfer->'position') is distinct from 'string' or transfer->>'position' not in ('start','end') then
          errors := array_append(errors, format('%s.transfers[%s].position invalid', path, j));
        end if;
      end loop;
    end if;
    stay := day->'stay';
    if i < n - 1 and jsonb_typeof(stay) is distinct from 'object' then
      errors := array_append(errors, path || '.stay required');
    elsif stay is not null and jsonb_typeof(stay) not in ('object','null') then
      errors := array_append(errors, path || '.stay must be an object or null');
    elsif jsonb_typeof(stay) = 'object' then
      if jsonb_typeof(stay->'name') is distinct from 'string' then errors := array_append(errors, path || '.stay.name required'); end if;
      if jsonb_typeof(stay->'type') is distinct from 'string' or stay->>'type' not in ('camp','homestay','inn','hotel') then
        errors := array_append(errors, path || '.stay.type invalid');
      end if;
      if jsonb_typeof(stay->'altitudeM') not in ('number','null') and stay ? 'altitudeM' then
        errors := array_append(errors, path || '.stay.altitudeM must be numeric or null');
      end if;
      foreach field in array array['water','costRef','signal'] loop
        if stay ? field and jsonb_typeof(stay->field) not in ('string','null') then
          errors := array_append(errors, path || '.stay.' || field || ' must be text or null');
        end if;
      end loop;
    end if;
  end loop;
  if non_access = 0 then errors := array_append(errors, 'days requires a non-access day'); end if;
  return errors;
end;
$$;

create table public.route_itineraries (
  id uuid not null default gen_random_uuid(),
  version int not null check (version >= 1),
  route_id text not null references public.routes(id) on delete cascade,
  status text not null default 'draft' check (status in ('draft','review','published','archived')),
  is_default boolean not null default false,
  origin text not null check (origin in ('manual','ai_draft')),
  payload jsonb not null,
  draft_sources jsonb not null default '[]'::jsonb check (jsonb_typeof(draft_sources) = 'array'),
  verified_by text,
  verified_on date,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (id, version),
  constraint route_itineraries_payload_valid check (cardinality(public.route_itinerary_payload_errors(payload)) = 0),
  constraint route_itineraries_published_verified check (status <> 'published' or (verified_by is not null and verified_on is not null))
);
create unique index route_itineraries_one_published_version on public.route_itineraries(id) where status = 'published';
create unique index route_itineraries_one_default_per_route on public.route_itineraries(route_id) where status = 'published' and is_default;
create index route_itineraries_route_status on public.route_itineraries(route_id, status);

create function public.route_itineraries_guard() returns trigger language plpgsql set search_path = public as $$
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
      if new.status <> 'archived' or (to_jsonb(new) - 'status' - 'updated_at') is distinct from (to_jsonb(old) - 'status' - 'updated_at') then
        raise exception 'published itinerary can only be archived';
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
create trigger route_itineraries_guard before insert or update or delete on public.route_itineraries
for each row execute function public.route_itineraries_guard();

alter table public.route_itineraries enable row level security;
revoke all on public.route_itineraries from public, anon, authenticated;
grant all on public.route_itineraries to service_role;
create policy route_itineraries_service_role on public.route_itineraries for all to service_role using (true) with check (true);

create function public.route_itineraries_published(p_route_id text)
returns table (id uuid, version int, route_id text, is_default boolean, payload jsonb, verified_on date)
language sql stable security definer set search_path = public as $$
  select i.id, i.version, i.route_id, i.is_default, i.payload, i.verified_on
  from public.route_itineraries i
  where i.route_id = p_route_id and i.status = 'published'
  order by i.is_default desc, i.id, i.version desc;
$$;
revoke all on function public.route_itineraries_published(text) from public, anon;
grant execute on function public.route_itineraries_published(text) to authenticated, service_role;

notify pgrst, 'reload schema';
commit;
