-- A journey-scoped conversation belongs to the journey and is deleted with it.
alter table public.agent_threads
  drop constraint if exists agent_threads_current_journey_id_fkey;

alter table public.agent_threads
  add constraint agent_threads_current_journey_id_fkey
  foreign key (current_journey_id)
  references public.journeys(id)
  on delete cascade;
