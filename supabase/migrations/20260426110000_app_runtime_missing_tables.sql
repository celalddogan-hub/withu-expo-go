create extension if not exists pgcrypto;

-- Profile fields used by Profile, Hitta, Karta and volunteer views.
alter table public.profiles add column if not exists city text;
alter table public.profiles add column if not exists country text;
alter table public.profiles add column if not exists age integer;
alter table public.profiles add column if not exists bio text;
alter table public.profiles add column if not exists avatar_url text;
alter table public.profiles add column if not exists avatar_emoji text;
alter table public.profiles add column if not exists min_age integer default 18;
alter table public.profiles add column if not exists max_age integer default 99;
alter table public.profiles add column if not exists activities text[] default '{}';
alter table public.profiles add column if not exists is_profile_complete boolean not null default false;
alter table public.profiles add column if not exists is_bankid_verified boolean not null default false;
alter table public.profiles add column if not exists is_discoverable boolean not null default true;
alter table public.profiles add column if not exists updated_at timestamptz not null default now();

-- Keep the match action constraint compatible with both older test builds and the current app.
alter table public.matches drop constraint if exists matches_action_check;
alter table public.matches
  add constraint matches_action_check
  check (action in ('contact', 'like', 'superlike', 'want_to_talk', 'talk_request', 'join_activity'));

-- Current chat list hides conversations with conversation keys.
create table if not exists public.hidden_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  other_user_id uuid references auth.users(id) on delete cascade,
  conversation_key text not null,
  created_at timestamptz not null default now()
);

create unique index if not exists hidden_conversations_user_key_idx
  on public.hidden_conversations(user_id, conversation_key);

alter table public.hidden_conversations enable row level security;

drop policy if exists "Users can read own hidden conversations" on public.hidden_conversations;
create policy "Users can read own hidden conversations"
on public.hidden_conversations for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "Users can hide own conversations" on public.hidden_conversations;
create policy "Users can hide own conversations"
on public.hidden_conversations for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists "Users can unhide own conversations" on public.hidden_conversations;
create policy "Users can unhide own conversations"
on public.hidden_conversations for delete
to authenticated
using (user_id = auth.uid());

-- Legacy chat route still references hidden_chats. Keep it harmless and private.
create table if not exists public.hidden_chats (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  match_id text not null,
  created_at timestamptz not null default now()
);

create unique index if not exists hidden_chats_user_match_idx
  on public.hidden_chats(user_id, match_id);

alter table public.hidden_chats enable row level security;

drop policy if exists "Users can read own hidden chats" on public.hidden_chats;
create policy "Users can read own hidden chats"
on public.hidden_chats for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "Users can hide own chats" on public.hidden_chats;
create policy "Users can hide own chats"
on public.hidden_chats for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists "Users can delete own hidden chats" on public.hidden_chats;
create policy "Users can delete own hidden chats"
on public.hidden_chats for delete
to authenticated
using (user_id = auth.uid());

-- Nu screen: active 60-minute presence.
create table if not exists public.now_status (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  activity text not null default 'Bara prata',
  message text,
  city text,
  is_active boolean not null default true,
  expires_at timestamptz not null default (now() + interval '60 minutes'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists now_status_one_per_user_idx
  on public.now_status(user_id);

create index if not exists now_status_active_expires_idx
  on public.now_status(is_active, expires_at desc);

alter table public.now_status enable row level security;

drop policy if exists "Authenticated users can read active now statuses" on public.now_status;
create policy "Authenticated users can read active now statuses"
on public.now_status for select
to authenticated
using (
  is_active = true
  and expires_at > now()
);

drop policy if exists "Users can create own now status" on public.now_status;
create policy "Users can create own now status"
on public.now_status for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists "Users can update own now status" on public.now_status;
create policy "Users can update own now status"
on public.now_status for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

do $$
begin
  if to_regprocedure('public.withu_now_status_content_guard()') is not null then
    execute 'drop trigger if exists withu_now_status_content_guard on public.now_status';
    execute 'create trigger withu_now_status_content_guard
      before insert or update of message on public.now_status
      for each row execute function public.withu_now_status_content_guard()';
  end if;
end $$;

-- Volunteer contact requests: user asks a volunteer, volunteer can accept/decline.
create table if not exists public.volunteer_contact_requests (
  id uuid primary key default gen_random_uuid(),
  requester_user_id uuid not null references auth.users(id) on delete cascade,
  volunteer_user_id uuid not null references auth.users(id) on delete cascade,
  volunteer_application_id uuid,
  message text,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  accepted_at timestamptz,
  declined_at timestamptz,
  closed_at timestamptz,
  constraint volunteer_contact_not_self check (requester_user_id <> volunteer_user_id),
  constraint volunteer_contact_status_check check (status in ('pending', 'accepted', 'declined', 'closed'))
);

create index if not exists volunteer_contact_requester_idx
  on public.volunteer_contact_requests(requester_user_id, created_at desc);

create index if not exists volunteer_contact_volunteer_idx
  on public.volunteer_contact_requests(volunteer_user_id, created_at desc);

alter table public.volunteer_contact_requests enable row level security;

drop policy if exists "Users can read own volunteer contact requests" on public.volunteer_contact_requests;
create policy "Users can read own volunteer contact requests"
on public.volunteer_contact_requests for select
to authenticated
using (requester_user_id = auth.uid() or volunteer_user_id = auth.uid());

drop policy if exists "Users can create volunteer contact requests" on public.volunteer_contact_requests;
create policy "Users can create volunteer contact requests"
on public.volunteer_contact_requests for insert
to authenticated
with check (requester_user_id = auth.uid());

drop policy if exists "Volunteers can update own contact requests" on public.volunteer_contact_requests;
create policy "Volunteers can update own contact requests"
on public.volunteer_contact_requests for update
to authenticated
using (requester_user_id = auth.uid() or volunteer_user_id = auth.uid())
with check (requester_user_id = auth.uid() or volunteer_user_id = auth.uid());

do $$
begin
  if to_regprocedure('public.withu_volunteer_contact_content_guard()') is not null then
    execute 'drop trigger if exists withu_volunteer_contact_content_guard on public.volunteer_contact_requests';
    execute 'create trigger withu_volunteer_contact_content_guard
      before insert or update of message on public.volunteer_contact_requests
      for each row execute function public.withu_volunteer_contact_content_guard()';
  end if;
end $$;

-- Reports: add fields used by chat safety helpers and allow "in_review".
alter table public.reports add column if not exists conversation_key text;
alter table public.reports add column if not exists match_id text;
alter table public.reports add column if not exists admin_notes text;
alter table public.reports add column if not exists reviewed_by uuid references auth.users(id) on delete set null;
alter table public.reports add column if not exists reviewed_at timestamptz;

alter table public.reports drop constraint if exists reports_status_check;
alter table public.reports
  add constraint reports_status_check
  check (status in ('open', 'in_progress', 'in_review', 'resolved', 'dismissed'));

-- Legacy report table used by an older chat route. Admin work should use public.reports.
create table if not exists public.rapporter (
  id uuid primary key default gen_random_uuid(),
  rapporterad_id uuid references auth.users(id) on delete set null,
  rapporterad_av uuid references auth.users(id) on delete set null,
  orsak text,
  match_id text,
  created_at timestamptz not null default now()
);

alter table public.rapporter enable row level security;

drop policy if exists "Users can create legacy reports" on public.rapporter;
create policy "Users can create legacy reports"
on public.rapporter for insert
to authenticated
with check (rapporterad_av = auth.uid());

drop policy if exists "Admins can read legacy reports" on public.rapporter;
create policy "Admins can read legacy reports"
on public.rapporter for select
to authenticated
using (exists (select 1 from public.admins a where a.user_id = auth.uid()));
