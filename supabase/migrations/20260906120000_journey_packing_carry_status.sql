-- Preserve how each checklist item's weight contributes to packing totals.
alter table if exists journey_packing_items
  add column if not exists carry_status text
  check (carry_status in ('packed', 'worn', 'consumable', 'optional'));
