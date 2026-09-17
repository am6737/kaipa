create function pg_temp.check(ok boolean, message text) returns void language plpgsql as $$ begin
  if ok is distinct from true then raise exception '%', message; end if;
end $$;
select set_config('request.jwt.claim.sub',(select id::text from public.profiles order by id limit 1),true);
select set_config('test.journey','context-test-' || gen_random_uuid()::text,true);
select set_config('test.thread',gen_random_uuid()::text,true);
select set_config('test.run',gen_random_uuid()::text,true);
select set_config('test.call',gen_random_uuid()::text,true);
set local role authenticated;
insert into public.agent_threads(id,user_id) values(current_setting('test.thread')::uuid,auth.uid());
insert into public.agent_runs(id,thread_id,user_id,status,agent_version) values(current_setting('test.run')::uuid,current_setting('test.thread')::uuid,auth.uid(),'running','context-test');
select set_config('test.track',gen_random_uuid()::text,true);
insert into public.tracks(id,user_id,name,coords,waypoints)
values(current_setting('test.track')::uuid,auth.uid(),'Context test track','[[110,25],[110.01,25.01]]','[{"name":"End","km":1}]');
insert into public.journeys(id,user_id,name,region,lng,lat,tone,total_days,track_id)
values(current_setting('test.journey'),auth.uid(),'Context test','Test',110,25,'forest',1,current_setting('test.track')::uuid);
select set_config('test.versions',public.agent_context_versions(current_setting('test.journey'))::text,true);
select pg_temp.check((public.read_agent_journey_sections(current_setting('test.journey'),array['track'])->'trackSummary'->>'totalKm')::float8 > 1,'Track length summary missing');
select pg_temp.check(not(public.read_agent_journey_sections(current_setting('test.journey'),array['journey','track'])::text like '%coords%'),'Raw geometry leaked');
select pg_temp.check(not(public.read_agent_journey_sections(current_setting('test.journey'),array['itinerary']) ? 'packingLists'),'Section isolation failed');
update public.journeys set name='Renamed' where id=current_setting('test.journey');
select pg_temp.check(public.agent_context_versions(current_setting('test.journey'))->>'track' = current_setting('test.versions')::jsonb->>'track','Metadata update invalidated track');
select pg_temp.check(public.agent_context_versions(current_setting('test.journey'))->>'journey' <> current_setting('test.versions')::jsonb->>'journey','Metadata revision did not change');
-- Geometry now lives on the track. Editing it changes no journeys row, so this
-- only invalidates if the tracks trigger reaches the journeys that reference it.
update public.tracks set coords='[[110,25],[110.02,25.02]]' where id=current_setting('test.track')::uuid;
select pg_temp.check(public.agent_context_versions(current_setting('test.journey'))->>'track' <> current_setting('test.versions')::jsonb->>'track','Track edit not detected through shared track');
select set_config('test.versions',public.agent_context_versions(current_setting('test.journey'))::text,true);

insert into public.agent_tool_calls(id,run_id,thread_id,user_id,tool_name,arguments,arguments_hash,status)
values(current_setting('test.call')::uuid,current_setting('test.run')::uuid,current_setting('test.thread')::uuid,auth.uid(),'add_itinerary_items',jsonb_build_object('journeyId',current_setting('test.journey')),'context','running');
select public.apply_agent_journey_change(current_setting('test.call')::uuid,current_setting('test.journey'),current_setting('test.versions')::jsonb,
  jsonb_build_object('rows',jsonb_build_array(jsonb_build_object('id','row-' || current_setting('test.call'),'journey_id',current_setting('test.journey'),'user_id',auth.uid(),'title','Start walk','day','Day 1','is_synth',true,'is_custom',false,'checked',false,'sort_order',0)),
    'groups',jsonb_build_array(jsonb_build_object('journey_id',current_setting('test.journey'),'user_id',auth.uid(),'name','Day 1','deleted',false,'sort_order',0,'updated_at',now()))),
  '{"added":1}',jsonb_build_object('kind','add_itinerary_items','journeyId',current_setting('test.journey'),'rowIds',jsonb_build_array('row-' || current_setting('test.call')),'createdGroupNames',jsonb_build_array('Day 1')));
select pg_temp.check((select status='completed' and output->>'added'='1' and undo_payload is not null from public.agent_tool_calls where id=current_setting('test.call')::uuid),'Atomic receipt missing');
-- Lost-response retry returns its receipt even though the original expected version is now old.
select public.apply_agent_journey_change(current_setting('test.call')::uuid,current_setting('test.journey'),current_setting('test.versions')::jsonb,'{}','{}');
select pg_temp.check((select count(*)=1 from public.timeline_rows where journey_id=current_setting('test.journey')),'Retry duplicated rows');
select pg_temp.check(public.agent_context_versions(current_setting('test.journey'))->>'track' = current_setting('test.versions')::jsonb->>'track','Itinerary write invalidated track');
select set_config('test.versions',public.agent_context_versions(current_setting('test.journey'))::text,true);
update public.timeline_rows set title='User changed this' where journey_id=current_setting('test.journey');
update public.agent_tool_calls set status='running' where id=current_setting('test.call')::uuid;
do $$ begin
  begin
    perform public.apply_agent_journey_change(current_setting('test.call')::uuid,current_setting('test.journey'),current_setting('test.versions')::jsonb,'{}','{}');
    raise exception 'Stale write accepted';
  exception when sqlstate 'PT409' then null; end;
  perform pg_temp.check((select title='User changed this' from public.timeline_rows where journey_id=current_setting('test.journey')),'Concurrent user edit lost');
end $$;

-- Exact deletion identity is verified inside the transaction, not just by the model.
update public.agent_tool_calls set tool_name='delete_itinerary_items',arguments=jsonb_build_object('journeyId',current_setting('test.journey'),'items',jsonb_build_array(jsonb_build_object('id','row-' || current_setting('test.call'),'title','Wrong title'))) where id=current_setting('test.call')::uuid;
do $$ begin
  begin
    perform public.apply_agent_journey_change(current_setting('test.call')::uuid,current_setting('test.journey'),public.agent_context_versions(current_setting('test.journey')),'{}','{}');
    raise exception 'Stale identity accepted';
  exception when others then if sqlerrm <> 'Itinerary deletion targets changed' then raise; end if; end;
  perform pg_temp.check((select count(*)=1 from public.timeline_rows where journey_id=current_setting('test.journey')),'Deletion did not roll back');
end $$;
update public.agent_tool_calls set arguments=jsonb_build_object('journeyId',current_setting('test.journey'),'items',jsonb_build_array(jsonb_build_object('id','row-' || current_setting('test.call'),'title','User changed this'))) where id=current_setting('test.call')::uuid;
select public.apply_agent_journey_change(current_setting('test.call')::uuid,current_setting('test.journey'),public.agent_context_versions(current_setting('test.journey')),'{}','{"deleted":1}');

-- List creation and its items commit together; failed item validation leaves neither.
select set_config('test.list',gen_random_uuid()::text,true);
select set_config('test.item',gen_random_uuid()::text,true);
update public.agent_tool_calls set status='running',tool_name='add_packing_items',arguments=jsonb_build_object('journeyId',current_setting('test.journey'),'mode','incremental') where id=current_setting('test.call')::uuid;
do $$ begin
  begin
    perform public.apply_agent_journey_change(current_setting('test.call')::uuid,current_setting('test.journey'),public.agent_context_versions(current_setting('test.journey')),
      jsonb_build_object('listId',current_setting('test.list'),'createdList',true,'kind','shared','items',jsonb_build_array(jsonb_build_object('id',current_setting('test.item'),'name','Invalid','quantity',0,'sort_order',0))), '{}');
    raise exception 'Invalid packing write accepted';
  exception when check_violation then null; end;
  perform pg_temp.check(not exists(select 1 from public.journey_packing_lists where id=current_setting('test.list')::uuid),'Partial list creation survived failure');
end $$;
select public.apply_agent_journey_change(current_setting('test.call')::uuid,current_setting('test.journey'),public.agent_context_versions(current_setting('test.journey')),
  jsonb_build_object('listId',current_setting('test.list'),'createdList',true,'kind','shared','items',jsonb_build_array(jsonb_build_object('id',current_setting('test.item'),'name','Headlamp','quantity',1,'sort_order',0))), '{"added":1}');
select set_config('test.versions',public.agent_context_versions(current_setting('test.journey'))::text,true);
update public.journey_packing_items set packed=true where id=current_setting('test.item')::uuid;
select pg_temp.check(public.agent_context_versions(current_setting('test.journey'))->>'packing' <> current_setting('test.versions')::jsonb->>'packing','Checklist toggle did not invalidate packing');
select pg_temp.check(public.agent_context_versions(current_setting('test.journey'))->>'itinerary' = current_setting('test.versions')::jsonb->>'itinerary','Packing invalidated itinerary');
update public.agent_tool_calls set status='running',tool_name='delete_packing_items',arguments=jsonb_build_object('journeyId',current_setting('test.journey'),'items',jsonb_build_array(jsonb_build_object('id',current_setting('test.item'),'name','Headlamp'))) where id=current_setting('test.call')::uuid;
select public.apply_agent_journey_change(current_setting('test.call')::uuid,current_setting('test.journey'),public.agent_context_versions(current_setting('test.journey')),'{}','{"deleted":1}');

-- Map and group-endpoint branches preserve normal undo payloads and defaults.
update public.agent_tool_calls set status='running',tool_name='set_journey_map_location',arguments=jsonb_build_object('journeyId',current_setting('test.journey')) where id=current_setting('test.call')::uuid;
select public.apply_agent_journey_change(current_setting('test.call')::uuid,current_setting('test.journey'),public.agent_context_versions(current_setting('test.journey')),'{"region":"Updated","coord":"25 N 110 E","lng":110,"lat":25}','{}');
select pg_temp.check((select region='Updated' from public.journeys where id=current_setting('test.journey')),'Map branch failed');
update public.agent_tool_calls set status='running',tool_name='set_itinerary_group_endpoints' where id=current_setting('test.call')::uuid;
select public.apply_agent_journey_change(current_setting('test.call')::uuid,current_setting('test.journey'),public.agent_context_versions(current_setting('test.journey')),
  jsonb_build_object('groups',jsonb_build_array(jsonb_build_object('journey_id',current_setting('test.journey'),'name','Day 1','sort_order',0,'route_end_meters',100,'route_end_lng',110,'route_end_lat',25,'route_end_track_index',0,'route_end_track_fraction',0.5,'route_end_source','distance'))),'{}');
select pg_temp.check((select route_end_meters=100 from public.timeline_groups where journey_id=current_setting('test.journey')),'Endpoint branch failed');

select set_config('test.versions',public.agent_context_versions(current_setting('test.journey'))::text,true);
insert into public.gear_items(user_id,name,weight,price,qty,status) values(auth.uid(),'Context test gear',1,0,1,'packed');
select pg_temp.check(public.agent_context_versions(current_setting('test.journey'))->>'gear' <> current_setting('test.versions')::jsonb->>'gear','Gear change not detected');
select pg_temp.check(jsonb_array_length(public.read_agent_gear()->'items')>0,'Gear reader failed');
select pg_temp.check(not has_table_privilege('authenticated','public.agent_journey_revisions','UPDATE'),'Revision tokens writable by client');
insert into public.agent_context_cache(thread_id,user_id,resource_key,revision,data) values(current_setting('test.thread')::uuid,auth.uid(),'gear','1','{}');
insert into public.agent_session_memory(thread_id,user_id,through_id,summary) values(current_setting('test.thread')::uuid,auth.uid(),1,'Confirmed public transport preference');
reset role;
select set_config('test.owner',current_setting('request.jwt.claim.sub'),true);
select set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
set local role authenticated;
select pg_temp.check((select count(*)=0 from public.agent_context_cache where thread_id=current_setting('test.thread')::uuid),'Cross-user cache leaked');
select pg_temp.check((select count(*)=0 from public.agent_session_memory where thread_id=current_setting('test.thread')::uuid),'Cross-user memory leaked');
do $$ begin
  begin
    perform public.read_agent_journey_sections(current_setting('test.journey'),array['journey']);
    raise exception 'Cross-user read accepted';
  exception when others then if sqlerrm <> 'Journey unavailable' then raise; end if; end;
end $$;
reset role;
-- Deleting a journey with timeline groups and agent history must not let queued
-- AFTER UPDATE triggers recreate a revision row for a deleted parent.
select set_config('request.jwt.claim.sub',current_setting('test.owner'),true);
delete from public.journeys where id=current_setting('test.journey');
select pg_temp.check(not exists(select 1 from public.agent_journey_revisions where journey_id=current_setting('test.journey')),'Journey deletion left revision state');
