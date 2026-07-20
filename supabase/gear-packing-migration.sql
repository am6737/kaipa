-- Gear packing preferences / per-set overrides
-- Run this once against an existing Supabase project.
alter table profiles
  add column if not exists gear_weight_unit text not null default 'kg';
alter table profiles
  drop constraint if exists profiles_gear_weight_unit_check;
alter table profiles
  add constraint profiles_gear_weight_unit_check check (gear_weight_unit in ('kg','g','oz','lb'));

alter table gear_items
  add column if not exists status text not null default 'packed';
alter table gear_items
  drop constraint if exists gear_items_status_check;
alter table gear_items
  add constraint gear_items_status_check check (status in ('packed','worn','consumable','optional'));

alter table gear_set_items
  add column if not exists qty int4;
alter table gear_set_items
  add column if not exists status text;
alter table gear_set_items
  drop constraint if exists gear_set_items_qty_check;
alter table gear_set_items
  add constraint gear_set_items_qty_check check (qty is null or qty > 0);
alter table gear_set_items
  drop constraint if exists gear_set_items_status_check;
alter table gear_set_items
  add constraint gear_set_items_status_check check (status is null or status in ('packed','worn','consumable','optional'));
