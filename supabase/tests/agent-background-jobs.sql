\set ON_ERROR_STOP on
begin;
-- All fixtures and queue changes roll back. Run against an idle test queue.
select set_config('request.jwt.claim.sub', (select id::text from profiles limit 1), true);
select set_config('test.thread', gen_random_uuid()::text, true);
select set_config('test.run', gen_random_uuid()::text, true);
set local role authenticated;
insert into agent_threads(id, user_id) values(current_setting('test.thread')::uuid, auth.uid());
select enqueue_agent_job(current_setting('test.run')::uuid, current_setting('test.thread')::uuid,
  '{"message":"Test planning","locale":"en","attachments":[]}', 'Test planning', 'test');
select enqueue_agent_job(current_setting('test.run')::uuid, current_setting('test.thread')::uuid,
  '{"message":"Test planning"}', 'Test planning', 'test');
do $$ begin
  if (select count(*) from agent_messages where thread_id = current_setting('test.thread')::uuid) <> 1 then raise exception 'Duplicate user message'; end if;
  if has_table_privilege('authenticated', 'agent_jobs', 'SELECT') then raise exception 'Private queue is readable'; end if;
  if has_function_privilege('authenticated', 'claim_agent_job()', 'EXECUTE') then raise exception 'User can claim queue'; end if;
end $$;

select create_agent_journey(current_setting('test.thread')::uuid,
  jsonb_build_object('id', 'test-job-' || current_setting('test.run'), 'user_id', auth.uid(), 'name', 'Queue test', 'region', 'Test', 'lng', 110, 'lat', 25, 'tone', 'forest'),
  jsonb_build_object('user_id', auth.uid(), 'journey_id', 'test-job-' || current_setting('test.run'), 'ini', 'T', 'name', 'Test', 'color', '#000000'));
select create_agent_journey(current_setting('test.thread')::uuid,
  jsonb_build_object('id', 'duplicate-' || current_setting('test.run'), 'user_id', auth.uid()), '{}'::jsonb);
do $$ begin
  if (select count(*) from companions where journey_id = 'test-job-' || current_setting('test.run')) <> 1 then raise exception 'Duplicate membership'; end if;
  if exists(select 1 from journeys where id = 'duplicate-' || current_setting('test.run')) then raise exception 'Duplicate journey'; end if;
  if not (select participant_permissions->>'editTimeline' = 'true' and route_show_photos and not track_public from journeys where id = 'test-job-' || current_setting('test.run')) then raise exception 'Journey defaults lost'; end if;
end $$;
reset role;
update agent_jobs set available_at = '-infinity' where run_id = current_setting('test.run')::uuid;
select set_config('test.claim', claim_agent_job()::text, true);
do $$ begin
  if current_setting('test.claim')::jsonb->>'runId' <> current_setting('test.run') then raise exception 'Unexpected queue fixture'; end if;
end $$;
select finish_agent_job(current_setting('test.run')::uuid, (current_setting('test.claim')::jsonb->>'leaseToken')::uuid, 'Temporary timeout', true);
do $$ begin
  if (select status from agent_runs where id = current_setting('test.run')::uuid) <> 'running' then raise exception 'Transient error exposed'; end if;
  if (select state from agent_jobs where run_id = current_setting('test.run')::uuid) <> 'queued' then raise exception 'Retry not queued'; end if;
end $$;
update agent_jobs set available_at = '-infinity', attempts = 2 where run_id = current_setting('test.run')::uuid;
select set_config('test.claim', claim_agent_job()::text, true);
select finish_agent_job(current_setting('test.run')::uuid, (current_setting('test.claim')::jsonb->>'leaseToken')::uuid, 'Temporary timeout', true);
do $$ begin
  if (select status from agent_runs where id = current_setting('test.run')::uuid) <> 'failed' then raise exception 'Exhausted retries not failed'; end if;
  if not exists(select 1 from agent_messages where thread_id = current_setting('test.thread')::uuid and ui->'quickReplies'->0->>'action' = 'retry_run') then raise exception 'Missing continue action'; end if;
end $$;
set local role authenticated;
select retry_agent_job(current_setting('test.run')::uuid);
select retry_agent_job(current_setting('test.run')::uuid);
reset role;
update agent_jobs set available_at = '-infinity' where run_id = current_setting('test.run')::uuid;
select set_config('test.claim', claim_agent_job()::text, true);
update agent_jobs set lease_until = now() - interval '1 second' where run_id = current_setting('test.run')::uuid;
select claim_agent_job();
do $$ begin
  if (select state from agent_jobs where run_id = current_setting('test.run')::uuid) <> 'queued' then raise exception 'Expired worker not recovered'; end if;
end $$;
update agent_jobs set available_at = '-infinity' where run_id = current_setting('test.run')::uuid;
select set_config('test.claim', claim_agent_job()::text, true);
select finish_agent_job(current_setting('test.run')::uuid, gen_random_uuid(), 'Stale callback', false);
do $$ begin
  if (select state from agent_jobs where run_id = current_setting('test.run')::uuid) <> 'leased' then raise exception 'Invalid lease accepted'; end if;
end $$;
set local role authenticated;
select finalize_agent_run(current_setting('test.run')::uuid, 'Completed test', '{}');
reset role;
select finish_agent_job(current_setting('test.run')::uuid, (current_setting('test.claim')::jsonb->>'leaseToken')::uuid);
do $$ begin
  if (select state from agent_jobs where run_id = current_setting('test.run')::uuid) <> 'completed' then raise exception 'Completion missing'; end if;
end $$;
update agent_runs set status = 'running' where id = current_setting('test.run')::uuid;
update agent_jobs set state = 'leased', attempts = 1 where run_id = current_setting('test.run')::uuid;
insert into agent_tool_calls(run_id, thread_id, user_id, tool_name, arguments, arguments_hash, status)
values(current_setting('test.run')::uuid, current_setting('test.thread')::uuid, auth.uid(), 'undo_last_agent_changes', '{}', 'test', 'running');
select finish_agent_job(current_setting('test.run')::uuid, (current_setting('test.claim')::jsonb->>'leaseToken')::uuid, 'Lost response', true);
do $$ begin
  if (select status from agent_runs where id = current_setting('test.run')::uuid) <> 'failed' then raise exception 'Uncertain undo was retried'; end if;
  if (select last_error from agent_jobs where run_id = current_setting('test.run')::uuid) not like 'uncertain_write:%' then raise exception 'Missing uncertain outcome'; end if;
  begin
    perform retry_agent_job(current_setting('test.run')::uuid);
    raise exception 'Uncertain undo was resumable';
  exception when others then
    if sqlerrm <> 'An uncertain write requires inspection' then raise; end if;
  end;
end $$;
rollback;
\echo 'Agent queue transaction tests passed (all fixtures rolled back).'
