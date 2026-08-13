-- Per-participant packing lists plus one shared list for each journey.
-- This supersedes the earlier responsibility-board checklist model.

alter table companions add column if not exists user_id uuid references profiles(id) on delete set null;

-- Older journeys were created before companions.user_id existed. Link the host/self
-- companion to the journey owner so personal packing lists can sync under RLS.
update companions c
set user_id = j.user_id
from journeys j
where c.journey_id = j.id
  and c.user_id is null
  and (c.is_self = true or c.is_host = true);

create table if not exists journey_packing_lists (
  id uuid primary key default gen_random_uuid(),
  journey_id text not null references journeys(id) on delete cascade,
  kind text not null check (kind in ('personal', 'shared')),
  owner_companion_id integer references companions(id) on delete cascade,
  created_by uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((kind = 'shared' and owner_companion_id is null) or (kind = 'personal' and owner_companion_id is not null))
);

create unique index if not exists journey_packing_shared_unique on journey_packing_lists(journey_id) where kind = 'shared';
create unique index if not exists journey_packing_personal_unique on journey_packing_lists(journey_id, owner_companion_id) where kind = 'personal';

create table if not exists journey_packing_items (
  id uuid primary key default gen_random_uuid(),
  list_id uuid not null references journey_packing_lists(id) on delete cascade,
  source_type text not null check (source_type in ('gear', 'gearSet', 'recommendedTemplate', 'custom')),
  source_gear_item_id bigint references gear_items(id) on delete set null,
  name text not null,
  category_name text,
  category_color text,
  quantity integer not null default 1 check (quantity > 0),
  weight_kg numeric,
  note text,
  packed boolean not null default false,
  carrier_companion_id integer references companions(id) on delete set null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists journey_packing_items_list_idx on journey_packing_items(list_id);

create or replace function public.is_journey_member(target_journey_id text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from journeys j where j.id = target_journey_id and (
      j.user_id = auth.uid() or exists (
        select 1 from companions c where c.journey_id = target_journey_id and c.user_id = auth.uid()
      )
    )
  );
$$;
grant execute on function public.is_journey_member(text) to authenticated;

alter table journey_packing_lists enable row level security;
alter table journey_packing_items enable row level security;

drop policy if exists "journey_packing_lists_select" on journey_packing_lists;
create policy "journey_packing_lists_select" on journey_packing_lists for select to authenticated
  using (public.is_journey_member(journey_id));

drop policy if exists "journey_packing_lists_insert" on journey_packing_lists;
create policy "journey_packing_lists_insert" on journey_packing_lists for insert to authenticated with check (
  created_by = auth.uid() and public.is_journey_member(journey_id)
);

drop policy if exists "journey_packing_lists_update" on journey_packing_lists;
create policy "journey_packing_lists_update" on journey_packing_lists for update to authenticated using (
  public.is_journey_member(journey_id)
) with check (public.is_journey_member(journey_id));

drop policy if exists "journey_packing_lists_delete" on journey_packing_lists;
create policy "journey_packing_lists_delete" on journey_packing_lists for delete to authenticated using (
  exists (select 1 from journeys j where j.id = journey_id and j.user_id = auth.uid())
);

drop policy if exists "journey_packing_items_select" on journey_packing_items;
create policy "journey_packing_items_select" on journey_packing_items for select to authenticated using (
  exists (select 1 from journey_packing_lists l where l.id = list_id and public.is_journey_member(l.journey_id))
);

drop policy if exists "journey_packing_items_insert" on journey_packing_items;
create policy "journey_packing_items_insert" on journey_packing_items for insert to authenticated with check (
  exists (
    select 1 from journey_packing_lists l
    join journeys j on j.id = l.journey_id
    left join companions owner on owner.id = l.owner_companion_id
    where l.id = list_id and (
      j.user_id = auth.uid()
      or owner.user_id = auth.uid()
      or (l.kind = 'shared' and coalesce((j.participant_permissions->>'editChecklist')::boolean, false))
    )
  )
);

drop policy if exists "journey_packing_items_update" on journey_packing_items;
create policy "journey_packing_items_update" on journey_packing_items for update to authenticated using (
  exists (
    select 1 from journey_packing_lists l
    join journeys j on j.id = l.journey_id
    left join companions owner on owner.id = l.owner_companion_id
    left join companions carrier on carrier.id = carrier_companion_id
    where l.id = list_id and (
      j.user_id = auth.uid()
      or owner.user_id = auth.uid()
      or (l.kind = 'shared' and (
        coalesce((j.participant_permissions->>'editChecklist')::boolean, false)
        or carrier.user_id = auth.uid()
        or carrier_companion_id is null
      ))
    )
  )
) with check (
  exists (select 1 from journey_packing_lists l where l.id = list_id and public.is_journey_member(l.journey_id))
);

drop policy if exists "journey_packing_items_delete" on journey_packing_items;
create policy "journey_packing_items_delete" on journey_packing_items for delete to authenticated using (
  exists (
    select 1 from journey_packing_lists l
    join journeys j on j.id = l.journey_id
    left join companions owner on owner.id = l.owner_companion_id
    where l.id = list_id and (j.user_id = auth.uid() or owner.user_id = auth.uid() or coalesce((j.participant_permissions->>'editChecklist')::boolean, false))
  )
);

create or replace function public.send_journey_packing_reminder(target_companion_id integer, remaining_count integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_companion companions%rowtype;
  source_companion companions%rowtype;
  target_journey journeys%rowtype;
begin
  select * into target_companion from companions where id = target_companion_id;
  if target_companion.id is null or target_companion.user_id is null then return; end if;
  if not public.is_journey_member(target_companion.journey_id) then
    raise exception 'not a journey member';
  end if;
  select * into target_journey from journeys where id = target_companion.journey_id;
  select * into source_companion from companions where journey_id = target_companion.journey_id and user_id = auth.uid() limit 1;
  insert into notifications (user_id, kind, cat, bucket, time, who, avatar, color, verb, target, target_id, action)
  values (
    target_companion.user_id,
    'trip',
    'social',
    'today',
    '刚刚',
    coalesce(source_companion.name, '旅程伙伴'),
    source_companion.avatar_url,
    source_companion.color,
    '提醒你还有 ' || greatest(remaining_count, 0) || ' 件装备未准备',
    target_journey.name,
    target_journey.id,
    '查看装备清单'
  );
end;
$$;

grant execute on function public.send_journey_packing_reminder(integer, integer) to authenticated;

create index if not exists companions_user_id_idx on companions(user_id);

drop policy if exists "journeys_member_select" on journeys;
create policy "journeys_member_select" on journeys for select to authenticated
  using (public.is_journey_member(id));

drop policy if exists "companions_member_select" on companions;
create policy "companions_member_select" on companions for select to authenticated
  using (public.is_journey_member(journey_id));

-- Tighten item writes: personal lists are editable only by their owner; shared
-- lists are editable by the host or members with checklist-edit permission.
drop policy if exists "journey_packing_items_insert" on journey_packing_items;
create policy "journey_packing_items_insert" on journey_packing_items for insert to authenticated with check (
  exists (
    select 1 from journey_packing_lists l
    join journeys j on j.id = l.journey_id
    left join companions owner on owner.id = l.owner_companion_id
    where l.id = list_id and public.is_journey_member(l.journey_id) and (
      (l.kind = 'personal' and (owner.user_id = auth.uid() or j.user_id = auth.uid()))
      or (l.kind = 'shared' and (j.user_id = auth.uid() or coalesce((j.participant_permissions->>'editChecklist')::boolean, false)))
    )
  )
);

drop policy if exists "journey_packing_items_update" on journey_packing_items;
create policy "journey_packing_items_update" on journey_packing_items for update to authenticated using (
  exists (
    select 1 from journey_packing_lists l
    join journeys j on j.id = l.journey_id
    left join companions owner on owner.id = l.owner_companion_id
    left join companions carrier on carrier.id = carrier_companion_id
    where l.id = list_id and public.is_journey_member(l.journey_id) and (
      (l.kind = 'personal' and (owner.user_id = auth.uid() or j.user_id = auth.uid()))
      or (l.kind = 'shared' and (
        j.user_id = auth.uid()
        or coalesce((j.participant_permissions->>'editChecklist')::boolean, false)
        or carrier.user_id = auth.uid()
        or carrier_companion_id is null
      ))
    )
  )
) with check (
  exists (select 1 from journey_packing_lists l where l.id = list_id and public.is_journey_member(l.journey_id))
);

drop policy if exists "journey_packing_items_delete" on journey_packing_items;
create policy "journey_packing_items_delete" on journey_packing_items for delete to authenticated using (
  exists (
    select 1 from journey_packing_lists l
    join journeys j on j.id = l.journey_id
    left join companions owner on owner.id = l.owner_companion_id
    where l.id = list_id and public.is_journey_member(l.journey_id) and (
      (l.kind = 'personal' and (owner.user_id = auth.uid() or j.user_id = auth.uid()))
      or (l.kind = 'shared' and (j.user_id = auth.uid() or coalesce((j.participant_permissions->>'editChecklist')::boolean, false)))
    )
  )
);
