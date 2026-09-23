-- A busy journey should read as "busy", not as a network failure.
--
-- Every journey child write takes the parent journeys row lock (see
-- 20260923160000_journey_parent_lock_no_key.sql for why it has to), so a save
-- that lands while another writer holds it waits. Nothing bounded that wait
-- except the authenticated role's statement_timeout, which killed the request at
-- 8s and reached the app as "内容未写入云端，请检查网络后重试" — a server-side lock
-- conflict reported as a connection problem the user cannot act on.
--
-- lock_timeout gives that wait its own, earlier exit with 55P03
-- (lock_not_available), a code the client can recognise and answer with "try
-- again in a moment". The agent path has had exactly this exit since
-- agent_lock_context (5s -> PT409 agent_context_conflict); this gives the app's
-- own writes the same one. It is set on the role rather than in the RPC because
-- the app also writes timeline_rows, timeline_groups and inspo_media through
-- PostgREST directly, which no function can cover.
--
-- Three seconds, not five: the happy path never waits for a lock, so a wait that
-- lasts longer than a queued sibling write (single-digit milliseconds) means
-- something else is mid-write on this journey, and there is nothing to gain by
-- making the user sit through it.
alter role authenticated set lock_timeout = '3s';

-- PostgREST caches role settings in its schema cache, and ALTER ROLE does not
-- trip the pgrst_watch DDL trigger the way a function change does. Measured: a
-- request still waited the full 8s statement_timeout after this migration until
-- the cache was reloaded, so without this line the change above looks inert.
notify pgrst, 'reload schema';
