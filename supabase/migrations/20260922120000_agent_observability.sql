-- Agent reliability telemetry.
--
-- Every conclusion in docs/agent-harness.md about stage budgets was drawn from
-- agent_model_metrics, which only records one model call at a time. A stage
-- wraps a whole tool loop, so the numbers that set STAGE_BUDGETS never included
-- the 5-7 web searches the research stage runs inside that loop. Two gaps made
-- that invisible:
--
--   1. agent_tool_calls has no per-call duration. Its row is upserted on
--      (run_id, tool_name, arguments_hash), so a retry refreshes updated_at but
--      not created_at, and the difference spans attempts rather than one call.
--      Measured maxima of 1445s for add_packing_items and 179s for a
--      get_app_context read are that artifact, not real latency.
--   2. agent_model_metrics has no attempt, so summing a stage's calls across a
--      resumed run attributes three aborted attempts to one 120s stage.
--
-- This records the missing dimensions and adds the read-side views. Nothing
-- here changes execution; it makes the next execution change measurable.

-- --- per-call tool duration -------------------------------------------------
-- started_at is this attempt's start, reset whenever the row is re-upserted, so
-- it no longer has to double as the row's insert time.
alter table public.agent_tool_calls add column if not exists started_at timestamptz;
alter table public.agent_tool_calls add column if not exists duration_ms integer check (duration_ms is null or duration_ms >= 0);

-- --- per-attempt model attribution ------------------------------------------
alter table public.agent_model_metrics add column if not exists attempt integer not null default 1;
-- A call that was cut by a budget is not a model failure. Without this the
-- latency distribution is truncated at the budget by construction, which is how
-- STAGE_BUDGETS came to be calibrated against a distribution it was censoring.
alter table public.agent_model_metrics add column if not exists aborted boolean not null default false;

create index if not exists agent_model_metrics_stage_attempt_idx on public.agent_model_metrics(stage, attempt);
create index if not exists agent_tool_calls_duration_idx on public.agent_tool_calls(tool_name, duration_ms);

-- --- read side --------------------------------------------------------------
-- Budgets stay in pipeline.ts as the single source of truth; scripts/report-agent-health.mjs
-- joins them to these views and fails when a budget no longer clears the
-- measured wall clock. Holding a second copy here would only let the two drift.
--
-- These are operator-facing and readable only through service_role, which the
-- report script already uses. They are deliberately NOT granted to
-- authenticated, and that is a security requirement rather than a shortcut:
-- a plain view executes with its owner's privileges, and migrations run as a
-- superuser, so granting these to authenticated would bypass the underlying
-- RLS policies and expose every user's runs, tool arguments and error text.
--
-- If app-facing access is ever wanted, add `with (security_invoker = true)` to
-- each view first (Postgres 15+, and this is the only place in the schema that
-- would need it) and only then grant select.
create or replace view public.agent_version_health as
select
  r.agent_version,
  count(*) as runs,
  count(*) filter (where r.status = 'completed') as completed,
  round(100.0 * count(*) filter (where r.status = 'failed') / nullif(count(*), 0)) as failed_pct,
  min(r.created_at) as first_run,
  max(r.created_at) as last_run,
  -- extract() returns double precision before Postgres 16, and the two-argument
  -- round() only accepts numeric, so every percentile is cast explicitly.
  round((percentile_cont(0.5) within group (order by extract(epoch from r.updated_at - r.created_at)) / 60)::numeric, 1) as p50_min,
  round((percentile_cont(0.9) within group (order by extract(epoch from r.updated_at - r.created_at)) / 60)::numeric, 1) as p90_min,
  round((max(extract(epoch from r.updated_at - r.created_at)) / 60)::numeric, 1) as max_min
from public.agent_runs r
group by r.agent_version
order by max(r.created_at) desc;

-- Latest attempt per (run, stage), which is what decides whether a stage got
-- done. Older attempts are kept for the retry-rate signal below.
create or replace view public.agent_stage_latest as
select distinct on (s.run_id, s.stage)
  s.run_id, s.stage, s.status, s.attempt, s.error, s.created_at, s.updated_at,
  extract(epoch from s.updated_at - s.created_at) * 1000 as wall_ms,
  r.agent_version, r.status as run_status
from public.agent_stages s
join public.agent_runs r on r.id = s.run_id
order by s.run_id, s.stage, s.attempt desc;

-- Wall clock, not model time, is what a stage budget actually bounds.
create or replace view public.agent_stage_wallclock_vs_budget as
select
  l.agent_version,
  l.stage,
  count(*) as attempts,
  count(*) filter (where l.status = 'completed') as completed,
  count(*) filter (where l.status = 'degraded') as degraded,
  count(*) filter (where l.status = 'failed') as failed,
  count(distinct l.run_id) filter (where l.attempt > 1) as retried_runs,
  round((percentile_cont(0.5) within group (order by l.wall_ms) / 1000)::numeric, 1) as p50_s,
  round((percentile_cont(0.9) within group (order by l.wall_ms) / 1000)::numeric, 1) as p90_s,
  round((percentile_cont(0.99) within group (order by l.wall_ms) / 1000)::numeric, 1) as p99_s,
  round((max(l.wall_ms) / 1000)::numeric, 1) as max_s,
  -- A stage that lands within 3% of its budget was cut by it, not finished.
  count(*) filter (where l.wall_ms >= 0.97 * coalesce(b.budget_ms, 0)) as at_ceiling
from public.agent_stage_latest l
left join (values
  ('interpret', 30000), ('research', 120000), ('transport', 30000),
  ('plan', 180000), ('save', 90000), ('packing', 150000), ('respond', 60000)
) as b(stage, budget_ms) on b.stage = l.stage
group by l.agent_version, l.stage
order by l.agent_version desc, l.stage;

create or replace view public.agent_stage_failures as
select
  l.agent_version,
  l.stage,
  left(regexp_replace(coalesce(l.error, '(none)'), '\s+', ' ', 'g'), 160) as reason,
  count(*) as occurrences,
  count(distinct l.run_id) as runs
from public.agent_stage_latest l
where l.status in ('failed', 'running')
group by 1, 2, 3
order by occurrences desc;

-- Only trustworthy now that duration_ms is written per call. Rows predating the
-- column carry null and are excluded rather than reported as 0ms.
create or replace view public.agent_tool_latency as
select
  c.tool_name,
  count(*) as calls,
  count(*) filter (where c.status = 'completed') as completed,
  round(100.0 * count(*) filter (where c.status = 'failed') / nullif(count(*), 0)) as failed_pct,
  count(c.duration_ms) as measured,
  round((percentile_cont(0.5) within group (order by c.duration_ms) / 1000)::numeric, 1) as p50_s,
  round((percentile_cont(0.9) within group (order by c.duration_ms) / 1000)::numeric, 1) as p90_s,
  round((max(c.duration_ms) / 1000)::numeric, 1) as max_s
from public.agent_tool_calls c
where c.duration_ms is not null
group by c.tool_name
order by calls desc;

-- A stage still marked running under a terminal run is a resume hazard:
-- loadStageState treats a running row as an unfinished earlier attempt, so these
-- rows make the next attempt redo work it may already have paid for.
create or replace view public.agent_zombie_stages as
select l.run_id, l.stage, l.attempt, l.status, l.updated_at, r.status as run_status, r.agent_version
from public.agent_stages l
join public.agent_runs r on r.id = l.run_id
where l.status = 'running' and r.status <> 'running'
order by l.updated_at desc;

comment on view public.agent_stage_wallclock_vs_budget is
  'Stage wall clock percentiles against pipeline.ts STAGE_BUDGETS. at_ceiling counts stages cut by their budget; STAGE_BUDGETS must be derived from these percentiles, never from agent_model_metrics, which measures one model call and not the tool loop.';
comment on view public.agent_zombie_stages is
  'Stages left running after their run reached a terminal state. Expected row count is zero; a non-zero count means an abort path skipped stage finalization.';

-- service_role only. See the note above the first view: these are plain views,
-- so granting them to authenticated would read across every user's rows.
revoke all on public.agent_version_health, public.agent_stage_latest,
  public.agent_stage_wallclock_vs_budget, public.agent_stage_failures,
  public.agent_tool_latency, public.agent_zombie_stages from public, anon, authenticated;
grant all on public.agent_version_health, public.agent_stage_latest,
  public.agent_stage_wallclock_vs_budget, public.agent_stage_failures,
  public.agent_tool_latency, public.agent_zombie_stages to service_role;
