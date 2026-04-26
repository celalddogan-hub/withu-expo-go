import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { decode } from 'base64-arraybuffer';
import * as FileSystem from 'expo-file-system/legacy';
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioPlayer,
  useAudioPlayerStatus,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import { supabase } from '../../src/lib/supabase';
import { blockUser as blockChatUser, createChatReport } from '../../src/lib/chatSafety';
import { guardContentOrShowHelp } from '../../src/lib/crisisSafety';

type MatchRow = {
  id: string;
  user_id: string;
  target_id: string;
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

const RAPPORTERA_ORSAKER = [
  'Trakasserier eller hot',
  'Mobbning eller kränkning',
  'Olämpliga bilder eller meddelanden',
  'Falsk identitet',
  'Bedrägeri',
  'Annat',
];

function getAvatarEmoji(activity?: string, fallback?: string | null) {
  if (fallback && fallback.trim()) return fallback;
  const value = (activity || '').toLowerCase();

  if (value.includes('kafé') || value.includes('fika') || value.includes('lunch')) return '☕';
  if (value.includes('promenad') || value.includes('löpning') || value.includes('cykling')) return '🚶';
  if (value.includes('plug') || value.includes('studie') || value.includes('språk')) return '📚';
  if (value.includes('brädspel') || value.includes('rollspel') || value.includes('escape')) return '🎲';
  if (value.includes('yoga') || value.includes('gym') || value.includes('träning')) return '💪';
  if (value.includes('konsert') || value.includes('film') || value.includes('utställning')) return '🎬';
  if (value.includes('mat') || value.includes('restaurang') || value.includes('baka')) return '🍽️';

  return '🙂';
}

function formatTime(value?: string | null) {
  if (!value) return '';

  return new Date(value).toLocaleTimeString('sv-SE', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatSeconds(totalSeconds?: number) {
  const seconds = Math.max(0, Math.round(totalSeconds || 0));
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function getMessageText(message: MessageRow) {
  if (message.message_type === 'image') return '📷 Bild';
  if (message.message_type === 'audio') return '🎤 Röstmeddelande';
  return message.content?.trim() || '';
}

function getFileExtension(fileName?: string | null, mimeType?: string | null) {
  if (fileName && fileName.includes('.')) {
    return fileName.split('.').pop() || 'jpg';
  }

  if (mimeType?.includes('/')) {
    return mimeType.split('/')[1];
  }

  return 'jpg';
}

function getAudioExtension(uri?: string | null) {
  if (!uri) return 'm4a';
  const withoutQuery = uri.split('?')[0];
  if (withoutQuery.includes('.')) {
    return withoutQuery.split('.').pop() || 'm4a';
  }
  return 'm4a';
}

function getAudioMimeType(ext?: string) {
  const value = (ext || '').toLowerCase();

  if (value === 'm4a') return 'audio/m4a';
  if (value === 'caf') return 'audio/x-caf';
  if (value === 'wav') return 'audio/wav';
  if (value === 'mp3') return 'audio/mpeg';
  if (value === 'aac') return 'audio/aac';

  return 'audio/m4a';
}

function sortMessages(rows: MessageRow[]) {
  return [...rows].sort((a, b) => {
    const aTime = new Date(a.created_at || '').getTime();
    const bTime = new Date(b.created_at || '').getTime();
    return aTime - bTime;
  });
}

function AudioMessageBubble({
  uri,
  isMine,
  timeText,
  isRead,
}: {
  uri: string;
  isMine: boolean;
  timeText: string;
  isRead: boolean;
}) {
  const player = useAudioPlayer(uri, {
    updateInterval: 500,
    downloadFirst: true,
  });
  const status = useAudioPlayerStatus(player);

  const duration = status.duration ?? 0;
  const current = status.currentTime ?? 0;
  const displayTime =
    status.playing || current > 0
      ? formatSeconds(current)
      : duration > 0
      ? formatSeconds(duration)
      : '0:00';

  const handleToggle = () => {
    if (status.playing) {
      player.pause();
      return;
    }

    if (duration > 0 && current >= duration - 0.15) {
      player.seekTo(0);
    }

    player.play();
  };

  return (
    <View style={styles.audioWrap}>
      <Pressable
        onPress={handleToggle}
        style={[styles.audioPlayButton, isMine && styles.audioPlayButtonMine]}
      >
        <Text style={[styles.audioPlayButtonText, isMine && styles.audioPlayButtonTextMine]}>
          {status.playing ? '❚❚' : '▶'}
        </Text>
      </Pressable>

      <View style={styles.audioCenter}>
        <Text style={[styles.audioTitle, isMine && styles.audioTitleMine]}>Röstmeddelande</Text>
        <Text style={[styles.audioDuration, isMine && styles.audioDurationMine]}>{displayTime}</Text>
      </View>

      <View style={styles.audioMeta}>
        <Text style={[styles.messageTime, isMine && styles.messageTimeMine]}>{timeText}</Text>
        {isMine && isRead ? <Text style={styles.readStatusText}>Läst</Text> : null}
      </View>
    </View>
  );
}

export default function ChatDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const rawMatchId = params.matchId;
  const matchId = Array.isArray(rawMatchId)
    ? rawMatchId[0]
    : (rawMatchId as string | undefined);

  const scrollRef = useRef<ScrollView>(null);
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(recorder);

  const [currentUserId, setCurrentUserId] = useState('');
  const [otherProfile, setOtherProfile] = useState<ProfileRow | null>(null);
  const [mirrorMatchId, setMirrorMatchId] = useState<string | null>(null);

  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [imageUrlsByMessageId, setImageUrlsByMessageId] = useState<Record<string, string>>({});
  const [audioUrlsByMessageId, setAudioUrlsByMessageId] = useState<Record<string, string>>({});

  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [sendingImage, setSendingImage] = useState(false);
  const [sendingAudio, setSendingAudio] = useState(false);
  const [hiding, setHiding] = useState(false);
  const [errorText, setErrorText] = useState('');

  const [visaMeny, setVisaMeny] = useState(false);
  const [visaRapport, setVisaRapport] = useState(false);
  const [valdOrsak, setValdOrsak] = useState('');
  const [rapportSkickad, setRapportSkickad] = useState(false);

  const scrollToBottom = useCallback((animated = true) => {
    setTimeout(() => {
      scrollRef.current?.scrollToEnd({ animated });
    }, 50);
  }, []);

  const markIncomingAsRead = useCallback(
    async (userId: string, currentMatchId: string) => {
      await supabase
        .from('messages')
        .update({ read_at: new Date().toISOString() })
        .eq('match_id', currentMatchId)
        .is('read_at', null)
        .neq('sender_id', userId);
    },
    []
  );

  const hydrateImageUrls = useCallback(async (rows: MessageRow[]) => {
    const imageRows = rows.filter(
      (message) =>
        message.message_type === 'image' &&
        !!message.media_url &&
        !message.media_url.startsWith('file://') &&
        !message.media_url.startsWith('http')
    );

    if (imageRows.length === 0) return;

    const pairs = await Promise.all(
      imageRows.map(async (message) => {
        try {
          const { data, error } = await supabase.storage
            .from('chat-media')
            .createSignedUrl(message.media_url as string, 60 * 60);

          if (error || !data?.signedUrl) return [message.id, ''] as const;
          return [message.id, data.signedUrl] as const;
        } catch {
          return [message.id, ''] as const;
        }
      })
    );

    const valid = Object.fromEntries(pairs.filter(([, url]) => !!url));
    if (Object.keys(valid).length > 0) {
      setImageUrlsByMessageId((prev) => ({ ...prev, ...valid }));
    }
  }, []);

  const hydrateAudioUrls = useCallback(async (rows: MessageRow[]) => {
    const audioRows = rows.filter(
      (message) =>
        message.message_type === 'audio' &&
        !!message.media_url &&
        !message.media_url.startsWith('file://') &&
        !message.media_url.startsWith('http')
    );

    if (audioRows.length === 0) return;

    const pairs = await Promise.all(
      audioRows.map(async (message) => {
        try {
          const { data, error } = await supabase.storage
            .from('chat-media')
            .createSignedUrl(message.media_url as string, 60 * 60);

          if (error || !data?.signedUrl) return [message.id, ''] as const;
          return [message.id, data.signedUrl] as const;
        } catch {
          return [message.id, ''] as const;
        }
      })
    );

    const valid = Object.fromEntries(pairs.filter(([, url]) => !!url));
    if (Object.keys(valid).length > 0) {
      setAudioUrlsByMessageId((prev) => ({ ...prev, ...valid }));
    }
  }, []);

  const loadChat = useCallback(
    async (options?: { silent?: boolean }) => {
      try {
        const silent = options?.silent === true;

        if (!matchId) {
          setErrorText('Match-id saknas.');
          setLoading(false);
          return;
        }

        if (!silent) setLoading(true);
        setErrorText('');

        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
          setErrorText('Du måste logga in för att öppna chatten.');
          setLoading(false);
          return;
        }

        setCurrentUserId(user.id);

        const { data: matchData, error: matchError } = await supabase
          .from('matches')
          .select('id, user_id, target_id, is_match, created_at')
          .eq('id', matchId)
          .maybeSingle();

        if (matchError) throw matchError;

        const match = (matchData as MatchRow | null) ?? null;

        if (!match) {
          setErrorText('Chatten hittades inte.');
          setLoading(false);
          return;
        }

        const isParticipant = match.user_id === user.id || match.target_id === user.id;

        if (!isParticipant) {
          setErrorText('Du har inte åtkomst till den här chatten.');
          setLoading(false);
          return;
        }

        const otherUserId = match.user_id === user.id ? match.target_id : match.user_id;

        const { data: mirrorMatchData } = await supabase
          .from('matches')
          .select('id')
          .eq('user_id', otherUserId)
          .eq('target_id', user.id)
          .eq('is_match', true)
          .maybeSingle();

        setMirrorMatchId(mirrorMatchData?.id ?? null);

        const { data: profileData, error: profileError } = await supabase
          .from('profiles')
          .select('id, name, age, city, activities, avatar_emoji, is_bankid_verified')
          .eq('id', otherUserId)
          .maybeSingle();

        if (profileError) throw profileError;

        setOtherProfile((profileData as ProfileRow | null) ?? null);

        const { data: messageData, error: messageError } = await supabase
          .from('messages')
          .select('id, match_id, sender_id, content, message_type, media_url, read_at, created_at')
          .eq('match_id', matchId)
          .order('created_at', { ascending: true });

        if (messageError) throw messageError;

        const rows = (messageData ?? []) as MessageRow[];
        setMessages(rows);
        await hydrateImageUrls(rows);
        await hydrateAudioUrls(rows);

        await markIncomingAsRead(user.id, matchId);

        setMessages((prev) =>
          prev.map((msg) =>
            msg.sender_id !== user.id && !msg.read_at
              ? { ...msg, read_at: new Date().toISOString() }
              : msg
          )
        );
      } catch (error: any) {
        setErrorText(error?.message || 'Kunde inte ladda chatten.');
      } finally {
        setLoading(false);
      }
    },
    [hydrateAudioUrls, hydrateImageUrls, markIncomingAsRead, matchId]
  );

  const insertMessageForBothSides = useCallback(
    async ({
      content,
      message_type,
      media_url,
    }: {
      content: string;
      message_type: 'text' | 'image' | 'audio';
      media_url?: string | null;
    }) => {
      if (!matchId || !currentUserId) {
        throw new Error('Match eller användare saknas.');
      }

      const rows: Array<{
        match_id: string;
        sender_id: string;
        content: string;
        message_type: 'text' | 'image' | 'audio';
        media_url: string | null;
      }> = [
        {
          match_id: matchId,
          sender_id: currentUserId,
          content,
          message_type,
          media_url: media_url ?? null,
        },
      ];

      if (mirrorMatchId && mirrorMatchId !== matchId) {
        rows.push({
          match_id: mirrorMatchId,
          sender_id: currentUserId,
          content,
          message_type,
          media_url: media_url ?? null,
        });
      }

      const { data, error } = await supabase
        .from('messages')
        .insert(rows)
        .select('id, match_id, sender_id, content, message_type, media_url, read_at, created_at');

      if (error) throw error;

      const insertedRows = (data ?? []) as MessageRow[];
      const ownInserted = insertedRows.find((row) => row.match_id === matchId);

      if (!ownInserted) {
        throw new Error('Kunde inte hitta sparat meddelande för aktuell chatt.');
      }

      return ownInserted;
    },
    [matchId, currentUserId, mirrorMatchId]
  );

  const handleIncomingMessage = useCallback(
    async (incoming: MessageRow) => {
      setMessages((prev) => {
        if (prev.some((msg) => msg.id === incoming.id)) {
          return prev;
        }

        return sortMessages([...prev, incoming]);
      });

      if (
        incoming.message_type === 'image' &&
        incoming.media_url &&
        !incoming.media_url.startsWith('http') &&
        !incoming.media_url.startsWith('file://')
      ) {
        await hydrateImageUrls([incoming]);
      }

      if (
        incoming.message_type === 'audio' &&
        incoming.media_url &&
        !incoming.media_url.startsWith('http') &&
        !incoming.media_url.startsWith('file://')
      ) {
        await hydrateAudioUrls([incoming]);
      }

      if (incoming.sender_id !== currentUserId && currentUserId && matchId) {
        await markIncomingAsRead(currentUserId, matchId);

        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === incoming.id ? { ...msg, read_at: new Date().toISOString() } : msg
          )
        );
      }

      scrollToBottom();
    },
    [
      currentUserId,
      hydrateAudioUrls,
      hydrateImageUrls,
      markIncomingAsRead,
      matchId,
      scrollToBottom,
    ]
  );

  useEffect(() => {
    loadChat();
  }, [loadChat]);

  useEffect(() => {
    if (!matchId) return;

    const channel = supabase
      .channel(`chat:${matchId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `match_id=eq.${matchId}`,
        },
        async (payload) => {
          await handleIncomingMessage(payload.new as MessageRow);
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'messages',
          filter: `match_id=eq.${matchId}`,
        },
        (payload) => {
          const updated = payload.new as MessageRow;

          setMessages((prev) =>
            prev.map((msg) => (msg.id === updated.id ? { ...msg, ...updated } : msg))
          );
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [matchId, handleIncomingMessage]);

  useEffect(() => {
    if (!loading) scrollToBottom(false);
  }, [loading, scrollToBottom]);

  useEffect(() => {
    if (messages.length > 0) scrollToBottom(false);
  }, [messages.length, scrollToBottom]);

  const handleSendText = async () => {
    const trimmed = draft.trim();
    if (!trimmed || !matchId || !currentUserId || sending) return;

    const isSafe = await guardContentOrShowHelp({
      text: trimmed,
      reporterId: currentUserId,
      router,
      surface: 'chat',
      targetUserId: otherProfile?.id,
      conversationKey: matchId,
      matchId,
    });
    if (!isSafe) return;

    const optimisticId = `temp-${Date.now()}`;
    const optimisticMessage: MessageRow = {
      id: optimisticId,
      match_id: matchId,
      sender_id: currentUserId,
      content: trimmed,
      message_type: 'text',
      media_url: null,
      read_at: null,
      created_at: new Date().toISOString(),
    };

    try {
      setSending(true);
      setMessages((prev) => [...prev, optimisticMessage]);
      setDraft('');
      scrollToBottom();

      const inserted = await insertMessageForBothSides({
        content: trimmed,
        message_type: 'text',
        media_url: null,
      });

      setMessages((prev) =>
        sortMessages([...prev.filter((msg) => msg.id !== optimisticId && msg.id !== inserted.id), inserted])
      );

      scrollToBottom();
    } catch (error: any) {
      setMessages((prev) => prev.filter((msg) => msg.id !== optimisticId));
      Alert.alert('Kunde inte skicka', error?.message || 'Något gick fel.');
    } finally {
      setSending(false);
    }
  };

  const handlePickAndSendImage = async () => {
    if (!matchId || !currentUserId || sendingImage) return;

    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (!permission.granted) {
        Alert.alert(
          'Tillåt bilder',
          'Du behöver ge appen tillgång till bilder för att kunna skicka en bild.'
        );
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'] as any,
        allowsEditing: true,
        quality: 0.8,
        base64: true,
      });

      if (result.canceled || !result.assets?.[0]) return;

      const asset = result.assets[0];

      if (!asset.base64) {
        Alert.alert('Kunde inte läsa bilden', 'Försök välja bilden igen.');
        return;
      }

      const mimeType = asset.mimeType || 'image/jpeg';
      const ext = getFileExtension(asset.fileName, mimeType);
      const storagePath = `matches/${matchId}/${currentUserId}-${Date.now()}.${ext}`;

      const optimisticId = `temp-image-${Date.now()}`;
      const optimisticMessage: MessageRow = {
        id: optimisticId,
        match_id: matchId,
        sender_id: currentUserId,
        content: '',
        message_type: 'image',
        media_url: asset.uri,
        read_at: null,
        created_at: new Date().toISOString(),
      };

      setSendingImage(true);
      setMessages((prev) => [...prev, optimisticMessage]);
      setImageUrlsByMessageId((prev) => ({
        ...prev,
        [optimisticId]: asset.uri,
      }));
      scrollToBottom();

      const { error: uploadError } = await supabase.storage
        .from('chat-media')
        .upload(storagePath, decode(asset.base64), {
          contentType: mimeType,
          upsert: false,
        });

      if (uploadError) throw uploadError;

      const { data: signedData } = await supabase.storage
        .from('chat-media')
        .createSignedUrl(storagePath, 60 * 60);

      const inserted = await insertMessageForBothSides({
        content: '',
        message_type: 'image',
        media_url: storagePath,
      });

      setMessages((prev) =>
        sortMessages([...prev.filter((msg) => msg.id !== optimisticId && msg.id !== inserted.id), inserted])
      );

      setImageUrlsByMessageId((prev) => {
        const next = { ...prev };
        delete next[optimisticId];
        next[inserted.id] = signedData?.signedUrl || asset.uri;
        return next;
      });

      scrollToBottom();
    } catch (error: any) {
      setMessages((prev) => prev.filter((msg) => !msg.id.startsWith('temp-image-')));
      setImageUrlsByMessageId((prev) => {
        const next = { ...prev };
        Object.keys(next).forEach((key) => {
          if (key.startsWith('temp-image-')) delete next[key];
        });
        return next;
      });

      Alert.alert('Kunde inte skicka bild', error?.message || 'Något gick fel.');
    } finally {
      setSendingImage(false);
    }
  };

  const handleStartRecording = async () => {
    if (!matchId || !currentUserId || sendingAudio) return;
    if (recorderState.isRecording) return;

    try {
      const permission = await requestRecordingPermissionsAsync();

      if (!permission.granted) {
        Alert.alert(
          'Tillåt mikrofon',
          'Du behöver ge appen tillgång till mikrofonen för att kunna skicka röstmeddelanden.'
        );
        return;
      }

      await setAudioModeAsync({
        allowsRecording: true,
        playsInSilentMode: true,
      });

      await recorder.prepareToRecordAsync();
      recorder.record();
    } catch (error: any) {
      Alert.alert('Kunde inte starta inspelning', error?.message || 'Något gick fel.');
    }
  };

  const handleStopAndSendRecording = async () => {
    if (!matchId || !currentUserId || sendingAudio) return;
    if (!recorderState.isRecording) return;

    try {
      setSendingAudio(true);

      await recorder.stop();
      const localUri = recorder.uri;

      await setAudioModeAsync({
        allowsRecording: false,
        playsInSilentMode: true,
      });

      if (!localUri) {
        throw new Error('Inspelningen kunde inte hittas.');
      }

      const base64Audio = await FileSystem.readAsStringAsync(localUri, {
        encoding: FileSystem.EncodingType.Base64,
      });

      const ext = getAudioExtension(localUri);
      const mimeType = getAudioMimeType(ext);
      const storagePath = `matches/${matchId}/${currentUserId}-${Date.now()}.${ext}`;

      const optimisticId = `temp-audio-${Date.now()}`;
      const optimisticMessage: MessageRow = {
        id: optimisticId,
        match_id: matchId,
        sender_id: currentUserId,
        content: '',
        message_type: 'audio',
        media_url: localUri,
        read_at: null,
        created_at: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, optimisticMessage]);
      setAudioUrlsByMessageId((prev) => ({
        ...prev,
        [optimisticId]: localUri,
      }));
      scrollToBottom();

      const { error: uploadError } = await supabase.storage
        .from('chat-media')
        .upload(storagePath, decode(base64Audio), {
          contentType: mimeType,
          upsert: false,
        });

      if (uploadError) throw uploadError;

      const { data: signedData } = await supabase.storage
        .from('chat-media')
        .createSignedUrl(storagePath, 60 * 60);

      const inserted = await insertMessageForBothSides({
        content: '',
        message_type: 'audio',
        media_url: storagePath,
      });

      setMessages((prev) =>
        sortMessages([...prev.filter((msg) => msg.id !== optimisticId && msg.id !== inserted.id), inserted])
      );

      setAudioUrlsByMessageId((prev) => {
        const next = { ...prev };
        delete next[optimisticId];
        next[inserted.id] = signedData?.signedUrl || localUri;
        return next;
      });

      scrollToBottom();
    } catch (error: any) {
      setMessages((prev) => prev.filter((msg) => !msg.id.startsWith('temp-audio-')));
      setAudioUrlsByMessageId((prev) => {
        const next = { ...prev };
        Object.keys(next).forEach((key) => {
          if (key.startsWith('temp-audio-')) delete next[key];
        });
        return next;
      });

      Alert.alert('Kunde inte skicka röstmeddelande', error?.message || 'Något gick fel.');
    } finally {
      setSendingAudio(false);
    }
  };

  const handleHideChat = async () => {
    if (!matchId || !currentUserId || hiding) return;

    try {
      setHiding(true);

      const { error } = await supabase
        .from('hidden_chats')
        .upsert(
          { user_id: currentUserId, match_id: matchId },
          { onConflict: 'user_id,match_id' }
        );

      if (error) throw error;

      router.replace('/chat');
    } catch (error: any) {
      Alert.alert('Kunde inte ta bort chatten', error?.message || 'Något gick fel.');
    } finally {
      setHiding(false);
    }
  };

  const confirmHideChat = () => {
    Alert.alert(
      'Ta bort chatten',
      `Vill du dölja chatten med ${otherProfile?.name || 'den här personen'}?`,
      [
        { text: 'Avbryt', style: 'cancel' },
        { text: 'Ta bort', style: 'destructive', onPress: handleHideChat },
      ]
    );
  };

  const skickaRapport = async () => {
    if (!valdOrsak || !currentUserId || !otherProfile?.id) return;

    try {
      await createChatReport({
        reporterId: currentUserId,
        reportedUserId: otherProfile.id,
        reason: 'unsafe_behavior',
        details: valdOrsak,
        conversationKey: matchId,
        matchId,
      });
      setRapportSkickad(true);
    } catch (error: any) {
      Alert.alert('Kunde inte skicka rapport', error?.message || 'Försök igen.');
    }
  };

  const stangRapport = () => {
    setVisaRapport(false);
    setValdOrsak('');
    setRapportSkickad(false);
  };

  const blockera = () => {
    setVisaMeny(false);

    Alert.alert(
      'Blockera',
      `Är du säker på att du vill blockera ${otherProfile?.name}? De kan inte längre se din profil eller kontakta dig.`,
      [
        { text: 'Avbryt', style: 'cancel' },
        {
          text: 'Blockera',
          style: 'destructive',
          onPress: async () => {
            try {
              if (!currentUserId || !otherProfile?.id) return;
              await blockChatUser(currentUserId, otherProfile.id);
              router.replace('/chat');
            } catch (error: any) {
              Alert.alert('Kunde inte blockera', error?.message || 'Försök igen.');
            }
          },
        },
      ]
    );
  };

  const headerEmoji = useMemo(
    () => getAvatarEmoji((otherProfile?.activities ?? [])[0], otherProfile?.avatar_emoji),
    [otherProfile]
  );

  const lastReadOwnMessageId = useMemo(() => {
    const ownRead = messages.filter((m) => m.sender_id === currentUserId && !!m.read_at);
    return ownRead.length > 0 ? ownRead[ownRead.length - 1].id : null;
  }, [messages, currentUserId]);

  const recordingSeconds = Math.floor((recorderState.durationMillis || 0) / 1000);

  if (loading) {
    return (
      <View style={styles.screen}>
        <View style={styles.stateCard}>
          <ActivityIndicator size="large" color="#1C5E52" />
          <Text style={styles.stateTitle}>Laddar chatten…</Text>
          <Text style={styles.stateText}>Hämtar matchperson och meddelanden.</Text>
        </View>
      </View>
    );
  }

  if (errorText) {
    return (
      <View style={styles.screen}>
        <View style={styles.stateCard}>
          <Text style={styles.stateTitle}>Chatten kunde inte laddas</Text>
          <Text style={styles.stateText}>{errorText}</Text>
          <Pressable style={styles.primaryButton} onPress={() => loadChat()}>
            <Text style={styles.primaryButtonText}>Försök igen</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={0}
    >
      <Modal visible={visaRapport} animationType="slide" presentationStyle="pageSheet">
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Pressable onPress={stangRapport}>
              <Text style={styles.modalAvbryt}>Avbryt</Text>
            </Pressable>
            <Text style={styles.modalTitel}>Rapportera</Text>
            <View style={{ width: 60 }} />
          </View>

          {rapportSkickad ? (
            <View style={styles.tackBox}>
              <Text style={styles.tackEmoji}>✅</Text>
              <Text style={styles.tackTitel}>Rapport skickad</Text>
              <Text style={styles.tackText}>
                Tack för att du rapporterade. Vi granskar ärendet inom 24 timmar.
              </Text>
              <Pressable style={styles.stangBtn} onPress={stangRapport}>
                <Text style={styles.stangBtnText}>Stäng</Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.modalContent}>
              <Text style={styles.modalInfo}>
                Din rapport är anonym för den du rapporterar.
              </Text>

              {RAPPORTERA_ORSAKER.map((orsak) => (
                <Pressable
                  key={orsak}
                  onPress={() => setValdOrsak(orsak)}
                  style={[styles.orsakRad, valdOrsak === orsak && styles.orsakRadVald]}
                >
                  <Text
                    style={[styles.orsakText, valdOrsak === orsak && styles.orsakTextVald]}
                  >
                    {orsak}
                  </Text>

                  <View style={[styles.radio, valdOrsak === orsak && styles.radioVald]}>
                    {valdOrsak === orsak && <View style={styles.radioDot} />}
                  </View>
                </Pressable>
              ))}

              <Pressable
                onPress={skickaRapport}
                disabled={!valdOrsak}
                style={[styles.rapporteraBtn, !valdOrsak && styles.rapporteraBtnDisabled]}
              >
                <Text
                  style={[styles.rapporteraBtnText, !valdOrsak && { color: '#7A8AAA' }]}
                >
                  Skicka rapport
                </Text>
              </Pressable>
            </View>
          )}
        </View>
      </Modal>

      <Modal visible={visaMeny} animationType="fade" transparent>
        <Pressable style={styles.menyOverlay} onPress={() => setVisaMeny(false)}>
          <View style={styles.menyKort}>
            <Pressable
              style={styles.menyRad}
              onPress={() => {
                setVisaMeny(false);
                setVisaRapport(true);
              }}
            >
              <Text style={styles.menyRadText}>⚠️ Rapportera {otherProfile?.name}</Text>
            </Pressable>

            <View style={styles.menyDivider} />

            <Pressable style={styles.menyRad} onPress={blockera}>
              <Text style={[styles.menyRadText, { color: '#C0392B' }]}>
                🚫 Blockera {otherProfile?.name}
              </Text>
            </Pressable>

            <View style={styles.menyDivider} />

            <Pressable style={styles.menyRad} onPress={confirmHideChat}>
              <Text style={[styles.menyRadText, { color: '#7A8AAA' }]}>Ta bort chatten</Text>
            </Pressable>

            <View style={styles.menyDivider} />

            <Pressable style={styles.menyRad} onPress={() => setVisaMeny(false)}>
              <Text style={[styles.menyRadText, { color: '#7A8AAA' }]}>Avbryt</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>

      <View style={styles.headerCard}>
        <Pressable style={styles.headerIconButton} onPress={() => router.back()}>
          <Text style={styles.headerIconText}>‹</Text>
        </Pressable>

        <View style={styles.headerCenter}>
          <View style={styles.headerIdentityRow}>
            <View style={styles.headerAvatarShell}>
              <Text style={styles.headerAvatarEmoji}>{headerEmoji}</Text>
            </View>

            <View style={styles.headerTextWrap}>
              <Text style={styles.headerName}>
                {otherProfile?.name || 'Ny match'}
                {otherProfile?.age ? `, ${otherProfile.age}` : ''}
              </Text>
              <Text style={styles.headerSubline}>
                {otherProfile?.is_bankid_verified ? '✓ BankID-verifierad' : 'Profil'}
              </Text>
              <Text style={styles.headerMeta}>
                {otherProfile?.city ? `${otherProfile.city} · ` : ''}
                {(otherProfile?.activities ?? [])[0] || 'Aktivitet'}
              </Text>
            </View>
          </View>
        </View>

        <Pressable style={styles.menyKnappBtn} onPress={() => setVisaMeny(true)}>
          <Text style={styles.menyKnappText}>⋮</Text>
        </Pressable>
      </View>

      <View style={styles.secureBanner}>
        <Text style={styles.secureBannerText}>🔒 Privat chatt</Text>
      </View>

      <View style={styles.chatBody}>
        <ScrollView
          ref={scrollRef}
          style={styles.messagesArea}
          contentContainerStyle={styles.messagesContent}
          keyboardShouldPersistTaps="handled"
          onContentSizeChange={() => scrollToBottom(false)}
        >
          {messages.map((message) => {
            const isMine = message.sender_id === currentUserId;
            const isLastRead = lastReadOwnMessageId === message.id;
            const imageUri =
              imageUrlsByMessageId[message.id] ||
              (message.media_url?.startsWith('file://') ? message.media_url : undefined);
            const audioUri =
              audioUrlsByMessageId[message.id] ||
              (message.media_url?.startsWith('file://') ? message.media_url : undefined);

            return (
              <View
                key={message.id}
                style={[styles.messageRow, isMine ? styles.messageRowMine : styles.messageRowOther]}
              >
                <View style={[styles.bubble, isMine ? styles.bubbleMine : styles.bubbleOther]}>
                  {message.message_type === 'image' ? (
                    imageUri ? (
                      <Image
                        source={{ uri: imageUri }}
                        style={styles.messageImage}
                        resizeMode="cover"
                      />
                    ) : (
                      <View style={styles.imagePlaceholder}>
                        <Text style={styles.imagePlaceholderText}>Laddar bild…</Text>
                      </View>
                    )
                  ) : message.message_type === 'audio' ? (
                    audioUri ? (
                      <AudioMessageBubble
                        uri={audioUri}
                        isMine={isMine}
                        timeText={formatTime(message.created_at)}
                        isRead={isMine && isLastRead && !!message.read_at}
                      />
                    ) : (
                      <View style={styles.audioLoadingBox}>
                        <Text style={styles.imagePlaceholderText}>Laddar ljud…</Text>
                      </View>
                    )
                  ) : (
                    <>
                      <Text style={[styles.messageText, isMine && styles.messageTextMine]}>
                        {getMessageText(message)}
                      </Text>

                      <Text style={[styles.messageTime, isMine && styles.messageTimeMine]}>
                        {formatTime(message.created_at)}
                      </Text>

                      {isMine && isLastRead && message.read_at ? (
                        <Text style={styles.readStatusText}>Läst</Text>
                      ) : null}
                    </>
                  )}
                </View>
              </View>
            );
          })}

          <View style={styles.bottomSpacer} />
        </ScrollView>

        <View style={styles.composerWrap}>
          {recorderState.isRecording ? (
            <View style={styles.recordingBanner}>
              <Text style={styles.recordingBannerDot}>●</Text>
              <Text style={styles.recordingBannerText}>
                Spelar in {formatSeconds(recordingSeconds)}
              </Text>
            </View>
          ) : null}

          <View style={styles.composerCard}>
            <Pressable
              style={[
                styles.cameraButton,
                (sendingImage || sending || sendingAudio) && styles.buttonDisabled,
              ]}
              onPress={handlePickAndSendImage}
              disabled={sendingImage || sending || sendingAudio}
            >
              <Text style={styles.cameraButtonIcon}>{sendingImage ? '…' : '📷'}</Text>
            </Pressable>

            <Pressable
              style={[
                styles.micButton,
                recorderState.isRecording && styles.micButtonActive,
                sendingAudio && styles.buttonDisabled,
              ]}
              onPress={recorderState.isRecording ? handleStopAndSendRecording : handleStartRecording}
              disabled={sendingAudio}
            >
              <Text style={styles.micButtonIcon}>
                {sendingAudio ? '…' : recorderState.isRecording ? '■' : '🎤'}
              </Text>
            </Pressable>

            <TextInput
              value={draft}
              onChangeText={setDraft}
              placeholder="Skriv ett meddelande..."
              placeholderTextColor="#7A8AAA"
              style={styles.input}
              multiline
              onFocus={() => scrollToBottom(false)}
            />

            <Pressable
              style={[styles.sendButton, sending && styles.buttonDisabled]}
              onPress={handleSendText}
              disabled={sending}
            >
              <Text style={styles.sendButtonText}>{sending ? '...' : '➤'}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#F3F5FA',
  },

  chatBody: {
    flex: 1,
  },

  stateCard: {
    marginTop: 120,
    marginHorizontal: 20,
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#DDE2EF',
    padding: 22,
    alignItems: 'center',
    shadowColor: '#1B2B4B',
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  stateTitle: {
    color: '#1B2B4B',
    fontSize: 24,
    fontWeight: '800',
    marginTop: 14,
    marginBottom: 8,
    textAlign: 'center',
  },
  stateText: {
    color: '#333333',
    fontSize: 15,
    lineHeight: 24,
    textAlign: 'center',
    marginBottom: 18,
  },
  primaryButton: {
    backgroundColor: '#1C5E52',
    borderRadius: 14,
    paddingVertical: 15,
    paddingHorizontal: 18,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
  },

  headerCard: {
    paddingTop: 56,
    paddingBottom: 18,
    paddingHorizontal: 20,
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#DDE2EF',
  },
  headerIconButton: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: '#EEF1F8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerIconText: {
    color: '#1B2B4B',
    fontSize: 30,
    lineHeight: 30,
    fontWeight: '700',
  },
  headerCenter: {
    flex: 1,
    marginHorizontal: 12,
  },
  headerIdentityRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerAvatarShell: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: '#FCEAEA',
    borderWidth: 1,
    borderColor: '#F0D9D4',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  headerAvatarEmoji: {
    fontSize: 28,
  },
  headerTextWrap: {
    flex: 1,
  },
  headerName: {
    color: '#1B2B4B',
    fontSize: 24,
    fontWeight: '900',
    marginBottom: 2,
  },
  headerSubline: {
    color: '#1C5E52',
    fontSize: 14,
    fontWeight: '800',
    marginBottom: 2,
  },
  headerMeta: {
    color: '#7A8AAA',
    fontSize: 14,
  },
  menyKnappBtn: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: '#EEF1F8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  menyKnappText: {
    color: '#1B2B4B',
    fontSize: 22,
    fontWeight: '700',
  },

  secureBanner: {
    backgroundColor: '#EAF5F1',
    paddingVertical: 11,
    alignItems: 'center',
    justifyContent: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#DDE2EF',
  },
  secureBannerText: {
    color: '#1C5E52',
    fontSize: 16,
    fontWeight: '800',
  },

  messagesArea: {
    flex: 1,
  },
  messagesContent: {
    paddingHorizontal: 16,
    paddingTop: 18,
    paddingBottom: 20,
    flexGrow: 1,
    justifyContent: 'flex-end',
  },
  messageRow: {
    marginBottom: 12,
    flexDirection: 'row',
  },
  messageRowMine: {
    justifyContent: 'flex-end',
  },
  messageRowOther: {
    justifyContent: 'flex-start',
  },
  bubble: {
    maxWidth: '78%',
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  bubbleMine: {
    backgroundColor: '#1C5E52',
    borderBottomRightRadius: 8,
  },
  bubbleOther: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#DDE2EF',
    borderBottomLeftRadius: 8,
  },
  messageText: {
    color: '#1B2B4B',
    fontSize: 16,
    lineHeight: 24,
  },
  messageTextMine: {
    color: '#FFFFFF',
  },
  messageImage: {
    width: 190,
    height: 190,
    borderRadius: 16,
    backgroundColor: '#EEF1F8',
  },
  imagePlaceholder: {
    width: 190,
    height: 190,
    borderRadius: 16,
    backgroundColor: '#EEF1F8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  imagePlaceholderText: {
    color: '#7A8AAA',
    fontSize: 13,
    fontWeight: '700',
  },
  audioLoadingBox: {
    width: 210,
    height: 68,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  audioWrap: {
    width: 210,
    minHeight: 68,
    flexDirection: 'row',
    alignItems: 'center',
  },
  audioPlayButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#EEF1F8',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  audioPlayButtonMine: {
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  audioPlayButtonText: {
    color: '#1B2B4B',
    fontSize: 16,
    fontWeight: '900',
  },
  audioPlayButtonTextMine: {
    color: '#FFFFFF',
  },
  audioCenter: {
    flex: 1,
  },
  audioTitle: {
    color: '#1B2B4B',
    fontSize: 15,
    fontWeight: '800',
    marginBottom: 2,
  },
  audioTitleMine: {
    color: '#FFFFFF',
  },
  audioDuration: {
    color: '#7A8AAA',
    fontSize: 13,
    fontWeight: '700',
  },
  audioDurationMine: {
    color: '#D6F0E9',
  },
  audioMeta: {
    alignItems: 'flex-end',
    marginLeft: 8,
  },
  messageTime: {
    color: '#7A8AAA',
    fontSize: 12,
    marginTop: 8,
    alignSelf: 'flex-end',
  },
  messageTimeMine: {
    color: '#D6F0E9',
  },
  readStatusText: {
    color: '#D6F0E9',
    fontSize: 12,
    fontWeight: '700',
    marginTop: 4,
    alignSelf: 'flex-end',
  },
  bottomSpacer: {
    height: 6,
  },

  composerWrap: {
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#DDE2EF',
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: Platform.OS === 'ios' ? 20 : 14,
  },
  recordingBanner: {
    marginBottom: 10,
    backgroundColor: '#FCEAEA',
    borderWidth: 1,
    borderColor: '#F2C8C0',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
  },
  recordingBannerDot: {
    color: '#D76550',
    fontSize: 14,
    marginRight: 8,
  },
  recordingBannerText: {
    color: '#D76550',
    fontSize: 14,
    fontWeight: '800',
  },
  composerCard: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    backgroundColor: '#FFFFFF',
  },
  cameraButton: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: '#EEF1F8',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
    marginBottom: 4,
  },
  cameraButtonIcon: {
    fontSize: 20,
  },
  micButton: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: '#EEF1F8',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
    marginBottom: 4,
  },
  micButtonActive: {
    backgroundColor: '#FCEAEA',
  },
  micButtonIcon: {
    fontSize: 18,
  },
  input: {
    flex: 1,
    minHeight: 54,
    maxHeight: 130,
    backgroundColor: '#F0F2F8',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#DDE2EF',
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: '#1B2B4B',
    fontSize: 16,
  },
  sendButton: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: '#1C5E52',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 10,
    shadowColor: '#1B2B4B',
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  sendButtonText: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '800',
  },

  menyOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  menyKort: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    margin: 16,
    overflow: 'hidden',
  },
  menyRad: {
    padding: 18,
    alignItems: 'center',
  },
  menyRadText: {
    fontSize: 16,
    color: '#1B2B4B',
    fontWeight: '600',
  },
  menyDivider: {
    height: 1,
    backgroundColor: '#DDE2EF',
  },

  modalContainer: {
    flex: 1,
    backgroundColor: '#F0F2F8',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 18,
    paddingTop: 56,
    borderBottomWidth: 1,
    borderBottomColor: '#DDE2EF',
    backgroundColor: '#FFFFFF',
  },
  modalAvbryt: {
    fontSize: 16,
    color: '#7A8AAA',
  },
  modalTitel: {
    fontSize: 16,
    fontWeight: '800',
    color: '#1B2B4B',
  },
  modalContent: {
    padding: 20,
    gap: 10,
  },
  modalInfo: {
    fontSize: 14,
    color: '#7A8AAA',
    lineHeight: 21,
    marginBottom: 8,
  },
  orsakRad: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#DDE2EF',
  },
  orsakRadVald: {
    borderColor: '#1C5E52',
    borderWidth: 2,
    backgroundColor: '#E8F4F0',
  },
  orsakText: {
    fontSize: 15,
    color: '#1B2B4B',
  },
  orsakTextVald: {
    fontWeight: '700',
    color: '#1C5E52',
  },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: '#DDE2EF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  radioVald: {
    borderColor: '#1C5E52',
  },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#1C5E52',
  },
  rapporteraBtn: {
    backgroundColor: '#1C5E52',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  rapporteraBtnDisabled: {
    backgroundColor: '#EEF1F8',
    borderWidth: 1,
    borderColor: '#DDE2EF',
  },
  rapporteraBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
  },

  tackBox: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    gap: 16,
  },
  tackEmoji: {
    fontSize: 56,
  },
  tackTitel: {
    fontSize: 24,
    fontWeight: '900',
    color: '#1B2B4B',
    textAlign: 'center',
  },
  tackText: {
    fontSize: 14,
    color: '#7A8AAA',
    textAlign: 'center',
    lineHeight: 22,
  },
  stangBtn: {
    backgroundColor: '#1C5E52',
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 32,
  },
  stangBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
});
