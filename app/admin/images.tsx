import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../src/lib/supabase';
import { isCurrentUserAdmin } from '../../src/lib/moderation';
import {
  WithUCard,
  WithUPage,
  WithUScreen,
  WithUTopBar,
} from '../../src/components/withu/WithUPrimitives';
import { withuColors, withuRadius } from '../../src/theme/withuTheme';

const IMAGE_BUCKET = 'post-images';
const MAX_POST_IMAGES = 4;

type ImageStatus = 'pending' | 'approved' | 'rejected' | 'none' | string;

type PendingPost = {
  id: string;
  user_id: string;
  content: string;
  activity_title: string | null;
  image_path: string | null;
  image_paths?: string[] | null;
  image_status: ImageStatus | null;
  created_at: string | null;
  profiles?: {
    name: string | null;
    city: string | null;
  } | null;
  image_urls?: string[];
};

function formatDate(value?: string | null) {
  if (!value) return 'Okant datum';

  return new Date(value).toLocaleString('sv-SE', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getImagePaths(post: PendingPost) {
  const paths = Array.isArray(post.image_paths) ? post.image_paths.filter(Boolean) : [];
  if (paths.length) return paths.slice(0, MAX_POST_IMAGES);
  return post.image_path ? [post.image_path] : [];
}

export default function AdminImagesScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [savingId, setSavingId] = useState('');
  const [errorText, setErrorText] = useState('');
  const [items, setItems] = useState<PendingPost[]>([]);

  const loadData = useCallback(async () => {
    try {
      setErrorText('');

      const adminAllowed = await isCurrentUserAdmin();
      if (!adminAllowed) {
        setItems([]);
        setErrorText('Du har inte adminatkomst.');
        return;
      }

      const { data, error } = await supabase
        .from('posts')
        .select(
          'id, user_id, content, activity_title, image_path, image_paths, image_status, created_at, profiles:profiles!posts_user_id_fkey(name, city)'
        )
        .eq('image_status', 'pending')
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;

      const rows = (data ?? []) as unknown as PendingPost[];
      const withUrls = await Promise.all(
        rows.map(async (post) => {
          const urls = await Promise.all(
            getImagePaths(post).map(async (path) => {
              const { data: signedData } = await supabase.storage
                .from(IMAGE_BUCKET)
                .createSignedUrl(path, 60 * 10);

              if (signedData?.signedUrl) return signedData.signedUrl;

              const { data: publicData } = supabase.storage.from(IMAGE_BUCKET).getPublicUrl(path);
              return publicData.publicUrl || null;
            })
          );

          return { ...post, image_urls: urls.filter(Boolean) as string[] };
        })
      );

      setItems(withUrls);
    } catch (error: any) {
      setItems([]);
      setErrorText(error?.message || 'Kunde inte ladda bilder.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      loadData();
    }, [loadData])
  );

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadData();
  };

  const setImageStatus = async (post: PendingPost, status: 'approved' | 'rejected') => {
    try {
      setSavingId(post.id);
      const { error } = await supabase.rpc('set_post_image_status', {
        p_post_id: post.id,
        p_status: status,
      });

      if (error) throw error;

      setItems((current) => current.filter((item) => item.id !== post.id));
    } catch (error: any) {
      Alert.alert('Kunde inte uppdatera bild', error?.message || 'Forsok igen.');
    } finally {
      setSavingId('');
    }
  };

  if (loading) {
    return (
      <WithUScreen>
        <WithUTopBar title="Admin" subtitle="Bildgranskning" />
        <View style={styles.centerState}>
          <ActivityIndicator size="large" color={withuColors.teal} />
          <Text style={styles.centerTitle}>Laddar bilder...</Text>
        </View>
      </WithUScreen>
    );
  }

  return (
    <WithUScreen>
      <WithUTopBar title="Admin" subtitle="Bildgranskning" />

      <WithUPage style={styles.page}>
        <View style={styles.navRow}>
          <Pressable style={styles.navChip} onPress={() => router.push('/admin')}>
            <Ionicons name="shield-checkmark-outline" size={17} color={withuColors.navy} />
            <Text style={styles.navChipText}>Admincenter</Text>
          </Pressable>
          <Pressable style={styles.navChip} onPress={() => router.push('/admin/reports')}>
            <Ionicons name="flag-outline" size={17} color={withuColors.navy} />
            <Text style={styles.navChipText}>Rapporter</Text>
          </Pressable>
        </View>

        <View style={styles.heroBlock}>
          <Text style={styles.heroTitle}>Bilder som vantar</Text>
          <Text style={styles.heroSubtitle}>
            Nya bilder i flodet syns inte for andra forran admin har godkant dem.
          </Text>
        </View>

        {errorText ? (
          <WithUCard style={styles.warningCard}>
            <Text style={styles.warningTitle}>Kunde inte oppna</Text>
            <Text style={styles.warningText}>{errorText}</Text>
          </WithUCard>
        ) : null}

        <ScrollView
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
          contentContainerStyle={styles.list}
        >
          {!errorText && items.length === 0 ? (
            <WithUCard style={styles.emptyCard}>
              <Ionicons name="checkmark-circle-outline" size={42} color={withuColors.teal} />
              <Text style={styles.emptyTitle}>Inga bilder vantar</Text>
              <Text style={styles.emptyText}>Allt ser rent ut just nu.</Text>
            </WithUCard>
          ) : null}

          {items.map((item) => {
            const busy = savingId === item.id;
            const urls = item.image_urls ?? [];

            return (
              <WithUCard key={item.id} style={styles.card}>
                <View style={styles.cardHeader}>
                  <View style={styles.cardHeaderText}>
                    <Text style={styles.name}>{item.profiles?.name || 'Medlem'}</Text>
                    <Text style={styles.meta}>
                      {item.profiles?.city || 'WithU'} · {formatDate(item.created_at)}
                    </Text>
                  </View>
                  <View style={styles.statusPill}>
                    <Text style={styles.statusText}>Vantar</Text>
                  </View>
                </View>

                {item.activity_title ? <Text style={styles.activityTitle}>{item.activity_title}</Text> : null}
                <Text style={styles.content}>{item.content}</Text>

                {urls.length ? (
                  <View style={[styles.imageGrid, urls.length === 1 && styles.imageGridSingle]}>
                    {urls.map((url, index) => (
                      <Image
                        key={`${item.id}-${index}`}
                        source={{ uri: url }}
                        style={[
                          styles.image,
                          urls.length === 1 && styles.imageSingle,
                          urls.length === 3 && index === 0 && styles.imageWide,
                        ]}
                      />
                    ))}
                  </View>
                ) : (
                  <View style={styles.noImageBox}>
                    <Text style={styles.noImageText}>Bilden kunde inte laddas.</Text>
                  </View>
                )}

                <View style={styles.actionRow}>
                  <Pressable
                    style={[styles.actionButton, styles.rejectButton]}
                    onPress={() => setImageStatus(item, 'rejected')}
                    disabled={busy}
                  >
                    <Ionicons name="close-circle-outline" size={19} color="#B42318" />
                    <Text style={styles.rejectText}>{busy ? 'Sparar...' : 'Avvisa'}</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.actionButton, styles.approveButton]}
                    onPress={() => setImageStatus(item, 'approved')}
                    disabled={busy}
                  >
                    <Ionicons name="checkmark-circle-outline" size={19} color="#FFFFFF" />
                    <Text style={styles.approveText}>{busy ? 'Sparar...' : 'Godkann'}</Text>
                  </Pressable>
                </View>
              </WithUCard>
            );
          })}
        </ScrollView>
      </WithUPage>
    </WithUScreen>
  );
}

const styles = StyleSheet.create({
  page: { paddingTop: 16, paddingBottom: 40 },
  centerState: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  centerTitle: { marginTop: 12, color: withuColors.navy, fontSize: 20, fontWeight: '900' },
  navRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  navChip: {
    minHeight: 42,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#D8E4FA',
    backgroundColor: '#EEF4FF',
    paddingHorizontal: 13,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  navChipText: { color: withuColors.navy, fontSize: 12, fontWeight: '900' },
  heroBlock: { marginBottom: 16 },
  heroTitle: { color: withuColors.navy, fontSize: 32, fontWeight: '900', marginBottom: 7 },
  heroSubtitle: { color: withuColors.muted, fontSize: 14, lineHeight: 22, fontWeight: '700' },
  warningCard: { backgroundColor: '#FFF7E8', borderColor: '#F1DEC2', marginBottom: 14 },
  warningTitle: { color: withuColors.navy, fontSize: 17, fontWeight: '900', marginBottom: 5 },
  warningText: { color: withuColors.muted, fontSize: 13, lineHeight: 20, fontWeight: '700' },
  list: { paddingBottom: 24 },
  emptyCard: { alignItems: 'center', padding: 22 },
  emptyTitle: { color: withuColors.navy, fontSize: 20, fontWeight: '900', marginTop: 8 },
  emptyText: { color: withuColors.muted, fontSize: 13, fontWeight: '700', marginTop: 4 },
  card: { marginBottom: 14 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  cardHeaderText: { flex: 1, minWidth: 0 },
  name: { color: withuColors.navy, fontSize: 17, fontWeight: '900' },
  meta: { color: withuColors.muted, fontSize: 12, fontWeight: '700', marginTop: 2 },
  statusPill: { borderRadius: 999, backgroundColor: '#FFF7E8', paddingHorizontal: 10, paddingVertical: 5 },
  statusText: { color: '#A16207', fontSize: 11, fontWeight: '900' },
  activityTitle: { color: '#1C5E52', fontSize: 14, fontWeight: '900', marginBottom: 8 },
  content: { color: '#334155', fontSize: 14, lineHeight: 21, fontWeight: '700', marginBottom: 12 },
  imageGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginBottom: 14 },
  imageGridSingle: { gap: 0 },
  image: { width: '49.3%', height: 156, borderRadius: withuRadius.md, backgroundColor: '#EEF1F6' },
  imageSingle: { width: '100%', height: 260, borderRadius: withuRadius.lg },
  imageWide: { width: '100%', height: 210 },
  noImageBox: {
    minHeight: 80,
    borderRadius: withuRadius.md,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#DDE2EF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  noImageText: { color: withuColors.muted, fontSize: 13, fontWeight: '800' },
  actionRow: { flexDirection: 'row', gap: 10 },
  actionButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: withuRadius.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  rejectButton: { backgroundColor: '#FEF3F2', borderWidth: 1, borderColor: '#F2C8C8' },
  approveButton: { backgroundColor: '#1C5E52' },
  rejectText: { color: '#B42318', fontSize: 14, fontWeight: '900' },
  approveText: { color: '#FFFFFF', fontSize: 14, fontWeight: '900' },
});
