-- Clarifications commit their request receipt and both messages together.
create or replace function public.save_agent_clarification(
  p_run_id uuid, p_thread_id uuid, p_user_message text, p_message text,
  p_user_ui jsonb, p_ui jsonb, p_version text
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare existing_run agent_runs%rowtype; saved_ui jsonb;
begin
  if auth.uid() is null or nullif(trim(p_user_message), '') is null or nullif(trim(p_message), '') is null
    or jsonb_typeof(p_user_ui) <> 'object' or jsonb_typeof(p_ui) <> 'object' then
    raise exception 'Invalid clarification';
  end if;
  perform 1 from agent_threads where id = p_thread_id and user_id = auth.uid() for update;
  if not found then raise exception 'Thread not found'; end if;
  select * into existing_run from agent_runs where id = p_run_id;
  if found then
    if existing_run.user_id <> auth.uid() or existing_run.thread_id <> p_thread_id then raise exception 'Run mismatch'; end if;
    select ui into saved_ui from agent_messages
      where thread_id = p_thread_id and role = 'assistant' and ui->>'requestId' = p_run_id::text
      order by created_at desc limit 1;
    return jsonb_build_object('threadId', p_thread_id, 'runId', p_run_id, 'status', existing_run.status,
      'message', existing_run.final_output, 'ui', saved_ui, 'quickReplies', saved_ui->'quickReplies');
  end if;
  if exists(select 1 from agent_runs where thread_id = p_thread_id and status = 'running') then
    raise exception 'A run is already active';
  end if;
  saved_ui := p_ui || jsonb_build_object('requestId', p_run_id);
  insert into agent_runs(id, thread_id, user_id, status, agent_version, execution_mode, final_output)
    values(p_run_id, p_thread_id, auth.uid(), 'completed', p_version, 'request', p_message);
  insert into agent_messages(thread_id, user_id, role, content, ui, created_at) values
    (p_thread_id, auth.uid(), 'user', p_user_message, p_user_ui || jsonb_build_object('requestId', p_run_id), clock_timestamp());
  insert into agent_messages(thread_id, user_id, role, content, ui, created_at) values
    (p_thread_id, auth.uid(), 'assistant', p_message, saved_ui, clock_timestamp());
  update agent_threads set updated_at = now() where id = p_thread_id;
  return jsonb_build_object('threadId', p_thread_id, 'runId', p_run_id, 'status', 'completed',
    'message', p_message, 'ui', saved_ui, 'quickReplies', saved_ui->'quickReplies');
end;
$$;
revoke all on function public.save_agent_clarification(uuid, uuid, text, text, jsonb, jsonb, text) from public, anon, authenticated;
grant execute on function public.save_agent_clarification(uuid, uuid, text, text, jsonb, jsonb, text) to authenticated;
