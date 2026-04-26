create extension if not exists pg_net with schema extensions;
create extension if not exists pgcrypto;

create table if not exists public.push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  expo_push_token text not null unique,
  platform text,
  device_name text,
  is_active boolean not null default true,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists push_tokens_user_active_idx
  on public.push_tokens(user_id, is_active);

alter table public.push_tokens enable row level security;

drop policy if exists "Users can read own push tokens" on public.push_tokens;
drop policy if exists "Users can create own push tokens" on public.push_tokens;
drop policy if exists "Users can update own push tokens" on public.push_tokens;
drop policy if exists "Users can delete own push tokens" on public.push_tokens;

create policy "Users can read own push tokens"
on public.push_tokens for select
to authenticated
using (user_id = auth.uid());

create policy "Users can create own push tokens"
on public.push_tokens for insert
to authenticated
with check (user_id = auth.uid());

create policy "Users can update own push tokens"
on public.push_tokens for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy "Users can delete own push tokens"
on public.push_tokens for delete
to authenticated
using (user_id = auth.uid());

create or replace function public.withu_message_push_preview(
  message_type text,
  content text
) returns text
language sql
stable
as $$
  select case
    when message_type = 'image' then 'Skickade en bild'
    when message_type = 'audio' then 'Skickade ett rostmeddelande'
    when coalesce(trim(content), '') = '' then 'Nytt meddelande'
    else left(trim(content), 120)
  end
$$;

create or replace function public.withu_send_message_push()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  sender_name text;
  recipient_id uuid;
  recipient_token record;
  preview text;
  request_body jsonb;
begin
  if new.sender_id is null or new.conversation_key is null then
    return new;
  end if;

  select p.name
    into sender_name
  from public.profiles p
  where p.id = new.sender_id;

  sender_name := coalesce(nullif(trim(sender_name), ''), 'WithU');

  select participant_id::uuid
    into recipient_id
  from unnest(string_to_array(new.conversation_key, '__')) as participant_id
  where participant_id <> new.sender_id::text
  limit 1;

  if recipient_id is null then
    return new;
  end if;

  preview := public.withu_message_push_preview(new.message_type, new.content);

  for recipient_token in
    select expo_push_token
    from public.push_tokens
    where user_id = recipient_id
      and is_active = true
      and expo_push_token like '%PushToken[%'
  loop
    request_body := jsonb_build_object(
      'to', recipient_token.expo_push_token,
      'title', sender_name,
      'body', preview,
      'sound', 'default',
      'priority', 'high',
      'data', jsonb_build_object(
        'type', 'message',
        'conversationKey', new.conversation_key,
        'messageId', new.id
      )
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

  return new;
exception
  when others then
    return new;
end;
$$;

drop trigger if exists withu_messages_push_after_insert on public.messages;

create trigger withu_messages_push_after_insert
after insert on public.messages
for each row
execute function public.withu_send_message_push();
