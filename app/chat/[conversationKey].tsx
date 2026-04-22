import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioPlayer,
  useAudioPlayerStatus,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '../../src/lib/supabase';
import { getMatchedTargetIds } from '../../src/lib/matchChat';
import {
  createScopedRealtimeChannel,
  removeChannelSafely,
} from '../../src/lib/realtime';
import { hasAcceptedVolunteerConversationAccess } from '../../src/lib/volunteerSupport';
import { WithUAvatar, WithUScreen } from '../../src/components/withu/WithUPrimitives';

const CHAT_IMAGE_BUCKET = 'chat-images';
const CHAT_AUDIO_BUCKET = 'voice-messages';

type ProfileRow = {
  id: string;
  name: string | null;
  city: string | null;
  avatar_emoji: string | null;
  is_bankid_verified: boolean | null;
};

type MessageRow = {
  id: string;
  sender_id: string | null;
  content: string | null;
  created_at: string | null;
  message_type: string | null;
  read_at: string | null;
  conversation_key: string | null;
  image_url?: string | null;
  image_path?: string | null;
  audio_url?: string | null;
  audio_path?: string | null;
  audio_duration_ms?: number | null;
  media_url?: string | null;
  metadata?: Record<string, any> | null;
};

type ChatMessage = MessageRow & {
  resolvedImageUrl?: string | null;
  resolvedAudioUrl?: string | null;
  normalized_type: 'text' | 'image' | 'audio';
};

type BubbleGroupPosition = 'single' | 'top' | 'middle' | 'bottom';

function formatTime(value?: string | null) {
  if (!value) return '';
  return new Date(value).toLocaleTimeString('sv-SE', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDate(value?: string | null) {
  if (!value) return '';
  return new Date(value).toLocaleDateString('sv-SE', {
    day: 'numeric',
    month: 'short',
  });
}

function normalizeConversationKeyParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] || '';
  return value || '';
}

function formatAudioSeconds(seconds?: number | null) {
  const safe = Math.max(0, Math.floor(seconds || 0));
  const min = Math.floor(safe / 60);
  const sec = safe % 60;
  return `${min}:${String(sec).padStart(2, '0')}`;
}

function formatAudioMillis(ms?: number | null) {
  const safe = Math.max(0, Math.floor((ms || 0) / 1000));
  return formatAudioSeconds(safe);
}

function buildSafeFileName(input?: string | null, fallbackExt = 'bin') {
  const raw = (input || '').trim();
  if (!raw) return `file-${Date.now()}.${fallbackExt}`;
  const cleaned = raw.replace(/[^a-zA-Z0-9._-]/g, '-');
  return cleaned || `file-${Date.now()}.${fallbackExt}`;
}

function guessImageMimeType(uriOrName?: string | null) {
  const value = (uriOrName || '').toLowerCase();
  if (value.endsWith('.png')) return 'image/png';
  if (value.endsWith('.webp')) return 'image/webp';
  if (value.endsWith('.heic')) return 'image/heic';
  return 'image/jpeg';
}

function guessAudioMimeType(uriOrName?: string | null) {
  const value = (uriOrName || '').toLowerCase();
  if (value.endsWith('.aac')) return 'audio/aac';
  if (value.endsWith('.wav')) return 'audio/wav';
  if (value.endsWith('.webm')) return 'audio/webm';
  if (value.endsWith('.mp3')) return 'audio/mpeg';
  return 'audio/mp4';
}

function getExtensionFromUri(uri?: string | string[] | null, fallback = 'bin') {
  const safeUri = Array.isArray(uri) ? uri[0] : uri;
  const value = (safeUri || '').split('?')[0];
  const last = value.split('.').pop();
  return last && last.length <= 8 ? last : fallback;
}

function detectNormalizedType(row: MessageRow): 'text' | 'image' | 'audio' {
  if (row.message_type === 'image') return 'image';
  if (row.message_type === 'audio') return 'audio';
  if (row.message_type === 'text') return 'text';

  if (row.audio_url || row.audio_path) return 'audio';
  if (row.image_url || row.image_path) return 'image';

  return 'text';
}

function getBubbleGroupPosition(
  previous: ChatMessage | null,
  current: ChatMessage,
  next: ChatMessage | null
): BubbleGroupPosition {
  const prevSame =
    !!previous &&
    previous.sender_id === current.sender_id &&
    formatDate(previous.created_at) === formatDate(current.created_at);

  const nextSame =
    !!next &&
    next.sender_id === current.sender_id &&
    formatDate(next.created_at) === formatDate(current.created_at);

  if (!prevSame && !nextSame) return 'single';
  if (!prevSame && nextSame) return 'top';
  if (prevSame && nextSame) return 'middle';
  return 'bottom';
}

async function uploadFileFromUri({
  bucket,
  filePath,
  localUri,
  contentType,
}: {
  bucket: string;
  filePath: string;
  localUri: string;
  contentType: string;
}) {
  const response = await fetch(localUri);
  const arrayBuffer = await response.arrayBuffer();

  const { error } = await supabase.storage.from(bucket).upload(filePath, arrayBuffer, {
    contentType,
    upsert: false,
  });

  if (error) throw error;
}

async function createSignedMediaUrl(bucket: string, path?: string | null) {
  if (!path) return null;

  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, 60 * 60);

  if (error) return null;
  return data?.signedUrl || null;
}

async function resolveSignedUrlWithCache(
  cache: Map<string, string>,
  bucket: string,
  path?: string | null
) {
  if (!path) return null;

  const key = `${bucket}:${path}`;
  const cached = cache.get(key);
  if (cached) return cached;

  const signedUrl = await createSignedMediaUrl(bucket, path);
  if (signedUrl) cache.set(key, signedUrl);

  return signedUrl;
}

async function hydrateOneMessage(
  row: MessageRow,
  cache: Map<string, string>
): Promise<ChatMessage> {
  let resolvedImageUrl = row.image_url || null;
  let resolvedAudioUrl = row.audio_url || null;

  if (!resolvedImageUrl && row.image_path) {
    resolvedImageUrl = await resolveSignedUrlWithCache(cache, CHAT_IMAGE_BUCKET, row.image_path);
  }

  if (!resolvedAudioUrl && row.audio_path) {
    resolvedAudioUrl = await resolveSignedUrlWithCache(cache, CHAT_AUDIO_BUCKET, row.audio_path);
  }

  if (!resolvedImageUrl && row.media_url && detectNormalizedType(row) === 'image') {
    resolvedImageUrl = row.media_url;
  }

  if (!resolvedAudioUrl && row.media_url && detectNormalizedType(row) === 'audio') {
    resolvedAudioUrl = row.media_url;
  }

  return {
    ...row,
    resolvedImageUrl,
    resolvedAudioUrl,
    normalized_type: detectNormalizedType(row),
  };
}

async function hydrateMessageMedia(
  rows: MessageRow[],
  cache: Map<string, string>
): Promise<ChatMessage[]> {
  return Promise.all(rows.map((row) => hydrateOneMessage(row, cache)));
}

function sortMessagesByCreatedAt(items: ChatMessage[]) {
  return [...items].sort(
    (a, b) =>
      new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime()
  );
}

function AudioBubble({
  audioUrl,
  isMine,
  durationMs,
}: {
  audioUrl: string;
  isMine: boolean;
  durationMs?: number | null;
}) {
  const player = useAudioPlayer(audioUrl, {
    updateInterval: 250,
    downloadFirst: true,
  });
  const status = useAudioPlayerStatus(player);

  const isPlaying = !!status?.playing;
  const durationLabel =
    status?.duration && status.duration > 0
      ? formatAudioSeconds(status.duration)
      : formatAudioMillis(durationMs);

  const currentLabel = formatAudioSeconds(status?.currentTime || 0);

  const handleToggle = () => {
    if (isPlaying) player.pause();
    else player.play();
  };

  return (
    <View style={styles.audioWrap}>
      <Pressable
        style={[styles.audioPlayButton, isMine && styles.audioPlayButtonMine]}
        onPress={handleToggle}
      >
        <Ionicons
          name={isPlaying ? 'pause' : 'play'}
          size={16}
          color={isMine ? '#FFFFFF' : '#1C5E52'}
        />
      </Pressable>

      <View style={styles.audioInfo}>
        <Text style={[styles.audioTitle, isMine && styles.audioTitleMine]}>
          Röstmeddelande
        </Text>
        <Text style={[styles.audioMeta, isMine && styles.audioMetaMine]}>
          {currentLabel} / {durationLabel}
        </Text>
      </View>
    </View>
  );
}

const MessageItem = memo(function MessageItem({
  message,
  isMine,
  showDate,
  otherEmoji,
  onOpenProfile,
  groupPosition,
  showAvatar,
}: {
  message: ChatMessage;
  isMine: boolean;
  showDate: boolean;
  otherEmoji: string;
  onOpenProfile: () => void;
  groupPosition: BubbleGroupPosition;
  showAvatar: boolean;
}) {
  const bubbleGroupStyle = isMine
    ? groupPosition === 'top'
      ? styles.bubbleMineTop
      : groupPosition === 'middle'
      ? styles.bubbleMineMiddle
      : groupPosition === 'bottom'
      ? styles.bubbleMineBottom
      : styles.bubbleMineSingle
    : groupPosition === 'top'
    ? styles.bubbleOtherTop
    : groupPosition === 'middle'
    ? styles.bubbleOtherMiddle
    : groupPosition === 'bottom'
    ? styles.bubbleOtherBottom
    : styles.bubbleOtherSingle;

  const shouldShowText =
    message.normalized_type === 'text' &&
    typeof message.content === 'string' &&
    message.content.trim().length > 0;

  return (
    <View>
      {showDate ? (
        <View style={styles.dateWrap}>
          <Text style={styles.dateText}>{formatDate(message.created_at).toUpperCase()}</Text>
        </View>
      ) : null}

      <View style={[styles.messageRow, isMine && styles.messageRowMine]}>
        {!isMine ? (
          showAvatar ? (
            <Pressable style={styles.avatarMiniWrap} onPress={onOpenProfile}>
              <WithUAvatar emoji={otherEmoji} size={28} />
            </Pressable>
          ) : (
            <View style={styles.avatarMiniSpacer} />
          )
        ) : (
          <View style={styles.avatarMiniSpacer} />
        )}

        <View
          style={[
            styles.messageBubbleBase,
            isMine ? styles.messageBubbleMine : styles.messageBubbleOther,
            bubbleGroupStyle,
            message.normalized_type === 'image' && styles.imageBubble,
            message.normalized_type === 'audio' && styles.audioBubbleContainer,
          ]}
        >
          {message.normalized_type === 'image' ? (
            message.resolvedImageUrl ? (
              <Image
                source={{ uri: message.resolvedImageUrl }}
                style={styles.chatImage}
                resizeMode="cover"
              />
            ) : (
              <View style={styles.imageFallback}>
                <Text style={styles.imageFallbackText}>Bilden kunde inte laddas</Text>
              </View>
            )
          ) : null}

          {message.normalized_type === 'audio' && message.resolvedAudioUrl ? (
            <AudioBubble
              audioUrl={message.resolvedAudioUrl}
              isMine={isMine}
              durationMs={message.audio_duration_ms}
            />
          ) : null}

          {shouldShowText ? (
            <Text style={[styles.messageContent, isMine && styles.messageContentMine]}>
              {message.content}
            </Text>
          ) : null}
        </View>
      </View>

      <View style={[styles.metaRow, isMine ? styles.metaRowMine : styles.metaRowOther]}>
        <Text style={styles.timeText}>{formatTime(message.created_at)}</Text>
        {isMine ? (
          <Text style={styles.readText}>{message.read_at ? '✓✓' : '✓'}</Text>
        ) : null}
      </View>
    </View>
  );
});

export default function ChatConversationScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ conversationKey?: string | string[] }>();

  const listRef = useRef<FlatList<ChatMessage> | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const mediaCacheRef = useRef<Map<string, string>>(new Map());
  const messageIdsRef = useRef<Set<string>>(new Set());

  const initialScrollDoneRef = useRef(false);
  const shouldStickToBottomRef = useRef(true);

  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(recorder);

  const [loading, setLoading] = useState(true);
  const [sendingText, setSendingText] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [uploadingAudio, setUploadingAudio] = useState(false);
  const [currentUserId, setCurrentUserId] = useState('');
  const [otherProfile, setOtherProfile] = useState<ProfileRow | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [screenErrorText, setScreenErrorText] = useState('');
  const [accessLabel, setAccessLabel] = useState<'match' | 'volunteer' | ''>('');

  const conversationKey = useMemo(
    () => normalizeConversationKeyParam(params.conversationKey),
    [params.conversationKey]
  );

  const isBusy = sendingText || uploadingImage || uploadingAudio;
  const recordingNow = !!recorderState?.isRecording;
  const otherEmoji = otherProfile?.avatar_emoji || '💬';

  const openOtherProfile = useCallback(() => {
    if (!otherProfile?.id) return;

    router.push({
      pathname: '/user/[userId]',
      params: { userId: otherProfile.id },
    });
  }, [otherProfile?.id, router]);

  const scrollToBottom = useCallback((animated: boolean) => {
    requestAnimationFrame(() => {
      listRef.current?.scrollToEnd({ animated });
      setTimeout(() => listRef.current?.scrollToEnd({ animated }), 60);
      setTimeout(() => listRef.current?.scrollToEnd({ animated }), 180);
    });
  }, []);

  const handleListContentChange = useCallback(() => {
    if (!initialScrollDoneRef.current) {
      scrollToBottom(false);
      setTimeout(() => {
        initialScrollDoneRef.current = true;
      }, 250);
      return;
    }

    if (shouldStickToBottomRef.current) {
      scrollToBottom(true);
    }
  }, [scrollToBottom]);

  const handleListScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    const distanceFromBottom = contentSize.height - (contentOffset.y + layoutMeasurement.height);
    shouldStickToBottomRef.current = distanceFromBottom < 100;
  }, []);

  const teardownRealtime = useCallback(async () => {
    const current = channelRef.current;
    channelRef.current = null;
    await removeChannelSafely(current);
  }, []);

  const replaceMessages = useCallback((next: ChatMessage[]) => {
    const sorted = sortMessagesByCreatedAt(next);
    messageIdsRef.current = new Set(sorted.map((item) => item.id));
    setMessages(sorted);
  }, []);

  const mergeMessages = useCallback((incoming: ChatMessage[]) => {
    if (incoming.length === 0) return;

    setMessages((prev) => {
      const map = new Map(prev.map((item) => [item.id, item]));
      incoming.forEach((item) => {
        const existing = map.get(item.id);
        map.set(item.id, existing ? { ...existing, ...item } : item);
      });
      const merged = sortMessagesByCreatedAt(Array.from(map.values()));
      messageIdsRef.current = new Set(merged.map((item) => item.id));
      return merged;
    });
  }, []);

  const markConversationRead = useCallback(async (userId: string, key: string) => {
    if (!userId || !key) return;

    await supabase
      .from('messages')
      .update({ read_at: new Date().toISOString() })
      .eq('conversation_key', key)
      .is('read_at', null)
      .neq('sender_id', userId);
  }, []);

  const loadMessages = useCallback(
    async (userId: string, key: string) => {
      const { data, error } = await supabase
        .from('messages')
        .select(
          'id, sender_id, content, created_at, message_type, read_at, conversation_key, image_url, image_path, audio_url, audio_path, audio_duration_ms, media_url, metadata'
        )
        .eq('conversation_key', key)
        .order('created_at', { ascending: true });

      if (error) throw error;

      const hydrated = await hydrateMessageMedia(
        (data ?? []) as MessageRow[],
        mediaCacheRef.current
      );

      replaceMessages(hydrated);
      await markConversationRead(userId, key);
    },
    [markConversationRead, replaceMessages]
  );

  const insertAndHydrateMessage = useCallback(
    async (payload: Record<string, any>) => {
      const { data, error } = await supabase
        .from('messages')
        .insert(payload)
        .select(
          'id, sender_id, content, created_at, message_type, read_at, conversation_key, image_url, image_path, audio_url, audio_path, audio_duration_ms, media_url, metadata'
        )
        .single();

      if (error) throw error;

      const hydrated = await hydrateOneMessage(data as MessageRow, mediaCacheRef.current);
      mergeMessages([hydrated]);
      return hydrated;
    },
    [mergeMessages]
  );

  const loadConversation = useCallback(async () => {
    try {
      setScreenErrorText('');
      initialScrollDoneRef.current = false;
      shouldStickToBottomRef.current = true;

      if (!conversationKey || !conversationKey.includes('__')) {
        throw new Error('Ogiltig chatt.');
      }

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError) throw userError;
      if (!user) throw new Error('Du måste logga in.');

      const ids = conversationKey.split('__').filter(Boolean);
      if (ids.length !== 2) {
        throw new Error('Ogiltig chattnyckel.');
      }

      if (!ids.includes(user.id)) {
        throw new Error('Du har inte behörighet till den här chatten.');
      }

      const otherId = ids[0] === user.id ? ids[1] : ids[0];
      setCurrentUserId(user.id);

      const [matchedSet, volunteerAccess] = await Promise.all([
        getMatchedTargetIds(user.id),
        hasAcceptedVolunteerConversationAccess(user.id, otherId),
      ]);

      const isMatched = matchedSet.has(otherId);
      const isVolunteer = volunteerAccess;

      if (!isMatched && !isVolunteer) {
        throw new Error('Ni måste vara matchade eller ha en godkänd volontärförfrågan.');
      }

      setAccessLabel(isVolunteer && !isMatched ? 'volunteer' : 'match');

      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('id, name, city, avatar_emoji, is_bankid_verified')
        .eq('id', otherId)
        .maybeSingle();

      if (profileError) throw profileError;

      setOtherProfile((profileData ?? null) as ProfileRow | null);

      await loadMessages(user.id, conversationKey);
    } catch (error: any) {
      setScreenErrorText(error?.message || 'Kunde inte öppna chatten.');
    } finally {
      setLoading(false);
    }
  }, [conversationKey, loadMessages]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      loadConversation();
    }, [loadConversation])
  );

  useEffect(() => {
    if (!currentUserId || !conversationKey) return;

    let cancelled = false;

    const startRealtime = async () => {
      await teardownRealtime();

      const channel = createScopedRealtimeChannel('chat-conversation', conversationKey).on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'messages',
          filter: `conversation_key=eq.${conversationKey}`,
        },
        async (payload) => {
          if (cancelled) return;

          try {
            if (payload.eventType === 'INSERT') {
              const row = payload.new as MessageRow;
              if (!row?.id || messageIdsRef.current.has(row.id)) return;

              const hydrated = await hydrateOneMessage(row, mediaCacheRef.current);
              mergeMessages([hydrated]);

              if (row.sender_id !== currentUserId) {
                await markConversationRead(currentUserId, conversationKey);
              }

              if (shouldStickToBottomRef.current) {
                scrollToBottom(true);
              }
            }

            if (payload.eventType === 'UPDATE') {
              const row = payload.new as MessageRow;
              if (!row?.id) return;

              const hydrated = await hydrateOneMessage(row, mediaCacheRef.current);
              mergeMessages([hydrated]);
            }
          } catch {
            // ignore
          }
        }
      );

      channel.subscribe();

      if (cancelled) {
        await removeChannelSafely(channel);
        return;
      }

      channelRef.current = channel;
    };

    startRealtime();

    return () => {
      cancelled = true;
      teardownRealtime();
    };
  }, [
    conversationKey,
    currentUserId,
    markConversationRead,
    mergeMessages,
    scrollToBottom,
    teardownRealtime,
  ]);

  const sendTextMessage = async () => {
    const trimmed = draft.trim();
    if (!trimmed || !currentUserId || !conversationKey || isBusy) return;

    try {
      setSendingText(true);
      shouldStickToBottomRef.current = true;
      setDraft('');

      await insertAndHydrateMessage({
        sender_id: currentUserId,
        content: trimmed,
        conversation_key: conversationKey,
        message_type: 'text',
      });

      scrollToBottom(true);
    } catch (error: any) {
      setDraft(trimmed);
      Alert.alert('Kunde inte skicka', error?.message || 'Något gick fel.');
    } finally {
      setSendingText(false);
    }
  };

  const sendImageMessage = async () => {
    if (!currentUserId || !conversationKey || isBusy) return;

    try {
      setUploadingImage(true);

      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Tillåt bilder', 'Du måste ge tillgång till bilder för att kunna skicka en bild.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'] as any,
        allowsEditing: true,
        quality: 0.72,
      });

      if (result.canceled || !result.assets?.length) return;

      const asset = result.assets[0];
      const ext = getExtensionFromUri(asset.fileName || asset.uri, 'jpg');
      const fileName = buildSafeFileName(asset.fileName, ext);
      const filePath = `${conversationKey}/${currentUserId}/${Date.now()}-${fileName}`;
      const mimeType = asset.mimeType || guessImageMimeType(fileName);

      await uploadFileFromUri({
        bucket: CHAT_IMAGE_BUCKET,
        filePath,
        localUri: asset.uri,
        contentType: mimeType,
      });

      shouldStickToBottomRef.current = true;

      await insertAndHydrateMessage({
        sender_id: currentUserId,
        content: '[image]',
        conversation_key: conversationKey,
        message_type: 'image',
        image_path: filePath,
        image_url: null,
        media_url: null,
        metadata: {
          width: asset.width ?? null,
          height: asset.height ?? null,
          mimeType,
          originalFileName: asset.fileName ?? null,
        },
      });

      scrollToBottom(true);
    } catch (error: any) {
      Alert.alert('Kunde inte skicka bild', error?.message || 'Något gick fel.');
    } finally {
      setUploadingImage(false);
    }
  };

  const startRecording = async () => {
    if (!currentUserId || !conversationKey || isBusy) return;

    try {
      const permission = await requestRecordingPermissionsAsync();
      if (!permission.granted) {
        Alert.alert(
          'Mikrofon krävs',
          'Du måste ge mikrofonåtkomst för att kunna skicka röstmeddelande.'
        );
        return;
      }

      await setAudioModeAsync({
        playsInSilentMode: true,
        allowsRecording: true,
      });

      await recorder.prepareToRecordAsync();
      recorder.record();
    } catch (error: any) {
      Alert.alert('Kunde inte starta inspelning', error?.message || 'Något gick fel.');
    }
  };

  const stopRecordingAndSend = async () => {
    if (!currentUserId || !conversationKey || uploadingAudio) return;

    try {
      setUploadingAudio(true);

      await recorder.stop();

      await setAudioModeAsync({
        playsInSilentMode: true,
        allowsRecording: false,
      });

      const localUri = recorder.uri || recorderState.url;
      const durationMs = recorderState.durationMillis || null;

      if (!localUri) {
        throw new Error('Ingen ljudfil skapades.');
      }

      const ext = getExtensionFromUri(localUri, 'm4a');
      const fileName = `voice-${Date.now()}.${ext}`;
      const filePath = `${conversationKey}/${currentUserId}/${fileName}`;
      const mimeType = guessAudioMimeType(fileName);

      await uploadFileFromUri({
        bucket: CHAT_AUDIO_BUCKET,
        filePath,
        localUri,
        contentType: mimeType,
      });

      shouldStickToBottomRef.current = true;

      await insertAndHydrateMessage({
        sender_id: currentUserId,
        content: '[audio]',
        conversation_key: conversationKey,
        message_type: 'audio',
        audio_path: filePath,
        audio_url: null,
        media_url: null,
        audio_duration_ms: durationMs,
        metadata: {
          mimeType,
        },
      });

      scrollToBottom(true);
    } catch (error: any) {
      Alert.alert('Kunde inte skicka röstmeddelande', error?.message || 'Något gick fel.');
    } finally {
      setUploadingAudio(false);
    }
  };

  const handleMicPress = async () => {
    if (recordingNow) await stopRecordingAndSend();
    else await startRecording();
  };

  if (loading) {
    return (
      <WithUScreen>
        <View style={styles.centerState}>
          <ActivityIndicator size="large" color="#1C5E52" />
          <Text style={styles.centerStateTitle}>Öppnar chatten...</Text>
          <Text style={styles.centerStateText}>Vi hämtar senaste meddelandena.</Text>
        </View>
      </WithUScreen>
    );
  }

  if (screenErrorText) {
    return (
      <WithUScreen>
        <View style={styles.centerState}>
          <Text style={styles.centerStateTitle}>Något gick fel</Text>
          <Text style={styles.centerStateText}>{screenErrorText}</Text>
        </View>
      </WithUScreen>
    );
  }

  return (
    <WithUScreen>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.header}>
          <View style={styles.headerRow}>
            <Pressable style={styles.backButton} onPress={() => router.back()}>
              <Ionicons name="chevron-back" size={24} color="#1C5E52" />
            </Pressable>

            <Pressable style={styles.headerIdentity} onPress={openOtherProfile}>
              <View style={styles.headerAvatarWrap}>
                <WithUAvatar emoji={otherEmoji} size={44} />
                <View style={styles.onlineDot} />
              </View>

              <View style={styles.headerTextWrap}>
                <Text style={styles.headerTitle}>{otherProfile?.name || 'Chatt'}</Text>
                <Text style={styles.headerSubtitle}>
                  {accessLabel === 'volunteer' ? 'Aktiv nu' : otherProfile?.city || 'I chatten'}
                </Text>
              </View>
            </Pressable>

            <Pressable style={styles.headerIconButton} onPress={openOtherProfile}>
              <Ionicons name="person-outline" size={18} color="#1C5E52" />
            </Pressable>
          </View>
        </View>

        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(item) => item.id}
          style={styles.list}
          contentContainerStyle={
            messages.length === 0 ? styles.emptyListContent : styles.messagesContent
          }
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          onScroll={handleListScroll}
          scrollEventThrottle={16}
          onContentSizeChange={handleListContentChange}
          onLayout={handleListContentChange}
          renderItem={({ item, index }) => {
            const previous = index > 0 ? messages[index - 1] : null;
            const next = index < messages.length - 1 ? messages[index + 1] : null;
            const showDate =
              !previous || formatDate(previous.created_at) !== formatDate(item.created_at);
            const isMine = item.sender_id === currentUserId;
            const groupPosition = getBubbleGroupPosition(previous, item, next);
            const showAvatar = !previous || previous.sender_id !== item.sender_id;

            return (
              <MessageItem
                message={item}
                isMine={isMine}
                showDate={showDate}
                otherEmoji={otherEmoji}
                onOpenProfile={openOtherProfile}
                groupPosition={groupPosition}
                showAvatar={showAvatar}
              />
            );
          }}
          ListEmptyComponent={
            <View style={styles.emptyWrap}>
              <WithUAvatar emoji={otherEmoji} size={58} />
              <Text style={styles.emptyTitle}>{otherProfile?.name || 'Chatt'}</Text>
              <Text style={styles.emptyText}>Skriv första meddelandet här nedanför.</Text>
            </View>
          }
        />

        {recordingNow ? (
          <View style={styles.recordingStrip}>
            <Text style={styles.recordingStripText}>
              🎙 Spelar in... {formatAudioMillis(recorderState.durationMillis)}
            </Text>
          </View>
        ) : null}

        <View style={styles.composer}>
          <View style={styles.composerRow}>
            <Pressable
              style={[styles.composerIcon, uploadingImage && styles.composerIconDisabled]}
              onPress={sendImageMessage}
              disabled={isBusy}
            >
              <Ionicons name="image-outline" size={20} color="#1C5E52" />
            </Pressable>

            <Pressable
              style={[
                styles.composerIcon,
                recordingNow && styles.composerIconRecording,
                uploadingAudio && styles.composerIconDisabled,
              ]}
              onPress={handleMicPress}
              disabled={sendingText || uploadingImage || uploadingAudio}
            >
              <Ionicons
                name={recordingNow ? 'stop' : 'mic-outline'}
                size={18}
                color="#1C5E52"
              />
            </Pressable>

            <View style={styles.inputWrap}>
              <TextInput
                value={draft}
                onChangeText={setDraft}
                placeholder="Aa"
                placeholderTextColor="#A0A8C0"
                style={styles.input}
                multiline
              />
            </View>

            <Pressable
              style={[
                styles.sendCircle,
                (!draft.trim() || isBusy || recordingNow) && styles.sendCircleDisabled,
              ]}
              onPress={sendTextMessage}
              disabled={!draft.trim() || isBusy || recordingNow}
            >
              <Ionicons name="send" size={16} color="#FFFFFF" />
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </WithUScreen>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },

  header: {
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
    paddingTop: Platform.OS === 'ios' ? 54 : 22,
    paddingHorizontal: 12,
    paddingBottom: 12,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  backButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 4,
  },
  headerIdentity: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerAvatarWrap: {
    position: 'relative',
  },
  onlineDot: {
    position: 'absolute',
    right: 1,
    bottom: 1,
    width: 11,
    height: 11,
    borderRadius: 6,
    backgroundColor: '#4CAF8C',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  headerTextWrap: {
    flex: 1,
    marginLeft: 10,
  },
  headerTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: '#1B2B4B',
  },
  headerSubtitle: {
    fontSize: 11,
    color: '#4CAF8C',
    fontWeight: '700',
    marginTop: 1,
  },
  headerIconButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#EAF5F1',
    alignItems: 'center',
    justifyContent: 'center',
  },

  list: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  messagesContent: {
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 8,
  },
  emptyListContent: {
    flexGrow: 1,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 8,
  },

  dateWrap: {
    alignItems: 'center',
    marginVertical: 8,
  },
  dateText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#A0A8C0',
    letterSpacing: 0.4,
  },

  messageRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'flex-start',
    marginBottom: 2,
  },
  messageRowMine: {
    justifyContent: 'flex-end',
  },

  avatarMiniWrap: {
    width: 28,
    marginRight: 6,
    marginBottom: 2,
  },
  avatarMiniSpacer: {
    width: 28,
    marginRight: 6,
  },

  messageBubbleBase: {
    maxWidth: '72%',
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  messageBubbleMine: {
    backgroundColor: '#1C5E52',
  },
  messageBubbleOther: {
    backgroundColor: '#F2F3F5',
  },

  bubbleMineSingle: {
    borderRadius: 20,
    borderBottomRightRadius: 5,
  },
  bubbleMineTop: {
    borderRadius: 20,
    borderBottomRightRadius: 5,
  },
  bubbleMineMiddle: {
    borderRadius: 20,
    borderTopRightRadius: 5,
    borderBottomRightRadius: 5,
  },
  bubbleMineBottom: {
    borderRadius: 20,
    borderTopRightRadius: 5,
  },

  bubbleOtherSingle: {
    borderRadius: 20,
    borderBottomLeftRadius: 5,
  },
  bubbleOtherTop: {
    borderRadius: 20,
    borderBottomLeftRadius: 5,
  },
  bubbleOtherMiddle: {
    borderRadius: 20,
    borderTopLeftRadius: 5,
    borderBottomLeftRadius: 5,
  },
  bubbleOtherBottom: {
    borderRadius: 20,
    borderTopLeftRadius: 5,
  },

  messageContent: {
    fontSize: 14,
    lineHeight: 20,
    color: '#1B2B4B',
  },
  messageContentMine: {
    color: '#FFFFFF',
  },

  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
    marginBottom: 4,
  },
  metaRowMine: {
    justifyContent: 'flex-end',
  },
  metaRowOther: {
    justifyContent: 'flex-start',
    paddingLeft: 34,
  },
  timeText: {
    fontSize: 10,
    color: '#A0A8C0',
    fontWeight: '600',
  },
  readText: {
    fontSize: 10,
    color: '#1C5E52',
    fontWeight: '700',
  },

  imageBubble: {
    padding: 6,
    overflow: 'hidden',
  },
  chatImage: {
    width: 220,
    height: 220,
    borderRadius: 16,
    backgroundColor: '#E8EBF0',
  },
  imageFallback: {
    width: 220,
    height: 220,
    borderRadius: 16,
    backgroundColor: '#E8EBF0',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  imageFallbackText: {
    color: '#6B7280',
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
  },

  audioBubbleContainer: {
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  audioWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 180,
  },
  audioPlayButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  audioPlayButtonMine: {
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  audioInfo: {
    flex: 1,
  },
  audioTitle: {
    fontSize: 13,
    fontWeight: '900',
    color: '#1B2B4B',
  },
  audioTitleMine: {
    color: '#FFFFFF',
  },
  audioMeta: {
    marginTop: 2,
    fontSize: 11,
    color: '#7E879B',
    fontWeight: '700',
  },
  audioMetaMine: {
    color: 'rgba(255,255,255,0.82)',
  },

  emptyWrap: {
    alignItems: 'center',
    paddingTop: 60,
  },
  emptyTitle: {
    marginTop: 12,
    fontSize: 22,
    fontWeight: '900',
    color: '#1B2B4B',
  },
  emptyText: {
    marginTop: 6,
    fontSize: 14,
    color: '#7E879B',
    textAlign: 'center',
  },

  recordingStrip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    backgroundColor: '#FFFFFF',
  },
  recordingStripText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#1C5E52',
    textAlign: 'center',
  },

  composer: {
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#F0F0F0',
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: Platform.OS === 'ios' ? 30 : 14,
  },
  composerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  composerIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  composerIconRecording: {
    backgroundColor: '#FFF3F1',
  },
  composerIconDisabled: {
    opacity: 0.55,
  },

  inputWrap: {
    flex: 1,
    minHeight: 38,
    maxHeight: 110,
    backgroundColor: '#F2F3F5',
    borderRadius: 20,
    justifyContent: 'center',
    paddingHorizontal: 14,
    paddingVertical: 2,
  },
  input: {
    fontSize: 14,
    color: '#1B2B4B',
    maxHeight: 96,
    paddingTop: 9,
    paddingBottom: 9,
  },

  sendCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#1C5E52',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendCircleDisabled: {
    opacity: 0.45,
  },

  centerState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    backgroundColor: '#FFFFFF',
  },
  centerStateTitle: {
    marginTop: 14,
    fontSize: 24,
    fontWeight: '900',
    color: '#1B2B4B',
    textAlign: 'center',
  },
  centerStateText: {
    marginTop: 8,
    fontSize: 15,
    lineHeight: 24,
    color: '#7E879B',
    textAlign: 'center',
  },
});