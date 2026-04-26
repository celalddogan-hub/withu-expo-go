import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
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
import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import { supabase } from '../../src/lib/supabase';
import { checkContentSafety, getContentSafetyAlert } from '../../src/lib/contentSafety';
import { WithUAvatar, WithUScreen, WithUTopBar } from '../../src/components/withu/WithUPrimitives';

type FeedType = 'all' | 'activity' | 'thought' | 'event' | 'question';
type ComposerType = Exclude<FeedType, 'all'>;

type FeedPost = {
  id: string;
  user_id: string;
  type: ComposerType;
  content: string;
  area: string | null;
  activity_icon: string | null;
  activity_title: string | null;
  like_count: number | null;
  comment_count: number | null;
  participant_count: number | null;
  created_at: string | null;
  profiles?: {
    name: string | null;
    city: string | null;
    avatar_emoji: string | null;
    is_bankid_verified: boolean | null;
  } | null;
  liked_by_me?: boolean;
  joined_by_me?: boolean;
};

const FILTERS: { key: FeedType; label: string }[] = [
  { key: 'all', label: 'Alla' },
  { key: 'activity', label: 'Aktiviteter' },
  { key: 'thought', label: 'Tankar' },
  { key: 'event', label: 'Träffar' },
  { key: 'question', label: 'Frågor' },
];

const TYPE_META: Record<ComposerType, { label: string; icon: string; color: string; light: string }> = {
  activity: { label: 'Aktivitet', icon: '☕', color: '#E05C4B', light: '#FFF2F0' },
  thought: { label: 'Tanke', icon: '🌿', color: '#1C5E52', light: '#EAF5F1' },
  event: { label: 'Träff', icon: '📅', color: '#2F6FED', light: '#EEF4FF' },
  question: { label: 'Fråga', icon: '❓', color: '#7A4FD1', light: '#F3EEFF' },
};

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

const URL_PATTERN = /(https?:\/\/[^\s]+|www\.[^\s]+)/gi;

function normalizeUrl(url: string) {
  return url.toLowerCase().startsWith('http') ? url : `https://${url}`;
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
          'id, user_id, type, content, area, activity_icon, activity_title, like_count, comment_count, participant_count, created_at, profiles:profiles!posts_user_id_fkey(name, city, avatar_emoji, is_bankid_verified)'
        )
        .eq('is_active', true)
        .eq('moderation_status', 'visible')
        .order('created_at', { ascending: false })
        .limit(60);

      if (error) throw error;
      setPosts((data ?? []) as unknown as FeedPost[]);
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
    setComposerOpen(false);
  };

  const createPost = async () => {
    if (!currentUserId || saving) return;
    const text = composerText.trim();

    if (text.length < 3) {
      Alert.alert('Skriv lite mer', 'Flödet behöver minst några ord.');
      return;
    }

    const safety = checkContentSafety(text);
    if (!safety.allowed) {
      const alert = getContentSafetyAlert(safety);
      Alert.alert(alert.title, alert.body);
      return;
    }

    try {
      setSaving(true);
      const meta = TYPE_META[composerType];
      const { error } = await supabase.from('posts').insert({
        user_id: currentUserId,
        type: composerType,
        content: text,
        activity_icon: meta.icon,
        activity_title: activityTitle.trim() || null,
      });

      if (error) throw error;
      resetComposer();
      await loadFeed();
    } catch (error: any) {
      if (isMissingFeedTables(error)) setSetupRequired(true);
      Alert.alert('Kunde inte publicera', error?.message || 'Något gick fel.');
    } finally {
      setSaving(false);
    }
  };

  const renderPost = ({ item }: { item: FeedPost }) => {
    const meta = TYPE_META[item.type];
    return (
      <View style={styles.postCard}>
        <View style={styles.postHeader}>
          <WithUAvatar emoji={item.profiles?.avatar_emoji || meta.icon} size={48} />
          <View style={styles.postHeaderText}>
            <Text style={styles.postName}>{firstName(item.profiles?.name)}</Text>
            <Text style={styles.postMeta}>
              {item.area || item.profiles?.city || 'WithU'} · {formatWhen(item.created_at)}
            </Text>
          </View>
          <View style={[styles.typeBadge, { backgroundColor: meta.light }]}>
            <Text style={[styles.typeBadgeText, { color: meta.color }]}>
              {meta.icon} {meta.label}
            </Text>
          </View>
        </View>

        <Text style={styles.postText}>{renderLinkedText(item.content)}</Text>

        {item.activity_title ? (
          <View style={[styles.activityBox, { borderColor: meta.color }]}>
            <Text style={styles.activityIcon}>{item.activity_icon || meta.icon}</Text>
            <View style={styles.activityInfo}>
              <Text style={styles.activityTitle}>{item.activity_title}</Text>
              <Text style={styles.activitySub}>Planera detaljer i chatten</Text>
            </View>
          </View>
        ) : null}

        <View style={styles.postFooter}>
          <Text style={styles.footerText}>💙 {item.like_count ?? 0}</Text>
          <Text style={styles.footerText}>💬 {item.comment_count ?? 0}</Text>
          <Text style={styles.footerText}>🤝 {item.participant_count ?? 0}</Text>
        </View>
      </View>
    );
  };

  if (loading) {
    return (
      <WithUScreen>
        <WithUTopBar title="Flödet" subtitle="Aktiviteter, tankar och frågor." />
        <View style={styles.centerState}>
          <ActivityIndicator size="large" color="#1C5E52" />
          <Text style={styles.centerTitle}>Laddar flödet...</Text>
        </View>
      </WithUScreen>
    );
  }

  return (
    <WithUScreen>
      <WithUTopBar title="Flödet" subtitle="Vad händer nära dig?" />
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
              <Text style={styles.heroBadge}>WITHU FLÖDE</Text>
              <Text style={styles.heroTitle}>Gör något tillsammans</Text>
              <Text style={styles.heroText}>
                Lägg upp en aktivitet, tanke eller fråga. Trygghet först, enkelt alltid.
              </Text>
              <Pressable style={styles.thoughtsButton} onPress={() => router.push('/explore')}>
                <Text style={styles.thoughtsButtonEmoji}>✨</Text>
                <Text style={styles.thoughtsButtonText}>Öppna Tankar</Text>
              </Pressable>
            </View>

            <Pressable style={styles.composerCard} onPress={() => setComposerOpen(true)}>
              <WithUAvatar emoji="🙂" size={44} />
              <View style={styles.composerTextWrap}>
                <Text style={styles.composerTitle}>Vad vill du göra idag?</Text>
                <Text style={styles.composerSub}>Skriv en aktivitet, tanke eller fråga</Text>
              </View>
              <Text style={styles.composerPlus}>＋</Text>
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
                <Text style={styles.setupText}>Kör SQL-filen för flödet innan användare publicerar.</Text>
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
              <Text style={styles.emptyText}>Bli först med att lägga upp en trygg aktivitet.</Text>
            </View>
          ) : null
        }
        renderItem={renderPost}
      />

      <Modal visible={composerOpen} transparent animationType="slide" onRequestClose={resetComposer}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 10 : 0}
          style={styles.modalKeyboardWrap}
        >
          <Pressable style={styles.modalBackdrop} onPress={resetComposer}>
            <Pressable style={styles.modalSheet} onPress={() => undefined}>
              <View style={styles.modalHandle} />
              <ScrollView
                contentContainerStyle={styles.modalScrollContent}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
              >
                <Text style={styles.modalTitle}>Skapa inlägg</Text>
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
                <TextInput
                  value={composerText}
                  onChangeText={setComposerText}
                  placeholder="Skriv lugnt och tydligt..."
                  placeholderTextColor="#8B95AA"
                  style={styles.composerInput}
                  multiline
                  maxLength={500}
                />
                <Text style={styles.composerHint}>{500 - composerText.length} tecken kvar</Text>
                <View style={styles.modalActions}>
                  <Pressable style={styles.cancelButton} onPress={resetComposer} disabled={saving}>
                    <Text style={styles.cancelText}>Avbryt</Text>
                  </Pressable>
                  <Pressable style={[styles.publishButton, saving && styles.publishButtonDisabled]} onPress={createPost} disabled={saving}>
                    <Text style={styles.publishText}>{saving ? 'Publicerar...' : 'Publicera'}</Text>
                  </Pressable>
                </View>
              </ScrollView>
            </Pressable>
          </Pressable>
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
  thoughtsButton: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    borderRadius: 999,
    paddingHorizontal: 13,
    paddingVertical: 9,
    marginTop: 14,
  },
  thoughtsButtonEmoji: { fontSize: 15 },
  thoughtsButtonText: { color: '#FFFFFF', fontSize: 13, fontWeight: '900' },
  composerCard: {
    minHeight: 74,
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
  composerTitle: { color: '#0F1E38', fontSize: 15, fontWeight: '900' },
  composerSub: { color: '#7A8399', fontSize: 12, fontWeight: '700', marginTop: 3 },
  composerPlus: { color: '#E05C4B', fontSize: 28, fontWeight: '900' },
  filterRow: { gap: 8, paddingBottom: 12 },
  filterChip: {
    borderRadius: 999,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#DDE2EF',
    paddingHorizontal: 15,
    paddingVertical: 10,
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
  postName: { color: '#0F1E38', fontSize: 15, fontWeight: '900' },
  postMeta: { color: '#7A8399', fontSize: 12, fontWeight: '700', marginTop: 2 },
  typeBadge: { borderRadius: 999, paddingHorizontal: 9, paddingVertical: 5 },
  typeBadgeText: { fontSize: 10, fontWeight: '900' },
  postText: { color: '#334155', fontSize: 15, lineHeight: 23, marginBottom: 12 },
  linkText: { color: '#1C5E52', fontWeight: '900', textDecorationLine: 'underline' },
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
  postFooter: { flexDirection: 'row', gap: 8, borderTopWidth: 1, borderTopColor: '#EEF1F6', paddingTop: 10 },
  footerText: { color: '#5C6780', fontSize: 13, fontWeight: '900' },
  setupCard: { backgroundColor: '#FFF8E8', borderRadius: 18, borderWidth: 1, borderColor: '#EAD9AB', padding: 16, marginBottom: 12 },
  setupTitle: { color: '#0F1E38', fontSize: 17, fontWeight: '900', marginBottom: 6 },
  setupText: { color: '#5C6780', fontSize: 13, lineHeight: 20 },
  emptyCard: { backgroundColor: '#FFFFFF', borderRadius: 20, borderWidth: 1, borderColor: '#ECEEF4', padding: 18, alignItems: 'center' },
  emptyTitle: { color: '#0F1E38', fontSize: 22, fontWeight: '900', marginBottom: 8, textAlign: 'center' },
  emptyText: { color: '#5C6780', fontSize: 14, lineHeight: 22, textAlign: 'center' },
  centerState: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: '#F8F7F4' },
  centerTitle: { marginTop: 12, color: '#0F1E38', fontSize: 20, fontWeight: '900' },
  modalKeyboardWrap: { flex: 1, justifyContent: 'flex-end' },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(15,30,56,0.48)', justifyContent: 'flex-end' },
  modalSheet: {
    maxHeight: '88%',
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 18,
    paddingTop: 12,
    paddingBottom: Platform.OS === 'ios' ? 22 : 16,
  },
  modalScrollContent: { paddingBottom: 8 },
  modalHandle: { width: 42, height: 5, borderRadius: 999, backgroundColor: '#DDE2EF', alignSelf: 'center', marginBottom: 14 },
  modalTitle: { color: '#0F1E38', fontSize: 22, fontWeight: '900', marginBottom: 12 },
  typeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  typeChoice: { borderRadius: 999, borderWidth: 1.5, borderColor: '#DDE2EF', paddingHorizontal: 12, paddingVertical: 9 },
  typeChoiceText: { color: '#0F1E38', fontSize: 13, fontWeight: '900' },
  composerInput: {
    minHeight: 138,
    maxHeight: 240,
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: '#DDE2EF',
    backgroundColor: '#F8FAFC',
    color: '#0F1E38',
    padding: 14,
    textAlignVertical: 'top',
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '700',
    marginBottom: 6,
  },
  composerHint: { color: '#7A8399', fontSize: 11, fontWeight: '800', textAlign: 'right', marginBottom: 12 },
  titleInput: {
    minHeight: 48,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#DDE2EF',
    backgroundColor: '#F8FAFC',
    color: '#0F1E38',
    paddingHorizontal: 14,
    fontSize: 14,
    fontWeight: '800',
    marginBottom: 10,
  },
  modalActions: { flexDirection: 'row', gap: 10, paddingBottom: 2 },
  cancelButton: { flex: 1, minHeight: 50, borderRadius: 16, borderWidth: 1.5, borderColor: '#DDE2EF', alignItems: 'center', justifyContent: 'center' },
  cancelText: { color: '#0F1E38', fontSize: 14, fontWeight: '900' },
  publishButton: { flex: 1.2, minHeight: 50, borderRadius: 16, backgroundColor: '#1C5E52', alignItems: 'center', justifyContent: 'center' },
  publishButtonDisabled: { opacity: 0.6 },
  publishText: { color: '#FFFFFF', fontSize: 14, fontWeight: '900' },
});
