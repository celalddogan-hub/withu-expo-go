import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import { supabase } from '../../src/lib/supabase';
import { getMatchedTargetIds, makeConversationKey } from '../../src/lib/matchChat';
import { guardContentOrShowHelp } from '../../src/lib/crisisSafety';
import {
  withuColors,
  withuRadius,
  withuShadows,
  withuSpacing,
} from '../../src/theme/withuTheme';
import {
  WithUAvatar,
  WithUPage,
  WithUScreen,
  WithUTopBar,
} from '../../src/components/withu/WithUPrimitives';

type ProfileRow = {
  id: string;
  name: string | null;
  age: number | null;
  city: string | null;
  activities: string[] | null;
  avatar_emoji: string | null;
  is_profile_complete: boolean | null;
};

type NowRow = {
  id: string;
  user_id: string;
  activity: string;
  message: string | null;
  city: string | null;
  is_active: boolean;
  expires_at: string;
  created_at: string;
  updated_at: string;
};

type LiveCard = NowRow & {
  profile: ProfileRow | null;
  isMatched: boolean;
};

function getMinutesLeft(expiresAt: string) {
  const ms = new Date(expiresAt).getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / 60000));
}

function activityIcon(activity: string) {
  const value = activity.toLowerCase();
  if (value.includes('fika') || value.includes('kaffe')) return '☕';
  if (value.includes('promenad')) return '🚶';
  if (value.includes('spel') || value.includes('escape')) return '🎲';
  if (value.includes('stud')) return '📚';
  if (value.includes('musik')) return '🎵';
  if (value.includes('träna') || value.includes('gym')) return '💪';
  return '⚡';
}

async function likeAndMaybeOpenChat(currentUserId: string, targetUserId: string) {
  const { error: upsertError } = await supabase.from('matches').upsert(
    {
      user_id: currentUserId,
      target_id: targetUserId,
      action: 'like',
      is_match: false,
    },
    { onConflict: 'user_id,target_id,action' }
  );

  if (upsertError) throw upsertError;

  const { data: reciprocal, error: reciprocalError } = await supabase
    .from('matches')
    .select('id')
    .eq('user_id', targetUserId)
    .eq('target_id', currentUserId)
    .in('action', ['like', 'superlike'])
    .maybeSingle();

  if (reciprocalError) throw reciprocalError;

  if (!reciprocal?.id) return false;

  const [ownUpdate, otherUpdate] = await Promise.all([
    supabase
      .from('matches')
      .update({ is_match: true })
      .eq('user_id', currentUserId)
      .eq('target_id', targetUserId)
      .in('action', ['like', 'superlike']),
    supabase
      .from('matches')
      .update({ is_match: true })
      .eq('user_id', targetUserId)
      .eq('target_id', currentUserId)
      .in('action', ['like', 'superlike']),
  ]);

  if (ownUpdate.error) throw ownUpdate.error;
  if (otherUpdate.error) throw otherUpdate.error;
  return true;
}

export default function NowScreen() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [currentUserId, setCurrentUserId] = useState('');
  const [ownProfile, setOwnProfile] = useState<ProfileRow | null>(null);
  const [myNow, setMyNow] = useState<NowRow | null>(null);
  const [liveCards, setLiveCards] = useState<LiveCard[]>([]);
  const [selectedActivity, setSelectedActivity] = useState('');
  const [message, setMessage] = useState('');
  const [joining, setJoining] = useState<string | null>(null);

  const activities = useMemo(() => {
    const base = ownProfile?.activities?.length
      ? ownProfile.activities
      : ['Bara prata', 'Fika', 'Promenad', 'Spela', 'Studera'];
    return [...new Set(base)].slice(0, 8);
  }, [ownProfile]);

  const loadNow = useCallback(async () => {
    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError) throw userError;
      if (!user) {
        setCurrentUserId('');
        setOwnProfile(null);
        setLiveCards([]);
        return;
      }

      setCurrentUserId(user.id);

      const nowIso = new Date().toISOString();
      const [profileResult, myNowResult, liveResult, matchedSet] = await Promise.all([
        supabase
          .from('profiles')
          .select('id, name, age, city, activities, avatar_emoji, is_profile_complete')
          .eq('id', user.id)
          .maybeSingle(),
        supabase
          .from('now_status')
          .select('*')
          .eq('user_id', user.id)
          .eq('is_active', true)
          .gt('expires_at', nowIso)
          .maybeSingle(),
        supabase
          .from('now_status')
          .select('*')
          .neq('user_id', user.id)
          .eq('is_active', true)
          .gt('expires_at', nowIso)
          .order('created_at', { ascending: false })
          .limit(30),
        getMatchedTargetIds(user.id),
      ]);

      if (profileResult.error) throw profileResult.error;
      if (myNowResult.error) throw myNowResult.error;
      if (liveResult.error) throw liveResult.error;

      const profile = (profileResult.data as ProfileRow | null) ?? null;
      const myStatus = (myNowResult.data as NowRow | null) ?? null;
      const liveRows = (liveResult.data ?? []) as NowRow[];
      const userIds = liveRows.map((row) => row.user_id);

      const profilesById = new Map<string, ProfileRow>();
      if (userIds.length > 0) {
        const { data, error } = await supabase
          .from('profiles')
          .select('id, name, age, city, activities, avatar_emoji, is_profile_complete')
          .in('id', userIds);
        if (error) throw error;
        ((data ?? []) as ProfileRow[]).forEach((item) => profilesById.set(item.id, item));
      }

      setOwnProfile(profile);
      setMyNow(myStatus);
      setSelectedActivity(myStatus?.activity || selectedActivity || profile?.activities?.[0] || 'Bara prata');
      setMessage(myStatus?.message || '');
      setLiveCards(
        liveRows
          .map((row) => ({
            ...row,
            profile: profilesById.get(row.user_id) ?? null,
            isMatched: matchedSet.has(row.user_id),
          }))
          .filter((row) => row.profile?.is_profile_complete !== false)
      );
    } catch (error: any) {
      Alert.alert('Något gick fel', error?.message || 'Kunde inte ladda Nu.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [selectedActivity]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      loadNow();
    }, [loadNow])
  );

  const goLive = async () => {
    if (!currentUserId || saving) return;

    const isSafe = await guardContentOrShowHelp({
      text: message,
      reporterId: currentUserId,
      router,
      surface: 'now',
    });
    if (!isSafe) {
      return;
    }

    try {
      setSaving(true);
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
      const { error } = await supabase.from('now_status').upsert(
        {
          user_id: currentUserId,
          activity: selectedActivity || activities[0] || 'Bara prata',
          message: message.trim() || null,
          city: ownProfile?.city || null,
          is_active: true,
          expires_at: expiresAt,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' }
      );

      if (error) throw error;
      await loadNow();
    } catch (error: any) {
      Alert.alert('Kunde inte visa tillgänglighet', error?.message || 'Försök igen.');
    } finally {
      setSaving(false);
    }
  };

  const stopLive = async () => {
    if (!currentUserId) return;
    try {
      setSaving(true);
      const { error } = await supabase
        .from('now_status')
        .update({ is_active: false, expires_at: new Date().toISOString() })
        .eq('user_id', currentUserId);
      if (error) throw error;
      setMyNow(null);
    } catch (error: any) {
      Alert.alert('Kunde inte avsluta', error?.message || 'Försök igen.');
    } finally {
      setSaving(false);
    }
  };

  const joinPerson = async (card: LiveCard) => {
    if (!currentUserId || joining) return;

    try {
      setJoining(card.user_id);
      if (card.isMatched) {
        router.push({
          pathname: '/chat/[conversationKey]',
          params: { conversationKey: makeConversationKey(currentUserId, card.user_id) },
        });
        return;
      }

      const isMatch = await likeAndMaybeOpenChat(currentUserId, card.user_id);
      if (isMatch) {
        router.push({
          pathname: '/chat/[conversationKey]',
          params: { conversationKey: makeConversationKey(currentUserId, card.user_id) },
        });
      } else {
        Alert.alert('Skickat', 'Personen får se att du vill vara med. Chatten öppnas när ni båda vill.');
      }
      await loadNow();
    } catch (error: any) {
      Alert.alert('Kunde inte skicka', error?.message || 'Försök igen.');
    } finally {
      setJoining(null);
    }
  };

  return (
    <WithUScreen>
      <WithUTopBar title="Ses nu" subtitle="Hitta någon som vill prata eller ses en stund." right={<WithUAvatar emoji="⚡" size={34} />} />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 84 : 0}
        style={styles.keyboardWrap}
      >
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadNow(); }} />}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
        >
          <WithUPage style={styles.page}>
          <View style={styles.liveCard}>
            <View style={styles.liveHeader}>
              <View>
                <Text style={styles.sectionLabel}>Din tillgänglighet</Text>
                <Text style={styles.liveTitle}>{myNow ? 'Du är tillgänglig nu' : 'Jag är tillgänglig i 60 min'}</Text>
              </View>
              {myNow ? <Text style={styles.livePill}>{getMinutesLeft(myNow.expires_at)} min</Text> : null}
            </View>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.activityRow}>
              {activities.map((activity) => {
                const active = selectedActivity === activity;
                return (
                  <Pressable
                    key={activity}
                    style={[styles.activityChip, active && styles.activityChipActive]}
                    onPress={() => setSelectedActivity(activity)}
                  >
                    <Text style={[styles.activityText, active && styles.activityTextActive]}>
                      {activityIcon(activity)} {activity}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            <TextInput
              value={message}
              onChangeText={setMessage}
              placeholder="Skriv kort vad du vill göra..."
              placeholderTextColor={withuColors.muted}
              style={styles.messageInput}
              multiline
              maxLength={140}
            />

            <View style={styles.liveActions}>
              <Pressable style={[styles.primaryButton, saving && styles.disabled]} onPress={goLive} disabled={saving}>
                <Text style={styles.primaryButtonText}>{saving ? 'Sparar...' : myNow ? 'Uppdatera' : 'Jag är tillgänglig nu'}</Text>
              </Pressable>
              {myNow ? (
                <Pressable style={styles.secondaryButton} onPress={stopLive} disabled={saving}>
                  <Text style={styles.secondaryButtonText}>Avsluta</Text>
                </Pressable>
              ) : null}
            </View>
          </View>

          <View style={styles.feedHeader}>
            <Text style={styles.feedTitle}>Tillgängliga just nu</Text>
            <Text style={styles.feedCount}>{liveCards.length} tillgängliga</Text>
          </View>

          {loading ? (
            <View style={styles.stateCard}>
              <ActivityIndicator color={withuColors.teal} size="large" />
              <Text style={styles.stateText}>Laddar tillgängliga personer...</Text>
            </View>
          ) : liveCards.length === 0 ? (
            <View style={styles.stateCard}>
              <Text style={styles.stateTitle}>Ingen är tillgänglig just nu</Text>
              <Text style={styles.stateText}>Bli först att visa att du vill prata, eller titta igen om en stund.</Text>
            </View>
          ) : (
            <View style={styles.cardList}>
              {liveCards.map((card) => {
                const name = card.profile?.name || 'Användare';
                const avatar = card.profile?.avatar_emoji || activityIcon(card.activity);
                return (
                  <View key={card.id} style={styles.personCard}>
                    <View style={styles.personTop}>
                      <View style={styles.avatarCircle}>
                        <Text style={styles.avatarText}>{avatar}</Text>
                      </View>
                      <View style={styles.personInfo}>
                        <Text style={styles.personName}>
                          {name}
                          {card.profile?.age ? `, ${card.profile.age}` : ''}
                        </Text>
                        <Text style={styles.personMeta}>
                          {card.city || card.profile?.city || 'Nära dig'} · {card.activity}
                        </Text>
                      </View>
                      <Text style={styles.timeText}>{getMinutesLeft(card.expires_at)} min</Text>
                    </View>
                    {card.message ? <Text style={styles.personMessage}>{card.message}</Text> : null}
                    <Pressable
                      style={[styles.joinButton, card.isMatched && styles.chatButton]}
                      onPress={() => joinPerson(card)}
                      disabled={!!joining}
                    >
                      <Text style={styles.joinButtonText}>
                        {joining === card.user_id
                          ? 'Skickar...'
                          : card.isMatched
                          ? 'Öppna chatt'
                          : 'Vill vara med'}
                      </Text>
                    </Pressable>
                  </View>
                );
              })}
            </View>
          )}
          </WithUPage>
        </ScrollView>
      </KeyboardAvoidingView>
    </WithUScreen>
  );
}

const styles = StyleSheet.create({
  keyboardWrap: { flex: 1, backgroundColor: withuColors.cream },
  scroll: { flex: 1, backgroundColor: withuColors.cream },
  content: { paddingBottom: 40 },
  page: { paddingTop: withuSpacing.lg },
  liveCard: {
    backgroundColor: withuColors.white,
    borderRadius: withuRadius.xl,
    borderWidth: 1,
    borderColor: withuColors.line,
    padding: withuSpacing.lg,
    marginBottom: withuSpacing.lg,
    ...withuShadows.card,
  },
  liveHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  sectionLabel: { color: withuColors.teal, fontSize: 12, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1 },
  liveTitle: { color: withuColors.navy, fontSize: 25, fontWeight: '900', marginTop: 2 },
  livePill: {
    backgroundColor: withuColors.tealBg,
    color: withuColors.teal,
    fontSize: 14,
    fontWeight: '900',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: withuRadius.pill,
    overflow: 'hidden',
  },
  activityRow: { gap: 8, paddingBottom: 12 },
  activityChip: {
    backgroundColor: withuColors.soft,
    borderRadius: withuRadius.pill,
    paddingHorizontal: 13,
    paddingVertical: 9,
    borderWidth: 1,
    borderColor: withuColors.line,
  },
  activityChipActive: { backgroundColor: withuColors.teal, borderColor: withuColors.teal },
  activityText: { color: withuColors.navy, fontSize: 13, fontWeight: '900' },
  activityTextActive: { color: withuColors.white },
  messageInput: {
    minHeight: 74,
    maxHeight: 120,
    backgroundColor: withuColors.soft,
    borderRadius: withuRadius.md,
    borderWidth: 1,
    borderColor: withuColors.line,
    padding: 13,
    color: withuColors.navy,
    fontSize: 15,
    lineHeight: 21,
    textAlignVertical: 'top',
    fontWeight: '700',
  },
  liveActions: { flexDirection: 'row', gap: 10, marginTop: 12 },
  primaryButton: {
    flex: 1,
    minHeight: 50,
    backgroundColor: withuColors.teal,
    borderRadius: withuRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: { color: withuColors.white, fontSize: 15, fontWeight: '900' },
  secondaryButton: {
    flex: 1,
    minHeight: 50,
    borderWidth: 1.5,
    borderColor: withuColors.line,
    borderRadius: withuRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonText: { color: withuColors.navy, fontSize: 15, fontWeight: '900' },
  disabled: { opacity: 0.55 },
  feedHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  feedTitle: { color: withuColors.navy, fontSize: 22, fontWeight: '900' },
  feedCount: { color: withuColors.muted, fontSize: 13, fontWeight: '800' },
  stateCard: {
    backgroundColor: withuColors.white,
    borderRadius: withuRadius.lg,
    borderWidth: 1,
    borderColor: withuColors.line,
    padding: 24,
    alignItems: 'center',
    gap: 8,
  },
  stateTitle: { color: withuColors.navy, fontSize: 19, fontWeight: '900', textAlign: 'center' },
  stateText: { color: withuColors.muted, fontSize: 14, lineHeight: 20, textAlign: 'center' },
  cardList: { gap: withuSpacing.md },
  personCard: {
    backgroundColor: withuColors.white,
    borderRadius: withuRadius.lg,
    borderWidth: 1,
    borderColor: withuColors.line,
    padding: withuSpacing.lg,
    ...withuShadows.card,
  },
  personTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatarCircle: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: withuColors.tealBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontSize: 27 },
  personInfo: { flex: 1 },
  personName: { color: withuColors.navy, fontSize: 19, fontWeight: '900' },
  personMeta: { color: withuColors.muted, fontSize: 13, fontWeight: '700', marginTop: 2 },
  timeText: { color: withuColors.teal, fontSize: 12, fontWeight: '900' },
  personMessage: { color: withuColors.text, fontSize: 14, lineHeight: 21, marginTop: 13 },
  joinButton: {
    minHeight: 48,
    backgroundColor: withuColors.coral,
    borderRadius: withuRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 14,
  },
  chatButton: { backgroundColor: withuColors.teal },
  joinButtonText: { color: withuColors.white, fontSize: 15, fontWeight: '900' },
});
