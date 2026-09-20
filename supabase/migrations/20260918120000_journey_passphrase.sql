-- Journey 口令 (passphrase) channel: server-generated 4-digit codes, rotation,
-- and code-only joining. Codes move server-side so duplicate journey names can
-- no longer collide on the deterministic client hash (unique(slug, code)).

-- companions.created_at backs the join rate limit in _perform_share_join.
-- Existing rows are backdated so they don't count against the window.
do $$ begin
  if not exists (select 1 from information_schema.columns where table_name = 'companions' and column_name = 'created_at') then
    alter table companions add column created_at timestamptz default now();
    update companions set created_at = now() - interval '1 year';
  end if;
end $$;

-- Canonical active share for a journey: returns the newest active row if one
-- exists, otherwise derives the slug from the journey name and generates a
-- random 4-digit code (retrying on the unique(slug, code) constraint).
create or replace function public.ensure_journey_share(p_journey_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  v_journey_name text;
  v_slug text;
  v_code text;
  v_tries int := 0;
begin
  if current_user_id is null then
    raise exception 'JOURNEY_INVITE_AUTH_REQUIRED';
  end if;

  -- Only someone who can open the journey (owner or companion) may share it.
  if not exists (
    select 1 from journeys where id = p_journey_id and deleted_at is null and user_id = current_user_id
  ) and not exists (
    select 1 from companions where journey_id = p_journey_id and user_id = current_user_id
  ) then
    raise exception 'JOURNEY_SHARE_FORBIDDEN';
  end if;

  select slug, code into v_slug, v_code
  from journey_shares
  where journey_id = p_journey_id and active = true
  order by created_at desc
  limit 1;

  if v_code is not null then
    return jsonb_build_object('slug', v_slug, 'code', v_code);
  end if;

  select name into v_journey_name from journeys where id = p_journey_id;
  v_slug := left(regexp_replace(coalesce(nullif(v_journey_name, ''), 'kaipa'), '\s+', '', 'g'), 8);

  loop
    v_tries := v_tries + 1;
    v_code := ((1000 + floor(random() * 9000))::int)::text;
    begin
      insert into journey_shares (journey_id, user_id, slug, code, active)
      values (p_journey_id, current_user_id, v_slug, v_code, true);
      exit;
    exception when unique_violation then
      if v_tries >= 20 then
        raise exception 'JOURNEY_SHARE_COLLISION';
      end if;
    end;
  end loop;

  return jsonb_build_object('slug', v_slug, 'code', v_code);
end;
$$;

-- Rotate: deactivates every active code for the journey and issues a new one.
-- Owner-only, because rotation invalidates codes other members may have shared.
create or replace function public.rotate_journey_share(p_journey_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  v_journey_name text;
  v_slug text;
  v_code text;
  v_tries int := 0;
begin
  if current_user_id is null then
    raise exception 'JOURNEY_INVITE_AUTH_REQUIRED';
  end if;

  if not exists (
    select 1 from journeys where id = p_journey_id and deleted_at is null and user_id = current_user_id
  ) then
    raise exception 'JOURNEY_SHARE_FORBIDDEN';
  end if;

  select slug into v_slug
  from journey_shares
  where journey_id = p_journey_id and active = true
  order by created_at desc
  limit 1;

  update journey_shares set active = false where journey_id = p_journey_id and active = true;

  if v_slug is null then
    select name into v_journey_name from journeys where id = p_journey_id;
    v_slug := left(regexp_replace(coalesce(nullif(v_journey_name, ''), 'kaipa'), '\s+', '', 'g'), 8);
  end if;

  loop
    v_tries := v_tries + 1;
    v_code := ((1000 + floor(random() * 9000))::int)::text;
    begin
      insert into journey_shares (journey_id, user_id, slug, code, active)
      values (p_journey_id, current_user_id, v_slug, v_code, true);
      exit;
    exception when unique_violation then
      if v_tries >= 20 then
        raise exception 'JOURNEY_SHARE_COLLISION';
      end if;
    end;
  end loop;

  return jsonb_build_object('slug', v_slug, 'code', v_code);
end;
$$;

-- Manual 口令 entry: join by code alone. When several journeys share the same
-- active code the candidates are returned for the app to disambiguate.
create or replace function public.join_journey_by_code(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  target_journey_id text;
  candidates jsonb;
begin
  if current_user_id is null then
    raise exception 'JOURNEY_INVITE_AUTH_REQUIRED';
  end if;

  if not exists (
    select 1
    from journey_shares js
    join journeys j on j.id = js.journey_id
    where js.code = p_code and js.active = true and j.deleted_at is null
  ) then
    raise exception 'JOURNEY_INVITE_INVALID';
  end if;

  select jsonb_agg(item) into candidates
  from (
    select distinct on (js.journey_id)
      jsonb_build_object('journey_id', js.journey_id, 'slug', js.slug, 'name', j.name) as item
    from journey_shares js
    join journeys j on j.id = js.journey_id
    where js.code = p_code and js.active = true and j.deleted_at is null
    order by js.journey_id, js.created_at desc
  ) rows_;

  if jsonb_array_length(candidates) > 1 then
    return jsonb_build_object('status', 'ambiguous', 'candidates', candidates);
  end if;

  select (candidates -> 0 ->> 'journey_id') into target_journey_id;
  return public._perform_share_join(target_journey_id);
end;
$$;

revoke all on function public.ensure_journey_share(text) from public;
revoke all on function public.ensure_journey_share(text) from anon;
grant execute on function public.ensure_journey_share(text) to authenticated;

revoke all on function public.rotate_journey_share(text) from public;
revoke all on function public.rotate_journey_share(text) from anon;
grant execute on function public.rotate_journey_share(text) to authenticated;

revoke all on function public.join_journey_by_code(text) from public;
revoke all on function public.join_journey_by_code(text) from anon;
grant execute on function public.join_journey_by_code(text) to authenticated;
