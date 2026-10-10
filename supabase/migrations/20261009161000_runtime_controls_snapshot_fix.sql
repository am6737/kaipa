begin;

create or replace function public.runtime_controls_snapshot()
returns jsonb language plpgsql security definer set search_path='' as $$
begin
  if coalesce(public.admin_role(),'') not in ('owner','admin','viewer') then
    raise exception using errcode='42501', message='Admin required';
  end if;
  return jsonb_build_object(
    'features',(select coalesce(jsonb_agg(to_jsonb(f) order by f.key),'[]') from public.feature_controls f),
    'registrationPolicy',(select to_jsonb(p) from public.registration_policy p where id),
    'registrationToday',coalesce((select to_jsonb(u) from public.registration_usage u where day=(now() at time zone 'UTC')::date),'{}'::jsonb)
  );
end $$;

notify pgrst, 'reload schema';
commit;
