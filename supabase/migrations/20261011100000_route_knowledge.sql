begin;

-- Trigram matching for the Chinese keyword search below (no tsvector config for Chinese).
create extension if not exists pg_trgm with schema extensions;

create table if not exists public.route_knowledge_entries (
  id uuid primary key default gen_random_uuid(),
  route_id text references public.routes(id) on delete cascade,
  region text,
  section text not null check (section in ('overview','itinerary','access','overnight','costs','water_supply','season_risk','gear','tips')),
  title text not null check (length(trim(title)) > 0),
  body text not null,
  sources jsonb not null default '[]'::jsonb check (jsonb_typeof(sources) = 'array'),
  as_of date not null,
  status text not null default 'draft' check (status in ('draft','published','archived')),
  origin text not null default 'manual' check (origin in ('manual','import','collection')),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((route_id is null) <> (region is null)),
  check (route_id is not null or length(trim(region)) > 0)
);

create index if not exists route_knowledge_route_section_status_idx on public.route_knowledge_entries(route_id, section, status);
create index if not exists route_knowledge_region_status_idx on public.route_knowledge_entries(region, status);
create index if not exists route_knowledge_title_trgm_idx on public.route_knowledge_entries using gin (title extensions.gin_trgm_ops);
create index if not exists route_knowledge_body_trgm_idx on public.route_knowledge_entries using gin (body extensions.gin_trgm_ops);
create unique index if not exists route_knowledge_import_identity_idx on public.route_knowledge_entries(route_id, section, origin) where origin = 'import' and route_id is not null;

create table if not exists public.route_knowledge_revisions (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null,
  snapshot jsonb not null,
  changed_by uuid references auth.users(id) on delete set null,
  changed_at timestamptz not null default now()
);
create index if not exists route_knowledge_revisions_entry_idx on public.route_knowledge_revisions(entry_id, changed_at desc);

create or replace function public.route_knowledge_revision_trigger() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- Snapshot the previous version; attribute it to whoever made this change.
  insert into public.route_knowledge_revisions(entry_id, snapshot, changed_by)
  values (old.id, to_jsonb(old), case when tg_op = 'UPDATE' then coalesce(new.updated_by, auth.uid()) else auth.uid() end);
  return old;
end;
$$;
drop trigger if exists route_knowledge_revision_on_update on public.route_knowledge_entries;
-- Only content changes get a snapshot, so re-running an import does not add noise.
create trigger route_knowledge_revision_on_update before update on public.route_knowledge_entries
for each row when ((old.route_id, old.region, old.section, old.title, old.body, old.sources, old.as_of, old.status)
  is distinct from (new.route_id, new.region, new.section, new.title, new.body, new.sources, new.as_of, new.status))
execute function public.route_knowledge_revision_trigger();
drop trigger if exists route_knowledge_revision_on_delete on public.route_knowledge_entries;
create trigger route_knowledge_revision_on_delete before delete on public.route_knowledge_entries
for each row execute function public.route_knowledge_revision_trigger();

create or replace function public.route_knowledge_touch_updated_at() returns trigger
language plpgsql as $$ begin new.updated_at = now(); return new; end; $$;
drop trigger if exists route_knowledge_touch_updated_at on public.route_knowledge_entries;
create trigger route_knowledge_touch_updated_at before update on public.route_knowledge_entries
for each row execute function public.route_knowledge_touch_updated_at();

alter table public.route_knowledge_entries enable row level security;
alter table public.route_knowledge_revisions enable row level security;
revoke all on public.route_knowledge_entries, public.route_knowledge_revisions from public, anon, authenticated;
grant all on public.route_knowledge_entries, public.route_knowledge_revisions to service_role;
drop policy if exists route_knowledge_entries_service_role on public.route_knowledge_entries;
create policy route_knowledge_entries_service_role on public.route_knowledge_entries for all to service_role using (true) with check (true);
drop policy if exists route_knowledge_revisions_service_role on public.route_knowledge_revisions;
create policy route_knowledge_revisions_service_role on public.route_knowledge_revisions for all to service_role using (true) with check (true);

create or replace function public.get_route_knowledge(p_route_id text)
returns setof public.route_knowledge_entries
language sql stable security definer set search_path = public as $$
  select e.* from public.route_knowledge_entries e
  left join public.routes r on r.id = p_route_id
  where e.status = 'published'
    and (e.route_id = p_route_id or (e.route_id is null and r.region is not null and
      (e.region = r.region or r.region ilike '%' || e.region || '%' or e.region ilike '%' || r.region || '%')))
  order by e.route_id nulls last, e.section, e.updated_at desc;
$$;
revoke all on function public.get_route_knowledge(text) from public, anon;
grant execute on function public.get_route_knowledge(text) to authenticated, service_role;

create or replace function public.search_route_knowledge(
  p_query text, p_route_ids text[] default null, p_regions text[] default null,
  p_sections text[] default null, p_limit int default 12
) returns setof public.route_knowledge_entries
language sql stable security definer set search_path = public, extensions as $$
  -- Chinese has no tsvector configuration here. Split the query into terms on
  -- whitespace/punctuation; an entry matches when any term occurs, and ranks by
  -- how many terms occur, then by trigram similarity.
  with terms as (
    select array(
      select distinct term from regexp_split_to_table(coalesce(p_query, ''), '[[:space:],，、;；/+。.]+') term
      where length(term) >= 2 limit 8
    ) as list
  ), scored as (
    select e.*, (
      select count(*) from unnest(t.list) term
      where position(lower(term) in lower(e.title || ' ' || e.body)) > 0
    ) as hits
    from public.route_knowledge_entries e, terms t
    where e.status = 'published'
      and (p_route_ids is null or e.route_id = any(p_route_ids))
      and (p_regions is null or e.region = any(p_regions))
      and (p_sections is null or e.section = any(p_sections))
  )
  select s.id, s.route_id, s.region, s.section, s.title, s.body, s.sources, s.as_of, s.status, s.origin,
    s.created_by, s.updated_by, s.created_at, s.updated_at
  from scored s, terms t
  where cardinality(t.list) = 0 or s.hits > 0
  order by s.hits desc,
    greatest(similarity(s.title, coalesce(p_query, '')), word_similarity(coalesce(p_query, ''), s.body)) desc,
    s.as_of desc
  limit greatest(1, least(coalesce(p_limit, 12), 100));
$$;
revoke all on function public.search_route_knowledge(text,text[],text[],text[],int) from public, anon;
grant execute on function public.search_route_knowledge(text,text[],text[],text[],int) to authenticated, service_role;

create or replace function public.resolve_route_knowledge_gaps() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'published' and new.route_id is not null then
    update public.route_guide_gaps set resolved_at = now()
    where route_id = new.route_id and resolved_at is null and (section = new.section or section = '*');
  end if;
  return new;
end;
$$;
drop trigger if exists route_knowledge_resolve_gaps on public.route_knowledge_entries;
create trigger route_knowledge_resolve_gaps after insert or update of status, route_id, section on public.route_knowledge_entries
for each row execute function public.resolve_route_knowledge_gaps();

comment on table public.route_knowledge_entries is 'Published route and area knowledge maintained in the admin console; runtime agents read only through security-definer RPCs.';
comment on function public.get_route_knowledge(text) is 'Returns published route entries and region entries matching the route region exactly or by containment.';
comment on function public.search_route_knowledge(text,text[],text[],text[],int) is 'Term search over published route knowledge: any query term matches; ranked by matched-term count, then trigram similarity.';
notify pgrst, 'reload schema';
commit;
