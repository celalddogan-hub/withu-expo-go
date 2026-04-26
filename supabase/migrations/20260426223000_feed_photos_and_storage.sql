-- WithU feed photos.
-- Safe to run multiple times in Supabase SQL Editor.

alter table public.posts add column if not exists image_path text;
alter table public.posts add column if not exists image_status text not null default 'none';

alter table public.posts drop constraint if exists posts_type_check;
alter table public.posts
  add constraint posts_type_check
  check (type in ('activity', 'thought', 'photo', 'event', 'question'));

alter table public.posts drop constraint if exists posts_image_status_check;
alter table public.posts
  add constraint posts_image_status_check
  check (image_status in ('none', 'pending', 'approved', 'rejected'));

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
