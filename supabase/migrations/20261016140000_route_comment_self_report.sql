-- 作者也可以举报自己的评论（例如账号被盗或误发），仍按每人一次计入。
begin;

create or replace function public.report_route_comment(p_id uuid, p_reason text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  target public.route_comments%rowtype;
  open_reports integer;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;
  if p_reason not in ('spam', 'false_info', 'abuse', 'other') then
    raise exception 'invalid report reason';
  end if;
  select * into target from public.route_comments where id = p_id and status = 'visible' for update;
  if not found then
    raise exception 'comment not found';
  end if;

  insert into public.route_comment_reports (comment_id, reporter_id, reason)
  values (p_id, auth.uid(), p_reason)
  on conflict (comment_id, reporter_id) do nothing;
  if not found then
    return false;
  end if;

  select count(*) into open_reports from public.route_comment_reports where comment_id = p_id and resolved_at is null;
  update public.route_comments
     set report_count = report_count + 1,
         status = case when open_reports >= 3 then 'hidden' else status end,
         updated_at = now()
   where id = p_id;
  return true;
end $$;

revoke all on function public.report_route_comment(uuid, text) from public;
grant execute on function public.report_route_comment(uuid, text) to authenticated;

commit;
