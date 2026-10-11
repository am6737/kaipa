begin;

create function pg_temp.check(ok boolean, message text)
returns void language plpgsql as $$
begin
  if ok is distinct from true then raise exception '%', message; end if;
end $$;

do $$
declare
  user_a uuid;
  user_b uuid;
  request_a uuid := gen_random_uuid();
  request_b uuid := gen_random_uuid();
  request_pending uuid := gen_random_uuid();
  row_count integer;
begin
  select id into user_a from auth.users order by id limit 1;
  select id into user_b from auth.users where id <> user_a order by id limit 1;
  if user_a is null or user_b is null then
    raise notice 'route-requests RLS test skipped: requires two auth.users';
    return;
  end if;

  perform set_config('test.user_a', user_a::text, true);
  perform set_config('test.user_b', user_b::text, true);
  perform set_config('test.request_a', request_a::text, true);
  perform set_config('test.request_b', request_b::text, true);
  perform set_config('test.request_pending', request_pending::text, true);

  insert into public.route_requests (id, user_id, name, lng, lat, status)
  values (request_b, user_b, 'B request', 1, 1, 'pending');
  insert into public.route_requests (id, user_id, name, lng, lat, status)
  values (request_a, user_a, 'A accepted', 2, 2, 'accepted');
end $$;

set local role authenticated;
select set_config('request.jwt.claim.sub', current_setting('test.user_a'), true);

select pg_temp.check(not exists (
  select 1 from public.route_requests where id = current_setting('test.request_b')::uuid
), 'A can see B request');

do $$
begin
  begin
    insert into public.route_requests (user_id, name, lng, lat, status)
    values (current_setting('test.user_a')::uuid, 'Invalid accepted', 3, 3, 'accepted');
    raise exception 'A inserted a non-pending request';
  exception when insufficient_privilege then
    if sqlstate <> '42501' then raise; end if;
  end;
end $$;

insert into public.route_requests (id, user_id, name, lng, lat, status)
values (current_setting('test.request_pending')::uuid, current_setting('test.user_a')::uuid, 'A pending', 4, 4, 'pending');

do $$
declare row_count integer;
begin
  update public.route_requests set name = 'Changed' where id = current_setting('test.request_pending')::uuid;
  get diagnostics row_count = row_count;
  perform pg_temp.check(row_count = 0, 'A update affected a request');
  perform pg_temp.check((select name = 'A pending' from public.route_requests where id = current_setting('test.request_pending')::uuid), 'A request changed');
end $$;

do $$
declare row_count integer;
begin
  delete from public.route_requests where id = current_setting('test.request_b')::uuid;
  get diagnostics row_count = row_count;
  perform pg_temp.check(row_count = 0, 'A deleted B request');
  delete from public.route_requests where id = current_setting('test.request_a')::uuid;
  get diagnostics row_count = row_count;
  perform pg_temp.check(row_count = 0, 'A deleted accepted request');
  delete from public.route_requests where id = current_setting('test.request_pending')::uuid;
  get diagnostics row_count = row_count;
  perform pg_temp.check(row_count = 1, 'A could not delete pending request');
end $$;

rollback;
