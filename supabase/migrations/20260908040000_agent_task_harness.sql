-- Interpreted scope is worker-owned. Clients can inspect but cannot widen it.
create table if not exists public.agent_task_states (
  run_id uuid primary key references public.agent_runs(id) on delete cascade,
  thread_id uuid not null references public.agent_threads(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  state jsonb not null check (jsonb_typeof(state) = 'object'),
  created_at timestamptz not null default now()
);
create index if not exists agent_task_states_thread_idx on public.agent_task_states(thread_id, created_at desc);
alter table public.agent_task_states enable row level security;
revoke all on public.agent_task_states from public, anon, authenticated;
grant select on public.agent_task_states to authenticated;
grant all on public.agent_task_states to service_role;
drop policy if exists agent_task_states_read on public.agent_task_states;
create policy agent_task_states_read on public.agent_task_states for select to authenticated
  using (user_id = auth.uid());

-- Task outcome, user-visible answer and run completion settle together.
create or replace function public.finalize_agent_run(target_run_id uuid, assistant_message text, message_ui jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare r agent_runs%rowtype; target_journey text;
begin
  select * into r from agent_runs where id = target_run_id and user_id = auth.uid() and status = 'running' for update;
  if not found then raise exception 'Agent run is not active'; end if;
  if nullif(trim(assistant_message), '') is null or jsonb_typeof(message_ui) <> 'object' then
    raise exception 'Invalid agent result';
  end if;
  select current_journey_id into target_journey from agent_threads where id = r.thread_id;
  if message_ui ? 'taskOutcome' then
    update agent_task_states set state = state || jsonb_build_object(
      'outcome', message_ui->'taskOutcome', 'journeyId', target_journey)
      where run_id = r.id and user_id = r.user_id;
    if not found then raise exception 'Task state is missing'; end if;
  end if;
  update agent_runs set status = 'completed', final_output = assistant_message, updated_at = now() where id = r.id;
  insert into agent_messages(thread_id, user_id, role, content, ui)
    values(r.thread_id, r.user_id, 'assistant', assistant_message, message_ui || jsonb_build_object('requestId', r.id));
  update agent_threads set updated_at = now() where id = r.thread_id;
end;
$$;
revoke all on function public.finalize_agent_run(uuid, text, jsonb) from public, anon;
grant execute on function public.finalize_agent_run(uuid, text, jsonb) to authenticated;
