-- WithU feed: posts, likes, comments and activity participants.
-- Safe to run more than once in Supabase SQL Editor.

create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  type text not null default 'thought' check (type in ('activity', 'thought', 'event', 'question')),
  content text not null check (char_length(trim(content)) between 3 and 500),
  is_anonymous boolean not null default false,
  anon_name text,
  area text,
  activity_icon text,
  activity_title text,
  activity_time text,
  activity_place text,
  max_participants integer check (max_participants is null or max_participants between 1 and 100),
  image_path text,
  image_status text not null default 'none' check (image_status in ('none', 'pending', 'approved', 'rejected')),
  moderation_status text not null default 'visible' check (moderation_status in ('visible', 'hidden', 'needs_review')),
  is_active boolean not null default true,
  like_count integer not null default 0 check (like_count >= 0),
  comment_count integer not null default 0 check (comment_count >= 0),
  participant_count integer not null default 0 check (participant_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

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
  content text not null check (char_length(trim(content)) between 1 and 300),
  moderation_status text not null default 'visible' check (moderation_status in ('visible', 'hidden', 'needs_review')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.post_participants (
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

create index if not exists posts_visible_created_idx
  on public.posts (is_active, moderation_status, created_at desc);

create index if not exists posts_user_created_idx
  on public.posts (user_id, created_at desc);

create index if not exists post_comments_post_created_idx
  on public.post_comments (post_id, created_at);

alter table public.posts enable row level security;
alter table public.post_likes enable row level security;
alter table public.post_comments enable row level security;
alter table public.post_participants enable row level security;

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists posts_touch_updated_at on public.posts;
create trigger posts_touch_updated_at
before update on public.posts
for each row execute function public.touch_updated_at();

drop trigger if exists post_comments_touch_updated_at on public.post_comments;
create trigger post_comments_touch_updated_at
before update on public.post_comments
for each row execute function public.touch_updated_at();

create or replace function public.refresh_post_counts()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_post_id uuid;
begin
  target_post_id := coalesce(new.post_id, old.post_id);

  update public.posts
  set
    like_count = (
      select count(*)::integer from public.post_likes where post_id = target_post_id
    ),
    comment_count = (
      select count(*)::integer
      from public.post_comments
      where post_id = target_post_id
        and is_active = true
        and moderation_status = 'visible'
    ),
    participant_count = (
      select count(*)::integer from public.post_participants where post_id = target_post_id
    )
  where id = target_post_id;

  return coalesce(new, old);
end;
$$;

drop trigger if exists post_likes_refresh_counts on public.post_likes;
create trigger post_likes_refresh_counts
after insert or delete on public.post_likes
for each row execute function public.refresh_post_counts();

drop trigger if exists post_comments_refresh_counts on public.post_comments;
create trigger post_comments_refresh_counts
after insert or update or delete on public.post_comments
for each row execute function public.refresh_post_counts();

drop trigger if exists post_participants_refresh_counts on public.post_participants;
create trigger post_participants_refresh_counts
after insert or delete on public.post_participants
for each row execute function public.refresh_post_counts();

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'posts' and policyname = 'posts_select_visible'
  ) then
    create policy posts_select_visible on public.posts
      for select
      to authenticated
      using (
        is_active = true
        and moderation_status = 'visible'
        and not exists (
          select 1
          from public.blocked_users b
          where (b.blockerad_av = auth.uid() and b.blockerad = posts.user_id)
             or (b.blockerad = auth.uid() and b.blockerad_av = posts.user_id)
        )
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'posts' and policyname = 'posts_insert_own'
  ) then
    create policy posts_insert_own on public.posts
      for insert
      to authenticated
      with check (user_id = auth.uid());
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'posts' and policyname = 'posts_update_own'
  ) then
    create policy posts_update_own on public.posts
      for update
      to authenticated
      using (user_id = auth.uid())
      with check (user_id = auth.uid());
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'post_likes' and policyname = 'post_likes_select_own'
  ) then
    create policy post_likes_select_own on public.post_likes
      for select
      to authenticated
      using (user_id = auth.uid());
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'post_likes' and policyname = 'post_likes_insert_own'
  ) then
    create policy post_likes_insert_own on public.post_likes
      for insert
      to authenticated
      with check (user_id = auth.uid());
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'post_likes' and policyname = 'post_likes_delete_own'
  ) then
    create policy post_likes_delete_own on public.post_likes
      for delete
      to authenticated
      using (user_id = auth.uid());
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'post_comments' and policyname = 'post_comments_select_visible'
  ) then
    create policy post_comments_select_visible on public.post_comments
      for select
      to authenticated
      using (is_active = true and moderation_status = 'visible');
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'post_comments' and policyname = 'post_comments_insert_own'
  ) then
    create policy post_comments_insert_own on public.post_comments
      for insert
      to authenticated
      with check (user_id = auth.uid());
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'post_comments' and policyname = 'post_comments_update_own'
  ) then
    create policy post_comments_update_own on public.post_comments
      for update
      to authenticated
      using (user_id = auth.uid())
      with check (user_id = auth.uid());
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'post_participants' and policyname = 'post_participants_select_own'
  ) then
    create policy post_participants_select_own on public.post_participants
      for select
      to authenticated
      using (user_id = auth.uid());
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'post_participants' and policyname = 'post_participants_insert_own'
  ) then
    create policy post_participants_insert_own on public.post_participants
      for insert
      to authenticated
      with check (user_id = auth.uid());
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'post_participants' and policyname = 'post_participants_delete_own'
  ) then
    create policy post_participants_delete_own on public.post_participants
      for delete
      to authenticated
      using (user_id = auth.uid());
  end if;
end $$;
