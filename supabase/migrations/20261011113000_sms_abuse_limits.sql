create table if not exists public.sms_send_events (
  id bigint generated always as identity primary key,
  request_id text not null unique,
  phone_hash text not null,
  ip_hash text not null default '',
  device_hash text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists sms_send_events_phone_created_idx on public.sms_send_events (phone_hash, created_at desc);
create index if not exists sms_send_events_ip_created_idx on public.sms_send_events (ip_hash, created_at desc);
create index if not exists sms_send_events_device_created_idx on public.sms_send_events (device_hash, created_at desc);
alter table public.sms_send_events enable row level security;

create or replace function public.consume_sms_send(
  p_request_id text, p_phone_hash text, p_ip_hash text default '', p_device_hash text default '',
  p_phone_per_minute integer default 1, p_phone_per_hour integer default 5, p_phone_per_day integer default 10,
  p_ip_per_hour integer default 30, p_device_per_hour integer default 20, p_global_per_day integer default 10000
)
returns table (allowed boolean, reason text, retry_after_seconds integer)
language plpgsql security definer set search_path = public
as $$
declare
  now_at timestamptz := now(); phone_minute integer; phone_hour integer; phone_day integer;
  ip_hour integer; device_hour integer; global_day integer;
begin
  if p_request_id is null or length(trim(p_request_id)) < 8 then
    return query select false, 'invalid_request', 60; return;
  end if;
  delete from public.sms_send_events where created_at < now_at - interval '2 days';
  perform pg_advisory_xact_lock(hashtextextended(coalesce(p_phone_hash, ''), 0));
  if exists (select 1 from public.sms_send_events where request_id = p_request_id) then
    return query select false, 'duplicate_request', 60; return;
  end if;
  select count(*) into phone_minute from public.sms_send_events where phone_hash = p_phone_hash and created_at >= now_at - interval '1 minute';
  select count(*) into phone_hour from public.sms_send_events where phone_hash = p_phone_hash and created_at >= now_at - interval '1 hour';
  select count(*) into phone_day from public.sms_send_events where phone_hash = p_phone_hash and created_at >= now_at - interval '1 day';
  select count(*) into ip_hour from public.sms_send_events where ip_hash <> '' and ip_hash = p_ip_hash and created_at >= now_at - interval '1 hour';
  select count(*) into device_hour from public.sms_send_events where device_hash <> '' and device_hash = p_device_hash and created_at >= now_at - interval '1 hour';
  select count(*) into global_day from public.sms_send_events where created_at >= date_trunc('day', now_at);
  if phone_minute >= p_phone_per_minute then return query select false, 'phone_minute', 60; return; end if;
  if phone_hour >= p_phone_per_hour then return query select false, 'phone_hour', 3600; return; end if;
  if phone_day >= p_phone_per_day then return query select false, 'phone_day', 86400; return; end if;
  if ip_hour >= p_ip_per_hour then return query select false, 'ip_hour', 3600; return; end if;
  if device_hour >= p_device_per_hour then return query select false, 'device_hour', 3600; return; end if;
  if global_day >= p_global_per_day then return query select false, 'global_day', 86400; return; end if;
  insert into public.sms_send_events (request_id, phone_hash, ip_hash, device_hash)
  values (p_request_id, p_phone_hash, coalesce(p_ip_hash, ''), coalesce(p_device_hash, ''));
  return query select true, 'allowed', 0;
end;
$$;
revoke all on function public.consume_sms_send(text, text, text, text, integer, integer, integer, integer, integer, integer) from public, anon, authenticated;
grant execute on function public.consume_sms_send(text, text, text, text, integer, integer, integer, integer, integer, integer) to service_role;
revoke all on table public.sms_send_events from public, anon, authenticated;
grant select, insert on table public.sms_send_events to service_role;
grant usage, select on sequence public.sms_send_events_id_seq to service_role;
