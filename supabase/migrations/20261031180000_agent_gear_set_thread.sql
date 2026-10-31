-- agent_gear_set_thread.sql — one conversation per 装备清单.
--
-- 清单判官 and AI 配装 used to start a fresh assistant thread on every tap, and
-- with no conversation list the earlier review was then unreachable. A journey
-- already owns its thread through agent_threads.current_journey_id; gear_sets.id
-- is text like journeys.id, so the link looks the same.
--
--   gear_set_id                  the set this thread is about.
--   gear_set_review_fingerprint  the set contents the last 清单判官 reviewed. The
--                                app sends it with the review turn and compares it
--                                on the next tap: same fingerprint opens the thread
--                                without running the model again.
-- RLS needs no new policy: agent_threads_own already scopes every column to the
-- thread's user_id.

begin;

alter table public.agent_threads
  add column if not exists gear_set_id text references public.gear_sets(id) on delete set null,
  add column if not exists gear_set_review_fingerprint text;

-- The lookup is "the newest thread for this set".
create index if not exists agent_threads_gear_set_idx
  on public.agent_threads (gear_set_id, updated_at desc)
  where gear_set_id is not null;

notify pgrst, 'reload schema';
commit;
