alter table public.journey_versions
  add column if not exists agent_run_id uuid;

create unique index if not exists journey_versions_journey_agent_run_idx
  on public.journey_versions (journey_id, agent_run_id)
  where agent_run_id is not null;

create or replace function public.save_journey_version(
  target_journey_id text,
  version_fields text[],
  requested_kind text default 'update'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  editor_name text := '';
  existing_version public.journey_versions%rowtype;
  next_snapshot jsonb;
  next_version integer;
  current_transaction bigint := txid_current();
  requested_agent_run text;
  current_agent_run uuid;
  current_agent_run_created_at timestamptz;
  journey_created_at timestamptz;
  initial_changed_fields text[];
begin
  if current_setting('app.journey_version_suppressed', true) = 'true' then
    return;
  end if;

  requested_agent_run := coalesce(
    nullif(current_setting('request.headers', true), ''),
    '{}'
  )::jsonb ->> 'x-kaipa-agent-run-id';

  select run.id, run.created_at
  into current_agent_run, current_agent_run_created_at
  from public.agent_runs run
  where run.id::text = requested_agent_run
    and run.user_id = auth.uid()
    and run.status = 'running';

  select journey.created_at
  into journey_created_at
  from public.journeys journey
  where journey.id = target_journey_id
  for update;
  if not found then return; end if;

  next_snapshot := public.build_journey_version_snapshot(target_journey_id);
  if next_snapshot is null then return; end if;

  select coalesce(nullif(nick, ''), nullif(display_name, ''), '')
  into editor_name
  from public.profiles
  where id = auth.uid();

  select * into existing_version
  from public.journey_versions
  where journey_id = target_journey_id
    and (
      (current_agent_run is not null and agent_run_id = current_agent_run)
      or (current_agent_run is null and transaction_id = current_transaction)
    )
  order by version_number desc
  limit 1;

  -- The smart-plan sheet creates the journey immediately before opening its
  -- agent run. Fold those setup snapshots into the same user action too.
  if not found
    and current_agent_run is not null
    and journey_created_at between current_agent_run_created_at - interval '30 seconds'
                               and current_agent_run_created_at
    and not exists (
      select 1
      from public.journey_versions version
      where version.journey_id = target_journey_id
        and version.agent_run_id is not null
    )
    and not exists (
      select 1
      from public.journey_versions version
      where version.journey_id = target_journey_id
        and version.changed_at > current_agent_run_created_at
    )
  then
    select * into existing_version
    from public.journey_versions
    where journey_id = target_journey_id
    order by version_number
    limit 1;

    if found then
      select coalesce(array_agg(distinct field_name order by field_name), '{}')
      into initial_changed_fields
      from public.journey_versions initial_version
      cross join lateral unnest(initial_version.changed_fields) field_name
      where initial_version.journey_id = target_journey_id;

      delete from public.journey_versions
      where journey_id = target_journey_id
        and id <> existing_version.id;

      update public.journey_versions
      set agent_run_id = current_agent_run,
          changed_fields = initial_changed_fields,
          change_kind = 'create'
      where id = existing_version.id;
      existing_version.agent_run_id := current_agent_run;
      existing_version.changed_fields := initial_changed_fields;
      existing_version.change_kind := 'create';
    end if;
  end if;

  if found then
    update public.journey_versions
    set snapshot = next_snapshot,
        changed_fields = array(
          select distinct field_name
          from unnest(existing_version.changed_fields || coalesce(version_fields, '{}')) field_name
          order by field_name
        ),
        change_kind = case
          when requested_kind = 'restore' then 'restore'
          when existing_version.change_kind = 'create' then 'create'
          else 'update'
        end,
        changed_at = clock_timestamp()
    where id = existing_version.id;
    return;
  end if;

  select coalesce(max(version_number), 0) + 1
  into next_version
  from public.journey_versions
  where journey_id = target_journey_id;

  insert into public.journey_versions (
    journey_id, version_number, snapshot, changed_fields, change_kind,
    changed_by, changed_by_name, changed_at, transaction_id, agent_run_id
  ) values (
    target_journey_id,
    next_version,
    next_snapshot,
    coalesce(version_fields, '{}'),
    case when requested_kind in ('create', 'restore') then requested_kind else 'update' end,
    auth.uid(),
    coalesce(editor_name, ''),
    clock_timestamp(),
    current_transaction,
    current_agent_run
  );
end;
$$;

-- Repair smart-plan journeys created before agent run grouping was available.
-- The tight creation window and matching tool arguments avoid touching normal
-- manual edits or later AI changes to an existing journey.
do $$
declare
  candidate record;
  keeper public.journey_versions%rowtype;
  final_snapshot jsonb;
  final_changed_at timestamptz;
  merged_fields text[];
begin
  for candidate in
    select distinct run.id as run_id, journey.id as journey_id, run.updated_at
    from public.agent_runs run
    join public.journeys journey
      on journey.user_id = run.user_id
     and journey.created_at between run.created_at - interval '30 seconds' and run.created_at
    where run.status = 'completed'
      and run.updated_at - run.created_at < interval '10 minutes'
      and exists (
        select 1
        from public.agent_tool_calls call
        where call.run_id = run.id
          and (
            call.arguments ->> 'journeyId' = journey.id
            or call.output ->> 'id' = journey.id
          )
      )
  loop
    select * into keeper
    from public.journey_versions version
    where version.journey_id = candidate.journey_id
      and version.changed_at <= candidate.updated_at
    order by version.version_number
    limit 1;
    if not found then continue; end if;

    select version.snapshot, version.changed_at
    into final_snapshot, final_changed_at
    from public.journey_versions version
    where version.journey_id = candidate.journey_id
      and version.changed_at <= candidate.updated_at
    order by version.version_number desc
    limit 1;

    select coalesce(array_agg(distinct field_name order by field_name), '{}')
    into merged_fields
    from public.journey_versions version
    cross join lateral unnest(version.changed_fields) field_name
    where version.journey_id = candidate.journey_id
      and version.changed_at <= candidate.updated_at;

    delete from public.journey_versions version
    where version.journey_id = candidate.journey_id
      and version.changed_at <= candidate.updated_at
      and version.id <> keeper.id;

    update public.journey_versions
    set snapshot = final_snapshot,
        changed_fields = merged_fields,
        change_kind = 'create',
        changed_at = final_changed_at,
        agent_run_id = candidate.run_id
    where id = keeper.id;
  end loop;
end;
$$;
