begin;

alter table public.membership_runtime add column metering_started_at timestamptz not null default now();

create table public.membership_products (
  id text primary key check(id in ('monthly','yearly','lifetime')),
  term_months integer,
  is_lifetime boolean not null,
  check((is_lifetime and term_months is null) or (not is_lifetime and term_months in (1,12)))
);
alter table public.membership_products enable row level security;
revoke all on public.membership_products from public,anon,authenticated;
grant all on public.membership_products to service_role;
insert into public.membership_products values('monthly',1,false),('yearly',12,false),('lifetime',null,true);
create table public.resource_transition_grants (
  user_id uuid references public.profiles(id) on delete cascade,
  campaign_id text references public.operation_campaigns(id),
  resource text not null,
  ceiling bigint not null check (ceiling >= 0),
  floor_limit bigint not null check (floor_limit >= 0),
  expires_at timestamptz not null,
  primary key(user_id,campaign_id,resource)
);
create table public.resource_rate_rules (
  scope text primary key,
  max_requests integer not null check(max_requests between 1 and 10000),
  window_seconds integer not null check(window_seconds between 1 and 86400)
);
create table public.resource_rate_windows (
  scope text not null,
  subject text not null,
  window_start timestamptz not null,
  requests bigint not null default 0,
  primary key(scope,subject,window_start)
);
create table public.service_budgets (
  service text primary key,
  enabled boolean not null default true,
  daily_units bigint not null check(daily_units > 0),
  per_run_units bigint not null check(per_run_units > 0)
);
create table public.service_budget_usage (
  service text references public.service_budgets(service),
  day date not null,
  used bigint not null default 0 check(used>=0),
  primary key(service,day)
);
create table public.service_budget_calls (
  id uuid primary key default gen_random_uuid(),
  service text references public.service_budgets(service),
  run_key text not null,
  day date not null,
  reserved_units bigint not null check(reserved_units>0),
  actual_units bigint,
  created_at timestamptz not null default now()
);
create index service_budget_calls_run on public.service_budget_calls(service,run_key);
do $$ declare t text; begin
  foreach t in array array['resource_transition_grants','resource_rate_rules','resource_rate_windows',
    'service_budgets','service_budget_usage','service_budget_calls'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from public, anon, authenticated',t);
    execute format('grant all on public.%I to service_role',t);
  end loop;
end $$;
insert into public.resource_rate_rules values
  ('ai',6,60),('uploads',60,60),('map',60,60),('gear',30,60),
  ('guest_session',10,600),('guest_write',60,60),('guest_upload',30,60),('account_create',10,600),('qr',3000,60),('qr_create',20,60);
-- Units are safety budgets, not a claim about provider currency prices.
-- AI units = conservative input estimate + maximum output, settled to usage.
insert into public.service_budgets(service,daily_units,per_run_units) values
  ('ai_tokens',20000000,400000),('gear_requests',10000,50),('map_requests',100000,1000),
  ('upload_bytes',21474836480,2147483648),('upload_requests',50000,5000);

create function public.membership_event_context(p_user uuid)
returns jsonb language sql stable security definer set search_path='' as $$
  with identity as (select exists(select 1 from public.membership_grants g where g.user_id=p_user and g.revoked_at is null and g.starts_at<=now() and (g.is_lifetime or g.ends_at>now())) as member),
  campaign as (select exists(select 1 from public.operation_campaigns c join public.membership_runtime rt on rt.stage in ('open_access','trial_operation') where c.state in ('scheduled','active') and c.starts_at<=now() and (c.ends_at is null or c.ends_at>now())) as active)
  select jsonb_build_object('membershipPlan',case when p_user is null then 'unknown' when member then 'member' else 'free' end,
    'accessSource',case when p_user is null then 'anonymous' when member then 'membership' when active then 'campaign' else 'free' end,
    'stage',(select stage from public.membership_runtime)) from identity cross join campaign;
$$;
revoke all on function public.membership_event_context(uuid) from public,anon,authenticated;
alter table public.resource_usage_events add column membership_plan text,add column access_source text,add column operation_stage text;
create function public.annotate_resource_usage_event()
returns trigger language plpgsql security definer set search_path='' as $$
declare context jsonb:=public.membership_event_context(new.user_id);
begin
  new.membership_plan:=context->>'membershipPlan';new.access_source:=context->>'accessSource';new.operation_stage:=context->>'stage';
  return new;
end $$;
revoke all on function public.annotate_resource_usage_event() from public,anon,authenticated;
create trigger annotate_resource_usage_event before insert on public.resource_usage_events for each row execute function public.annotate_resource_usage_event();

create table public.resource_admission_events (
  id bigint generated always as identity primary key,
  user_id uuid references public.profiles(id) on delete cascade,
  scope text not null,
  result text not null,
  stage text not null,
  membership_plan text not null,
  access_source text not null,
  policy_versions jsonb,
  created_at timestamptz not null default now()
);
create table public.resource_maintenance_state (
  id boolean primary key default true check(id),
  checked_at timestamptz,
  report jsonb not null default '{}'::jsonb
);
alter table public.resource_admission_events enable row level security;
alter table public.resource_maintenance_state enable row level security;
revoke all on public.resource_admission_events,public.resource_maintenance_state from public,anon,authenticated;
grant all on public.resource_admission_events,public.resource_maintenance_state to service_role;
grant usage,select on sequence public.resource_admission_events_id_seq to service_role;
insert into public.resource_maintenance_state(id) values(true);
create function public.record_resource_admission(p_user uuid,p_scope text,p_result text)
returns void language plpgsql security definer set search_path='' as $$
declare context jsonb:=public.membership_event_context(p_user);
begin
  if length(p_scope)>80 or p_result not in ('accepted','cancelled','rate_limited','quota_exceeded','service_budget_exceeded','concurrency_exceeded','file_too_large','payload_too_large','forbidden','invalid_request','service_unavailable','unauthorized','purchase_disabled') then raise exception 'Invalid admission event'; end if;
  insert into public.resource_admission_events(user_id,scope,result,stage,membership_plan,access_source,policy_versions)
  values(p_user,p_scope,p_result,context->>'stage',context->>'membershipPlan',context->>'accessSource',case when p_user is not null then to_jsonb(public.membership_policy_versions(p_user)) end);
end $$;
revoke all on function public.record_resource_admission(uuid,text,text) from public,anon,authenticated;
grant execute on function public.record_resource_admission(uuid,text,text) to service_role;

create function public.consume_resource_rate(p_scope text,p_subject text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare rule public.resource_rate_rules%rowtype; w timestamptz; n bigint;
begin
  if p_subject is null or length(p_subject) not between 1 and 200 then raise exception 'Invalid rate subject'; end if;
  select * into strict rule from public.resource_rate_rules where scope=p_scope;
  w:=to_timestamp(floor(extract(epoch from clock_timestamp())/rule.window_seconds)*rule.window_seconds);
  insert into public.resource_rate_windows(scope,subject,window_start,requests) values(p_scope,p_subject,w,1)
    on conflict(scope,subject,window_start) do update set requests=public.resource_rate_windows.requests+1 returning requests into n;
  return jsonb_build_object('allowed',n<=rule.max_requests,'retryAfterSeconds',greatest(1,ceil(extract(epoch from w+make_interval(secs=>rule.window_seconds)-clock_timestamp()))::integer));
end $$;

create function public.reserve_service_budget(p_service text,p_run_key text,p_units bigint)
returns uuid language plpgsql security definer set search_path='' as $$
declare b public.service_budgets%rowtype; d date:=(now() at time zone 'UTC')::date; u bigint; v_id uuid;
begin
  if p_units is null or p_units<=0 or p_run_key is null or length(p_run_key) not between 1 and 200 then raise exception 'Invalid budget request'; end if;
  select * into strict b from public.service_budgets where service=p_service;
  if not b.enabled then raise exception using message='service_budget_exceeded',errcode='P0001'; end if;
  perform pg_advisory_xact_lock(hashtextextended('budget:'||p_service||':'||p_run_key,0));
  if p_units>b.per_run_units-coalesce((select sum(coalesce(actual_units,reserved_units)) from public.service_budget_calls where service=p_service and run_key=p_run_key),0) then
    raise exception using message='service_budget_exceeded',errcode='P0001';
  end if;
  insert into public.service_budget_usage(service,day) values(p_service,d) on conflict do nothing;
  select used into strict u from public.service_budget_usage where service=p_service and day=d for update;
  if p_units>b.daily_units-u then raise exception using message='service_budget_exceeded',errcode='P0001'; end if;
  update public.service_budget_usage set used=used+p_units where service=p_service and day=d;
  insert into public.service_budget_calls(service,run_key,day,reserved_units) values(p_service,p_run_key,d,p_units) returning id into v_id;
  return v_id;
end $$;
create function public.settle_service_budget(p_id uuid,p_actual bigint)
returns void language plpgsql security definer set search_path='' as $$
declare c public.service_budget_calls%rowtype;
begin
  select * into strict c from public.service_budget_calls where id=p_id for update;
  if p_actual is null or p_actual<0 or p_actual>c.reserved_units then raise exception 'Invalid actual budget usage'; end if;
  if c.actual_units is not null then
    if c.actual_units<>p_actual then raise exception 'Budget settlement mismatch'; end if;
    return;
  end if;
  update public.service_budget_usage set used=used-c.reserved_units+p_actual where service=c.service and day=c.day;
  update public.service_budget_calls set actual_units=p_actual where id=p_id;
end $$;

-- Per-user lazy transitions run before every quota decision, even if no cron
-- is running. Legitimately accepted reservations form part of the baseline.
create function public.ensure_membership_transitions(p_user uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
  insert into public.resource_transition_grants(user_id,campaign_id,resource,ceiling,floor_limit,expires_at)
  select p_user,c.id,u.resource,greatest(l.commercial_limit,u.used+u.reserved),l.commercial_limit,
    c.ends_at+make_interval(days=>c.transition_days)
  from public.operation_campaigns c join public.resource_usage u on u.user_id=p_user and u.period_key='lifetime'
  join public.membership_runtime rt on true
  join public.resource_policy_limits l on l.policy_version=rt.free_policy and l.resource=u.resource
  where c.state<>'cancelled' and c.ends_at<=now()
    and c.ends_at+make_interval(days=>c.transition_days)>now()
  on conflict do nothing;
end $$;
alter function public.membership_resource_limit(uuid,text) rename to membership_resource_limit_base;
create function public.membership_resource_limit(p_user uuid,p_resource text)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare v jsonb; ceiling bigint;
begin
  perform public.ensure_membership_transitions(p_user);
  v:=public.membership_resource_limit_base(p_user,p_resource);
  select max(t.ceiling) into ceiling from public.resource_transition_grants t
    where t.user_id=p_user and t.resource=p_resource and t.expires_at>now();
  if ceiling is not null and v->>'period'='lifetime' then
    v:=v||jsonb_build_object('enforcedLimit',greatest((v->>'enforcedLimit')::bigint,ceiling));
  end if;
  return v;
end $$;
create function public.shrink_membership_transition()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.used+new.reserved<old.used+old.reserved then
    update public.resource_transition_grants set ceiling=greatest(floor_limit,least(ceiling,new.used+new.reserved))
      where user_id=new.user_id and resource=new.resource and expires_at>now();
  end if;
  return new;
end $$;
create trigger shrink_membership_transition after update on public.resource_usage
  for each row execute function public.shrink_membership_transition();

-- AI accounting follows durable run state. Recovery and cancellation use the
-- same run; final failure refunds user allowances but NOT provider budgets.
create function public.reopen_resource_reservation(p_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare r public.resource_reservations%rowtype; lim jsonb; u public.resource_usage%rowtype;
begin
  select * into strict r from public.resource_reservations where id=p_id for update;
  if r.state<>'released' then return; end if;
  lim:=public.membership_resource_limit(r.user_id,r.resource);
  select * into strict u from public.resource_usage where user_id=r.user_id and resource=r.resource and period_key=r.period_key for update;
  if r.amount>(lim->>'enforcedLimit')::bigint-u.used-u.reserved then raise exception using message='quota_exceeded',errcode='P0001'; end if;
  update public.resource_usage set reserved=reserved+r.amount where user_id=r.user_id and resource=r.resource and period_key=r.period_key;
  update public.resource_reservations set state='reserved',settled_amount=null,expires_at=now()+interval '1 hour' where id=p_id;
  insert into public.resource_usage_events(user_id,resource,period_key,reservation_id,action,delta,policy_versions)
    values(r.user_id,r.resource,r.period_key,r.id,'reserve',r.amount,r.policy_versions);
end $$;
create function public.meter_agent_run()
returns trigger language plpgsql security definer set search_path='' as $$
declare r record; quota jsonb;
begin
  if tg_op='INSERT' then
    perform pg_advisory_xact_lock(hashtextextended('agent-admission:'||new.user_id::text,0));
    if (select count(*) from public.agent_runs where user_id=new.user_id and status='running')>=4 then
      raise exception using message='concurrency_exceeded',errcode='P0001';
    end if;
    quota:=public.reserve_resource(new.user_id,'ai_requests','run:'||new.id::text,1,3600);
  elsif old.status<>new.status then
    for r in select * from public.resource_reservations where user_id=new.user_id
      and resource in ('ai_requests','ai_plans') and request_key='run:'||new.id::text loop
      if new.status='completed' and r.state='reserved' then perform public.finish_resource_reservation(r.id,1);
      elsif new.status='failed' and r.state='reserved' then perform public.finish_resource_reservation(r.id,0,true);
      elsif new.status='running' and old.status='failed' then perform public.reopen_resource_reservation(r.id);
      end if;
    end loop;
  end if;
  return new;
end $$;
create trigger meter_agent_admission before insert on public.agent_runs for each row execute function public.meter_agent_run();
create trigger meter_agent_completion after update of status on public.agent_runs for each row execute function public.meter_agent_run();

-- Import successful runs from this UTC month. Legacy accepted in-flight runs
-- receive durable reservations without rejecting previously admitted work.
lock table public.agent_runs in share row exclusive mode;
insert into public.resource_usage(user_id,resource,period_key,used)
select user_id,'ai_requests',to_char(created_at at time zone 'UTC','YYYY-MM'),count(*)
from public.agent_runs where status='completed' and created_at>=date_trunc('month',now() at time zone 'UTC') at time zone 'UTC'
group by user_id,to_char(created_at at time zone 'UTC','YYYY-MM')
on conflict(user_id,resource,period_key) do update set used=excluded.used;
insert into public.resource_usage(user_id,resource,period_key,used)
select r.user_id,'ai_plans',to_char(r.created_at at time zone 'UTC','YYYY-MM'),count(*)
from public.agent_runs r join public.agent_task_states t on t.run_id=r.id
where r.status='completed' and r.created_at>=date_trunc('month',now() at time zone 'UTC') at time zone 'UTC'
  and t.state->'decision'->>'mode'='execute' and (t.state->'decision'->>'fullHikingPlan'='true' or t.state->'decision'->>'packingMode'='full' or t.state->'decision'->>'domain'='transport')
group by r.user_id,to_char(r.created_at at time zone 'UTC','YYYY-MM')
on conflict(user_id,resource,period_key) do update set used=excluded.used;
do $$ declare r record; k text; versions jsonb; begin
  for r in select * from public.agent_runs where status='running' loop
    k:=to_char(r.created_at at time zone 'UTC','YYYY-MM');versions:=to_jsonb(public.membership_policy_versions(r.user_id));
    insert into public.resource_usage(user_id,resource,period_key,reserved) values(r.user_id,'ai_requests',k,1)
      on conflict(user_id,resource,period_key) do update set reserved=public.resource_usage.reserved+1;
    insert into public.resource_reservations(user_id,resource,period_key,request_key,amount,policy_versions,shadow_exceeded,expires_at)
      values(r.user_id,'ai_requests',k,'run:'||r.id::text,1,versions,false,now()+interval '1 hour');
  end loop;
end $$;

-- Additional child-resource protection. Parent counts alone cannot bound DB.
create function public.guard_resource_payload()
returns trigger language plpgsql security definer set search_path='' as $$
declare j jsonb:=to_jsonb(new); old_j jsonb; count_now bigint; parent text; subject uuid; payload_limit bigint;
begin
  if tg_op='UPDATE' then old_j:=to_jsonb(old); end if;
  payload_limit:=case when tg_table_name in ('journeys','tracks') then 8388608 when tg_table_name='agent_messages' then 2097152 when tg_table_name='timeline_rows' then 262144 else 65536 end;
  if octet_length(j::text)>payload_limit and (tg_op='INSERT' or octet_length(j::text)>octet_length(old_j::text)) then
    raise exception using message='payload_too_large',errcode='22023';
  end if;
  if tg_table_name='gear_items' and coalesce(jsonb_array_length(nullif(j->'photo_uris','null'::jsonb)),0)>5
    and (tg_op='INSERT' or coalesce(jsonb_array_length(nullif(old_j->'photo_uris','null'::jsonb)),0)<jsonb_array_length(j->'photo_uris')) then
    raise exception using message='gear_photo_limit',errcode='22023';
  end if;
  if tg_op<>'INSERT' then return new; end if;
  parent:=coalesce(j->>'list_id',j->>'set_id',j->>'journey_id',j->>'thread_id',j->>'user_id');
  if parent is null then return new; end if;
  perform pg_advisory_xact_lock(hashtextextended('child:'||tg_table_name||':'||parent,0));
  case tg_table_name
    when 'journey_packing_items' then select count(*) into count_now from public.journey_packing_items where list_id=new.list_id;
    when 'gear_set_items' then select count(*) into count_now from public.gear_set_items where set_id=new.set_id;
    when 'companions' then select count(*) into count_now from public.companions where journey_id=new.journey_id;
    when 'timeline_rows' then select count(*) into count_now from public.timeline_rows where journey_id=new.journey_id;
    when 'timeline_groups' then select count(*) into count_now from public.timeline_groups where journey_id=new.journey_id;
    when 'inspo_media' then select count(*) into count_now from public.inspo_media where journey_id=new.journey_id;
    when 'gear_categories' then select count(*) into count_now from public.gear_categories where user_id=new.user_id;
    when 'agent_threads' then select count(*) into count_now from public.agent_threads where user_id=new.user_id;
    when 'agent_messages' then select count(*) into count_now from public.agent_messages where thread_id=new.thread_id;
    else count_now:=0;
  end case;
  if count_now>=(case when tg_table_name='companions' then 300 when tg_table_name='gear_categories' then 1000 else 5000 end) then
    raise exception using message='child_resource_limit',errcode='P0001';
  end if;
  return new;
end $$;
do $$ declare t text; begin
  foreach t in array array['gear_items','gear_sets','journeys','tracks','journey_packing_items','gear_set_items','companions',
    'timeline_rows','timeline_groups','inspo_media','gear_categories','agent_threads','agent_messages'] loop
    execute format('create trigger guard_resource_payload before insert or update on public.%I for each row execute function public.guard_resource_payload()',t);
  end loop;
end $$;

alter table public.gear_sets add column if not exists description text;

-- Save sets and links atomically: an invalid item or quota failure must not
-- delete the user's existing selection or leave an empty newly-created set.
create function public.save_resource_gear_set(p_id text,p_name text,p_description text,p_items jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare saved public.gear_sets%rowtype; item jsonb;
begin
  if auth.uid() is null then raise exception using errcode='42501',message='Authentication required'; end if;
  if p_name is null or length(trim(p_name)) not between 1 and 200 or p_items is null or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)>5000 then raise exception 'Invalid gear set'; end if;
  if exists(select 1 from jsonb_array_elements(p_items) v where not exists(select 1 from public.gear_items g where g.id=(v->>'id')::integer and g.user_id=auth.uid())) then raise exception using errcode='42501',message='Gear item owner required'; end if;
  if p_id is null then
    insert into public.gear_sets(user_id,name,description) values(auth.uid(),p_name,p_description) returning * into saved;
  else
    select * into strict saved from public.gear_sets where id=p_id and user_id=auth.uid() for update;
    update public.gear_sets set name=p_name,description=p_description where id=p_id returning * into saved;
  end if;
  delete from public.gear_set_items where set_id=saved.id;
  for item in select value from jsonb_array_elements(p_items) loop
    insert into public.gear_set_items(set_id,item_id,qty,status) values(saved.id,(item->>'id')::integer,(item->>'qty')::integer,item->>'status');
  end loop;
  return to_jsonb(saved);
end $$;
revoke all on function public.save_resource_gear_set(text,text,text,jsonb) from public,anon;
grant execute on function public.save_resource_gear_set(text,text,text,jsonb) to authenticated;

alter function public.get_membership_status() rename to get_membership_status_base;
alter function public.get_membership_status_base() volatile;
create function public.get_membership_status()
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare v jsonb; resources jsonb;
begin
  if auth.uid() is null then raise exception using message='Authentication required',errcode='42501'; end if;
  perform public.ensure_membership_transitions(auth.uid());
  v:=public.get_membership_status_base();
  select jsonb_agg(item||jsonb_build_object('tracking',case
    when item->>'resource' in ('gear_items','gear_sets','journeys','tracks','ai_requests','ai_plans','gear_recognition','gear_cutouts','storage_bytes') then 'live'
    else item->>'tracking' end)) into resources from jsonb_array_elements(v->'resources') item;
  return v||jsonb_build_object('meteringStartedAt',(select metering_started_at from public.membership_runtime),'products',(select jsonb_agg(p order by term_months nulls last) from public.membership_products p),'resources',resources,'transitionEndsAt',(
    select max(expires_at) from public.resource_transition_grants where user_id=auth.uid() and expires_at>now()));
end $$;

create function public.membership_admin_snapshot()
returns jsonb language plpgsql security definer set search_path='' as $$
begin
  if coalesce(public.admin_role(),'') not in ('owner','admin','viewer') then raise exception using errcode='42501',message='Admin required'; end if;
  return jsonb_build_object('role',public.admin_role(),'runtime',(select to_jsonb(r) from public.membership_runtime r),
    'campaigns',(select coalesce(jsonb_agg(c),'[]') from public.operation_campaigns c),
    'grants',(select coalesce(jsonb_agg(g),'[]') from (select id,user_id,source,policy_version,starts_at,ends_at,is_lifetime,revoked_at,reason,created_at from public.membership_grants order by created_at desc limit 100) g),
    'policies',(select coalesce(jsonb_agg(p),'[]') from public.resource_policies p),
    'limits',(select coalesce(jsonb_agg(l),'[]') from public.resource_policy_limits l),
    'budgets',(select coalesce(jsonb_agg(b),'[]') from public.service_budgets b),
    'maintenance',(select to_jsonb(m) from public.resource_maintenance_state m),
    'storedObjects',(select used from public.service_budget_usage where service='stored_objects' and day='2000-01-01'),
    'storage',(select used from public.service_budget_usage where service='stored_bytes' and day='2000-01-01'),
    'admissions',(select coalesce(jsonb_agg(a),'[]') from (select scope,result,count(*) as requests from public.resource_admission_events where created_at>now()-interval '30 days' group by scope,result) a),
    'distribution',(select coalesce(jsonb_agg(d),'[]') from (select resource,count(*) as active_accounts,percentile_disc(0.5) within group(order by used) as p50,percentile_disc(0.95) within group(order by used) as p95,percentile_disc(0.99) within group(order by used) as p99 from public.resource_usage where used>0 and (period_key='lifetime' or period_key=to_char(now() at time zone 'UTC','YYYY-MM')) group by resource) d),
    'today',(select coalesce(jsonb_agg(u),'[]') from public.service_budget_usage u where day=(now() at time zone 'UTC')::date),
    'overages',(select count(*) from public.resource_usage_events where shadow_exceeded and created_at>now()-interval '30 days'));
end $$;
create function public.configure_membership(p_action text,p_data jsonb,p_reason text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); c public.operation_campaigns%rowtype; t timestamptz; v text; item jsonb; gift public.membership_grants%rowtype;
begin
  if actor is null or coalesce(public.admin_role(),'') not in ('owner','admin') then raise exception using errcode='42501',message='Admin required'; end if;
  if p_reason is null or length(trim(p_reason)) not between 3 and 500 or octet_length(p_data::text)>65536 then raise exception 'Reason and bounded configuration required'; end if;
  perform pg_advisory_xact_lock(hashtextextended('membership-config',0));
  if p_action='schedule_end' then
    select * into strict c from public.operation_campaigns where id=p_data->>'campaignId' for update;
    t:=(p_data->>'endsAt')::timestamptz;
    if t is null or t<now()+make_interval(days=>c.notice_days) then raise exception 'End must allow the announced notice period'; end if;
    if c.ends_at is not null and t<c.ends_at then raise exception 'Cannot shorten announced open access'; end if;
    update public.operation_campaigns set ends_at=t where id=c.id;
    insert into public.notifications(id,user_id,kind,cat,bucket,time,verb,target)
      select 'membership-end-'||c.id||'-'||p.id::text,p.id,'system','system','today','刚刚',
        '免费开放体验将于 '||to_char(t at time zone 'Asia/Shanghai','YYYY-MM-DD')||' 结束，已有数据会保留。','会员与用量'
      from public.profiles p on conflict(id) do update set verb=excluded.verb,read=false;
  elsif p_action='set_budget' then
    update public.service_budgets set enabled=(p_data->>'enabled')::boolean,
      daily_units=(p_data->>'dailyUnits')::bigint,per_run_units=(p_data->>'perRunUnits')::bigint where service=p_data->>'service';
    if not found then raise exception 'Unknown budget service'; end if;
  elsif p_action='publish_policy' then
    v:=p_data->>'version';
    if v is null or length(v) not between 1 and 100 then raise exception 'Invalid policy version'; end if;
    insert into public.resource_policies(version,features) values(v,p_data->'features');
    for item in select value from jsonb_array_elements(p_data->'limits') loop
      insert into public.resource_policy_limits values(v,item->>'resource',item->>'period',
        (item->>'limit')::bigint,(item->>'hardLimit')::bigint,item->>'mode');
    end loop;
    if (select count(*) from public.resource_policy_limits where policy_version=v)<>9 or exists(select 1 from public.resource_policy_limits where policy_version=v and (resource not in ('gear_items','gear_sets','journeys','tracks','storage_bytes','ai_requests','ai_plans','gear_recognition','gear_cutouts') or period<>case when resource in ('ai_requests','ai_plans','gear_recognition','gear_cutouts') then 'month' else 'lifetime' end)) then raise exception 'Policy must cover all nine resources'; end if;
    if p_data->>'target'='free' then update public.membership_runtime set free_policy=v,updated_at=now();
    elsif p_data->>'target'='member' then update public.membership_runtime set member_policy=v,updated_at=now();
    elsif p_data->>'target'='campaign' then update public.operation_campaigns set policy_version=v where id=p_data->>'campaignId';
    else raise exception 'Invalid policy target'; end if;
    if not found then raise exception 'Policy target not found'; end if;
  elsif p_action='set_stage' then
    if coalesce(p_data->>'stage','') not in ('open_access','trial_operation','paid') then raise exception 'Invalid stage'; end if;
    if p_data->>'stage'='paid' and exists(select 1 from public.operation_campaigns where state in ('scheduled','active') and (ends_at is null or ends_at>now())) then
      raise exception 'Announced open access must finish before switching to paid';
    end if;
    update public.membership_runtime set stage=p_data->>'stage',purchase_enabled=false,updated_at=now();
  elsif p_action='gift' then
    v:='gift:'||coalesce((p_data->>'requestId')::uuid,gen_random_uuid())::text;
    select * into gift from public.membership_grants where source_key=v;
    if found then
      if gift.source<>'gift' or gift.user_id is distinct from (p_data->>'userId')::uuid
        or gift.ends_at is distinct from (p_data->>'endsAt')::timestamptz
        or gift.is_lifetime is distinct from coalesce((p_data->>'isLifetime')::boolean,false)
        or gift.reason is distinct from p_reason then raise exception using errcode='22023',message='Gift replay mismatch'; end if;
    else
      insert into public.membership_grants(user_id,source,source_key,policy_version,ends_at,is_lifetime,reason)
      values((p_data->>'userId')::uuid,'gift',v,
        (select member_policy from public.membership_runtime),(p_data->>'endsAt')::timestamptz,coalesce((p_data->>'isLifetime')::boolean,false),p_reason);
    end if;
  elsif p_action='revoke_gift' then
    update public.membership_grants set revoked_at=coalesce(revoked_at,now()) where id=(p_data->>'grantId')::uuid and source='gift';
    if not found then raise exception 'Gift grant not found'; end if;
  else raise exception 'Unknown configuration action'; end if;
  insert into public.admin_audit_logs(actor_id,action,resource_type,metadata)
    values(actor,'membership.'||p_action,'membership',jsonb_build_object('reason',p_reason,'configuration',p_data));
  return public.membership_admin_snapshot();
end $$;

-- Restore default-public function permissions for NONE of these internal RPCs.
do $$ declare r record; begin
  for r in select p.oid::regprocedure f from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname in ('consume_resource_rate','reserve_service_budget','settle_service_budget',
      'ensure_membership_transitions','membership_resource_limit','membership_resource_limit_base','shrink_membership_transition',
      'reopen_resource_reservation','meter_agent_run','guard_resource_payload','get_membership_status_base',
      'get_membership_status','membership_admin_snapshot','configure_membership') loop
    execute format('revoke all on function %s from public,anon,authenticated',r.f);
  end loop;
end $$;
grant execute on function public.get_membership_status(),public.membership_admin_snapshot(),public.configure_membership(text,jsonb,text) to authenticated;
grant execute on function public.consume_resource_rate(text,text),public.reserve_service_budget(text,text,bigint),public.settle_service_budget(uuid,bigint),public.reopen_resource_reservation(uuid) to service_role;
notify pgrst,'reload schema';
commit;
