-- WithU latest repair pack, 2026-04-26.
-- Paste the whole file into Supabase SQL Editor and run once.
-- It is safe to run again: tables/columns/indexes use IF NOT EXISTS, policies are dropped/recreated.

create extension if not exists pgcrypto;

-- 1) Profiles used by Hitta, Flode, Nu, Karta, Profil and volunteers.
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

-- 2) Matches and chat.
create table if not exists public.matches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  target_id uuid not null references auth.users(id) on delete cascade,
  action text not null default 'contact',
  is_match boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint matches_not_self check (user_id <> target_id)
);

alter table public.matches add column if not exists action text not null default 'contact';
alter table public.matches add column if not exists is_match boolean not null default false;
alter table public.matches add column if not exists updated_at timestamptz not null default now();
alter table public.matches drop constraint if exists matches_action_check;
alter table public.matches
  add constraint matches_action_check
  check (action in ('contact', 'like', 'superlike', 'want_to_talk', 'talk_request', 'join_activity'));

create index if not exists matches_user_target_idx on public.matches(user_id, target_id);
create unique index if not exists matches_one_action_per_pair_idx on public.matches(user_id, target_id, action);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_key text not null,
  sender_id uuid not null references auth.users(id) on delete cascade,
  content text,
  message_type text not null default 'text',
  media_url text,
  image_url text,
  image_path text,
  audio_url text,
  audio_path text,
  audio_duration_ms integer,
  metadata jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.messages add column if not exists media_url text;
alter table public.messages add column if not exists image_url text;
alter table public.messages add column if not exists image_path text;
alter table public.messages add column if not exists audio_url text;
alter table public.messages add column if not exists audio_path text;
alter table public.messages add column if not exists audio_duration_ms integer;
alter table public.messages add column if not exists metadata jsonb;
alter table public.messages add column if not exists read_at timestamptz;

create index if not exists messages_conversation_created_idx on public.messages(conversation_key, created_at);

create table if not exists public.hidden_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  other_user_id uuid references auth.users(id) on delete cascade,
  conversation_key text not null,
  created_at timestamptz not null default now()
);

create unique index if not exists hidden_conversations_user_key_idx
  on public.hidden_conversations(user_id, conversation_key);

create table if not exists public.hidden_chats (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  match_id text not null,
  created_at timestamptz not null default now()
);

create unique index if not exists hidden_chats_user_match_idx on public.hidden_chats(user_id, match_id);

-- 3) Tankar.
create table if not exists public.thoughts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  text text,
  content text,
  visibility text not null default 'anonymous',
  emoji text,
  mood_tag text not null default 'vardag',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.thoughts add column if not exists content text;
alter table public.thoughts add column if not exists emoji text;
alter table public.thoughts add column if not exists mood_tag text not null default 'vardag';
alter table public.thoughts add column if not exists is_active boolean not null default true;
alter table public.thoughts add column if not exists updated_at timestamptz not null default now();
alter table public.thoughts drop constraint if exists thoughts_visibility_check;
alter table public.thoughts add constraint thoughts_visibility_check check (visibility in ('anonymous', 'nickname', 'firstname'));
alter table public.thoughts drop constraint if exists thoughts_mood_tag_check;
alter table public.thoughts add constraint thoughts_mood_tag_check check (mood_tag in ('ensamhet', 'angest', 'hopp', 'vardag', 'gladje'));

create index if not exists thoughts_active_created_idx on public.thoughts(is_active, created_at desc);

create table if not exists public.thought_comments (
  id uuid primary key default gen_random_uuid(),
  thought_id uuid not null references public.thoughts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  text text,
  content text,
  created_at timestamptz not null default now()
);

alter table public.thought_comments add column if not exists content text;
create index if not exists thought_comments_thought_created_idx on public.thought_comments(thought_id, created_at);

create table if not exists public.thought_reactions (
  id uuid primary key default gen_random_uuid(),
  thought_id uuid not null references public.thoughts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  reaction text not null default 'heart',
  created_at timestamptz not null default now()
);

create unique index if not exists thought_reactions_one_per_user_idx
  on public.thought_reactions(thought_id, user_id, reaction);

create table if not exists public.thought_talk_requests (
  id uuid primary key default gen_random_uuid(),
  thought_id uuid not null references public.thoughts(id) on delete cascade,
  requester_id uuid not null references auth.users(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint thought_talk_requests_not_self check (requester_id <> owner_id),
  constraint thought_talk_requests_status_check check (status in ('pending', 'accepted', 'declined'))
);

create unique index if not exists thought_talk_requests_one_open_idx
  on public.thought_talk_requests(thought_id, requester_id);

-- 4) Flode/feed.
create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  type text not null default 'thought',
  content text not null,
  is_anonymous boolean not null default false,
  anon_name text,
  area text,
  activity_icon text,
  activity_title text,
  activity_time text,
  activity_place text,
  max_participants integer,
  image_path text,
  image_status text not null default 'none',
  moderation_status text not null default 'visible',
  is_active boolean not null default true,
  like_count integer not null default 0,
  comment_count integer not null default 0,
  participant_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.posts drop constraint if exists posts_type_check;
alter table public.posts add constraint posts_type_check check (type in ('activity', 'thought', 'photo', 'event', 'question'));
alter table public.posts drop constraint if exists posts_content_check;
alter table public.posts add constraint posts_content_check check (char_length(trim(content)) between 3 and 500);
alter table public.posts drop constraint if exists posts_image_status_check;
alter table public.posts add constraint posts_image_status_check check (image_status in ('none', 'pending', 'approved', 'rejected'));
alter table public.posts drop constraint if exists posts_moderation_status_check;
alter table public.posts add constraint posts_moderation_status_check check (moderation_status in ('visible', 'hidden', 'needs_review'));

create table if not exists public.post_likes (
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

create table if not exists public.post_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  content text not null,
  moderation_status text not null default 'visible',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.post_comments drop constraint if exists post_comments_content_check;
alter table public.post_comments add constraint post_comments_content_check check (char_length(trim(content)) between 1 and 300);

create table if not exists public.post_participants (
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

create index if not exists posts_visible_created_idx on public.posts(is_active, moderation_status, created_at desc);
create index if not exists posts_user_created_idx on public.posts(user_id, created_at desc);
create index if not exists post_comments_post_created_idx on public.post_comments(post_id, created_at);

-- 5) Nu screen.
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

create unique index if not exists now_status_one_per_user_idx on public.now_status(user_id);
create index if not exists now_status_active_expires_idx on public.now_status(is_active, expires_at desc);

-- 6) Reports and blocking.
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
  conversation_key text,
  match_id text,
  admin_note text,
  admin_notes text,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  status text not null default 'open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.reports add column if not exists conversation_key text;
alter table public.reports add column if not exists match_id text;
alter table public.reports add column if not exists admin_notes text;
alter table public.reports add column if not exists reviewed_by uuid references auth.users(id) on delete set null;
alter table public.reports add column if not exists reviewed_at timestamptz;
alter table public.reports add column if not exists updated_at timestamptz not null default now();
alter table public.reports drop constraint if exists reports_status_check;
alter table public.reports add constraint reports_status_check check (status in ('open', 'in_progress', 'in_review', 'resolved', 'dismissed'));
create index if not exists reports_status_updated_idx on public.reports(status, updated_at desc);

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

create table if not exists public.blocked_users (
  id uuid primary key default gen_random_uuid(),
  blockerad_av uuid not null references auth.users(id) on delete cascade,
  blockerad uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint blocked_users_not_self check (blockerad_av <> blockerad)
);

create unique index if not exists blocked_users_unique_pair_idx on public.blocked_users(blockerad_av, blockerad);

-- 7) Volunteer contact requests.
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

create index if not exists volunteer_contact_requester_idx on public.volunteer_contact_requests(requester_user_id, created_at desc);
create index if not exists volunteer_contact_volunteer_idx on public.volunteer_contact_requests(volunteer_user_id, created_at desc);

-- 8) Enable RLS.
alter table public.matches enable row level security;
alter table public.messages enable row level security;
alter table public.hidden_conversations enable row level security;
alter table public.hidden_chats enable row level security;
alter table public.thoughts enable row level security;
alter table public.thought_comments enable row level security;
alter table public.thought_reactions enable row level security;
alter table public.thought_talk_requests enable row level security;
alter table public.posts enable row level security;
alter table public.post_likes enable row level security;
alter table public.post_comments enable row level security;
alter table public.post_participants enable row level security;
alter table public.now_status enable row level security;
alter table public.reports enable row level security;
alter table public.blocked_users enable row level security;
alter table public.volunteer_contact_requests enable row level security;

-- 9) RLS policies.
drop policy if exists "Users can read own matches" on public.matches;
create policy "Users can read own matches" on public.matches
for select to authenticated
using (user_id = auth.uid() or target_id = auth.uid());

drop policy if exists "Users can create own matches" on public.matches;
create policy "Users can create own matches" on public.matches
for insert to authenticated
with check (user_id = auth.uid());

drop policy if exists "Users can update own matches" on public.matches;
create policy "Users can update own matches" on public.matches
for update to authenticated
using (user_id = auth.uid() or target_id = auth.uid())
with check (user_id = auth.uid() or target_id = auth.uid());

drop policy if exists "Users can read own conversation messages" on public.messages;
create policy "Users can read own conversation messages" on public.messages
for select to authenticated
using (conversation_key like '%' || auth.uid()::text || '%');

drop policy if exists "Users can send own messages" on public.messages;
create policy "Users can send own messages" on public.messages
for insert to authenticated
with check (sender_id = auth.uid() and conversation_key like '%' || auth.uid()::text || '%');

drop policy if exists "Users can read own hidden conversations" on public.hidden_conversations;
create policy "Users can read own hidden conversations" on public.hidden_conversations
for select to authenticated using (user_id = auth.uid());

drop policy if exists "Users can hide own conversations" on public.hidden_conversations;
create policy "Users can hide own conversations" on public.hidden_conversations
for insert to authenticated with check (user_id = auth.uid());

drop policy if exists "Users can unhide own conversations" on public.hidden_conversations;
create policy "Users can unhide own conversations" on public.hidden_conversations
for delete to authenticated using (user_id = auth.uid());

drop policy if exists "Users can read own hidden chats" on public.hidden_chats;
create policy "Users can read own hidden chats" on public.hidden_chats
for select to authenticated using (user_id = auth.uid());

drop policy if exists "Users can hide own chats" on public.hidden_chats;
create policy "Users can hide own chats" on public.hidden_chats
for insert to authenticated with check (user_id = auth.uid());

drop policy if exists "Users can delete own hidden chats" on public.hidden_chats;
create policy "Users can delete own hidden chats" on public.hidden_chats
for delete to authenticated using (user_id = auth.uid());

drop policy if exists posts_select_visible on public.posts;
create policy posts_select_visible on public.posts
for select to authenticated
using (
  is_active = true
  and moderation_status = 'visible'
  and not exists (
    select 1 from public.blocked_users b
    where (b.blockerad_av = auth.uid() and b.blockerad = posts.user_id)
       or (b.blockerad = auth.uid() and b.blockerad_av = posts.user_id)
  )
);

drop policy if exists posts_insert_own on public.posts;
create policy posts_insert_own on public.posts
for insert to authenticated with check (user_id = auth.uid());

drop policy if exists posts_update_own on public.posts;
create policy posts_update_own on public.posts
for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists post_likes_select_own on public.post_likes;
create policy post_likes_select_own on public.post_likes
for select to authenticated using (user_id = auth.uid());

drop policy if exists post_likes_insert_own on public.post_likes;
create policy post_likes_insert_own on public.post_likes
for insert to authenticated with check (user_id = auth.uid());

drop policy if exists post_likes_delete_own on public.post_likes;
create policy post_likes_delete_own on public.post_likes
for delete to authenticated using (user_id = auth.uid());

drop policy if exists post_comments_select_visible on public.post_comments;
create policy post_comments_select_visible on public.post_comments
for select to authenticated using (is_active = true and moderation_status = 'visible');

drop policy if exists post_comments_insert_own on public.post_comments;
create policy post_comments_insert_own on public.post_comments
for insert to authenticated with check (user_id = auth.uid());

drop policy if exists post_participants_select_own on public.post_participants;
create policy post_participants_select_own on public.post_participants
for select to authenticated using (user_id = auth.uid());

drop policy if exists post_participants_insert_own on public.post_participants;
create policy post_participants_insert_own on public.post_participants
for insert to authenticated with check (user_id = auth.uid());

drop policy if exists post_participants_delete_own on public.post_participants;
create policy post_participants_delete_own on public.post_participants
for delete to authenticated using (user_id = auth.uid());

drop policy if exists "Authenticated users can read active now statuses" on public.now_status;
create policy "Authenticated users can read active now statuses" on public.now_status
for select to authenticated using (is_active = true and expires_at > now());

drop policy if exists "Users can create own now status" on public.now_status;
create policy "Users can create own now status" on public.now_status
for insert to authenticated with check (user_id = auth.uid());

drop policy if exists "Users can update own now status" on public.now_status;
create policy "Users can update own now status" on public.now_status
for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "Users can create own reports" on public.reports;
create policy "Users can create own reports" on public.reports
for insert to authenticated with check (auth.uid() = reporter_id);

drop policy if exists "Users can read own reports" on public.reports;
create policy "Users can read own reports" on public.reports
for select to authenticated using (auth.uid() = reporter_id);

drop policy if exists "Admins can manage reports" on public.reports;
create policy "Admins can manage reports" on public.reports
for all to authenticated
using (exists (select 1 from public.admins a where a.user_id = auth.uid()))
with check (exists (select 1 from public.admins a where a.user_id = auth.uid()));

drop policy if exists "Users can read own blocks" on public.blocked_users;
create policy "Users can read own blocks" on public.blocked_users
for select to authenticated using (auth.uid() = blockerad_av or auth.uid() = blockerad);

drop policy if exists "Users can create own blocks" on public.blocked_users;
create policy "Users can create own blocks" on public.blocked_users
for insert to authenticated with check (auth.uid() = blockerad_av);

drop policy if exists "Users can delete own blocks" on public.blocked_users;
create policy "Users can delete own blocks" on public.blocked_users
for delete to authenticated using (auth.uid() = blockerad_av);

drop policy if exists "Users can read own volunteer contact requests" on public.volunteer_contact_requests;
create policy "Users can read own volunteer contact requests" on public.volunteer_contact_requests
for select to authenticated
using (requester_user_id = auth.uid() or volunteer_user_id = auth.uid());

drop policy if exists "Users can create volunteer contact requests" on public.volunteer_contact_requests;
create policy "Users can create volunteer contact requests" on public.volunteer_contact_requests
for insert to authenticated
with check (requester_user_id = auth.uid());

drop policy if exists "Volunteers can update own contact requests" on public.volunteer_contact_requests;
create policy "Volunteers can update own contact requests" on public.volunteer_contact_requests
for update to authenticated
using (requester_user_id = auth.uid() or volunteer_user_id = auth.uid())
with check (requester_user_id = auth.uid() or volunteer_user_id = auth.uid());

-- 10) Feed image storage.
insert into storage.buckets (id, name, public)
values ('post-images', 'post-images', true)
on conflict (id) do update set public = true;

drop policy if exists "Users can read feed images" on storage.objects;
create policy "Users can read feed images"
on storage.objects
for select
to authenticated
using (bucket_id = 'post-images');

drop policy if exists "Users can upload own feed images" on storage.objects;
create policy "Users can upload own feed images"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'post-images'
  and auth.uid()::text = (storage.foldername(name))[1]
);

drop policy if exists "Users can update own feed images" on storage.objects;
create policy "Users can update own feed images"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'post-images'
  and auth.uid()::text = (storage.foldername(name))[1]
)
with check (
  bucket_id = 'post-images'
  and auth.uid()::text = (storage.foldername(name))[1]
);

drop policy if exists "Users can delete own feed images" on storage.objects;
create policy "Users can delete own feed images"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'post-images'
  and auth.uid()::text = (storage.foldername(name))[1]
);

-- 11) Admin profile visibility and support overview.
-- Admin accounts can help users, but should not appear as normal profiles in Upptack/Hitta.
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

-- Replace the emails and run this part in SQL Editor when you want exactly 3 admins:
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

-- 12) Trust and fake-registration defense before BankID is live.
alter table public.profiles add column if not exists created_at timestamptz not null default now();
alter table public.profiles add column if not exists phone_number text;
alter table public.profiles add column if not exists email_verified boolean not null default false;
alter table public.profiles add column if not exists phone_verified boolean not null default false;
alter table public.profiles add column if not exists bankid_verified boolean not null default false;
alter table public.profiles add column if not exists verification_level text not null default 'new';
alter table public.profiles add column if not exists trust_score integer not null default 0;
alter table public.profiles add column if not exists is_limited boolean not null default true;
alter table public.profiles add column if not exists limited_until timestamptz;
alter table public.profiles add column if not exists accepted_rules_at timestamptz;
alter table public.profiles add column if not exists last_seen_at timestamptz;

alter table public.profiles drop constraint if exists profiles_verification_level_check;
alter table public.profiles
  add constraint profiles_verification_level_check
  check (verification_level in ('new', 'email', 'phone', 'bankid', 'admin'));

alter table public.profiles drop constraint if exists profiles_trust_score_check;
alter table public.profiles
  add constraint profiles_trust_score_check
  check (trust_score between 0 and 100);

create unique index if not exists profiles_phone_number_unique_idx
  on public.profiles(phone_number)
  where phone_number is not null and length(trim(phone_number)) > 0;

create index if not exists profiles_trust_status_idx
  on public.profiles(verification_level, is_limited, limited_until);

create or replace function public.apply_profile_trust_defaults()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.created_at is null then
    new.created_at := now();
  end if;

  if new.limited_until is null then
    new.limited_until := now() + interval '48 hours';
  end if;

  new.bankid_verified := coalesce(new.bankid_verified, new.is_bankid_verified, false);
  new.email_verified := coalesce(new.email_verified, false);
  new.phone_verified := coalesce(new.phone_verified, false);

  if coalesce(new.bankid_verified, false) or coalesce(new.is_bankid_verified, false) then
    new.verification_level := 'bankid';
    new.trust_score := greatest(coalesce(new.trust_score, 0), 90);
    new.is_limited := false;
  elsif coalesce(new.phone_verified, false) then
    new.verification_level := 'phone';
    new.trust_score := greatest(coalesce(new.trust_score, 0), 65);
  elsif coalesce(new.email_verified, false) then
    new.verification_level := 'email';
    new.trust_score := greatest(coalesce(new.trust_score, 0), 35);
  else
    new.verification_level := coalesce(new.verification_level, 'new');
    new.trust_score := coalesce(new.trust_score, 0);
  end if;

  if new.limited_until is not null and new.limited_until <= now() and coalesce(new.email_verified, false) then
    new.is_limited := false;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_profiles_apply_trust_defaults on public.profiles;
create trigger trg_profiles_apply_trust_defaults
before insert or update on public.profiles
for each row execute function public.apply_profile_trust_defaults();

create or replace function public.create_profile_for_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  raw_phone text;
begin
  raw_phone := nullif(regexp_replace(coalesce(new.raw_user_meta_data->>'phone_number', ''), '[^0-9+]', '', 'g'), '');

  insert into public.profiles (
    id, phone_number, email_verified, phone_verified, bankid_verified,
    verification_level, trust_score, is_limited, limited_until,
    is_profile_complete, is_discoverable, created_at, updated_at
  )
  values (
    new.id, raw_phone, new.email_confirmed_at is not null, false, false,
    case when new.email_confirmed_at is not null then 'email' else 'new' end,
    case when new.email_confirmed_at is not null then 35 else 0 end,
    true, now() + interval '48 hours',
    false, false, now(), now()
  )
  on conflict (id) do update
  set phone_number = coalesce(public.profiles.phone_number, excluded.phone_number),
      email_verified = public.profiles.email_verified or excluded.email_verified,
      updated_at = now();

  return new;
end;
$$;

drop trigger if exists on_auth_user_created_create_profile on auth.users;
create trigger on_auth_user_created_create_profile
after insert on auth.users
for each row execute function public.create_profile_for_new_user();

create or replace function public.can_user_start_match()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when not exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and coalesce(p.email_verified, false) = true
        and coalesce(p.is_profile_complete, false) = true
        and p.accepted_rules_at is not null
    ) then false
    when exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and coalesce(p.is_limited, true) = true
        and coalesce(p.limited_until, now() + interval '1 day') > now()
    ) then (
      select count(*) < 5
      from public.matches m
      where m.user_id = auth.uid()
        and m.created_at >= now() - interval '24 hours'
    )
    else true
  end;
$$;

create or replace function public.can_user_create_feed_post()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when not exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and coalesce(p.email_verified, false) = true
        and coalesce(p.is_profile_complete, false) = true
        and p.accepted_rules_at is not null
    ) then false
    when exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and coalesce(p.is_limited, true) = true
        and coalesce(p.limited_until, now() + interval '1 day') > now()
    ) then (
      select count(*) < 3
      from public.posts p
      where p.user_id = auth.uid()
        and p.created_at >= now() - interval '24 hours'
    )
    else true
  end;
$$;

-- 12) Admin security audit.
-- Active admins can use this from the app to see if critical tables have RLS and policies.
create or replace function public.get_admin_security_audit()
returns table (
  table_name text,
  rls_enabled boolean,
  policy_count integer,
  risk text
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_active_admin() then
    raise exception 'not_admin';
  end if;

  return query
  with required(required_table_name) as (
    values
      ('profiles'),
      ('admins'),
      ('matches'),
      ('messages'),
      ('conversations'),
      ('chat_conversations'),
      ('chat_messages'),
      ('posts'),
      ('post_likes'),
      ('post_comments'),
      ('post_media'),
      ('post_participants'),
      ('thoughts'),
      ('thought_comments'),
      ('thought_likes'),
      ('reports'),
      ('moderation_reports'),
      ('blocked_users'),
      ('hidden_chats'),
      ('notifications'),
      ('push_tokens'),
      ('user_push_tokens'),
      ('now_status'),
      ('spontaneous_sessions'),
      ('volunteer_applications'),
      ('volunteer_application_documents'),
      ('volunteer_profiles'),
      ('volunteer_availability'),
      ('volunteer_contact_requests'),
      ('volunteer_support_requests')
  ),
  table_state as (
    select
      required.required_table_name,
      pg_class.oid as table_oid,
      coalesce(pg_class.relrowsecurity, false) as table_rls_enabled
    from required
    left join pg_class
      on pg_class.relname = required.required_table_name
    left join pg_namespace
      on pg_namespace.oid = pg_class.relnamespace
     and pg_namespace.nspname = 'public'
  ),
  policy_state as (
    select
      pg_policies.tablename,
      count(*)::integer as table_policy_count
    from pg_policies
    where pg_policies.schemaname = 'public'
    group by pg_policies.tablename
  )
  select
    table_state.required_table_name::text as table_name,
    table_state.table_rls_enabled as rls_enabled,
    coalesce(policy_state.table_policy_count, 0) as policy_count,
    case
      when table_state.table_oid is null then 'missing_table'
      when table_state.table_rls_enabled is not true then 'rls_off'
      when coalesce(policy_state.table_policy_count, 0) = 0 then 'no_policies'
      else 'ok'
    end as risk
  from table_state
  left join policy_state
    on policy_state.tablename = table_state.required_table_name
  order by
    case
      when table_state.table_oid is null then 1
      when table_state.table_rls_enabled is not true then 2
      when coalesce(policy_state.table_policy_count, 0) = 0 then 3
      else 4
    end,
    table_state.required_table_name;
end;
$$;

grant execute on function public.get_admin_security_audit() to authenticated;

-- 13) Helpful check result.
select
  'withu_repair_pack_ok' as status,
  to_regclass('public.profiles') as profiles,
  to_regclass('public.matches') as matches,
  to_regclass('public.messages') as messages,
  to_regclass('public.posts') as posts,
  to_regclass('public.now_status') as now_status,
  to_regclass('public.volunteer_contact_requests') as volunteer_contact_requests,
  to_regclass('public.blocked_users') as blocked_users;
