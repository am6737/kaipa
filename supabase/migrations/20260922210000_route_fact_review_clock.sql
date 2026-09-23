begin;

-- Review clock for 线路资料 (route facts).
--
-- The clock introduced in 20260922180000_route_facts.sql could never be
-- renewed. The trigger did `new.confirmed_at := coalesce(old.confirmed_at, now())`
-- on every update and only derived review_due_at when it was null, so clearing
-- the review date in the admin form recomputed the same expired date from the
-- first confirmation, and the only way to renew a fact was to type a date by
-- hand. There was also no action for "I checked, it is still correct".
--
-- reviewed_at now records the most recent verification. The due date derives
-- from the most recent confirmation-or-review, and a content change counts as a
-- fresh confirmation, because editing a price IS re-verifying it.
--
-- The trigger runs on every save in the admin console, so a snapshot of the
-- human-maintained rows is taken first: the due dates of existing rows shift on
-- their next edit, and that is the only thing here that is not reconstructible
-- from the migration itself.

-- --- way back ----------------------------------------------------------------
-- Snapshot of the maintained data. Route facts are human hours, not derived
-- state. RLS is enabled and nothing is granted: a plain table in the public
-- schema is otherwise readable by any signed-in user.
create table if not exists public.route_fact_entries_backup_20260922 as
  select * from public.route_fact_entries;

alter table public.route_fact_entries_backup_20260922 enable row level security;
revoke all on public.route_fact_entries_backup_20260922 from public, anon, authenticated;

comment on table public.route_fact_entries_backup_20260922 is
  'Pre-review-clock snapshot of route_fact_entries, taken by 20260922210000_route_fact_review_clock.sql. Drop once the new clock has been in use long enough that no row still needs its pre-migration review_due_at.';

-- --- review clock ------------------------------------------------------------
alter table public.route_fact_entries
  add column if not exists reviewed_at timestamptz;

comment on column public.route_fact_entries.reviewed_at is
  'Most recent human verification. confirmed_at stays the first confirmation; review_due_at is derived from the later of the two.';

create or replace function public.route_fact_entries_before_save()
returns trigger
language plpgsql
as $$
declare
  v_interval integer;
  v_content_changed boolean;
begin
  -- What makes this a *re*-confirmation rather than a status change is that the
  -- fact itself changed. Marking a row reviewed, confirming a draft as-is and
  -- restoring an archived row all leave the content alone and must not
  -- fabricate a fresh confirmation date.
  v_content_changed := case
    when tg_op = 'INSERT' then true
    else (new.fields is distinct from old.fields)
      or (new.title is distinct from old.title)
      or (new.source_url is distinct from old.source_url)
      or (new.category_slug is distinct from old.category_slug)
  end;

  if new.status = 'confirmed' then
    if v_content_changed then
      new.confirmed_at := now();
      new.reviewed_at := now();
      -- A re-confirmation resets the due date, unless the caller named a new
      -- one. The admin form echoes the entry's current date back on every save,
      -- so an unchanged value means "the form did not set one" rather than
      -- "keep the old expiry" — keeping it is exactly the renewal bug this
      -- migration exists to fix.
      if tg_op = 'UPDATE' then
        if new.review_due_at is not distinct from old.review_due_at then
          new.review_due_at := null;
        end if;
      end if;
    elsif tg_op = 'UPDATE' then
      new.confirmed_at := coalesce(new.confirmed_at, old.confirmed_at, now());
      new.reviewed_at := coalesce(new.reviewed_at, old.reviewed_at, new.confirmed_at);
    else
      new.confirmed_at := coalesce(new.confirmed_at, now());
      new.reviewed_at := coalesce(new.reviewed_at, new.confirmed_at);
    end if;

    -- An explicit review_due_at (the admin form's date field) always wins,
    -- including a date set deliberately. Only a blank field is derived.
    if new.review_due_at is null then
      select review_interval_days into v_interval
        from public.route_fact_categories where slug = new.category_slug;
      if v_interval is not null then
        new.review_due_at := greatest(new.confirmed_at, new.reviewed_at) + make_interval(days => v_interval);
      end if;
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

-- Rows confirmed before this migration get their review clock seeded from the
-- first confirmation, which is what they were already judged by. Idempotent,
-- and only touched where the value is still missing.
update public.route_fact_entries
   set reviewed_at = confirmed_at
 where status = 'confirmed' and reviewed_at is null and confirmed_at is not null;

-- --- the agent reads the review clock ----------------------------------------
-- Adding a key to the returned jsonb is backward compatible with the pipeline's
-- RouteFactRow, which ignores what it does not read.
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
    'reviewed_at', e.reviewed_at,
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

revoke all on function public.get_route_facts(text[], text[]) from public, anon, authenticated;
grant execute on function public.get_route_facts(text[], text[]) to service_role;

commit;
