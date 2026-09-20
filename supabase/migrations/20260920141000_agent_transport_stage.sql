-- The staged pipeline now has a first-class transport planning stage.
begin;
alter table public.agent_stages drop constraint if exists agent_stages_stage_check;
alter table public.agent_stages add constraint agent_stages_stage_check
  check (stage in ('interpret', 'research', 'transport', 'plan', 'save', 'packing', 'respond'));
commit;
