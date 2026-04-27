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
  avatar_url: string | null;
  avatar_emoji: string | null;
  is_bankid_verified: boolean | null;
};

type MessageRow = {
  id: string;
  conversation_key: string | null;
  sender_id: string | null;
  content: string | null;
  message_type: string | null;
  media_url: string | null;
  read_at: string | null;
  created_at: string | null;
};

type BlockedRow = {
  blockerad_av: string | null;
  blockerad: string | null;
};

type HiddenConversationRow = {
  conversation_key: string | null;
};

type ChatListItem = {
  matchId: string;
  conversationKey: string;
  createdAt: string | null;
  profile: ProfileRow | null;
  latestMessage: MessageRow | null;
  unreadCount: number;
};

function makeConversationKey(a: string, b: string) {
  return [a, b].sort().join('__');
}

function pickBestMatch(rows: MatchRow[]) {
  if (rows.length === 0) return null;

  const sorted = [...rows].sort((a, b) => {
    const aPriority = a.action === 'contact' ? 0 : 1;
    const bPriority = b.action === 'contact' ? 0 : 1;

    if (aPriority !== bPriority) return aPriority - bPriority;

    return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
  });

  return sorted[0];
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
  if (!message) return 'Ny match — starta chatten';

  const isMine = message.sender_id === currentUserId;

  let baseText = '';
  if (message.message_type === 'image') baseText = '📷 Bild';
  else if (message.message_type === 'audio') baseText = '🎤 Röstmeddelande';
  else baseText = message.content?.trim() || 'Meddelande';

  return isMine ? `Du: ${baseText}` : baseText;
}

function formatTime(value?: string | null) {
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

function shallowSameItems(a: ChatListItem[], b: ChatListItem[]) {
  if (a.length !== b.length) return false;

  for (let i = 0; i < a.length; i += 1) {
    const left = a[i];
    const right = b[i];

    if (
      left.matchId !== right.matchId ||
      left.conversationKey !== right.conversationKey ||
      left.unreadCount !== right.unreadCount ||
      left.latestMessage?.id !== right.latestMessage?.id ||
      left.profile?.id !== right.profile?.id
    ) {
      return false;
    }
  }

  return true;
}

function repairMatchesInBackground(currentUserId: string, otherUserIds: string[]) {
  if (!currentUserId || otherUserIds.length === 0) return;

  Promise.allSettled(
    otherUserIds.flatMap((otherUserId) => [
      supabase
        .from('matches')
        .update({ is_match: true })
        .eq('user_id', currentUserId)
        .eq('target_id', otherUserId)
        .in('action', ['contact', 'like']),
      supabase
        .from('matches')
        .update({ is_match: true })
        .eq('user_id', otherUserId)
        .eq('target_id', currentUserId)
        .in('action', ['contact', 'like']),
    ])
  ).catch(() => {
    // ignore
  });
}

const ChatRow = memo(function ChatRow({
  item,
  currentUserId,
  onOpenConversation,
  onOpenProfile,
}: {
  item: ChatListItem;
  currentUserId: string;
  onOpenConversation: (conversationKey: string) => void;
  onOpenProfile: (userId: string) => void;
}) {
  const profile = item.profile;
  const firstActivity = (profile?.activities ?? [])[0] || 'Aktivitet';
  const avatarEmoji = getAvatarEmoji(firstActivity, profile?.avatar_emoji);
  const preview = getMessagePreview(item.latestMessage, currentUserId);
  const timeText = formatTime(item.latestMessage?.created_at || item.createdAt);
  const targetUserId = profile?.id || '';

  return (
    <View style={styles.chatCard}>
      <Pressable
        style={({ pressed }) => [styles.avatarPress, pressed && styles.sectionPressed]}
        onPress={() => targetUserId && onOpenProfile(targetUserId)}
        disabled={!targetUserId}
      >
        <WithUAvatar emoji={avatarEmoji} imageUrl={profile?.avatar_url} size={64} />
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
          <Text style={styles.chatName}>
            {profile?.name || 'Match'}
            {profile?.age ? `, ${profile.age}` : ''}
          </Text>

          <Text style={styles.chatMeta}>
            {profile?.city || 'Plats saknas'}
            {firstActivity ? ` · ${firstActivity}` : ''}
          </Text>
        </Pressable>

        <Pressable
          style={({ pressed }) => [
            styles.previewPressArea,
            pressed && styles.sectionPressedSoft,
          ]}
          onPress={() => onOpenConversation(item.conversationKey)}
        >
          <Text
            style={[
              styles.chatPreview,
              item.unreadCount > 0 && styles.chatPreviewUnread,
            ]}
            numberOfLines={2}
          >
            {preview}
          </Text>
        </Pressable>
      </View>

      <Pressable
        style={({ pressed }) => [styles.rightCol, pressed && styles.sectionPressed]}
        onPress={() => onOpenConversation(item.conversationKey)}
      >
        {!!timeText && <Text style={styles.timeText}>{timeText}</Text>}

        {item.unreadCount > 0 ? (
          <View style={styles.unreadBubble}>
            <Text style={styles.unreadBubbleText}>
              {item.unreadCount > 9 ? '9+' : item.unreadCount}
            </Text>
          </View>
        ) : (
          <Text style={styles.chevron}>›</Text>
        )}
      </Pressable>
    </View>
  );
});

export default function ChatListScreen() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorText, setErrorText] = useState('');
  const [currentUserId, setCurrentUserId] = useState('');
  const [items, setItems] = useState<ChatListItem[]>([]);
  const hasLoadedOnce = useRef(false);

  const loadChats = useCallback(async () => {
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
        setErrorText('Du måste logga in för att se dina chattar.');
        return;
      }

      setCurrentUserId(user.id);

      const [
        { data: outgoingRows, error: outgoingError },
        { data: incomingRows, error: incomingError },
        { data: blockedRows, error: blockedError },
        { data: hiddenRows, error: hiddenError },
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
        supabase
          .from('blocked_users')
          .select('blockerad_av, blockerad')
          .or(`blockerad_av.eq.${user.id},blockerad.eq.${user.id}`),
        supabase
          .from('hidden_conversations')
          .select('conversation_key')
          .eq('user_id', user.id),
      ]);

      if (outgoingError) throw outgoingError;
      if (incomingError) throw incomingError;
      if (blockedError) throw blockedError;
      if (hiddenError) throw hiddenError;

      const outgoing = (outgoingRows ?? []) as MatchRow[];
      const incoming = (incomingRows ?? []) as MatchRow[];

      const outgoingIds = new Set(outgoing.map((row) => row.target_id));
      const mutualIds = [...new Set(incoming.map((row) => row.user_id))].filter((id) =>
        outgoingIds.has(id)
      );

      const matchedIds = new Set(
        outgoing.filter((row) => row.is_match === true).map((row) => row.target_id)
      );

      mutualIds.forEach((id) => matchedIds.add(id));

      const needRepairIds = mutualIds.filter(
        (id) => !outgoing.some((row) => row.target_id === id && row.is_match === true)
      );
      repairMatchesInBackground(user.id, needRepairIds);

      const matchedOutgoing = outgoing.filter((row) => matchedIds.has(row.target_id));

      if (matchedOutgoing.length === 0) {
        setItems((prev) => (prev.length === 0 ? prev : []));
        return;
      }

      const groupedByTarget = new Map<string, MatchRow[]>();
      matchedOutgoing.forEach((match) => {
        const list = groupedByTarget.get(match.target_id) ?? [];
        list.push(match);
        groupedByTarget.set(match.target_id, list);
      });

      const bestMatches = [...groupedByTarget.values()]
        .map((rows) => pickBestMatch(rows))
        .filter(Boolean) as MatchRow[];

      if (bestMatches.length === 0) {
        setItems((prev) => (prev.length === 0 ? prev : []));
        return;
      }

      const blockedIds = new Set(
        ((blockedRows ?? []) as BlockedRow[])
          .map((row) => (row.blockerad_av === user.id ? row.blockerad : row.blockerad_av))
          .filter(Boolean) as string[]
      );

      const hiddenConversationKeys = new Set(
        ((hiddenRows ?? []) as HiddenConversationRow[])
          .map((row) => row.conversation_key)
          .filter(Boolean) as string[]
      );

      const visibleMatches = bestMatches.filter((match) => {
        const conversationKey = makeConversationKey(user.id, match.target_id);
        return !blockedIds.has(match.target_id) && !hiddenConversationKeys.has(conversationKey);
      });

      if (visibleMatches.length === 0) {
        setItems((prev) => (prev.length === 0 ? prev : []));
        return;
      }

      const targetIds = [...new Set(visibleMatches.map((row) => row.target_id))];
      const conversationKeys = visibleMatches.map((row) =>
        makeConversationKey(user.id, row.target_id)
      );

      const [
        { data: profileRows, error: profileError },
        { data: messageRows, error: messageError },
      ] = await Promise.all([
        supabase
          .from('profiles')
          .select('id, name, age, city, activities, avatar_url, avatar_emoji, is_bankid_verified')
          .in('id', targetIds),
        supabase
          .from('messages')
          .select(
            'id, conversation_key, sender_id, content, message_type, media_url, read_at, created_at'
          )
          .in('conversation_key', conversationKeys)
          .order('created_at', { ascending: false })
          .limit(120),
      ]);

      if (profileError) throw profileError;
      if (messageError) throw messageError;

      const profileMap = new Map<string, ProfileRow>();
      ((profileRows ?? []) as ProfileRow[]).forEach((profile) => {
        profileMap.set(profile.id, profile);
      });

      const latestMessageByConversation = new Map<string, MessageRow>();
      const unreadCountByConversation = new Map<string, number>();

      ((messageRows ?? []) as MessageRow[]).forEach((message) => {
        if (!message.conversation_key) return;

        if (!latestMessageByConversation.has(message.conversation_key)) {
          latestMessageByConversation.set(message.conversation_key, message);
        }

        if (message.sender_id !== user.id && !message.read_at) {
          unreadCountByConversation.set(
            message.conversation_key,
            (unreadCountByConversation.get(message.conversation_key) ?? 0) + 1
          );
        }
      });

      const builtItems: ChatListItem[] = visibleMatches
        .map((match) => {
          const conversationKey = makeConversationKey(user.id, match.target_id);

          return {
            matchId: match.id,
            conversationKey,
            createdAt: match.created_at,
            profile: profileMap.get(match.target_id) ?? null,
            latestMessage: latestMessageByConversation.get(conversationKey) ?? null,
            unreadCount: unreadCountByConversation.get(conversationKey) ?? 0,
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
      setErrorText(error?.message || 'Kunde inte ladda chattar.');
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (!hasLoadedOnce.current) {
        setLoading(true);
        loadChats().finally(() => {
          setLoading(false);
          hasLoadedOnce.current = true;
        });
      } else {
        loadChats();
      }
    }, [loadChats])
  );

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadChats();
    setRefreshing(false);
  };

  const unreadTotal = useMemo(() => {
    return items.reduce((sum, item) => sum + item.unreadCount, 0);
  }, [items]);

  const subtitleText = useMemo(() => {
    if (items.length === 0) return 'Inga konversationer ännu';
    if (unreadTotal > 0) return `${unreadTotal} olästa meddelanden`;
    return `${items.length} aktiva konversationer`;
  }, [items.length, unreadTotal]);

  const openConversation = useCallback(
    (conversationKey: string) => {
      router.push({
        pathname: '/chat/[conversationKey]',
        params: { conversationKey },
      });
    },
    [router]
  );

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
            <Text style={styles.stateTitle}>Laddar chattar...</Text>
            <Text style={styles.stateText}>Vi hämtar dina konversationer.</Text>
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
              <Text style={styles.heroTitle}>Chatt</Text>
              <Text style={styles.heroSubtitle}>{subtitleText}</Text>
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

            <Pressable style={styles.matchesShortcut} onPress={() => router.push('/matches')}>
              <Text style={styles.matchesShortcutEmoji}>💙</Text>
              <View style={styles.matchesShortcutTextWrap}>
                <Text style={styles.matchesShortcutTitle}>Matcher</Text>
                <Text style={styles.matchesShortcutText}>
                  Se personer som du kan börja prata med.
                </Text>
              </View>
              <Text style={styles.matchesShortcutArrow}>›</Text>
            </Pressable>

            <View style={styles.sectionHeader}>
              <Text style={styles.sectionEmoji}>📨</Text>
              <Text style={styles.sectionTitle}>Dina samtal</Text>
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
                <Text style={styles.emptyTitle}>Inga chattar ännu</Text>
                <Text style={styles.emptyText}>
                  När du får en match och börjar skriva dyker konversationen upp här.
                </Text>
              </View>
            </WithUPage>
          ) : null
        }
        renderItem={({ item }) => (
          <WithUPage style={styles.rowPage}>
            <ChatRow
              item={item}
              currentUserId={currentUserId}
              onOpenConversation={openConversation}
              onOpenProfile={openProfile}
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

  matchesShortcut: {
    backgroundColor: withuColors.white,
    borderRadius: withuRadius.xl,
    borderWidth: 1,
    borderColor: withuColors.line,
    padding: withuSpacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 18,
    ...withuShadows.card,
  },
  matchesShortcutEmoji: {
    fontSize: 30,
    marginRight: 12,
  },
  matchesShortcutTextWrap: {
    flex: 1,
  },
  matchesShortcutTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: withuColors.navy,
    marginBottom: 2,
  },
  matchesShortcutText: {
    fontSize: 13,
    lineHeight: 18,
    color: withuColors.muted,
    fontWeight: '700',
  },
  matchesShortcutArrow: {
    fontSize: 28,
    color: withuColors.muted,
    marginLeft: 8,
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
    color: '#1E6958',
  },

  chatCard: {
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

  avatarPress: {
    marginRight: 14,
    borderRadius: 999,
  },

  centerCol: {
    flex: 1,
  },

  profilePressArea: {
    borderRadius: 12,
    paddingVertical: 2,
    marginBottom: 4,
  },

  previewPressArea: {
    borderRadius: 12,
    paddingVertical: 4,
  },

  rightCol: {
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    minHeight: 76,
    marginLeft: 12,
    borderRadius: 12,
    paddingLeft: 4,
  },

  sectionPressed: {
    opacity: 0.7,
  },
  sectionPressedSoft: {
    opacity: 0.82,
  },

  chatName: {
    fontSize: 20,
    fontWeight: '900',
    color: withuColors.navy,
    marginBottom: 4,
  },
  chatPreview: {
    fontSize: 15,
    lineHeight: 22,
    color: '#555555',
    marginBottom: 6,
  },
  chatPreviewUnread: {
    color: '#1E6958',
    fontWeight: '800',
  },
  chatMeta: {
    fontSize: 14,
    color: withuColors.muted,
  },

  timeText: {
    fontSize: 13,
    color: withuColors.muted,
    fontWeight: '700',
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
