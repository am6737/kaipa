-- Apply as supabase_admin (reads storage.objects).
-- The media scrubber (infra/supabase/media-scrubber.mjs) strips location
-- metadata from user photos/videos in place. These two RPCs are its queue:
-- one hands out storage objects whose current (id, version) has not been
-- checked yet, the other records the outcome. Recording reads the object's
-- CURRENT version from storage.objects, so an object the scrubber re-uploaded
-- (new version) is remembered against that new version and never reprocessed.
begin;

create table if not exists public.media_location_scrub (
  object_id uuid primary key,
  bucket_id text not null,
  name text not null,
  version text,
  result text not null check (result in ('clean','stripped','skipped','failed')),
  detail text,
  checked_at timestamptz not null default now()
);

alter table public.media_location_scrub enable row level security;
revoke all on table public.media_location_scrub from public,anon,authenticated;

create or replace function public.media_scrub_pending(p_limit integer default 20)
returns table (object_id uuid, bucket_id text, name text, version text, content_type text, cache_control text)
language sql stable security definer set search_path = '' as $$
  select o.id, o.bucket_id, o.name, o.version,
         coalesce(o.metadata->>'mimetype', o.metadata->>'contentType'),
         o.metadata->>'cacheControl'
  from storage.objects o
  where o.bucket_id in ('kaipa','kaipa-gear','shared-moments')
    -- Tracks are GPS files by design; assistant uploads are not user media.
    and not (o.bucket_id = 'kaipa' and (o.name like 'tracks/%' or o.name like 'assistant/%'))
    and o.version is not null
    and not exists (
      select 1 from public.media_location_scrub s
      where s.object_id = o.id and s.version is not distinct from o.version
    )
  order by o.created_at desc, o.id
  limit greatest(1, least(coalesce(p_limit, 20), 200));
$$;

create or replace function public.media_scrub_record(p_object_id uuid, p_result text, p_detail text default null)
returns boolean
language plpgsql volatile security definer set search_path = '' as $$
declare v_bucket text; v_name text; v_version text;
begin
  select bucket_id, name, version into v_bucket, v_name, v_version
  from storage.objects where id = p_object_id;
  if not found then return false; end if;
  insert into public.media_location_scrub(object_id, bucket_id, name, version, result, detail)
  values (p_object_id, v_bucket, v_name, v_version, p_result, p_detail)
  on conflict (object_id) do update
    set bucket_id = excluded.bucket_id, name = excluded.name, version = excluded.version,
        result = excluded.result, detail = excluded.detail, checked_at = now();
  return true;
end $$;

revoke all on function public.media_scrub_pending(integer) from public,anon,authenticated;
revoke all on function public.media_scrub_record(uuid,text,text) from public,anon,authenticated;
grant execute on function public.media_scrub_pending(integer) to service_role;
grant execute on function public.media_scrub_record(uuid,text,text) to service_role;

notify pgrst, 'reload schema';
commit;
