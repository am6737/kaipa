begin;

-- Avoid a PL/pgSQL record variable colliding with the upload-ticket SQL alias.
create or replace function public.resource_maintenance_candidates()
returns jsonb language plpgsql security definer set search_path='' as $$
declare expired_entry record;
begin
  for expired_entry in select id from public.resource_upload_tickets where state='reserved' and expires_at<now() limit 100 loop
    perform public.cancel_resource_upload(expired_entry.id,null);
  end loop;
  for expired_entry in select id from public.resource_reservations where resource in ('gear_recognition','gear_cutouts') and state='reserved' and expires_at<now()-interval '1 hour' limit 100 loop
    perform public.finish_resource_reservation(expired_entry.id,0,true);
  end loop;
  delete from public.resource_admission_events where created_at<now()-interval '180 days';
  delete from public.resource_usage_events where created_at<now()-interval '180 days';
  delete from public.qr_login_requests where expires_at<now()-interval '1 day';
  delete from public.resource_rate_windows where window_start<now()-interval '2 days';
  -- Old unassociated media is cleaned through the Storage API, not by SQL
  -- deleting its metadata. References protect historical versions as well.
  return (select coalesce(jsonb_agg(jsonb_build_object('bucket',f.bucket,'path',f.path)),'[]') from (
    select a.* from public.resource_file_accounts a join public.resource_upload_tickets t on t.id=a.ticket_id
    where t.created_at<now()-interval '7 days' and t.purpose not in ('attachment','track')
      and not exists(select 1 from public.gear_items g where g.photo_uris::text like '%'||a.path||'%')
      and not exists(select 1 from public.journeys j where j.photo_uris::text like '%'||a.path||'%')
      and not exists(select 1 from public.profiles p where p.avatar_url like '%'||a.path||'%')
      and not exists(select 1 from public.inspo_media i where i.uri like '%'||a.path||'%' or i.thumbnail like '%'||a.path||'%' or i.paired_video_uri like '%'||a.path||'%')
      and not exists(select 1 from public.shared_moments m where m.uri like '%'||a.path||'%')
      and not exists(select 1 from public.journey_versions v where v.snapshot::text like '%'||a.path||'%') limit 100
  ) f);
end $$;
revoke all on function public.resource_maintenance_candidates() from public,anon,authenticated;
grant execute on function public.resource_maintenance_candidates() to service_role;
notify pgrst,'reload schema';
commit;
