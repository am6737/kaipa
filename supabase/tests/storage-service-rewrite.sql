-- In-place rewrites by the service role (media scrubber) skip the upload
-- ticket; client rewrites still need one. Runs in a transaction that rolls back.
begin;

create function pg_temp.check(ok boolean, message text) returns void language plpgsql as $$
begin if not ok then raise exception 'storage-service-rewrite: %', message; end if; end $$;

select set_config('test.object', (select o.id::text from storage.objects o
  join public.resource_file_accounts a on a.bucket=o.bucket_id and a.path=o.name
  where o.bucket_id='kaipa' and o.name like 'moments/%' and a.ticket_id is not null and o.metadata->>'size' is not null
  order by o.created_at desc limit 1), true);
select pg_temp.check(current_setting('test.object') <> '', 'no ticketed media object to test with');
select set_config('test.ticket', (select a.ticket_id::text from public.resource_file_accounts a join storage.objects o
  on a.bucket=o.bucket_id and a.path=o.name where o.id=current_setting('test.object')::uuid), true);

-- Without the service role the ticket check still applies. (Run under the
-- test's own role: as `authenticated`, storage RLS would hide the row and the
-- trigger would never fire.)
select set_config('request.jwt.claims', '{"role":"authenticated"}', true);
do $$ begin
  begin
    update storage.objects set metadata = metadata || '{"size": 1}'::jsonb where id = current_setting('test.object')::uuid;
    raise exception 'client rewrite was allowed';
  exception when others then
    if sqlerrm = 'client rewrite was allowed' then raise; end if;
    perform pg_temp.check(sqlerrm ~ 'ticket', 'unexpected error: ' || sqlerrm);
  end;
end $$;

-- The service role can, and only the size is re-accounted.
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
update storage.objects set metadata = metadata || '{"size": 12345}'::jsonb where id = current_setting('test.object')::uuid;
reset role;
select pg_temp.check((select bytes = 12345 and ticket_id::text = current_setting('test.ticket')
  from public.resource_file_accounts a join storage.objects o on a.bucket=o.bucket_id and a.path=o.name
  where o.id = current_setting('test.object')::uuid), 'size not re-accounted or ticket lost');

rollback;
