-- A legitimate regenerate (delete old list + draft 50+ items + repair + commit)
-- exceeds 400k tokens in one run, and an aborted attempt's unsettled
-- reservations keep counting against the same run key on retry. Raise the
-- per-run ceiling; the 20M daily global still bounds runaway loops.
update public.service_budgets set per_run_units = 800000
where service = 'ai_tokens' and per_run_units = 400000;
