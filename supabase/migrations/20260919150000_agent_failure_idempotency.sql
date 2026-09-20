-- A worker can finish the same run after a retry or a lease race. Failure
-- finalization must be idempotent so one run cannot append duplicate replies.
create or replace function public.finish_agent_job(p_run_id uuid, p_lease uuid, p_error text default null, p_retryable boolean default true, p_activities jsonb default '[]'::jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare j agent_jobs%rowtype; r agent_runs%rowtype; msg text; replies jsonb; english boolean; invalid_track boolean; uncertain_write boolean;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_run_id::text, 0));
  select * into j from agent_jobs where run_id = p_run_id and lease_token = p_lease and state in ('leased', 'executing') for update;
  if not found then return; end if;
  select * into r from agent_runs where id = p_run_id for update;
  if r.status = 'completed' then
    update agent_jobs set state = 'completed', lease_until = null where run_id = p_run_id;
    return;
  end if;
  if p_error is null then raise exception 'Run has not completed'; end if;
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
  -- A previous finalizer may have committed while another execution was still
  -- unwinding. Do not append another assistant message for the same run.
  if exists (select 1 from agent_messages where role = 'assistant' and ui->>'failedRunId' = p_run_id::text) then
    update agent_jobs set state = 'failed', lease_until = null where run_id = p_run_id;
    update agent_runs set status = 'failed', error = left(p_error, 4000), updated_at = now()
      where id = p_run_id and status = 'running';
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
