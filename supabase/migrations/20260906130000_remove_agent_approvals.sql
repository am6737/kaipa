update public.agent_runs
set status = 'failed',
    error = coalesce(error, 'Approval flow removed'),
    updated_at = now()
where status = 'pending_approval';

drop index if exists public.agent_runs_thread_active_unique;

alter table public.agent_runs
  drop constraint if exists agent_runs_status_check,
  drop column if exists state,
  drop column if exists pending_approvals,
  drop column if exists approval_decisions;

alter table public.agent_runs
  add constraint agent_runs_status_check
  check (status in ('running', 'completed', 'failed'));

create unique index agent_runs_thread_active_unique
  on public.agent_runs(thread_id)
  where status = 'running';

create or replace function public.finalize_agent_run(target_run_id uuid, assistant_message text, message_ui jsonb)
returns void
language plpgsql
set search_path = public
as $$
declare
  run_record public.agent_runs%rowtype;
begin
  select * into run_record
  from public.agent_runs
  where id = target_run_id and user_id = auth.uid() and status = 'running'
  for update;
  if not found then raise exception 'Agent run is not active'; end if;

  update public.agent_runs
  set status = 'completed', final_output = assistant_message, updated_at = now()
  where id = target_run_id;
  insert into public.agent_messages (thread_id, user_id, role, content, ui)
  values (run_record.thread_id, run_record.user_id, 'assistant', assistant_message, coalesce(message_ui, '{}'::jsonb));
  update public.agent_threads set updated_at = now() where id = run_record.thread_id;
end;
$$;

grant execute on function public.finalize_agent_run(uuid, text, jsonb) to authenticated;
