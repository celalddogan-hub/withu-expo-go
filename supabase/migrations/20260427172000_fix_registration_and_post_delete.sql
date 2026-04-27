-- WithU registration and feed delete repair.
-- Makes profile creation tolerant, and gives users a safe RPC to hide their own posts.

alter table public.profiles add column if not exists created_at timestamptz not null default now();
alter table public.profiles add column if not exists phone_number text;
alter table public.profiles add column if not exists email_verified boolean not null default false;
alter table public.profiles add column if not exists phone_verified boolean not null default false;
alter table public.profiles add column if not exists bankid_verified boolean not null default false;
alter table public.profiles add column if not exists verification_level text not null default 'new';
alter table public.profiles add column if not exists trust_score integer not null default 0;
alter table public.profiles add column if not exists is_limited boolean not null default true;
alter table public.profiles add column if not exists limited_until timestamptz;
alter table public.profiles add column if not exists accepted_rules_at timestamptz;
alter table public.profiles add column if not exists last_seen_at timestamptz;
alter table public.profiles add column if not exists updated_at timestamptz not null default now();
alter table public.profiles add column if not exists is_profile_complete boolean not null default false;
alter table public.profiles add column if not exists is_discoverable boolean not null default true;

create or replace function public.create_profile_for_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
declare
  raw_phone text;
begin
  raw_phone := nullif(regexp_replace(coalesce(new.raw_user_meta_data->>'phone_number', ''), '[^0-9+]', '', 'g'), '');

  if raw_phone is not null and exists (
    select 1
    from public.profiles p
    where p.phone_number = raw_phone
      and p.id <> new.id
  ) then
    raw_phone := null;
  end if;

  insert into public.profiles (
    id,
    phone_number,
    email_verified,
    phone_verified,
    bankid_verified,
    verification_level,
    trust_score,
    is_limited,
    limited_until,
    is_profile_complete,
    is_discoverable,
    created_at,
    updated_at
  )
  values (
    new.id,
    raw_phone,
    new.email_confirmed_at is not null,
    false,
    false,
    case when new.email_confirmed_at is not null then 'email' else 'new' end,
    case when new.email_confirmed_at is not null then 35 else 0 end,
    true,
    now() + interval '48 hours',
    false,
    false,
    now(),
    now()
  )
  on conflict (id) do update
  set phone_number = coalesce(public.profiles.phone_number, excluded.phone_number),
      email_verified = public.profiles.email_verified or excluded.email_verified,
      updated_at = now();

  return new;
end;
$function$;

drop trigger if exists on_auth_user_created_create_profile on auth.users;
create trigger on_auth_user_created_create_profile
after insert on auth.users
for each row execute function public.create_profile_for_new_user();

create or replace function public.delete_own_feed_post(p_post_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $function$
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  update public.posts p
  set is_active = false,
      moderation_status = 'hidden',
      updated_at = now()
  where p.id = p_post_id
    and p.user_id = auth.uid();

  if not found then
    raise exception 'post_not_found_or_not_owner';
  end if;

  return true;
end;
$function$;

grant execute on function public.delete_own_feed_post(uuid) to authenticated;
