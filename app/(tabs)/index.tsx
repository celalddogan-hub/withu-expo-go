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
import { ensureTrustAllowed } from '../../src/lib/trust';

type FilterKey =
  | 'alla'
  | 'prata'
  | 'fika'
  | 'gaming'
  | 'studier'
  | 'sport'
  | 'kultur'
  | 'kreativitet'
  | 'familj'
  | 'sprak'
  | 'senior'
  | 'stod'
  | 'natur'
  | 'mat';

type ProfileRow = {
  id: string;
  name: string | null;
  age: number | null;
  min_age: number | null;
  max_age: number | null;
  city: string | null;
  activities: string[] | null;
  avatar_url: string | null;
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

type AdminRow = {
  user_id: string | null;
};

const DISCOVER_ACTIONS = [
  { emoji: '⚡', title: 'Ses nu', sub: 'tillgängliga personer', route: '/now' },
  { emoji: '📍', title: 'Karta', sub: 'bara ungefärligt område', route: '/nearby' },
  { emoji: '💙', title: 'Personer för dig', sub: 'trygga samtal', route: '/matches' },
  { emoji: '🤝', title: 'Volontärstöd', sub: 'prata med stödperson', route: '/volunteers' },
];

const NEED_OPTIONS = [
  {
    icon: 'chatbubble-ellipses-outline' as const,
    title: 'Jag vill prata',
    sub: 'Hitta någon som kan lyssna en stund.',
    onPress: 'prata',
  },
  {
    icon: 'cafe-outline' as const,
    title: 'Jag vill träffa någon',
    sub: 'Fika, promenad eller annan trygg aktivitet.',
    onPress: 'ses',
  },
  {
    icon: 'heart-outline' as const,
    title: 'Jag känner mig ensam',
    sub: 'Du behöver inte bära det själv.',
    onPress: 'ensam',
  },
  {
    icon: 'hand-left-outline' as const,
    title: 'Jag vill stötta någon',
    sub: 'Finns till för någon som behöver sällskap.',
    onPress: 'stod',
  },
];

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'alla', label: 'Alla' },
  { key: 'prata', label: 'Prata' },
  { key: 'fika', label: 'Fika' },
  { key: 'gaming', label: 'Gaming' },
  { key: 'studier', label: 'Studier' },
  { key: 'sport', label: 'Sport' },
  { key: 'kultur', label: 'Kultur' },
  { key: 'kreativitet', label: 'Kreativt' },
  { key: 'familj', label: 'Familj' },
  { key: 'sprak', label: 'Språk' },
  { key: 'senior', label: 'Senior' },
  { key: 'stod', label: 'Stöd' },
  { key: 'natur', label: 'Natur' },
  { key: 'mat', label: 'Mat' },
];

const QUICK_QUESTIONS = [
  'Vill du prata lite?',
  'Ska vi ta en kort promenad?',
  'Vill du hitta på något enkelt?',
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

  const filterKeywords: Record<Exclude<FilterKey, 'alla' | 'prata'>, string[]> = {
    fika: ['fika', 'kafe', 'kaffe', 'lunch', 'middag', 'picknick', 'bara prata'],
    gaming: ['gaming', 'datorspel', 'bradspel', 'rollspel', 'escape', 'kortspel', 'sallskapsspel', 'spela'],
    studier: ['stud', 'laxhjalp', 'sprakbyte', 'pluggsallskap', 'studiecirkel', 'bokclub', 'debatt'],
    sport: ['tran', 'sport', 'lopning', 'gym', 'yoga', 'padel', 'cykling', 'simning', 'fotboll', 'vandring', 'klattring', 'tennis'],
    kultur: ['musik', 'kultur', 'konsert', 'replokal', 'teater', 'bio', 'museum', 'konstutstallning', 'dans'],
    kreativitet: ['foto', 'konst', 'malning', 'skrivande', 'design', 'hantverk', 'keramik', 'sticka'],
    familj: ['familj', 'foralder', 'lekpark', 'barn', 'sandlada', 'babygrupp'],
    sprak: ['sprak', 'integration', 'kulturutbyte', 'sprakcafe', 'internationell', 'konversation'],
    senior: ['senior', 'hembesok', 'sallskap hemma', 'promenadkompis', 'berattarstund', 'teknik'],
    stod: ['stod', 'samtal', 'telefonsamtal', 'videosamtal', 'anonymt', 'krisstod', 'lyssna'],
    natur: ['natur', 'friluft', 'naturpromenad', 'fagelskadning', 'barplockning', 'fiske', 'camping', 'tradgard'],
    mat: ['mat', 'dryck', 'laga mat', 'baka', 'vinprovning', 'matmarknad', 'recept'],
  };

  return filterKeywords[filter].some((keyword) => searchable.includes(keyword));
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
      void (async () => {
        try {
          const { count } = await supabase
            .from('volunteer_availability')
            .select('id', { count: 'exact', head: true })
            .eq('status', 'active')
            .gt('active_until', nowIso);
          setVolunteerCount(count ?? 0);
        } catch {
          setVolunteerCount(0);
        }
      })();

      const [ownProfile, outgoingMatches, incomingMatches, blockedIds, adminRows, profileRows] =
        await Promise.all([
        supabase.from('profiles').select('name, age, min_age, max_age').eq('id', user.id).maybeSingle(),
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
        supabase.from('admins').select('user_id'),
        supabase
          .from('profiles')
          .select('id, name, age, min_age, max_age, city, activities, avatar_url, avatar_emoji, is_bankid_verified, bio')
          .neq('id', user.id)
          .eq('is_profile_complete', true)
          .eq('is_discoverable', true)
          .limit(30),
      ]);

      if (ownProfile.error) throw ownProfile.error;
      if (outgoingMatches.error) throw outgoingMatches.error;
      if (incomingMatches.error) throw incomingMatches.error;
      if (adminRows.error) throw adminRows.error;
      if (profileRows.error) throw profileRows.error;

      const ownAge = ownProfile.data?.age ?? null;
      const ownMinAge = ownProfile.data?.min_age ?? 18;
      const ownMaxAge = ownProfile.data?.max_age ?? 99;

      const outgoing = (outgoingMatches.data ?? []) as MatchRow[];
      const incoming = (incomingMatches.data ?? []) as MatchRow[];
      const adminIds = new Set(((adminRows.data ?? []) as AdminRow[]).map((row) => row.user_id).filter(Boolean));
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
          .filter((profile) => !adminIds.has(profile.id))
          .filter((profile) => !blockedIds.has(profile.id))
          .filter((profile) => {
            if (profile.age == null) return true;
            return profile.age >= ownMinAge && profile.age <= ownMaxAge;
          })
          .filter((profile) => {
            if (ownAge == null) return true;
            const theirMinAge = profile.min_age ?? 18;
            const theirMaxAge = profile.max_age ?? 99;
            return ownAge >= theirMinAge && ownAge <= theirMaxAge;
          })
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
      const allowed = await ensureTrustAllowed('match');
      if (!allowed) return;

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

  const sendQuickQuestion = async (profile: ProfileRow, question: string) => {
    if (!currentUserId || sending) return;

    try {
      const allowed = await ensureTrustAllowed('match');
      if (!allowed) return;

      setSending(profile.id);
      const { error } = await supabase.from('matches').upsert(
        {
          user_id: currentUserId,
          target_id: profile.id,
          action: 'like',
          is_match: false,
        },
        { onConflict: 'user_id,target_id,action' }
      );

      if (error) throw error;
      setContactedIds((prev) => (prev.includes(profile.id) ? prev : [...prev, profile.id]));
      Alert.alert('Fråga skickad', `${profile.name || 'Personen'} får din fråga och kan svara om det känns rätt.`);
    } catch (error: any) {
      Alert.alert('Kunde inte skicka fråga', error?.message || 'Försök igen om en stund.');
    } finally {
      setSending(null);
    }
  };

  return (
    <WithUScreen>
      <WithUTopBar
        title="WithU"
        subtitle="Du är aldrig ensam."
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
            <View style={styles.heroTopRow}>
              <View style={styles.livePill}>
                <View style={styles.liveDot} />
                <Text style={styles.liveText}>Behov först</Text>
              </View>
              <Text style={styles.heroCount}>Inte efter utseende</Text>
            </View>
            <Text style={styles.heroTitle}>Vad behöver du just nu?</Text>
            <Text style={styles.heroText}>
              Välj ett behov, så hjälper WithU dig hitta rätt kontakt tryggt och enkelt.
            </Text>
            <View style={styles.needGrid}>
              {NEED_OPTIONS.map((need) => (
                <Pressable
                  key={need.title}
                  accessibilityRole="button"
                  accessibilityLabel={need.title}
                  style={styles.needCard}
                  onPress={() => {
                    if (need.onPress === 'prata') setFilter('prata');
                    if (need.onPress === 'ses') router.push('/now' as any);
                    if (need.onPress === 'ensam') router.push('/volunteers' as any);
                    if (need.onPress === 'stod') router.push('/volunteers/apply' as any);
                  }}
                >
                  <Ionicons name={need.icon} size={22} color={withuColors.teal} />
                  <Text style={styles.needTitle}>{need.title}</Text>
                  <Text style={styles.needSub}>{need.sub}</Text>
                </Pressable>
              ))}
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.actionRail}>
              {DISCOVER_ACTIONS.map((action) => (
                <Pressable
                  key={action.title}
                  accessibilityRole="button"
                  accessibilityLabel={action.title}
                  style={styles.actionCard}
                  onPress={() => router.push(action.route as any)}
                >
                  <Text style={styles.actionEmoji}>{action.emoji}</Text>
                  <Text style={styles.actionTitle}>{action.title}</Text>
                  <Text style={styles.actionSub}>{action.sub}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>

          <Pressable style={styles.volunteerCard} onPress={() => router.push('/volunteers')}>
            <Text style={styles.volunteerIcon}>🤝</Text>
            <View style={styles.volunteerTextWrap}>
              <Text style={styles.volunteerTitle}>Volontärstöd</Text>
              <Text style={styles.volunteerText}>
                {volunteerCount > 0
                  ? `${volunteerCount} stödpersoner är tillgängliga just nu.`
                  : 'Prata med en stödperson eller ansök om att hjälpa andra.'}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={withuColors.navy} />
          </Pressable>

          <View style={styles.searchWrap}>
            <Ionicons name="search" size={18} color={withuColors.muted} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Sök behov, aktivitet eller stad"
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
              <Text style={styles.emptyTitle}>Ingen passande kontakt just nu</Text>
              <Text style={styles.centerText}>
                Byt behov, se volontärstöd eller kom tillbaka om en stund.
              </Text>
            </View>
          ) : (
            <View style={styles.profileList}>
              <Text style={styles.sectionLabel}>Trygga kontakter för ditt behov</Text>
              {visibleProfiles.map((profile) => {
                const avatar = getAvatarEmoji(profile);
                const city = profile.city || 'Plats saknas';
                const firstActivity = profile.activities?.[0] || 'Prata';
                const quickQuestion = QUICK_QUESTIONS[profile.id.charCodeAt(0) % QUICK_QUESTIONS.length];
                return (
                  <View key={profile.id} style={styles.profileCard}>
                    <View style={styles.cardStatusRow}>
                      <View style={styles.activeNowPill}>
                        <View style={styles.activeNowDot} />
                        <Text style={styles.activeNowText}>Aktiv idag</Text>
                      </View>
                        <Text style={styles.cardHint}>Frivilligt och tryggt</Text>
                    </View>

                    <View style={styles.profileTop}>
                      <View style={styles.avatarBubble}>
                        <WithUAvatar emoji={avatar} imageUrl={profile.avatar_url} size={62} />
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
                      <View style={styles.matchScore}>
                        <Ionicons name="sparkles" size={14} color={withuColors.coral} />
                        <Text style={styles.matchScoreText}>Bra match</Text>
                      </View>
                    </View>

                    {profile.bio?.trim() ? (
                      <Text style={styles.bioText} numberOfLines={3}>
                        {profile.bio.trim()}
                      </Text>
                    ) : null}

                    <Pressable
                      style={styles.quickQuestionCard}
                      onPress={() => sendQuickQuestion(profile, quickQuestion)}
                      disabled={!!sending}
                    >
                      <Ionicons name="chatbubble-ellipses-outline" size={18} color={withuColors.teal} />
                      <Text style={styles.quickQuestionText}>{quickQuestion}</Text>
                    </Pressable>

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
                      <Text style={styles.secondaryButtonText}>Kontaktkort</Text>
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
  heroTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  livePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: withuRadius.pill,
    paddingHorizontal: 11,
    paddingVertical: 7,
  },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: withuColors.success },
  liveText: { color: withuColors.white, fontSize: 12, fontWeight: '900' },
  heroCount: { color: 'rgba(255,255,255,0.74)', fontSize: 12, fontWeight: '900' },
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
  needGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 16,
  },
  needCard: {
    width: '48%',
    minHeight: 132,
    borderRadius: withuRadius.lg,
    backgroundColor: 'rgba(255,255,255,0.96)',
    padding: 13,
    justifyContent: 'space-between',
  },
  needTitle: { color: withuColors.navy, fontSize: 15, fontWeight: '900', lineHeight: 18, marginTop: 8 },
  needSub: { color: withuColors.muted, fontSize: 11, fontWeight: '800', lineHeight: 15, marginTop: 5 },
  actionRail: { gap: 10, paddingTop: 16 },
  actionCard: {
    width: 118,
    minHeight: 96,
    borderRadius: withuRadius.lg,
    backgroundColor: withuColors.white,
    padding: 12,
    justifyContent: 'space-between',
  },
  actionEmoji: { fontSize: 25 },
  actionTitle: { color: withuColors.navy, fontSize: 14, fontWeight: '900' },
  actionSub: { color: withuColors.muted, fontSize: 10, fontWeight: '800', marginTop: 2 },
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
  sectionLabel: {
    color: withuColors.muted,
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  profileCard: {
    backgroundColor: withuColors.white,
    borderRadius: withuRadius.lg,
    borderWidth: 1,
    borderColor: withuColors.line,
    padding: withuSpacing.lg,
    ...withuShadows.card,
  },
  cardStatusRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  activeNowPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: withuColors.successBg,
    borderRadius: withuRadius.pill,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  activeNowDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: withuColors.success },
  activeNowText: { color: withuColors.teal, fontSize: 11, fontWeight: '900' },
  cardHint: { color: withuColors.muted, fontSize: 11, fontWeight: '800' },
  profileTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatarBubble: {
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: withuColors.tealBg,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarText: { fontSize: 30 },
  profileInfo: { flex: 1 },
  profileName: { color: withuColors.navy, fontSize: 20, fontWeight: '900' },
  profileMeta: { color: withuColors.muted, fontSize: 14, fontWeight: '700', marginTop: 2 },
  verifiedText: { color: withuColors.teal, fontSize: 12, fontWeight: '900', marginTop: 5 },
  matchScore: {
    borderRadius: withuRadius.pill,
    backgroundColor: withuColors.coralBg,
    paddingHorizontal: 9,
    paddingVertical: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  matchScoreText: { color: withuColors.coral, fontSize: 10, fontWeight: '900' },
  bioText: { color: withuColors.text, fontSize: 14, lineHeight: 21, marginTop: 14 },
  quickQuestionCard: {
    minHeight: 48,
    borderRadius: withuRadius.md,
    backgroundColor: withuColors.tealBg,
    borderWidth: 1,
    borderColor: 'rgba(28,94,82,0.18)',
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 14,
  },
  quickQuestionText: { flex: 1, color: withuColors.teal, fontSize: 13, fontWeight: '900' },
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
