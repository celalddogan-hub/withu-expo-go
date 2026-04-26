-- WithU admin statistics.
-- Aggregated numbers only; no private message or profile content is exposed.

create or replace function public.is_withu_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.admins a
    where a.user_id = auth.uid()
  );
$$;

create or replace function public.get_admin_platform_stats()
returns table (
  total_users bigint,
  completed_profiles bigint,
  active_24h bigint,
  active_7d bigint,
  total_matches bigint,
  accepted_matches bigint,
  total_messages bigint,
  total_posts bigint,
  total_thoughts bigint,
  open_reports bigint,
  crisis_reports bigint,
  total_blocks bigint,
  active_volunteers bigint,
  pending_volunteer_applications bigint,
  volunteer_contact_requests bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_withu_admin() then
    raise exception 'not_admin';
  end if;

  return query
  select
    (select count(*) from public.profiles) as total_users,
    (select count(*) from public.profiles where coalesce(is_profile_complete, false) = true) as completed_profiles,
    (select count(*) from public.profiles where updated_at >= now() - interval '24 hours') as active_24h,
    (select count(*) from public.profiles where updated_at >= now() - interval '7 days') as active_7d,
    (select count(*) from public.matches) as total_matches,
    (select count(*) from public.matches where coalesce(is_match, false) = true) as accepted_matches,
    (select count(*) from public.messages) as total_messages,
    (select count(*) from public.posts where coalesce(is_active, true) = true) as total_posts,
    (select count(*) from public.thoughts where coalesce(is_active, true) = true) as total_thoughts,
    (select count(*) from public.reports where status in ('open', 'in_progress', 'in_review')) as open_reports,
    (select count(*) from public.reports where reason in ('self_harm', 'threat')) as crisis_reports,
    (select count(*) from public.blocked_users) as total_blocks,
    (select count(*) from public.volunteer_profiles where coalesce(is_active, false) = true) as active_volunteers,
    (select count(*) from public.volunteer_applications where status = 'pending') as pending_volunteer_applications,
    (select count(*) from public.volunteer_contact_requests) as volunteer_contact_requests;
end;
$$;

grant execute on function public.get_admin_platform_stats() to authenticated;
