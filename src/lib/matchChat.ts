import { supabase } from './supabase';

type MatchRow = {
  id: string;
  user_id: string;
  target_id: string;
  action: string | null;
  is_match: boolean | null;
  created_at?: string | null;
};

type MessageRow = {
  id: string;
  conversation_key: string | null;
  sender_id: string | null;
  content: string | null;
  message_type: string | null;
  created_at?: string | null;
};

const ALLOWED_MATCH_ACTIONS = ['like', 'superlike'] as const;

export function makeConversationKey(a: string, b: string) {
  return [a, b].sort().join('__');
}

async function repairMatchPair(currentUserId: string, otherUserId: string) {
  const [ownUpdate, otherUpdate] = await Promise.all([
    supabase
      .from('matches')
      .update({ is_match: true })
      .eq('user_id', currentUserId)
      .eq('target_id', otherUserId)
      .in('action', [...ALLOWED_MATCH_ACTIONS]),

    supabase
      .from('matches')
      .update({ is_match: true })
      .eq('user_id', otherUserId)
      .eq('target_id', currentUserId)
      .in('action', [...ALLOWED_MATCH_ACTIONS]),
  ]);

  if (ownUpdate.error) throw ownUpdate.error;
  if (otherUpdate.error) throw otherUpdate.error;
}

export async function getMatchedTargetIds(currentUserId: string): Promise<Set<string>> {
  if (!currentUserId) return new Set<string>();

  const [
    { data: outgoingRows, error: outgoingError },
    { data: incomingRows, error: incomingError },
  ] = await Promise.all([
    supabase
      .from('matches')
      .select('id, user_id, target_id, action, is_match, created_at')
      .eq('user_id', currentUserId)
      .in('action', [...ALLOWED_MATCH_ACTIONS]),

    supabase
      .from('matches')
      .select('id, user_id, target_id, action, is_match, created_at')
      .eq('target_id', currentUserId)
      .in('action', [...ALLOWED_MATCH_ACTIONS]),
  ]);

  if (outgoingError) throw outgoingError;
  if (incomingError) throw incomingError;

  const outgoing = (outgoingRows ?? []) as MatchRow[];
  const incoming = (incomingRows ?? []) as MatchRow[];

  const outgoingTargetIds = new Set(outgoing.map((row) => row.target_id));

  const reciprocalIds = [...new Set(incoming.map((row) => row.user_id))].filter((id) =>
    outgoingTargetIds.has(id)
  );

  const matchedIds = new Set(
    outgoing.filter((row) => row.is_match === true).map((row) => row.target_id)
  );

  const needRepairIds = reciprocalIds.filter((id) => !matchedIds.has(id));

  for (const otherUserId of needRepairIds) {
    await repairMatchPair(currentUserId, otherUserId);
    matchedIds.add(otherUserId);
  }

  return matchedIds;
}

export async function ensureMatchedConversation(
  currentUserId: string,
  otherUserId: string,
  introMessage?: string
): Promise<{ conversationKey: string }> {
  if (!currentUserId || !otherUserId) {
    throw new Error('Saknar användare för att öppna chatt.');
  }

  const [
    { data: ownRows, error: ownError },
    { data: otherRows, error: otherError },
  ] = await Promise.all([
    supabase
      .from('matches')
      .select('id, user_id, target_id, action, is_match, created_at')
      .eq('user_id', currentUserId)
      .eq('target_id', otherUserId)
      .in('action', [...ALLOWED_MATCH_ACTIONS]),

    supabase
      .from('matches')
      .select('id, user_id, target_id, action, is_match, created_at')
      .eq('user_id', otherUserId)
      .eq('target_id', currentUserId)
      .in('action', [...ALLOWED_MATCH_ACTIONS]),
  ]);

  if (ownError) throw ownError;
  if (otherError) throw otherError;

  const own = (ownRows ?? []) as MatchRow[];
  const other = (otherRows ?? []) as MatchRow[];

  const isMutual = own.length > 0 && other.length > 0;

  if (!isMutual) {
    throw new Error('Ni måste båda ha hört av er innan chatten kan öppnas.');
  }

  const ownIsMatched = own.some((row) => row.is_match === true);
  const otherIsMatched = other.some((row) => row.is_match === true);

  if (!ownIsMatched || !otherIsMatched) {
    await repairMatchPair(currentUserId, otherUserId);
  }

  const conversationKey = makeConversationKey(currentUserId, otherUserId);

  if (introMessage?.trim()) {
    const { data: existingMessages, error: existingMessagesError } = await supabase
      .from('messages')
      .select('id, conversation_key, sender_id, content, message_type, created_at')
      .eq('conversation_key', conversationKey)
      .limit(1);

    if (existingMessagesError) throw existingMessagesError;

    const hasMessages = ((existingMessages ?? []) as MessageRow[]).length > 0;

    if (!hasMessages) {
      const { error: insertMessageError } = await supabase.from('messages').insert({
        conversation_key: conversationKey,
        sender_id: currentUserId,
        content: introMessage.trim(),
        message_type: 'text',
      });

      if (insertMessageError) throw insertMessageError;
    }
  }

  return { conversationKey };
}