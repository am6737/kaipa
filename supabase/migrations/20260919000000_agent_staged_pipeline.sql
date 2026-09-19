-- Staged pipeline for long planning tasks.
--
-- The monolithic runner gave one 210s budget to a task whose model time is
-- minutes, so every full plan timed out, retried and re-ran its finished work
-- while the abandoned attempt still held journey row locks. This migration
-- adds the durable per-stage state the staged pipeline resumes from, and
-- aligns the infrastructure ceilings that used to be shorter than the work.

begin;

-- Current stage of a running plan, written by the stage runner and read by the
-- progress UI. Null for light-path runs and for finished runs.
alter table public.agent_runs add column if not exists stage text;

create table if not exists public.agent_stages (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.agent_runs(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  stage text not null check (stage in ('interpret', 'research', 'plan', 'save', 'packing', 'respond')),
  status text not null default 'queued' check (status in ('queued', 'running', 'completed', 'skipped', 'failed')),
  -- Job attempt that produced this row; a resumed attempt starts at the first
  -- stage without a completed row instead of redoing finished work.
  attempt integer not null default 0,
  artifact jsonb,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (run_id, stage, attempt)
);
create index if not exists agent_stages_run_idx on public.agent_stages(run_id);
alter table public.agent_stages enable row level security;
revoke all on public.agent_stages from public, anon, authenticated;
grant select on public.agent_stages to authenticated;
grant all on public.agent_stages to service_role;
drop policy if exists agent_stages_read on public.agent_stages;
create policy agent_stages_read on public.agent_stages for select to authenticated using (user_id = auth.uid());

-- The lease must outlive the whole staged pipeline (stage budgets total ~10
-- minutes plus finalization), not one model call.
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
    lease_until = now() + interval '12 minutes' where run_id = j.run_id returning * into j;
  return jsonb_build_object('runId', j.run_id, 'userId', r.user_id, 'leaseToken', j.lease_token);
end;
$$;
revoke all on function public.claim_agent_job() from public, anon, authenticated;
grant execute on function public.claim_agent_job() to service_role;

-- An abandoned edge execution cannot be cancelled from outside, and its row
-- locks used to stall the recovery attempt for minutes. Fail fast instead:
-- every caller of agent_lock_context (journey reads, version-checked writes,
-- schedule edits) already treats PT409 as "read fresh, then replan", so a
-- bounded lock wait becomes that same application-level conflict.
create or replace function public.agent_lock_context(p_journey_id text default null) returns void
language plpgsql security definer set search_path=public as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  perform set_config('lock_timeout', '5000', true);
  begin
    if p_journey_id is not null then
      if not public.is_journey_member(p_journey_id) then raise exception 'Journey unavailable'; end if;
      perform 1 from public.journeys where id=p_journey_id and deleted_at is null for update;
      if not found then raise exception 'Journey unavailable'; end if;
    end if;
    perform 1 from public.agent_personal_revisions where user_id=auth.uid() for update;
  exception when lock_not_available then
    raise exception using errcode='PT409',
      message='agent_context_conflict: concurrent agent write in progress; read current sections before replanning';
  end;
end $$;

-- Run progress (stage transitions, tool receipts) is pushed to the client
-- instead of polled; RLS already restricts reads to the owning user.
alter table public.agent_runs replica identity full;
alter table public.agent_stages replica identity full;
alter table public.agent_tool_calls replica identity full;

do $$
declare target text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    return;
  end if;
  foreach target in array array['agent_runs', 'agent_stages', 'agent_tool_calls'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = target
    ) then
      execute format('alter publication supabase_realtime add table public.%I', target);
    end if;
  end loop;
end;
$$;

commit;
