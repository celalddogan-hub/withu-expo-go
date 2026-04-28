-- WithU feed post types repair.
-- Safe to run multiple times in Supabase SQL Editor.

alter table public.posts drop constraint if exists posts_type_check;

alter table public.posts
  add constraint posts_type_check
  check (type in ('activity', 'thought', 'photo', 'event', 'question'));

