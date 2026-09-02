-- Durable state for the Kaipa in-app agent.

create table if not exists agent_threads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  current_journey_id text references journeys(id) on delete set null,
  title text not null default '新对话',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table agent_threads add column if not exists current_journey_id text references journeys(id) on delete set null;

create table if not exists agent_session_items (
  id bigint generated always as identity primary key,
  thread_id uuid not null references agent_threads(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  item jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists agent_session_items_thread_idx on agent_session_items(thread_id, id);

create table if not exists agent_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references agent_threads(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  ui jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
alter table agent_messages add column if not exists ui jsonb not null default '{}'::jsonb;
create index if not exists agent_messages_thread_idx on agent_messages(thread_id, created_at);

create table if not exists agent_runs (
  id uuid primary key,
  thread_id uuid not null references agent_threads(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  status text not null check (status in ('running', 'pending_approval', 'completed', 'failed')),
  state text,
  pending_approvals jsonb not null default '[]'::jsonb,
  approval_decisions jsonb not null default '[]'::jsonb,
  final_output text,
  error text,
  agent_version text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists agent_runs_thread_idx on agent_runs(thread_id, created_at desc);
create unique index if not exists agent_runs_thread_active_unique
  on agent_runs(thread_id) where status in ('running', 'pending_approval');

create table if not exists agent_tool_calls (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references agent_runs(id) on delete cascade,
  thread_id uuid not null references agent_threads(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  tool_name text not null,
  arguments jsonb not null,
  arguments_hash text not null,
  status text not null check (status in ('running', 'completed', 'failed')),
  output jsonb,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (run_id, tool_name, arguments_hash)
);
alter table agent_tool_calls add column if not exists undo_payload jsonb;
alter table agent_tool_calls add column if not exists undone_at timestamptz;

alter table agent_threads enable row level security;
alter table agent_session_items enable row level security;
alter table agent_messages enable row level security;
alter table agent_runs enable row level security;
alter table agent_tool_calls enable row level security;

drop policy if exists "agent_threads_own" on agent_threads;
create policy "agent_threads_own" on agent_threads for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "agent_session_items_own" on agent_session_items;
create policy "agent_session_items_own" on agent_session_items for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "agent_messages_own" on agent_messages;
create policy "agent_messages_own" on agent_messages for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "agent_runs_own" on agent_runs;
create policy "agent_runs_own" on agent_runs for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "agent_tool_calls_own" on agent_tool_calls;
create policy "agent_tool_calls_own" on agent_tool_calls for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Keep itinerary rows and their newly-created groups in one transaction.
create or replace function public.apply_agent_itinerary(p_itinerary_rows jsonb, p_itinerary_groups jsonb)
returns void
language plpgsql
set search_path = public
as $$
begin
  insert into timeline_groups (journey_id, user_id, name, deleted, sort_order, updated_at)
  select journey_id, user_id, name, deleted, sort_order, updated_at
  from jsonb_to_recordset(coalesce(p_itinerary_groups, '[]'::jsonb)) as item(
    journey_id text,
    user_id uuid,
    name text,
    deleted boolean,
    sort_order int4,
    updated_at timestamptz
  )
  on conflict (journey_id, name) do nothing;

  insert into timeline_rows (id, journey_id, user_id, title, day, time_mins, time_end_mins, is_synth, is_custom, checked, sort_order)
  select id, journey_id, user_id, title, day, time_mins, time_end_mins, is_synth, is_custom, checked, sort_order
  from jsonb_to_recordset(coalesce(p_itinerary_rows, '[]'::jsonb)) as item(
    id text,
    journey_id text,
    user_id uuid,
    title text,
    day text,
    time_mins int4,
    time_end_mins int4,
    is_synth boolean,
    is_custom boolean,
    checked boolean,
    sort_order int4
  );
end;
$$;
grant execute on function public.apply_agent_itinerary(jsonb, jsonb) to authenticated;

create or replace function public.finalize_agent_run(target_run_id uuid, assistant_message text, message_ui jsonb)
returns void
language plpgsql
set search_path = public
as $$
declare
  run_record agent_runs%rowtype;
begin
  select * into run_record
  from agent_runs
  where id = target_run_id and user_id = auth.uid() and status = 'running'
  for update;
  if not found then raise exception 'Agent run is not active'; end if;

  update agent_runs
  set status = 'completed', state = null, final_output = assistant_message,
      pending_approvals = '[]'::jsonb, updated_at = now()
  where id = target_run_id;
  insert into agent_messages (thread_id, user_id, role, content, ui)
  values (run_record.thread_id, run_record.user_id, 'assistant', assistant_message, coalesce(message_ui, '{}'::jsonb));
  update agent_threads set updated_at = now() where id = run_record.thread_id;
end;
$$;
grant execute on function public.finalize_agent_run(uuid, text, jsonb) to authenticated;

-- Undo every reversible write from one completed run in reverse tool order.
create or replace function public.undo_agent_run(target_run_id uuid)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  call_record record;
  payload jsonb;
  undo_time timestamptz := now();
  previous_undo_time timestamptz;
  affected_count int := 0;
  affected_journey_id text;
begin
  if not exists (
    select 1 from agent_runs
    where id = target_run_id and user_id = auth.uid() and status = 'completed'
  ) then
    raise exception 'Agent run is not available for undo';
  end if;

  for call_record in
    select id, undo_payload
    from agent_tool_calls
    where run_id = target_run_id
      and user_id = auth.uid()
      and status = 'completed'
      and undo_payload is not null
      and undone_at is null
    order by created_at desc, id desc
    for update
  loop
    payload := call_record.undo_payload;
    affected_journey_id := coalesce(payload->>'journeyId', affected_journey_id);

    if payload->>'kind' = 'set_journey_map_location' then
      if exists (
        select 1
        from journeys current_journey
        where current_journey.id = payload->>'journeyId'
          and (
            current_journey.region is distinct from payload->'applied'->>'region'
            or current_journey.coord is distinct from payload->'applied'->>'coord'
            or current_journey.lng is distinct from (payload->'applied'->>'lng')::float8
            or current_journey.lat is distinct from (payload->'applied'->>'lat')::float8
          )
      ) then
        raise exception 'Journey map location changed after this agent run';
      end if;
      update journeys
      set region = payload->'previous'->>'region',
          coord = payload->'previous'->>'coord',
          lng = (payload->'previous'->>'lng')::float8,
          lat = (payload->'previous'->>'lat')::float8,
          updated_at = undo_time
      where id = payload->>'journeyId';
    elsif payload->>'kind' = 'add_packing_items' then
      delete from journey_packing_items
      where list_id = (payload->>'listId')::uuid
        and id in (select value::uuid from jsonb_array_elements_text(payload->'itemIds'));

      if coalesce((payload->>'createdList')::boolean, false) then
        delete from journey_packing_lists list
        where list.id = (payload->>'listId')::uuid
          and not exists (select 1 from journey_packing_items item where item.list_id = list.id);
      end if;
    elsif payload->>'kind' = 'set_itinerary_group_endpoints' then
      if exists (
        select 1
        from jsonb_to_recordset(payload->'applied') as expected(
          name text,
          route_end_meters float8,
          route_end_lng float8,
          route_end_lat float8,
          route_end_track_index int4,
          route_end_track_fraction float8,
          route_end_source text,
          route_location_name text
        )
        left join timeline_groups current_group
          on current_group.journey_id = payload->>'journeyId' and current_group.name = expected.name
        where current_group.name is null
          or current_group.route_end_meters is distinct from expected.route_end_meters
          or current_group.route_end_lng is distinct from expected.route_end_lng
          or current_group.route_end_lat is distinct from expected.route_end_lat
          or current_group.route_end_track_index is distinct from expected.route_end_track_index
          or current_group.route_end_track_fraction is distinct from expected.route_end_track_fraction
          or current_group.route_end_source is distinct from expected.route_end_source
          or current_group.route_location_name is distinct from expected.route_location_name
      ) then
        raise exception 'Itinerary endpoints changed after this agent run';
      end if;
      update timeline_groups group_row
      set route_end_meters = previous.route_end_meters,
          route_end_lng = previous.route_end_lng,
          route_end_lat = previous.route_end_lat,
          route_end_track_index = previous.route_end_track_index,
          route_end_track_fraction = previous.route_end_track_fraction,
          route_end_source = previous.route_end_source,
          route_location_name = previous.route_location_name,
          updated_at = undo_time
      from jsonb_to_recordset(payload->'previous') as previous(
        name text,
        route_end_meters float8,
        route_end_lng float8,
        route_end_lat float8,
        route_end_track_index int4,
        route_end_track_fraction float8,
        route_end_source text,
        route_location_name text
      )
      where group_row.journey_id = payload->>'journeyId'
        and group_row.name = previous.name;
    elsif payload->>'kind' = 'add_itinerary_items' then
      delete from timeline_rows
      where journey_id = payload->>'journeyId'
        and id in (select value from jsonb_array_elements_text(payload->'rowIds'));

      delete from timeline_groups group_row
      where group_row.journey_id = payload->>'journeyId'
        and group_row.name in (select value from jsonb_array_elements_text(payload->'createdGroupNames'))
        and group_row.route_end_meters is null
        and not exists (
          select 1 from timeline_rows row_item
          where row_item.journey_id = group_row.journey_id and row_item.day = group_row.name
        );
    else
      raise exception 'Unsupported agent undo operation';
    end if;

    update agent_tool_calls set undone_at = undo_time, updated_at = undo_time where id = call_record.id;
    affected_count := affected_count + 1;
  end loop;

  if affected_count = 0 then
    select max(undone_at) into previous_undo_time
    from agent_tool_calls
    where run_id = target_run_id and user_id = auth.uid() and undo_payload is not null;
    if previous_undo_time is null then
      raise exception 'Agent run has no reversible changes';
    end if;
    undo_time := previous_undo_time;
  end if;

  update agent_messages
  set ui = jsonb_set(ui, '{undoAction,undoneAt}', to_jsonb(undo_time::text), true)
  where thread_id = (select thread_id from agent_runs where id = target_run_id)
    and ui->'undoAction'->>'runId' = target_run_id::text;

  return jsonb_build_object(
    'undone', true,
    'undoneAt', undo_time,
    'journeyId', affected_journey_id,
    'affectedOperations', affected_count
  );
end;
$$;
grant execute on function public.undo_agent_run(uuid) to authenticated;
