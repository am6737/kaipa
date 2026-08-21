-- Persist user avatars uploaded to the public kaipa Storage bucket.
alter table profiles add column if not exists avatar_url text;
