create function pg_temp.notes_check(ok boolean, message text) returns void language plpgsql as $$ begin
  if ok is distinct from true then raise exception '%', message; end if;
end $$;
select set_config('request.jwt.claim.sub',(select id::text from public.profiles order by id limit 1),true);
select set_config('test.stranger',(select id::text from public.profiles order by id offset 1 limit 1),true);
select set_config('test.journey','notes-test-'||gen_random_uuid()::text,true);
select set_config('test.thread',gen_random_uuid()::text,true);
select set_config('test.run',gen_random_uuid()::text,true);
select set_config('test.call',gen_random_uuid()::text,true);
select set_config('test.row','notes-row-'||gen_random_uuid()::text,true);
set local role authenticated;
insert into public.journeys(id,user_id,name,region,lng,lat,tone,total_days)
values(current_setting('test.journey'),auth.uid(),'Notes test','Test',110,25,'forest',4);
insert into public.timeline_groups(journey_id,user_id,name,sort_order,note)
values(current_setting('test.journey'),auth.uid(),'Day 1',0,'用户自己写的备注'),
      (current_setting('test.journey'),auth.uid(),'Day 2',1,null),
      (current_setting('test.journey'),auth.uid(),'Day 4',3,null);
select public.apply_agent_itinerary('[]',jsonb_build_array(
  jsonb_build_object('journey_id',current_setting('test.journey'),'user_id',auth.uid(),'name','Day 1','sort_order',0,'deleted',false,'note','不能覆盖用户内容','updated_at',now()),
  jsonb_build_object('journey_id',current_setting('test.journey'),'user_id',auth.uid(),'name','Day 2','sort_order',1,'deleted',false,'note','当天从成都出发，经康定前往营地。','updated_at',now())
));
select pg_temp.notes_check((select note='用户自己写的备注' from timeline_groups where journey_id=current_setting('test.journey') and name='Day 1'),'Existing note overwritten');
select pg_temp.notes_check((select note='当天从成都出发，经康定前往营地。' from timeline_groups where journey_id=current_setting('test.journey') and name='Day 2'),'Empty existing note not filled');
select pg_temp.notes_check(public.read_agent_journey_sections(current_setting('test.journey'),array['itinerary'])->'itineraryGroups' @> '[{"name":"Day 2","note":"当天从成都出发，经康定前往营地。"}]','Summary missing from context');
-- A failing row must roll back the note inserted by the same operation.
do $$ begin
  perform public.apply_agent_itinerary(jsonb_build_array(jsonb_build_object('id','invalid-row','journey_id',current_setting('test.journey'),'user_id',auth.uid(),'day','Day 3')),
    jsonb_build_array(jsonb_build_object('journey_id',current_setting('test.journey'),'user_id',auth.uid(),'name','Day 3','deleted',false,'sort_order',2,'note','Must roll back','updated_at',now())));
  raise exception 'Invalid row accepted';
exception when not_null_violation then null; end $$;
select pg_temp.notes_check(not exists(select 1 from timeline_groups where journey_id=current_setting('test.journey') and name='Day 3'),'Failed rows left a note behind');
-- Foreign users cannot fill a note on this journey.
select set_config('request.jwt.claim.sub',current_setting('test.stranger'),true);
do $$ begin
  perform public.apply_agent_itinerary('[]',jsonb_build_array(jsonb_build_object('journey_id',current_setting('test.journey'),'user_id',auth.uid(),'name','Day 4','deleted',false,'sort_order',3,'note','Foreign note','updated_at',now())));
  raise exception 'Foreign note accepted';
exception when insufficient_privilege then null; end $$;
-- The owner fixture's id is available again after resetting the local role.
reset role;
select set_config('request.jwt.claim.sub',(select user_id::text from journeys where id=current_setting('test.journey')),true);
set local role authenticated;
insert into public.agent_threads(id,user_id) values(current_setting('test.thread')::uuid,auth.uid());
insert into public.agent_runs(id,thread_id,user_id,status,agent_version)
values(current_setting('test.run')::uuid,current_setting('test.thread')::uuid,auth.uid(),'completed','notes-test');
insert into public.timeline_rows(id,journey_id,user_id,title,day,sort_order)
values(current_setting('test.row'),current_setting('test.journey'),auth.uid(),'成都','Day 2',0);
insert into public.agent_tool_calls(id,run_id,thread_id,user_id,tool_name,arguments,arguments_hash,status,undo_payload)
values(current_setting('test.call')::uuid,current_setting('test.run')::uuid,current_setting('test.thread')::uuid,auth.uid(),'add_itinerary_items','{}','notes-test','completed',
  jsonb_build_object('kind','add_itinerary_items','journeyId',current_setting('test.journey'),'rowIds',jsonb_build_array(current_setting('test.row')),'createdGroupNames','[]'::jsonb,
    'groupNotes',jsonb_build_array(jsonb_build_object('name','Day 2','previous',null,'applied','当天从成都出发，经康定前往营地。'))));
update timeline_groups set note='用户后续修改' where journey_id=current_setting('test.journey') and name='Day 2';
do $$ begin
  perform public.undo_agent_run(current_setting('test.run')::uuid);
  raise exception 'Edited summary undo accepted';
exception when raise_exception then
  if sqlerrm <> 'Itinerary group notes changed after this agent run' then raise; end if;
end $$;
select pg_temp.notes_check(exists(select 1 from timeline_rows where id=current_setting('test.row')),'Failed undo removed rows');
update timeline_groups set note='当天从成都出发，经康定前往营地。' where journey_id=current_setting('test.journey') and name='Day 2';
select public.undo_agent_run(current_setting('test.run')::uuid);
select pg_temp.notes_check((select note is null from timeline_groups where journey_id=current_setting('test.journey') and name='Day 2'),'Undo did not restore empty note');
select pg_temp.notes_check(not exists(select 1 from timeline_rows where id=current_setting('test.row')),'Undo retained generated rows');
select pg_temp.notes_check((select note='用户自己写的备注' from timeline_groups where journey_id=current_setting('test.journey') and name='Day 1'),'Undo affected unrelated user note');
