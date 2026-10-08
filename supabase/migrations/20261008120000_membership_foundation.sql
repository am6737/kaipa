-- Membership is private. Open access is a campaign, never a purchase grant.
begin;

create table public.resource_policies (
  version text primary key,
  features jsonb not null check (jsonb_typeof(features) = 'object'),
  published_at timestamptz,
  created_at timestamptz not null default now()
);
create table public.resource_policy_limits (
  policy_version text references public.resource_policies(version),
  resource text not null,
  period text not null check (period in ('lifetime', 'month')),
  commercial_limit bigint not null check (commercial_limit >= 0),
  hard_limit bigint not null check (hard_limit >= commercial_limit),
  mode text not null check (mode in ('shadow', 'enforce')),
  primary key (policy_version, resource)
);
create table public.membership_runtime (
  id boolean primary key default true check (id),
  stage text not null check (stage in ('open_access', 'trial_operation', 'paid')),
  free_policy text not null references public.resource_policies(version),
  member_policy text not null references public.resource_policies(version),
  purchase_enabled boolean not null default false,
  updated_at timestamptz not null default now()
);
create table public.membership_grants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  source text not null check (source in ('gift', 'purchase')),
  source_key text not null unique,
  policy_version text not null references public.resource_policies(version),
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  is_lifetime boolean not null default false,
  revoked_at timestamptz,
  reason text not null check (length(reason) between 1 and 500),
  created_at timestamptz not null default now(),
  check ((is_lifetime and ends_at is null) or (not is_lifetime and ends_at is not null and ends_at > starts_at))
);
create index membership_grants_user_idx on public.membership_grants(user_id);
create table public.operation_campaigns (
  id text primary key,
  state text not null check (state in ('draft', 'scheduled', 'active', 'ended', 'cancelled')),
  policy_version text not null references public.resource_policies(version),
  starts_at timestamptz not null,
  ends_at timestamptz,
  -- Foundation supports all users. Targeted audiences require a later migration.
  audience text not null default 'all' check (audience = 'all'),
  transition_days integer not null default 30 check (transition_days between 0 and 365),
  notice_days integer not null default 14 check (notice_days between 1 and 365),
  check (ends_at is null or ends_at > starts_at)
);
create table public.resource_usage (
  user_id uuid references public.profiles(id) on delete cascade,
  resource text not null,
  period_key text not null,
  used bigint not null default 0 check (used >= 0),
  reserved bigint not null default 0 check (reserved >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, resource, period_key)
);
create table public.resource_reservations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  resource text not null,
  period_key text not null,
  request_key text not null check (length(request_key) between 1 and 200),
  amount bigint not null check (amount > 0),
  settled_amount bigint check (settled_amount >= 0 and settled_amount <= amount),
  state text not null default 'reserved' check (state in ('reserved', 'settled', 'released')),
  policy_versions jsonb not null,
  shadow_exceeded boolean not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (user_id, resource, request_key),
  foreign key (user_id, resource, period_key) references public.resource_usage(user_id, resource, period_key) on delete cascade
);
create table public.resource_usage_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  resource text not null,
  period_key text not null,
  reservation_id uuid references public.resource_reservations(id) on delete cascade,
  action text not null check (action in ('reserve', 'settle', 'release', 'stock')),
  delta bigint not null,
  policy_versions jsonb not null,
  shadow_exceeded boolean not null default false,
  created_at timestamptz not null default now()
);

-- No client may assign itself membership, change policy, or forge usage.
do $$ declare t text; begin
  foreach t in array array['resource_policies', 'resource_policy_limits', 'membership_runtime',
    'membership_grants', 'operation_campaigns', 'resource_usage', 'resource_reservations', 'resource_usage_events'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from public, anon, authenticated', t);
    execute format('grant all on public.%I to service_role', t);
  end loop;
end $$;
grant usage, select on sequence public.resource_usage_events_id_seq to service_role;
grant select on public.membership_grants, public.resource_usage to authenticated;
create policy membership_grants_own on public.membership_grants for select to authenticated using (user_id = auth.uid());
create policy resource_usage_own on public.resource_usage for select to authenticated using (user_id = auth.uid());

insert into public.resource_policies(version, features) values
  ('free-v1', '{"basicPlanning":true,"deepPlanning":false}'),
  ('member-v1', '{"basicPlanning":true,"deepPlanning":true}'),
  ('open-v1', '{"basicPlanning":true,"deepPlanning":true}');
insert into public.resource_policy_limits
select p.version, r.resource, r.period,
  case when p.version = 'free-v1' then r.free_limit else r.member_limit end,
  r.hard_limit,
  case when p.version = 'open-v1' then 'shadow' else 'enforce' end
from public.resource_policies p cross join (values
  ('storage_bytes', 'lifetime', 524288000::bigint, 2147483648::bigint, 2147483648::bigint),
  ('gear_items', 'lifetime', 300, 3000, 30000),
  ('gear_sets', 'lifetime', 500, 5000, 10000),
  ('journeys', 'lifetime', 1000, 10000, 20000),
  ('tracks', 'lifetime', 2000, 20000, 40000),
  ('ai_requests', 'month', 60, 600, 1000),
  ('ai_plans', 'month', 5, 50, 100),
  ('gear_recognition', 'month', 30, 300, 500),
  ('gear_cutouts', 'month', 30, 300, 500)
) as r(resource, period, free_limit, member_limit, hard_limit);
insert into public.membership_runtime(id, stage, free_policy, member_policy)
values (true, 'open_access', 'free-v1', 'member-v1');
insert into public.operation_campaigns(id, state, policy_version, starts_at)
values ('initial-open-access', 'active', 'open-v1', now());
update public.resource_policies set published_at=now();

-- Once referenced by runtime, a campaign or a purchased promise, a policy
-- cannot be edited in place. Publish a new version and switch references.
create function public.protect_membership_policy()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v text;
begin
  if tg_table_name = 'resource_policies' then
    if tg_op = 'INSERT' then v := new.version; else v := old.version; end if;
  else
    if tg_op = 'INSERT' then v := new.policy_version; else v := old.policy_version; end if;
  end if;
  if exists(select 1 from public.resource_policies where version=v and published_at is not null) then
    raise exception using errcode='22023', message='Published policy is immutable';
  end if;
  if tg_table_name='resource_policy_limits' and tg_op='UPDATE' then
    if exists(select 1 from public.resource_policies where version=new.policy_version and published_at is not null) then
      raise exception using errcode='22023', message='Published policy is immutable';
    end if;
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end $$;
create trigger protect_policy before insert or update or delete on public.resource_policies
  for each row execute function public.protect_membership_policy();
create trigger protect_policy_limits before insert or update or delete on public.resource_policy_limits
  for each row execute function public.protect_membership_policy();

create function public.publish_referenced_membership_policy()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_table_name='membership_runtime' then
    update public.resource_policies set published_at=now() where version in (new.free_policy,new.member_policy) and published_at is null;
  else
    update public.resource_policies set published_at=now() where version=new.policy_version and published_at is null;
  end if;
  return new;
end $$;
create trigger publish_runtime_policy after insert or update on public.membership_runtime
  for each row execute function public.publish_referenced_membership_policy();
create trigger publish_grant_policy after insert or update on public.membership_grants
  for each row execute function public.publish_referenced_membership_policy();
create trigger publish_campaign_policy after insert or update on public.operation_campaigns
  for each row execute function public.publish_referenced_membership_policy();

-- All policies relevant to this user. Campaign benefits cannot replace an
-- existing purchase promise. Expiry uses the clock, not a background cron job.
create function public.membership_policy_versions(p_user uuid)
returns text[] language sql stable security definer set search_path = '' as $$
  select array_agg(distinct version) from (
    select case when exists (
      select 1 from public.membership_grants g where g.user_id = p_user
      and g.revoked_at is null and g.starts_at <= now() and (g.is_lifetime or g.ends_at > now())
    ) then rt.member_policy else rt.free_policy end as version from public.membership_runtime rt
    union all
    select g.policy_version from public.membership_grants g where g.user_id = p_user
      and g.revoked_at is null and g.starts_at <= now() and (g.is_lifetime or g.ends_at > now())
    union all
    select c.policy_version from public.operation_campaigns c
      join public.membership_runtime rt on rt.stage in ('open_access', 'trial_operation')
      where c.state in ('scheduled', 'active') and c.starts_at <= now() and (c.ends_at is null or c.ends_at > now())
  ) policies;
$$;

create function public.membership_resource_limit(p_user uuid, p_resource text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('resource', p_resource, 'period', min(l.period),
    'limit', max(l.commercial_limit),
    -- Most generous commercial benefit; safety remains bounded independently.
    'enforcedLimit', greatest(max(case when l.mode = 'enforce' then l.commercial_limit else l.hard_limit end), 0),
    'policyVersions', to_jsonb(public.membership_policy_versions(p_user)))
  from public.resource_policy_limits l
  where l.policy_version = any(public.membership_policy_versions(p_user)) and l.resource = p_resource
  having count(*) > 0;
$$;

create function public.get_membership_status()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_user uuid := auth.uid(); v_member boolean; v_lifetime boolean; v_until timestamptz;
  v_campaign jsonb; v_features jsonb; v_resources jsonb; v_rt public.membership_runtime%rowtype;
begin
  if v_user is null then raise exception using errcode = '42501', message = 'Authentication required'; end if;
  select * into strict v_rt from public.membership_runtime where id;
  select count(*) > 0, coalesce(bool_or(is_lifetime), false), max(ends_at)
    into v_member, v_lifetime, v_until from public.membership_grants
    where user_id = v_user and revoked_at is null and starts_at <= now() and (is_lifetime or ends_at > now());
  select jsonb_build_object('id', c.id, 'endsAt', c.ends_at) into v_campaign
    from public.operation_campaigns c where v_rt.stage in ('open_access', 'trial_operation')
    and c.state in ('scheduled', 'active') and c.starts_at <= now() and (c.ends_at is null or c.ends_at > now())
    order by c.starts_at desc, c.id limit 1;
  select coalesce(jsonb_object_agg(key, enabled), '{}'::jsonb) into v_features from (
    select kv.key, bool_or(kv.value = 'true'::jsonb) enabled
    from public.resource_policies p cross join lateral jsonb_each(p.features) kv
    where p.version = any(public.membership_policy_versions(v_user)) group by kv.key
  ) f;
  select coalesce(jsonb_agg(public.membership_resource_limit(v_user, r.resource) || jsonb_build_object(
    'used', coalesce(u.used, 0), 'reserved', coalesce(u.reserved, 0),
    'tracking', case when r.resource in ('gear_items','gear_sets','journeys','tracks') then 'live' else 'not_connected' end,
    'periodKey', case when r.period = 'month' then to_char(now() at time zone 'UTC', 'YYYY-MM') else 'lifetime' end,
    'resetAt', case when r.period = 'month' then (date_trunc('month', now() at time zone 'UTC') + interval '1 month') at time zone 'UTC' else null end
  ) order by r.resource), '[]'::jsonb) into v_resources from (
    select resource, min(period) period from public.resource_policy_limits
    where policy_version = any(public.membership_policy_versions(v_user)) group by resource
  ) r left join public.resource_usage u on u.user_id = v_user and u.resource = r.resource
    and u.period_key = case when r.period = 'month' then to_char(now() at time zone 'UTC', 'YYYY-MM') else 'lifetime' end;
  return jsonb_build_object('membershipPlan', case when v_member then 'member' else 'free' end,
    'isLifetime', v_lifetime, 'validUntil', case when v_lifetime then null else v_until end,
    'accessSource', case when v_member then 'membership' when v_campaign is not null then 'campaign' else 'free' end,
    'campaign', v_campaign, 'stage', v_rt.stage, 'purchaseEnabled', v_rt.purchase_enabled,
    'features', v_features, 'resources', v_resources, 'serverTime', now());
end $$;

-- Only trusted backend can reserve costs; clients cannot choose their own
-- resource, amount, period or quota subject. Row locks serialize all devices.
create function public.reserve_resource(p_user uuid, p_resource text, p_request_key text, p_amount bigint,
  p_ttl_seconds integer default 600)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare lim jsonb; k text; u public.resource_usage%rowtype; r public.resource_reservations%rowtype; exceeded boolean;
begin
  if p_user is null or p_amount is null or p_amount <= 0 or p_ttl_seconds is null or p_ttl_seconds not between 1 and 3600
    or p_request_key is null or length(p_request_key) not between 1 and 200 then
    raise exception using errcode = '22023', message = 'Invalid reservation';
  end if;
  if p_resource is null or p_resource not in ('storage_bytes','ai_requests','ai_plans','gear_recognition','gear_cutouts') then
    raise exception using errcode = '22023', message = 'Unsupported reservation resource';
  end if;
  lim := public.membership_resource_limit(p_user, p_resource);
  if lim is null then raise exception 'Resource policy unavailable'; end if;
  k := case when lim->>'period' = 'month' then to_char(now() at time zone 'UTC', 'YYYY-MM') else 'lifetime' end;
  -- Serialize idempotency across monthly boundaries as well as within a row.
  perform pg_advisory_xact_lock(hashtextextended(p_user::text || ':' || p_resource || ':' || p_request_key, 0));
  select * into r from public.resource_reservations where user_id = p_user and resource = p_resource and request_key = p_request_key;
  if found then
    if r.amount <> p_amount then raise exception using errcode = '22023', message = 'Reservation payload mismatch'; end if;
    if r.state='reserved' and r.expires_at <= now() then
      raise exception using errcode='22023', message='Reservation expired; reconciliation required';
    end if;
    return to_jsonb(r);
  end if;
  insert into public.resource_usage(user_id, resource, period_key) values(p_user, p_resource, k) on conflict do nothing;
  select * into strict u from public.resource_usage where user_id = p_user and resource = p_resource and period_key = k for update;
  if p_amount > (lim->>'enforcedLimit')::bigint - u.used - u.reserved then
    raise exception using errcode = 'P0001', message = 'quota_exceeded', detail = lim::text;
  end if;
  exceeded := p_amount > (lim->>'limit')::bigint - u.used - u.reserved;
  insert into public.resource_reservations(user_id,resource,period_key,request_key,amount,policy_versions,shadow_exceeded,expires_at)
  values(p_user,p_resource,k,p_request_key,p_amount,lim->'policyVersions',exceeded,now()+make_interval(secs=>p_ttl_seconds)) returning * into r;
  update public.resource_usage set reserved = reserved + p_amount, updated_at = now()
    where user_id = p_user and resource = p_resource and period_key = k;
  insert into public.resource_usage_events(user_id,resource,period_key,reservation_id,action,delta,policy_versions,shadow_exceeded)
    values(p_user,p_resource,k,r.id,'reserve',p_amount,r.policy_versions,exceeded);
  return to_jsonb(r);
end $$;

create function public.finish_resource_reservation(p_id uuid, p_actual bigint, p_release boolean default false)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare r public.resource_reservations%rowtype; target text;
begin
  if p_actual is null or p_actual < 0 or p_release is null or (p_release and p_actual <> 0) then
    raise exception using errcode = '22023', message = 'Invalid settlement'; end if;
  select * into strict r from public.resource_reservations where id = p_id for update;
  target := case when p_release then 'released' else 'settled' end;
  if r.state <> 'reserved' then
    if r.state <> target or r.settled_amount <> p_actual then
      raise exception using errcode = '22023', message = 'Settlement payload mismatch';
    end if;
    return to_jsonb(r);
  end if;
  if p_actual > r.amount then raise exception using errcode = '22023', message = 'Actual usage exceeds reservation'; end if;
  -- Expiry does NOT release occupied storage. Trusted reconciliation must
  -- confirm absence/deletion before release. Late actual usage still settles.
  update public.resource_usage set reserved = reserved - r.amount, used = used + p_actual, updated_at = now()
    where user_id = r.user_id and resource = r.resource and period_key = r.period_key;
  update public.resource_reservations set state = target, settled_amount = p_actual where id = p_id returning * into r;
  insert into public.resource_usage_events(user_id,resource,period_key,reservation_id,action,delta,policy_versions)
    values(r.user_id,r.resource,r.period_key,r.id,case when p_release then 'release' else 'settle' end,p_actual,r.policy_versions);
  return to_jsonb(r);
end $$;

-- Track direct CRUD for four stock resources, including service-role/AI writes.
create function public.track_membership_stock()
returns trigger language plpgsql security definer set search_path = '' as $$
declare subject uuid; d bigint; lim jsonb; u public.resource_usage%rowtype; exceeded boolean := false;
begin
  if tg_op = 'UPDATE' then
    if new.user_id <> old.user_id then raise exception 'Resource ownership transfer requires a dedicated operation'; end if;
    return new;
  end if;
  if tg_op = 'DELETE' then subject := old.user_id; d := -1; else subject := new.user_id; d := 1; end if;
  -- Parent account deletion may already have cascaded away its usage row.
  if not exists(select 1 from public.profiles where id = subject) then
    if tg_op = 'DELETE' then return old; end if;
    raise exception 'Unknown resource owner';
  end if;
  insert into public.resource_usage(user_id,resource,period_key) values(subject,tg_table_name,'lifetime') on conflict do nothing;
  select * into strict u from public.resource_usage where user_id=subject and resource=tg_table_name and period_key='lifetime' for update;
  lim := public.membership_resource_limit(subject, tg_table_name);
  if lim is null then raise exception 'Resource policy unavailable'; end if;
  if d > 0 and d > (lim->>'enforcedLimit')::bigint-u.used-u.reserved then
    raise exception using errcode='P0001', message='quota_exceeded', detail=lim::text;
  end if;
  exceeded := d > 0 and u.used+d > (lim->>'limit')::bigint;
  update public.resource_usage set used=greatest(0,used+d), updated_at=now()
    where user_id=subject and resource=tg_table_name and period_key='lifetime';
  insert into public.resource_usage_events(user_id,resource,period_key,action,delta,policy_versions,shadow_exceeded)
    values(subject,tg_table_name,'lifetime','stock',d,lim->'policyVersions',exceeded);
  if tg_op='DELETE' then return old; end if;
  return new;
end $$;

-- One short migration transaction: prevent gaps between backfill and triggers.
lock table public.gear_items, public.gear_sets, public.journeys, public.tracks in share row exclusive mode;
insert into public.resource_usage(user_id, resource, period_key, used)
select user_id,'gear_items','lifetime',count(*) from public.gear_items group by user_id union all
select user_id,'gear_sets','lifetime',count(*) from public.gear_sets group by user_id union all
select user_id,'journeys','lifetime',count(*) from public.journeys group by user_id union all
select user_id,'tracks','lifetime',count(*) from public.tracks group by user_id;
do $$ declare t text; begin
  foreach t in array array['gear_items','gear_sets','journeys','tracks'] loop
    execute format('create trigger membership_stock after insert or delete or update of user_id on public.%I for each row execute function public.track_membership_stock()',t);
  end loop;
end $$;

revoke all on function public.membership_policy_versions(uuid) from public, anon, authenticated;
revoke all on function public.membership_resource_limit(uuid,text) from public, anon, authenticated;
revoke all on function public.track_membership_stock() from public, anon, authenticated;
revoke all on function public.protect_membership_policy() from public, anon, authenticated;
revoke all on function public.publish_referenced_membership_policy() from public, anon, authenticated;
revoke all on function public.get_membership_status() from public, anon, authenticated;
revoke all on function public.reserve_resource(uuid,text,text,bigint,integer) from public, anon, authenticated;
revoke all on function public.finish_resource_reservation(uuid,bigint,boolean) from public, anon, authenticated;
grant execute on function public.get_membership_status() to authenticated;
grant execute on function public.reserve_resource(uuid,text,text,bigint,integer), public.finish_resource_reservation(uuid,bigint,boolean) to service_role;

notify pgrst, 'reload schema';
commit;
