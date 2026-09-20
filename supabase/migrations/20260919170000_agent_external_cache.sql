begin;

-- Shared, non-user-specific provider results. Personalized plans must not be
-- stored here; callers include the provider/query shape in cache_key.
create table if not exists public.agent_external_cache (
  cache_key text primary key,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create index if not exists agent_external_cache_expiry_idx
  on public.agent_external_cache(expires_at);

alter table public.agent_external_cache enable row level security;
drop policy if exists agent_external_cache_authenticated on public.agent_external_cache;
create policy agent_external_cache_authenticated on public.agent_external_cache
  for all to authenticated using (true) with check (true);
grant select, insert, update, delete on public.agent_external_cache to authenticated;

-- The Edge Function uses the service-role client for these RPCs. Do not grant
-- table access to end-user JWTs: this cache is shared across users and must not
-- be writable by an arbitrary authenticated client.
revoke all on public.agent_external_cache from anon, authenticated;

create or replace function public.read_agent_external_cache(p_cache_key text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select payload
  from public.agent_external_cache
  where cache_key = p_cache_key and expires_at > now();
$$;

create or replace function public.write_agent_external_cache(
  p_cache_key text,
  p_payload jsonb,
  p_ttl_seconds integer
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_cache_key is null or length(p_cache_key) > 512 then
    raise exception 'invalid external cache key';
  end if;
  if p_ttl_seconds < 15 or p_ttl_seconds > 63072000 then
    raise exception 'invalid external cache ttl';
  end if;
  insert into public.agent_external_cache(cache_key, payload, created_at, expires_at)
  values (p_cache_key, p_payload, now(), now() + make_interval(secs => p_ttl_seconds))
  on conflict (cache_key) do update set payload = excluded.payload,
    created_at = excluded.created_at, expires_at = excluded.expires_at;
end;
$$;

revoke all on function public.read_agent_external_cache(text) from public, anon, authenticated;
revoke all on function public.write_agent_external_cache(text, jsonb, integer) from public, anon, authenticated;
grant execute on function public.read_agent_external_cache(text) to service_role;
grant execute on function public.write_agent_external_cache(text, jsonb, integer) to service_role;

commit;
