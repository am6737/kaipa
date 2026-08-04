-- Optional profile image for a journey participant.
alter table companions add column if not exists avatar_url text;
