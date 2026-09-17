-- Queue payloads contain no access tokens. Only the worker can read/claim jobs.
alter table public.agent_runs add column if not exists execution_mode text not null default 'request';

create table if not exists public.agent_jobs (
  run_id uuid primary key references public.agent_runs(id) on delete cascade,
  payload jsonb not null,
  state text not null default 'queued' check (state in ('queued', 'leased', 'executing', 'completed', 'failed')),
  attempts integer not null default 0,
  lease_token uuid,
  lease_until timestamptz,
  available_at timestamptz not null default now(),
  last_error text
);
alter table public.agent_jobs enable row level security;
revoke all on public.agent_jobs from anon, authenticated;
grant all on public.agent_jobs to service_role;
create index if not exists agent_jobs_queued_idx on public.agent_jobs(available_at) where state = 'queued';
create index if not exists agent_jobs_lease_idx on public.agent_jobs(lease_until) where state in ('leased', 'executing');

create or replace function public.enqueue_agent_job(p_run_id uuid, p_thread_id uuid, p_payload jsonb, p_display_message text, p_version text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare existing_run agent_runs%rowtype;
begin
  if auth.uid() is null or jsonb_typeof(p_payload) <> 'object' or octet_length(p_payload::text) > 131072
    or nullif(trim(p_display_message), '') is null then raise exception 'Invalid planning request'; end if;
  perform 1 from agent_threads where id = p_thread_id and user_id = auth.uid() for update;
  if not found then raise exception 'Thread not found'; end if;
  select * into existing_run from agent_runs where id = p_run_id;
  if found then
    if existing_run.user_id <> auth.uid() or existing_run.thread_id <> p_thread_id then raise exception 'Run mismatch'; end if;
    return jsonb_build_object('threadId', p_thread_id, 'runId', p_run_id, 'status', existing_run.status);
  end if;
  if exists (select 1 from agent_runs where thread_id = p_thread_id and status = 'running') then
    raise exception 'A run is already active';
  end if;
  insert into agent_runs(id, thread_id, user_id, status, agent_version, execution_mode)
  values (p_run_id, p_thread_id, auth.uid(), 'running', p_version, 'background');
  insert into agent_jobs(run_id, payload) values (p_run_id, p_payload);
  insert into agent_messages(thread_id, user_id, role, content, ui)
  values (p_thread_id, auth.uid(), 'user', p_display_message,
    jsonb_build_object('attachments', coalesce(p_payload->'attachments', '[]'::jsonb)));
  update agent_threads set updated_at = now() where id = p_thread_id;
  return jsonb_build_object('threadId', p_thread_id, 'runId', p_run_id, 'status', 'running');
end;
$$;
revoke all on function public.enqueue_agent_job(uuid, uuid, jsonb, text, text) from public, anon, authenticated;
grant execute on function public.enqueue_agent_job(uuid, uuid, jsonb, text, text) to authenticated;

create or replace function public.retry_agent_job(p_run_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r agent_runs%rowtype; uploaded agent_messages%rowtype; flow jsonb;
begin
  select * into r from agent_runs where id = p_run_id and user_id = auth.uid();
  if not found then raise exception 'Run not found'; end if;
  perform 1 from agent_threads where id = r.thread_id and user_id = auth.uid() for update;
  if not found then raise exception 'Thread not found'; end if;
  select * into r from agent_runs where id = p_run_id for update;
  if r.status <> 'failed' then
    return jsonb_build_object('threadId', r.thread_id, 'runId', r.id, 'status', r.status);
  end if;
  if exists (select 1 from agent_runs where thread_id = r.thread_id and (status = 'running' or created_at > r.created_at)) then
    raise exception 'A newer run exists';
  end if;
  if exists(select 1 from agent_tool_calls where run_id = p_run_id
    and tool_name in ('add_gear', 'undo_last_agent_changes', 'delete_itinerary_items', 'delete_packing_items') and status <> 'completed') then
    raise exception 'An uncertain write requires inspection';
  end if;
  if r.execution_mode = 'request' then
    select * into uploaded from agent_messages where thread_id = r.thread_id and role = 'user'
      and created_at >= r.created_at and created_at <= r.updated_at order by created_at limit 1;
    if not found then raise exception 'Original request unavailable'; end if;
    select ui->'createJourneyFlow' into flow from agent_messages where thread_id = r.thread_id and role = 'assistant'
      and created_at < r.created_at order by created_at desc limit 1;
    insert into agent_jobs(run_id, payload, state) values(r.id, jsonb_build_object(
      'message', concat_ws('，', flow->>'originalMessage', uploaded.content),
      'attachments', coalesce(uploaded.ui->'attachments', '[]'::jsonb),
      'clientLocalDate', to_char(r.created_at at time zone 'Asia/Shanghai', 'YYYY-MM-DD'), 'locale', 'zh'), 'failed')
      on conflict (run_id) do nothing;
    update agent_runs set execution_mode = 'background' where id = r.id;
  end if;
  update agent_jobs set state = 'queued', attempts = 0, lease_token = null, lease_until = null, available_at = now()
  where run_id = p_run_id and state = 'failed' and coalesce(last_error, '') not like 'invalid_track:%'
    and coalesce(last_error, '') not like 'uncertain_write:%';
  if not found then raise exception 'Run cannot be resumed'; end if;
  update agent_runs set status = 'running', error = null, updated_at = now() where id = p_run_id;
  update agent_messages set ui = ui - 'quickReplies' where thread_id = r.thread_id and ui->>'failedRunId' = p_run_id::text;
  update agent_threads set updated_at = now() where id = r.thread_id;
  return jsonb_build_object('threadId', r.thread_id, 'runId', r.id, 'status', 'running');
end;
$$;
revoke all on function public.retry_agent_job(uuid) from public, anon, authenticated;
grant execute on function public.retry_agent_job(uuid) to authenticated;

create or replace function public.finish_agent_job(p_run_id uuid, p_lease uuid, p_error text default null, p_retryable boolean default true, p_activities jsonb default '[]'::jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare j agent_jobs%rowtype; r agent_runs%rowtype; msg text; replies jsonb; english boolean; invalid_track boolean; uncertain_write boolean;
begin
  select * into j from agent_jobs where run_id = p_run_id and lease_token = p_lease and state in ('leased', 'executing') for update;
  if not found then return; end if;
  select * into r from agent_runs where id = p_run_id for update;
  if r.status = 'completed' then
    update agent_jobs set state = 'completed', lease_until = null where run_id = p_run_id;
    return;
  end if;
  if p_error is null then raise exception 'Run has not completed'; end if;
  -- Non-planning commands do not all have idempotent business writes. Never
  -- replay a possibly committed deletion, gear insertion or natural-language undo.
  uncertain_write := exists(select 1 from agent_tool_calls where run_id = p_run_id
    and tool_name in ('add_gear', 'undo_last_agent_changes', 'delete_itinerary_items', 'delete_packing_items') and status <> 'completed');
  if uncertain_write then
    p_retryable := false;
    p_error := 'uncertain_write:' || p_error;
  end if;
  update agent_jobs set last_error = left(p_error, 4000) where run_id = p_run_id;
  if p_retryable and j.attempts < 3 then
    update agent_jobs set state = 'queued', available_at = now() + interval '10 seconds' * j.attempts,
      lease_token = null, lease_until = null where run_id = p_run_id;
    return;
  end if;
  update agent_jobs set state = 'failed', lease_until = null where run_id = p_run_id;
  update agent_runs set status = 'failed', error = left(p_error, 4000), updated_at = now() where id = p_run_id;
  update agent_tool_calls set status = 'failed', error = coalesce(error, 'Worker interrupted'), updated_at = now()
    where run_id = p_run_id and status = 'running';
  english := j.payload->>'locale' = 'en';
  invalid_track := p_error like 'invalid_track:%';
  msg := case
    when uncertain_write then case when english then 'Some changes may have been saved. Please check the current data before sending a new request.' else '部分更改可能已保存，请先核对当前内容，再发送新的需求。' end
    when invalid_track then case when english then 'This track could not be read. Please choose a valid GPX, KML, or KMZ file.' else '轨迹文件无法解析，请重新选择有效的 GPX、KML 或 KMZ 文件。' end
    when exists(select 1 from agent_threads where id = r.thread_id and current_journey_id is not null) then
      case when english then 'Your journey and saved changes are kept. Planning did not finish; you can continue.' else '旅程和已保存的内容已保留，规划尚未完成，可以继续规划。' end
    when jsonb_array_length(coalesce(j.payload->'attachments', '[]'::jsonb)) > 0 then
      case when english then 'Your uploaded files are kept. Planning did not finish; you can continue without uploading again.' else '上传的文件已保留，规划尚未完成，可以继续，无需重新上传。' end
    else case when english then 'Planning did not finish. You can continue from the saved progress.' else '规划尚未完成，可以从已保存的进度继续。' end end;
  replies := case when uncertain_write then '[]'::jsonb
    when invalid_track then jsonb_build_array(jsonb_build_object('label', case when english then 'Choose track' else '重新选择轨迹' end, 'message', '上传轨迹', 'action', 'upload_track'))
    else jsonb_build_array(jsonb_build_object('label', case when english then 'Continue planning' else '继续规划' end, 'message', case when english then 'Continue planning' else '继续规划' end, 'action', 'retry_run', 'runId', p_run_id)) end;
  insert into agent_messages(thread_id, user_id, role, content, ui)
  values(r.thread_id, r.user_id, 'assistant', msg, jsonb_build_object('failedRunId', p_run_id, 'quickReplies', replies, 'activities', p_activities)
    || case when invalid_track then jsonb_build_object('createJourneyFlow', jsonb_build_object('step', 'ask_track', 'originalMessage', j.payload->>'message')) else '{}'::jsonb end);
  update agent_threads set updated_at = now() where id = r.thread_id;
end;
$$;
revoke all on function public.finish_agent_job(uuid, uuid, text, boolean, jsonb) from public, anon, authenticated;
grant execute on function public.finish_agent_job(uuid, uuid, text, boolean, jsonb) to service_role;

create or replace function public.claim_agent_job()
returns jsonb language plpgsql security definer set search_path = public as $$
declare expired record; j agent_jobs%rowtype; r agent_runs%rowtype;
begin
  for expired in select * from agent_jobs where state in ('leased', 'executing') and lease_until < now() for update skip locked loop
    perform finish_agent_job(expired.run_id, expired.lease_token, 'Worker lease expired');
  end loop;
  select * into j from agent_jobs where state = 'queued' and available_at <= now()
    order by available_at for update skip locked limit 1;
  if not found then return null; end if;
  select * into r from agent_runs where id = j.run_id;
  if r.status <> 'running' then
    update agent_jobs set state = r.status where run_id = j.run_id;
    return null;
  end if;
  update agent_jobs set state = 'leased', attempts = attempts + 1, lease_token = gen_random_uuid(),
    lease_until = now() + interval '6 minutes' where run_id = j.run_id returning * into j;
  return jsonb_build_object('runId', j.run_id, 'userId', r.user_id, 'leaseToken', j.lease_token);
end;
$$;
revoke all on function public.claim_agent_job() from public, anon, authenticated;
grant execute on function public.claim_agent_job() to service_role;

-- Journey, owner membership and thread binding commit together.
create or replace function public.create_agent_journey(p_thread_id uuid, p_journey jsonb, p_companion jsonb)
returns jsonb language plpgsql set search_path = public as $$
declare linked text; saved journeys%rowtype;
begin
  select current_journey_id into linked from agent_threads where id = p_thread_id and user_id = auth.uid() for update;
  if not found then raise exception 'Thread not found'; end if;
  if linked is not null then
    select * into saved from journeys where id = linked and deleted_at is null;
    if not found then raise exception 'Journey unavailable'; end if;
    return jsonb_build_object('id', saved.id, 'name', saved.name, 'region', saved.region, 'planned_date', saved.planned_date, 'total_days', saved.total_days);
  end if;
  if p_journey->>'user_id' <> auth.uid()::text or p_companion->>'user_id' <> auth.uid()::text or p_companion->>'journey_id' <> p_journey->>'id' then raise exception 'Owner mismatch'; end if;
  saved := jsonb_populate_record(null::journeys, p_journey);
  insert into journeys(id, user_id, route_id, name, region, coord, lng, lat, dist, asc_, diff, tone, "desc", date,
    planned_date, days, total_days, track_coords, track_elevation, track_duration_ms, track_waypoints, track_file_url, track_file_name)
  values(saved.id, auth.uid(), saved.route_id, saved.name, saved.region, saved.coord, saved.lng, saved.lat, saved.dist,
    saved.asc_, saved.diff, saved.tone, saved."desc", saved.date, saved.planned_date, saved.days, saved.total_days,
    saved.track_coords, saved.track_elevation, saved.track_duration_ms, saved.track_waypoints, saved.track_file_url, saved.track_file_name)
  returning * into saved;
  insert into companions(user_id, journey_id, ini, name, color, is_host, is_self, sort_order)
    values(auth.uid(), saved.id, p_companion->>'ini', p_companion->>'name', p_companion->>'color', true, true, 0);
  update agent_threads set current_journey_id = saved.id where id = p_thread_id;
  return jsonb_build_object('id', saved.id, 'name', saved.name, 'region', saved.region, 'planned_date', saved.planned_date, 'total_days', saved.total_days);
end;
$$;
revoke all on function public.create_agent_journey(uuid, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.create_agent_journey(uuid, jsonb, jsonb) to authenticated;
