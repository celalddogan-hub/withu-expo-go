insert into storage.buckets (id, name, public)
values
  ('profile-images', 'profile-images', true),
  ('chat-images', 'chat-images', false),
  ('voice-messages', 'voice-messages', false),
  ('chat-media', 'chat-media', false),
  ('volunteer-documents', 'volunteer-documents', false)
on conflict (id) do nothing;

drop policy if exists "Public can read profile images" on storage.objects;
drop policy if exists "Users can upload own profile images" on storage.objects;
drop policy if exists "Authenticated users can read chat images" on storage.objects;
drop policy if exists "Users can upload own chat images" on storage.objects;
drop policy if exists "Authenticated users can read voice messages" on storage.objects;
drop policy if exists "Users can upload own voice messages" on storage.objects;
drop policy if exists "Authenticated users can read legacy chat media" on storage.objects;
drop policy if exists "Users can upload own legacy chat media" on storage.objects;
drop policy if exists "Users can upload volunteer documents" on storage.objects;
drop policy if exists "Users can read own volunteer documents" on storage.objects;

create policy "Public can read profile images"
on storage.objects for select
using (bucket_id = 'profile-images');

create policy "Users can upload own profile images"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'profile-images'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "Authenticated users can read chat images"
on storage.objects for select
to authenticated
using (bucket_id = 'chat-images');

create policy "Users can upload own chat images"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'chat-images'
  and (storage.foldername(name))[2] = auth.uid()::text
);

create policy "Authenticated users can read voice messages"
on storage.objects for select
to authenticated
using (bucket_id = 'voice-messages');

create policy "Users can upload own voice messages"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'voice-messages'
  and (storage.foldername(name))[2] = auth.uid()::text
);

create policy "Authenticated users can read legacy chat media"
on storage.objects for select
to authenticated
using (bucket_id = 'chat-media');

create policy "Users can upload own legacy chat media"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'chat-media'
  and (storage.foldername(name))[2] = auth.uid()::text
);

create policy "Users can upload volunteer documents"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'volunteer-documents'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "Users can read own volunteer documents"
on storage.objects for select
to authenticated
using (
  bucket_id = 'volunteer-documents'
  and (storage.foldername(name))[1] = auth.uid()::text
);
