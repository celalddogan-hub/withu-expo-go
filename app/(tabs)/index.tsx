import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../src/lib/supabase';
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

type FilterKey = 'alla' | 'prata' | 'fika' | 'promenad' | 'spela' | 'studera';

type ProfileRow = {
  id: string;
  name: string | null;
  age: number | null;
  city: string | null;
  activities: string[] | null;
  avatar_emoji: string | null;
  is_bankid_verified: boolean | null;
  bio: string | null;
};

type MatchRow = {
  user_id: string;
  target_id: string;
  is_match: boolean | null;
};

type BlockedRow = {
  blockerad_av: string | null;
  blockerad: string | null;
};

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'alla', label: 'Alla' },
  { key: 'prata', label: 'Prata' },
  { key: 'fika', label: 'Fika' },
  { key: 'promenad', label: 'Promenad' },
  { key: 'spela', label: 'Spela' },
  { key: 'studera', label: 'Studera' },
];

function normalize(value: string) {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

function makeConversationKey(a: string, b: string) {
  return [a, b].sort().join('__');
}

function getAvatarEmoji(profile: ProfileRow) {
  if (profile.avatar_emoji?.trim()) return profile.avatar_emoji;

  const text = normalize([profile.bio, ...(profile.activities ?? [])].filter(Boolean).join(' '));
  if (text.includes('fika') || text.includes('kaffe')) return '☕';
  if (text.includes('promenad') || text.includes('natur')) return '🚶';
  if (text.includes('spel') || text.includes('escape')) return '🎲';
  if (text.includes('stud')) return '📚';
  if (text.includes('musik')) return '🎵';
  if (text.includes('tran')) return '💪';
  return '🙂';
}

function profileMatchesFilter(profile: ProfileRow, filter: FilterKey, query: string) {
  const searchable = normalize(
    [
      profile.name,
      profile.city,
      profile.bio,
      ...(profile.activities ?? []),
      profile.age ? String(profile.age) : '',
    ]
      .filter(Boolean)
      .join(' ')
  );

  if (query.trim() && !searchable.includes(normalize(query))) return false;
  if (filter === 'alla') return true;
  if (filter === 'prata') {
    return (
      searchable.includes('prata') ||
      searchable.includes('samtal') ||
      searchable.includes('lyssna') ||
      searchable.includes('chatt')
    );
  }

  return searchable.includes(filter);
}

async function loadBlockedIds(currentUserId: string) {
  const { data, error } = await supabase
    .from('blocked_users')
    .select('blockerad_av, blockerad')
    .or(`blockerad_av.eq.${currentUserId},blockerad.eq.${currentUserId}`);

  if (error) throw error;

  return new Set(
    ((data ?? []) as BlockedRow[])
      .map((row) => (row.blockerad_av === currentUserId ? row.blockerad : row.blockerad_av))
      .filter(Boolean) as string[]
  );
}

export default function HittaScreen() {
  const router = useRouter();

  const [currentUserId, setCurrentUserId] = useState('');
  const [userName, setUserName] = useState('');
  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  const [contactedIds, setContactedIds] = useState<string[]>([]);
  const [matchedIds, setMatchedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<FilterKey>('alla');
  const [volunteerCount, setVolunteerCount] = useState(0);
  const hasLoadedOnce = useRef(false);

  const visibleProfiles = useMemo(
    () =>
      profiles
        .filter((profile) => !matchedIds.includes(profile.id))
        .filter((profile) => !contactedIds.includes(profile.id))
        .filter((profile) => profileMatchesFilter(profile, filter, query)),
    [profiles, matchedIds, contactedIds, filter, query]
  );

  const loadData = useCallback(async () => {
    try {
      if (!hasLoadedOnce.current) setLoading(true);

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError) throw userError;
      if (!user) {
        setCurrentUserId('');
        setProfiles([]);
        setContactedIds([]);
        setMatchedIds([]);
        return;
      }

      setCurrentUserId(user.id);

      const nowIso = new Date().toISOString();
      const [ownProfile, outgoingMatches, incomingMatches, blockedIds, profileRows, volunteerCountResult] =
        await Promise.all([
        supabase.from('profiles').select('name').eq('id', user.id).maybeSingle(),
        supabase
          .from('matches')
          .select('user_id, target_id, is_match')
          .eq('user_id', user.id)
          .in('action', ['like', 'superlike']),
        supabase
          .from('matches')
          .select('user_id, target_id, is_match')
          .eq('target_id', user.id)
          .in('action', ['like', 'superlike']),
        loadBlockedIds(user.id),
        supabase
          .from('profiles')
          .select('id, name, age, city, activities, avatar_emoji, is_bankid_verified, bio')
          .neq('id', user.id)
          .eq('is_profile_complete', true)
          .limit(30),
        supabase
          .from('volunteer_availability')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'active')
          .gt('active_until', nowIso),
      ]);

      if (ownProfile.error) throw ownProfile.error;
      if (outgoingMatches.error) throw outgoingMatches.error;
      if (incomingMatches.error) throw incomingMatches.error;
      if (profileRows.error) throw profileRows.error;
      if (volunteerCountResult.error) throw volunteerCountResult.error;

      setUserName(ownProfile.data?.name || '');
      setVolunteerCount(volunteerCountResult.count ?? 0);

      const outgoing = (outgoingMatches.data ?? []) as MatchRow[];
      const incoming = (incomingMatches.data ?? []) as MatchRow[];
      const contacted = outgoing.map((row) => row.target_id);
      const matched = new Set(outgoing.filter((row) => row.is_match).map((row) => row.target_id));

      for (const incomingLike of incoming) {
        if (contacted.includes(incomingLike.user_id)) {
          matched.add(incomingLike.user_id);
        }
      }

      setContactedIds([...new Set(contacted)]);
      setMatchedIds([...matched]);
      setProfiles(
        ((profileRows.data ?? []) as ProfileRow[])
          .filter((profile) => !blockedIds.has(profile.id))
          .filter((profile) => (profile.activities ?? []).length > 0 || !!profile.bio?.trim())
      );
    } catch (error: any) {
      Alert.alert('Något gick fel', error?.message || 'Kunde inte ladda Hitta.');
    } finally {
      hasLoadedOnce.current = true;
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  const likeProfile = async (profile: ProfileRow) => {
    if (!currentUserId || sending) return;

    try {
      setSending(profile.id);

      const { error: upsertError } = await supabase.from('matches').upsert(
        {
          user_id: currentUserId,
          target_id: profile.id,
          action: 'like',
          is_match: false,
        },
        { onConflict: 'user_id,target_id,action' }
      );

      if (upsertError) throw upsertError;

      const { data: reciprocal, error: reciprocalError } = await supabase
        .from('matches')
        .select('id')
        .eq('user_id', profile.id)
        .eq('target_id', currentUserId)
        .in('action', ['like', 'superlike'])
        .maybeSingle();

      if (reciprocalError) throw reciprocalError;

      setContactedIds((prev) => (prev.includes(profile.id) ? prev : [...prev, profile.id]));

      if (reciprocal?.id) {
        const [ownUpdate, otherUpdate] = await Promise.all([
          supabase
            .from('matches')
            .update({ is_match: true })
            .eq('user_id', currentUserId)
            .eq('target_id', profile.id)
            .in('action', ['like', 'superlike']),
          supabase
            .from('matches')
            .update({ is_match: true })
            .eq('user_id', profile.id)
            .eq('target_id', currentUserId)
            .in('action', ['like', 'superlike']),
        ]);

        if (ownUpdate.error) throw ownUpdate.error;
        if (otherUpdate.error) throw otherUpdate.error;

        setMatchedIds((prev) => (prev.includes(profile.id) ? prev : [...prev, profile.id]));
        router.push({
          pathname: '/chat/[conversationKey]',
          params: { conversationKey: makeConversationKey(currentUserId, profile.id) },
        });
      } else {
        Alert.alert(
          'Skickat',
          `${profile.name || 'Personen'} försvinner från Hitta. Om ni båda gillar varandra öppnas chatten.`
        );
      }
    } catch (error: any) {
      Alert.alert('Kunde inte matcha', error?.message || 'Försök igen om en stund.');
    } finally {
      setSending(null);
    }
  };

  return (
    <WithUScreen>
      <WithUTopBar
        title="WithU"
        subtitle="Hitta personer att prata med."
        right={<WithUAvatar emoji="😊" size={34} />}
      />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <WithUPage style={styles.page}>
          <View style={styles.heroCard}>
            <Text style={styles.heroEyebrow}>Hitta</Text>
            <Text style={styles.heroTitle}>
              {userName ? `Hej ${userName}, välj vad du söker` : 'Välj vad du söker'}
            </Text>
            <Text style={styles.heroText}>
              Sök på aktivitet, stad eller namn. När du gillar någon tas personen bort från Hitta
              och väntar på svar.
            </Text>
            <View style={styles.heroQuickActions}>
              <Pressable style={styles.heroQuickButton} onPress={() => router.push('/nearby')}>
                <Text style={styles.heroQuickEmoji}>📍</Text>
                <Text style={styles.heroQuickText}>Karta</Text>
              </Pressable>
              <Pressable style={styles.heroQuickButton} onPress={() => router.push('/matches')}>
                <Text style={styles.heroQuickEmoji}>💙</Text>
                <Text style={styles.heroQuickText}>Matcher</Text>
              </Pressable>
            </View>
          </View>

          <Pressable style={styles.volunteerCard} onPress={() => router.push('/volunteers')}>
            <Text style={styles.volunteerIcon}>🤝</Text>
            <View style={styles.volunteerTextWrap}>
              <Text style={styles.volunteerTitle}>Volontärer nära dig</Text>
              <Text style={styles.volunteerText}>
                {volunteerCount > 0
                  ? `${volunteerCount} volontärer är aktiva just nu.`
                  : 'Öppna volontärprogrammet och se stödpersoner.'}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={withuColors.navy} />
          </Pressable>

          <View style={styles.searchWrap}>
            <Ionicons name="search" size={18} color={withuColors.muted} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Sök aktivitet, stad eller person"
              placeholderTextColor={withuColors.muted}
              style={styles.searchInput}
              autoCapitalize="none"
              returnKeyType="search"
            />
            {query ? (
              <Pressable onPress={() => setQuery('')}>
                <Ionicons name="close-circle" size={18} color={withuColors.muted} />
              </Pressable>
            ) : null}
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filterRow}
          >
            {FILTERS.map((item) => {
              const active = item.key === filter;
              return (
                <Pressable
                  key={item.key}
                  style={[styles.filterChip, active && styles.filterChipActive]}
                  onPress={() => setFilter(item.key)}
                >
                  <Text style={[styles.filterText, active && styles.filterTextActive]}>
                    {item.label}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>

          {loading ? (
            <View style={styles.centerCard}>
              <ActivityIndicator color={withuColors.teal} size="large" />
              <Text style={styles.centerText}>Laddar personer...</Text>
            </View>
          ) : visibleProfiles.length === 0 ? (
            <View style={styles.centerCard}>
              <Text style={styles.emptyTitle}>Inga nya personer just nu</Text>
              <Text style={styles.centerText}>
                Byt filter, sök på något annat eller kom tillbaka senare.
              </Text>
            </View>
          ) : (
            <View style={styles.profileList}>
              {visibleProfiles.map((profile) => {
                const avatar = getAvatarEmoji(profile);
                const city = profile.city || 'Plats saknas';
                const firstActivity = profile.activities?.[0] || 'Prata';
                return (
                  <View key={profile.id} style={styles.profileCard}>
                    <View style={styles.profileTop}>
                      <View style={styles.avatarBubble}>
                        <Text style={styles.avatarText}>{avatar}</Text>
                      </View>
                      <View style={styles.profileInfo}>
                        <Text style={styles.profileName}>
                          {profile.name || 'Användare'}
                          {profile.age ? `, ${profile.age}` : ''}
                        </Text>
                        <Text style={styles.profileMeta}>
                          {city} · {firstActivity}
                        </Text>
                        {profile.is_bankid_verified ? (
                          <Text style={styles.verifiedText}>Verifierad</Text>
                        ) : null}
                      </View>
                    </View>

                    {profile.bio?.trim() ? (
                      <Text style={styles.bioText} numberOfLines={3}>
                        {profile.bio.trim()}
                      </Text>
                    ) : null}

                    <View style={styles.activityRow}>
                      {(profile.activities ?? []).slice(0, 4).map((activity) => (
                        <View key={activity} style={styles.activityChip}>
                          <Text style={styles.activityText}>{activity}</Text>
                        </View>
                      ))}
                    </View>

                    <View style={styles.actions}>
                      <Pressable
                        style={styles.secondaryButton}
                        onPress={() => router.push(`/user/${profile.id}`)}
                        disabled={!!sending}
                      >
                        <Text style={styles.secondaryButtonText}>Profil</Text>
                      </Pressable>
                      <Pressable
                        style={[styles.primaryButton, sending === profile.id && styles.disabled]}
                        onPress={() => likeProfile(profile)}
                        disabled={!!sending}
                      >
                        <Text style={styles.primaryButtonText}>
                          {sending === profile.id ? 'Skickar...' : 'Vill prata'}
                        </Text>
                      </Pressable>
                    </View>
                  </View>
                );
              })}
            </View>
          )}
        </WithUPage>
      </ScrollView>
    </WithUScreen>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: withuColors.cream },
  content: { paddingBottom: 40 },
  page: { paddingTop: withuSpacing.lg },
  heroCard: {
    backgroundColor: withuColors.navy,
    borderRadius: withuRadius.lg,
    padding: withuSpacing.xl,
    marginBottom: withuSpacing.md,
    ...withuShadows.card,
  },
  heroEyebrow: {
    color: withuColors.success,
    fontSize: 12,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    marginBottom: 8,
  },
  heroTitle: {
    color: withuColors.white,
    fontSize: 27,
    lineHeight: 32,
    fontWeight: '900',
    marginBottom: 10,
  },
  heroText: {
    color: 'rgba(255,255,255,0.78)',
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '700',
  },
  heroQuickActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 16,
  },
  heroQuickButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
    borderRadius: withuRadius.pill,
    paddingHorizontal: 13,
    paddingVertical: 9,
  },
  heroQuickEmoji: { fontSize: 15 },
  heroQuickText: { color: withuColors.white, fontSize: 13, fontWeight: '900' },
  volunteerCard: {
    backgroundColor: withuColors.white,
    borderRadius: withuRadius.lg,
    borderWidth: 1,
    borderColor: withuColors.line,
    padding: withuSpacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: withuSpacing.md,
    ...withuShadows.card,
  },
  volunteerIcon: { fontSize: 28 },
  volunteerTextWrap: { flex: 1 },
  volunteerTitle: { color: withuColors.navy, fontSize: 16, fontWeight: '900' },
  volunteerText: { color: withuColors.muted, fontSize: 12, lineHeight: 18, marginTop: 2 },
  searchWrap: {
    backgroundColor: withuColors.white,
    borderRadius: withuRadius.md,
    borderWidth: 1.5,
    borderColor: withuColors.line,
    minHeight: 48,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: withuSpacing.md,
  },
  searchInput: {
    flex: 1,
    color: withuColors.navy,
    fontSize: 15,
    fontWeight: '700',
    paddingVertical: 0,
  },
  filterRow: { gap: 8, paddingBottom: withuSpacing.md },
  filterChip: {
    paddingHorizontal: 15,
    paddingVertical: 9,
    borderRadius: withuRadius.pill,
    backgroundColor: withuColors.white,
    borderWidth: 1,
    borderColor: withuColors.line,
  },
  filterChipActive: {
    backgroundColor: withuColors.teal,
    borderColor: withuColors.teal,
  },
  filterText: { color: withuColors.navy, fontWeight: '900', fontSize: 13 },
  filterTextActive: { color: withuColors.white },
  centerCard: {
    backgroundColor: withuColors.white,
    borderRadius: withuRadius.lg,
    borderWidth: 1,
    borderColor: withuColors.line,
    padding: 24,
    alignItems: 'center',
    gap: 10,
  },
  emptyTitle: { color: withuColors.navy, fontSize: 20, fontWeight: '900', textAlign: 'center' },
  centerText: { color: withuColors.muted, fontSize: 14, lineHeight: 20, textAlign: 'center' },
  profileList: { gap: withuSpacing.md },
  profileCard: {
    backgroundColor: withuColors.white,
    borderRadius: withuRadius.lg,
    borderWidth: 1,
    borderColor: withuColors.line,
    padding: withuSpacing.lg,
    ...withuShadows.card,
  },
  profileTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatarBubble: {
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: withuColors.tealBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontSize: 30 },
  profileInfo: { flex: 1 },
  profileName: { color: withuColors.navy, fontSize: 20, fontWeight: '900' },
  profileMeta: { color: withuColors.muted, fontSize: 14, fontWeight: '700', marginTop: 2 },
  verifiedText: { color: withuColors.teal, fontSize: 12, fontWeight: '900', marginTop: 5 },
  bioText: { color: withuColors.text, fontSize: 14, lineHeight: 21, marginTop: 14 },
  activityRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14 },
  activityChip: {
    backgroundColor: withuColors.soft,
    borderRadius: withuRadius.pill,
    paddingHorizontal: 11,
    paddingVertical: 6,
  },
  activityText: { color: withuColors.navy, fontSize: 12, fontWeight: '800' },
  actions: { flexDirection: 'row', gap: 10, marginTop: 16 },
  secondaryButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: withuRadius.md,
    borderWidth: 1.5,
    borderColor: withuColors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonText: { color: withuColors.navy, fontSize: 15, fontWeight: '900' },
  primaryButton: {
    flex: 1.4,
    minHeight: 48,
    borderRadius: withuRadius.md,
    backgroundColor: withuColors.teal,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: { color: withuColors.white, fontSize: 15, fontWeight: '900' },
  disabled: { opacity: 0.55 },
});
