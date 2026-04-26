import { Alert } from 'react-native';
import type { Router } from 'expo-router';
import { supabase } from './supabase';
import { checkContentSafety, getContentSafetyAlert } from './contentSafety';

type SafetySurface = 'chat' | 'feed' | 'feed_comment' | 'now' | 'thought' | 'thought_comment';

type GuardInput = {
  text: string;
  reporterId: string;
  router: Router;
  surface: SafetySurface;
  targetUserId?: string | null;
  conversationKey?: string | null;
  matchId?: string | null;
};

function shouldCreateSafetyReport(reason?: string) {
  return reason === 'self_harm' || reason === 'threat';
}

async function createSafetyReport(input: GuardInput, reason: string) {
  await supabase.from('reports').insert({
    reporter_id: input.reporterId,
    reported_user_id: input.targetUserId || null,
    target_user_id: input.targetUserId || null,
    source: input.surface,
    reason,
    details: input.text.slice(0, 500),
    conversation_key: input.conversationKey || null,
    match_id: input.matchId || null,
    status: 'open',
    updated_at: new Date().toISOString(),
  });
}

export async function guardContentOrShowHelp(input: GuardInput) {
  const result = checkContentSafety(input.text);
  if (result.allowed) return true;

  if (shouldCreateSafetyReport(result.reason)) {
    try {
      await createSafetyReport(input, result.reason || 'safety');
    } catch {
      // The user-facing safety stop must still work even if reporting fails.
    }
  }

  const alert = getContentSafetyAlert(result);
  const showHelp = result.reason === 'self_harm' || result.reason === 'threat';

  Alert.alert(
    alert.title,
    showHelp
      ? `${alert.body}\n\nOm det är akut, ring 112. Du kan också öppna trygghetssidan för stöd.`
      : alert.body,
    showHelp
      ? [
          { text: 'Stäng', style: 'cancel' },
          { text: 'Öppna hjälp', onPress: () => input.router.push('/safety') },
        ]
      : [{ text: 'OK' }]
  );

  return false;
}
