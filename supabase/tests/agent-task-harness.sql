create function pg_temp.harness_check(ok boolean, message text) returns void language plpgsql as $$ begin
  if ok is distinct from true then raise exception '%', message; end if;
end $$;
select set_config('request.jwt.claim.sub', (select id::text from public.profiles order by id limit 1), true);
select set_config('test.harness_owner', current_setting('request.jwt.claim.sub'), true);
select set_config('test.harness_thread', gen_random_uuid()::text, true);
select set_config('test.harness_run', gen_random_uuid()::text, true);
set local role authenticated;
insert into public.agent_threads(id,user_id) values(current_setting('test.harness_thread')::uuid,auth.uid());
insert into public.agent_runs(id,thread_id,user_id,status,agent_version) values
  (current_setting('test.harness_run')::uuid,current_setting('test.harness_thread')::uuid,auth.uid(),'running','harness-test');
select pg_temp.harness_check(not has_table_privilege('authenticated','public.agent_task_states','INSERT'), 'Client can create execution scope');
select pg_temp.harness_check(not has_table_privilege('authenticated','public.agent_task_states','UPDATE'), 'Client can widen execution scope');
reset role;
insert into public.agent_task_states(run_id,thread_id,user_id,state) values
  (current_setting('test.harness_run')::uuid,current_setting('test.harness_thread')::uuid,current_setting('test.harness_owner')::uuid,
   '{"decision":{"mode":"discuss","operations":[]},"outcome":null}');
set local role authenticated;
select pg_temp.harness_check((select count(*)=1 from public.agent_task_states where run_id=current_setting('test.harness_run')::uuid), 'Owner cannot inspect task');
select public.finalize_agent_run(current_setting('test.harness_run')::uuid, 'Draft only',
  '{"taskOutcome":{"status":"draft","pendingQuestion":null,"draft":{"id":"draft-1","title":"Route","body":"Proposed route"},"missingOperations":[]}}');
select pg_temp.harness_check((select state->'outcome'->>'status'='draft' and state->'decision'->>'mode'='discuss' from public.agent_task_states where run_id=current_setting('test.harness_run')::uuid), 'Finalization lost state or changed scope');
select pg_temp.harness_check((select status='completed' from public.agent_runs where id=current_setting('test.harness_run')::uuid), 'Run not settled');
select pg_temp.harness_check((select count(*)=1 from public.agent_messages where thread_id=current_setting('test.harness_thread')::uuid and ui->>'requestId'=current_setting('test.harness_run')), 'Final answer receipt missing');
reset role;
select set_config('request.jwt.claim.sub', gen_random_uuid()::text, true);
set local role authenticated;
select pg_temp.harness_check((select count(*)=0 from public.agent_task_states where run_id=current_setting('test.harness_run')::uuid), 'Cross-user task state leaked');
reset role;
