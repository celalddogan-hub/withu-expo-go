import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from './supabase';

export function createScopedRealtimeChannel(scope: string, id: string) {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return supabase.channel(`${scope}-${id}-${suffix}`);
}

export async function removeChannelSafely(channel?: RealtimeChannel | null) {
  if (!channel) return;

  try {
    await supabase.removeChannel(channel);
  } catch {
    // ignore in dev / hot reload
  }
}