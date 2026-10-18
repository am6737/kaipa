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
  set_config('test.route','day-test-'||gen_random_uuid()::text,true),
  set_config('test.journey','day-'||gen_random_uuid()::text,true);
insert into auth.users(id,email,role,aud,is_anonymous) values
  (current_setting('test.owner')::uuid,'day-owner@test','authenticated','authenticated',false),
  (current_setting('test.other')::uuid,'day-other@test','authenticated','authenticated',false);
insert into public.profiles(id,display_name) values
  (current_setting('test.owner')::uuid,'创建者'),(current_setting('test.other')::uuid,'同伴')
  on conflict(id) do update set display_name=excluded.display_name;
insert into public.routes(id,name,region,lng,lat,tone) values(current_setting('test.route'),'测试线路','四川',99.9,29.9,'forest');
insert into public.journeys(id,user_id,route_id,name,region,lng,lat,tone,planned_date,date,total_days,days)
values(current_setting('test.journey'),current_setting('test.owner')::uuid,current_setting('test.route'),'测试旅程','四川',99.9,29.9,'forest','2026-06-19','2026-06-19',4,'4');
insert into public.companions(journey_id,user_id,ini,name,color,is_host,is_self,sort_order) values
  (current_setting('test.journey'),current_setting('test.owner')::uuid,'主','创建者','#FF5C3A',true,true,0),
  (current_setting('test.journey'),current_setting('test.other')::uuid,'伴','同伴','#FF5C3A',false,false,1);
insert into public.timeline_groups(journey_id,user_id,name,note,sort_order,route_end_meters) values
  (current_setting('test.journey'),current_setting('test.owner')::uuid,'Day 1','进山',0,10),
  (current_setting('test.journey'),current_setting('test.owner')::uuid,'Day 2','徒步一',1,20),
  (current_setting('test.journey'),current_setting('test.owner')::uuid,'Day 3','徒步二',2,30),
  (current_setting('test.journey'),current_setting('test.owner')::uuid,'Day 4','出山',3,40),
  (current_setting('test.journey'),current_setting('test.owner')::uuid,'补给','补给说明',4,null);
insert into public.timeline_rows(id,journey_id,user_id,title,day,item_kind,is_synth,is_custom,checked,sort_order) values
  ('day-row-1',current_setting('test.journey'),current_setting('test.owner')::uuid,'进山','Day 1','activity',false,true,false,0),
  ('day-row-2',current_setting('test.journey'),current_setting('test.owner')::uuid,'徒步一','Day 2','activity',false,true,false,1),
  ('day-row-3',current_setting('test.journey'),current_setting('test.owner')::uuid,'徒步二','Day 3','activity',false,true,false,2),
  ('day-row-peer',current_setting('test.journey'),current_setting('test.other')::uuid,'同伴条目','Day 3','activity',false,true,false,3),
  ('day-row-4',current_setting('test.journey'),current_setting('test.owner')::uuid,'出山','Day 4','activity',false,true,false,4),
  ('day-row-custom',current_setting('test.journey'),current_setting('test.owner')::uuid,'补给','补给','activity',false,true,false,5);
select set_config('request.jwt.claims',json_build_object('sub',current_setting('test.owner'),'role','authenticated')::text,true);
select set_config('request.jwt.claim.sub',current_setting('test.owner'),true);
set local role authenticated;
select public.journey_remove_timeline_day(current_setting('test.journey'),'Day 1');
select pg_temp.check((select planned_date='2026-06-20' and date='2026-06-20' and total_days=3 and days='3 天' from public.journeys where id=current_setting('test.journey')),'first day adjusts dates');
select pg_temp.check((select note='徒步一' and route_end_meters=20 from public.timeline_groups where journey_id=current_setting('test.journey') and name='Day 1' and not deleted),'day 2 metadata follows day 1');
select pg_temp.check((select day='Day 2' from public.timeline_rows where id='day-row-peer'),'companion row moved');
select pg_temp.check((select count(*)=0 from public.timeline_rows where id='day-row-1'),'deleted rows gone');
select pg_temp.check((select deleted from public.timeline_groups where journey_id=current_setting('test.journey') and name='Day 4'),'vacated day tombstone');
select set_config('request.jwt.claim.sub',current_setting('test.other'),true);
select pg_temp.reject(format('select public.journey_remove_timeline_day(%L,%L)',current_setting('test.journey'),'Day 2'),'Owned active journey required');
select set_config('request.jwt.claim.sub',current_setting('test.owner'),true);
select public.journey_remove_timeline_day(current_setting('test.journey'),'Day 2');
select pg_temp.check((select planned_date='2026-06-20' and total_days=2 from public.journeys where id=current_setting('test.journey')),'middle day leaves first date');
select pg_temp.check((select day='Day 2' from public.timeline_rows where id='day-row-4') and
  (select note='出山' and route_end_meters=40 from public.timeline_groups where journey_id=current_setting('test.journey') and name='Day 2' and not deleted),'last day rows and metadata moved');
select public.journey_remove_timeline_day(current_setting('test.journey'),'Day 2');
select pg_temp.check((select total_days=1 and planned_date='2026-06-20' from public.journeys where id=current_setting('test.journey')),'last day deletion clamps count');
select public.journey_remove_timeline_day(current_setting('test.journey'),'Day 1');
select pg_temp.check((select total_days=1 and planned_date='2026-06-21' from public.journeys where id=current_setting('test.journey')),'only day deletion clamps count');
select public.journey_remove_timeline_day(current_setting('test.journey'),'补给');
select pg_temp.check((select total_days=1 from public.journeys where id=current_setting('test.journey')) and
  (select deleted from public.timeline_groups where journey_id=current_setting('test.journey') and name='补给') and
  (select count(*)=0 from public.timeline_rows where id='day-row-custom'),'custom group leaves count unchanged');
select pg_temp.check((select count(*)=1 from public.journey_versions where journey_id=current_setting('test.journey')),'same transaction coalesces versions');
rollback;
