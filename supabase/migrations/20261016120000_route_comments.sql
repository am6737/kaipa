begin;

-- 路线评论：替代「近期实况」。实况从未填写路段，到访时间恒等于发布时间，本质上就是
-- 带媒体的评论，却缺少回复。这里改为先发后审：评论发布即可见，用户可举报，
-- 3 人举报自动隐藏，管理员在后台恢复或删除。
--
-- 结构：顶层评论（文字 + 最多 9 个媒体）+ 一级回复（仅文字，parent_id 指向顶层，
-- reply_to_user_id 记录 @ 的对象）。

create table if not exists public.route_comments (
  id uuid primary key default gen_random_uuid(),
  route_id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  parent_id uuid references public.route_comments(id) on delete cascade,
  reply_to_user_id uuid references auth.users(id) on delete set null,
  author_name text not null default '',
  body text not null default '',
  media jsonb not null default '[]'::jsonb,
  -- visible：正常展示；hidden：被举报自动隐藏或管理员下架，任何用户都看不到；
  -- deleted：作者删除了仍有回复的顶层评论，保留占位让楼中楼不断层。
  status text not null default 'visible' check (status in ('visible', 'hidden', 'deleted')),
  like_count integer not null default 0 check (like_count >= 0),
  reply_count integer not null default 0 check (reply_count >= 0),
  report_count integer not null default 0 check (report_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint route_comments_body_length check (length(body) <= 500),
  constraint route_comments_media_count check (jsonb_typeof(media) = 'array' and jsonb_array_length(media) <= 9),
  constraint route_comments_content check (status = 'deleted' or length(trim(body)) > 0 or jsonb_array_length(media) > 0),
  constraint route_comments_reply_text_only check (parent_id is null or jsonb_array_length(media) = 0)
);

create index if not exists route_comments_route_idx on public.route_comments(route_id, created_at desc) where parent_id is null;
create index if not exists route_comments_parent_idx on public.route_comments(parent_id, created_at) where parent_id is not null;
create index if not exists route_comments_user_idx on public.route_comments(user_id, created_at desc);

create table if not exists public.route_comment_likes (
  comment_id uuid not null references public.route_comments(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (comment_id, user_id)
);

create table if not exists public.route_comment_reports (
  comment_id uuid not null references public.route_comments(id) on delete cascade,
  reporter_id uuid not null references auth.users(id) on delete cascade,
  reason text not null check (reason in ('spam', 'false_info', 'abuse', 'other')),
  created_at timestamptz not null default now(),
  -- 管理员处理（恢复或确认隐藏）后置位；已处理的举报不再计入自动隐藏。
  resolved_at timestamptz,
  primary key (comment_id, reporter_id)
);

alter table public.route_comments enable row level security;
alter table public.route_comment_likes enable row level security;
alter table public.route_comment_reports enable row level security;

drop policy if exists route_comments_read on public.route_comments;
create policy route_comments_read on public.route_comments for select to anon, authenticated
  using (status in ('visible', 'deleted'));

-- 计数、状态由触发器和 RPC 维护；客户端只能以自己的身份插入可见的新评论。
drop policy if exists route_comments_insert on public.route_comments;
create policy route_comments_insert on public.route_comments for insert to authenticated
  with check (user_id = auth.uid() and status = 'visible');

-- 本库默认权限会给 anon/authenticated 全部表权限；这里收窄为只读 + 插入，写操作只走 RPC。
revoke all on public.route_comments, public.route_comment_likes, public.route_comment_reports from anon, authenticated;
grant all on public.route_comments, public.route_comment_likes, public.route_comment_reports to service_role;
grant select on public.route_comments to anon, authenticated;
grant insert on public.route_comments to authenticated;

grant select on public.route_comment_likes to anon, authenticated;
drop policy if exists route_comment_likes_read_own on public.route_comment_likes;
create policy route_comment_likes_read_own on public.route_comment_likes for select to authenticated
  using (user_id = auth.uid());

-- ── 插入前校验：回复只挂在同一路线的可见顶层评论下；限流 ──
create or replace function public.route_comments_before_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  parent public.route_comments%rowtype;
begin
  new.like_count := 0;
  new.reply_count := 0;
  new.report_count := 0;
  new.body := trim(new.body);

  if new.parent_id is not null then
    select * into parent from public.route_comments where id = new.parent_id;
    if not found or parent.parent_id is not null or parent.route_id <> new.route_id or parent.status = 'hidden' then
      raise exception 'reply parent not found';
    end if;
    -- 只能 @ 楼主或楼内回复过的人，防止借回复骚扰无关用户。
    if new.reply_to_user_id is not null and new.reply_to_user_id <> parent.user_id and not exists (
      select 1 from public.route_comments r
       where r.parent_id = parent.id and r.user_id = new.reply_to_user_id
    ) then
      new.reply_to_user_id := null;
    end if;
  else
    new.reply_to_user_id := null;
  end if;

  -- 先发后审下的基础防刷：同一用户 10 分钟内最多 20 条。
  if auth.uid() is not null and (
    select count(*) from public.route_comments
     where user_id = new.user_id and created_at > now() - interval '10 minutes'
  ) >= 20 then
    raise exception 'comment rate limited';
  end if;

  return new;
end $$;

drop trigger if exists route_comments_before_insert on public.route_comments;
create trigger route_comments_before_insert before insert on public.route_comments
  for each row execute function public.route_comments_before_insert();

-- ── 顶层评论的可见回复数 ──
create or replace function public.route_comments_sync_reply_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  parent uuid := coalesce(new.parent_id, old.parent_id);
begin
  if parent is null then
    return null;
  end if;
  update public.route_comments
     set reply_count = (select count(*) from public.route_comments r where r.parent_id = parent and r.status = 'visible')
   where id = parent;
  return null;
end $$;

drop trigger if exists route_comments_sync_reply_count on public.route_comments;
create trigger route_comments_sync_reply_count after insert or delete or update of status on public.route_comments
  for each row execute function public.route_comments_sync_reply_count();

-- ── 回复通知：楼主 + 被 @ 的人（跳过自己，不做 24 小时合并，推送端有 5 分钟频控） ──
create or replace function public.notify_route_comment(
  p_recipient uuid,
  p_actor     uuid,
  p_kind      text,
  p_verb      text,
  p_target    text,
  p_target_id text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  actor public.profiles%rowtype;
begin
  if p_recipient is null or p_actor is null or p_recipient = p_actor then
    return;
  end if;
  if not exists (select 1 from public.profiles where id = p_recipient) then
    return;
  end if;
  select * into actor from public.profiles where id = p_actor;
  if not found then
    actor.id := null;
  end if;
  insert into public.notifications (
    user_id, actor_user_id, kind, cat, bucket, time, who, avatar, color, verb,
    target, target_id, action, created_at
  ) values (
    p_recipient, actor.id, p_kind, 'social', 'today', '刚刚',
    coalesce(nullif(trim(actor.display_name), ''), nullif(trim(actor.nick), ''), '有人'),
    nullif(actor.avatar_url, ''), null, p_verb,
    nullif(trim(coalesce(p_target, '')), ''), p_target_id, '查看', now()
  );
end $$;

revoke all on function public.notify_route_comment(uuid, uuid, text, text, text, text) from public;

create or replace function public.route_comments_notify_reply()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  parent_author uuid;
  route_name text;
begin
  if new.parent_id is null then
    return null;
  end if;
  select user_id into parent_author from public.route_comments where id = new.parent_id;
  select name into route_name from public.routes where id = new.route_id;
  perform public.notify_route_comment(parent_author, new.user_id, 'comment_reply', '回复了你在这条路线的评论', route_name, new.route_id);
  if new.reply_to_user_id is not null and new.reply_to_user_id is distinct from parent_author then
    perform public.notify_route_comment(new.reply_to_user_id, new.user_id, 'comment_reply', '回复了你', route_name, new.route_id);
  end if;
  return null;
end $$;

drop trigger if exists route_comments_notify_reply on public.route_comments;
create trigger route_comments_notify_reply after insert on public.route_comments
  for each row execute function public.route_comments_notify_reply();

-- ── 点赞（切换） ──
create or replace function public.toggle_route_comment_like(p_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  target public.route_comments%rowtype;
  route_name text;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;
  select * into target from public.route_comments where id = p_id and status = 'visible' for update;
  if not found then
    raise exception 'comment not found';
  end if;

  delete from public.route_comment_likes where comment_id = p_id and user_id = auth.uid();
  if found then
    update public.route_comments set like_count = greatest(0, like_count - 1) where id = p_id;
    return false;
  end if;

  insert into public.route_comment_likes (comment_id, user_id) values (p_id, auth.uid());
  update public.route_comments set like_count = like_count + 1 where id = p_id;
  select name into route_name from public.routes where id = target.route_id;
  perform public.notify_helpful(target.user_id, auth.uid(), 'comment_like', '赞了你在这条路线的评论', route_name, target.route_id);
  return true;
end $$;

revoke all on function public.toggle_route_comment_like(uuid) from public;
grant execute on function public.toggle_route_comment_like(uuid) to authenticated;

-- ── 作者删除：有回复的顶层评论留占位，其余直接删除；占位下最后一条回复删掉时一并清理 ──
create or replace function public.delete_route_comment(p_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  target public.route_comments%rowtype;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;
  select * into target from public.route_comments where id = p_id and user_id = auth.uid() and status <> 'deleted' for update;
  if not found then
    raise exception 'comment not found';
  end if;

  if target.parent_id is null and exists (
    select 1 from public.route_comments where parent_id = p_id and status = 'visible'
  ) then
    update public.route_comments
       set status = 'deleted', body = '', media = '[]'::jsonb, updated_at = now()
     where id = p_id;
    return 'tombstoned';
  end if;

  delete from public.route_comments where id = p_id;
  if target.parent_id is not null then
    delete from public.route_comments p
     where p.id = target.parent_id and p.status = 'deleted'
       and not exists (select 1 from public.route_comments r where r.parent_id = p.id and r.status = 'visible');
  end if;
  return 'deleted';
end $$;

revoke all on function public.delete_route_comment(uuid) from public;
grant execute on function public.delete_route_comment(uuid) to authenticated;

-- ── 举报：同一人对同一条只算一次；未处理举报达到 3 人自动隐藏 ──
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
  if target.user_id = auth.uid() then
    raise exception 'cannot report own comment';
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

-- ── 迁移近期实况：保留 id、媒体、点赞与时间；被拒绝的转为隐藏 ──
-- 待审核的实况按新的先发后审规则直接可见，管理员仍可在后台下架。
alter table public.route_comments disable trigger route_comments_before_insert;
alter table public.route_comments disable trigger route_comments_notify_reply;

insert into public.route_comments (id, route_id, user_id, author_name, body, media, status, like_count, created_at, updated_at)
select o.id, o.route_id, o.user_id, o.author_name, left(trim(o.body), 500),
       case when jsonb_typeof(o.media) = 'array' and jsonb_array_length(o.media) <= 9 then o.media else '[]'::jsonb end,
       case when o.moderation_status = 'rejected' then 'hidden' else 'visible' end,
       o.helpful_count, o.created_at, o.updated_at
  from public.route_observations o
 where length(trim(o.body)) > 0 or (jsonb_typeof(o.media) = 'array' and jsonb_array_length(o.media) between 1 and 9)
on conflict (id) do nothing;

insert into public.route_comment_likes (comment_id, user_id, created_at)
select v.observation_id, v.user_id, v.created_at
  from public.route_observation_helpful_votes v
  join public.route_comments c on c.id = v.observation_id
on conflict do nothing;

update public.route_comments c
   set like_count = (select count(*) from public.route_comment_likes l where l.comment_id = c.id)
 where c.id in (select id from public.route_observations);

alter table public.route_comments enable trigger route_comments_before_insert;
alter table public.route_comments enable trigger route_comments_notify_reply;

-- 过渡期：未更新的客户端仍写 route_observations，同步成顶层评论，删除时一并删除。
-- 所有客户端通过 OTA 升级后再删除旧表和这两个触发器。
create or replace function public.route_observations_forward_to_comments()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    delete from public.route_comments where id = old.id and parent_id is null;
    return null;
  end if;
  insert into public.route_comments (id, route_id, user_id, author_name, body, media, created_at, updated_at)
  values (new.id, new.route_id, new.user_id, new.author_name, left(trim(new.body), 500), new.media, new.created_at, new.updated_at)
  on conflict (id) do nothing;
  return null;
end $$;

drop trigger if exists route_observations_forward_to_comments on public.route_observations;
create trigger route_observations_forward_to_comments after insert or delete on public.route_observations
  for each row execute function public.route_observations_forward_to_comments();

-- 旧客户端的发布会被旧表的审核规则挡住，过渡期按先发后审直接通过。
alter table public.route_observations alter column moderation_status set default 'approved';

-- 「路线实况审核」开关不再有作用。
delete from public.feature_controls where key = 'route_condition_moderation';

notify pgrst, 'reload schema';
commit;
