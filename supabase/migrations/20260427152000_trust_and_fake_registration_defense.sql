-- WithU trust and fake-registration defense before BankID is live.

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

alter table public.profiles drop constraint if exists profiles_verification_level_check;
alter table public.profiles
  add constraint profiles_verification_level_check
  check (verification_level in ('new', 'email', 'phone', 'bankid', 'admin'));

alter table public.profiles drop constraint if exists profiles_trust_score_check;
alter table public.profiles
  add constraint profiles_trust_score_check
  check (trust_score between 0 and 100);

create unique index if not exists profiles_phone_number_unique_idx
  on public.profiles(phone_number)
  where phone_number is not null and length(trim(phone_number)) > 0;

create index if not exists profiles_trust_status_idx
  on public.profiles(verification_level, is_limited, limited_until);

create or replace function public.apply_profile_trust_defaults()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.created_at is null then
    new.created_at := now();
  end if;

  if new.limited_until is null then
    new.limited_until := now() + interval '48 hours';
  end if;

  new.bankid_verified := coalesce(new.bankid_verified, new.is_bankid_verified, false);
  new.email_verified := coalesce(new.email_verified, false);
  new.phone_verified := coalesce(new.phone_verified, false);

  if coalesce(new.bankid_verified, false) or coalesce(new.is_bankid_verified, false) then
    new.verification_level := 'bankid';
    new.trust_score := greatest(coalesce(new.trust_score, 0), 90);
    new.is_limited := false;
  elsif coalesce(new.phone_verified, false) then
    new.verification_level := 'phone';
    new.trust_score := greatest(coalesce(new.trust_score, 0), 65);
  elsif coalesce(new.email_verified, false) then
    new.verification_level := 'email';
    new.trust_score := greatest(coalesce(new.trust_score, 0), 35);
  else
    new.verification_level := coalesce(new.verification_level, 'new');
    new.trust_score := coalesce(new.trust_score, 0);
  end if;

  if new.limited_until is not null and new.limited_until <= now() and coalesce(new.email_verified, false) then
    new.is_limited := false;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_profiles_apply_trust_defaults on public.profiles;
create trigger trg_profiles_apply_trust_defaults
before insert or update on public.profiles
for each row execute function public.apply_profile_trust_defaults();

create or replace function public.create_profile_for_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  raw_phone text;
begin
  raw_phone := nullif(regexp_replace(coalesce(new.raw_user_meta_data->>'phone_number', ''), '[^0-9+]', '', 'g'), '');

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
$$;

drop trigger if exists on_auth_user_created_create_profile on auth.users;
create trigger on_auth_user_created_create_profile
after insert on auth.users
for each row execute function public.create_profile_for_new_user();

create or replace function public.can_user_start_match()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when not exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and coalesce(p.email_verified, false) = true
        and coalesce(p.is_profile_complete, false) = true
        and p.accepted_rules_at is not null
    ) then false
    when exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and coalesce(p.is_limited, true) = true
        and coalesce(p.limited_until, now() + interval '1 day') > now()
    ) then (
      select count(*) < 5
      from public.matches m
      where m.user_id = auth.uid()
        and m.created_at >= now() - interval '24 hours'
    )
    else true
  end;
$$;

create or replace function public.can_user_create_feed_post()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when not exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and coalesce(p.email_verified, false) = true
        and coalesce(p.is_profile_complete, false) = true
        and p.accepted_rules_at is not null
    ) then false
    when exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and coalesce(p.is_limited, true) = true
        and coalesce(p.limited_until, now() + interval '1 day') > now()
    ) then (
      select count(*) < 3
      from public.posts p
      where p.user_id = auth.uid()
        and p.created_at >= now() - interval '24 hours'
    )
    else true
  end;
$$;

update public.profiles
set limited_until = coalesce(limited_until, created_at + interval '48 hours'),
    bankid_verified = coalesce(bankid_verified, is_bankid_verified, false),
    verification_level = case
      when coalesce(bankid_verified, false) or coalesce(is_bankid_verified, false) then 'bankid'
      when coalesce(phone_verified, false) then 'phone'
      when coalesce(email_verified, false) then 'email'
      else verification_level
    end,
    is_limited = case
      when coalesce(bankid_verified, false) or coalesce(is_bankid_verified, false) then false
      when coalesce(email_verified, false) and coalesce(limited_until, created_at + interval '48 hours') <= now() then false
      else coalesce(is_limited, true)
    end,
    updated_at = now();
