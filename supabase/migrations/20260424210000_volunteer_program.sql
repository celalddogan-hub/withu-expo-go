create extension if not exists pgcrypto;

create table if not exists public.admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.volunteer_applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  role_sv text not null default '',
  role_en text not null default '',
  role_ru text not null default '',
  bio_sv text not null default '',
  bio_en text not null default '',
  bio_ru text not null default '',
  tags text[] not null default '{}',
  age_groups text[] not null default '{}',
  weekly_hours integer not null default 2 check (weekly_hours between 1 and 40),
  guidelines_accepted boolean not null default false,
  admin_note text,
  rejection_reason text,
  submitted_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

create index if not exists volunteer_applications_user_id_idx
  on public.volunteer_applications(user_id);

create index if not exists volunteer_applications_status_idx
  on public.volunteer_applications(status, submitted_at desc);

create table if not exists public.volunteer_application_documents (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.volunteer_applications(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  doc_type text not null check (
    doc_type in (
      'criminal_record_extract',
      'education_certificate',
      'work_certificate',
      'volunteer_certificate',
      'other'
    )
  ),
  file_name text not null,
  storage_path text not null,
  mime_type text not null,
  file_size_bytes bigint not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists volunteer_application_documents_application_id_idx
  on public.volunteer_application_documents(application_id);

create table if not exists public.volunteer_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  application_id uuid references public.volunteer_applications(id) on delete set null,
  role_sv text not null default 'Volontar',
  role_en text,
  role_ru text,
  bio_sv text,
  bio_en text,
  bio_ru text,
  tags text[] not null default '{}',
  age_groups text[] not null default '{}',
  weekly_hours integer not null default 2 check (weekly_hours between 1 and 40),
  is_active boolean not null default true,
  total_sessions integer not null default 0,
  rating_count integer not null default 0,
  rating_average numeric(3,2) not null default 0,
  approved_at timestamptz not null default now(),
  approved_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

create index if not exists volunteer_profiles_active_idx
  on public.volunteer_profiles(is_active, approved_at desc);

create table if not exists public.volunteer_availability (
  id uuid primary key default gen_random_uuid(),
  volunteer_user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'active' check (status in ('active', 'ended', 'cancelled')),
  title text,
  message text,
  active_from timestamptz not null default now(),
  active_until timestamptz not null,
  max_pending_requests integer not null default 5 check (max_pending_requests between 1 and 20),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists volunteer_availability_live_idx
  on public.volunteer_availability(status, active_until desc);

create index if not exists volunteer_availability_volunteer_idx
  on public.volunteer_availability(volunteer_user_id, status);

create table if not exists public.volunteer_support_requests (
  id uuid primary key default gen_random_uuid(),
  availability_id uuid not null references public.volunteer_availability(id) on delete cascade,
  volunteer_user_id uuid not null references auth.users(id) on delete cascade,
  requester_user_id uuid not null references auth.users(id) on delete cascade,
  intro_message text,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'cancelled')),
  conversation_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint volunteer_support_not_self check (volunteer_user_id <> requester_user_id)
);

create index if not exists volunteer_support_requests_requester_idx
  on public.volunteer_support_requests(requester_user_id, created_at desc);

create index if not exists volunteer_support_requests_volunteer_idx
  on public.volunteer_support_requests(volunteer_user_id, status, created_at desc);

create unique index if not exists volunteer_support_one_open_request_idx
  on public.volunteer_support_requests(availability_id, requester_user_id)
  where status in ('pending', 'accepted');

create or replace view public.active_volunteers_now as
select
  va.id as availability_id,
  va.volunteer_user_id,
  va.status,
  va.title,
  va.message,
  va.active_from,
  va.active_until,
  va.max_pending_requests,
  coalesce(p.name, 'Volontar') as name,
  p.city,
  p.avatar_emoji,
  p.is_bankid_verified,
  vp.role_sv,
  (
    select count(*)::integer
    from public.volunteer_support_requests vsr
    where vsr.availability_id = va.id
      and vsr.status = 'pending'
  ) as pending_requests
from public.volunteer_availability va
join public.volunteer_profiles vp
  on vp.user_id = va.volunteer_user_id
 and vp.is_active = true
left join public.profiles p
  on p.id = va.volunteer_user_id
where va.status = 'active'
  and va.active_until > now();

create or replace view public.active_volunteers_view as
select
  vp.user_id,
  vp.application_id,
  vp.role_sv,
  vp.bio_sv,
  vp.tags,
  vp.age_groups,
  vp.weekly_hours,
  vp.is_active,
  exists (
    select 1
    from public.volunteer_availability va
    where va.volunteer_user_id = vp.user_id
      and va.status = 'active'
      and va.active_until > now()
  ) as available_now,
  (
    select va.active_until
    from public.volunteer_availability va
    where va.volunteer_user_id = vp.user_id
      and va.status = 'active'
      and va.active_until > now()
    order by va.created_at desc
    limit 1
  ) as available_until,
  vp.total_sessions,
  vp.rating_count,
  vp.rating_average,
  vp.approved_at,
  p.name,
  case
    when p.birth_year is not null then extract(year from age(make_date(p.birth_year, 1, 1)))::integer
    else null
  end as age,
  p.city,
  p.avatar_url,
  p.avatar_emoji,
  p.is_bankid_verified
from public.volunteer_profiles vp
left join public.profiles p
  on p.id = vp.user_id
where vp.is_active = true;

grant select on public.active_volunteers_now to authenticated;
grant select on public.active_volunteers_view to authenticated;

alter table public.volunteer_applications enable row level security;
alter table public.volunteer_application_documents enable row level security;
alter table public.volunteer_profiles enable row level security;
alter table public.volunteer_availability enable row level security;
alter table public.volunteer_support_requests enable row level security;
alter table public.admins enable row level security;

drop policy if exists "Users can read own admin status" on public.admins;

create policy "Users can read own admin status"
on public.admins for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "Users can read own volunteer applications" on public.volunteer_applications;
drop policy if exists "Users can create own volunteer applications" on public.volunteer_applications;
drop policy if exists "Users can update own pending volunteer applications" on public.volunteer_applications;
drop policy if exists "Admins can manage volunteer applications" on public.volunteer_applications;

create policy "Users can read own volunteer applications"
on public.volunteer_applications for select
to authenticated
using (user_id = auth.uid());

create policy "Users can create own volunteer applications"
on public.volunteer_applications for insert
to authenticated
with check (user_id = auth.uid() and status = 'pending');

create policy "Users can update own pending volunteer applications"
on public.volunteer_applications for update
to authenticated
using (user_id = auth.uid() and status = 'pending')
with check (user_id = auth.uid());

create policy "Admins can manage volunteer applications"
on public.volunteer_applications for all
to authenticated
using (exists (select 1 from public.admins a where a.user_id = auth.uid()))
with check (exists (select 1 from public.admins a where a.user_id = auth.uid()));

drop policy if exists "Users can read own volunteer documents" on public.volunteer_application_documents;
drop policy if exists "Users can create own volunteer documents" on public.volunteer_application_documents;
drop policy if exists "Users can delete own volunteer documents" on public.volunteer_application_documents;
drop policy if exists "Admins can read volunteer documents" on public.volunteer_application_documents;

create policy "Users can read own volunteer documents"
on public.volunteer_application_documents for select
to authenticated
using (user_id = auth.uid());

create policy "Users can create own volunteer documents"
on public.volunteer_application_documents for insert
to authenticated
with check (user_id = auth.uid());

create policy "Users can delete own volunteer documents"
on public.volunteer_application_documents for delete
to authenticated
using (user_id = auth.uid());

create policy "Admins can read volunteer documents"
on public.volunteer_application_documents for select
to authenticated
using (exists (select 1 from public.admins a where a.user_id = auth.uid()));

drop policy if exists "Authenticated users can read volunteer profiles" on public.volunteer_profiles;
drop policy if exists "Admins can manage volunteer profiles" on public.volunteer_profiles;

create policy "Authenticated users can read volunteer profiles"
on public.volunteer_profiles for select
to authenticated
using (is_active = true or user_id = auth.uid() or exists (select 1 from public.admins a where a.user_id = auth.uid()));

create policy "Admins can manage volunteer profiles"
on public.volunteer_profiles for all
to authenticated
using (exists (select 1 from public.admins a where a.user_id = auth.uid()))
with check (exists (select 1 from public.admins a where a.user_id = auth.uid()));

drop policy if exists "Authenticated users can read volunteer availability" on public.volunteer_availability;
drop policy if exists "Approved volunteers can create own availability" on public.volunteer_availability;
drop policy if exists "Volunteers can update own availability" on public.volunteer_availability;
drop policy if exists "Admins can manage volunteer availability" on public.volunteer_availability;

create policy "Authenticated users can read volunteer availability"
on public.volunteer_availability for select
to authenticated
using (true);

create policy "Approved volunteers can create own availability"
on public.volunteer_availability for insert
to authenticated
with check (
  volunteer_user_id = auth.uid()
  and exists (
    select 1
    from public.volunteer_profiles vp
    where vp.user_id = auth.uid()
      and vp.is_active = true
  )
);

create policy "Volunteers can update own availability"
on public.volunteer_availability for update
to authenticated
using (volunteer_user_id = auth.uid())
with check (volunteer_user_id = auth.uid());

create policy "Admins can manage volunteer availability"
on public.volunteer_availability for all
to authenticated
using (exists (select 1 from public.admins a where a.user_id = auth.uid()))
with check (exists (select 1 from public.admins a where a.user_id = auth.uid()));

drop policy if exists "Users can read own volunteer support requests" on public.volunteer_support_requests;
drop policy if exists "Users can create volunteer support requests" on public.volunteer_support_requests;
drop policy if exists "Volunteers can answer own support requests" on public.volunteer_support_requests;
drop policy if exists "Admins can read volunteer support requests" on public.volunteer_support_requests;

create policy "Users can read own volunteer support requests"
on public.volunteer_support_requests for select
to authenticated
using (requester_user_id = auth.uid() or volunteer_user_id = auth.uid());

create policy "Users can create volunteer support requests"
on public.volunteer_support_requests for insert
to authenticated
with check (
  requester_user_id = auth.uid()
  and requester_user_id <> volunteer_user_id
  and exists (
    select 1
    from public.volunteer_availability va
    where va.id = availability_id
      and va.volunteer_user_id = volunteer_user_id
      and va.status = 'active'
      and va.active_until > now()
  )
);

create policy "Volunteers can answer own support requests"
on public.volunteer_support_requests for update
to authenticated
using (volunteer_user_id = auth.uid())
with check (volunteer_user_id = auth.uid());

create policy "Admins can read volunteer support requests"
on public.volunteer_support_requests for select
to authenticated
using (exists (select 1 from public.admins a where a.user_id = auth.uid()));
