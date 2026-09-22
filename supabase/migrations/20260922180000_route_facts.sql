begin;

-- 线路资料 (route facts): human-maintained, ground-truth facts per route
-- (access transport, costs, lodging, campsites, itinerary, season/safety).
-- The admin console writes through the service-role admin-api; the app-agent
-- reads confirmed facts via get_route_facts and can only insert drafts with
-- status 'suggested' via record_route_fact_suggestion. End-user JWTs get no
-- access at all.

create table if not exists public.route_fact_categories (
  slug                 text primary key,
  name                 text not null,
  description          text,
  field_schema         jsonb not null default '[]'::jsonb,
  review_interval_days integer not null default 180 check (review_interval_days > 0),
  sort_order           integer not null default 0,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create table if not exists public.route_fact_entries (
  id            uuid primary key default gen_random_uuid(),
  route_id      text not null references public.routes(id) on delete cascade,
  category_slug text not null references public.route_fact_categories(slug),
  title         text not null,
  fields        jsonb not null default '{}'::jsonb,
  source_url    text,
  status        text not null default 'confirmed'
                check (status in ('confirmed', 'suggested', 'archived')),
  origin        text not null default 'manual'
                check (origin in ('manual', 'agent')),
  confirmed_at  timestamptz,
  review_due_at timestamptz,
  created_by    uuid references auth.users(id) on delete set null,
  updated_by    uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists route_fact_entries_route_idx
  on public.route_fact_entries(route_id, category_slug);
create index if not exists route_fact_entries_review_due_idx
  on public.route_fact_entries(review_due_at) where status = 'confirmed';
create index if not exists route_fact_entries_status_idx
  on public.route_fact_entries(status);

alter table public.route_fact_categories enable row level security;
alter table public.route_fact_entries enable row level security;
revoke all on public.route_fact_categories from anon, authenticated;
revoke all on public.route_fact_entries from anon, authenticated;

-- Fill confirmed_at / review_due_at defaults so the admin list never shows a
-- confirmed fact without a staleness clock.
create or replace function public.route_fact_entries_before_save()
returns trigger
language plpgsql
as $$
declare
  v_interval integer;
begin
  if new.status = 'confirmed' and new.confirmed_at is null then
    if tg_op = 'UPDATE' then
      new.confirmed_at := coalesce(old.confirmed_at, now());
    else
      new.confirmed_at := now();
    end if;
  end if;
  if new.status = 'confirmed' and new.review_due_at is null then
    select review_interval_days into v_interval
      from public.route_fact_categories where slug = new.category_slug;
    if v_interval is not null then
      new.review_due_at := coalesce(new.confirmed_at, now())
        + make_interval(days => v_interval);
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists route_fact_entries_before_save on public.route_fact_entries;
create trigger route_fact_entries_before_save
  before insert or update on public.route_fact_entries
  for each row execute function public.route_fact_entries_before_save();

-- Category templates. field_schema drives the admin dynamic form, the agent
-- prompt formatting, and any future 飞书/Notion database export.
insert into public.route_fact_categories
  (slug, name, description, field_schema, review_interval_days, sort_order)
values
  ('access_transport', '进出交通', '怎么到这条线路的起点、怎么离开',
   '[
     {"key":"from","label":"出发地","type":"text","required":true},
     {"key":"to","label":"到达节点","type":"text","required":true},
     {"key":"mode","label":"交通方式","type":"select","options":["班车","拼车","包车","自驾","其他"]},
     {"key":"schedule","label":"班次与时间","type":"text"},
     {"key":"duration","label":"耗时","type":"text"},
     {"key":"notes","label":"备注","type":"markdown"}
   ]'::jsonb, 90, 1),
  ('shuttle_cost', '费用参考', '拼车/包车/驼马等当地价格，注明计价单位与季节浮动',
   '[
     {"key":"item","label":"费用项目","type":"text","required":true},
     {"key":"price_min","label":"最低价","type":"number","unit":"元"},
     {"key":"price_max","label":"最高价","type":"number","unit":"元"},
     {"key":"unit","label":"计价单位","type":"select","options":["每人","每车","每天","每次"]},
     {"key":"effective_season","label":"适用季节","type":"text"},
     {"key":"notes","label":"备注","type":"markdown"}
   ]'::jsonb, 60, 2),
  ('lodging', '住宿', '起点/终点村落的住宿点、价位、预订方式',
   '[
     {"key":"name","label":"名称","type":"text","required":true},
     {"key":"type","label":"类型","type":"select","options":["客栈","民宿","青旅","牧民家","酒店","其他"]},
     {"key":"price_min","label":"最低价","type":"number","unit":"元/晚"},
     {"key":"price_max","label":"最高价","type":"number","unit":"元/晚"},
     {"key":"booking","label":"预订方式","type":"text"},
     {"key":"notes","label":"备注","type":"markdown"}
   ]'::jsonb, 90, 3),
  ('campsite', '营地', '重装露营点：位置、海拔、水源、容量',
   '[
     {"key":"name","label":"营地名称","type":"text","required":true},
     {"key":"location","label":"位置描述","type":"text","required":true},
     {"key":"altitude","label":"海拔","type":"number","unit":"米"},
     {"key":"water","label":"水源","type":"select","options":["有","无","需背水"]},
     {"key":"capacity","label":"容量","type":"text"},
     {"key":"terrain","label":"地形与风况","type":"text"},
     {"key":"notes","label":"备注","type":"markdown"}
   ]'::jsonb, 180, 4),
  ('itinerary', '行程节奏', '建议天数、里程、爬升、分段计划',
   '[
     {"key":"days","label":"建议天数","type":"text","required":true},
     {"key":"distance","label":"总里程","type":"text"},
     {"key":"ascent","label":"累计爬升","type":"text"},
     {"key":"max_altitude","label":"最高点","type":"number","unit":"米"},
     {"key":"difficulty","label":"强度","type":"select","options":["休闲","中等","高强度","重装"]},
     {"key":"day_plan","label":"分日计划","type":"markdown"}
   ]'::jsonb, 365, 5),
  ('season_safety', '季节与安全', '最佳月份、主要风险、补给与证件',
   '[
     {"key":"best_months","label":"最佳月份","type":"text","required":true},
     {"key":"hazards","label":"主要风险","type":"text"},
     {"key":"resupply","label":"补给方式","type":"text"},
     {"key":"permit","label":"证件要求","type":"text"},
     {"key":"notes","label":"备注","type":"markdown"}
   ]'::jsonb, 365, 6)
on conflict (slug) do update set
  name = excluded.name,
  description = excluded.description,
  field_schema = excluded.field_schema,
  review_interval_days = excluded.review_interval_days,
  sort_order = excluded.sort_order,
  updated_at = now();

-- Agent-facing read: fuzzy route-name match, confirmed facts only.
create or replace function public.get_route_facts(
  p_route_names text[],
  p_category_slugs text[] default null
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', e.id,
    'route_id', e.route_id,
    'route_name', r.name,
    'category', jsonb_build_object('slug', c.slug, 'name', c.name, 'field_schema', c.field_schema),
    'title', e.title,
    'fields', e.fields,
    'source_url', e.source_url,
    'confirmed_at', e.confirmed_at,
    'review_due_at', e.review_due_at
  ) order by r.name, c.sort_order, e.title), '[]'::jsonb)
  from public.route_fact_entries e
  join public.route_fact_categories c on c.slug = e.category_slug
  join public.routes r on r.id = e.route_id
  where e.status = 'confirmed'
    and (p_category_slugs is null or e.category_slug = any (p_category_slugs))
    and exists (
      select 1 from unnest(p_route_names) as t(term)
      where r.name ilike '%' || t.term || '%' or t.term ilike '%' || r.name || '%'
    );
$$;

-- Agent write-back pool: search results become 'suggested' drafts for a human
-- to confirm or discard in the admin console. Never writes 'confirmed'.
create or replace function public.record_route_fact_suggestion(
  p_route_id text,
  p_category_slug text,
  p_title text,
  p_fields jsonb,
  p_source_url text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if not exists (select 1 from public.routes where id = p_route_id) then
    raise exception 'unknown route: %', p_route_id;
  end if;
  if not exists (select 1 from public.route_fact_categories where slug = p_category_slug) then
    raise exception 'unknown category: %', p_category_slug;
  end if;

  select id into v_id
    from public.route_fact_entries
   where route_id = p_route_id and category_slug = p_category_slug
     and status = 'suggested' and title = p_title
   limit 1;

  if v_id is not null then
    update public.route_fact_entries
       set fields = coalesce(nullif(p_fields, '{}'::jsonb), fields),
           source_url = coalesce(p_source_url, source_url),
           updated_at = now()
     where id = v_id;
    return v_id;
  end if;

  insert into public.route_fact_entries
    (route_id, category_slug, title, fields, source_url, status, origin)
  values
    (p_route_id, p_category_slug, p_title, p_fields, p_source_url, 'suggested', 'agent')
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.get_route_facts(text[], text[]) from public, anon, authenticated;
revoke all on function public.record_route_fact_suggestion(text, text, text, jsonb, text) from public, anon, authenticated;
grant execute on function public.get_route_facts(text[], text[]) to service_role;
grant execute on function public.record_route_fact_suggestion(text, text, text, jsonb, text) to service_role;

commit;
