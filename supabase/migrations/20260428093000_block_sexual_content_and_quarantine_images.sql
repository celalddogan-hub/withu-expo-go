-- WithU safety hardening: block sexual/porn text and quarantine feed images.
-- Safe to run multiple times in Supabase SQL Editor.

alter table public.posts add column if not exists image_status text not null default 'none';
alter table public.posts add column if not exists image_paths text[] not null default '{}'::text[];

alter table public.posts drop constraint if exists posts_image_status_check;
alter table public.posts
  add constraint posts_image_status_check
  check (image_status in ('none', 'pending', 'approved', 'rejected'));

create or replace function public.withu_content_is_blocked(input_text text)
returns boolean
language sql
immutable
as $$
  select lower(coalesce(input_text, '')) ~ $blocked$(d[öo]da\s+dig|ska\s+d[öo]da|kommer\s+att\s+d[öo]da|knivhugga|m[öo]rda|hotar\s+dig|kill\s+you|i\s+will\s+kill|hurt\s+you|beat\s+you|murder\s+you|ta\s+livet\s+av\s+dig|g[åa]\s+och\s+d[öo]|kill\s+yourself|(^|[^[:alnum:]_])kys([^[:alnum:]_]|$)|hora|j[äa]vla\s+hora|fitta|kukhuvud|idiotj[äa]vel|[äa]ckel|(^|[^[:alnum:]_])cp([^[:alnum:]_]|$)|mongo|retard|dra\s+[åa]t\s+helvete|h[åa]ll\s+k[äa]ften|ingen\s+vill\s+ha\s+dig|bitch|slut|whore|cunt|shut\s+up|go\s+to\s+hell|skicka\s+naken|skicka\s+nudes|nakenbild|nakenbilder|naken\s+bild|naken\s+bilder|dickpic|dick\s+pic|porr|porno|pornografi|xxx|onlyfans|sexchatt|sex\s+chatt|sextr[äa]ff|k[öo]pa\s+sex|sex\s+med\s+mig|ligga\s+med\s+mig|knulla\s+mig|suga\s+av|visa\s+br[öo]st|visa\s+kuk|visa\s+fitta|send\s+nudes|nude\s+pic|nude\s+pics|naked\s+pic|sex\s+with\s+me|fuck\s+me|porn|pornography|sex\s+chat|sexual\s+chat|hookup\s+for\s+sex|buy\s+sex|blowjob|handjob|show\s+boobs|show\s+tits|show\s+pussy|show\s+dick)$blocked$;
$$;

create or replace function public.withu_reject_blocked_content(value text)
returns void
language plpgsql
as $$
begin
  if public.withu_content_is_blocked(value) then
    raise exception 'WITHU_CONTENT_BLOCKED'
      using errcode = 'P0001',
            message = 'Innehållet stoppades av WithU:s trygghetsregler.';
  end if;
end;
$$;

create or replace function public.withu_posts_content_guard()
returns trigger
language plpgsql
as $$
begin
  perform public.withu_reject_blocked_content(concat_ws(' ', new.content, new.activity_title, new.area));
  return new;
end;
$$;

create or replace function public.withu_post_comments_content_guard()
returns trigger
language plpgsql
as $$
begin
  perform public.withu_reject_blocked_content(new.content);
  return new;
end;
$$;

create or replace function public.withu_feed_image_quarantine()
returns trigger
language plpgsql
as $$
begin
  if new.image_path is not null or coalesce(array_length(new.image_paths, 1), 0) > 0 then
    new.image_status = 'pending';
  else
    new.image_status = 'none';
  end if;

  return new;
end;
$$;

drop trigger if exists withu_posts_content_guard on public.posts;
create trigger withu_posts_content_guard
  before insert or update of content, activity_title, area on public.posts
  for each row execute function public.withu_posts_content_guard();

drop trigger if exists withu_post_comments_content_guard on public.post_comments;
create trigger withu_post_comments_content_guard
  before insert or update of content on public.post_comments
  for each row execute function public.withu_post_comments_content_guard();

drop trigger if exists withu_feed_image_quarantine on public.posts;
create trigger withu_feed_image_quarantine
  before insert on public.posts
  for each row execute function public.withu_feed_image_quarantine();

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
            message = 'Admin-behörighet krävs.';
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
