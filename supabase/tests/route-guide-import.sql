-- Executed inside the runner's transaction; all fixture data is rolled back.
create function pg_temp.guide_check(ok boolean, message text) returns void language plpgsql as $$ begin
  if ok is distinct from true then raise exception '%', message; end if;
end $$;
select set_config('test.owner',(select id::text from public.profiles order by id limit 1),true);
select set_config('test.stranger',(select id::text from public.profiles order by id offset 1 limit 1),true);
select pg_temp.guide_check(nullif(current_setting('test.stranger'),'') is not null,'Two profiles required');
select set_config('test.route',(select id from public.routes order by id limit 1),true);
select set_config('test.journey','guide-test-'||gen_random_uuid()::text,true);
select set_config('test.invalid','guide-invalid-'||gen_random_uuid()::text,true);
select set_config('request.jwt.claim.sub',current_setting('test.owner'),true);
insert into public.journeys(id,user_id,route_id,name,region,lng,lat,tone,total_days)
values(current_setting('test.journey'),auth.uid(),current_setting('test.route'),'Guide import test','Test',110,25,'forest',2),
      (current_setting('test.invalid'),auth.uid(),current_setting('test.route'),'Atomic import test','Test',110,25,'forest',2);
insert into public.companions(journey_id,user_id,name,ini,color,is_host,is_self,sort_order)
values(current_setting('test.journey'),auth.uid(),'Owner','O','#000000',true,true,0),
      (current_setting('test.invalid'),auth.uid(),'Owner','O','#000000',true,true,0);
select set_config('test.template',jsonb_build_object('id','stay-test','routeId',current_setting('test.route'),
 'days',jsonb_build_array(jsonb_build_object('title','First','items',jsonb_build_array('接驳','徒步','住宿')),jsonb_build_object('title','Second','items',jsonb_build_array('徒步','返程'))),
 'gear',jsonb_build_array(jsonb_build_object('name','头灯','categoryName','照明','quantity',1,'note','备用照明'),jsonb_build_object('name','保暖层','quantity',1)))::text,true);
set local role authenticated;
select public.journey_import_route_guide(current_setting('test.journey'),current_setting('test.template')::jsonb);
select pg_temp.guide_check((select count(*)=5 from public.timeline_rows where journey_id=current_setting('test.journey')),'Daily items missing');
select pg_temp.guide_check((select count(*)=2 from public.timeline_groups where journey_id=current_setting('test.journey') and name in ('Day 1','Day 2')),'Day groups missing');
select pg_temp.guide_check((select count(*)=1 from public.journey_packing_lists where journey_id=current_setting('test.journey') and kind='personal' and owner_companion_id in (select id from public.companions where user_id=auth.uid() and journey_id=current_setting('test.journey'))),'Personal list missing');
select pg_temp.guide_check((select count(*)=2 from public.journey_packing_items i join public.journey_packing_lists l on l.id=i.list_id where l.journey_id=current_setting('test.journey') and not packed and source_type='recommendedTemplate'),'Packing items missing');
-- Same request after a lost response must not duplicate itinerary or packing.
select public.journey_import_route_guide(current_setting('test.journey'),current_setting('test.template')::jsonb);
select pg_temp.guide_check((select count(*)=5 from public.timeline_rows where journey_id=current_setting('test.journey')),'Replay duplicated rows');
-- Invalid gear is encountered after timeline insertion: the entire import rolls back.
do $$ begin
  perform public.journey_import_route_guide(current_setting('test.invalid'),jsonb_set(current_setting('test.template')::jsonb,'{gear,1,quantity}','0'));
  raise exception 'Invalid gear accepted';
exception when invalid_parameter_value then null; end $$;
select pg_temp.guide_check((select count(*)=0 from public.timeline_rows where journey_id=current_setting('test.invalid')),'Failed gear left partial itinerary');
select pg_temp.guide_check((select count(*)=0 from public.timeline_groups where journey_id=current_setting('test.invalid')),'Failed import left day groups');
select pg_temp.guide_check((select count(*)=0 from public.journey_packing_lists where journey_id=current_setting('test.invalid')),'Failed import left packing list');
select pg_temp.guide_check((select count(*)=0 from public.journey_guide_imports where journey_id=current_setting('test.invalid')),'Failed import left receipt');
-- A different template may not replace already-imported or manually edited data.
do $$ begin
  perform public.journey_import_route_guide(current_setting('test.journey'),jsonb_set(current_setting('test.template')::jsonb,'{id}','"other"'));
  raise exception 'Different second template accepted';
exception when invalid_parameter_value then null; end $$;
do $$ begin
  perform public.journey_import_route_guide(current_setting('test.invalid'),jsonb_set(current_setting('test.template')::jsonb,'{routeId}','"wrong-route"'));
  raise exception 'Wrong route accepted';
exception when invalid_parameter_value then null; end $$;
do $$ begin
  perform public.journey_import_route_guide(current_setting('test.invalid'),jsonb_set(current_setting('test.template')::jsonb,'{days}','[{"items":["one"]}]'));
  raise exception 'Wrong duration accepted';
exception when invalid_parameter_value then null; end $$;
select public.journey_save_timeline_item('manual-'||current_setting('test.invalid'),current_setting('test.invalid'),true,'{"title":"My own plan","day":"Day 1"}');
do $$ begin
  perform public.journey_import_route_guide(current_setting('test.invalid'),current_setting('test.template')::jsonb);
  raise exception 'Nonempty journey accepted';
exception when invalid_parameter_value then null; end $$;
select pg_temp.guide_check((select count(*)=1 from public.timeline_rows where journey_id=current_setting('test.invalid')),'Existing itinerary was changed');
-- Another user cannot import or see the private import receipt.
select set_config('request.jwt.claim.sub',current_setting('test.stranger'),true);
do $$ begin
  perform public.journey_import_route_guide(current_setting('test.journey'),current_setting('test.template')::jsonb);
  raise exception 'Stranger import accepted';
exception when insufficient_privilege then null; end $$;
select pg_temp.guide_check((select count(*)=0 from public.journey_guide_imports where journey_id=current_setting('test.journey')),'Stranger sees private receipt');
reset role;
select pg_temp.guide_check((select count(*)=5 from public.timeline_rows where journey_id=current_setting('test.journey')),'Unauthorized request changed itinerary');
