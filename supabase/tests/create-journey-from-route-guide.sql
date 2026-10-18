begin;
create function pg_temp.check(ok boolean, message text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'check failed: %',message; end if; end $$;
create function pg_temp.reject(statement text, expected text) returns void language plpgsql as $$
begin
  execute statement;
  raise exception 'check failed: expected %',expected;
exception when others then
  if sqlerrm like 'check failed:%' then raise; end if;
  if position(expected in sqlerrm)=0 then raise exception 'check failed: expected %, got %',expected,sqlerrm; end if;
end $$;
select set_config('test.owner',gen_random_uuid()::text,true),
  set_config('test.other',gen_random_uuid()::text,true),
  set_config('test.route','guide-test-'||gen_random_uuid()::text,true),
  set_config('test.guide',gen_random_uuid()::text,true),
  set_config('test.hidden',gen_random_uuid()::text,true),
  set_config('test.request',gen_random_uuid()::text,true),
  set_config('test.gear_request',gen_random_uuid()::text,true);
insert into auth.users(id,email,role,aud,is_anonymous) values
  (current_setting('test.owner')::uuid,'guide-owner@test','authenticated','authenticated',false),
  (current_setting('test.other')::uuid,'guide-other@test','authenticated','authenticated',false);
insert into public.profiles(id,display_name,nick,avatar_ini) values
  (current_setting('test.owner')::uuid,'攻略测试','攻略测试','攻'),
  (current_setting('test.other')::uuid,'其他用户','其他用户','其')
  on conflict(id) do update set display_name=excluded.display_name,nick=excluded.nick,avatar_ini=excluded.avatar_ini;
insert into public.routes(id,name,region,lng,lat,tone,track_coords,track_elevation,track_file_name,dist,asc_)
values(current_setting('test.route'),'测试线路','四川',99.9,29.9,'forest',
  '[[99.9,29.9],[100.0,30.0]]'::jsonb,'[4000,4100]'::jsonb,'测试线路.kml','32 km','1200 m');
insert into public.route_guides(id,route_id,author_id,title,plan,status) values
  (current_setting('test.guide')::uuid,current_setting('test.route'),current_setting('test.owner')::uuid,'测试攻略',
   '{"id":"fixture","routeId":"fixture","days":[{"title":{"zh":"首日","en":"First"},"items":[{"zh":"集合","en":"Gather"},{"zh":"营地","en":"Camp"}]},{"title":{"zh":"次日","en":"Second"},"items":[{"zh":"登顶","en":"Summit"}]}],"gear":[{"name":{"zh":"帐篷","en":"Tent"},"category":{"zh":"露营","en":"Camp"},"note":{"zh":"双人","en":"Two person"},"quantity":2}]}'::jsonb,'approved'),
  (current_setting('test.hidden')::uuid,current_setting('test.route'),current_setting('test.owner')::uuid,'待审攻略',
   '{"days":[{"items":[{"zh":"集合"}]}],"gear":[]}'::jsonb,'pending');
select set_config('request.jwt.claims',json_build_object('sub',current_setting('test.owner'),'role','authenticated')::text,true);
select set_config('request.jwt.claim.sub',current_setting('test.owner'),true);
set local role authenticated;
select set_config('test.journey',public.create_journey_from_route_guide(
  current_setting('test.guide')::uuid,current_setting('test.request')::uuid,date '2026-06-20','guide'),true);
select pg_temp.check((select name='测试线路' and planned_date='2026-06-20' and date='2026-06-20'
  and total_days=2 and days='2 天' and track_id is not null from public.journeys where id=current_setting('test.journey')),'journey fields and track');
select pg_temp.check((select count(*)=1 from public.companions where journey_id=current_setting('test.journey') and is_host and is_self),'owner companion');
select pg_temp.check((select array_agg(name order by sort_order)=array['Day 1','Day 2'] from public.timeline_groups where journey_id=current_setting('test.journey')),'day groups');
select pg_temp.check((select array_agg(title order by sort_order)=array['集合','营地','登顶'] from public.timeline_rows where journey_id=current_setting('test.journey')),'guide items mapped');
select pg_temp.check((select count(*)=0 from public.journey_packing_items i join public.journey_packing_lists l on l.id=i.list_id where l.journey_id=current_setting('test.journey')),'no gear at creation');
select pg_temp.check((select template_id=current_setting('test.guide') and request_id=current_setting('test.request')::uuid from public.journey_guide_imports where journey_id=current_setting('test.journey')),'community receipt');
select pg_temp.check((select count(*)=1 from public.journey_versions where journey_id=current_setting('test.journey') and change_kind='create'),'one create version');
select pg_temp.check(public.create_journey_from_route_guide(current_setting('test.hidden')::uuid,current_setting('test.request')::uuid,null,'chat')=current_setting('test.journey'),'creation replay');
select pg_temp.reject(format('select public.create_journey_from_route_guide(%L,%L)',current_setting('test.hidden'),gen_random_uuid()),'route_guide_not_published');
select pg_temp.check(public.journey_import_route_guide_gear(current_setting('test.journey'),current_setting('test.gear_request')::uuid)=1,'gear count');
select pg_temp.check((select name='帐篷' and category_name='露营' and note='双人' and quantity=2 and source_type='recommendedTemplate'
  from public.journey_packing_items i join public.journey_packing_lists l on l.id=i.list_id where l.journey_id=current_setting('test.journey')),'gear mapping');
select pg_temp.check(public.journey_import_route_guide_gear(current_setting('test.journey'),current_setting('test.gear_request')::uuid)=1,'gear replay returns original count');
select pg_temp.check((select count(*)=1 from public.journey_packing_items i join public.journey_packing_lists l on l.id=i.list_id where l.journey_id=current_setting('test.journey')),'gear replay has no duplicate');
select set_config('test.empty',public.create_journey_from_route_guide(current_setting('test.guide')::uuid,gen_random_uuid(),null,null),true);
select pg_temp.check((select planned_date is null from public.journeys where id=current_setting('test.empty')),'undecided date');
update public.route_guides set status='approved' where id=current_setting('test.hidden')::uuid;
select set_config('test.no_gear',public.create_journey_from_route_guide(current_setting('test.hidden')::uuid,gen_random_uuid(),null,null),true);
select pg_temp.reject(format('select public.journey_import_route_guide_gear(%L,%L)',current_setting('test.no_gear'),gen_random_uuid()),'no_guide_gear');
select set_config('request.jwt.claim.sub',current_setting('test.other'),true);
select pg_temp.reject(format('select public.journey_import_route_guide_gear(%L,%L)',current_setting('test.journey'),gen_random_uuid()),'Owned active journey required');
reset role;
select pg_temp.check((select count(*)=1 from public.journeys where id=current_setting('test.journey')) and
  (select count(*)=1 from public.journey_guide_imports where request_id=current_setting('test.request')::uuid),'creation has no duplicate writes');
rollback;
