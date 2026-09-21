-- A stage can finish with a usable but incomplete artifact: the plan stage's
-- deterministic fallback keeps the journey and the research handoff but has no
-- itinerary to save. Recording that as 'completed' told the app the plan
-- succeeded while the journey stayed empty, and the reply had to carry the
-- explanation on its own. Give that outcome its own status so the run, the
-- stage row and the UI can all tell "finished" from "fell back".
alter table public.agent_stages drop constraint if exists agent_stages_status_check;
alter table public.agent_stages add constraint agent_stages_status_check
  check (status in ('queued', 'running', 'completed', 'skipped', 'failed', 'degraded'));
