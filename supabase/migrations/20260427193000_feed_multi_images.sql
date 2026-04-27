-- WithU feed multi-image posts.
-- Safe to run multiple times in Supabase SQL Editor.

alter table public.posts
  add column if not exists image_paths text[] not null default '{}';

update public.posts
set image_paths = array[image_path]
where image_path is not null
  and coalesce(array_length(image_paths, 1), 0) = 0;

alter table public.posts drop constraint if exists posts_image_paths_max_four;
alter table public.posts
  add constraint posts_image_paths_max_four
  check (coalesce(array_length(image_paths, 1), 0) <= 4);
