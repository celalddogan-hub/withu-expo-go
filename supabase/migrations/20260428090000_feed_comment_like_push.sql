-- WithU feed push notifications for comments and likes.
-- Safe to run multiple times in Supabase SQL Editor.

create extension if not exists pg_net with schema extensions;

create or replace function public.withu_send_expo_push(
  p_user_id uuid,
  p_title text,
  p_body text,
  p_data jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  recipient_token record;
  request_body jsonb;
begin
  if p_user_id is null then
    return;
  end if;

  for recipient_token in
    select expo_push_token
    from public.push_tokens
    where user_id = p_user_id
      and is_active = true
      and expo_push_token like '%PushToken[%'
  loop
    request_body := jsonb_build_object(
      'to', recipient_token.expo_push_token,
      'title', coalesce(nullif(trim(p_title), ''), 'WithU'),
      'body', coalesce(nullif(trim(p_body), ''), 'Du har en ny händelse i WithU'),
      'sound', 'default',
      'priority', 'high',
      'data', coalesce(p_data, '{}'::jsonb)
    );

    begin
      perform extensions.net.http_post(
        url := 'https://exp.host/--/api/v2/push/send',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Accept', 'application/json',
          'Accept-Encoding', 'gzip, deflate'
        ),
        body := request_body,
        timeout_milliseconds := 2500
      );
    exception
      when others then
        null;
    end;
  end loop;
end;
$$;

create or replace function public.withu_send_post_comment_push()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  post_owner_id uuid;
  commenter_name text;
  comment_preview text;
begin
  if new.user_id is null or new.post_id is null then
    return new;
  end if;

  select p.user_id
    into post_owner_id
  from public.posts p
  where p.id = new.post_id
    and p.is_active = true;

  if post_owner_id is null or post_owner_id = new.user_id then
    return new;
  end if;

  select pr.name
    into commenter_name
  from public.profiles pr
  where pr.id = new.user_id;

  commenter_name := coalesce(nullif(trim(commenter_name), ''), 'Någon');
  comment_preview := left(coalesce(nullif(trim(new.content), ''), 'Kommenterade ditt inlägg'), 120);

  perform public.withu_send_expo_push(
    post_owner_id,
    commenter_name,
    comment_preview,
    jsonb_build_object(
      'type', 'post_comment',
      'postId', new.post_id,
      'commentId', new.id
    )
  );

  return new;
exception
  when others then
    return new;
end;
$$;

create or replace function public.withu_send_post_like_push()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  post_owner_id uuid;
  liker_name text;
begin
  if new.user_id is null or new.post_id is null then
    return new;
  end if;

  select p.user_id
    into post_owner_id
  from public.posts p
  where p.id = new.post_id
    and p.is_active = true;

  if post_owner_id is null or post_owner_id = new.user_id then
    return new;
  end if;

  select pr.name
    into liker_name
  from public.profiles pr
  where pr.id = new.user_id;

  liker_name := coalesce(nullif(trim(liker_name), ''), 'Någon');

  perform public.withu_send_expo_push(
    post_owner_id,
    'Nytt gillande',
    liker_name || ' gillade ditt inlägg',
    jsonb_build_object(
      'type', 'post_like',
      'postId', new.post_id
    )
  );

  return new;
exception
  when others then
    return new;
end;
$$;

drop trigger if exists withu_post_comments_push_after_insert on public.post_comments;
create trigger withu_post_comments_push_after_insert
after insert on public.post_comments
for each row
execute function public.withu_send_post_comment_push();

drop trigger if exists withu_post_likes_push_after_insert on public.post_likes;
create trigger withu_post_likes_push_after_insert
after insert on public.post_likes
for each row
execute function public.withu_send_post_like_push();

