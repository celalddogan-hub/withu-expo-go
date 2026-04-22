import { supabase } from './supabase';

export type ChatReportReason =
  | 'unsafe_behavior'
  | 'harassment'
  | 'spam'
  | 'fake_profile'
  | 'other';

export async function isBlockedBetween(currentUserId: string, otherUserId: string) {
  const { data, error } = await supabase
    .from('blocked_users')
    .select('blockerad_av, blockerad')
    .or(
      `and(blockerad_av.eq.${currentUserId},blockerad.eq.${otherUserId}),and(blockerad_av.eq.${otherUserId},blockerad.eq.${currentUserId})`
    )
    .limit(1);

  if (error) throw error;
  return !!data && data.length > 0;
}

export async function blockUser(currentUserId: string, otherUserId: string) {
  const { error } = await supabase.from('blocked_users').upsert(
    {
      blockerad_av: currentUserId,
      blockerad: otherUserId,
    },
    { onConflict: 'blockerad_av,blockerad' }
  );

  if (error) throw error;
}

export async function unblockUser(currentUserId: string, otherUserId: string) {
  const { error } = await supabase
    .from('blocked_users')
    .delete()
    .eq('blockerad_av', currentUserId)
    .eq('blockerad', otherUserId);

  if (error) throw error;
}

export async function createChatReport(params: {
  reporterId: string;
  reportedUserId: string;
  reason: ChatReportReason;
  details?: string;
  conversationKey?: string | null;
  matchId?: string | null;
}) {
  const { reporterId, reportedUserId, reason, details, conversationKey, matchId } = params;

  const { error } = await supabase.from('reports').insert({
    reporter_id: reporterId,
    reported_user_id: reportedUserId,
    source: 'chat',
    reason,
    details: details?.trim() || null,
    conversation_key: conversationKey ?? null,
    match_id: matchId ?? null,
  });

  if (error) throw error;
}

export async function hideConversation(params: {
  userId: string;
  otherUserId: string;
  conversationKey: string;
}) {
  const { userId, otherUserId, conversationKey } = params;

  const { error } = await supabase.from('hidden_conversations').upsert(
    {
      user_id: userId,
      other_user_id: otherUserId,
      conversation_key: conversationKey,
    },
    { onConflict: 'user_id,conversation_key' }
  );

  if (error) throw error;
}

export async function unhideConversation(params: {
  userId: string;
  conversationKey: string;
}) {
  const { userId, conversationKey } = params;

  const { error } = await supabase
    .from('hidden_conversations')
    .delete()
    .eq('user_id', userId)
    .eq('conversation_key', conversationKey);

  if (error) throw error;
}

export async function isConversationHidden(params: {
  userId: string;
  conversationKey: string;
}) {
  const { userId, conversationKey } = params;

  const { data, error } = await supabase
    .from('hidden_conversations')
    .select('conversation_key')
    .eq('user_id', userId)
    .eq('conversation_key', conversationKey)
    .limit(1);

  if (error) throw error;
  return !!data && data.length > 0;
}