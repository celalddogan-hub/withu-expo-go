-- WithU feed image flow: do not make admins approve every normal image.
-- Safe to run multiple times in Supabase SQL Editor.
--
-- Current model:
-- - Text is blocked immediately by WithU content safety triggers.
-- - Images are visible after upload.
-- - Admins review only reported/flaggade images, not every image.
-- - Later, an AI vision Edge Function can set image_status = 'pending' or 'rejected'
--   only when an image looks unsafe.

alter table public.posts add column if not exists image_status text not null default 'none';
alter table public.posts add column if not exists image_paths text[] not null default '{}'::text[];

alter table public.posts drop constraint if exists posts_image_status_check;
alter table public.posts
  add constraint posts_image_status_check
  check (image_status in ('none', 'pending', 'approved', 'rejected'));

create or replace function public.withu_feed_image_quarantine()
returns trigger
language plpgsql
as $$
begin
  if new.image_path is not null or coalesce(array_length(new.image_paths, 1), 0) > 0 then
    if new.image_status in ('approved', 'rejected') then
      new.image_status = new.image_status;
    else
      new.image_status = 'approved';
    end if;
  else
    new.image_status = 'none';
  end if;

  return new;
end;
$$;

drop trigger if exists withu_feed_image_quarantine on public.posts;
create trigger withu_feed_image_quarantine
  before insert on public.posts
  for each row execute function public.withu_feed_image_quarantine();

-- Release images that were only waiting because every upload used to be quarantined.
update public.posts
set image_status = 'approved',
    updated_at = now()
where image_status = 'pending'
  and is_active = true
  and moderation_status = 'visible'
  and (image_path is not null or coalesce(array_length(image_paths, 1), 0) > 0);

create or replace function public.set_post_image_status(p_post_id uuid, p_status text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_active_admin() then
    raise exception 'WITHU_ADMIN_REQUIRED'
      using errcode = 'P0001',
            message = 'Admin-behorighet kravs.';
  end if;

  if p_status not in ('none', 'pending', 'approved', 'rejected') then
    raise exception 'WITHU_BAD_IMAGE_STATUS'
      using errcode = 'P0001',
            message = 'Ogiltig bildstatus.';
  end if;

  update public.posts
  set image_status = p_status,
      moderation_status = case when p_status = 'rejected' then 'hidden' else moderation_status end,
      updated_at = now()
  where id = p_post_id;

  return found;
end;
$$;

grant execute on function public.set_post_image_status(uuid, text) to authenticated;
