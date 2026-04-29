-- WithU scale pack: indexes and lightweight audit helpers for high user volume.
-- Safe to run multiple times in Supabase SQL Editor.
-- This does not delete or rewrite data.

create extension if not exists pgcrypto;

create or replace function public.withu_table_has_columns(p_table text, variadic p_columns text[])
returns boolean
language sql
stable
as $$
  select to_regclass(format('public.%I', p_table)) is not null
    and not exists (
      select 1
      from unnest(p_columns) as wanted(column_name)
      where not exists (
        select 1
        from information_schema.columns c
        where c.table_schema = 'public'
          and c.table_name = p_table
          and c.column_name = wanted.column_name
      )
    );
$$;

do $$
begin
  if public.withu_table_has_columns('profiles', 'is_discoverable', 'is_profile_complete', 'updated_at') then
    execute 'create index if not exists profiles_discovery_ready_idx on public.profiles (is_discoverable, is_profile_complete, updated_at desc)';
  end if;

  if public.withu_table_has_columns('profiles', 'age', 'is_discoverable') then
    execute 'create index if not exists profiles_age_discovery_idx on public.profiles (age, is_discoverable) where is_discoverable = true';
  end if;

  if public.withu_table_has_columns('profiles', 'city') then
    execute 'create index if not exists profiles_city_lower_idx on public.profiles (lower(city))';
  end if;

  if public.withu_table_has_columns('profiles', 'country', 'city') then
    execute 'create index if not exists profiles_country_city_idx on public.profiles (country, city)';
  end if;

  if public.withu_table_has_columns('profiles', 'is_bankid_verified') then
    execute 'create index if not exists profiles_bankid_idx on public.profiles (is_bankid_verified) where is_bankid_verified = true';
  end if;

  if public.withu_table_has_columns('profiles', 'activities') then
    execute 'create index if not exists profiles_activities_gin_idx on public.profiles using gin (activities)';
  end if;

  if public.withu_table_has_columns('admins', 'is_active', 'user_id') then
    execute 'create index if not exists admins_active_idx on public.admins (is_active, user_id)';
  end if;

  if public.withu_table_has_columns('matches', 'user_id', 'is_match', 'updated_at') then
    execute 'create index if not exists matches_user_match_updated_idx on public.matches (user_id, is_match, updated_at desc)';
  end if;

  if public.withu_table_has_columns('matches', 'target_id', 'is_match', 'updated_at') then
    execute 'create index if not exists matches_target_match_updated_idx on public.matches (target_id, is_match, updated_at desc)';
  end if;

  if public.withu_table_has_columns('matches', 'target_id', 'action', 'created_at') then
    execute 'create index if not exists matches_target_action_created_idx on public.matches (target_id, action, created_at desc)';
  end if;

  if public.withu_table_has_columns('matches', 'user_id', 'action', 'created_at') then
    execute 'create index if not exists matches_user_action_created_idx on public.matches (user_id, action, created_at desc)';
  end if;

  if public.withu_table_has_columns('messages', 'conversation_key', 'created_at') then
    execute 'create index if not exists messages_conversation_created_desc_idx on public.messages (conversation_key, created_at desc)';
  end if;

  if public.withu_table_has_columns('messages', 'sender_id', 'created_at') then
    execute 'create index if not exists messages_sender_created_idx on public.messages (sender_id, created_at desc)';
  end if;

  if public.withu_table_has_columns('messages', 'conversation_key', 'read_at', 'created_at') then
    execute 'create index if not exists messages_unread_by_conversation_idx on public.messages (conversation_key, read_at, created_at desc) where read_at is null';
  end if;

  if public.withu_table_has_columns('messages', 'message_type', 'created_at') then
    execute 'create index if not exists messages_type_created_idx on public.messages (message_type, created_at desc)';
  end if;

  if public.withu_table_has_columns('hidden_conversations', 'user_id', 'created_at') then
    execute 'create index if not exists hidden_conversations_user_created_idx on public.hidden_conversations (user_id, created_at desc)';
  end if;

  if public.withu_table_has_columns('hidden_conversations', 'user_id') then
    execute 'create index if not exists hidden_conversations_user_idx on public.hidden_conversations (user_id)';
  end if;

  if public.withu_table_has_columns('hidden_chats', 'user_id', 'created_at') then
    execute 'create index if not exists hidden_chats_user_created_idx on public.hidden_chats (user_id, created_at desc)';
  end if;

  if public.withu_table_has_columns('hidden_chats', 'user_id') then
    execute 'create index if not exists hidden_chats_user_idx on public.hidden_chats (user_id)';
  end if;

  if public.withu_table_has_columns('blocked_users', 'blockerad_av', 'created_at') then
    execute 'create index if not exists blocked_users_blocker_created_idx on public.blocked_users (blockerad_av, created_at desc)';
  end if;

  if public.withu_table_has_columns('blocked_users', 'blockerad', 'created_at') then
    execute 'create index if not exists blocked_users_blocked_created_idx on public.blocked_users (blockerad, created_at desc)';
  end if;

  if public.withu_table_has_columns('posts', 'is_active', 'moderation_status', 'created_at') then
    execute 'create index if not exists posts_feed_visible_idx on public.posts (is_active, moderation_status, created_at desc) where is_active = true and moderation_status = ''visible''';
  end if;

  if public.withu_table_has_columns('posts', 'type', 'is_active', 'moderation_status', 'created_at') then
    execute 'create index if not exists posts_feed_type_visible_idx on public.posts (type, is_active, moderation_status, created_at desc)';
  end if;

  if public.withu_table_has_columns('posts', 'user_id', 'is_active', 'created_at') then
    execute 'create index if not exists posts_user_visible_created_idx on public.posts (user_id, is_active, created_at desc)';
  end if;

  if public.withu_table_has_columns('posts', 'image_status', 'created_at') then
    execute 'create index if not exists posts_pending_images_idx on public.posts (image_status, created_at desc) where image_status = ''pending''';
  end if;

  if public.withu_table_has_columns('posts', 'area', 'created_at') then
    execute 'create index if not exists posts_area_created_idx on public.posts (area, created_at desc)';
  end if;

  if public.withu_table_has_columns('post_likes', 'user_id', 'created_at') then
    execute 'create index if not exists post_likes_user_created_idx on public.post_likes (user_id, created_at desc)';
  end if;

  if public.withu_table_has_columns('post_likes', 'post_id', 'created_at') then
    execute 'create index if not exists post_likes_post_created_idx on public.post_likes (post_id, created_at desc)';
  end if;

  if public.withu_table_has_columns('post_comments', 'user_id', 'created_at') then
    execute 'create index if not exists post_comments_user_created_idx on public.post_comments (user_id, created_at desc)';
  end if;

  if public.withu_table_has_columns('post_comments', 'post_id', 'is_active', 'moderation_status', 'created_at') then
    execute 'create index if not exists post_comments_visible_post_created_idx on public.post_comments (post_id, is_active, moderation_status, created_at desc)';
  end if;

  if public.withu_table_has_columns('post_participants', 'user_id', 'created_at') then
    execute 'create index if not exists post_participants_user_created_idx on public.post_participants (user_id, created_at desc)';
  end if;

  if public.withu_table_has_columns('post_participants', 'post_id', 'created_at') then
    execute 'create index if not exists post_participants_post_created_idx on public.post_participants (post_id, created_at desc)';
  end if;

  if public.withu_table_has_columns('thoughts', 'user_id', 'created_at') then
    execute 'create index if not exists thoughts_user_created_idx on public.thoughts (user_id, created_at desc)';
  end if;

  if public.withu_table_has_columns('thoughts', 'mood_tag', 'is_active', 'created_at') then
    execute 'create index if not exists thoughts_mood_active_created_idx on public.thoughts (mood_tag, is_active, created_at desc)';
  end if;

  if public.withu_table_has_columns('thought_comments', 'user_id', 'created_at') then
    execute 'create index if not exists thought_comments_user_created_idx on public.thought_comments (user_id, created_at desc)';
  end if;

  if public.withu_table_has_columns('thought_reactions', 'user_id', 'created_at') then
    execute 'create index if not exists thought_reactions_user_created_idx on public.thought_reactions (user_id, created_at desc)';
  end if;

  if public.withu_table_has_columns('thought_talk_requests', 'owner_id', 'status', 'created_at') then
    execute 'create index if not exists thought_talk_requests_owner_status_idx on public.thought_talk_requests (owner_id, status, created_at desc)';
  end if;

  if public.withu_table_has_columns('thought_talk_requests', 'requester_id', 'status', 'created_at') then
    execute 'create index if not exists thought_talk_requests_requester_status_idx on public.thought_talk_requests (requester_id, status, created_at desc)';
  end if;

  if public.withu_table_has_columns('now_status', 'is_active', 'expires_at') then
    execute 'create index if not exists now_status_live_idx on public.now_status (is_active, expires_at desc) where is_active = true';
  end if;

  if public.withu_table_has_columns('now_status', 'user_id', 'is_active') then
    execute 'create index if not exists now_status_user_active_idx on public.now_status (user_id, is_active)';
  end if;

  if public.withu_table_has_columns('now_status', 'city', 'activity', 'expires_at') then
    execute 'create index if not exists now_status_city_activity_idx on public.now_status (city, activity, expires_at desc)';
  end if;

  if public.withu_table_has_columns('reports', 'status', 'created_at') then
    execute 'create index if not exists reports_open_created_idx on public.reports (status, created_at desc) where status in (''open'', ''in_progress'', ''in_review'')';
  end if;

  if public.withu_table_has_columns('reports', 'reporter_id', 'created_at') then
    execute 'create index if not exists reports_reporter_created_idx on public.reports (reporter_id, created_at desc)';
  end if;

  if public.withu_table_has_columns('reports', 'reported_profile_id', 'created_at') then
    execute 'create index if not exists reports_reported_profile_created_idx on public.reports (reported_profile_id, created_at desc)';
  end if;

  if public.withu_table_has_columns('reports', 'target_user_id', 'created_at') then
    execute 'create index if not exists reports_target_created_idx on public.reports (target_user_id, created_at desc)';
  end if;

  if public.withu_table_has_columns('reports', 'source', 'created_at') then
    execute 'create index if not exists reports_source_created_idx on public.reports (source, created_at desc)';
  end if;

  if public.withu_table_has_columns('push_tokens', 'is_active', 'user_id', 'last_seen_at') then
    execute 'create index if not exists push_tokens_active_user_seen_idx on public.push_tokens (is_active, user_id, last_seen_at desc)';
  end if;

  if public.withu_table_has_columns('push_tokens', 'platform', 'is_active') then
    execute 'create index if not exists push_tokens_platform_active_idx on public.push_tokens (platform, is_active)';
  end if;

  if public.withu_table_has_columns('notifications', 'user_id', 'read_at', 'created_at') then
    execute 'create index if not exists notifications_user_read_created_idx on public.notifications (user_id, read_at, created_at desc)';
  end if;

  if public.withu_table_has_columns('notifications', 'user_id', 'type', 'created_at') then
    execute 'create index if not exists notifications_user_type_created_idx on public.notifications (user_id, type, created_at desc)';
  end if;

  if public.withu_table_has_columns('user_push_tokens', 'user_id', 'is_active') then
    execute 'create index if not exists user_push_tokens_user_active_idx on public.user_push_tokens (user_id, is_active)';
  end if;

  if public.withu_table_has_columns('volunteer_applications', 'status', 'submitted_at') then
    execute 'create index if not exists volunteer_applications_status_submitted_idx on public.volunteer_applications (status, submitted_at desc)';
  end if;

  if public.withu_table_has_columns('volunteer_applications', 'reviewed_by', 'reviewed_at') then
    execute 'create index if not exists volunteer_applications_reviewed_idx on public.volunteer_applications (reviewed_by, reviewed_at desc)';
  end if;

  if public.withu_table_has_columns('volunteer_applications', 'tags') then
    execute 'create index if not exists volunteer_applications_tags_gin_idx on public.volunteer_applications using gin (tags)';
  end if;

  if public.withu_table_has_columns('volunteer_applications', 'age_groups') then
    execute 'create index if not exists volunteer_applications_age_groups_gin_idx on public.volunteer_applications using gin (age_groups)';
  end if;

  if public.withu_table_has_columns('volunteer_profiles', 'is_active', 'approved_at') then
    execute 'create index if not exists volunteer_profiles_active_approved_idx on public.volunteer_profiles (is_active, approved_at desc)';
  end if;

  if public.withu_table_has_columns('volunteer_profiles', 'tags') then
    execute 'create index if not exists volunteer_profiles_tags_gin_idx on public.volunteer_profiles using gin (tags)';
  end if;

  if public.withu_table_has_columns('volunteer_profiles', 'age_groups') then
    execute 'create index if not exists volunteer_profiles_age_groups_gin_idx on public.volunteer_profiles using gin (age_groups)';
  end if;

  if public.withu_table_has_columns('volunteer_availability', 'status', 'active_until') then
    execute 'create index if not exists volunteer_availability_live_until_idx on public.volunteer_availability (status, active_until desc) where status = ''active''';
  end if;

  if public.withu_table_has_columns('volunteer_availability', 'volunteer_user_id', 'status', 'active_until') then
    execute 'create index if not exists volunteer_availability_user_status_until_idx on public.volunteer_availability (volunteer_user_id, status, active_until desc)';
  end if;

  if public.withu_table_has_columns('volunteer_support_requests', 'availability_id', 'status', 'created_at') then
    execute 'create index if not exists volunteer_support_availability_status_created_idx on public.volunteer_support_requests (availability_id, status, created_at desc)';
  end if;

  if public.withu_table_has_columns('volunteer_support_requests', 'requester_user_id', 'status', 'created_at') then
    execute 'create index if not exists volunteer_support_requester_status_created_idx on public.volunteer_support_requests (requester_user_id, status, created_at desc)';
  end if;

  if public.withu_table_has_columns('volunteer_support_requests', 'volunteer_user_id', 'status', 'created_at') then
    execute 'create index if not exists volunteer_support_volunteer_status_created_idx on public.volunteer_support_requests (volunteer_user_id, status, created_at desc)';
  end if;

  if public.withu_table_has_columns('volunteer_contact_requests', 'requester_user_id', 'status', 'created_at') then
    execute 'create index if not exists volunteer_contact_requester_status_created_idx on public.volunteer_contact_requests (requester_user_id, status, created_at desc)';
  end if;

  if public.withu_table_has_columns('volunteer_contact_requests', 'volunteer_user_id', 'status', 'created_at') then
    execute 'create index if not exists volunteer_contact_volunteer_status_created_idx on public.volunteer_contact_requests (volunteer_user_id, status, created_at desc)';
  end if;
end;
$$;

create or replace function public.get_scale_index_audit()
returns table (
  table_name text,
  index_count integer,
  estimated_rows bigint,
  note text
)
language sql
stable
security definer
set search_path = public
as $$
  with target_tables(table_name) as (
    values
      ('profiles'),
      ('matches'),
      ('messages'),
      ('posts'),
      ('post_comments'),
      ('post_likes'),
      ('post_participants'),
      ('now_status'),
      ('reports'),
      ('blocked_users'),
      ('push_tokens'),
      ('notifications'),
      ('volunteer_applications'),
      ('volunteer_profiles'),
      ('volunteer_availability'),
      ('volunteer_support_requests'),
      ('volunteer_contact_requests')
  )
  select
    t.table_name,
    count(i.indexname)::integer as index_count,
    coalesce(c.reltuples::bigint, 0) as estimated_rows,
    case
      when c.oid is null then 'missing_table'
      when count(i.indexname) < 2 then 'needs_more_indexes'
      else 'ok'
    end as note
  from target_tables t
  left join pg_class c
    on c.relname = t.table_name
   and c.relnamespace = 'public'::regnamespace
  left join pg_indexes i
    on i.schemaname = 'public'
   and i.tablename = t.table_name
  group by t.table_name, c.oid, c.reltuples
  order by t.table_name;
$$;

grant execute on function public.get_scale_index_audit() to authenticated;
