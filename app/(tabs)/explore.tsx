import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
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
import { guardContentOrShowHelp } from '../../src/lib/crisisSafety';
import {
  ensureMatchedConversation,
  getMatchedTargetIds,
} from '../../src/lib/matchChat';
import {
  createScopedRealtimeChannel,
  removeChannelSafely,
} from '../../src/lib/realtime';
import {
  withuColors,
  withuRadius,
  withuShadows,
  withuSpacing,
} from '../../src/theme/withuTheme';
import {
  WithUAvatar,
  WithUPage,
  WithUPrimaryButton,
  WithUScreen,
  WithUTopBar,
} from '../../src/components/withu/WithUPrimitives';

type ThoughtVisibility = 'anonymous' | 'nickname' | 'firstname';
type ThoughtTalkStatus = 'pending' | 'accepted' | 'declined';
type ThoughtFilter = 'alla' | 'matchade' | 'mina';

type ThoughtRow = {
  id: string;
  user_id: string;
  text: string | null;
  content?: string | null;
  visibility: ThoughtVisibility;
  is_active: boolean;
  created_at: string;
};

type ThoughtCommentRow = {
  id: string;
  thought_id: string;
  user_id: string;
  text: string | null;
  content?: string | null;
  created_at: string;
};

type ThoughtReactionRow = {
  id: string;
  thought_id: string;
  user_id: string;
  reaction: string;
  created_at: string;
};

type ThoughtTalkRequestRow = {
  id: string;
  thought_id: string;
  requester_id: string;
  owner_id: string;
  status: ThoughtTalkStatus;
  created_at: string;
  updated_at: string;
};

type ProfileRow = {
  id: string;
  name: string | null;
  avatar_emoji: string | null;
  is_bankid_verified: boolean | null;
};

type BlockedRow = {
  blockerad_av: string | null;
  blockerad: string | null;
};

type IncomingRequest = {
  id: string;
  requesterId: string;
  requesterName: string;
  requesterEmoji: string;
};

type ThoughtCard = {
  id: string;
  userId: string;
  text: string;
  visibility: ThoughtVisibility;
  createdAt: string;
  timeLabel: string;
  authorName: string;
  authorEmoji: string;
  badgeText: string;
  canOpenProfile: boolean;
  isMine: boolean;
  isMatched: boolean;
  isBankIdVerified: boolean;
  likeCount: number;
  likedByMe: boolean;
  myReactionId: string | null;
  comments: ThoughtCommentRow[];
  outgoingRequestStatus: ThoughtTalkStatus | null;
  incomingRequests: IncomingRequest[];
};

function formatRelativeTime(value: string) {
  const diffMs = Math.max(0, Date.now() - new Date(value).getTime());
  const minutes = Math.floor(diffMs / 60000);
  const hours = Math.floor(diffMs / 3600000);
  const days = Math.floor(diffMs / 86400000);

  if (minutes < 1) return 'Nyss';
  if (minutes < 60) return `För ${minutes} min sedan`;
  if (hours < 24) return `För ${hours} tim sedan`;
  return `För ${days} dag sedan`;
}

function firstName(name?: string | null) {
  if (!name) return '';
  return name.trim().split(' ')[0] || '';
}

function getSafeText(value?: string | null, fallback?: string | null) {
  return (value ?? fallback ?? '').trim();
}

function getThoughtHeader(profile: ProfileRow | null, visibility: ThoughtVisibility) {
  if (visibility === 'anonymous') {
    return {
      authorName: '',
      authorEmoji: '🌸',
      badgeText: '🌸 Anonym',
      canOpenProfile: false,
    };
  }

  if (visibility === 'nickname') {
    return {
      authorName: 'Medlem',
      authorEmoji: profile?.avatar_emoji || '🙂',
      badgeText: '💙 Smeknamn',
      canOpenProfile: true,
    };
  }

  return {
    authorName: firstName(profile?.name) || 'Medlem',
    authorEmoji: profile?.avatar_emoji || '🙂',
    badgeText: '🙂 Förnamn',
    canOpenProfile: true,
  };
}

async function loadBlockedIds(currentUserId: string) {
  const { data, error } = await supabase
    .from('blocked_users')
    .select('blockerad_av, blockerad')
    .or(`blockerad_av.eq.${currentUserId},blockerad.eq.${currentUserId}`);

  if (error) throw error;

  return new Set(
    ((data ?? []) as BlockedRow[])
      .map((row) =>
        row.blockerad_av === currentUserId ? row.blockerad : row.blockerad_av
      )
      .filter(Boolean) as string[]
  );
}

export default function TankarScreen() {
  const router = useRouter();
  const handledAcceptedIds = useRef<Set<string>>(new Set());
  const requesterChannelRef = useRef<RealtimeChannel | null>(null);
  const ownerChannelRef = useRef<RealtimeChannel | null>(null);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [currentUserId, setCurrentUserId] = useState('');
  const [thoughts, setThoughts] = useState<ThoughtCard[]>([]);
  const [errorText, setErrorText] = useState('');

  const [composerOpen, setComposerOpen] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [draftText, setDraftText] = useState('');
  const [visibility, setVisibility] = useState<ThoughtVisibility>('anonymous');

  const [selectedThoughtId, setSelectedThoughtId] = useState<string | null>(null);
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});
  const [submittingCommentId, setSubmittingCommentId] = useState('');
  const [sendingTalkId, setSendingTalkId] = useState('');
  const [processingRequestId, setProcessingRequestId] = useState('');
  const [activeFilter, setActiveFilter] = useState<ThoughtFilter>('alla');

  const remaining = useMemo(() => 500 - draftText.length, [draftText.length]);

  const selectedThought = useMemo(
    () => thoughts.find((thought) => thought.id === selectedThoughtId) ?? null,
    [thoughts, selectedThoughtId]
  );

  const selectedCommentDraft = selectedThoughtId
    ? commentDrafts[selectedThoughtId] || ''
    : '';

  const filteredThoughts = useMemo(() => {
    if (activeFilter === 'matchade') {
      return thoughts.filter((thought) => !thought.isMine && thought.isMatched);
    }

    if (activeFilter === 'mina') {
      return thoughts.filter((thought) => thought.isMine);
    }

    return thoughts;
  }, [thoughts, activeFilter]);

  const teardownThoughtRealtime = useCallback(async () => {
    const requester = requesterChannelRef.current;
    const owner = ownerChannelRef.current;

    requesterChannelRef.current = null;
    ownerChannelRef.current = null;

    await Promise.all([
      removeChannelSafely(requester),
      removeChannelSafely(owner),
    ]);
  }, []);

  const openPublicProfile = useCallback(
    (userId: string, canOpenProfile: boolean) => {
      if (!userId || !canOpenProfile) return;

      router.push({
        pathname: '/user/[userId]',
        params: { userId },
      });
    },
    [router]
  );

  const loadThoughts = useCallback(async () => {
    try {
      setErrorText('');

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setErrorText('Du måste logga in för att använda Tankar.');
        setThoughts([]);
        return;
      }

      setCurrentUserId(user.id);

      const [matchedSet, blockedIds] = await Promise.all([
        getMatchedTargetIds(user.id),
        loadBlockedIds(user.id),
      ]);

      const { data: thoughtData, error: thoughtsError } = await supabase
        .from('thoughts')
        .select('id, user_id, text, content, visibility, is_active, created_at')
        .eq('is_active', true)
        .order('created_at', { ascending: false });

      if (thoughtsError) throw thoughtsError;

      const allThoughtRows = (thoughtData ?? []) as ThoughtRow[];
      const visibleThoughtRows = allThoughtRows.filter(
        (thought) => !blockedIds.has(thought.user_id)
      );

      if (visibleThoughtRows.length === 0) {
        setThoughts([]);
        return;
      }

      const visibleThoughtIds = visibleThoughtRows.map((row) => row.id);

      const [
        { data: commentData, error: commentsError },
        { data: reactionData, error: reactionsError },
        { data: requestData, error: requestsError },
      ] = await Promise.all([
        supabase
          .from('thought_comments')
          .select('id, thought_id, user_id, text, content, created_at')
          .in('thought_id', visibleThoughtIds)
          .order('created_at', { ascending: true }),
        supabase
          .from('thought_reactions')
          .select('id, thought_id, user_id, reaction, created_at')
          .eq('reaction', 'heart')
          .in('thought_id', visibleThoughtIds),
        supabase
          .from('thought_talk_requests')
          .select(
            'id, thought_id, requester_id, owner_id, status, created_at, updated_at'
          )
          .in('thought_id', visibleThoughtIds)
          .or(`requester_id.eq.${user.id},owner_id.eq.${user.id}`),
      ]);

      if (commentsError) throw commentsError;
      if (reactionsError) throw reactionsError;
      if (requestsError) throw requestsError;

      const commentRows = ((commentData ?? []) as ThoughtCommentRow[])
        .map((row) => ({
          ...row,
          text: getSafeText(row.text, row.content),
        }))
        .filter((row) => !blockedIds.has(row.user_id));

      const reactionRows = ((reactionData ?? []) as ThoughtReactionRow[]).filter(
        (row) => !blockedIds.has(row.user_id)
      );

      const requestRows = ((requestData ?? []) as ThoughtTalkRequestRow[]).filter(
        (row) => !blockedIds.has(row.requester_id) && !blockedIds.has(row.owner_id)
      );

      const profileIds = new Set<string>();
      visibleThoughtRows.forEach((row) => profileIds.add(row.user_id));
      requestRows.forEach((row) => {
        profileIds.add(row.requester_id);
        profileIds.add(row.owner_id);
      });

      const { data: profileData, error: profilesError } = await supabase
        .from('profiles')
        .select('id, name, avatar_emoji, is_bankid_verified')
        .in('id', [...profileIds]);

      if (profilesError) throw profilesError;

      const profileMap = new Map<string, ProfileRow>();
      ((profileData ?? []) as ProfileRow[]).forEach((profile) => {
        profileMap.set(profile.id, profile);
      });

      const commentsByThought = new Map<string, ThoughtCommentRow[]>();
      commentRows.forEach((comment) => {
        const list = commentsByThought.get(comment.thought_id) ?? [];
        list.push(comment);
        commentsByThought.set(comment.thought_id, list);
      });

      const reactionsByThought = new Map<string, ThoughtReactionRow[]>();
      reactionRows.forEach((reaction) => {
        const list = reactionsByThought.get(reaction.thought_id) ?? [];
        list.push(reaction);
        reactionsByThought.set(reaction.thought_id, list);
      });

      const requestsByThought = new Map<string, ThoughtTalkRequestRow[]>();
      requestRows.forEach((request) => {
        const list = requestsByThought.get(request.thought_id) ?? [];
        list.push(request);
        requestsByThought.set(request.thought_id, list);
      });

      const builtThoughts: ThoughtCard[] = visibleThoughtRows.map((thought) => {
        const profile = profileMap.get(thought.user_id) ?? null;
        const header = getThoughtHeader(profile, thought.visibility);

        const reactions = reactionsByThought.get(thought.id) ?? [];
        const comments = commentsByThought.get(thought.id) ?? [];
        const requests = requestsByThought.get(thought.id) ?? [];

        const myReaction =
          reactions.find((reaction) => reaction.user_id === user.id) ?? null;

        const outgoingRequest =
          requests.find(
            (request) =>
              request.requester_id === user.id && request.owner_id === thought.user_id
          ) ?? null;

        const incomingRequests: IncomingRequest[] = requests
          .filter((request) => request.owner_id === user.id && request.status === 'pending')
          .map((request) => {
            const requesterProfile = profileMap.get(request.requester_id) ?? null;
            return {
              id: request.id,
              requesterId: request.requester_id,
              requesterName: firstName(requesterProfile?.name) || 'Match',
              requesterEmoji: requesterProfile?.avatar_emoji || '🙂',
            };
          });

        return {
          id: thought.id,
          userId: thought.user_id,
          text: getSafeText(thought.text, thought.content),
          visibility: thought.visibility,
          createdAt: thought.created_at,
          timeLabel: formatRelativeTime(thought.created_at),
          authorName: header.authorName,
          authorEmoji: header.authorEmoji,
          badgeText: header.badgeText,
          canOpenProfile: header.canOpenProfile,
          isMine: thought.user_id === user.id,
          isMatched: matchedSet.has(thought.user_id),
          isBankIdVerified: !!profile?.is_bankid_verified,
          likeCount: reactions.length,
          likedByMe: !!myReaction,
          myReactionId: myReaction?.id ?? null,
          comments,
          outgoingRequestStatus: outgoingRequest?.status ?? null,
          incomingRequests,
        };
      });

      setThoughts(builtThoughts);
    } catch (error: any) {
      setErrorText(error?.message || 'Kunde inte ladda Tankar.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      loadThoughts();
    }, [loadThoughts])
  );

  useEffect(() => {
    if (!currentUserId) return;

    let cancelled = false;

    const startRealtime = async () => {
      await teardownThoughtRealtime();

      const requesterChannel = createScopedRealtimeChannel('tankar-requester', currentUserId)
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'thought_talk_requests',
            filter: `requester_id=eq.${currentUserId}`,
          },
          async (payload) => {
            const next = payload.new as ThoughtTalkRequestRow;

            if (next.status === 'accepted' && !handledAcceptedIds.current.has(next.id)) {
              const blockedIds = await loadBlockedIds(currentUserId);

              if (blockedIds.has(next.owner_id)) {
                await loadThoughts();
                return;
              }

              handledAcceptedIds.current.add(next.id);

              try {
                const { conversationKey } = await ensureMatchedConversation(
                  currentUserId,
                  next.owner_id
                );

                router.push({
                  pathname: '/chat/[conversationKey]',
                  params: { conversationKey },
                });
              } catch {
                // ignore
              }
            }

            loadThoughts();
          }
        );

      requesterChannel.subscribe((status) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          loadThoughts();
        }
      });

      if (cancelled) {
        await removeChannelSafely(requesterChannel);
        return;
      }

      requesterChannelRef.current = requesterChannel;

      const ownerChannel = createScopedRealtimeChannel('tankar-owner', currentUserId)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'thought_talk_requests',
            filter: `owner_id=eq.${currentUserId}`,
          },
          () => {
            loadThoughts();
          }
        );

      ownerChannel.subscribe((status) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          loadThoughts();
        }
      });

      if (cancelled) {
        await removeChannelSafely(ownerChannel);
        return;
      }

      ownerChannelRef.current = ownerChannel;
    };

    startRealtime();

    return () => {
      cancelled = true;
      teardownThoughtRealtime();
    };
  }, [currentUserId, router, loadThoughts, teardownThoughtRealtime]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadThoughts();
  };

  const publishThought = async () => {
    const trimmed = draftText.trim();

    if (!trimmed || publishing || !currentUserId) return;

    try {
      setPublishing(true);

      const isSafe = await guardContentOrShowHelp({
        text: trimmed,
        reporterId: currentUserId,
        router,
        surface: 'thought',
      });
      if (!isSafe) return;

      const { error } = await supabase.from('thoughts').insert({
        user_id: currentUserId,
        text: trimmed,
        content: trimmed,
        visibility,
        is_active: true,
      });

      if (error) throw error;

      setDraftText('');
      setVisibility('anonymous');
      setComposerOpen(false);

      await loadThoughts();
    } catch (error: any) {
      Alert.alert('Kunde inte publicera', error?.message || 'Något gick fel.');
    } finally {
      setPublishing(false);
    }
  };

  const toggleLike = async (thoughtId: string) => {
    const thought = thoughts.find((item) => item.id === thoughtId);
    if (!thought || !currentUserId) return;

    const blockedIds = await loadBlockedIds(currentUserId);
    if (blockedIds.has(thought.userId)) {
      Alert.alert('Inte tillgänglig', 'Den här personen är inte tillgänglig längre.');
      await loadThoughts();
      return;
    }

    const wasLiked = thought.likedByMe;
    const previousReactionId = thought.myReactionId;

    setThoughts((prev) =>
      prev.map((item) =>
        item.id !== thoughtId
          ? item
          : {
              ...item,
              likedByMe: !wasLiked,
              likeCount: wasLiked ? Math.max(0, item.likeCount - 1) : item.likeCount + 1,
              myReactionId: wasLiked ? null : '__pending__',
            }
      )
    );

    try {
      if (wasLiked && previousReactionId) {
        const { error } = await supabase
          .from('thought_reactions')
          .delete()
          .eq('id', previousReactionId);

        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from('thought_reactions')
          .insert({
            thought_id: thoughtId,
            user_id: currentUserId,
            reaction: 'heart',
          })
          .select('id')
          .single();

        if (error) throw error;

        setThoughts((prev) =>
          prev.map((item) =>
            item.id !== thoughtId
              ? item
              : {
                  ...item,
                  myReactionId: data?.id || null,
                }
          )
        );
      }
    } catch {
      await loadThoughts();
    }
  };

  const submitComment = async (thoughtId: string) => {
    const value = (commentDrafts[thoughtId] || '').trim();
    const thought = thoughts.find((item) => item.id === thoughtId);

    if (!value || !currentUserId || submittingCommentId || !thought) return;

    const blockedIds = await loadBlockedIds(currentUserId);
    if (blockedIds.has(thought.userId)) {
      Alert.alert('Inte tillgänglig', 'Den här personen är inte tillgänglig längre.');
      await loadThoughts();
      return;
    }

    try {
      setSubmittingCommentId(thoughtId);

      const isSafe = await guardContentOrShowHelp({
        text: value,
        reporterId: currentUserId,
        router,
        surface: 'thought_comment',
        targetUserId: thought.userId,
      });
      if (!isSafe) return;

      const { data, error } = await supabase
        .from('thought_comments')
        .insert({
          thought_id: thoughtId,
          user_id: currentUserId,
          text: value,
          content: value,
        })
        .select('id, thought_id, user_id, text, content, created_at')
        .single();

      if (error) throw error;

      const inserted = data as ThoughtCommentRow;

      const newComment: ThoughtCommentRow = {
        ...inserted,
        text: getSafeText(inserted.text, inserted.content),
      };

      setThoughts((prev) =>
        prev.map((item) =>
          item.id !== thoughtId
            ? item
            : {
                ...item,
                comments: [...item.comments, newComment],
              }
        )
      );

      setCommentDrafts((prev) => ({
        ...prev,
        [thoughtId]: '',
      }));
    } catch (error: any) {
      Alert.alert('Kunde inte skicka kommentar', error?.message || 'Något gick fel.');
    } finally {
      setSubmittingCommentId('');
    }
  };

  const handleRequestTalk = async (thought: ThoughtCard) => {
    if (!currentUserId || thought.isMine || sendingTalkId) return;

    const blockedIds = await loadBlockedIds(currentUserId);
    if (blockedIds.has(thought.userId)) {
      Alert.alert('Inte tillgänglig', 'Den här personen är inte tillgänglig längre.');
      await loadThoughts();
      return;
    }

    if (!thought.isMatched) {
      Alert.alert('Matcha först', 'Du behöver matcha med personen på Hitta först.');
      return;
    }

    if (thought.outgoingRequestStatus === 'accepted') {
      try {
        const { conversationKey } = await ensureMatchedConversation(
          currentUserId,
          thought.userId
        );

        router.push({
          pathname: '/chat/[conversationKey]',
          params: { conversationKey },
        });
      } catch (error: any) {
        Alert.alert('Kunde inte öppna chatten', error?.message || 'Något gick fel.');
      }
      return;
    }

    try {
      setSendingTalkId(thought.id);

      const { error } = await supabase.from('thought_talk_requests').upsert(
        {
          thought_id: thought.id,
          requester_id: currentUserId,
          owner_id: thought.userId,
          status: 'pending',
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'thought_id,requester_id' }
      );

      if (error) throw error;

      await loadThoughts();

      Alert.alert(
        'Skickat',
        'Din fråga har skickats. Om personen svarar ja öppnas chatten automatiskt.'
      );
    } catch (error: any) {
      Alert.alert('Kunde inte skicka', error?.message || 'Något gick fel.');
    } finally {
      setSendingTalkId('');
    }
  };

  const handleAcceptTalk = async (requestId: string, requesterId: string) => {
    if (!currentUserId || processingRequestId) return;

    const blockedIds = await loadBlockedIds(currentUserId);
    if (blockedIds.has(requesterId)) {
      Alert.alert('Inte tillgänglig', 'Den här personen är inte tillgänglig längre.');
      await loadThoughts();
      return;
    }

    try {
      setProcessingRequestId(requestId);

      const { error } = await supabase
        .from('thought_talk_requests')
        .update({
          status: 'accepted',
          updated_at: new Date().toISOString(),
        })
        .eq('id', requestId)
        .eq('owner_id', currentUserId);

      if (error) throw error;

      const { conversationKey } = await ensureMatchedConversation(
        currentUserId,
        requesterId
      );

      await loadThoughts();

      router.push({
        pathname: '/chat/[conversationKey]',
        params: { conversationKey },
      });
    } catch (error: any) {
      Alert.alert('Kunde inte acceptera', error?.message || 'Något gick fel.');
    } finally {
      setProcessingRequestId('');
    }
  };

  const handleDeclineTalk = async (requestId: string, requesterId: string) => {
    if (!currentUserId || processingRequestId) return;

    const blockedIds = await loadBlockedIds(currentUserId);
    if (blockedIds.has(requesterId)) {
      await loadThoughts();
      return;
    }

    try {
      setProcessingRequestId(requestId);

      const { error } = await supabase
        .from('thought_talk_requests')
        .update({
          status: 'declined',
          updated_at: new Date().toISOString(),
        })
        .eq('id', requestId)
        .eq('owner_id', currentUserId);

      if (error) throw error;

      await loadThoughts();
    } catch (error: any) {
      Alert.alert('Kunde inte svara', error?.message || 'Något gick fel.');
    } finally {
      setProcessingRequestId('');
    }
  };

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
            <ActivityIndicator size="large" color={withuColors.teal} />
            <Text style={styles.stateTitle}>Laddar Tankar…</Text>
            <Text style={styles.stateText}>Vi hämtar tankar och dina matchkopplingar.</Text>
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
            <Text style={styles.stateTitle}>Kunde inte laddas</Text>
            <Text style={styles.stateText}>{errorText}</Text>
            <WithUPrimaryButton title="Försök igen" onPress={loadThoughts} />
          </View>
        </WithUPage>
      </WithUScreen>
    );
  }

  return (
    <WithUScreen>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <WithUTopBar
          title="WithU"
          subtitle="Du är aldrig ensam."
          right={
            <View style={styles.topBarRight}>
              <Pressable style={styles.plusButton} onPress={() => setComposerOpen(true)}>
                <Text style={styles.plusButtonText}>＋</Text>
              </Pressable>
              <WithUAvatar emoji="😊" size={34} />
            </View>
          }
        />

        <Pressable style={styles.composeBar} onPress={() => setComposerOpen(true)}>
          <View style={styles.composeBarAvatar}>
            <Text style={styles.composeBarEmoji}>🌸</Text>
          </View>
          <View style={styles.composeBarField}>
            <Text style={styles.composeBarPlaceholder}>Dela en tanke anonymt...</Text>
          </View>
        </Pressable>

        <View style={styles.filterBar}>
          <Pressable
            style={[styles.filterChip, activeFilter === 'alla' && styles.filterChipActive]}
            onPress={() => setActiveFilter('alla')}
          >
            <Text
              style={[
                styles.filterChipText,
                activeFilter === 'alla' && styles.filterChipTextActive,
              ]}
            >
              Alla
            </Text>
          </Pressable>

          <Pressable
            style={[styles.filterChip, activeFilter === 'matchade' && styles.filterChipActive]}
            onPress={() => setActiveFilter('matchade')}
          >
            <Text
              style={[
                styles.filterChipText,
                activeFilter === 'matchade' && styles.filterChipTextActive,
              ]}
            >
              Matchade
            </Text>
          </Pressable>

          <Pressable
            style={[styles.filterChip, activeFilter === 'mina' && styles.filterChipActive]}
            onPress={() => setActiveFilter('mina')}
          >
            <Text
              style={[
                styles.filterChipText,
                activeFilter === 'mina' && styles.filterChipTextActive,
              ]}
            >
              Mina
            </Text>
          </Pressable>
        </View>

        <ScrollView
          style={styles.feed}
          contentContainerStyle={styles.feedContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <WithUPage style={styles.page}>
            {filteredThoughts.length === 0 ? (
              <View style={styles.emptyWrap}>
                <Text style={styles.emptyTitle}>Inga tankar här ännu</Text>
                <Text style={styles.emptyText}>
                  Prova ett annat filter eller skriv första tanken själv.
                </Text>
                <WithUPrimaryButton title="Skriv en tanke" onPress={() => setComposerOpen(true)} />
              </View>
            ) : (
              filteredThoughts.map((item) => {
                const latestComment = item.comments[item.comments.length - 1];
                const isSending = sendingTalkId === item.id;

                return (
                  <View key={item.id} style={styles.post}>
                    <View style={styles.postHeader}>
                      <Pressable
                        disabled={!item.canOpenProfile}
                        onPress={() => openPublicProfile(item.userId, item.canOpenProfile)}
                        style={({ pressed }) => [
                          styles.postIdentityPress,
                          item.canOpenProfile && pressed && styles.sectionPressed,
                        ]}
                      >
                        <View style={styles.postAv}>
                          <Text style={styles.postAvEmoji}>{item.authorEmoji}</Text>
                        </View>

                        <View style={styles.postMeta}>
                          {!!item.authorName && (
                            <Text style={styles.postAuthorName}>{item.authorName}</Text>
                          )}

                          <View style={styles.postBadgeRow}>
                            <View
                              style={[
                                styles.postBadge,
                                item.visibility === 'anonymous' && styles.postBadgeGreen,
                                item.visibility === 'nickname' && styles.postBadgeBlue,
                                item.visibility === 'firstname' && styles.postBadgeOrange,
                              ]}
                            >
                              <Text
                                style={[
                                  styles.postBadgeText,
                                  item.visibility === 'anonymous' && styles.postBadgeTextGreen,
                                  item.visibility === 'nickname' && styles.postBadgeTextBlue,
                                  item.visibility === 'firstname' && styles.postBadgeTextOrange,
                                ]}
                              >
                                {item.badgeText}
                              </Text>
                            </View>

                            {item.isBankIdVerified ? (
                              <View style={styles.bankidBadge}>
                                <Text style={styles.bankidBadgeText}>✓ BankID</Text>
                              </View>
                            ) : null}

                            {item.isMatched && !item.isMine ? (
                              <View style={styles.matchedBadge}>
                                <Text style={styles.matchedBadgeText}>Matchad</Text>
                              </View>
                            ) : null}
                          </View>

                          {item.canOpenProfile ? (
                            <Text style={styles.postProfileHint}>Tryck för profil</Text>
                          ) : null}
                        </View>
                      </Pressable>

                      <Text style={styles.postTime}>{item.timeLabel}</Text>
                    </View>

                    <Text style={styles.postText}>{item.text}</Text>

                    <View style={styles.postActions}>
                      <Pressable
                        style={[styles.actionBtn, item.likedByMe && styles.actionBtnActive]}
                        onPress={() => toggleLike(item.id)}
                      >
                        <Text
                          style={[
                            styles.actionBtnText,
                            item.likedByMe && styles.actionBtnTextActive,
                          ]}
                        >
                          {item.likedByMe ? '❤️' : '🤍'} {item.likeCount}
                        </Text>
                      </Pressable>

                      <Pressable
                        style={styles.actionBtn}
                        onPress={() => setSelectedThoughtId(item.id)}
                      >
                        <Text style={styles.actionBtnText}>💬 {item.comments.length}</Text>
                      </Pressable>

                      {item.isMine ? (
                        <View style={styles.actionBtnOwner}>
                          <Text style={styles.actionBtnOwnerText}>Din tanke</Text>
                        </View>
                      ) : item.isMatched ? (
                        <Pressable
                          style={[
                            styles.actionBtnTalk,
                            item.outgoingRequestStatus === 'pending' &&
                              styles.actionBtnPending,
                            item.outgoingRequestStatus === 'accepted' &&
                              styles.actionBtnAccepted,
                            isSending && styles.btnDisabled,
                          ]}
                          onPress={() => handleRequestTalk(item)}
                          disabled={isSending}
                        >
                          <Text
                            style={[
                              styles.actionBtnTalkText,
                              item.outgoingRequestStatus === 'accepted' &&
                                styles.actionBtnTalkTextAccepted,
                            ]}
                          >
                            {item.outgoingRequestStatus === 'accepted'
                              ? '💬 Öppna chatt'
                              : item.outgoingRequestStatus === 'pending'
                              ? 'Väntar på svar'
                              : isSending
                              ? 'Skickar...'
                              : '💬 Vill du prata?'}
                          </Text>
                        </Pressable>
                      ) : (
                        <View style={styles.actionBtnLocked}>
                          <Text style={styles.actionBtnLockedText}>🔒 Matcha först</Text>
                        </View>
                      )}
                    </View>

                    {item.isMine && item.incomingRequests.length > 0 ? (
                      <View style={styles.requestsWrap}>
                        <Text style={styles.requestsTitle}>Vill prata med dig</Text>

                        {item.incomingRequests.map((request) => (
                          <View key={request.id} style={styles.requestRow}>
                            <Pressable
                              style={({ pressed }) => [
                                styles.requestLeft,
                                pressed && styles.sectionPressedSoft,
                              ]}
                              onPress={() => openPublicProfile(request.requesterId, true)}
                            >
                              <Text style={styles.requestEmoji}>{request.requesterEmoji}</Text>
                              <Text style={styles.requestName}>{request.requesterName}</Text>
                            </Pressable>

                            <View style={styles.requestBtns}>
                              <Pressable
                                style={[
                                  styles.acceptBtn,
                                  processingRequestId === request.id && styles.btnDisabled,
                                ]}
                                onPress={() =>
                                  handleAcceptTalk(request.id, request.requesterId)
                                }
                                disabled={processingRequestId === request.id}
                              >
                                <Text style={styles.acceptBtnText}>
                                  {processingRequestId === request.id ? '...' : 'Ja, chatta'}
                                </Text>
                              </Pressable>

                              <Pressable
                                style={[
                                  styles.declineBtn,
                                  processingRequestId === request.id && styles.btnDisabled,
                                ]}
                                onPress={() =>
                                  handleDeclineTalk(request.id, request.requesterId)
                                }
                                disabled={processingRequestId === request.id}
                              >
                                <Text style={styles.declineBtnText}>Inte nu</Text>
                              </Pressable>
                            </View>
                          </View>
                        ))}
                      </View>
                    ) : null}

                    <Pressable
                      style={styles.commentPreview}
                      onPress={() => setSelectedThoughtId(item.id)}
                    >
                      <Text style={styles.commentPreviewTitle}>Kommentarer</Text>

                      {latestComment ? (
                        <>
                          <Text style={styles.commentPreviewText} numberOfLines={2}>
                            {latestComment.text}
                          </Text>
                          <Text style={styles.commentPreviewMore}>
                            {item.comments.length > 1
                              ? `Visa alla ${item.comments.length} kommentarer`
                              : 'Visa kommentar'}
                          </Text>
                        </>
                      ) : (
                        <Text style={styles.commentPreviewMore}>Skriv första kommentaren</Text>
                      )}
                    </Pressable>
                  </View>
                );
              })
            )}

            <Text style={styles.footer}>Mår du dåligt? Mind 90101 · 1177</Text>
          </WithUPage>
        </ScrollView>

        <Modal
          visible={composerOpen}
          transparent
          animationType="slide"
          onRequestClose={() => setComposerOpen(false)}
        >
          <View style={styles.modalOverlay}>
            <KeyboardAvoidingView
              style={styles.composerKeyboardWrap}
              behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            >
              <View style={styles.composerSheet}>
                <View style={styles.sheetHandle} />

                <ScrollView
                  style={styles.composerScroll}
                  contentContainerStyle={styles.composerScrollContent}
                  keyboardShouldPersistTaps="handled"
                  showsVerticalScrollIndicator={false}
                >
                  <Text style={styles.modalTitleLarge}>Skriv en tanke</Text>

                  <TextInput
                    value={draftText}
                    onChangeText={setDraftText}
                    placeholder="Skriv vad du känner eller tänker..."
                    placeholderTextColor={withuColors.muted}
                    style={styles.textArea}
                    multiline
                    maxLength={500}
                    textAlignVertical="top"
                  />

                  <Text style={styles.counter}>{remaining} tecken kvar</Text>

                  <Text style={styles.modalSection}>Välj anonymitetsnivå</Text>

                  <View style={styles.visibilityRow}>
                    {(['anonymous', 'nickname', 'firstname'] as ThoughtVisibility[]).map(
                      (value) => (
                        <Pressable
                          key={value}
                          style={[
                            styles.visChip,
                            visibility === value && styles.visChipActive,
                          ]}
                          onPress={() => setVisibility(value)}
                        >
                          <Text
                            style={[
                              styles.visChipText,
                              visibility === value && styles.visChipTextActive,
                            ]}
                          >
                            {value === 'anonymous'
                              ? 'Helt anonymt'
                              : value === 'nickname'
                              ? 'Smeknamn'
                              : 'Förnamn'}
                          </Text>
                        </Pressable>
                      )
                    )}
                  </View>
                </ScrollView>

                <View style={styles.composerActions}>
                  <Pressable
                    style={styles.closeActionBtn}
                    onPress={() => setComposerOpen(false)}
                  >
                    <Text style={styles.closeActionText}>Stäng</Text>
                  </Pressable>

                  <Pressable
                    style={[
                      styles.publishActionBtn,
                      (!draftText.trim() || publishing) && styles.publishActionBtnDisabled,
                    ]}
                    onPress={publishThought}
                    disabled={!draftText.trim() || publishing}
                  >
                    <Text style={styles.publishActionText}>
                      {publishing ? 'Sparar...' : 'Publicera'}
                    </Text>
                  </Pressable>
                </View>
              </View>
            </KeyboardAvoidingView>
          </View>
        </Modal>

        <Modal
          visible={!!selectedThought}
          transparent
          animationType="slide"
          onRequestClose={() => setSelectedThoughtId(null)}
        >
          <View style={styles.modalOverlay}>
            <KeyboardAvoidingView
              behavior={Platform.OS === 'ios' ? 'padding' : undefined}
              style={styles.commentsWrap}
            >
              <View style={styles.commentsSheet}>
                <View style={styles.commentsHeader}>
                  <Text style={styles.commentsTitle}>Kommentarer</Text>
                  <Pressable
                    style={styles.commentsClose}
                    onPress={() => setSelectedThoughtId(null)}
                  >
                    <Text style={styles.commentsCloseText}>✕</Text>
                  </Pressable>
                </View>

                <ScrollView
                  style={styles.commentsList}
                  contentContainerStyle={styles.commentsListContent}
                  keyboardShouldPersistTaps="handled"
                  showsVerticalScrollIndicator={false}
                >
                  {selectedThought ? (
                    <View style={styles.selectedThoughtBox}>
                      <Text style={styles.selectedThoughtText}>{selectedThought.text}</Text>
                    </View>
                  ) : null}

                  {selectedThought?.comments.length ? (
                    selectedThought.comments.map((comment) => (
                      <View key={comment.id} style={styles.commentBubble}>
                        <Text style={styles.commentText}>{comment.text}</Text>
                        <Text style={styles.commentTime}>
                          {formatRelativeTime(comment.created_at)}
                        </Text>
                      </View>
                    ))
                  ) : (
                    <Text style={styles.noComments}>Inga kommentarer ännu. Skriv första!</Text>
                  )}
                </ScrollView>

                {selectedThought ? (
                  <View style={styles.commentsComposer}>
                    <View style={styles.commentsInputWrap}>
                      <TextInput
                        value={selectedCommentDraft}
                        onChangeText={(value) =>
                          setCommentDrafts((prev) => ({
                            ...prev,
                            [selectedThought.id]: value,
                          }))
                        }
                        placeholder="Skriv en kommentar..."
                        placeholderTextColor={withuColors.muted}
                        style={styles.commentsInput}
                        multiline
                        textAlignVertical="center"
                      />
                    </View>

                    <Pressable
                      style={[
                        styles.commentsSendBtn,
                        (!selectedCommentDraft.trim() ||
                          submittingCommentId === selectedThought.id) &&
                          styles.commentsSendBtnDisabled,
                      ]}
                      onPress={() => submitComment(selectedThought.id)}
                      disabled={
                        !selectedCommentDraft.trim() ||
                        submittingCommentId === selectedThought.id
                      }
                    >
                      <Text style={styles.commentsSendText}>
                        {submittingCommentId === selectedThought.id ? '...' : 'Skicka'}
                      </Text>
                    </Pressable>
                  </View>
                ) : null}
              </View>
            </KeyboardAvoidingView>
          </View>
        </Modal>
      </KeyboardAvoidingView>
    </WithUScreen>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },

  topBarRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  plusButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: withuColors.teal,
    alignItems: 'center',
    justifyContent: 'center',
  },
  plusButtonText: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '900',
    lineHeight: 22,
    marginTop: -1,
  },

  composeBar: {
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#ECEEF4',
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  composeBarAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: withuColors.tealBg,
    borderWidth: 1,
    borderColor: 'rgba(28,94,82,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  composeBarEmoji: {
    fontSize: 18,
  },
  composeBarField: {
    flex: 1,
    height: 38,
    backgroundColor: '#F4F6FA',
    borderRadius: 19,
    borderWidth: 1,
    borderColor: '#E0E4EF',
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  composeBarPlaceholder: {
    fontSize: 13,
    color: '#A0A8C0',
  },

  filterBar: {
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#ECEEF4',
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: 'row',
    gap: 10,
  },
  filterChip: {
    borderRadius: 999,
    paddingHorizontal: 18,
    paddingVertical: 12,
    backgroundColor: '#F4F6FA',
    borderWidth: 1,
    borderColor: '#DDE2EF',
  },
  filterChipActive: {
    backgroundColor: '#FFFFFF',
    borderColor: '#111111',
  },
  filterChipText: {
    color: withuColors.navy,
    fontSize: 16,
    fontWeight: '900',
  },
  filterChipTextActive: {
    color: withuColors.navy,
  },

  feed: {
    flex: 1,
    backgroundColor: '#F4F6FA',
  },
  feedContent: {
    paddingBottom: 40,
  },
  page: {
    paddingTop: withuSpacing.lg,
  },

  post: {
    backgroundColor: '#FFFFFF',
    borderRadius: withuRadius.xl,
    borderWidth: 1,
    borderColor: '#ECEEF4',
    padding: 14,
    marginBottom: 14,
    ...withuShadows.card,
  },
  postHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginBottom: 10,
  },
  postIdentityPress: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    borderRadius: 14,
  },
  postAv: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#FCEAEA',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  postAvEmoji: {
    fontSize: 20,
  },
  postMeta: {
    flex: 1,
  },
  postAuthorName: {
    fontSize: 14,
    fontWeight: '800',
    color: withuColors.navy,
    marginBottom: 3,
  },
  postBadgeRow: {
    flexDirection: 'row',
    gap: 5,
    flexWrap: 'wrap',
    alignItems: 'center',
  },
  postBadge: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  postBadgeGreen: {
    backgroundColor: withuColors.successBg,
  },
  postBadgeBlue: {
    backgroundColor: '#EEF4FF',
  },
  postBadgeOrange: {
    backgroundColor: '#FEF4E8',
  },
  postBadgeText: {
    fontSize: 10,
    fontWeight: '800',
  },
  postBadgeTextGreen: {
    color: withuColors.success,
  },
  postBadgeTextBlue: {
    color: '#5B7FE0',
  },
  postBadgeTextOrange: {
    color: '#C07020',
  },
  postProfileHint: {
    marginTop: 5,
    fontSize: 10,
    fontWeight: '700',
    color: withuColors.muted,
  },
  bankidBadge: {
    backgroundColor: withuColors.successBg,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  bankidBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: withuColors.success,
  },
  matchedBadge: {
    backgroundColor: '#FFF7E8',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  matchedBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#C07020',
  },
  postTime: {
    fontSize: 10,
    color: withuColors.muted,
    fontWeight: '600',
    paddingTop: 2,
  },
  postText: {
    fontSize: 15,
    lineHeight: 24,
    color: '#1B2B4B',
    marginBottom: 12,
  },

  postActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 8,
  },
  actionBtn: {
    backgroundColor: '#F4F6FA',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: '#E0E4EF',
  },
  actionBtnActive: {
    backgroundColor: '#FCEAEA',
    borderColor: '#E05C4B',
  },
  actionBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: withuColors.navy,
  },
  actionBtnTextActive: {
    color: '#E05C4B',
  },
  actionBtnTalk: {
    backgroundColor: withuColors.tealBg,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: withuColors.teal,
  },
  actionBtnPending: {
    backgroundColor: '#FFF7E8',
    borderColor: '#C07020',
  },
  actionBtnAccepted: {
    backgroundColor: withuColors.tealBg,
    borderColor: withuColors.teal,
  },
  actionBtnTalkText: {
    fontSize: 12,
    fontWeight: '800',
    color: withuColors.teal,
  },
  actionBtnTalkTextAccepted: {
    color: withuColors.teal,
  },
  actionBtnLocked: {
    backgroundColor: '#F4F6FA',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: '#DDE2EF',
  },
  actionBtnLockedText: {
    fontSize: 12,
    fontWeight: '700',
    color: withuColors.muted,
  },
  actionBtnOwner: {
    backgroundColor: '#EEF4FF',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  actionBtnOwnerText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#5B7FE0',
  },

  requestsWrap: {
    backgroundColor: '#FFF8EF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#F1DEC2',
    padding: 10,
    marginBottom: 8,
  },
  requestsTitle: {
    fontSize: 13,
    fontWeight: '900',
    color: withuColors.navy,
    marginBottom: 8,
  },
  requestRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
    gap: 8,
  },
  requestLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
    borderRadius: 12,
  },
  requestEmoji: {
    fontSize: 20,
  },
  requestName: {
    fontSize: 13,
    fontWeight: '800',
    color: withuColors.navy,
  },
  requestBtns: {
    flexDirection: 'row',
    gap: 6,
  },
  acceptBtn: {
    backgroundColor: withuColors.teal,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  acceptBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },
  declineBtn: {
    backgroundColor: '#F4F6FA',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: '#DDE2EF',
  },
  declineBtnText: {
    color: withuColors.navy,
    fontSize: 12,
    fontWeight: '700',
  },

  commentPreview: {
    marginTop: 4,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F0F0F0',
  },
  commentPreviewTitle: {
    fontSize: 13,
    fontWeight: '900',
    color: withuColors.navy,
    marginBottom: 6,
  },
  commentPreviewText: {
    fontSize: 13,
    color: '#555555',
    marginBottom: 4,
    lineHeight: 20,
  },
  commentPreviewMore: {
    fontSize: 11,
    color: withuColors.muted,
    fontWeight: '700',
  },

  footer: {
    textAlign: 'center',
    fontSize: 12,
    color: withuColors.muted,
    marginTop: 20,
    marginBottom: 8,
  },

  emptyWrap: {
    padding: 24,
    alignItems: 'center',
  },
  emptyTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: withuColors.navy,
    marginBottom: 8,
    textAlign: 'center',
  },
  emptyText: {
    fontSize: 14,
    color: withuColors.muted,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 20,
  },

  pageOnly: {
    paddingTop: withuSpacing.xl,
  },
  stateCard: {
    backgroundColor: withuColors.white,
    borderRadius: withuRadius.xl,
    borderWidth: 1,
    borderColor: withuColors.line,
    padding: withuSpacing.xxl,
    alignItems: 'center',
    ...withuShadows.card,
    marginTop: 40,
  },
  stateTitle: {
    color: withuColors.navy,
    fontSize: 24,
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

  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(27,43,75,0.2)',
  },

  composerKeyboardWrap: {
    justifyContent: 'flex-end',
  },
  composerSheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    borderWidth: 1,
    borderColor: '#DDE2EF',
    maxHeight: '86%',
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 46,
    height: 5,
    borderRadius: 999,
    backgroundColor: '#D7DDEB',
    marginTop: 10,
    marginBottom: 6,
  },
  composerScroll: {
    flexGrow: 0,
  },
  composerScrollContent: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 16,
  },
  modalTitleLarge: {
    color: withuColors.navy,
    fontSize: 22,
    fontWeight: '900',
    marginBottom: 14,
  },
  textArea: {
    backgroundColor: '#F0F2F8',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#DDE2EF',
    minHeight: 140,
    color: withuColors.navy,
    fontSize: 15,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  counter: {
    color: withuColors.muted,
    fontSize: 11,
    textAlign: 'right',
    marginTop: 6,
    marginBottom: 14,
  },
  modalSection: {
    color: withuColors.navy,
    fontSize: 14,
    fontWeight: '900',
    marginBottom: 10,
  },
  visibilityRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  visChip: {
    backgroundColor: '#EEF1F8',
    borderWidth: 1,
    borderColor: '#DDE2EF',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  visChipActive: {
    backgroundColor: withuColors.teal,
    borderColor: withuColors.teal,
  },
  visChipText: {
    color: withuColors.navy,
    fontSize: 12,
    fontWeight: '800',
  },
  visChipTextActive: {
    color: '#FFFFFF',
  },
  composerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: Platform.OS === 'ios' ? 22 : 16,
    borderTopWidth: 1,
    borderTopColor: '#ECEEF4',
    backgroundColor: '#FFFFFF',
  },
  closeActionBtn: {
    flex: 1,
    minHeight: 52,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#DDE2EF',
    backgroundColor: '#F4F6FA',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeActionText: {
    color: withuColors.navy,
    fontSize: 15,
    fontWeight: '800',
  },
  publishActionBtn: {
    flex: 1,
    minHeight: 52,
    borderRadius: 999,
    backgroundColor: withuColors.coral,
    alignItems: 'center',
    justifyContent: 'center',
  },
  publishActionBtnDisabled: {
    opacity: 0.45,
  },
  publishActionText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '900',
  },

  commentsWrap: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  commentsSheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    height: '78%',
    borderWidth: 1,
    borderColor: '#DDE2EF',
  },
  commentsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#ECEEF4',
  },
  commentsTitle: {
    color: withuColors.navy,
    fontSize: 20,
    fontWeight: '900',
  },
  commentsClose: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#F0F2F8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  commentsCloseText: {
    color: withuColors.navy,
    fontSize: 14,
    fontWeight: '900',
  },
  commentsList: {
    flex: 1,
  },
  commentsListContent: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 14,
  },
  selectedThoughtBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E7ECF4',
    padding: 12,
    marginBottom: 12,
  },
  selectedThoughtText: {
    color: '#333333',
    fontSize: 14,
    lineHeight: 22,
  },
  commentBubble: {
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#EEF1F8',
    padding: 10,
    marginBottom: 8,
  },
  commentText: {
    color: '#333333',
    fontSize: 13,
    lineHeight: 20,
    marginBottom: 3,
  },
  commentTime: {
    color: withuColors.muted,
    fontSize: 10,
    fontWeight: '700',
  },
  noComments: {
    color: withuColors.muted,
    fontSize: 13,
    lineHeight: 20,
  },
  commentsComposer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: Platform.OS === 'ios' ? 12 : 14,
    borderTopWidth: 1,
    borderTopColor: '#ECEEF4',
    backgroundColor: '#FFFFFF',
  },
  commentsInputWrap: {
    flex: 1,
    marginRight: 8,
  },
  commentsInput: {
    width: '100%',
    minHeight: 44,
    maxHeight: 100,
    backgroundColor: '#F4F6FA',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#DDE2EF',
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 10,
    color: withuColors.navy,
    fontSize: 14,
  },
  commentsSendBtn: {
    width: 96,
    height: 44,
    borderRadius: 14,
    backgroundColor: withuColors.coral,
    alignItems: 'center',
    justifyContent: 'center',
  },
  commentsSendBtnDisabled: {
    opacity: 0.45,
  },
  commentsSendText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },

  btnDisabled: {
    opacity: 0.55,
  },
  sectionPressed: {
    opacity: 0.75,
  },
  sectionPressedSoft: {
    opacity: 0.85,
  },
});
