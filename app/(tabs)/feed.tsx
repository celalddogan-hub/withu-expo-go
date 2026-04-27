import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Linking,
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
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import { supabase } from '../../src/lib/supabase';
import { guardContentOrShowHelp } from '../../src/lib/crisisSafety';
import { WithUAvatar, WithUScreen, WithUTopBar } from '../../src/components/withu/WithUPrimitives';
import { ensureTrustAllowed } from '../../src/lib/trust';

type FeedType = 'all' | 'activity' | 'photo' | 'event' | 'question';
type ComposerType = Exclude<FeedType, 'all'>;
type Visibility = 'friends' | 'matches' | 'nearby';
type ReportReasonKey = 'harassment' | 'threat' | 'hate' | 'spam' | 'self_harm' | 'other';

type FeedPost = {
  id: string;
  user_id: string;
  type: ComposerType;
  content: string;
  area: string | null;
  activity_icon: string | null;
  activity_title: string | null;
  image_path: string | null;
  image_url?: string | null;
  like_count: number | null;
  comment_count: number | null;
  participant_count: number | null;
  created_at: string | null;
  profiles?: {
    name: string | null;
    city: string | null;
    avatar_url: string | null;
    avatar_emoji: string | null;
    is_bankid_verified: boolean | null;
  } | null;
  liked_by_me?: boolean;
  joined_by_me?: boolean;
};

const IMAGE_BUCKET = 'post-images';

const FILTERS: { key: FeedType; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'all', label: 'Vänner', icon: 'people-outline' },
  { key: 'activity', label: 'Aktiviteter', icon: 'cafe-outline' },
  { key: 'photo', label: 'Bilder', icon: 'images-outline' },
  { key: 'event', label: 'Träffar', icon: 'calendar-outline' },
  { key: 'question', label: 'Frågor', icon: 'help-circle-outline' },
];

const TYPE_META: Record<ComposerType, { label: string; icon: string; color: string; light: string }> = {
  activity: { label: 'Aktivitet', icon: '☕', color: '#E05C4B', light: '#FFF2F0' },
  photo: { label: 'Bild', icon: '📷', color: '#2F6FED', light: '#EEF4FF' },
  event: { label: 'Träff', icon: '📅', color: '#7A4FD1', light: '#F3EEFF' },
  question: { label: 'Fråga', icon: '?', color: '#1C5E52', light: '#EAF5F1' },
};

const VISIBILITY_OPTIONS: { key: Visibility; label: string; sub: string }[] = [
  { key: 'friends', label: 'Vänner', sub: 'Bara dina vänner' },
  { key: 'matches', label: 'Matcher', sub: 'Personer du matchat med' },
  { key: 'nearby', label: 'Nära', sub: 'Aktiva nära dig' },
];

const URL_PATTERN = /(https?:\/\/[^\s]+|www\.[^\s]+)/gi;

const REPORT_REASONS: { key: ReportReasonKey; title: string; body: string }[] = [
  { key: 'harassment', title: 'Mobbning eller trakasserier', body: 'Elakt, pressande eller kränkande innehåll.' },
  { key: 'threat', title: 'Hot eller våld', body: 'Hot, våld eller farlig press.' },
  { key: 'hate', title: 'Hat eller diskriminering', body: 'Hat mot grupp, religion, kön, ursprung eller liknande.' },
  { key: 'spam', title: 'Spam eller reklam', body: 'Bluff, reklam, skadliga länkar eller upprepade inlägg.' },
  { key: 'self_harm', title: 'Akut oro för person', body: 'Självskada, självmordstankar eller någon verkar vara i fara.' },
  { key: 'other', title: 'Annat', body: 'Något känns fel och behöver granskas.' },
];

function firstName(name?: string | null) {
  return name?.trim().split(' ')[0] || 'Medlem';
}

function formatWhen(value?: string | null) {
  if (!value) return 'nyss';
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60000));
  if (minutes < 1) return 'nyss';
  if (minutes < 60) return `${minutes} min sedan`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} tim sedan`;
  return `${Math.floor(hours / 24)} d sedan`;
}

function isMissingFeedTables(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? '');
  return message.includes('posts') || message.includes('does not exist') || message.includes('relation');
}

function normalizeUrl(url: string) {
  return url.toLowerCase().startsWith('http') ? url : `https://${url}`;
}

function firstUrl(text: string) {
  return text.match(URL_PATTERN)?.[0] ?? null;
}

function urlHost(url: string) {
  try {
    return new URL(normalizeUrl(url)).hostname.replace(/^www\./, '');
  } catch {
    return url.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
  }
}

function renderLinkedText(text: string) {
  const parts = text.split(URL_PATTERN);

  return parts.map((part, index) => {
    if (!part.match(URL_PATTERN)) return part;

    return (
      <Text
        key={`${part}-${index}`}
        style={styles.linkText}
        onPress={async () => {
          const url = normalizeUrl(part);
          const canOpen = await Linking.canOpenURL(url);
          if (canOpen) {
            await Linking.openURL(url);
          } else {
            Alert.alert('Kunde inte öppna länk', url);
          }
        }}
      >
        {part}
      </Text>
    );
  });
}

export default function FeedScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [setupRequired, setSetupRequired] = useState(false);
  const [errorText, setErrorText] = useState('');
  const [currentUserId, setCurrentUserId] = useState('');
  const [activeFilter, setActiveFilter] = useState<FeedType>('all');
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [composerOpen, setComposerOpen] = useState(false);
  const [composerType, setComposerType] = useState<ComposerType>('activity');
  const [composerText, setComposerText] = useState('');
  const [activityTitle, setActivityTitle] = useState('');
  const [visibility, setVisibility] = useState<Visibility>('friends');
  const [selectedImage, setSelectedImage] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [commentPost, setCommentPost] = useState<FeedPost | null>(null);
  const [commentText, setCommentText] = useState('');
  const [editingPost, setEditingPost] = useState<FeedPost | null>(null);
  const [editText, setEditText] = useState('');
  const [editActivityTitle, setEditActivityTitle] = useState('');
  const [reportPost, setReportPost] = useState<FeedPost | null>(null);
  const [reportReason, setReportReason] = useState<ReportReasonKey>('harassment');
  const [reportDetails, setReportDetails] = useState('');
  const [saving, setSaving] = useState(false);

  const filteredPosts = useMemo(
    () => posts.filter((post) => activeFilter === 'all' || post.type === activeFilter),
    [activeFilter, posts]
  );

  const loadFeed = useCallback(async () => {
    try {
      setErrorText('');
      setSetupRequired(false);

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError) throw userError;
      if (!user) return;

      setCurrentUserId(user.id);

      const { data, error } = await supabase
        .from('posts')
        .select(
          'id, user_id, type, content, area, activity_icon, activity_title, image_path, like_count, comment_count, participant_count, created_at, profiles:profiles!posts_user_id_fkey(name, city, avatar_url, avatar_emoji, is_bankid_verified)'
        )
        .eq('is_active', true)
        .eq('moderation_status', 'visible')
        .order('created_at', { ascending: false })
        .limit(60);

      if (error) throw error;

      const nextPosts = (data ?? []) as unknown as FeedPost[];
      const ids = nextPosts.map((post) => post.id);
      const postsWithImages = await Promise.all(
        nextPosts.map(async (post) => {
          if (!post.image_path) return { ...post, image_url: null };

          const { data: signedData } = await supabase.storage
            .from(IMAGE_BUCKET)
            .createSignedUrl(post.image_path, 60 * 60);

          if (signedData?.signedUrl) {
            return { ...post, image_url: signedData.signedUrl };
          }

          const { data: publicData } = supabase.storage.from(IMAGE_BUCKET).getPublicUrl(post.image_path);
          return { ...post, image_url: publicData.publicUrl || null };
        })
      );

      if (ids.length) {
        const [{ data: likes }, { data: participants }] = await Promise.all([
          supabase.from('post_likes').select('post_id').eq('user_id', user.id).in('post_id', ids),
          supabase.from('post_participants').select('post_id').eq('user_id', user.id).in('post_id', ids),
        ]);
        const likedIds = new Set((likes ?? []).map((row) => row.post_id as string));
        const joinedIds = new Set((participants ?? []).map((row) => row.post_id as string));

        setPosts(
          postsWithImages.map((post) => ({
            ...post,
            liked_by_me: likedIds.has(post.id),
            joined_by_me: joinedIds.has(post.id),
          }))
        );
      } else {
        setPosts([]);
      }
    } catch (error: any) {
      setPosts([]);
      if (isMissingFeedTables(error)) {
        setSetupRequired(true);
      } else {
        setErrorText(error?.message || 'Kunde inte ladda flödet.');
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      loadFeed();
    }, [loadFeed])
  );

  const refresh = async () => {
    setRefreshing(true);
    await loadFeed();
  };

  const resetComposer = () => {
    setComposerText('');
    setActivityTitle('');
    setComposerType('activity');
    setVisibility('friends');
    setSelectedImage(null);
    setComposerOpen(false);
  };

  const pickImage = async () => {
    const allowed = await ensureTrustAllowed('feed_post');
    if (!allowed) return;

    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Bildbehörighet behövs', 'Tillåt bilder för att kunna lägga upp ett foto.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.82,
      allowsEditing: true,
      aspect: [4, 3],
    });

    if (!result.canceled) {
      setSelectedImage(result.assets[0]);
      setComposerType('photo');
    }
  };

  const uploadSelectedImage = async () => {
    if (!selectedImage || !currentUserId) return null;

    const response = await fetch(selectedImage.uri);
    const blob = await response.blob();
    const extension = selectedImage.uri.split('.').pop()?.toLowerCase() || 'jpg';
    const path = `${currentUserId}/${Date.now()}.${extension}`;
    const { error } = await supabase.storage.from(IMAGE_BUCKET).upload(path, blob, {
      contentType: selectedImage.mimeType || 'image/jpeg',
      upsert: false,
    });

    if (error) throw error;
    return path;
  };

  const createPost = async () => {
    if (!currentUserId || saving) return;
    const allowed = await ensureTrustAllowed('feed_post');
    if (!allowed) return;

    const text = composerText.trim();

    if (text.length < 3 && !selectedImage) {
      Alert.alert('Skriv lite mer', 'Lägg till några ord eller en bild.');
      return;
    }

    const isSafe = await guardContentOrShowHelp({
      text: `${activityTitle} ${text}`,
      reporterId: currentUserId,
      router,
      surface: 'feed',
    });
    if (!isSafe) {
      return;
    }

    try {
      setSaving(true);
      const meta = TYPE_META[composerType];
      const imagePath = selectedImage ? await uploadSelectedImage() : null;
      const { error } = await supabase.from('posts').insert({
        user_id: currentUserId,
        type: composerType,
        content: text || activityTitle.trim() || 'Bild',
        activity_icon: meta.icon,
        activity_title: activityTitle.trim() || null,
        image_path: imagePath,
        image_status: imagePath ? 'approved' : 'none',
        area: visibility === 'nearby' ? 'Nära dig' : visibility === 'matches' ? 'Matcher' : 'Vänner',
      });

      if (error) throw error;
      resetComposer();
      await loadFeed();
    } catch (error: any) {
      if (isMissingFeedTables(error)) setSetupRequired(true);
      Alert.alert(
        'Kunde inte publicera',
        error?.message?.includes('Bucket not found')
          ? 'Skapa storage-bucketen post-images i Supabase, eller kör senaste SQL-paketet.'
          : error?.message || 'Något gick fel.'
      );
    } finally {
      setSaving(false);
    }
  };

  const updatePostState = (postId: string, patch: Partial<FeedPost>) => {
    setPosts((current) => current.map((post) => (post.id === postId ? { ...post, ...patch } : post)));
  };

  const openEditPost = (post: FeedPost) => {
    setEditingPost(post);
    setEditText(post.content || '');
    setEditActivityTitle(post.activity_title || '');
  };

  const submitEditPost = async () => {
    if (!editingPost || !currentUserId || saving) return;
    const text = editText.trim();
    const title = editActivityTitle.trim();

    if (text.length < 3 && !title) {
      Alert.alert('Skriv lite mer', 'Inlägget behöver text eller en aktivitetstitel.');
      return;
    }

    const isSafe = await guardContentOrShowHelp({
      text: `${title} ${text}`,
      reporterId: currentUserId,
      router,
      surface: 'feed',
    });
    if (!isSafe) return;

    try {
      setSaving(true);
      const { error } = await supabase
        .from('posts')
        .update({
          content: text || title,
          activity_title: title || null,
        })
        .eq('id', editingPost.id)
        .eq('user_id', currentUserId);

      if (error) throw error;

      updatePostState(editingPost.id, {
        content: text || title,
        activity_title: title || null,
      });
      setEditingPost(null);
      setEditText('');
      setEditActivityTitle('');
    } catch (error: any) {
      Alert.alert('Kunde inte uppdatera', error?.message || 'Försök igen.');
    } finally {
      setSaving(false);
    }
  };

  const deleteOwnPost = (post: FeedPost) => {
    if (!currentUserId || saving) return;

    Alert.alert('Ta bort inlägg?', 'Inlägget försvinner från flödet.', [
      { text: 'Avbryt', style: 'cancel' },
      {
        text: 'Ta bort',
        style: 'destructive',
        onPress: async () => {
          try {
            setSaving(true);
            const { error } = await supabase.rpc('delete_own_feed_post', {
              p_post_id: post.id,
            });

            if (error) throw error;
            setPosts((current) => current.filter((item) => item.id !== post.id));
          } catch (error: any) {
            Alert.alert('Kunde inte ta bort', error?.message || 'Försök igen.');
          } finally {
            setSaving(false);
          }
        },
      },
    ]);
  };

  const openReportPost = (post: FeedPost) => {
    setReportPost(post);
    setReportReason('harassment');
    setReportDetails('');
  };

  const submitPostReport = async () => {
    if (!reportPost || !currentUserId || saving) return;
    const reason = REPORT_REASONS.find((item) => item.key === reportReason) ?? REPORT_REASONS[0];

    try {
      setSaving(true);
      const { error } = await supabase.from('reports').insert({
        reporter_id: currentUserId,
        reported_user_id: reportPost.user_id,
        reported_profile_id: reportPost.user_id,
        target_user_id: reportPost.user_id,
        source: 'feed_post',
        reason: reason.title,
        details: [
          `Post-id: ${reportPost.id}`,
          `Typ: ${reportPost.type}`,
          `Text: ${reportPost.content}`,
          reportDetails.trim() ? `Kommentar: ${reportDetails.trim()}` : null,
        ]
          .filter(Boolean)
          .join('\n'),
        status: 'open',
      });

      if (error) throw error;

      setReportPost(null);
      setReportDetails('');
      Alert.alert('Rapport skickad', 'Tack. Admin granskar inlägget och tar bort det om det bryter mot tryggheten.');
    } catch (error: any) {
      Alert.alert('Kunde inte rapportera', error?.message || 'Försök igen om en stund.');
    } finally {
      setSaving(false);
    }
  };

  const toggleLike = async (post: FeedPost) => {
    if (!currentUserId) return;
    const allowed = await ensureTrustAllowed('feed_interact');
    if (!allowed) return;

    const liked = !!post.liked_by_me;
    updatePostState(post.id, {
      liked_by_me: !liked,
      like_count: Math.max(0, (post.like_count ?? 0) + (liked ? -1 : 1)),
    });

    const result = liked
      ? await supabase.from('post_likes').delete().eq('post_id', post.id).eq('user_id', currentUserId)
      : await supabase.from('post_likes').insert({ post_id: post.id, user_id: currentUserId });

    if (result.error) {
      updatePostState(post.id, { liked_by_me: liked, like_count: post.like_count });
      Alert.alert('Kunde inte gilla', result.error.message);
    }
  };

  const toggleJoin = async (post: FeedPost) => {
    if (!currentUserId) return;
    const allowed = await ensureTrustAllowed('feed_interact');
    if (!allowed) return;

    const joined = !!post.joined_by_me;
    updatePostState(post.id, {
      joined_by_me: !joined,
      participant_count: Math.max(0, (post.participant_count ?? 0) + (joined ? -1 : 1)),
    });

    const result = joined
      ? await supabase.from('post_participants').delete().eq('post_id', post.id).eq('user_id', currentUserId)
      : await supabase.from('post_participants').insert({ post_id: post.id, user_id: currentUserId });

    if (result.error) {
      updatePostState(post.id, { joined_by_me: joined, participant_count: post.participant_count });
      Alert.alert('Kunde inte gå med', result.error.message);
    }
  };

  const submitComment = async () => {
    if (!commentPost || !currentUserId || saving) return;
    const allowed = await ensureTrustAllowed('feed_interact');
    if (!allowed) return;

    const text = commentText.trim();
    if (!text) return;

    const isSafe = await guardContentOrShowHelp({
      text,
      reporterId: currentUserId,
      router,
      surface: 'feed_comment',
      targetUserId: commentPost.user_id,
    });
    if (!isSafe) {
      return;
    }

    try {
      setSaving(true);
      const { error } = await supabase.from('post_comments').insert({
        post_id: commentPost.id,
        user_id: currentUserId,
        content: text,
      });
      if (error) throw error;
      updatePostState(commentPost.id, { comment_count: (commentPost.comment_count ?? 0) + 1 });
      setCommentText('');
      setCommentPost(null);
    } catch (error: any) {
      Alert.alert('Kunde inte kommentera', error?.message || 'Försök igen.');
    } finally {
      setSaving(false);
    }
  };

  const openProfile = (userId: string) => {
    router.push(`/user/${userId}`);
  };

  const renderPost = ({ item }: { item: FeedPost }) => {
    const meta = TYPE_META[item.type] || TYPE_META.activity;
    const imageUrl = item.image_url;
    const linkUrl = firstUrl(item.content);
    const isOwnPost = item.user_id === currentUserId;

    return (
      <View style={styles.postCard}>
        <Pressable style={styles.postHeader} onPress={() => openProfile(item.user_id)}>
          <WithUAvatar emoji={item.profiles?.avatar_emoji || meta.icon} imageUrl={item.profiles?.avatar_url} size={48} />
          <View style={styles.postHeaderText}>
            <Text style={styles.postName}>
              {firstName(item.profiles?.name)}
              {item.profiles?.is_bankid_verified ? '  ✓' : ''}
            </Text>
            <Text style={styles.postMeta}>
              {item.area || item.profiles?.city || 'WithU'} · {formatWhen(item.created_at)}
            </Text>
          </View>
          <View style={[styles.typeBadge, { backgroundColor: meta.light }]}>
            <Text style={[styles.typeBadgeText, { color: meta.color }]}>
              {meta.icon} {meta.label}
            </Text>
          </View>
        </Pressable>

        {imageUrl ? <Image source={{ uri: imageUrl }} style={styles.postImage} /> : null}

        <Text style={styles.postText}>{renderLinkedText(item.content)}</Text>

        {linkUrl ? (
          <Pressable
            style={styles.linkCard}
            onPress={() => Linking.openURL(normalizeUrl(linkUrl)).catch(() => Alert.alert('Kunde inte öppna länk'))}
          >
            <View style={styles.linkIcon}>
              <Ionicons name="link-outline" size={22} color="#1C5E52" />
            </View>
            <View style={styles.linkInfo}>
              <Text style={styles.linkTitle} numberOfLines={1}>
                {urlHost(linkUrl)}
              </Text>
              <Text style={styles.linkSub} numberOfLines={1}>
                Tryck för att öppna länken
              </Text>
            </View>
            <Ionicons name="open-outline" size={20} color="#7A8399" />
          </Pressable>
        ) : null}

        {item.activity_title ? (
          <Pressable style={[styles.activityBox, { borderColor: meta.color }]} onPress={() => toggleJoin(item)}>
            <Text style={styles.activityIcon}>{item.activity_icon || meta.icon}</Text>
            <View style={styles.activityInfo}>
              <Text style={styles.activityTitle}>{item.activity_title}</Text>
              <Text style={styles.activitySub}>
                {item.joined_by_me ? 'Du är med · planera i chatten' : 'Tryck för att hänga med'}
              </Text>
            </View>
            <Ionicons name={item.joined_by_me ? 'checkmark-circle' : 'add-circle-outline'} size={26} color={meta.color} />
          </Pressable>
        ) : null}

        {isOwnPost ? (
          <View style={styles.ownerActions}>
            <Pressable style={styles.ownerActionButton} onPress={() => openEditPost(item)} disabled={saving}>
              <Ionicons name="create-outline" size={17} color="#1C5E52" />
              <Text style={styles.ownerActionText}>Redigera</Text>
            </Pressable>
            <Pressable style={[styles.ownerActionButton, styles.ownerDeleteButton]} onPress={() => deleteOwnPost(item)} disabled={saving}>
              <Ionicons name="trash-outline" size={17} color="#B42318" />
              <Text style={[styles.ownerActionText, styles.ownerDeleteText]}>Ta bort</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.ownerActions}>
            <Pressable style={styles.reportButton} onPress={() => openReportPost(item)} disabled={saving}>
              <Ionicons name="flag-outline" size={17} color="#B42318" />
              <Text style={styles.reportButtonText}>Rapportera</Text>
            </Pressable>
          </View>
        )}

        <View style={styles.postFooter}>
          <Pressable style={[styles.footerButton, item.liked_by_me && styles.footerButtonActive]} onPress={() => toggleLike(item)}>
            <Ionicons name={item.liked_by_me ? 'heart' : 'heart-outline'} size={22} color={item.liked_by_me ? '#E05C4B' : '#5C6780'} />
            <Text style={[styles.footerText, item.liked_by_me && styles.footerTextActive]}>Gilla {item.like_count ?? 0}</Text>
          </Pressable>
          <Pressable style={styles.footerButton} onPress={() => setCommentPost(item)}>
            <Ionicons name="chatbubble-ellipses-outline" size={21} color="#5C6780" />
            <Text style={styles.footerText}>Svara {item.comment_count ?? 0}</Text>
          </Pressable>
          <Pressable style={[styles.footerButton, item.joined_by_me && styles.footerJoinActive]} onPress={() => toggleJoin(item)}>
            <Ionicons name={item.joined_by_me ? 'hand-left' : 'hand-left-outline'} size={21} color={item.joined_by_me ? '#1C5E52' : '#5C6780'} />
            <Text style={[styles.footerText, item.joined_by_me && styles.footerJoinText]}>Jag med {item.participant_count ?? 0}</Text>
          </Pressable>
          <Pressable style={[styles.footerButton, styles.profileFooterButton]} onPress={() => openProfile(item.user_id)}>
            <Ionicons name="person-circle-outline" size={22} color="#5C6780" />
          </Pressable>
        </View>
      </View>
    );
  };

  if (loading) {
    return (
      <WithUScreen>
        <WithUTopBar title="Flödet" subtitle="Vänner, bilder och aktiviteter." />
        <View style={styles.centerState}>
          <ActivityIndicator size="large" color="#1C5E52" />
          <Text style={styles.centerTitle}>Laddar flödet...</Text>
        </View>
      </WithUScreen>
    );
  }

  return (
    <WithUScreen>
      <WithUTopBar title="Flödet" subtitle="Bara dina vänner, matcher och trygga träffar." />
      <FlatList
        data={filteredPosts}
        keyExtractor={(item) => item.id}
        style={styles.list}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <View>
            <View style={styles.hero}>
              <Text style={styles.heroBadge}>VÄNNER & MATCHER</Text>
              <Text style={styles.heroTitle}>Dela något som leder till kontakt</Text>
              <Text style={styles.heroText}>
                Bilder, aktiviteter, frågor och träffar visas för dina trygga kontakter.
              </Text>
            </View>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.nowRail}>
              <Pressable style={[styles.nowCard, styles.nowCardPrimary]} onPress={async () => {
                if (await ensureTrustAllowed('feed_post')) setComposerOpen(true);
              }}>
                <Text style={styles.nowEmoji}>＋</Text>
                <Text style={[styles.nowTitle, styles.nowTitleLight]}>Lägg upp</Text>
                <Text style={[styles.nowSub, styles.nowSubLight]}>bild eller aktivitet</Text>
              </Pressable>
              <Pressable style={styles.nowCard} onPress={() => setActiveFilter('activity')}>
                <Text style={styles.nowEmoji}>☕</Text>
                <Text style={styles.nowTitle}>Aktiviteter</Text>
                <Text style={styles.nowSub}>se vem som vill ses</Text>
              </Pressable>
              <Pressable style={styles.nowCard} onPress={() => router.push('/explore')}>
                <Text style={styles.nowEmoji}>🌿</Text>
                <Text style={styles.nowTitle}>Tankar</Text>
                <Text style={styles.nowSub}>trygga ord</Text>
              </Pressable>
              <Pressable style={styles.nowCard} onPress={() => setActiveFilter('photo')}>
                <Text style={styles.nowEmoji}>📷</Text>
                <Text style={styles.nowTitle}>Bilder</Text>
                <Text style={styles.nowSub}>från vänner</Text>
              </Pressable>
            </ScrollView>

            <Pressable style={styles.composerCard} onPress={async () => {
              if (await ensureTrustAllowed('feed_post')) setComposerOpen(true);
            }}>
              <WithUAvatar emoji="🙂" size={44} />
              <View style={styles.composerTextWrap}>
                <Text style={styles.composerTitle}>Lägg upp för dina vänner</Text>
                <Text style={styles.composerSub}>Bild, aktivitet, fråga eller träff</Text>
              </View>
              <View style={styles.composerPlus}>
                <Ionicons name="add" size={26} color="#FFFFFF" />
              </View>
            </Pressable>

            <Pressable style={styles.thoughtsShortcut} onPress={() => router.push('/explore')}>
              <View style={styles.thoughtsIcon}>
                <Ionicons name="leaf" size={22} color="#1C5E52" />
              </View>
              <View style={styles.thoughtsTextWrap}>
                <Text style={styles.thoughtsTitle}>Tankar</Text>
                <Text style={styles.thoughtsSub}>Skriv anonymt eller läs trygga tankar</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#7A8499" />
            </Pressable>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
              {FILTERS.map((filter) => {
                const selected = activeFilter === filter.key;
                return (
                  <Pressable
                    key={filter.key}
                    style={[styles.filterChip, selected && styles.filterChipActive]}
                    onPress={() => setActiveFilter(filter.key)}
                  >
                    <Ionicons name={filter.icon} size={17} color={selected ? '#FFFFFF' : '#0F1E38'} />
                    <Text style={[styles.filterText, selected && styles.filterTextActive]}>
                      {filter.label}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            {setupRequired ? (
              <View style={styles.setupCard}>
                <Text style={styles.setupTitle}>Flödet behöver Supabase</Text>
                <Text style={styles.setupText}>Kör senaste SQL-paketet innan användare publicerar.</Text>
              </View>
            ) : null}

            {errorText ? (
              <View style={styles.setupCard}>
                <Text style={styles.setupTitle}>Kunde inte ladda flödet</Text>
                <Text style={styles.setupText}>{errorText}</Text>
              </View>
            ) : null}
          </View>
        }
        ListEmptyComponent={
          !setupRequired && !errorText ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyTitle}>Inget i flödet ännu</Text>
              <Text style={styles.emptyText}>Lägg upp en bild eller aktivitet så känns appen mer levande.</Text>
            </View>
          ) : null
        }
        renderItem={renderPost}
      />

      <Modal visible={composerOpen} animationType="slide" onRequestClose={resetComposer}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 24}
          style={styles.fullComposer}
        >
          <View style={styles.composerHeader}>
            <Pressable onPress={resetComposer} style={styles.headerIconButton}>
              <Ionicons name="close" size={24} color="#0F1E38" />
            </Pressable>
            <Text style={styles.modalTitle}>Skapa inlägg</Text>
            <Pressable style={[styles.headerPublish, saving && styles.publishButtonDisabled]} onPress={createPost} disabled={saving}>
              <Text style={styles.headerPublishText}>{saving ? '...' : 'Publicera'}</Text>
            </Pressable>
          </View>
          <ScrollView
            contentContainerStyle={styles.fullComposerContent}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.typeRow}>
              {(Object.keys(TYPE_META) as ComposerType[]).map((type) => {
                const selected = composerType === type;
                const meta = TYPE_META[type];
                return (
                  <Pressable
                    key={type}
                    style={[
                      styles.typeChoice,
                      selected && { backgroundColor: meta.light, borderColor: meta.color },
                    ]}
                    onPress={() => setComposerType(type)}
                  >
                    <Text style={[styles.typeChoiceText, selected && { color: meta.color }]}>
                      {meta.icon} {meta.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <Text style={styles.fieldLabel}>Synlighet</Text>
            <View style={styles.visibilityGrid}>
              {VISIBILITY_OPTIONS.map((option) => {
                const selected = visibility === option.key;
                return (
                  <Pressable
                    key={option.key}
                    style={[styles.visibilityOption, selected && styles.visibilityOptionActive]}
                    onPress={() => setVisibility(option.key)}
                  >
                    <Text style={[styles.visibilityLabel, selected && styles.visibilityLabelActive]}>{option.label}</Text>
                    <Text style={[styles.visibilitySub, selected && styles.visibilitySubActive]}>{option.sub}</Text>
                  </Pressable>
                );
              })}
            </View>

            {(composerType === 'activity' || composerType === 'event') && (
              <TextInput
                value={activityTitle}
                onChangeText={setActivityTitle}
                placeholder="Titel, t.ex. Fika i centrum"
                placeholderTextColor="#8B95AA"
                style={styles.titleInput}
                maxLength={80}
                returnKeyType="next"
              />
            )}

            {selectedImage ? (
              <View style={styles.previewWrap}>
                <Image source={{ uri: selectedImage.uri }} style={styles.previewImage} />
                <Pressable style={styles.removeImageButton} onPress={() => setSelectedImage(null)}>
                  <Ionicons name="close" size={18} color="#FFFFFF" />
                </Pressable>
              </View>
            ) : null}

            <TextInput
              value={composerText}
              onChangeText={setComposerText}
              placeholder="Skriv text, länkar eller vad du vill göra..."
              placeholderTextColor="#8B95AA"
              style={styles.composerInput}
              multiline
              maxLength={500}
            />
            <Text style={styles.composerHint}>{500 - composerText.length} tecken kvar</Text>

            <View style={styles.toolRow}>
              <Pressable style={styles.toolButton} onPress={pickImage}>
                <Ionicons name="image-outline" size={22} color="#1C5E52" />
                <Text style={styles.toolText}>Bild</Text>
              </Pressable>
              <Pressable style={styles.toolButton} onPress={() => setComposerType('activity')}>
                <Ionicons name="cafe-outline" size={22} color="#1C5E52" />
                <Text style={styles.toolText}>Aktivitet</Text>
              </Pressable>
              <Pressable style={styles.toolButton} onPress={() => setComposerType('event')}>
                <Ionicons name="calendar-outline" size={22} color="#1C5E52" />
                <Text style={styles.toolText}>Träff</Text>
              </Pressable>
              <Pressable
                style={styles.toolButton}
                onPress={() => setComposerText((current) => (current.trim() ? current : 'https://'))}
              >
                <Ionicons name="link-outline" size={22} color="#1C5E52" />
                <Text style={styles.toolText}>Länk</Text>
              </Pressable>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={!!commentPost} transparent animationType="fade" onRequestClose={() => setCommentPost(null)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.commentBackdrop}>
          <Pressable style={styles.commentShade} onPress={() => setCommentPost(null)} />
          <View style={styles.commentSheet}>
            <Text style={styles.commentTitle}>Kommentera</Text>
            <TextInput
              value={commentText}
              onChangeText={setCommentText}
              placeholder="Skriv en trygg kommentar..."
              placeholderTextColor="#8B95AA"
              style={styles.commentInput}
              multiline
              autoFocus
            />
            <View style={styles.modalActions}>
              <Pressable style={styles.cancelButton} onPress={() => setCommentPost(null)} disabled={saving}>
                <Text style={styles.cancelText}>Avbryt</Text>
              </Pressable>
              <Pressable style={[styles.publishButton, saving && styles.publishButtonDisabled]} onPress={submitComment} disabled={saving}>
                <Text style={styles.publishText}>Skicka</Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={!!reportPost} transparent animationType="fade" onRequestClose={() => setReportPost(null)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.commentBackdrop}>
          <Pressable style={styles.commentShade} onPress={() => setReportPost(null)} />
          <View style={styles.commentSheet}>
            <Text style={styles.commentTitle}>Rapportera inlägg</Text>
            <Text style={styles.reportIntro}>Välj varför du vill rapportera. Admin ser rapporten och kan agera.</Text>

            <View style={styles.reportReasonList}>
              {REPORT_REASONS.map((reason) => {
                const selected = reportReason === reason.key;
                return (
                  <Pressable
                    key={reason.key}
                    style={[styles.reportReasonOption, selected && styles.reportReasonOptionActive]}
                    onPress={() => setReportReason(reason.key)}
                  >
                    <View style={styles.reportReasonTextWrap}>
                      <Text style={[styles.reportReasonTitle, selected && styles.reportReasonTitleActive]}>
                        {reason.title}
                      </Text>
                      <Text style={styles.reportReasonBody}>{reason.body}</Text>
                    </View>
                    <Ionicons
                      name={selected ? 'checkmark-circle' : 'ellipse-outline'}
                      size={22}
                      color={selected ? '#1C5E52' : '#9AA4B8'}
                    />
                  </Pressable>
                );
              })}
            </View>

            <TextInput
              value={reportDetails}
              onChangeText={setReportDetails}
              placeholder="Skriv mer om du vill..."
              placeholderTextColor="#8B95AA"
              style={styles.commentInput}
              multiline
            />

            <View style={styles.modalActions}>
              <Pressable style={styles.cancelButton} onPress={() => setReportPost(null)} disabled={saving}>
                <Text style={styles.cancelText}>Avbryt</Text>
              </Pressable>
              <Pressable style={[styles.reportSubmitButton, saving && styles.publishButtonDisabled]} onPress={submitPostReport} disabled={saving}>
                <Text style={styles.publishText}>Skicka rapport</Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={!!editingPost} animationType="slide" onRequestClose={() => setEditingPost(null)}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 24}
          style={styles.fullComposer}
        >
          <View style={styles.composerHeader}>
            <Pressable onPress={() => setEditingPost(null)} style={styles.headerIconButton}>
              <Ionicons name="close" size={24} color="#0F1E38" />
            </Pressable>
            <Text style={styles.modalTitle}>Redigera inlägg</Text>
            <Pressable style={[styles.headerPublish, saving && styles.publishButtonDisabled]} onPress={submitEditPost} disabled={saving}>
              <Text style={styles.headerPublishText}>{saving ? '...' : 'Spara'}</Text>
            </Pressable>
          </View>

          <ScrollView
            contentContainerStyle={styles.fullComposerContent}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
            showsVerticalScrollIndicator={false}
          >
            {(editingPost?.type === 'activity' || editingPost?.type === 'event') && (
              <TextInput
                value={editActivityTitle}
                onChangeText={setEditActivityTitle}
                placeholder="Titel"
                placeholderTextColor="#8B95AA"
                style={styles.titleInput}
                maxLength={80}
              />
            )}

            <TextInput
              value={editText}
              onChangeText={setEditText}
              placeholder="Skriv text..."
              placeholderTextColor="#8B95AA"
              style={styles.composerInput}
              multiline
              maxLength={500}
              autoFocus
            />
            <Text style={styles.composerHint}>{500 - editText.length} tecken kvar</Text>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
    </WithUScreen>
  );
}

const styles = StyleSheet.create({
  list: { flex: 1, backgroundColor: '#F8F7F4' },
  content: { padding: 16, paddingBottom: 36 },
  hero: { backgroundColor: '#0F1E38', borderRadius: 24, padding: 18, marginBottom: 12 },
  heroBadge: { color: '#7ED3C4', fontSize: 11, fontWeight: '900', letterSpacing: 1, marginBottom: 8 },
  heroTitle: { color: '#FFFFFF', fontSize: 27, lineHeight: 33, fontWeight: '900', marginBottom: 8 },
  heroText: { color: 'rgba(255,255,255,0.78)', fontSize: 14, lineHeight: 22 },
  nowRail: { gap: 10, paddingBottom: 12 },
  nowCard: {
    width: 132,
    minHeight: 104,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#ECEEF4',
    padding: 14,
    justifyContent: 'space-between',
  },
  nowCardPrimary: { backgroundColor: '#0F1E38', borderColor: '#0F1E38' },
  nowEmoji: { fontSize: 27, marginBottom: 8 },
  nowTitle: { color: '#0F1E38', fontSize: 15, fontWeight: '900' },
  nowSub: { color: '#7A8399', fontSize: 11, fontWeight: '700', marginTop: 3 },
  nowTitleLight: { color: '#FFFFFF' },
  nowSubLight: { color: 'rgba(255,255,255,0.72)' },
  composerCard: {
    minHeight: 76,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#ECEEF4',
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  composerTextWrap: { flex: 1, marginLeft: 12 },
  composerTitle: { color: '#0F1E38', fontSize: 16, fontWeight: '900' },
  composerSub: { color: '#7A8399', fontSize: 12, fontWeight: '700', marginTop: 3 },
  composerPlus: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#E05C4B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  thoughtsShortcut: {
    minHeight: 70,
    backgroundColor: '#EAF5F1',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#B8DDD5',
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  thoughtsIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  thoughtsTextWrap: { flex: 1 },
  thoughtsTitle: { color: '#0F1E38', fontSize: 16, fontWeight: '900' },
  thoughtsSub: { color: '#1C5E52', fontSize: 12, fontWeight: '700', marginTop: 3 },
  filterRow: { gap: 8, paddingBottom: 12 },
  filterChip: {
    borderRadius: 999,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#DDE2EF',
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  filterChipActive: { backgroundColor: '#1C5E52', borderColor: '#1C5E52' },
  filterText: { color: '#0F1E38', fontSize: 13, fontWeight: '900' },
  filterTextActive: { color: '#FFFFFF' },
  postCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#ECEEF4',
    padding: 14,
    marginBottom: 12,
  },
  postHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  postHeaderText: { flex: 1, minWidth: 0, marginLeft: 10 },
  postName: { color: '#0F1E38', fontSize: 16, fontWeight: '900' },
  postMeta: { color: '#7A8399', fontSize: 12, fontWeight: '700', marginTop: 2 },
  typeBadge: { borderRadius: 999, paddingHorizontal: 9, paddingVertical: 5 },
  typeBadgeText: { fontSize: 10, fontWeight: '900' },
  postImage: { width: '100%', height: 220, borderRadius: 18, marginBottom: 12, backgroundColor: '#EEF1F6' },
  postText: { color: '#334155', fontSize: 16, lineHeight: 24, marginBottom: 12 },
  linkText: { color: '#1C5E52', fontWeight: '900', textDecorationLine: 'underline' },
  linkCard: {
    minHeight: 68,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#B8DDD5',
    backgroundColor: '#EAF5F1',
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  linkIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  linkInfo: { flex: 1, minWidth: 0 },
  linkTitle: { color: '#0F1E38', fontSize: 14, fontWeight: '900' },
  linkSub: { color: '#1C5E52', fontSize: 11, fontWeight: '700', marginTop: 2 },
  activityBox: {
    borderRadius: 16,
    borderWidth: 1.5,
    backgroundColor: '#F8FAFC',
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  activityIcon: { fontSize: 24, marginRight: 10 },
  activityInfo: { flex: 1 },
  activityTitle: { color: '#0F1E38', fontSize: 14, fontWeight: '900' },
  activitySub: { color: '#7A8399', fontSize: 11, fontWeight: '700', marginTop: 3 },
  ownerActions: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  ownerActionButton: {
    minHeight: 38,
    borderRadius: 999,
    backgroundColor: '#EAF5F1',
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  ownerActionText: { color: '#1C5E52', fontSize: 12, fontWeight: '900' },
  ownerDeleteButton: { backgroundColor: '#FEF3F2' },
  ownerDeleteText: { color: '#B42318' },
  reportButton: {
    minHeight: 38,
    borderRadius: 999,
    backgroundColor: '#FEF3F2',
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  reportButtonText: { color: '#B42318', fontSize: 12, fontWeight: '900' },
  postFooter: { flexDirection: 'row', gap: 8, borderTopWidth: 1, borderTopColor: '#EEF1F6', paddingTop: 10 },
  footerButton: {
    minHeight: 38,
    borderRadius: 999,
    paddingHorizontal: 10,
    backgroundColor: '#F8FAFC',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  footerButtonActive: { backgroundColor: '#FFF2F0' },
  footerJoinActive: { backgroundColor: '#EAF5F1' },
  profileFooterButton: { width: 42, justifyContent: 'center', paddingHorizontal: 0 },
  footerText: { color: '#5C6780', fontSize: 13, fontWeight: '900' },
  footerTextActive: { color: '#E05C4B' },
  footerJoinText: { color: '#1C5E52' },
  setupCard: { backgroundColor: '#FFF8E8', borderRadius: 18, borderWidth: 1, borderColor: '#EAD9AB', padding: 16, marginBottom: 12 },
  setupTitle: { color: '#0F1E38', fontSize: 17, fontWeight: '900', marginBottom: 6 },
  setupText: { color: '#5C6780', fontSize: 13, lineHeight: 20 },
  emptyCard: { backgroundColor: '#FFFFFF', borderRadius: 20, borderWidth: 1, borderColor: '#ECEEF4', padding: 18, alignItems: 'center' },
  emptyTitle: { color: '#0F1E38', fontSize: 22, fontWeight: '900', marginBottom: 8, textAlign: 'center' },
  emptyText: { color: '#5C6780', fontSize: 14, lineHeight: 22, textAlign: 'center' },
  centerState: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: '#F8F7F4' },
  centerTitle: { marginTop: 12, color: '#0F1E38', fontSize: 20, fontWeight: '900' },
  fullComposer: { flex: 1, backgroundColor: '#FFFFFF' },
  composerHeader: {
    paddingTop: Platform.OS === 'ios' ? 54 : 22,
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#EEF1F6',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  headerIconButton: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#F8FAFC', alignItems: 'center', justifyContent: 'center' },
  modalTitle: { flex: 1, color: '#0F1E38', fontSize: 21, fontWeight: '900' },
  headerPublish: { borderRadius: 999, backgroundColor: '#1C5E52', paddingHorizontal: 14, paddingVertical: 10 },
  headerPublishText: { color: '#FFFFFF', fontSize: 13, fontWeight: '900' },
  fullComposerContent: { padding: 16, paddingBottom: 180 },
  typeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  typeChoice: { borderRadius: 999, borderWidth: 1.5, borderColor: '#DDE2EF', paddingHorizontal: 12, paddingVertical: 9 },
  typeChoiceText: { color: '#0F1E38', fontSize: 13, fontWeight: '900' },
  fieldLabel: { color: '#0F1E38', fontSize: 13, fontWeight: '900', marginBottom: 8 },
  visibilityGrid: { gap: 8, marginBottom: 16 },
  visibilityOption: { borderRadius: 16, borderWidth: 1.5, borderColor: '#DDE2EF', padding: 12 },
  visibilityOptionActive: { borderColor: '#1C5E52', backgroundColor: '#EAF5F1' },
  visibilityLabel: { color: '#0F1E38', fontSize: 14, fontWeight: '900' },
  visibilityLabelActive: { color: '#1C5E52' },
  visibilitySub: { color: '#7A8399', fontSize: 12, fontWeight: '700', marginTop: 2 },
  visibilitySubActive: { color: '#1C5E52' },
  previewWrap: { marginBottom: 12 },
  previewImage: { width: '100%', height: 220, borderRadius: 18, backgroundColor: '#EEF1F6' },
  removeImageButton: { position: 'absolute', top: 10, right: 10, width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(15,30,56,0.78)', alignItems: 'center', justifyContent: 'center' },
  composerInput: {
    minHeight: 180,
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: '#DDE2EF',
    backgroundColor: '#F8FAFC',
    color: '#0F1E38',
    padding: 14,
    textAlignVertical: 'top',
    fontSize: 16,
    lineHeight: 24,
    fontWeight: '700',
    marginBottom: 6,
  },
  composerHint: { color: '#7A8399', fontSize: 11, fontWeight: '800', textAlign: 'right', marginBottom: 12 },
  titleInput: {
    minHeight: 52,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#DDE2EF',
    backgroundColor: '#F8FAFC',
    color: '#0F1E38',
    paddingHorizontal: 14,
    fontSize: 15,
    fontWeight: '800',
    marginBottom: 12,
  },
  toolRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 4 },
  toolButton: {
    flexBasis: '47%',
    flexGrow: 1,
    minHeight: 52,
    borderRadius: 16,
    backgroundColor: '#EAF5F1',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  toolText: { color: '#1C5E52', fontSize: 12, fontWeight: '900' },
  commentBackdrop: { flex: 1, justifyContent: 'flex-end' },
  commentShade: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(15,30,56,0.5)' },
  commentSheet: { backgroundColor: '#FFFFFF', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 16, paddingBottom: Platform.OS === 'ios' ? 28 : 16 },
  commentTitle: { color: '#0F1E38', fontSize: 22, fontWeight: '900', marginBottom: 10 },
  reportIntro: { color: '#5C6780', fontSize: 13, lineHeight: 20, fontWeight: '700', marginBottom: 12 },
  reportReasonList: { gap: 8, marginBottom: 12 },
  reportReasonOption: {
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#DDE2EF',
    backgroundColor: '#F8FAFC',
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  reportReasonOptionActive: { borderColor: '#1C5E52', backgroundColor: '#EAF5F1' },
  reportReasonTextWrap: { flex: 1 },
  reportReasonTitle: { color: '#0F1E38', fontSize: 14, fontWeight: '900' },
  reportReasonTitleActive: { color: '#1C5E52' },
  reportReasonBody: { color: '#7A8399', fontSize: 12, lineHeight: 18, fontWeight: '700', marginTop: 3 },
  commentInput: {
    minHeight: 96,
    maxHeight: 170,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#DDE2EF',
    backgroundColor: '#F8FAFC',
    color: '#0F1E38',
    padding: 12,
    textAlignVertical: 'top',
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 12,
  },
  modalActions: { flexDirection: 'row', gap: 10 },
  cancelButton: { flex: 1, minHeight: 50, borderRadius: 16, borderWidth: 1.5, borderColor: '#DDE2EF', alignItems: 'center', justifyContent: 'center' },
  cancelText: { color: '#0F1E38', fontSize: 14, fontWeight: '900' },
  publishButton: { flex: 1.2, minHeight: 50, borderRadius: 16, backgroundColor: '#1C5E52', alignItems: 'center', justifyContent: 'center' },
  reportSubmitButton: { flex: 1.2, minHeight: 50, borderRadius: 16, backgroundColor: '#B42318', alignItems: 'center', justifyContent: 'center' },
  publishButtonDisabled: { opacity: 0.6 },
  publishText: { color: '#FFFFFF', fontSize: 14, fontWeight: '900' },
});
