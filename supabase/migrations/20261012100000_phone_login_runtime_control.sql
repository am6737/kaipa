begin;

-- 手机号登录开关由运营控制；登录页在任何会话存在之前就渲染，
-- 所以它的状态必须能在 anon 角色下读取，但不能因此放开整张 feature_controls。
alter table public.feature_controls drop constraint if exists feature_controls_key_check;
alter table public.feature_controls add constraint feature_controls_key_check check (key in (
  'registration', 'guest_account', 'smart_planning', 'purchase', 'route_condition_moderation', 'phone_login'
));
insert into public.feature_controls(key, state, reason)
values ('phone_login', 'disabled', 'Phone sign-in stays frozen until operations reopens it')
on conflict (key) do nothing;

create or replace function public.configure_runtime_control(p_key text, p_state text, p_data jsonb, p_reason text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid();
begin
  if actor is null or coalesce(public.admin_role(),'') not in ('owner','admin') then raise exception using errcode='42501', message='Admin required'; end if;
  if p_reason is null or length(trim(p_reason)) not between 3 and 500 then raise exception 'Reason required'; end if;
  if p_key not in ('registration', 'guest_account', 'smart_planning', 'purchase', 'route_condition_moderation', 'phone_login') then raise exception 'Unknown feature'; end if;
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

-- 只回登录前屏幕需要的 key，其余开关状态对匿名调用方不可见。
create or replace function public.public_runtime_flags()
returns jsonb language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_object_agg(key, state), '{}'::jsonb)
  from public.feature_controls
  where key in ('phone_login');
$$;
revoke all on function public.public_runtime_flags() from public, anon, authenticated;
grant execute on function public.public_runtime_flags() to anon, authenticated, service_role;

notify pgrst, 'reload schema';
commit;
