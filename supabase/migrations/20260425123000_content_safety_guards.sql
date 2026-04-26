-- Blocks obviously unsafe text at the database layer too.
-- The app also blocks before sending, but this protects Supabase from direct writes.

create or replace function public.withu_content_is_blocked(input_text text)
returns boolean
language sql
immutable
as $$
  select lower(coalesce(input_text, '')) ~ $blocked$(döda\s+dig|ska\s+döda|kommer\s+att\s+döda|knivhugga|mörda|hotar\s+dig|kill\s+you|i\s+will\s+kill|hurt\s+you|beat\s+you|murder\s+you|ta\s+livet\s+av\s+dig|gå\s+och\s+dö|kill\s+yourself|(^|[^[:alnum:]_])kys([^[:alnum:]_]|$)|hora|jävla\s+hora|fitta|kukhuvud|idiotjävel|äckel|(^|[^[:alnum:]_])cp([^[:alnum:]_]|$)|mongo|retard|dra\s+åt\s+helvete|håll\s+käften|ingen\s+vill\s+ha\s+dig|bitch|slut|whore|cunt|shut\s+up|go\s+to\s+hell|skicka\s+naken|nakenbild|nakenbilder|dickpic|send\s+nudes|nude\s+pic|اقتل|سأقتلك|اضربك|كلب|حقير|غبي|اخرس|شرموطة|убью|вб'ю|побью|поб'ю|сука|идиот|дебил|заткнись|шлюха)$blocked$;
$$;

create or replace function public.withu_reject_blocked_content(value text)
returns void
language plpgsql
as $$
begin
  if public.withu_content_is_blocked(value) then
    raise exception 'WITHU_CONTENT_BLOCKED'
      using errcode = 'P0001',
            message = 'Meddelandet stoppades av WithU:s trygghetsregler.';
  end if;
end;
$$;

create or replace function public.withu_messages_content_guard()
returns trigger
language plpgsql
as $$
begin
  perform public.withu_reject_blocked_content(new.content);
  return new;
end;
$$;

create or replace function public.withu_thoughts_content_guard()
returns trigger
language plpgsql
as $$
begin
  perform public.withu_reject_blocked_content(concat_ws(' ', new.text, new.content));
  return new;
end;
$$;

create or replace function public.withu_thought_comments_content_guard()
returns trigger
language plpgsql
as $$
begin
  perform public.withu_reject_blocked_content(concat_ws(' ', new.text, new.content));
  return new;
end;
$$;

create or replace function public.withu_now_status_content_guard()
returns trigger
language plpgsql
as $$
begin
  perform public.withu_reject_blocked_content(new.message);
  return new;
end;
$$;

create or replace function public.withu_volunteer_support_content_guard()
returns trigger
language plpgsql
as $$
begin
  perform public.withu_reject_blocked_content(new.intro_message);
  return new;
end;
$$;

create or replace function public.withu_volunteer_contact_content_guard()
returns trigger
language plpgsql
as $$
begin
  perform public.withu_reject_blocked_content(new.message);
  return new;
end;
$$;

do $$
begin
  if to_regclass('public.messages') is not null then
    drop trigger if exists withu_messages_content_guard on public.messages;
    create trigger withu_messages_content_guard
      before insert or update of content on public.messages
      for each row execute function public.withu_messages_content_guard();
  end if;

  if to_regclass('public.thoughts') is not null then
    drop trigger if exists withu_thoughts_content_guard on public.thoughts;
    create trigger withu_thoughts_content_guard
      before insert or update of text, content on public.thoughts
      for each row execute function public.withu_thoughts_content_guard();
  end if;

  if to_regclass('public.thought_comments') is not null then
    drop trigger if exists withu_thought_comments_content_guard on public.thought_comments;
    create trigger withu_thought_comments_content_guard
      before insert or update of text, content on public.thought_comments
      for each row execute function public.withu_thought_comments_content_guard();
  end if;

  if to_regclass('public.now_status') is not null then
    drop trigger if exists withu_now_status_content_guard on public.now_status;
    create trigger withu_now_status_content_guard
      before insert or update of message on public.now_status
      for each row execute function public.withu_now_status_content_guard();
  end if;

  if to_regclass('public.volunteer_support_requests') is not null then
    drop trigger if exists withu_volunteer_support_content_guard on public.volunteer_support_requests;
    create trigger withu_volunteer_support_content_guard
      before insert or update of intro_message on public.volunteer_support_requests
      for each row execute function public.withu_volunteer_support_content_guard();
  end if;

  if to_regclass('public.volunteer_contact_requests') is not null then
    drop trigger if exists withu_volunteer_contact_content_guard on public.volunteer_contact_requests;
    create trigger withu_volunteer_contact_content_guard
      before insert or update of message on public.volunteer_contact_requests
      for each row execute function public.withu_volunteer_contact_content_guard();
  end if;
end;
$$;
