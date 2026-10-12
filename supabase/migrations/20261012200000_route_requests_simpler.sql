-- Route requests become a free-form ask: one text box plus optional
-- attachments (screenshots or track files). A request can therefore arrive
-- without any coordinates, and the body may be longer than a route name.
alter table public.route_requests alter column lng drop not null;
alter table public.route_requests alter column lat drop not null;
alter table public.route_requests alter column name set not null;
alter table public.route_requests drop constraint if exists route_requests_name_check;
alter table public.route_requests add constraint route_requests_name_check check (length(trim(name)) between 1 and 500);
alter table public.route_requests add column if not exists attachments jsonb;
comment on column public.route_requests.attachments is
  'User-attached file URLs: [{url,name,mime}]. Images and track files, storage-hosted.';
