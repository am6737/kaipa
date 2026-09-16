-- Structured details for journey checklist items.
alter table if exists journey_packing_items add column if not exists weight_estimated boolean;
alter table if exists journey_packing_items add column if not exists attrs jsonb;
