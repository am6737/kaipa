-- Structured details for journey checklist items.
alter table if exists journey_packing_items add column if not exists weight_estimated boolean;
alter table if exists journey_packing_items add column if not exists carry_status text check (carry_status in ('packed', 'worn', 'consumable', 'optional'));
alter table if exists journey_packing_items add column if not exists attrs jsonb;
