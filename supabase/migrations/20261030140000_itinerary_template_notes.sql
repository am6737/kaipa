begin;

-- The original body stays as _legacy; the new function calls it, then rewrites the day notes.
do $$ begin
  if to_regprocedure('public.create_journey_from_itinerary_legacy(uuid,int,date,boolean,uuid,text)') is null then
    alter function public.create_journey_from_itinerary(uuid,int,date,boolean,uuid,text)
      rename to create_journey_from_itinerary_legacy;
  end if;
end $$;
revoke all on function public.create_journey_from_itinerary_legacy(uuid,int,date,boolean,uuid,text) from public, anon, authenticated;

create or replace function public.itinerary_note_months(months jsonb) returns text
language plpgsql immutable set search_path=public as $$
declare m int; last_m int; start_m int; out_text text := ''; first_run boolean := true;
begin
  for m in select distinct value::int from jsonb_array_elements_text(coalesce($1,'[]'::jsonb)) where value::int between 1 and 12 order by value::int loop
    if start_m is null then start_m:=m;
    elsif m<>last_m+1 then out_text:=out_text||case when first_run then '' else '、' end||case when start_m=last_m then start_m||' 月' else start_m||'～'||last_m||' 月' end; first_run:=false; start_m:=m;
    end if;
    last_m:=m;
  end loop;
  if start_m is not null then out_text:=out_text||case when first_run then '' else '、' end||case when start_m=last_m then start_m||' 月' else start_m||'～'||last_m||' 月' end; end if;
  return out_text;
end $$;

create or replace function public.itinerary_note_render(payload jsonb, route_name text, include_access boolean)
returns jsonb language plpgsql immutable set search_path = public as $$
declare
  days jsonb := payload->'days'; d jsonb; i int; n int := 0; out jsonb := '{}'::jsonb;
  kept jsonb := days; note text; section text; sections text[]; lines text[]; transfer jsonb; stay jsonb;
  total_k numeric := 0; total_a numeric := 0; all_metrics boolean := true; overview text; stats text; mode text;
  low numeric := 0; high numeric := 0; priced boolean := true; refs text; costs numeric[]; cost_text text;
begin
  if not include_access then
    while jsonb_array_length(kept)>0 and kept->0->>'kind'='access_in' loop kept:=kept-0; end loop;
    while jsonb_array_length(kept)>0 and kept->(jsonb_array_length(kept)-1)->>'kind'='access_out' loop kept:=kept-(jsonb_array_length(kept)-1); end loop;
  end if;
  for i in 0..jsonb_array_length(kept)-1 loop
    d:=kept->i;
    if d->>'kind'='hike' then
      if d ? 'distanceKm' then total_k:=total_k+(d->>'distanceKm')::numeric; else all_metrics:=false; end if;
      if d ? 'ascentM' then total_a:=total_a+(d->>'ascentM')::numeric; else all_metrics:=false; end if;
    end if;
  end loop;
  overview:=route_name||' | '||coalesce(payload->>'name','');
  if all_metrics and total_k>0 then overview:=overview||E'\n全程约 '||round(total_k,1)||' km，累计爬升约 '||round(total_a)||' m'; end if;
  if payload->>'difficulty' is not null then overview:=overview||'，强度'||(payload->>'difficulty'); end if;
  if jsonb_typeof(payload->'bestMonths')='array' and jsonb_array_length(payload->'bestMonths')>0 then overview:=overview||'，最佳 '||public.itinerary_note_months(payload->'bestMonths'); end if;
  if payload->>'audience' is not null then overview:=overview||E'\n适合'||regexp_replace(payload->>'audience','^适合',''); end if;
  for refs in select transfer_value->>'costRef' from jsonb_array_elements(kept) day cross join lateral jsonb_array_elements(coalesce(day->'transfers','[]'::jsonb)) as transfers(transfer_value) union all select day->'stay'->>'costRef' from jsonb_array_elements(kept) day where jsonb_typeof(day->'stay')='object' loop
    if nullif(refs,'') is null then continue; end if;
    costs:=case when refs ~ '(\d+(\.\d+)?)\s*[～~至-]\s*(\d+(\.\d+)?)\s*元\s*/\s*人' then array[(regexp_match(refs,'(\d+(\.\d+)?)\s*[～~至-]\s*(\d+(\.\d+)?)\s*元\s*/\s*人'))[1]::numeric,(regexp_match(refs,'(\d+(\.\d+)?)\s*[～~至-]\s*(\d+(\.\d+)?)\s*元\s*/\s*人'))[3]::numeric] when refs ~ '(\d+(\.\d+)?)\s*元\s*/\s*人' then array[(regexp_match(refs,'(\d+(\.\d+)?)\s*元\s*/\s*人'))[1]::numeric,(regexp_match(refs,'(\d+(\.\d+)?)\s*元\s*/\s*人'))[1]::numeric] when btrim(refs) like '免费%' then array[0::numeric,0::numeric] end;
    if costs is null then priced:=false; else low:=low+costs[1]; high:=high+costs[2]; end if;
  end loop;
  if priced and low+high>0 then cost_text:='费用参考：接驳和住宿合计约 '||case when low=high then low::text else low||'～'||high end||' 元/人，不含餐食、门票和往返车票。'; end if;
  for i in 0..jsonb_array_length(kept)-1 loop
    d:=kept->i; n:=i+1; sections:=array[]::text[];
    if i=0 then sections:=array_append(sections,overview); end if;
    if d->>'kind'='hike' then stats:='徒步约 '||(d->>'distanceKm')||' km'||case when d ? 'ascentM' then '，爬升约 '||(d->>'ascentM')||' m' else '' end||case when d ? 'descentM' then '，下降约 '||(d->>'descentM')||' m' else '' end||case when d ? 'duration' then '，用时'||(d->>'duration') else '' end; elsif d->>'kind'='rest' then stats:='休整日'; else stats:=''; end if;
    if stats<>'' then sections:=array_append(sections,stats); end if;
    if nullif(d->>'tip','') is not null then sections:=array_append(sections,d->>'tip'); end if;
    lines:=array[]::text[];
    if i=0 and jsonb_typeof(payload->'access')='object' then lines:=array_append(lines,(payload->'access'->>'arriveBy')||' 前到'||(payload->'access'->>'meetingPoint')||'集合'); end if;
    for transfer in select value from jsonb_array_elements(d->'transfers') loop
      mode:=case transfer->>'mode' when 'charter' then '包车' when 'shared' then '拼车' when 'bus' then '班车' when 'shuttle' then '景区观光车' else '' end;
      lines:=array_append(lines,trim(mode||' '||(transfer->>'from')||' → '||(transfer->>'to')||case when transfer->>'costRef' is not null or transfer->>'duration' is not null or transfer->>'booking' is not null then '：'||concat_ws('，',case when mode<>'' and left(transfer->>'costRef',length(mode))=mode then substr(transfer->>'costRef',length(mode)+1) else nullif(transfer->>'costRef','') end,nullif(transfer->>'duration',''),nullif(transfer->>'booking','')) else '' end));
    end loop;
    if array_length(lines,1)>0 then sections:=array_append(sections,'交通：'||E'\n'||array_to_string(array(select '- '||x from unnest(lines) x),E'\n')); end if;
    stay:=d->'stay'; if jsonb_typeof(stay)='object' then sections:=array_append(sections,'住宿：'||E'\n- '||coalesce(stay->>'name','')||case when stay->>'type' is not null or stay->>'altitudeM' is not null then '（'||case stay->>'type' when 'camp' then '营地' when 'homestay' then '民宿' when 'inn' then '客栈' when 'hotel' then '酒店' else '' end||case when stay->>'altitudeM' is not null then case when stay->>'type' is not null then '，' else '' end||'海拔 '||(stay->>'altitudeM')||' m' else '' end||'）' else '' end||case when coalesce(stay->>'costRef',stay->>'water',stay->>'signal') is not null then '：'||concat_ws('，',nullif(stay->>'costRef',''),nullif(stay->>'water',''),case when stay->>'signal' is not null then '手机信号'||(stay->>'signal') end) else '' end); end if;
    if nullif(d->>'supply','') is not null then sections:=array_append(sections,'补给：'||(d->>'supply')); end if;
    if nullif(d->>'bailout','') is not null then sections:=array_append(sections,'下撤：'||(d->>'bailout')); end if;
    if i=jsonb_array_length(kept)-1 and jsonb_array_length(coalesce(payload->'notes','[]'::jsonb))>0 then sections:=array_append(sections,'注意事项：'||E'\n'||(select string_agg('- '||(value #>> '{}'),E'\n') from jsonb_array_elements(payload->'notes'))); end if;
    if i=jsonb_array_length(kept)-1 and cost_text is not null then sections:=array_append(sections,cost_text); end if;
    note:=''; foreach section in array sections loop if section<>'' and (note='' or length(note||E'\n\n'||section)<=1000) then note:=case when note='' then section else note||E'\n\n'||section end; end if; end loop;
    out:=out||jsonb_build_object('Day '||n,note);
  end loop; return out;
end $$;
revoke all on function public.itinerary_note_render(jsonb,text,boolean) from public;

create or replace function public.create_journey_from_itinerary(p_itinerary_id uuid,p_version int,p_trek_start_date date,p_include_access boolean,p_request_id uuid,p_entry text default null)
returns text language plpgsql security definer set search_path=public as $$
declare jid text; plan public.route_itineraries%rowtype; rname text; rendered jsonb; dn text; replay boolean;
begin
  -- A retried request returns the journey it already made; its notes may have been edited since.
  replay:=exists(select 1 from public.journey_guide_imports imports where imports.request_id=p_request_id);
  jid:=public.create_journey_from_itinerary_legacy(p_itinerary_id,p_version,p_trek_start_date,p_include_access,p_request_id,p_entry);
  if replay then return jid; end if;
  select * into plan from public.route_itineraries where id=p_itinerary_id and version=p_version;
  select name into rname from public.routes where id=plan.route_id;
  rendered:=public.itinerary_note_render(plan.payload,rname,p_include_access);
  for dn in select key from jsonb_each_text(rendered) loop update public.timeline_groups set note=rendered->>dn where timeline_groups.journey_id=jid and name=dn; end loop;
  return jid;
end $$;
revoke all on function public.create_journey_from_itinerary(uuid,int,date,boolean,uuid,text) from public, anon;
grant execute on function public.create_journey_from_itinerary(uuid,int,date,boolean,uuid,text) to authenticated;
notify pgrst, 'reload schema';
commit;
