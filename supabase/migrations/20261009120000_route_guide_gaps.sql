begin;

create table if not exists public.route_guide_gaps (
  id uuid primary key default gen_random_uuid(),
  route_id text not null references public.routes(id) on delete cascade,
  section text not null check (section in (
    'overview', 'itinerary', 'access', 'overnight', 'costs', 'water_supply',
    'season_risk', 'gear', 'tips', '*'
  )),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  hit_count integer not null default 1,
  last_run_id uuid,
  resolved_at timestamptz
);

create unique index if not exists route_guide_gaps_open_route_section
  on public.route_guide_gaps (route_id, section) where resolved_at is null;

comment on table public.route_guide_gaps is
  'Missing trusted route-guide sections reported by planning. One open gap per route/section; * means no guide. Operators collect untrusted sources offline and resolve gaps only after human curation into git.';

alter table public.route_guide_gaps enable row level security;
revoke all on public.route_guide_gaps from public, anon, authenticated;
grant all on public.route_guide_gaps to service_role;
drop policy if exists route_guide_gaps_service_role on public.route_guide_gaps;
create policy route_guide_gaps_service_role on public.route_guide_gaps
  for all to service_role using (true) with check (true);

create or replace function public.record_route_guide_gaps(
  p_route_id text, p_sections text[], p_run_id uuid default null
) returns integer
language plpgsql security definer set search_path = public
as $$
declare
  v_touched integer;
begin
  -- Hold the parent against concurrent deletion until the telemetry write ends.
  perform 1 from public.routes where id = p_route_id for key share;
  if not found then return 0; end if;

  if exists (
    select 1 from unnest(p_sections) s(section)
    where section is null or section not in (
      'overview', 'itinerary', 'access', 'overnight', 'costs', 'water_supply',
      'season_risk', 'gear', 'tips', '*'
    )
  ) then
    raise exception 'Invalid route guide section' using errcode = '22023';
  end if;

  insert into public.route_guide_gaps as gaps (route_id, section, last_run_id)
  select p_route_id, section, p_run_id from (
    select distinct section from unnest(p_sections) s(section)
  ) sections
  on conflict (route_id, section) where resolved_at is null do update
    set hit_count = gaps.hit_count + 1,
        last_seen_at = now(),
        last_run_id = excluded.last_run_id;
  get diagnostics v_touched = row_count;
  return v_touched;
end;
$$;

comment on function public.record_route_guide_gaps(text, text[], uuid) is
  'Service-only planning telemetry: validate section keys and upsert each distinct open gap once per call. Unknown routes return zero; resolved history is preserved. Never collects external material.';
revoke all on function public.record_route_guide_gaps(text, text[], uuid) from public, anon, authenticated;
grant execute on function public.record_route_guide_gaps(text, text[], uuid) to service_role;

create or replace view public.route_guide_gap_queue as
select g.id, g.route_id, r.name as route_name, g.section,
       g.first_seen_at, g.last_seen_at, g.hit_count, g.last_run_id
from public.route_guide_gaps g
join public.routes r on r.id = g.route_id
where g.resolved_at is null
order by g.hit_count desc, g.last_seen_at desc;

comment on view public.route_guide_gap_queue is
  'Operator queue of open trusted route-guide gaps, with route names, highest hit count and most recent sightings first. Used only for offline collection and human curation.';
-- Owner-privileged observability view, following agent_route_fact_stats.
revoke all on public.route_guide_gap_queue from public, anon, authenticated;
grant all on public.route_guide_gap_queue to service_role;

commit;
