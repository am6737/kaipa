create table if not exists public.agent_packing_drafts (
  run_id uuid primary key references public.agent_runs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  revision integer not null check (revision > 0),
  state jsonb not null check (jsonb_typeof(state) = 'object' and (state->>'revision')::integer = revision),
  last_edit text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.agent_packing_drafts enable row level security;
revoke all on public.agent_packing_drafts from public, anon, authenticated;
grant select on public.agent_packing_drafts to authenticated;
grant all on public.agent_packing_drafts to service_role;
drop policy if exists agent_packing_drafts_read on public.agent_packing_drafts;
create policy agent_packing_drafts_read on public.agent_packing_drafts for select to authenticated using (user_id = auth.uid());

create table if not exists public.agent_model_metrics (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.agent_runs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  stage text not null,
  model text not null,
  duration_ms integer not null check (duration_ms >= 0),
  success boolean not null,
  usage jsonb,
  created_at timestamptz not null default now()
);
create index if not exists agent_model_metrics_run_idx on public.agent_model_metrics(run_id);
alter table public.agent_model_metrics enable row level security;
revoke all on public.agent_model_metrics from public, anon, authenticated;
grant select on public.agent_model_metrics to authenticated;
grant all on public.agent_model_metrics to service_role;
drop policy if exists agent_model_metrics_read on public.agent_model_metrics;
create policy agent_model_metrics_read on public.agent_model_metrics for select to authenticated using (user_id = auth.uid());
