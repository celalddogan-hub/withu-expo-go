import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import { supabase } from '../../src/lib/supabase';
import {
  withuColors,
  withuRadius,
  withuShadows,
  withuSpacing,
} from '../../src/theme/withuTheme';
import {
  WithUAvatar,
  WithUBadge,
  WithUCard,
  WithUPage,
  WithUPrimaryButton,
  WithUSectionLabel,
  WithUScreen,
  WithUSubtitle,
  WithUTitle,
  WithUTopBar,
} from '../../src/components/withu/WithUPrimitives';

type MatchRow = {
  id: string;
  user_id: string;
  target_id: string;
  is_match: boolean | null;
  action?: string | null;
  created_at: string | null;
};

type ProfileRow = {
  id: string;
  name: string | null;
  age: number | null;
  city: string | null;
  activities: string[] | null;
  avatar_emoji: string | null;
  is_bankid_verified: boolean | null;
};

type MessageRow = {
  id: string;
  match_id: string;
  sender_id: string | null;
  content: string | null;
  message_type: string | null;
  media_url: string | null;
  read_at: string | null;
  created_at: string | null;
};

type MatchListItem = {
  matchId: string;
  createdAt: string | null;
  profile: ProfileRow | null;
  latestMessage: MessageRow | null;
  unreadCount: number;
};

function getAvatarEmoji(activity?: string, fallback?: string | null) {
  if (fallback && fallback.trim()) return fallback;

  const value = (activity || '').toLowerCase();

  if (value.includes('kafé') || value.includes('fika') || value.includes('lunch')) return '☕';
  if (value.includes('promenad') || value.includes('löpning') || value.includes('cykling')) return '🚶';
  if (value.includes('plug') || value.includes('studie') || value.includes('språk') || value.includes('läxhjälp')) return '📚';
  if (value.includes('brädspel') || value.includes('rollspel') || value.includes('escape') || value.includes('dataspel') || value.includes('spela')) return '🎲';
  if (value.includes('yoga') || value.includes('gym') || value.includes('träning') || value.includes('padel')) return '💪';
  if (value.includes('konsert') || value.includes('film') || value.includes('utställning') || value.includes('foto')) return '🎬';
  if (value.includes('musik')) return '🎵';
  if (value.includes('telefon')) return '📞';
  if (value.includes('kultur')) return '🌍';
  if (value.includes('natur')) return '🌿';

  return '🙂';
}

function getMessagePreview(message: MessageRow | null) {
  if (!message) return 'Tryck för att öppna chatten';
  if (message.message_type === 'image') return '📷 Bild';
  if (message.message_type === 'audio') return '🎤 Röstmeddelande';

  const text = message.content?.trim();
  return text || 'Tryck för att öppna chatten';
}

function formatMatchTime(value?: string | null) {
  if (!value) return '';

  const date = new Date(value);
  const now = new Date();

  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();

  if (sameDay) {
    return date.toLocaleTimeString('sv-SE', {
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  return date.toLocaleDateString('sv-SE', {
    day: 'numeric',
    month: 'short',
  });
}

export default function MatchesScreen() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorText, setErrorText] = useState('');
  const [currentUserId, setCurrentUserId] = useState('');
  const [items, setItems] = useState<MatchListItem[]>([]);

  const loadMatches = useCallback(async () => {
    try {
      setErrorText('');

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setCurrentUserId('');
        setItems([]);
        setErrorText('Du måste logga in för att se dina matcher.');
        return;
      }

      setCurrentUserId(user.id);

      const { data: blockedRows, error: blockedError } = await supabase
        .from('blocked_users')
        .select('blockerad_av, blockerad')
        .or(`blockerad_av.eq.${user.id},blockerad.eq.${user.id}`);

      if (blockedError) throw blockedError;

      const blockedIds = new Set(
        (blockedRows ?? [])
          .map((row: any) =>
            row.blockerad_av === user.id ? row.blockerad : row.blockerad_av
          )
          .filter(Boolean)
      );

      const { data: matchRows, error: matchError } = await supabase
        .from('matches')
        .select('id, user_id, target_id, is_match, action, created_at')
        .eq('user_id', user.id)
        .eq('is_match', true)
        .order('created_at', { ascending: false });

      if (matchError) throw matchError;

      const ownMatches = ((matchRows ?? []) as MatchRow[]).filter(
        (row) => !blockedIds.has(row.target_id)
      );

      if (ownMatches.length === 0) {
        setItems([]);
        return;
      }

      const targetIds = ownMatches.map((row) => row.target_id);
      const matchIds = ownMatches.map((row) => row.id);

      const { data: profileRows, error: profileError } = await supabase
        .from('profiles')
        .select('id, name, age, city, activities, avatar_emoji, is_bankid_verified')
        .in('id', targetIds);

      if (profileError) throw profileError;

      const profileMap = new Map<string, ProfileRow>();
      ((profileRows ?? []) as ProfileRow[]).forEach((profile) => {
        profileMap.set(profile.id, profile);
      });

      const { data: messageRows, error: messageError } = await supabase
        .from('messages')
        .select('id, match_id, sender_id, content, message_type, media_url, read_at, created_at')
        .in('match_id', matchIds)
        .order('created_at', { ascending: false });

      if (messageError) throw messageError;

      const messagesByMatch = new Map<string, MessageRow[]>();
      ((messageRows ?? []) as MessageRow[]).forEach((message) => {
        const list = messagesByMatch.get(message.match_id) ?? [];
        list.push(message);
        messagesByMatch.set(message.match_id, list);
      });

      const builtItems: MatchListItem[] = ownMatches
        .map((match) => {
          const profile = profileMap.get(match.target_id) ?? null;
          const messages = messagesByMatch.get(match.id) ?? [];
          const latestMessage = messages.length > 0 ? messages[0] : null;
          const unreadCount = messages.filter(
            (message) => message.sender_id !== user.id && !message.read_at
          ).length;

          return {
            matchId: match.id,
            createdAt: match.created_at,
            profile,
            latestMessage,
            unreadCount,
          };
        })
        .sort((a, b) => {
          const aTime = a.latestMessage?.created_at || a.createdAt || '';
          const bTime = b.latestMessage?.created_at || b.createdAt || '';
          return new Date(bTime).getTime() - new Date(aTime).getTime();
        });

      setItems(builtItems);
    } catch (error: any) {
      setItems([]);
      setErrorText(error?.message || 'Kunde inte ladda matcher.');
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      loadMatches().finally(() => {
        setLoading(false);
        setRefreshing(false);
      });
    }, [loadMatches])
  );

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadMatches();
    setRefreshing(false);
  };

  const matchCountText = useMemo(() => {
    if (items.length === 1) return '1 match';
    return `${items.length} matcher`;
  }, [items.length]);

  if (loading) {
    return (
      <WithUScreen>
        <WithUTopBar
          title="WithU"
          subtitle="Du är aldrig ensam."
          right={<WithUAvatar emoji="😊" size={34} />}
        />
        <WithUPage style={styles.pageOnly}>
          <View style={styles.stateCard}>
            <ActivityIndicator size="large" color={withuColors.coral} />
            <Text style={styles.stateTitle}>Laddar matcher...</Text>
            <Text style={styles.stateText}>
              Vi hämtar dina matchningar och senaste konversationer.
            </Text>
          </View>
        </WithUPage>
      </WithUScreen>
    );
  }

  if (errorText) {
    return (
      <WithUScreen>
        <WithUTopBar
          title="WithU"
          subtitle="Du är aldrig ensam."
          right={<WithUAvatar emoji="😊" size={34} />}
        />
        <WithUPage style={styles.pageOnly}>
          <View style={styles.stateCard}>
            <Text style={styles.stateTitle}>Matcher kunde inte laddas</Text>
            <Text style={styles.stateText}>{errorText}</Text>
            <WithUPrimaryButton title="Försök igen" onPress={handleRefresh} />
          </View>
        </WithUPage>
      </WithUScreen>
    );
  }

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
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
        showsVerticalScrollIndicator={false}
      >
        <WithUPage style={styles.page}>
          <View style={styles.heroBlock}>
            <Text style={styles.heroTitle}>Matcher</Text>
            <Text style={styles.heroSubtitle}>{matchCountText}</Text>
          </View>

          <WithUPrimaryButton
            title={refreshing ? 'Uppdaterar...' : 'Uppdatera'}
            onPress={handleRefresh}
            disabled={refreshing}
            style={styles.refreshButton}
          />

          <View style={styles.sectionHeader}>
            <Text style={styles.sectionEmoji}>💬</Text>
            <Text style={styles.sectionTitle}>Konversationer</Text>
          </View>

          {items.length === 0 ? (
            <WithUCard>
              <Text style={styles.emptyTitle}>Inga matcher ännu</Text>
              <Text style={styles.emptyText}>
                När två personer gillar varandra hamnar matchen här och ni kan börja chatta direkt.
              </Text>
            </WithUCard>
          ) : (
            <View style={styles.listWrap}>
              {items.map((item) => {
                const profile = item.profile;
                const firstActivity = (profile?.activities ?? [])[0] || 'Aktivitet';
                const avatarEmoji = getAvatarEmoji(firstActivity, profile?.avatar_emoji);
                const preview = getMessagePreview(item.latestMessage);
                const timeText = formatMatchTime(
                  item.latestMessage?.created_at || item.createdAt
                );

                return (
                  <Pressable
                    key={item.matchId}
                    onPress={() =>
                      router.push({
                        pathname: '/chat/[matchId]',
                        params: { matchId: item.matchId },
                      })
                    }
                    style={({ pressed }) => [
                      styles.matchCard,
                      pressed && styles.matchCardPressed,
                    ]}
                  >
                    <View style={styles.matchCardLeft}>
                      <WithUAvatar emoji={avatarEmoji} size={64} />
                    </View>

                    <View style={styles.matchCardCenter}>
                      <Text style={styles.matchName}>
                        {profile?.name || 'Match'}
                        {profile?.age ? `, ${profile.age}` : ''}
                      </Text>

                      <Text style={styles.matchPreview}>{preview}</Text>

                      <Text style={styles.matchMeta}>
                        {profile?.city || 'Plats saknas'}
                        {firstActivity ? ` · ${firstActivity}` : ''}
                      </Text>

                      <View style={styles.tagsWrap}>
                        {(profile?.activities ?? []).slice(0, 3).map((activity) => (
                          <View key={`${item.matchId}-${activity}`} style={styles.tag}>
                            <Text style={styles.tagText}>{activity}</Text>
                          </View>
                        ))}
                      </View>
                    </View>

                    <View style={styles.matchCardRight}>
                      {!!timeText && <Text style={styles.timeText}>{timeText}</Text>}

                      {profile?.is_bankid_verified ? (
                        <WithUBadge title="✓" variant="verified" style={styles.verifiedBadge} />
                      ) : null}

                      {item.unreadCount > 0 ? (
                        <View style={styles.unreadBubble}>
                          <Text style={styles.unreadBubbleText}>
                            {item.unreadCount > 9 ? '9+' : item.unreadCount}
                          </Text>
                        </View>
                      ) : (
                        <Text style={styles.chevron}>›</Text>
                      )}
                    </View>
                  </Pressable>
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
  scroll: {
    flex: 1,
    backgroundColor: withuColors.cream,
  },
  content: {
    paddingBottom: 36,
  },
  page: {
    paddingTop: withuSpacing.lg,
  },
  pageOnly: {
    paddingTop: withuSpacing.xl,
  },
  heroBlock: {
    marginBottom: 12,
  },
  heroTitle: {
    fontSize: 34,
    fontWeight: '900',
    color: withuColors.navy,
    marginBottom: 4,
  },
  heroSubtitle: {
    fontSize: 15,
    color: withuColors.muted,
  },
  refreshButton: {
    marginBottom: 18,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },
  sectionEmoji: {
    fontSize: 26,
    marginRight: 8,
  },
  sectionTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: '#C9781E',
  },
  listWrap: {
    gap: 12,
  },
  matchCard: {
    backgroundColor: withuColors.white,
    borderRadius: withuRadius.xl,
    borderWidth: 1,
    borderColor: withuColors.line,
    padding: withuSpacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    ...withuShadows.card,
  },
  matchCardPressed: {
    opacity: 0.9,
  },
  matchCardLeft: {
    marginRight: 14,
  },
  matchCardCenter: {
    flex: 1,
  },
  matchCardRight: {
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    minHeight: 86,
    marginLeft: 12,
  },
  matchName: {
    fontSize: 20,
    fontWeight: '900',
    color: withuColors.navy,
    marginBottom: 4,
  },
  matchPreview: {
    fontSize: 15,
    lineHeight: 22,
    color: '#1E6958',
    fontWeight: '700',
    marginBottom: 6,
  },
  matchMeta: {
    fontSize: 14,
    color: withuColors.muted,
    marginBottom: 10,
  },
  tagsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  tag: {
    backgroundColor: withuColors.soft,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  tagText: {
    color: withuColors.navy,
    fontSize: 12,
    fontWeight: '700',
  },
  timeText: {
    fontSize: 13,
    color: withuColors.muted,
    fontWeight: '700',
    marginBottom: 6,
  },
  verifiedBadge: {
    marginBottom: 8,
  },
  unreadBubble: {
    minWidth: 24,
    height: 24,
    borderRadius: 12,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: withuColors.coral,
  },
  unreadBubbleText: {
    color: withuColors.white,
    fontSize: 11,
    fontWeight: '900',
  },
  chevron: {
    fontSize: 34,
    lineHeight: 34,
    color: withuColors.muted,
    fontWeight: '400',
  },
  emptyTitle: {
    fontSize: 26,
    fontWeight: '900',
    color: withuColors.navy,
    marginBottom: 10,
    textAlign: 'center',
  },
  emptyText: {
    fontSize: 15,
    lineHeight: 24,
    color: '#555555',
    textAlign: 'center',
  },
  stateCard: {
    backgroundColor: withuColors.white,
    borderRadius: withuRadius.xl,
    borderWidth: 1,
    borderColor: withuColors.line,
    padding: withuSpacing.xxl,
    alignItems: 'center',
    ...withuShadows.card,
  },
  stateTitle: {
    color: withuColors.navy,
    fontSize: 26,
    fontWeight: '900',
    marginTop: 14,
    marginBottom: 10,
    textAlign: 'center',
  },
  stateText: {
    color: '#555555',
    fontSize: 15,
    lineHeight: 24,
    textAlign: 'center',
    marginBottom: 20,
  },
});