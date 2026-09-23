begin;

-- What the maintained route-facts library (线路资料) contributed to a run.
--
-- The knowledge base was unmeasurable: get_route_facts results only ever
-- entered the planning prompt, so nothing recorded whether a run read facts at
-- all, how many reached the model, or whether the read failed. loadRouteFacts
-- degrades every miss to "no facts", which makes a missing RPC, a missing grant,
-- an unapplied migration and an empty library look identical from the outside —
-- and the deployed function was reading that RPC with the user-scoped client,
-- which has no execute grant, so the live read path returned nothing at all.
--
-- Recorded on the research stage row rather than inside the stage artifact: the
-- artifact is the ResearchBrief, a model output schema that findRecentBrief
-- re-parses with safeParse on cross-run reuse, so a system-written counter there
-- would have to become part of the model's contract. agent_stages.stage also has
-- a CHECK constraint listing the stage names, so this is a column on the
-- research row rather than a stage of its own.

alter table public.agent_stages add column if not exists route_facts jsonb;
alter table public.agent_stages add column if not exists route_fact_stats jsonb;
alter table public.agent_stages add column if not exists route_fact_error text;

comment on column public.agent_stages.route_facts is
  'Route facts injected into this run''s research prompt, as [{entryId, routeName, category, title, sourceUrl, reviewedAt, reviewDueAt, stale}]. Written by runResearch, read by the assistant UI to cite verified facts.';
comment on column public.agent_stages.route_fact_stats is
  'Per-run route-fact counters: {loaded, injected, read_failed, reused, suggestions_written, unknown_targets}.';
comment on column public.agent_stages.route_fact_error is
  'Non-null when the route-facts read failed. The run continues without facts, so this is the only record that the library was skipped for a reason other than being empty.';

-- Per day and agent version, off the latest attempt per run: a retried run has
-- one research row per attempt, and summing them would count the same read
-- twice. Kept as its own view rather than added to agent_stage_latest, which
-- other reads depend on and which does not select these columns.
create or replace view public.agent_route_fact_stats as
with latest as (
  select distinct on (s.run_id, s.stage) s.run_id, s.stage, s.updated_at, s.route_fact_stats, s.route_fact_error
  from public.agent_stages s
  where s.stage = 'research'
  order by s.run_id, s.stage, s.attempt desc
)
select
  r.agent_version,
  date_trunc('day', l.updated_at)::date as day,
  count(*) as research_runs,
  count(*) filter (where coalesce((l.route_fact_stats ->> 'injected')::int, 0) > 0) as runs_with_facts,
  coalesce(sum((l.route_fact_stats ->> 'loaded')::int), 0) as loaded,
  coalesce(sum((l.route_fact_stats ->> 'injected')::int), 0) as injected,
  count(*) filter (where (l.route_fact_stats ->> 'read_failed')::boolean) as read_failed,
  count(*) filter (where (l.route_fact_stats ->> 'reused')::boolean) as reused,
  coalesce(sum((l.route_fact_stats ->> 'suggestions_written')::int), 0) as suggestions,
  coalesce(sum((l.route_fact_stats ->> 'unknown_targets')::int), 0) as unknown_targets,
  count(*) filter (where l.route_fact_error is not null) as read_errors
from latest l
join public.agent_runs r on r.id = l.run_id
group by 1, 2
order by 2 desc, 1;

comment on view public.agent_route_fact_stats is
  'Route-fact contribution per day and agent_version. read_failed > 0 means the 线路资料 read failed and the run planned without it; loaded > 0 with injected = 0 means the facts never reached the brief (a wiring regression); unknown_targets > 0 means the model proposed a revision of an entry it was not shown.';

-- service_role only, for the same reason as the other observability views: a
-- plain view executes with its owner's privileges, so granting it to
-- authenticated would read across every user's rows. Add
-- `with (security_invoker = true)` before granting if app-facing access is ever
-- wanted.
revoke all on public.agent_route_fact_stats from public, anon, authenticated;
grant all on public.agent_route_fact_stats to service_role;

commit;
