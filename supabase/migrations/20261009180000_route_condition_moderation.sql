begin;

alter table public.feature_controls drop constraint if exists feature_controls_key_check;
alter table public.feature_controls add constraint feature_controls_key_check check (key in ('registration', 'guest_account', 'smart_planning', 'purchase', 'route_condition_moderation'));
insert into public.feature_controls(key, state, reason)
values ('route_condition_moderation', 'enabled', 'User route observations require review by default')
on conflict (key) do nothing;

create or replace function public.configure_runtime_control(p_key text, p_state text, p_data jsonb, p_reason text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid();
begin
  if actor is null or coalesce(public.admin_role(),'') not in ('owner','admin') then raise exception using errcode='42501', message='Admin required'; end if;
  if p_reason is null or length(trim(p_reason)) not between 3 and 500 then raise exception 'Reason required'; end if;
  if p_key not in ('registration', 'guest_account', 'smart_planning', 'purchase', 'route_condition_moderation') then raise exception 'Unknown feature'; end if;
  if p_state not in ('enabled', 'limited', 'disabled') then raise exception 'Invalid feature state'; end if;
  update public.feature_controls set state=p_state, reason=p_reason, updated_by=actor, updated_at=now() where key=p_key;
  if not found then raise exception 'Unknown feature'; end if;
  if p_key='registration' and p_data ? 'dailyGlobalLimit' then
    update public.registration_policy set daily_global_limit=(p_data->>'dailyGlobalLimit')::integer, updated_by=actor, updated_at=now() where id;
  end if;
  insert into public.admin_audit_logs(actor_id, action, resource_type, metadata)
    values(actor, 'runtime.'||p_key, 'runtime_control', jsonb_build_object('state', p_state, 'reason', p_reason, 'data', p_data));
  return public.runtime_controls_snapshot();
end $$;

notify pgrst, 'reload schema';
commit;
