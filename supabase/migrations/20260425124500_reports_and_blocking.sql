create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid references auth.users(id) on delete set null,
  reported_user_id uuid references auth.users(id) on delete set null,
  reported_profile_id uuid references auth.users(id) on delete set null,
  target_user_id uuid references auth.users(id) on delete set null,
  source text not null default 'app',
  reason text not null default 'Rapport',
  details text,
  conversation_id text,
  admin_note text,
  status text not null default 'open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint reports_status_check check (status in ('open', 'in_progress', 'resolved', 'dismissed'))
);

alter table public.reports add column if not exists reported_profile_id uuid references auth.users(id) on delete set null;
alter table public.reports add column if not exists target_user_id uuid references auth.users(id) on delete set null;
alter table public.reports add column if not exists source text not null default 'app';
alter table public.reports add column if not exists reason text not null default 'Rapport';
alter table public.reports add column if not exists details text;
alter table public.reports add column if not exists conversation_id text;
alter table public.reports add column if not exists admin_note text;
alter table public.reports add column if not exists status text not null default 'open';
alter table public.reports add column if not exists updated_at timestamptz not null default now();

create index if not exists reports_status_created_idx
  on public.reports(status, created_at desc);

create index if not exists reports_reported_user_idx
  on public.reports(reported_user_id, created_at desc);

create table if not exists public.blocked_users (
  id uuid primary key default gen_random_uuid(),
  blockerad_av uuid not null references auth.users(id) on delete cascade,
  blockerad uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint blocked_users_not_self check (blockerad_av <> blockerad)
);

create unique index if not exists blocked_users_unique_pair_idx
  on public.blocked_users(blockerad_av, blockerad);

alter table public.reports enable row level security;
alter table public.blocked_users enable row level security;

drop policy if exists "Users can create own reports" on public.reports;
create policy "Users can create own reports"
on public.reports for insert
with check (auth.uid() = reporter_id);

drop policy if exists "Users can read own reports" on public.reports;
create policy "Users can read own reports"
on public.reports for select
using (auth.uid() = reporter_id);

drop policy if exists "Admins can manage reports" on public.reports;
create policy "Admins can manage reports"
on public.reports for all
using (exists (select 1 from public.admins a where a.user_id = auth.uid()))
with check (exists (select 1 from public.admins a where a.user_id = auth.uid()));

drop policy if exists "Users can read own blocks" on public.blocked_users;
create policy "Users can read own blocks"
on public.blocked_users for select
using (auth.uid() = blockerad_av or auth.uid() = blockerad);

drop policy if exists "Users can create own blocks" on public.blocked_users;
create policy "Users can create own blocks"
on public.blocked_users for insert
with check (auth.uid() = blockerad_av);

drop policy if exists "Users can delete own blocks" on public.blocked_users;
create policy "Users can delete own blocks"
on public.blocked_users for delete
using (auth.uid() = blockerad_av);
