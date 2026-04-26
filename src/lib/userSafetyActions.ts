import { supabase } from './supabase';

type ReportUserInput = {
  reporterId: string;
  reportedUserId: string;
  conversationKey?: string | null;
  reason: string;
  details?: string | null;
};

export async function reportUser(input: ReportUserInput) {
  const { error } = await supabase.from('reports').insert({
    reporter_id: input.reporterId,
    reported_user_id: input.reportedUserId,
    target_user_id: input.reportedUserId,
    source: input.conversationKey ? 'chat' : 'profile',
    reason: input.reason,
    details: input.details || null,
    conversation_id: input.conversationKey || null,
    status: 'open',
    updated_at: new Date().toISOString(),
  });

  if (error) throw error;
}

export async function blockUser(blockerId: string, blockedId: string) {
  const { error } = await supabase.from('blocked_users').upsert(
    {
      blockerad_av: blockerId,
      blockerad: blockedId,
      created_at: new Date().toISOString(),
    },
    { onConflict: 'blockerad_av,blockerad' }
  );

  if (error) throw error;
}

export async function reportAndBlockUser(input: ReportUserInput) {
  await reportUser(input);
  await blockUser(input.reporterId, input.reportedUserId);
}
