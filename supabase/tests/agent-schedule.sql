-- Runs after agent-context.sql, inside its rollback-only transaction.
set local role authenticated;
update public.agent_runs set status='completed' where id=current_setting('test.run')::uuid;
select set_config('test.run',gen_random_uuid()::text,true);
select set_config('test.call',gen_random_uuid()::text,true);
insert into public.agent_runs(id,thread_id,user_id,status,agent_version)
values(current_setting('test.run')::uuid,current_setting('test.thread')::uuid,auth.uid(),'running','schedule-test');
insert into public.journeys(id,user_id,name,region,lng,lat,tone,total_days,days,planned_date,date)
values(current_setting('test.journey'),auth.uid(),'Schedule test','Test',110,25,'forest',1,'1 天','2026-09-10','2026-09-10');
insert into public.timeline_rows(id,journey_id,user_id,title,day,checked)
values('schedule-row',current_setting('test.journey'),auth.uid(),'Original hike','Day 1',true);
insert into public.timeline_groups(id,journey_id,user_id,name,sort_order,route_end_meters)
values('schedule-group',current_setting('test.journey'),auth.uid(),'Day 1',0,10000);
select set_config('test.change',jsonb_build_object('journeyId',current_setting('test.journey'),'totalDays',2,'plannedDate','2026-09-09','dayAssignments','[{"from":"Day 1","toDay":2}]'::jsonb)::text,true);
insert into public.agent_tool_calls(id,run_id,thread_id,user_id,tool_name,arguments,arguments_hash,status,created_at)
values(current_setting('test.call')::uuid,current_setting('test.run')::uuid,current_setting('test.thread')::uuid,auth.uid(),'update_journey_schedule',current_setting('test.change')::jsonb,'schedule','running',now());
select set_config('test.versions',public.agent_context_versions(current_setting('test.journey'))::text,true);
select public.apply_agent_journey_change(current_setting('test.call')::uuid,current_setting('test.journey'),current_setting('test.versions')::jsonb,current_setting('test.change')::jsonb,'{}');
select pg_temp.check((select total_days=2 and planned_date='2026-09-09' and date=planned_date from public.journeys where id=current_setting('test.journey')),'Dates/day count not updated');
select pg_temp.check((select day='Day 2' and checked and title='Original hike' from public.timeline_rows where id='schedule-row'),'Existing row was not preserved');
select pg_temp.check((select name='Day 2' and sort_order=1 and route_end_meters=10000 from public.timeline_groups where id='schedule-group'),'Group identity/endpoint lost');
select pg_temp.check((select status='completed' and undo_payload->>'kind'='update_journey_schedule' from public.agent_tool_calls where id=current_setting('test.call')::uuid),'Schedule receipt/undo missing');
select pg_temp.check(public.agent_context_versions(current_setting('test.journey'))->>'track'=current_setting('test.versions')::jsonb->>'track','Schedule invalidated raw track');
-- Replaying a committed RPC does not apply the move twice.
select public.apply_agent_journey_change(current_setting('test.call')::uuid,current_setting('test.journey'),current_setting('test.versions')::jsonb,current_setting('test.change')::jsonb,'{}');

do $$
declare before_state jsonb := public.agent_schedule_snapshot(current_setting('test.journey'));
begin
  begin
    perform public.agent_apply_schedule(current_setting('test.journey'),'{"totalDays":1,"dayAssignments":[{"from":"Day 2","toDay":2}]}');
    raise exception 'Out-of-bounds shrink accepted';
  exception when others then if sqlerrm not like 'Provide each existing%' then raise; end if; end;
  begin
    perform public.agent_apply_schedule(current_setting('test.journey'),'{"totalDays":3,"dayAssignments":[]}');
    raise exception 'Missing group accepted';
  exception when others then if sqlerrm not like 'Provide each existing%' then raise; end if; end;
  begin
    perform public.agent_apply_schedule(current_setting('test.journey'),'{"totalDays":3,"plannedDate":"2026-02-30","dayAssignments":[{"from":"Day 2","toDay":2}]}');
    raise exception 'Invalid date accepted';
  exception when datetime_field_overflow then null; end;
  perform pg_temp.check(before_state=public.agent_schedule_snapshot(current_setting('test.journey')),'Rejected schedule partially changed data');
end $$;

-- Stale writes fail before mutation, including a same-journey user edit.
select set_config('test.stale',gen_random_uuid()::text,true);
insert into public.agent_tool_calls(id,run_id,thread_id,user_id,tool_name,arguments,arguments_hash,status)
values(current_setting('test.stale')::uuid,current_setting('test.run')::uuid,current_setting('test.thread')::uuid,auth.uid(),'update_journey_schedule',current_setting('test.change')::jsonb,'stale','running');
do $$ begin
  begin
    perform public.apply_agent_journey_change(current_setting('test.stale')::uuid,current_setting('test.journey'),current_setting('test.versions')::jsonb,current_setting('test.change')::jsonb,'{}');
    raise exception 'Stale schedule accepted';
  exception when sqlstate 'PT409' then null; end;
end $$;

-- Undo must preserve unrelated manual edits, but refuse manual schedule edits.
update public.agent_runs set status='completed' where id=current_setting('test.run')::uuid;
update public.timeline_rows set title='User edited title',day='Day 1' where id='schedule-row';
do $$ begin
  begin
    perform public.undo_agent_run(current_setting('test.run')::uuid);
    raise exception 'Conflicting undo accepted';
  exception when others then if sqlerrm <> 'Journey schedule changed after this agent run' then raise; end if; end;
end $$;
update public.timeline_rows set day='Day 2' where id='schedule-row';
select public.undo_agent_run(current_setting('test.run')::uuid);
select pg_temp.check((select total_days=1 and planned_date='2026-09-10' from public.journeys where id=current_setting('test.journey')),'Undo did not restore dates');
select pg_temp.check((select title='User edited title' and checked and day='Day 1' from public.timeline_rows where id='schedule-row'),'Undo overwrote manual content');
select pg_temp.check((select name='Day 1' and route_end_meters=10000 from public.timeline_groups where id='schedule-group'),'Undo lost endpoint');
select public.undo_agent_run(current_setting('test.run')::uuid);

-- Swaps are in-place and avoid the unique(journey_id,name) collision.
insert into public.timeline_groups(id,journey_id,user_id,name,sort_order)
values('schedule-transport',current_setting('test.journey'),auth.uid(),'Day 2',1);
select public.agent_apply_schedule(current_setting('test.journey'),'{"totalDays":2,"dayAssignments":[{"from":"Day 1","toDay":2},{"from":"Day 2","toDay":1}]}');
select pg_temp.check((select name='Day 2' from public.timeline_groups where id='schedule-group'),'Swap failed');
select pg_temp.check((select name='Day 1' from public.timeline_groups where id='schedule-transport'),'Swap replaced existing group');
select pg_temp.check((select planned_date='2026-09-10' from public.journeys where id=current_setting('test.journey')),'Omitted date did not preserve date');
do $$ begin
  begin
    perform public.agent_apply_schedule(current_setting('test.journey'),'{"totalDays":2,"dayAssignments":[{"from":"Day 1","toDay":1},{"from":"Day 2","toDay":1}]}');
    raise exception 'Merged groups accepted';
  exception when others then if sqlerrm not like 'Provide each existing%' then raise; end if; end;
end $$;
reset role;
select set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
set local role authenticated;
do $$ begin
  begin
    perform public.agent_apply_schedule(current_setting('test.journey'),'{"totalDays":2,"dayAssignments":[]}');
    raise exception 'Cross-user schedule write accepted';
  exception when others then if sqlerrm <> 'Journey unavailable' then raise; end if; end;
end $$;
reset role;
select set_config('request.jwt.claim.sub',current_setting('test.owner'),true);
set local role authenticated;
update public.timeline_groups set route_end_meters=5000 where id='schedule-transport';
do $$ begin
  begin
    perform public.agent_apply_schedule(current_setting('test.journey'),'{"totalDays":2,"dayAssignments":[{"from":"Day 1","toDay":2},{"from":"Day 2","toDay":1}]}');
    raise exception 'Reversed route accepted';
  exception when others then if sqlerrm <> 'Schedule must preserve hiking route endpoint order' then raise; end if; end;
end $$;
-- An empty journey may change dates/day count without creating itinerary rows.
delete from public.timeline_rows where journey_id=current_setting('test.journey');
delete from public.timeline_groups where journey_id=current_setting('test.journey');
select public.agent_apply_schedule(current_setting('test.journey'),'{"totalDays":1,"dayAssignments":[]}');
select pg_temp.check((select total_days=1 from public.journeys where id=current_setting('test.journey')),'Empty journey shrink failed');
reset role;
