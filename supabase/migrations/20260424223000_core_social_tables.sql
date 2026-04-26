create extension if not exists pgcrypto;

create table if not exists public.matches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  target_id uuid not null references auth.users(id) on delete cascade,
  action text not null default 'contact',
  is_match boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint matches_not_self check (user_id <> target_id),
  constraint matches_action_check check (action in ('contact', 'like', 'superlike'))
);

alter table public.matches add column if not exists action text not null default 'contact';
alter table public.matches add column if not exists is_match boolean not null default false;
alter table public.matches add column if not exists updated_at timestamptz not null default now();

create index if not exists matches_user_target_idx
  on public.matches(user_id, target_id);

create unique index if not exists matches_one_action_per_pair_idx
  on public.matches(user_id, target_id, action);

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

create index if not exists messages_conversation_created_idx
  on public.messages(conversation_key, created_at);

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
  updated_at timestamptz not null default now(),
  constraint thoughts_visibility_check check (visibility in ('anonymous', 'nickname', 'firstname')),
  constraint thoughts_mood_tag_check check (mood_tag in ('ensamhet', 'angest', 'hopp', 'vardag', 'gladje'))
);

alter table public.thoughts add column if not exists content text;
alter table public.thoughts add column if not exists emoji text;
alter table public.thoughts add column if not exists mood_tag text not null default 'vardag';
alter table public.thoughts add column if not exists is_active boolean not null default true;
alter table public.thoughts add column if not exists updated_at timestamptz not null default now();

create index if not exists thoughts_active_created_idx
  on public.thoughts(is_active, created_at desc);

create table if not exists public.thought_comments (
  id uuid primary key default gen_random_uuid(),
  thought_id uuid not null references public.thoughts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  text text,
  content text,
  created_at timestamptz not null default now()
);

alter table public.thought_comments add column if not exists content text;

create index if not exists thought_comments_thought_created_idx
  on public.thought_comments(thought_id, created_at);

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

alter table public.matches enable row level security;
alter table public.messages enable row level security;
alter table public.thoughts enable row level security;
alter table public.thought_comments enable row level security;
alter table public.thought_reactions enable row level security;
alter table public.thought_talk_requests enable row level security;

drop policy if exists "Users can read own matches" on public.matches;
drop policy if exists "Users can create own matches" on public.matches;
drop policy if exists "Users can update own matches" on public.matches;

create policy "Users can read own matches"
on public.matches for select
to authenticated
using (user_id = auth.uid() or target_id = auth.uid());

create policy "Users can create own matches"
on public.matches for insert
to authenticated
with check (user_id = auth.uid());

create policy "Users can update own matches"
on public.matches for update
to authenticated
using (user_id = auth.uid() or target_id = auth.uid())
with check (user_id = auth.uid() or target_id = auth.uid());

drop policy if exists "Users can read own conversations" on public.messages;
drop policy if exists "Users can send own messages" on public.messages;
drop policy if exists "Users can mark own conversations read" on public.messages;

create policy "Users can read own conversations"
on public.messages for select
to authenticated
using (auth.uid()::text = any(string_to_array(conversation_key, '__')));

create policy "Users can send own messages"
on public.messages for insert
to authenticated
with check (
  sender_id = auth.uid()
  and auth.uid()::text = any(string_to_array(conversation_key, '__'))
);

create policy "Users can mark own conversations read"
on public.messages for update
to authenticated
using (auth.uid()::text = any(string_to_array(conversation_key, '__')))
with check (auth.uid()::text = any(string_to_array(conversation_key, '__')));

drop policy if exists "Authenticated users can read active thoughts" on public.thoughts;
drop policy if exists "Users can create own thoughts" on public.thoughts;
drop policy if exists "Users can update own thoughts" on public.thoughts;

create policy "Authenticated users can read active thoughts"
on public.thoughts for select
to authenticated
using (is_active = true or user_id = auth.uid());

create policy "Users can create own thoughts"
on public.thoughts for insert
to authenticated
with check (user_id = auth.uid());

create policy "Users can update own thoughts"
on public.thoughts for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "Authenticated users can read thought comments" on public.thought_comments;
drop policy if exists "Users can create own thought comments" on public.thought_comments;

create policy "Authenticated users can read thought comments"
on public.thought_comments for select
to authenticated
using (true);

create policy "Users can create own thought comments"
on public.thought_comments for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists "Authenticated users can read thought reactions" on public.thought_reactions;
drop policy if exists "Users can create own thought reactions" on public.thought_reactions;
drop policy if exists "Users can delete own thought reactions" on public.thought_reactions;

create policy "Authenticated users can read thought reactions"
on public.thought_reactions for select
to authenticated
using (true);

create policy "Users can create own thought reactions"
on public.thought_reactions for insert
to authenticated
with check (user_id = auth.uid());

create policy "Users can delete own thought reactions"
on public.thought_reactions for delete
to authenticated
using (user_id = auth.uid());

drop policy if exists "Users can read own thought talk requests" on public.thought_talk_requests;
drop policy if exists "Users can create own thought talk requests" on public.thought_talk_requests;
drop policy if exists "Owners can answer thought talk requests" on public.thought_talk_requests;

create policy "Users can read own thought talk requests"
on public.thought_talk_requests for select
to authenticated
using (requester_id = auth.uid() or owner_id = auth.uid());

create policy "Users can create own thought talk requests"
on public.thought_talk_requests for insert
to authenticated
with check (requester_id = auth.uid());

create policy "Owners can answer thought talk requests"
on public.thought_talk_requests for update
to authenticated
using (owner_id = auth.uid())
with check (owner_id = auth.uid());
