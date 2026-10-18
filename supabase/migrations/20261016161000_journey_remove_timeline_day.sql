begin;

create or replace function public.journey_remove_timeline_day(p_journey_id text, p_day text)
returns void language plpgsql security definer set search_path = public
as $$
declare
  v_journey public.journeys%rowtype;
  v_number integer;
  v_next integer;
  v_last integer;
  v_old_suppression text;
  v_new_date text;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if p_day is null or btrim(p_day) = '' then
    raise exception 'A day group name is required' using errcode = '22023';
  end if;
  select * into v_journey from public.journeys
    where id=p_journey_id and user_id=auth.uid() and deleted_at is null for update;
  if not found then raise exception 'Owned active journey required' using errcode = '42501'; end if;
  v_old_suppression := coalesce(current_setting('app.journey_version_suppressed',true),'false');
  perform set_config('app.journey_version_suppressed','true',true);

  if p_day ~ '^Day [1-9][0-9]*$' then
    v_number := substring(p_day from 5)::integer;
    -- A day can exist through its rows alone, without a group row.
    if not exists(select 1 from public.timeline_groups
      where journey_id=p_journey_id and name=p_day and not deleted)
      and not exists(select 1 from public.timeline_rows where journey_id=p_journey_id and day=p_day) then
      raise exception 'Timeline group is no longer available' using errcode='22023';
    end if;
    -- Days added past total_days still have to move up.
    select greatest(coalesce(v_journey.total_days,1),v_number,
      coalesce((select max(substring(name from 5)::integer) from public.timeline_groups
        where journey_id=p_journey_id and not deleted and name ~ '^Day [1-9][0-9]*$'),0),
      coalesce((select max(substring(day from 5)::integer) from public.timeline_rows
        where journey_id=p_journey_id and day ~ '^Day [1-9][0-9]*$'),0))
      into v_last;
    delete from public.timeline_rows where journey_id=p_journey_id and day=p_day;
    update public.timeline_groups set deleted=true,note=null,updated_at=now()
      where journey_id=p_journey_id and name=p_day;
    for v_next in v_number+1..v_last loop
      update public.timeline_rows set day='Day '||(v_next-1)
        where journey_id=p_journey_id and day='Day '||v_next;
      -- The destination is either the removed day or the previous source's tombstone.
      delete from public.timeline_groups
        where journey_id=p_journey_id and name='Day '||(v_next-1) and deleted;
      update public.timeline_groups set name='Day '||(v_next-1),sort_order=v_next-2,updated_at=now()
        where journey_id=p_journey_id and name='Day '||v_next and not deleted;
    end loop;
    -- Keep the deleted marker on the vacated final name, including a one-day journey.
    insert into public.timeline_groups(journey_id,user_id,name,deleted,sort_order,updated_at)
      values(p_journey_id,auth.uid(),'Day '||v_last,true,v_last-1,now())
      on conflict(journey_id,name) do update set deleted=true,note=null,updated_at=now();
    v_new_date := v_journey.planned_date;
    if v_number=1 and v_new_date ~ '^\d{4}-\d{2}-\d{2}$' then
      v_new_date := (v_new_date::date+1)::text;
    end if;
    update public.journeys set total_days=greatest(1,coalesce(total_days,1)-1),
      days=greatest(1,coalesce(total_days,1)-1)||' 天',
      planned_date=v_new_date,
      countdown=case when v_number=1 and v_new_date ~ '^\d{4}-\d{2}-\d{2}$'
        then greatest(0,v_new_date::date-current_date) else countdown end,
      date=case when date is not null and v_number=1 and date ~ '^\d{4}-\d{2}-\d{2}$'
        then (date::date+1)::text else date end,
      updated_at=now()
      where id=p_journey_id;
  else
    delete from public.timeline_rows where journey_id=p_journey_id and day=p_day;
    insert into public.timeline_groups(journey_id,user_id,name,deleted,updated_at)
      values(p_journey_id,auth.uid(),p_day,true,now())
      on conflict(journey_id,name) do update set deleted=true,updated_at=now();
  end if;
  perform set_config('app.journey_version_suppressed','false',true);
  perform public.save_journey_version(p_journey_id,array['journey','timeline'],'update');
  perform set_config('app.journey_version_suppressed',v_old_suppression,true);
end;
$$;
revoke all on function public.journey_remove_timeline_day(text,text) from public, anon;
grant execute on function public.journey_remove_timeline_day(text,text) to authenticated;

notify pgrst, 'reload schema';
commit;
