-- Convert the original shared "builtin" gear categories into editable,
-- per-user records. Safe to run more than once.

-- Give every existing profile its own copy of each default category it does
-- not already have. These are ordinary user categories after insertion.
insert into gear_categories (user_id, name, color, builtin)
select p.id, defaults.name, defaults.color, false
from profiles p
cross join (values
  ('背负系统', '#FF3B30'),
  ('庇护系统', '#FF9500'),
  ('睡眠系统', '#5856D6'),
  ('服饰系统', '#34C759'),
  ('饮食系统', '#00C7BE'),
  ('电子导航', '#32ADE6'),
  ('安全急救', '#FF2D55'),
  ('其他', '#8E8E93')
) as defaults(name, color)
where not exists (
  select 1
  from gear_categories existing
  where existing.user_id = p.id and existing.name = defaults.name
);

-- Move every item that still points at a shared category to the matching copy
-- owned by the item's user.
update gear_items item
set cat_id = owned.id
from gear_categories shared
join gear_categories owned
  on owned.name = shared.name and owned.user_id is not null
where item.cat_id = shared.id
  and shared.user_id is null
  and owned.user_id = item.user_id;

-- Shared rows are now unused. From this point on every category has an owner.
delete from gear_categories where user_id is null;
update gear_categories set builtin = false where builtin is distinct from false;
alter table gear_categories alter column user_id set not null;

drop policy if exists "gear_cats_select" on gear_categories;
drop policy if exists "gear_cats_insert" on gear_categories;
drop policy if exists "gear_cats_update" on gear_categories;
drop policy if exists "gear_cats_delete" on gear_categories;
create policy "gear_cats_select" on gear_categories for select to authenticated
  using (user_id = auth.uid());
create policy "gear_cats_insert" on gear_categories for insert to authenticated
  with check (user_id = auth.uid());
create policy "gear_cats_update" on gear_categories for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "gear_cats_delete" on gear_categories for delete to authenticated
  using (user_id = auth.uid());

create or replace function create_default_gear_categories()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into gear_categories (user_id, name, color, builtin) values
    (new.id, '背负系统', '#FF3B30', false),
    (new.id, '庇护系统', '#FF9500', false),
    (new.id, '睡眠系统', '#5856D6', false),
    (new.id, '服饰系统', '#34C759', false),
    (new.id, '饮食系统', '#00C7BE', false),
    (new.id, '电子导航', '#32ADE6', false),
    (new.id, '安全急救', '#FF2D55', false),
    (new.id, '其他', '#8E8E93', false);
  return new;
end;
$$;
drop trigger if exists on_profile_created_create_gear_categories on profiles;
create trigger on_profile_created_create_gear_categories
  after insert on profiles
  for each row execute function create_default_gear_categories();
