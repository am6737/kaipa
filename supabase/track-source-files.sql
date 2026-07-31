alter table routes add column if not exists track_file_url text;
alter table routes add column if not exists track_file_name text;
alter table journeys add column if not exists track_file_url text;
alter table journeys add column if not exists track_file_name text;
