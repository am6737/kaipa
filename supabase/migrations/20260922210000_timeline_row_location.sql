-- Give every timeline row a first-class `location` (where the item happens),
-- separate from `transport` (an agent-planned leg between two places).
alter table public.timeline_rows
  add column if not exists location jsonb;

comment on column public.timeline_rows.location is
  'The place this item happens at: {name, source, longitude, latitude, address}. Independent of transport, which describes a leg between places.';

-- Backfill: an item's location is the end of its transport leg when one exists
-- (manual rows saved before this column put the picked place in transport.to).
update public.timeline_rows
  set location = transport -> 'to'
  where location is null
    and jsonb_typeof(transport) = 'object'
    and jsonb_typeof(transport -> 'to') = 'object';
