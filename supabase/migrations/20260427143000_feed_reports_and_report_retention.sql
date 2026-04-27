-- WithU feed reports and admin report retention.
-- Reports solved/dismissed more than 60 days ago should not stay in admin forever.

alter table public.reports add column if not exists reported_profile_id uuid references auth.users(id) on delete set null;
alter table public.reports add column if not exists target_user_id uuid references auth.users(id) on delete set null;
alter table public.reports add column if not exists source text not null default 'app';
alter table public.reports add column if not exists reason text not null default 'Rapport';
alter table public.reports add column if not exists details text;
alter table public.reports add column if not exists status text not null default 'open';
alter table public.reports add column if not exists updated_at timestamptz not null default now();

create index if not exists reports_status_updated_idx
  on public.reports(status, updated_at desc);

create or replace function public.touch_reports_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_reports_touch_updated_at on public.reports;
create trigger trg_reports_touch_updated_at
before update on public.reports
for each row execute function public.touch_reports_updated_at();

create or replace function public.cleanup_old_closed_reports()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  deleted_count integer;
begin
  delete from public.reports
  where status in ('resolved', 'dismissed')
    and coalesce(updated_at, created_at) < now() - interval '60 days';

  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;

-- Run manually when needed:
-- select public.cleanup_old_closed_reports();
