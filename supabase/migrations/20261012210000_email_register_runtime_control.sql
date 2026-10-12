begin;

-- 邮箱注册开关由运营控制；与 phone_login 同一套 runtime controls。
-- 自托管 GoTrue 的确认邮件 SMTP 尚未接好，新邮箱账号会卡在未确认状态，
-- 所以默认冻结注册入口；邮箱密码登录不受此开关影响。
alter table public.feature_controls drop constraint if exists feature_controls_key_check;
alter table public.feature_controls add constraint feature_controls_key_check check (key in (
  'registration', 'guest_account', 'smart_planning', 'purchase', 'route_condition_moderation', 'phone_login', 'email_register'
));
insert into public.feature_controls(key, state, reason)
values ('email_register', 'disabled', 'Email sign-up stays frozen until SMTP is configured')
on conflict (key) do nothing;

create or replace function public.configure_runtime_control(p_key text, p_state text, p_data jsonb, p_reason text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid();
begin
  if actor is null or coalesce(public.admin_role(),'') not in ('owner','admin') then raise exception using errcode='42501', message='Admin required'; end if;
  if p_reason is null or length(trim(p_reason)) not between 3 and 500 then raise exception 'Reason required'; end if;
  if p_key not in ('registration', 'guest_account', 'smart_planning', 'purchase', 'route_condition_moderation', 'phone_login', 'email_register') then raise exception 'Unknown feature'; end if;
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

-- 登录页在任何会话存在之前渲染， anon 需要读到这两个开关；其余 key 仍不对外可见。
create or replace function public.public_runtime_flags()
returns jsonb language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_object_agg(key, state), '{}'::jsonb)
  from public.feature_controls
  where key in ('phone_login', 'email_register');
$$;

notify pgrst, 'reload schema';
commit;
