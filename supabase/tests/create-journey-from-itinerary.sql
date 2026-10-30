begin;
create function pg_temp.check(ok boolean, message text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'check failed: %', message; end if; end $$;
create function pg_temp.reject(statement text, expected text) returns void language plpgsql as $$
begin
  execute statement;
  raise exception 'check failed: expected %', expected;
exception when others then
  if sqlerrm like 'check failed:%' then raise; end if;
  if position(expected in sqlerrm) = 0 then raise exception 'check failed: expected %, got %', expected, sqlerrm; end if;
end $$;

select set_config('test.owner',gen_random_uuid()::text,true),
  set_config('test.other',gen_random_uuid()::text,true),
  set_config('test.route','itinerary-test-'||gen_random_uuid()::text,true),
  set_config('test.plan',gen_random_uuid()::text,true),
  set_config('test.single',gen_random_uuid()::text,true),
  set_config('test.archived',gen_random_uuid()::text,true),
  set_config('test.draft',gen_random_uuid()::text,true);
insert into auth.users(id,email,role,aud,is_anonymous) values
  (current_setting('test.owner')::uuid,'itinerary-owner@test','authenticated','authenticated',false),
  (current_setting('test.other')::uuid,'itinerary-other@test','authenticated','authenticated',false);
insert into public.profiles(id,display_name,nick,avatar_ini) values
  (current_setting('test.owner')::uuid,'方案测试','方案测试','方'),
  (current_setting('test.other')::uuid,'其他用户','其他用户','其')
  on conflict(id) do nothing;
insert into public.routes(id,name,region,lng,lat,tone,track_coords,track_elevation,track_file_name,dist,asc_)
values(current_setting('test.route'),'格聂牧场线','四川',99.9,29.9,'forest',
  '[[99.9,29.9],[100.0,30.0]]'::jsonb,'[4000,4100]'::jsonb,'格聂牧场线.kml','32 km','1200 m');

create temporary table itinerary_fixture(payload jsonb);
grant select on itinerary_fixture to authenticated;
insert into itinerary_fixture values ($json${
  "name":"4 天 3 晚扎营穿越（下则通村至则巴村）","direction":"下则通村至则巴村",
  "lodging":"camp","difficulty":"中高","audience":"有多日扎营经验",
  "summary":"从理塘进村，翻越垭口到日照金山营地，经新冷古寺和格聂一棵树下到夯达营地，次日步行出山到则巴村。",
  "notes":["费用不含餐食、驮包和摩托车接驳"],"bestMonths":[4,5,6,9,10,11],"seasonNote":null,
  "days":[
    {"kind":"access_in","title":"理塘 → 下则通村","transfers":[{"from":"理塘","to":"下则通村","mode":"shared","position":"start","costRef":"60 元/人"}],"stay":{"name":"下则通村","type":"homestay"},"tip":null,"source":"official"},
    {"kind":"hike","title":"下则通村 → 日照金山营地","distanceKm":13,"ascentM":1200,"transfers":[],"stay":{"name":"日照金山营地","type":"camp"},"tip":"垭口较陡，建议 08:00 前出发","source":"official"},
    {"kind":"hike","title":"日照金山营地 → 新冷古寺 → 格聂一棵树 → 夯达营地","distanceKm":17,"transfers":[],"stay":{"name":"夯达营地","type":"camp"},"source":"official"},
    {"kind":"hike","title":"夯达营地 → 则巴村","distanceKm":2,"transfers":[{"from":"则巴村","to":"理塘","mode":"shared","duration":"约 3 小时","costRef":"100 元/人","position":"end"}],"stay":null,"source":"official"}
  ]
}$json$::jsonb);
select pg_temp.check((select cardinality(public.route_itinerary_payload_errors(payload))=0 from itinerary_fixture),'fixture payload valid');
insert into public.route_itineraries(id,version,route_id,status,origin,payload,verified_by,verified_on)
select current_setting('test.plan')::uuid,1,current_setting('test.route'),'published','manual',payload,'审核人',date '2026-06-01' from itinerary_fixture;
insert into public.route_itineraries(id,version,route_id,status,origin,payload,verified_by,verified_on)
select current_setting('test.single')::uuid,1,current_setting('test.route'),'published','manual',
  jsonb_set(jsonb_set(payload,'{name}','"1 天徒步"'::jsonb),'{days}',jsonb_build_array(payload->'days'->3)),
  '审核人',date '2026-06-01' from itinerary_fixture;
insert into public.route_itineraries(id,version,route_id,status,origin,payload,verified_by,verified_on)
select current_setting('test.archived')::uuid,1,current_setting('test.route'),'archived','manual',payload,'审核人',date '2026-06-01' from itinerary_fixture;
insert into public.route_itineraries(id,version,route_id,status,origin,payload)
select current_setting('test.draft')::uuid,1,current_setting('test.route'),'draft','manual',payload from itinerary_fixture;

select set_config('request.jwt.claims',json_build_object('sub',current_setting('test.owner'),'role','authenticated')::text,true);
select set_config('request.jwt.claim.sub',current_setting('test.owner'),true);
set local role authenticated;
select pg_temp.reject('select * from public.route_itineraries limit 1','permission denied');
select pg_temp.check((select count(*)=0 from public.itinerary_events),'authenticated cannot select events');
select set_config('test.request1',gen_random_uuid()::text,true);
select set_config('test.journey1',public.create_journey_from_itinerary(current_setting('test.plan')::uuid,1,date '2026-06-20',true,current_setting('test.request1')::uuid,'guide'),true);
select pg_temp.check((select planned_date='2026-06-19' and total_days=4 and user_id=auth.uid() and deleted_at is null and route_id=current_setting('test.route') and track_id is not null from public.journeys where id=current_setting('test.journey1')),'scenario 1 journey');
select pg_temp.check((select count(*)=1 from public.companions where journey_id=current_setting('test.journey1') and user_id=auth.uid() and is_host and is_self),'owner companion');
select pg_temp.check((select count(*)=1 from public.tracks t join public.journeys j on j.track_id=t.id where j.id=current_setting('test.journey1') and t.user_id=auth.uid() and t.coords='[[99.9,29.9],[100.0,30.0]]'::jsonb),'catalog track copied');
select pg_temp.check((select array_agg(name order by sort_order)=array['Day 1','Day 2','Day 3','Day 4'] from public.timeline_groups where journey_id=current_setting('test.journey1')),'four numbered groups');
select pg_temp.check((select note like '格聂牧场线 | 4 天 3 晚扎营穿越%' and note like '%最佳 4～6 月、9～11 月%' and note like '%适合有多日扎营经验%' from public.timeline_groups where journey_id=current_setting('test.journey1') and name='Day 1'),'overview note exact');
select pg_temp.check((select note like '%徒步约 13 km%' and note like '%垭口较陡，建议 08:00 前出发%' and note like '%住宿：%' from public.timeline_groups where journey_id=current_setting('test.journey1') and name='Day 2'),'day data and stay note exact');
select pg_temp.check((select array_agg(title order by sort_order)=array['拼车 理塘 → 下则通村（参考 60 元/人）','下则通村'] from public.timeline_rows where journey_id=current_setting('test.journey1') and day='Day 1'),'access rows exact');
select pg_temp.check((select array_agg(title order by sort_order)=array['下则通村','日照金山营地'] from public.timeline_rows where journey_id=current_setting('test.journey1') and day='Day 2'),'hike rows exact');
select pg_temp.check((select array_agg(title order by sort_order)=array['日照金山营地','新冷古寺','格聂一棵树','夯达营地'] and array_agg(item_kind order by sort_order)=array['activity','activity','activity','stay'] from public.timeline_rows where journey_id=current_setting('test.journey1') and day='Day 3'),'multi-node rows exact');
select pg_temp.check((select array_agg(title order by sort_order)=array['夯达营地','则巴村','拼车 则巴村 → 理塘（约 3 小时）（参考 100 元/人）'] from public.timeline_rows where journey_id=current_setting('test.journey1') and day='Day 4'),'end transfer exact');
select pg_temp.check((select note like '%注意事项：%' and note like '%费用参考：接驳和住宿合计约 160 元/人，不含餐食、门票和往返车票。%' from public.timeline_groups where journey_id=current_setting('test.journey1') and name='Day 4'),'last day notes and cost total');
select pg_temp.check((select count(*)=0 from public.timeline_rows where journey_id=current_setting('test.journey1') and (time_mins is not null or time_end_mins is not null or item_kind not in ('activity','stay') or route_id is not null)),'no clocks or route bindings');
select pg_temp.check((select count(*)=1 from public.journey_versions where journey_id=current_setting('test.journey1') and change_kind='create'),'one create version');
select pg_temp.check((select count(*)=1 from public.journey_guide_imports where journey_id=current_setting('test.journey1') and template_id=current_setting('test.plan')||'@1' and payload_hash=(select md5(payload::text) from itinerary_fixture)),'receipt');

select set_config('test.journey2',public.create_journey_from_itinerary(current_setting('test.plan')::uuid,1,date '2026-06-20',false,gen_random_uuid(),'form'),true);
select pg_temp.check((select planned_date='2026-06-20' and total_days=3 from public.journeys where id=current_setting('test.journey2')),'scenario 2 dates');
select pg_temp.check((select array_agg(name order by sort_order)=array['Day 1','Day 2','Day 3'] from public.timeline_groups where journey_id=current_setting('test.journey2')),'scenario 2 groups');
select pg_temp.check((select count(*)=1 from public.timeline_rows where journey_id=current_setting('test.journey2') and day='Day 3' and title='拼车 则巴村 → 理塘（约 3 小时）（参考 100 元/人）'),'last hike transfer retained');
select set_config('test.single_journey',public.create_journey_from_itinerary(current_setting('test.single')::uuid,1,date '2026-06-20',true,gen_random_uuid(),null),true);
select pg_temp.check((select total_days=1 from public.journeys where id=current_setting('test.single_journey')) and (select count(*)=1 from public.timeline_groups where journey_id=current_setting('test.single_journey')),'single day');
select set_config('test.null_journey',public.create_journey_from_itinerary(current_setting('test.plan')::uuid,1,null,true,gen_random_uuid(),null),true);
select pg_temp.check((select planned_date is null from public.journeys where id=current_setting('test.null_journey')),'undecided date');

select pg_temp.check(public.create_journey_from_itinerary(current_setting('test.archived')::uuid,1,null,false,current_setting('test.request1')::uuid,'chat')=current_setting('test.journey1'),'idempotent replay');
reset role;
select pg_temp.check((select count(*)=1 from public.journeys where id=current_setting('test.journey1')) and
  (select count(*)=1 from public.journey_guide_imports where request_id=current_setting('test.request1')::uuid) and
  (select count(*)=1 from public.itinerary_events where journey_id=current_setting('test.journey1') and event='saved') and
  (select count(*)=1 from public.journey_versions where journey_id=current_setting('test.journey1')),'idempotency leaves one of each');
set local role authenticated;
select pg_temp.reject(format('select public.create_journey_from_itinerary(%L,1,null,true,%L)',current_setting('test.archived'),gen_random_uuid()),'itinerary_not_published');
select pg_temp.reject(format('select public.create_journey_from_itinerary(%L,1,null,true,%L)',current_setting('test.draft'),gen_random_uuid()),'itinerary_not_published');
insert into public.itinerary_events(event,itinerary_id,version,route_id,entry)
values('preview_opened',current_setting('test.plan')::uuid,1,current_setting('test.route'),'guide');
select pg_temp.reject(format('insert into public.itinerary_events(event,itinerary_id,version,route_id) values (%L,%L,1,%L)', 'saved',current_setting('test.plan'),current_setting('test.route')),'row-level security');
select pg_temp.reject(format('insert into public.itinerary_events(user_id,event,itinerary_id,version,route_id) values (%L,%L,%L,1,%L)',current_setting('test.other'),'preview_opened',current_setting('test.plan'),current_setting('test.route')),'row-level security');
select pg_temp.check((select count(*)=0 from public.itinerary_events),'events not selectable');
reset role;
select pg_temp.check((select count(*)=1 from public.itinerary_events where event='preview_opened' and user_id=current_setting('test.owner')::uuid),'own preview inserted');
select set_config('request.jwt.claims','{}',true);
select set_config('request.jwt.claim.sub','',true);
set local role anon;
select pg_temp.reject(format('select public.create_journey_from_itinerary(%L,1,null,true,%L)',current_setting('test.plan'),gen_random_uuid()),'permission denied');
rollback;
