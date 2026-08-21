-- Durable state for the Kaipa in-app agent.

create table if not exists agent_threads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  current_journey_id text references journeys(id) on delete set null,
  title text not null default '新对话',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table agent_threads add column if not exists current_journey_id text references journeys(id) on delete set null;

create table if not exists agent_session_items (
  id bigint generated always as identity primary key,
  thread_id uuid not null references agent_threads(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  item jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists agent_session_items_thread_idx on agent_session_items(thread_id, id);

create table if not exists agent_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references agent_threads(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  ui jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
alter table agent_messages add column if not exists ui jsonb not null default '{}'::jsonb;
create index if not exists agent_messages_thread_idx on agent_messages(thread_id, created_at);

create table if not exists agent_runs (
  id uuid primary key,
  thread_id uuid not null references agent_threads(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  status text not null check (status in ('running', 'pending_approval', 'completed', 'failed')),
  state text,
  pending_approvals jsonb not null default '[]'::jsonb,
  approval_decisions jsonb not null default '[]'::jsonb,
  final_output text,
  error text,
  agent_version text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists agent_runs_thread_idx on agent_runs(thread_id, created_at desc);
create unique index if not exists agent_runs_thread_active_unique
  on agent_runs(thread_id) where status in ('running', 'pending_approval');

create table if not exists agent_tool_calls (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references agent_runs(id) on delete cascade,
  thread_id uuid not null references agent_threads(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  tool_name text not null,
  arguments jsonb not null,
  arguments_hash text not null,
  status text not null check (status in ('running', 'completed', 'failed')),
  output jsonb,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (run_id, tool_name, arguments_hash)
);

alter table agent_threads enable row level security;
alter table agent_session_items enable row level security;
alter table agent_messages enable row level security;
alter table agent_runs enable row level security;
alter table agent_tool_calls enable row level security;

drop policy if exists "agent_threads_own" on agent_threads;
create policy "agent_threads_own" on agent_threads for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "agent_session_items_own" on agent_session_items;
create policy "agent_session_items_own" on agent_session_items for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "agent_messages_own" on agent_messages;
create policy "agent_messages_own" on agent_messages for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "agent_runs_own" on agent_runs;
create policy "agent_runs_own" on agent_runs for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "agent_tool_calls_own" on agent_tool_calls;
create policy "agent_tool_calls_own" on agent_tool_calls for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
