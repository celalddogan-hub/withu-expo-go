-- WithU admin security audit.
-- Gives active admins a quick overview of critical public tables and RLS status.

create or replace function public.get_admin_security_audit()
returns table (
  table_name text,
  rls_enabled boolean,
  policy_count integer,
  risk text
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_active_admin() then
    raise exception 'not_admin';
  end if;

  return query
  with required(required_table_name) as (
    values
      ('profiles'),
      ('admins'),
      ('matches'),
      ('messages'),
      ('conversations'),
      ('chat_conversations'),
      ('chat_messages'),
      ('posts'),
      ('post_likes'),
      ('post_comments'),
      ('post_media'),
      ('post_participants'),
      ('thoughts'),
      ('thought_comments'),
      ('thought_likes'),
      ('reports'),
      ('moderation_reports'),
      ('blocked_users'),
      ('hidden_chats'),
      ('notifications'),
      ('push_tokens'),
      ('user_push_tokens'),
      ('now_status'),
      ('spontaneous_sessions'),
      ('volunteer_applications'),
      ('volunteer_application_documents'),
      ('volunteer_profiles'),
      ('volunteer_availability'),
      ('volunteer_contact_requests'),
      ('volunteer_support_requests')
  ),
  table_state as (
    select
      required.required_table_name,
      pg_class.oid as table_oid,
      coalesce(pg_class.relrowsecurity, false) as table_rls_enabled
    from required
    left join pg_class
      on pg_class.relname = required.required_table_name
    left join pg_namespace
      on pg_namespace.oid = pg_class.relnamespace
     and pg_namespace.nspname = 'public'
  ),
  policy_state as (
    select
      pg_policies.tablename,
      count(*)::integer as table_policy_count
    from pg_policies
    where pg_policies.schemaname = 'public'
    group by pg_policies.tablename
  )
  select
    table_state.required_table_name::text as table_name,
    table_state.table_rls_enabled as rls_enabled,
    coalesce(policy_state.table_policy_count, 0) as policy_count,
    case
      when table_state.table_oid is null then 'missing_table'
      when table_state.table_rls_enabled is not true then 'rls_off'
      when coalesce(policy_state.table_policy_count, 0) = 0 then 'no_policies'
      else 'ok'
    end as risk
  from table_state
  left join policy_state
    on policy_state.tablename = table_state.required_table_name
  order by
    case
      when table_state.table_oid is null then 1
      when table_state.table_rls_enabled is not true then 2
      when coalesce(policy_state.table_policy_count, 0) = 0 then 3
      else 4
    end,
    table_state.required_table_name;
end;
$$;

grant execute on function public.get_admin_security_audit() to authenticated;
