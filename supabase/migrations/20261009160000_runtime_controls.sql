begin;

-- Runtime controls are deliberately separate from membership policy versions.
-- A policy describes entitlements; these controls describe whether an operation
-- is currently available and may be changed without rewriting user grants.
create table public.feature_controls (
  key text primary key check (key in (
    'registration', 'guest_account', 'smart_planning', 'purchase'
  )),
  state text not null check (state in ('enabled', 'limited', 'disabled')),
  reason text not null default 'initial',
  updated_by uuid references public.profiles(id),
  updated_at timestamptz not null default now()
);
alter table public.feature_controls enable row level security;
revoke all on public.feature_controls from public, anon, authenticated;
grant select on public.feature_controls to authenticated;
create policy feature_controls_read on public.feature_controls
  for select to authenticated using (true);
insert into public.feature_controls(key, state) values
  ('registration', 'enabled'),
  ('guest_account', 'enabled'),
  ('smart_planning', 'enabled'),
  ('purchase', 'disabled');

create table public.registration_policy (
  id boolean primary key default true check (id),
  daily_global_limit integer not null check (daily_global_limit between 1 and 10000000),
  updated_by uuid references public.profiles(id),
  updated_at timestamptz not null default now()
);
alter table public.registration_policy enable row level security;
revoke all on public.registration_policy from public, anon, authenticated;
grant select on public.registration_policy to authenticated;
insert into public.registration_policy(id, daily_global_limit) values (true, 1000);

create table public.registration_usage (
  day date primary key,
  attempts bigint not null default 0 check (attempts >= 0),
  accepted bigint not null default 0 check (accepted >= 0),
  updated_at timestamptz not null default now()
);
alter table public.registration_usage enable row level security;
revoke all on public.registration_usage from public, anon, authenticated;
grant all on public.registration_usage to service_role;

create function public.feature_control_state(p_key text)
returns text language sql stable security definer set search_path='' as $$
  select state from public.feature_controls where key=p_key;
$$;
revoke all on function public.feature_control_state(text) from public, anon;
grant execute on function public.feature_control_state(text) to authenticated, service_role;

create function public.registration_admit()
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_state text;
  v_limit integer;
  v_attempts bigint;
  v_day date := (now() at time zone 'UTC')::date;
begin
  select state into v_state from public.feature_controls where key='registration';
  if coalesce(v_state, 'disabled')='disabled' then
    raise exception using errcode='P0001', message='registration_disabled';
  end if;
  select daily_global_limit into strict v_limit from public.registration_policy where id;
  insert into public.registration_usage(day, attempts)
    values(v_day, 1)
    on conflict(day) do update set attempts=public.registration_usage.attempts+1, updated_at=now()
    returning attempts into v_attempts;
  if v_attempts > v_limit then
    raise exception using errcode='P0001', message='registration_limit_reached';
  end if;
  update public.registration_usage set accepted=accepted+1, updated_at=now() where day=v_day;
  return jsonb_build_object('day',v_day,'attempts',v_attempts,'limit',v_limit);
end $$;
revoke all on function public.registration_admit() from public, anon, authenticated;
grant execute on function public.registration_admit() to service_role;

create function public.runtime_controls_snapshot()
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

create function public.configure_runtime_control(p_key text, p_state text, p_data jsonb, p_reason text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid();
begin
  if actor is null or coalesce(public.admin_role(),'') not in ('owner','admin') then
    raise exception using errcode='42501', message='Admin required';
  end if;
  if p_reason is null or length(trim(p_reason)) not between 3 and 500 then
    raise exception 'Reason required';
  end if;
  if p_key not in ('registration','guest_account','smart_planning','purchase') then
    raise exception 'Unknown feature';
  end if;
  if p_state not in ('enabled','limited','disabled') then raise exception 'Invalid feature state'; end if;
  update public.feature_controls set state=p_state, reason=p_reason, updated_by=actor, updated_at=now() where key=p_key;
  if not found then raise exception 'Unknown feature'; end if;
  if p_key='registration' and p_data ? 'dailyGlobalLimit' then
    update public.registration_policy set daily_global_limit=(p_data->>'dailyGlobalLimit')::integer, updated_by=actor, updated_at=now() where id;
  end if;
  insert into public.admin_audit_logs(actor_id,action,resource_type,metadata)
    values(actor,'runtime.'||p_key,'runtime_control',jsonb_build_object('state',p_state,'reason',p_reason,'data',p_data));
  return public.runtime_controls_snapshot();
end $$;
revoke all on function public.runtime_controls_snapshot() from public, anon;
revoke all on function public.configure_runtime_control(text,text,jsonb,text) from public, anon;
grant execute on function public.runtime_controls_snapshot(), public.configure_runtime_control(text,text,jsonb,text) to authenticated;

notify pgrst, 'reload schema';
commit;
