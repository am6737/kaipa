begin;

create or replace function pg_temp.check(ok boolean, message text) returns void language plpgsql as $$
begin
  if not coalesce(ok, false) then raise exception 'check failed: %', message; end if;
end $$;

create or replace function pg_temp.reject(statement text, expected text) returns void language plpgsql as $$
begin
  execute statement;
  raise exception 'check failed: expected rejection for %', expected;
exception when others then
  if sqlerrm like 'check failed:%' then raise; end if;
  if position(expected in sqlerrm) = 0 then
    raise exception 'check failed: expected %, got %', expected, sqlerrm;
  end if;
end $$;

create temporary table itinerary_test_data(route_id text, payload jsonb, id uuid);
insert into itinerary_test_data(route_id, payload, id)
select r.id, $json${
  "name":"4 天 3 晚扎营穿越（下则通村至则巴村）",
  "direction":"下则通村至则巴村",
  "lodging":"camp",
  "difficulty":"中高",
  "audience":"有多日扎营经验",
  "summary":"从理塘进村，翻越垭口到日照金山营地，经新冷古寺到夯达营地，最后步行出山。",
  "notes":["理塘回成都的拼车需提前预订","费用不含餐食和驮包"],
  "bestMonths":null,
  "seasonNote":null,
  "days":[
    {"kind":"access_in","title":"理塘 → 下则通村","distanceKm":null,"ascentM":null,"descentM":null,"duration":null,"transfers":[{"from":"理塘","to":"下则通村","mode":"shared","duration":null,"costRef":"60 元/人","booking":null,"position":"start"}],"stay":{"name":"下则通村","type":"homestay","altitudeM":null,"water":null,"costRef":"70 元/人","signal":null},"supply":null,"tip":null,"bailout":null,"source":"official"},
    {"kind":"hike","title":"下则通村 → 日照金山营地","distanceKm":13,"ascentM":1200,"descentM":null,"duration":null,"transfers":[],"stay":{"name":"日照金山营地","type":"camp","altitudeM":4360,"water":null,"costRef":"25 元/人","signal":null},"supply":"可乐、矿泉水、泡面","tip":"垭口较陡，建议 08:00 前出发","bailout":null,"source":"official"},
    {"kind":"hike","title":"日照金山营地 → 新冷古寺 → 夯达营地","distanceKm":17,"ascentM":null,"descentM":null,"duration":null,"transfers":[],"stay":{"name":"夯达营地","type":"camp","altitudeM":3900,"water":"有自然水源","costRef":"25 元/人","signal":"有"},"supply":"新冷古寺附近可吃饭","tip":null,"bailout":null,"source":"official"},
    {"kind":"hike","title":"夯达营地 → 则巴村","distanceKm":2,"ascentM":null,"descentM":null,"duration":null,"transfers":[{"from":"则巴村","to":"理塘","mode":"shared","duration":"约 3 小时","costRef":"100 元/人","booking":null,"position":"end"}],"stay":null,"supply":null,"tip":null,"bailout":null,"source":"official"}
  ]
}$json$::jsonb, gen_random_uuid()
from public.routes r order by r.id limit 1;
select pg_temp.check((select count(*) = 1 from itinerary_test_data), 'existing route required');
select pg_temp.check((select cardinality(public.route_itinerary_payload_errors(payload)) = 0 from itinerary_test_data), 'valid 格聂 payload');

insert into public.route_itineraries(id, version, route_id, origin, payload)
select id, 1, route_id, 'manual', payload from itinerary_test_data;

select pg_temp.check((select 'days[2].kind access_in must be at start' = any(public.route_itinerary_payload_errors(jsonb_set(payload, '{days,2,kind}', '"access_in"'))) from itinerary_test_data), 'middle access day');
select pg_temp.check((select 'days[1].stay required' = any(public.route_itinerary_payload_errors(jsonb_set(payload, '{days,1,stay}', 'null'))) from itinerary_test_data), 'missing stay');
select pg_temp.check((select 'payload.days[1].stay.name contains ·' = any(public.route_itinerary_payload_errors(jsonb_set(payload, '{days,1,stay,name}', '"日照·金山"'))) from itinerary_test_data), 'nested separator');
select pg_temp.check((select 'days[1].tip required for rest day' = any(public.route_itinerary_payload_errors(jsonb_set(jsonb_set(payload, '{days,1,kind}', '"rest"'), '{days,1,tip}', 'null'))) from itinerary_test_data), 'rest without tip');
select pg_temp.check((select 'days[0].transfers[0].mode invalid' = any(public.route_itinerary_payload_errors(jsonb_set(payload, '{days,0,transfers,0,mode}', '"taxi"'))) from itinerary_test_data), 'bad transfer enum');
select pg_temp.check((select 'notes exceeds 5 items' = any(public.route_itinerary_payload_errors(jsonb_set(payload, '{notes}', '["一","二","三","四","五","六"]'))) from itinerary_test_data), 'too many notes');
select pg_temp.check((select 'payload.days[1].stay.water contains an empty string' = any(public.route_itinerary_payload_errors(jsonb_set(payload, '{days,1,stay,water}', '""'))) from itinerary_test_data), 'empty nested string');
select pg_temp.check((select 'bestMonths[0] must be an integer 1-12' = any(public.route_itinerary_payload_errors(jsonb_set(payload, '{bestMonths}', '[13]'))) from itinerary_test_data), 'bad month');
select pg_temp.check((select 'days[0].distanceKm forbidden on access day' = any(public.route_itinerary_payload_errors(jsonb_set(payload, '{days,0,distanceKm}', '2'))) from itinerary_test_data), 'access distance');
select pg_temp.check((select 'days[0].transfers required' = any(public.route_itinerary_payload_errors(jsonb_set(payload, '{days,0,transfers}', '[]'))) from itinerary_test_data), 'access transfer');
select pg_temp.check((select 'days requires a non-access day' = any(public.route_itinerary_payload_errors(jsonb_set(payload, '{days}', '[{"kind":"access_in","title":"进山","transfers":[{"mode":"bus","position":"start"}]}]'))) from itinerary_test_data), 'non-access day');
select pg_temp.check((select 'days[1].ascentM must be an integer' = any(public.route_itinerary_payload_errors(jsonb_set(payload, '{days,1,ascentM}', '1.5'))) from itinerary_test_data), 'integer ascent');

select pg_temp.reject(format('insert into public.route_itineraries(id,version,route_id,origin,payload) values (%L,2,%L,%L,%L::jsonb)', (select id from itinerary_test_data), (select route_id from itinerary_test_data), 'manual', (select jsonb_set(payload, '{name}', '""') from itinerary_test_data)), 'route_itineraries_payload_valid');
select pg_temp.reject(format('update public.route_itineraries set status = %L where id = %L', 'published', (select id from itinerary_test_data)), 'route_itineraries_published_verified');

update public.route_itineraries set status = 'published', is_default = true, verified_by = '审核人', verified_on = current_date
where id = (select id from itinerary_test_data) and version = 1;
select pg_temp.reject(format('insert into public.route_itineraries(id,version,route_id,status,origin,payload,verified_by,verified_on) values (%L,2,%L,%L,%L,%L::jsonb,%L,current_date)', (select id from itinerary_test_data), (select route_id from itinerary_test_data), 'published', 'manual', (select payload from itinerary_test_data), '审核人'), 'route_itineraries_one_published_version');
select pg_temp.reject(format('insert into public.route_itineraries(version,route_id,status,is_default,origin,payload,verified_by,verified_on) values (1,%L,%L,true,%L,%L::jsonb,%L,current_date)', (select route_id from itinerary_test_data), 'published', 'manual', (select payload from itinerary_test_data), '审核人'), 'route_itineraries_one_default_per_route');
select pg_temp.reject(format('update public.route_itineraries set payload = jsonb_set(payload, %L, %L::jsonb) where id = %L', '{name}', '"修改"', (select id from itinerary_test_data)), 'published itinerary can only be archived');
select pg_temp.reject(format('delete from public.route_itineraries where id = %L', (select id from itinerary_test_data)), 'published itinerary cannot be deleted');

insert into public.route_itineraries(version, route_id, status, origin, payload, verified_by, verified_on)
select 1, route_id, 'published', 'manual', payload, '审核人', current_date from itinerary_test_data;
insert into public.route_itineraries(version, route_id, origin, payload)
select 1, route_id, 'manual', payload from itinerary_test_data;
select pg_temp.check((select count(*) = 2 from public.route_itineraries_published((select route_id from itinerary_test_data))), 'RPC published only');
select pg_temp.check((select is_default from public.route_itineraries_published((select route_id from itinerary_test_data)) limit 1), 'RPC default first');
update public.route_itineraries set status = 'archived' where id = (select id from itinerary_test_data) and version = 1;
select pg_temp.check((select count(*) = 1 from public.route_itineraries_published((select route_id from itinerary_test_data))), 'RPC excludes archived');

rollback;
