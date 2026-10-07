-- Import a client-side reference itinerary and packing scaffold into an empty
-- owned journey. One transaction prevents a half-import and a durable receipt
-- prevents duplicate rows when a response is lost and the request is retried.
begin;
create table if not exists public.journey_guide_imports (
  journey_id text primary key references public.journeys(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  template_id text not null,
  payload_hash text not null,
  created_at timestamptz not null default now()
);
alter table public.journey_guide_imports enable row level security;
drop policy if exists journey_guide_imports_owner on public.journey_guide_imports;
create policy journey_guide_imports_owner on public.journey_guide_imports for select to authenticated
  using (user_id = auth.uid() and exists (select 1 from public.journeys j where j.id = journey_id and j.user_id = auth.uid()));
drop policy if exists journey_guide_imports_insert on public.journey_guide_imports;
create policy journey_guide_imports_insert on public.journey_guide_imports for insert to authenticated
  with check (user_id = auth.uid() and exists (select 1 from public.journeys j where j.id = journey_id and j.user_id = auth.uid() and j.deleted_at is null));
grant select, insert on public.journey_guide_imports to authenticated;
revoke all on public.journey_guide_imports from anon;

create or replace function public.journey_import_route_guide(p_journey_id text, p_template jsonb)
returns void language plpgsql security invoker set search_path = public as $$
declare
  target public.journeys%rowtype;
  receipt public.journey_guide_imports%rowtype;
  person_id integer;
  packing_list_id uuid;
  daily jsonb;
  entry jsonb;
  equipment jsonb;
  day_number integer := 0;
  row_order integer := 0;
  gear_order integer := 0;
  old_suppression text;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  select * into target from public.journeys
   where id = p_journey_id and user_id = auth.uid() and deleted_at is null for update;
  if not found then raise exception 'Owned active journey required' using errcode = '42501'; end if;

  if jsonb_typeof(p_template) is distinct from 'object'
     or coalesce(length(btrim(p_template->>'id')),0) not between 1 and 100
     or jsonb_typeof(p_template->'days') is distinct from 'array'
     or jsonb_typeof(p_template->'gear') is distinct from 'array' then
    raise exception 'Invalid reference template' using errcode = '22023';
  end if;
  select * into receipt from public.journey_guide_imports where journey_id = p_journey_id;
  if found then
    if receipt.template_id = p_template->>'id' and receipt.payload_hash = md5(p_template::text) then return; end if;
    raise exception 'This journey already imported a different template' using errcode = '22023';
  end if;
  if target.route_id is null or target.route_id is distinct from p_template->>'routeId'
     or jsonb_array_length(p_template->'days') not between 1 and 14
     or target.total_days is distinct from jsonb_array_length(p_template->'days')
     or jsonb_array_length(p_template->'gear') not between 1 and 100 then
    raise exception 'Template route or duration mismatch' using errcode = '22023';
  end if;
  if exists(select 1 from public.timeline_rows where journey_id = p_journey_id)
     or exists(select 1 from public.journey_packing_items i join public.journey_packing_lists l on l.id=i.list_id where l.journey_id=p_journey_id) then
    raise exception 'Only an empty journey can import a template' using errcode = '22023';
  end if;
  select id into person_id from public.companions
   where journey_id=p_journey_id and user_id=auth.uid() order by sort_order,id limit 1;
  if person_id is null then raise exception 'An owner participant is required' using errcode = '22023'; end if;
  old_suppression := coalesce(current_setting('app.journey_version_suppressed', true), 'false');
  perform set_config('app.journey_version_suppressed', 'true', true);

  for daily in select value from jsonb_array_elements(p_template->'days') loop
    day_number := day_number+1;
    if jsonb_typeof(daily->'items') is distinct from 'array' then
      raise exception 'Invalid day items' using errcode='22023';
    end if;
    if jsonb_array_length(daily->'items') not between 1 and 20 then
      raise exception 'Invalid day item count' using errcode='22023';
    end if;
    insert into public.timeline_groups(journey_id,user_id,name,deleted,sort_order)
      values(p_journey_id,auth.uid(),'Day '||day_number,false,day_number-1)
      on conflict(journey_id,name) do update set deleted=false;
    for entry in select value from jsonb_array_elements(daily->'items') loop
      if jsonb_typeof(entry) is distinct from 'string' or length(btrim(entry #>> '{}')) not between 1 and 500 then
        raise exception 'Invalid itinerary item' using errcode='22023';
      end if;
      insert into public.timeline_rows(id,journey_id,user_id,title,day,item_kind,is_synth,is_custom,checked,sort_order)
        values('guide_'||gen_random_uuid()::text,p_journey_id,auth.uid(),entry #>> '{}','Day '||day_number,'activity',false,true,false,row_order);
      row_order := row_order+1;
    end loop;
  end loop;
  select id into packing_list_id from public.journey_packing_lists
    where journey_id=p_journey_id and kind='personal' and owner_companion_id=person_id;
  if packing_list_id is null then
    insert into public.journey_packing_lists(journey_id,kind,owner_companion_id,created_by)
      values(p_journey_id,'personal',person_id,auth.uid()) returning id into packing_list_id;
  end if;
  for equipment in select value from jsonb_array_elements(p_template->'gear') loop
    if jsonb_typeof(equipment) is distinct from 'object'
       or coalesce(length(btrim(equipment->>'name')),0) not between 1 and 200
       or coalesce(length(equipment->>'categoryName'),0)>100
       or coalesce(length(equipment->>'note'),0)>2000
       or coalesce((equipment->>'quantity')::integer,1) not between 1 and 100 then
      raise exception 'Invalid packing item' using errcode='22023';
    end if;
    insert into public.journey_packing_items(list_id,source_type,name,category_name,quantity,note,packed,sort_order)
      values(packing_list_id,'recommendedTemplate',equipment->>'name',equipment->>'categoryName',coalesce((equipment->>'quantity')::integer,1),equipment->>'note',false,gear_order);
    gear_order := gear_order+1;
  end loop;
  insert into public.journey_guide_imports(journey_id,user_id,template_id,payload_hash)
    values(p_journey_id,auth.uid(),p_template->>'id',md5(p_template::text));
  perform set_config('app.journey_version_suppressed',old_suppression,true);
  perform public.save_journey_version(p_journey_id,array['timeline','packing'],'update');
end;
$$;
revoke execute on function public.journey_import_route_guide(text,jsonb) from public,anon;
grant execute on function public.journey_import_route_guide(text,jsonb) to authenticated;
commit;
