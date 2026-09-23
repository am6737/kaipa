-- Optional description for gear sets.
-- Run this once against an existing Supabase project.
alter table gear_sets
  add column if not exists description text;
