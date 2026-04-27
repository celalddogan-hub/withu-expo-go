-- WithU admin profile visibility and support overview.
-- Admin accounts should be able to help users, but should not appear as normal discoverable profiles.

create table if not exists public.admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.admins add column if not exists role text not null default 'admin';
alter table public.admins add column if not exists display_name text;
alter table public.admins add column if not exists is_active boolean not null default true;
alter table public.admins add column if not exists updated_at timestamptz not null default now();

alter table public.admins drop constraint if exists admins_role_check;
alter table public.admins
  add constraint admins_role_check
  check (role in ('owner', 'admin', 'moderator'));

alter table public.profiles add column if not exists is_discoverable boolean not null default true;

create or replace function public.is_active_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.admins a
    where a.user_id = auth.uid()
      and coalesce(a.is_active, true) = true
  );
$$;

create or replace function public.hide_admin_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(new.is_active, true) = true then
    update public.profiles
    set is_discoverable = false,
        updated_at = now()
    where id = new.user_id;
  end if;

  return new;
end;
$$;

drop trigger if exists hide_admin_profile_trigger on public.admins;
create trigger hide_admin_profile_trigger
after insert or update of is_active on public.admins
for each row
execute function public.hide_admin_profile();

update public.profiles p
set is_discoverable = false,
    updated_at = now()
where exists (
  select 1
  from public.admins a
  where a.user_id = p.id
    and coalesce(a.is_active, true) = true
);

alter table public.admins enable row level security;

drop policy if exists "Users can read own admin status" on public.admins;
create policy "Users can read own admin status"
on public.admins
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "Admins can read admins" on public.admins;
create policy "Admins can read admins"
on public.admins
for select
to authenticated
using (public.is_active_admin());

drop policy if exists "Admins can read profiles" on public.profiles;
create policy "Admins can read profiles"
on public.profiles
for select
to authenticated
using (public.is_active_admin());

-- Add exactly three admins by replacing the emails below, then run this in SQL Editor.
-- Keep the owner as 'owner' and the two helpers as 'admin' or 'moderator'.
--
-- insert into public.admins (user_id, role, display_name, is_active)
-- select id, role, display_name, true
-- from (
--   values
--     ('owner@example.com', 'owner', 'Owner'),
--     ('admin1@example.com', 'admin', 'Admin 1'),
--     ('admin2@example.com', 'admin', 'Admin 2')
-- ) as wanted(email, role, display_name)
-- join auth.users u on lower(u.email) = lower(wanted.email)
-- on conflict (user_id) do update
-- set role = excluded.role,
--     display_name = excluded.display_name,
--     is_active = true,
--     updated_at = now();
