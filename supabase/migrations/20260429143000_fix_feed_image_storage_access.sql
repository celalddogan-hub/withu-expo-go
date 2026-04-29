-- WithU feed image access repair.
-- Safe to run multiple times in Supabase SQL Editor.
--
-- Fixes the common "gray image box" case where posts have approved image paths
-- but mobile clients cannot read the object from Supabase Storage.

insert into storage.buckets (id, name, public)
values ('post-images', 'post-images', true)
on conflict (id) do update set public = true;

drop policy if exists "Anyone can read public feed images" on storage.objects;
create policy "Anyone can read public feed images"
on storage.objects
for select
to anon, authenticated
using (bucket_id = 'post-images');

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

alter table public.posts add column if not exists image_status text not null default 'none';
alter table public.posts add column if not exists image_paths text[] not null default '{}'::text[];

update public.posts
set image_paths = array[image_path]
where image_path is not null
  and coalesce(array_length(image_paths, 1), 0) = 0;

update public.posts
set image_status = 'approved',
    updated_at = now()
where (image_path is not null or coalesce(array_length(image_paths, 1), 0) > 0)
  and image_status in ('none', 'pending')
  and is_active = true
  and moderation_status = 'visible';

create or replace view public.feed_image_debug as
select
  p.id as post_id,
  p.user_id,
  p.image_status,
  p.moderation_status,
  p.is_active,
  p.image_path,
  p.image_paths,
  coalesce(array_length(p.image_paths, 1), 0) as image_paths_count,
  exists (
    select 1
    from storage.objects o
    where o.bucket_id = 'post-images'
      and o.name = p.image_path
  ) as image_path_exists,
  (
    select count(*)::integer
    from unnest(coalesce(p.image_paths, '{}'::text[])) as path(name)
    join storage.objects o
      on o.bucket_id = 'post-images'
     and o.name = path.name
  ) as existing_image_paths_count,
  p.created_at
from public.posts p
where p.image_path is not null
   or coalesce(array_length(p.image_paths, 1), 0) > 0
order by p.created_at desc;

grant select on public.feed_image_debug to authenticated;
