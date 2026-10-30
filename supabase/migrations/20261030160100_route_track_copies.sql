-- route_track_copies.sql — journey creation writes its route copy outside the library.
--
-- Follows 20261030160000_route_tracks_out_of_library.sql (tracks.in_library).
-- Three RPCs copy a catalog route's line into public.tracks for the journey they
-- create: create_journey_from_route_guide, create_journey_from_import and
-- create_journey_from_itinerary(_legacy). Each body is long and the copy is
-- their only tracks insert, so rather than copying the bodies they run inside a
-- transaction-local flag that a BEFORE INSERT trigger reads.
--
-- tracks.source_track_id is set on a library entry the user saved from a
-- journey's track, so the journey page can say it is already saved and open it.

begin;

alter table public.tracks
  add column if not exists source_track_id uuid references public.tracks(id) on delete set null;

create index if not exists tracks_source_track_idx
  on public.tracks (source_track_id) where source_track_id is not null;

create or replace function public.mark_route_track_copy()
returns trigger language plpgsql set search_path = '' as $$
begin
  if current_setting('app.route_track_copy', true) = 'on' then new.in_library := false; end if;
  return new;
end $$;
revoke all on function public.mark_route_track_copy() from public, anon, authenticated;

drop trigger if exists tracks_route_copy on public.tracks;
create trigger tracks_route_copy before insert on public.tracks
  for each row execute function public.mark_route_track_copy();

-- ─── create_journey_from_route_guide ────────────────────────────────────────

do $$ begin
  if to_regprocedure('public.create_journey_from_route_guide_legacy(uuid,uuid,date,text)') is null then
    alter function public.create_journey_from_route_guide(uuid,uuid,date,text)
      rename to create_journey_from_route_guide_legacy;
  end if;
end $$;
revoke all on function public.create_journey_from_route_guide_legacy(uuid,uuid,date,text) from public, anon, authenticated;

create or replace function public.create_journey_from_route_guide(
  p_guide_id uuid, p_request_id uuid, p_trek_start_date date default null, p_entry text default null
) returns text
language plpgsql security definer set search_path = public
as $$
declare jid text; previous text := coalesce(current_setting('app.route_track_copy', true), '');
begin
  perform set_config('app.route_track_copy', 'on', true);
  jid := public.create_journey_from_route_guide_legacy(p_guide_id, p_request_id, p_trek_start_date, p_entry);
  perform set_config('app.route_track_copy', previous, true);
  return jid;
end $$;
revoke all on function public.create_journey_from_route_guide(uuid,uuid,date,text) from public, anon;
grant execute on function public.create_journey_from_route_guide(uuid,uuid,date,text) to authenticated;

-- ─── create_journey_from_import ─────────────────────────────────────────────

do $$ begin
  if to_regprocedure('public.create_journey_from_import_legacy(uuid,jsonb,jsonb)') is null then
    alter function public.create_journey_from_import(uuid,jsonb,jsonb)
      rename to create_journey_from_import_legacy;
  end if;
end $$;
revoke all on function public.create_journey_from_import_legacy(uuid,jsonb,jsonb) from public, anon, authenticated;

create or replace function public.create_journey_from_import(
  p_request_id uuid, p_journey jsonb, p_days jsonb
) returns text
language plpgsql security definer set search_path = public
as $$
declare jid text; previous text := coalesce(current_setting('app.route_track_copy', true), '');
begin
  perform set_config('app.route_track_copy', 'on', true);
  jid := public.create_journey_from_import_legacy(p_request_id, p_journey, p_days);
  perform set_config('app.route_track_copy', previous, true);
  return jid;
end $$;
revoke all on function public.create_journey_from_import(uuid,jsonb,jsonb) from public, anon;
grant execute on function public.create_journey_from_import(uuid,jsonb,jsonb) to authenticated;

-- ─── create_journey_from_itinerary ──────────────────────────────────────────
--
-- Already a wrapper over _legacy (20261030140000_itinerary_template_notes.sql);
-- body copied from there with the flag around the legacy call.

create or replace function public.create_journey_from_itinerary(p_itinerary_id uuid,p_version int,p_trek_start_date date,p_include_access boolean,p_request_id uuid,p_entry text default null)
returns text language plpgsql security definer set search_path=public as $$
declare jid text; plan public.route_itineraries%rowtype; rname text; rendered jsonb; dn text; replay boolean;
  previous text := coalesce(current_setting('app.route_track_copy', true), '');
begin
  -- A retried request returns the journey it already made; its notes may have been edited since.
  replay:=exists(select 1 from public.journey_guide_imports imports where imports.request_id=p_request_id);
  perform set_config('app.route_track_copy', 'on', true);
  jid:=public.create_journey_from_itinerary_legacy(p_itinerary_id,p_version,p_trek_start_date,p_include_access,p_request_id,p_entry);
  perform set_config('app.route_track_copy', previous, true);
  if replay then return jid; end if;
  select * into plan from public.route_itineraries where id=p_itinerary_id and version=p_version;
  select name into rname from public.routes where id=plan.route_id;
  rendered:=public.itinerary_note_render(plan.payload,rname,p_include_access);
  for dn in select key from jsonb_each_text(rendered) loop update public.timeline_groups set note=rendered->>dn where timeline_groups.journey_id=jid and name=dn; end loop;
  return jid;
end $$;
revoke all on function public.create_journey_from_itinerary(uuid,int,date,boolean,uuid,text) from public, anon;
grant execute on function public.create_journey_from_itinerary(uuid,int,date,boolean,uuid,text) to authenticated;

notify pgrst, 'reload schema';
commit;
