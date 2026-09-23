begin;

-- Revisions for 线路资料 (route facts).
--
-- record_route_fact_suggestion deduped only against other 'suggested' rows and
-- keyed on title, so when the agent found that a confirmed price had changed
-- there was no way to say "this entry is now wrong": it had to create a second
-- row contradicting the first, and the human reviewer had to notice the
-- contradiction by reading both. Suggestions can now target an entry
-- (target_entry_id) and are reviewed as a field-level diff, and every change to
-- an entry is recorded, so "when did this price change" is answerable.
--
-- The shape mirrors journey_versions (20260904160000): a per-entry revision
-- number, changed_fields from a jsonb diff, an actor, and a transaction-local
-- GUC carrying intent from the writing RPC to the trigger. It differs in
-- storing fields_before/fields_after rather than a whole-row snapshot, because
-- the review UI renders "150 → 220" and should not have to rebuild that from
-- the previous snapshot.

-- --- targeting an existing entry --------------------------------------------
alter table public.route_fact_entries
  add column if not exists target_entry_id uuid references public.route_fact_entries(id) on delete cascade;
-- How a suggestion ended. Archiving alone could not distinguish "merged into the
-- entry" from "discarded", which is the difference the review queue needs.
alter table public.route_fact_entries
  add column if not exists resolution text check (resolution in ('applied', 'rejected'));
alter table public.route_fact_entries add column if not exists resolved_at timestamptz;
alter table public.route_fact_entries add column if not exists resolved_by uuid references auth.users(id) on delete set null;

comment on column public.route_fact_entries.target_entry_id is
  'Set on a suggestion that proposes changing an existing entry rather than adding one. Those are reviewed as a diff and applied through apply_route_fact_revision.';
comment on column public.route_fact_entries.resolution is
  'Outcome of a reviewed suggestion: applied (merged into the target) or rejected (discarded). Null while pending and for entries that were never suggestions.';

-- One pending revision per entry: a repeated finding updates the same review
-- instead of queueing a second one. This also backstops the select-then-insert
-- in record_route_fact_suggestion under concurrent runs.
create unique index if not exists route_fact_entries_open_revision_idx
  on public.route_fact_entries(target_entry_id)
  where status = 'suggested' and target_entry_id is not null;

-- --- history -----------------------------------------------------------------
create table if not exists public.route_fact_revisions (
  id                uuid primary key default gen_random_uuid(),
  entry_id          uuid not null references public.route_fact_entries(id) on delete cascade,
  revision          integer not null check (revision > 0),
  action            text not null check (action in (
    'created', 'suggested', 'updated', 'reviewed', 'confirmed', 'archived', 'restored'
  )),
  changed_fields    text[] not null default '{}',
  fields_before     jsonb,
  fields_after      jsonb,
  source_url        text,
  -- Which suggestion produced this change, when one did. The action alone
  -- cannot say "this update came from a reviewed agent proposal".
  source_entry_id   uuid references public.route_fact_entries(id) on delete set null,
  note              text,
  -- References profiles rather than auth.users, and carries a denormalized
  -- name, so the console can display who changed what without a join PostgREST
  -- cannot make (auth.users is not exposed). Same shape as journey_versions.
  applied_by        uuid references public.profiles(id) on delete set null,
  applied_by_name   text not null default '',
  applied_at        timestamptz not null default now(),
  unique (entry_id, revision)
);
create index if not exists route_fact_revisions_entry_idx
  on public.route_fact_revisions(entry_id, revision desc);
create index if not exists route_fact_revisions_applied_at_idx
  on public.route_fact_revisions(applied_at desc);

alter table public.route_fact_revisions enable row level security;
revoke all on public.route_fact_revisions from public, anon, authenticated;
grant all on public.route_fact_revisions to service_role;

comment on table public.route_fact_revisions is
  'Append-only history of every change to a route fact. Read by the admin history panel through the service role; nothing here is edited or deleted.';

-- --- recording a change -------------------------------------------------------
-- Runs as the owner of the writing statement (service_role through admin-api, or
-- a definer RPC), so a history write failure surfaces as a failed write rather
-- than as a silently missing revision.
create or replace function public.route_fact_entries_record_revision()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  before_row jsonb;
  after_row jsonb;
  v_changed text[] := '{}';
  v_action text;
  v_source_entry uuid;
  v_note text;
  v_actor uuid;
  v_actor_name text;
begin
  after_row := to_jsonb(new);
  if tg_op = 'UPDATE' then
    before_row := to_jsonb(old);
    select coalesce(array_agg(key order by key), '{}')
      into v_changed
      from jsonb_object_keys(after_row - 'updated_at' - 'updated_by') as key
     where (before_row - 'updated_at' - 'updated_by') -> key is distinct from (after_row - 'updated_at' - 'updated_by') -> key;
    if coalesce(array_length(v_changed, 1), 0) = 0 then
      return new;
    end if;
  end if;

  v_action := case
    when tg_op = 'INSERT' then case when new.status = 'suggested' then 'suggested' else 'created' end
    when new.status = 'confirmed' and old.status = 'suggested' then 'confirmed'
    when new.status = 'confirmed' and old.status = 'archived' then 'restored'
    when new.status = 'archived' then 'archived'
    -- A confirmed row whose content moved is an update; one whose dates moved
    -- only was re-verified as it stands. Both are worth a row.
    when (new.fields is distinct from old.fields) or (new.title is distinct from old.title) then 'updated'
    else 'reviewed'
  end;

  v_source_entry := nullif(current_setting('app.route_fact_revision_source', true), '')::uuid;
  v_note := nullif(current_setting('app.route_fact_revision_note', true), '');
  v_actor := nullif(current_setting('app.route_fact_revision_actor', true), '')::uuid;

  select coalesce(nullif(nick, ''), nullif(display_name, ''), '')
    into v_actor_name
    from public.profiles where id = v_actor;

  insert into public.route_fact_revisions (
    entry_id, revision, action, changed_fields, fields_before, fields_after, source_url, source_entry_id, note, applied_by, applied_by_name, applied_at
  ) values (
    new.id,
    (select coalesce(max(revision), 0) + 1 from public.route_fact_revisions where entry_id = new.id),
    v_action,
    v_changed,
    case when tg_op = 'UPDATE' then before_row -> 'fields' end,
    after_row -> 'fields',
    nullif(current_setting('app.route_fact_revision_source_url', true), ''),
    v_source_entry,
    v_note,
    v_actor,
    coalesce(v_actor_name, ''),
    now()
  );

  return new;
end;
$$;

drop trigger if exists route_fact_entries_record_revision on public.route_fact_entries;
create trigger route_fact_entries_record_revision
  after insert or update on public.route_fact_entries
  for each row execute function public.route_fact_entries_record_revision();

-- Baseline rows so the history panel is not blank for entries that predate it.
insert into public.route_fact_revisions (entry_id, revision, action, changed_fields, fields_before, fields_after, source_url, note, applied_by, applied_by_name, applied_at)
select
  entry.id, 1, case when entry.status = 'suggested' then 'suggested' else 'created' end, '{}',
  null, entry.fields, entry.source_url, 'backfill',
  profile.id, coalesce(nullif(profile.nick, ''), nullif(profile.display_name, ''), ''),
  coalesce(entry.created_at, now())
from public.route_fact_entries entry
left join public.profiles profile on profile.id = entry.created_by
where not exists (
  select 1 from public.route_fact_revisions revision where revision.entry_id = entry.id
);

-- --- field validation, in the database ----------------------------------------
-- Mirrors validateRouteFactFields in admin-api/index.ts, token for token. It has
-- to exist here too: applying a subset of fields can produce a combination that
-- is still missing a required field (the reviewer accepted `from` but not `to`),
-- and that check has to happen inside the writing transaction.
create or replace function public.route_fact_field_error(p_category_slug text, p_fields jsonb)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_schema jsonb;
  v_field jsonb;
  v_key text;
  v_value jsonb;
begin
  select field_schema into v_schema from public.route_fact_categories where slug = p_category_slug;
  if v_schema is null or jsonb_typeof(v_schema) <> 'array' then
    return 'route_fact_category_schema_invalid';
  end if;

  for v_field in select * from jsonb_array_elements(v_schema) loop
    v_key := v_field ->> 'key';
    if v_key is null or v_key = '' then continue; end if;
    v_value := p_fields -> v_key;

    if v_value is null or v_value = 'null'::jsonb or (jsonb_typeof(v_value) = 'string' and btrim(v_value #>> '{}') = '') then
      if (v_field ->> 'required')::boolean is true then
        return 'route_fact_field_required:' || v_key;
      end if;
      continue;
    end if;

    if v_field ->> 'type' = 'number' and jsonb_typeof(v_value) <> 'number' then
      return 'route_fact_field_number:' || v_key;
    end if;
    if v_field ->> 'type' = 'select' and jsonb_typeof(v_field -> 'options') = 'array' then
      if not (v_field -> 'options') @> to_jsonb(v_value) then
        return 'route_fact_field_option:' || v_key;
      end if;
    end if;
  end loop;

  return null;
end;
$$;

revoke all on function public.route_fact_field_error(text, jsonb) from public, anon, authenticated;
grant execute on function public.route_fact_field_error(text, jsonb) to service_role;

-- --- agent write-back: drafts and proposed revisions ---------------------------
-- Adding a parameter changes the function identity, so the five-argument version
-- is dropped in this same transaction rather than left as a second overload:
-- two overloads differing only by a trailing default make a five-argument named
-- call ambiguous. Deployed callers pass named arguments, which still resolve
-- against the defaults below.
drop function if exists public.record_route_fact_suggestion(text, text, text, jsonb, text);

create or replace function public.record_route_fact_suggestion(
  p_route_id text,
  p_category_slug text,
  p_title text,
  p_fields jsonb,
  p_source_url text default null,
  p_target_entry_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_target public.route_fact_entries%rowtype;
begin
  if not exists (select 1 from public.routes where id = p_route_id) then
    raise exception 'unknown route: %', p_route_id;
  end if;
  if not exists (select 1 from public.route_fact_categories where slug = p_category_slug) then
    raise exception 'unknown category: %', p_category_slug;
  end if;

  if p_target_entry_id is not null then
    select * into v_target from public.route_fact_entries where id = p_target_entry_id;
    if not found then
      raise exception 'unknown target entry: %', p_target_entry_id;
    end if;
    if v_target.status = 'archived' then
      raise exception 'target entry is archived: %', p_target_entry_id;
    end if;
    -- The route and category have to agree: otherwise one route's price could be
    -- proposed onto another route's entry.
    if v_target.route_id <> p_route_id or v_target.category_slug <> p_category_slug then
      raise exception 'target entry % does not match route % / category %', p_target_entry_id, p_route_id, p_category_slug;
    end if;

    select id into v_id
      from public.route_fact_entries
     where target_entry_id = p_target_entry_id and status = 'suggested'
     limit 1;

    if v_id is not null then
      -- Merged, not replaced: a revision carries only the fields that changed,
      -- so a second finding must accumulate onto the pending proposal rather
      -- than drop what the first one found.
      update public.route_fact_entries
         set fields = coalesce(fields, '{}'::jsonb) || coalesce(nullif(p_fields, '{}'::jsonb), '{}'::jsonb),
             source_url = coalesce(p_source_url, source_url)
       where id = v_id;
      return v_id;
    end if;

    insert into public.route_fact_entries
      (route_id, category_slug, title, fields, source_url, status, origin, target_entry_id)
    values
      (p_route_id, p_category_slug, p_title, p_fields, p_source_url, 'suggested', 'agent', p_target_entry_id)
    returning id into v_id;
    return v_id;
  end if;

  -- Untargeted drafts keep the original title-keyed dedupe, and replace rather
  -- than merge: a draft describes a whole entry, so the latest reading of the
  -- source is what should be reviewed.
  select id into v_id
    from public.route_fact_entries
   where route_id = p_route_id and category_slug = p_category_slug
     and status = 'suggested' and title = p_title
   limit 1;

  if v_id is not null then
    update public.route_fact_entries
       set fields = coalesce(nullif(p_fields, '{}'::jsonb), fields),
           source_url = coalesce(p_source_url, source_url)
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

revoke all on function public.record_route_fact_suggestion(text, text, text, jsonb, text, uuid) from public, anon, authenticated;
grant execute on function public.record_route_fact_suggestion(text, text, text, jsonb, text, uuid) to service_role;

-- --- applying a reviewed revision ---------------------------------------------
-- One transaction: a partially applied revision would leave the entry changed
-- without history, or the suggestion still queued.
create or replace function public.apply_route_fact_revision(
  p_suggestion_id uuid,
  p_accepted_fields text[] default null,
  p_actor uuid default null,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_suggestion public.route_fact_entries%rowtype;
  v_target public.route_fact_entries%rowtype;
  v_fields jsonb;
  v_merged jsonb;
  v_key text;
  v_error text;
  v_revision integer;
begin
  select * into v_suggestion from public.route_fact_entries where id = p_suggestion_id for update;
  if not found then
    raise exception 'unknown suggestion: %', p_suggestion_id;
  end if;
  if v_suggestion.status <> 'suggested' then
    raise exception 'not a pending suggestion: %', p_suggestion_id;
  end if;
  if v_suggestion.target_entry_id is null then
    raise exception 'suggestion % is not a revision of an existing entry', p_suggestion_id;
  end if;

  select * into v_target from public.route_fact_entries where id = v_suggestion.target_entry_id for update;
  if not found then
    raise exception 'unknown target entry: %', v_suggestion.target_entry_id;
  end if;
  if v_target.status = 'archived' then
    raise exception 'target entry is archived: %', v_target.id;
  end if;

  v_fields := coalesce(v_suggestion.fields, '{}'::jsonb);
  v_merged := coalesce(v_target.fields, '{}'::jsonb);
  if p_accepted_fields is null then
    v_merged := v_merged || v_fields;
  else
    -- Per-field acceptance: only the keys the reviewer ticked move onto the
    -- entry, everything else keeps its current value.
    foreach v_key in array p_accepted_fields loop
      if v_fields ? v_key then
        v_merged := jsonb_set(v_merged, array[v_key], v_fields -> v_key, true);
      end if;
    end loop;
  end if;

  -- The merged result is a field combination nothing has validated yet.
  v_error := public.route_fact_field_error(v_target.category_slug, v_merged);
  if v_error is not null then
    raise exception '%', v_error;
  end if;

  perform set_config('app.route_fact_revision_source', p_suggestion_id::text, true);
  perform set_config('app.route_fact_revision_source_url', coalesce(v_suggestion.source_url, ''), true);
  perform set_config('app.route_fact_revision_note', coalesce(p_note, 'agent 建议经人工确认后合并'), true);
  perform set_config('app.route_fact_revision_actor', coalesce(p_actor::text, ''), true);

  -- Content changed, so the trigger re-confirms the entry and restarts its
  -- review clock, and records the revision with this suggestion as its source.
  update public.route_fact_entries
     set fields = v_merged,
         updated_by = coalesce(p_actor, updated_by)
   where id = v_target.id;

  -- The suggestion itself is done. Clear the intent first so its own revision row
  -- records the resolution rather than pointing at itself as a source.
  perform set_config('app.route_fact_revision_source', '', true);
  perform set_config('app.route_fact_revision_source_url', '', true);
  perform set_config('app.route_fact_revision_note', '修订建议已应用', true);

  update public.route_fact_entries
     set status = 'archived',
         resolution = 'applied',
         resolved_at = now(),
         resolved_by = p_actor,
         updated_by = coalesce(p_actor, updated_by)
   where id = p_suggestion_id;

  select max(revision) into v_revision from public.route_fact_revisions where entry_id = v_target.id;

  return jsonb_build_object(
    'entryId', v_target.id,
    'revision', v_revision,
    'fields', v_merged,
    'appliedFields', coalesce(p_accepted_fields, array(select jsonb_object_keys(v_fields)))
  );
end;
$$;

revoke all on function public.apply_route_fact_revision(uuid, text[], uuid, text) from public, anon, authenticated;
grant execute on function public.apply_route_fact_revision(uuid, text[], uuid, text) to service_role;

-- --- rejecting a reviewed revision --------------------------------------------
create or replace function public.reject_route_fact_revision(
  p_suggestion_id uuid,
  p_actor uuid default null,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_suggestion public.route_fact_entries%rowtype;
begin
  select * into v_suggestion from public.route_fact_entries where id = p_suggestion_id for update;
  if not found then
    raise exception 'unknown suggestion: %', p_suggestion_id;
  end if;
  if v_suggestion.status <> 'suggested' then
    raise exception 'not a pending suggestion: %', p_suggestion_id;
  end if;
  if v_suggestion.target_entry_id is null then
    raise exception 'suggestion % is not a revision of an existing entry', p_suggestion_id;
  end if;

  perform set_config('app.route_fact_revision_source', v_suggestion.target_entry_id::text, true);
  perform set_config('app.route_fact_revision_note', coalesce(p_note, 'agent 建议被驳回'), true);
  perform set_config('app.route_fact_revision_actor', coalesce(p_actor::text, ''), true);

  update public.route_fact_entries
     set status = 'archived',
         resolution = 'rejected',
         resolved_at = now(),
         resolved_by = p_actor,
         updated_by = coalesce(p_actor, updated_by)
   where id = p_suggestion_id;

  return v_suggestion.target_entry_id;
end;
$$;

revoke all on function public.reject_route_fact_revision(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.reject_route_fact_revision(uuid, uuid, text) to service_role;

commit;
