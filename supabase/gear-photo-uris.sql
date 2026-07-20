-- Run this once for existing databases that were created before photo support.
alter table gear_items add column if not exists photo_uris jsonb;
