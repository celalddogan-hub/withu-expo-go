import React, { memo, useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
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
  WithUPage,
  WithUScreen,
  WithUTopBar,
} from '../../src/components/withu/WithUPrimitives';

type MatchRow = {
  id: string;
  user_id: string;
  target_id: string;
  action: string | null;
  is_match: boolean | null;
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
  bio: string | null;
};

type MessageRow = {
  id: string;
  conversation_key: string | null;
  sender_id: string | null;
  content: string | null;
  message_type: string | null;
  created_at: string | null;
};

type MatchListItem = {
  matchId: string;
  conversationKey: string;
  profile: ProfileRow | null;
  latestMessage: MessageRow | null;
  createdAt: string | null;
};

function makeConversationKey(a: string, b: string) {
  return [a, b].sort().join('__');
}

function getAvatarEmoji(activity?: string, fallback?: string | null) {
  if (fallback && fallback.trim()) return fallback;

  const value = (activity || '').toLowerCase();

  if (value.includes('kafé') || value.includes('fika') || value.includes('lunch')) return '☕';
  if (value.includes('promenad') || value.includes('löpning') || value.includes('cykling')) {
    return '🚶';
  }
  if (
    value.includes('plug') ||
    value.includes('studie') ||
    value.includes('språk') ||
    value.includes('läxhjälp')
  ) {
    return '📚';
  }
  if (
    value.includes('brädspel') ||
    value.includes('rollspel') ||
    value.includes('escape') ||
    value.includes('dataspel') ||
    value.includes('spela')
  ) {
    return '🎲';
  }
  if (
    value.includes('yoga') ||
    value.includes('gym') ||
    value.includes('träning') ||
    value.includes('padel')
  ) {
    return '💪';
  }
  if (
    value.includes('konsert') ||
    value.includes('film') ||
    value.includes('utställning') ||
    value.includes('foto')
  ) {
    return '🎬';
  }
  if (value.includes('musik')) return '🎵';
  if (value.includes('telefon')) return '📞';
  if (value.includes('kultur')) return '🌍';
  if (value.includes('natur')) return '🌿';

  return '🙂';
}

function getMessagePreview(message: MessageRow | null, currentUserId: string) {
  if (!message) return 'Ny match — öppna chatten';

  const isMine = message.sender_id === currentUserId;

  let baseText = '';
  if (message.message_type === 'image') baseText = '📷 Bild';
  else if (message.message_type === 'audio') baseText = '🎤 Röstmeddelande';
  else baseText = message.content?.trim() || 'Meddelande';

  return isMine ? `Du: ${baseText}` : baseText;
}

function formatDate(value?: string | null) {
  if (!value) return '';

  return new Date(value).toLocaleDateString('sv-SE', {
    day: 'numeric',
    month: 'short',
  });
}

function shallowSameItems(a: MatchListItem[], b: MatchListItem[]) {
  if (a.length !== b.length) return false;

  for (let i = 0; i < a.length; i += 1) {
    const left = a[i];
    const right = b[i];

    if (
      left.matchId !== right.matchId ||
      left.conversationKey !== right.conversationKey ||
      left.createdAt !== right.createdAt ||
      left.profile?.id !== right.profile?.id ||
      left.latestMessage?.id !== right.latestMessage?.id
    ) {
      return false;
    }
  }

  return true;
}

const MatchRowCard = memo(function MatchRowCard({
  item,
  currentUserId,
  onOpenProfile,
  onOpenChat,
}: {
  item: MatchListItem;
  currentUserId: string;
  onOpenProfile: (userId: string) => void;
  onOpenChat: (conversationKey: string) => void;
}) {
  const profile = item.profile;
  const firstActivity = (profile?.activities ?? [])[0] || 'Bara prata';
  const avatarEmoji = getAvatarEmoji(firstActivity, profile?.avatar_emoji);
  const preview = getMessagePreview(item.latestMessage, currentUserId);
  const timeText = formatDate(item.latestMessage?.created_at || item.createdAt);
  const targetUserId = profile?.id || '';

  return (
    <View style={styles.matchCard}>
      <Pressable
        style={({ pressed }) => [styles.leftCol, pressed && styles.sectionPressed]}
        onPress={() => targetUserId && onOpenProfile(targetUserId)}
        disabled={!targetUserId}
      >
        <WithUAvatar emoji={avatarEmoji} size={74} />
      </Pressable>

      <View style={styles.centerCol}>
        <Pressable
          style={({ pressed }) => [
            styles.profilePressArea,
            pressed && styles.sectionPressedSoft,
          ]}
          onPress={() => targetUserId && onOpenProfile(targetUserId)}
          disabled={!targetUserId}
        >
          <Text style={styles.matchName}>
            {profile?.name || 'Match'}
            {profile?.age ? `, ${profile.age}` : ''}
          </Text>

          <Text style={styles.metaText}>
            {profile?.city || 'Plats saknas'}
            {firstActivity ? ` · ${firstActivity}` : ''}
          </Text>

          <View style={styles.tagRow}>
            {(profile?.activities ?? []).slice(0, 3).map((activity) => (
              <View key={activity} style={styles.tagPill}>
                <Text style={styles.tagText}>{activity}</Text>
              </View>
            ))}
          </View>
        </Pressable>

        <Pressable
          style={({ pressed }) => [
            styles.previewPressArea,
            pressed && styles.sectionPressedSoft,
          ]}
          onPress={() => onOpenChat(item.conversationKey)}
        >
          <Text style={styles.previewText} numberOfLines={1}>
            {preview}
          </Text>
        </Pressable>
      </View>

      <Pressable
        style={({ pressed }) => [styles.rightCol, pressed && styles.sectionPressed]}
        onPress={() => onOpenChat(item.conversationKey)}
      >
        {!!timeText && <Text style={styles.timeText}>{timeText}</Text>}
        <Text style={styles.chevron}>›</Text>
      </Pressable>
    </View>
  );
});

export default function MatchesScreen() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorText, setErrorText] = useState('');
  const [currentUserId, setCurrentUserId] = useState('');
  const [items, setItems] = useState<MatchListItem[]>([]);
  const hasLoadedOnce = useRef(false);

  const loadMatches = useCallback(async () => {
    try {
      setErrorText('');

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError) throw userError;

      if (!user) {
        setCurrentUserId('');
        setItems([]);
        setErrorText('Du måste logga in för att se dina matcher.');
        return;
      }

      setCurrentUserId(user.id);

      const [
        { data: outgoingRows, error: outgoingError },
        { data: incomingRows, error: incomingError },
      ] = await Promise.all([
        supabase
          .from('matches')
          .select('id, user_id, target_id, action, is_match, created_at')
          .eq('user_id', user.id)
          .in('action', ['contact', 'like']),
        supabase
          .from('matches')
          .select('id, user_id, target_id, action, is_match, created_at')
          .eq('target_id', user.id)
          .in('action', ['contact', 'like']),
      ]);

      if (outgoingError) throw outgoingError;
      if (incomingError) throw incomingError;

      const outgoing = (outgoingRows ?? []) as MatchRow[];
      const incoming = (incomingRows ?? []) as MatchRow[];

      const outgoingIds = new Set(outgoing.map((row) => row.target_id));
      const mutualIds = [...new Set(incoming.map((row) => row.user_id))].filter((id) =>
        outgoingIds.has(id)
      );

      const matchedIds = new Set(
        outgoing.filter((row) => row.is_match === true).map((row) => row.target_id)
      );

      const needRepairIds = mutualIds.filter((id) => !matchedIds.has(id));

      if (needRepairIds.length > 0) {
        for (const otherUserId of needRepairIds) {
          await Promise.all([
            supabase
              .from('matches')
              .update({ is_match: true })
              .eq('user_id', user.id)
              .eq('target_id', otherUserId)
              .in('action', ['contact', 'like']),
            supabase
              .from('matches')
              .update({ is_match: true })
              .eq('user_id', otherUserId)
              .eq('target_id', user.id)
              .in('action', ['contact', 'like']),
          ]);

          matchedIds.add(otherUserId);
        }
      }

      const matchedOutgoing = outgoing.filter(
        (row) => matchedIds.has(row.target_id) || row.is_match === true
      );

      if (matchedOutgoing.length === 0) {
        setItems((prev) => (prev.length === 0 ? prev : []));
        return;
      }

      const targetIds = [...new Set(matchedOutgoing.map((row) => row.target_id))];
      const conversationKeys = matchedOutgoing.map((row) =>
        makeConversationKey(user.id, row.target_id)
      );

      const [
        { data: profileRows, error: profileError },
        { data: messageRows, error: messageError },
      ] = await Promise.all([
        supabase
          .from('profiles')
          .select(
            'id, name, age, city, activities, avatar_emoji, is_bankid_verified, bio'
          )
          .in('id', targetIds),
        supabase
          .from('messages')
          .select(
            'id, conversation_key, sender_id, content, message_type, created_at'
          )
          .in('conversation_key', conversationKeys)
          .order('created_at', { ascending: false }),
      ]);

      if (profileError) throw profileError;
      if (messageError) throw messageError;

      const profileMap = new Map<string, ProfileRow>();
      ((profileRows ?? []) as ProfileRow[]).forEach((profile) => {
        profileMap.set(profile.id, profile);
      });

      const latestMessageByConversation = new Map<string, MessageRow>();
      ((messageRows ?? []) as MessageRow[]).forEach((message) => {
        if (!message.conversation_key) return;
        if (!latestMessageByConversation.has(message.conversation_key)) {
          latestMessageByConversation.set(message.conversation_key, message);
        }
      });

      const builtItems: MatchListItem[] = matchedOutgoing
        .map((match) => {
          const conversationKey = makeConversationKey(user.id, match.target_id);

          return {
            matchId: match.id,
            conversationKey,
            profile: profileMap.get(match.target_id) ?? null,
            latestMessage: latestMessageByConversation.get(conversationKey) ?? null,
            createdAt: match.created_at,
          };
        })
        .sort((a, b) => {
          const aTime = a.latestMessage?.created_at || a.createdAt || '';
          const bTime = b.latestMessage?.created_at || b.createdAt || '';
          return new Date(bTime).getTime() - new Date(aTime).getTime();
        });

      setItems((prev) => (shallowSameItems(prev, builtItems) ? prev : builtItems));
    } catch (error: any) {
      setItems([]);
      setErrorText(error?.message || 'Kunde inte ladda matcher.');
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (!hasLoadedOnce.current) {
        setLoading(true);
        loadMatches().finally(() => {
          setLoading(false);
          hasLoadedOnce.current = true;
        });
      } else {
        loadMatches();
      }
    }, [loadMatches])
  );

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadMatches();
    setRefreshing(false);
  };

  const countText = useMemo(() => {
    if (items.length === 0) return 'Inga matcher ännu';
    if (items.length === 1) return '1 match';
    return `${items.length} matcher`;
  }, [items.length]);

  const openProfile = useCallback(
    (userId: string) => {
      if (!userId) return;

      router.push({
        pathname: '/user/[userId]',
        params: { userId },
      });
    },
    [router]
  );

  const openChat = useCallback(
    (conversationKey: string) => {
      router.push({
        pathname: '/chat/[conversationKey]',
        params: { conversationKey },
      });
    },
    [router]
  );

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
            <Text style={styles.stateText}>Vi hämtar era kontakter.</Text>
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

      <FlatList
        data={items}
        keyExtractor={(item) => `${item.matchId}-${item.conversationKey}`}
        style={styles.scroll}
        contentContainerStyle={items.length === 0 ? styles.emptyContent : styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
        showsVerticalScrollIndicator={false}
        initialNumToRender={10}
        windowSize={8}
        removeClippedSubviews
        ListHeaderComponent={
          <WithUPage style={styles.page}>
            <View style={styles.heroBlock}>
              <Text style={styles.heroTitle}>Matcher</Text>
              <Text style={styles.heroSubtitle}>{countText}</Text>
            </View>

            <Pressable
              style={[styles.refreshButton, refreshing && styles.buttonDisabled]}
              onPress={handleRefresh}
              disabled={refreshing}
            >
              <Text style={styles.refreshButtonText}>
                {refreshing ? 'Uppdaterar...' : 'Uppdatera'}
              </Text>
            </Pressable>

            <View style={styles.sectionHeader}>
              <Text style={styles.sectionEmoji}>💬</Text>
              <Text style={styles.sectionTitle}>Konversationer</Text>
            </View>

            {errorText ? (
              <View style={styles.stateCard}>
                <Text style={styles.stateTitle}>Något gick fel</Text>
                <Text style={styles.stateText}>{errorText}</Text>
              </View>
            ) : null}
          </WithUPage>
        }
        ListEmptyComponent={
          !errorText ? (
            <WithUPage>
              <View style={styles.emptyCard}>
                <Text style={styles.emptyTitle}>Inga matcher ännu</Text>
                <Text style={styles.emptyText}>
                  När någon också vill ha kontakt dyker personen upp här.
                </Text>
              </View>
            </WithUPage>
          ) : null
        }
        renderItem={({ item }) => (
          <WithUPage style={styles.rowPage}>
            <MatchRowCard
              item={item}
              currentUserId={currentUserId}
              onOpenProfile={openProfile}
              onOpenChat={openChat}
            />
          </WithUPage>
        )}
      />
    </WithUScreen>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: withuColors.cream },
  content: { paddingBottom: 36 },
  emptyContent: { paddingBottom: 36, flexGrow: 1 },
  page: { paddingTop: withuSpacing.lg },
  rowPage: { paddingTop: 0 },
  pageOnly: { paddingTop: withuSpacing.xl },

  heroBlock: { marginBottom: 12 },
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
    backgroundColor: withuColors.coral,
    borderRadius: 999,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
  },
  refreshButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '900',
  },
  buttonDisabled: {
    opacity: 0.6,
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
    color: '#C97C12',
  },

  matchCard: {
    backgroundColor: withuColors.white,
    borderRadius: withuRadius.xl,
    borderWidth: 1,
    borderColor: withuColors.line,
    padding: withuSpacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    ...withuShadows.card,
  },

  leftCol: {
    marginRight: 14,
    borderRadius: 999,
  },

  centerCol: {
    flex: 1,
  },

  profilePressArea: {
    borderRadius: 14,
    paddingVertical: 2,
    marginBottom: 4,
  },

  previewPressArea: {
    borderRadius: 14,
    paddingVertical: 4,
  },

  rightCol: {
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    minHeight: 90,
    marginLeft: 12,
    borderRadius: 14,
    paddingLeft: 4,
  },

  sectionPressed: {
    opacity: 0.72,
  },

  sectionPressedSoft: {
    opacity: 0.84,
  },

  matchName: {
    fontSize: 20,
    fontWeight: '900',
    color: withuColors.navy,
    marginBottom: 4,
  },

  previewText: {
    fontSize: 15,
    lineHeight: 22,
    color: '#1E6958',
    fontWeight: '800',
    marginBottom: 6,
  },

  metaText: {
    fontSize: 14,
    color: withuColors.muted,
    marginBottom: 10,
  },

  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },

  tagPill: {
    backgroundColor: withuColors.soft,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },

  tagText: {
    color: withuColors.navy,
    fontSize: 12,
    fontWeight: '800',
  },

  timeText: {
    fontSize: 13,
    color: withuColors.muted,
    fontWeight: '700',
    marginBottom: 8,
  },

  chevron: {
    fontSize: 36,
    lineHeight: 36,
    color: withuColors.muted,
  },

  emptyCard: {
    backgroundColor: withuColors.white,
    borderRadius: withuRadius.xl,
    borderWidth: 1,
    borderColor: withuColors.line,
    padding: withuSpacing.xxl,
    alignItems: 'center',
    ...withuShadows.card,
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
    marginBottom: 10,
    textAlign: 'center',
  },

  stateText: {
    color: '#555555',
    fontSize: 15,
    lineHeight: 24,
    textAlign: 'center',
  },
});