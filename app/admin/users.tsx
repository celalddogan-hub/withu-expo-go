import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import { supabase } from '../../src/lib/supabase';
import { isCurrentUserAdmin } from '../../src/lib/moderation';
import {
  WithUAvatar,
  WithUCard,
  WithUPage,
  WithUScreen,
  WithUTopBar,
} from '../../src/components/withu/WithUPrimitives';
import {
  withuColors,
  withuRadius,
  withuShadows,
  withuSpacing,
} from '../../src/theme/withuTheme';

type ProfileRow = {
  id: string;
  name: string | null;
  age: number | null;
  city: string | null;
  country: string | null;
  bio: string | null;
  activities: string[] | null;
  avatar_url: string | null;
  avatar_emoji: string | null;
  is_profile_complete: boolean | null;
  is_discoverable: boolean | null;
  is_bankid_verified: boolean | null;
  updated_at: string | null;
};

type AdminRow = {
  user_id: string | null;
};

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

function formatDate(value?: string | null) {
  if (!value) return 'Okänt';
  return new Date(value).toLocaleDateString('sv-SE', {
    day: 'numeric',
    month: 'short',
  });
}

function initialsFromName(name?: string | null) {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '🙂';
  return parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
}

export default function AdminUsersScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorText, setErrorText] = useState('');
  const [query, setQuery] = useState('');
  const [currentUserId, setCurrentUserId] = useState('');
  const [items, setItems] = useState<ProfileRow[]>([]);
  const [adminIds, setAdminIds] = useState<Set<string>>(new Set());

  const loadUsers = useCallback(async () => {
    try {
      setErrorText('');

      const adminAllowed = await isCurrentUserAdmin();
      if (!adminAllowed) {
        setItems([]);
        setErrorText('Du har inte adminåtkomst.');
        return;
      }

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError) throw userError;
      setCurrentUserId(user?.id ?? '');

      const [{ data: profileRows, error: profileError }, { data: admins, error: adminError }] =
        await Promise.all([
          supabase
            .from('profiles')
            .select(
              'id, name, age, city, country, bio, activities, avatar_url, avatar_emoji, is_profile_complete, is_discoverable, is_bankid_verified, updated_at'
            )
            .order('updated_at', { ascending: false })
            .limit(150),
          supabase.from('admins').select('user_id'),
        ]);

      if (profileError) throw profileError;
      if (adminError) throw adminError;

      setItems((profileRows ?? []) as ProfileRow[]);
      setAdminIds(new Set(((admins ?? []) as AdminRow[]).map((row) => row.user_id).filter(Boolean) as string[]));
    } catch (error: any) {
      setItems([]);
      setErrorText(error?.message || 'Kunde inte ladda användare.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      loadUsers();
    }, [loadUsers])
  );

  const filteredItems = useMemo(() => {
    const needle = normalize(query);
    if (!needle) return items;

    return items.filter((item) =>
      normalize(
        [item.name, item.city, item.country, item.bio, ...(item.activities ?? [])]
          .filter(Boolean)
          .join(' ')
      ).includes(needle)
    );
  }, [items, query]);

  const refresh = async () => {
    setRefreshing(true);
    await loadUsers();
  };

  if (loading) {
    return (
      <WithUScreen>
        <WithUTopBar title="Admin" subtitle="Användare" right={<WithUAvatar emoji="👥" size={34} />} />
        <View style={styles.centerState}>
          <ActivityIndicator size="large" color={withuColors.coral} />
          <Text style={styles.centerTitle}>Laddar användare...</Text>
        </View>
      </WithUScreen>
    );
  }

  return (
    <WithUScreen>
      <WithUTopBar title="Admin" subtitle="Användare" right={<WithUAvatar emoji="👥" size={34} />} />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
        showsVerticalScrollIndicator={false}
      >
        <WithUPage style={styles.page}>
          <View style={styles.heroBlock}>
            <Text style={styles.heroEyebrow}>SUPPORT & TRYGGHET</Text>
            <Text style={styles.heroTitle}>Användaröversikt</Text>
            <Text style={styles.heroSubtitle}>
              Här kan admin hitta profiler, se synlighet och öppna rätt supportväg utan att adminprofiler syns i Upptäck.
            </Text>
          </View>

          <View style={styles.navRow}>
            <Pressable style={styles.navChip} onPress={() => router.push('/admin')}>
              <Text style={styles.navChipText}>Admincenter</Text>
            </Pressable>
            <Pressable style={styles.navChip} onPress={() => router.push('/admin/reports')}>
              <Text style={styles.navChipText}>Rapporter</Text>
            </Pressable>
            <Pressable style={styles.navChip} onPress={() => router.push('/admin/stats')}>
              <Text style={styles.navChipText}>Statistik</Text>
            </Pressable>
          </View>

          <WithUCard style={styles.searchCard}>
            <Ionicons name="search-outline" size={20} color={withuColors.muted} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Sök namn, stad, aktivitet eller bio"
              placeholderTextColor="#8A97B8"
              style={styles.searchInput}
            />
          </WithUCard>

          {errorText ? (
            <WithUCard>
              <Text style={styles.errorTitle}>Kunde inte ladda</Text>
              <Text style={styles.errorText}>{errorText}</Text>
            </WithUCard>
          ) : (
            <View style={styles.userList}>
              {filteredItems.map((item) => {
                const isAdmin = adminIds.has(item.id);
                const canChat = currentUserId && item.id !== currentUserId;

                return (
                  <WithUCard key={item.id} style={[styles.userCard, isAdmin ? styles.adminCard : {}]}>
                    <View style={styles.userTopRow}>
                      <WithUAvatar
                        emoji={item.avatar_emoji || initialsFromName(item.name)}
                        imageUrl={item.avatar_url}
                        size={58}
                      />
                      <View style={styles.userInfo}>
                        <View style={styles.nameRow}>
                          <Text style={styles.userName}>
                            {item.name || 'Namnlös'}{item.age ? `, ${item.age}` : ''}
                          </Text>
                          {isAdmin ? <Text style={styles.adminBadge}>Admin</Text> : null}
                        </View>
                        <Text style={styles.userMeta}>
                          {item.city || 'Ingen stad'} · {item.is_profile_complete ? 'Profil klar' : 'Profil ej klar'}
                        </Text>
                      </View>
                    </View>

                    <Text numberOfLines={2} style={styles.bioText}>
                      {item.bio || 'Ingen bio skriven.'}
                    </Text>

                    <View style={styles.statusRow}>
                      <View style={[styles.statusChip, item.is_discoverable === false && styles.statusChipMuted]}>
                        <Text style={styles.statusChipText}>
                          {item.is_discoverable === false ? 'Dold från Upptäck' : 'Syns i Upptäck'}
                        </Text>
                      </View>
                      <View style={[styles.statusChip, item.is_bankid_verified && styles.statusChipGreen]}>
                        <Text style={styles.statusChipText}>
                          {item.is_bankid_verified ? 'Verifierad' : 'Ej verifierad'}
                        </Text>
                      </View>
                    </View>

                    <View style={styles.activitiesRow}>
                      {(item.activities ?? []).slice(0, 4).map((activity) => (
                        <Text key={`${item.id}-${activity}`} style={styles.activityChip}>
                          {activity}
                        </Text>
                      ))}
                    </View>

                    <View style={styles.actionRow}>
                      <Text style={styles.updatedText}>Uppdaterad {formatDate(item.updated_at)}</Text>
                      {canChat ? (
                        <Pressable
                          style={styles.chatButton}
                          onPress={() => router.push(`/chat/${makeConversationKey(currentUserId, item.id)}`)}
                        >
                          <Text style={styles.chatButtonText}>Öppna chatt</Text>
                        </Pressable>
                      ) : null}
                    </View>
                  </WithUCard>
                );
              })}

              {!filteredItems.length ? (
                <WithUCard>
                  <Text style={styles.emptyTitle}>Inga användare hittades</Text>
                  <Text style={styles.emptyText}>Testa en annan sökning eller dra ner för att uppdatera.</Text>
                </WithUCard>
              ) : null}
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
  },
  content: {
    paddingBottom: 36,
  },
  page: {
    paddingTop: withuSpacing.lg,
  },
  centerState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  centerTitle: {
    marginTop: 12,
    color: withuColors.navy,
    fontSize: 16,
    fontWeight: '900',
  },
  heroBlock: {
    marginBottom: 18,
  },
  heroEyebrow: {
    color: withuColors.teal,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1.4,
    marginBottom: 8,
  },
  heroTitle: {
    color: withuColors.navy,
    fontSize: 34,
    fontWeight: '900',
    marginBottom: 8,
  },
  heroSubtitle: {
    color: withuColors.muted,
    fontSize: 15,
    lineHeight: 24,
  },
  navRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 14,
  },
  navChip: {
    borderRadius: withuRadius.lg,
    borderWidth: 1,
    borderColor: '#D8E4FA',
    backgroundColor: '#EEF4FF',
    paddingHorizontal: 14,
    paddingVertical: 10,
    ...withuShadows.card,
  },
  navChipText: {
    color: withuColors.navy,
    fontSize: 13,
    fontWeight: '900',
  },
  searchCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 14,
  },
  searchInput: {
    flex: 1,
    color: withuColors.navy,
    fontSize: 15,
    fontWeight: '800',
    minHeight: 42,
  },
  userList: {
    gap: 14,
  },
  userCard: {
    marginBottom: 0,
  },
  adminCard: {
    borderColor: '#F1DEC2',
    backgroundColor: '#FFFDF8',
  },
  userTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  userInfo: {
    flex: 1,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  userName: {
    flex: 1,
    color: withuColors.navy,
    fontSize: 18,
    fontWeight: '900',
  },
  adminBadge: {
    overflow: 'hidden',
    borderRadius: 999,
    backgroundColor: '#FFF3D7',
    color: '#8A5A00',
    fontSize: 11,
    fontWeight: '900',
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  userMeta: {
    color: withuColors.muted,
    fontSize: 13,
    fontWeight: '700',
    marginTop: 3,
  },
  bioText: {
    color: '#34405A',
    fontSize: 14,
    lineHeight: 21,
    marginTop: 12,
  },
  statusRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
  },
  statusChip: {
    borderRadius: 999,
    backgroundColor: '#EAF5F1',
    borderWidth: 1,
    borderColor: '#B8DDD5',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  statusChipMuted: {
    backgroundColor: '#EEF1F6',
    borderColor: '#D8DFEA',
  },
  statusChipGreen: {
    backgroundColor: '#EAF5F1',
  },
  statusChipText: {
    color: withuColors.navy,
    fontSize: 12,
    fontWeight: '900',
  },
  activitiesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
    marginTop: 10,
  },
  activityChip: {
    overflow: 'hidden',
    borderRadius: 999,
    backgroundColor: '#F3F6FC',
    color: withuColors.navy,
    fontSize: 12,
    fontWeight: '800',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginTop: 14,
  },
  updatedText: {
    flex: 1,
    color: withuColors.muted,
    fontSize: 12,
    fontWeight: '700',
  },
  chatButton: {
    borderRadius: 999,
    backgroundColor: withuColors.teal,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  chatButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '900',
  },
  errorTitle: {
    color: '#B42318',
    fontSize: 18,
    fontWeight: '900',
    marginBottom: 6,
  },
  errorText: {
    color: withuColors.muted,
    fontSize: 14,
    lineHeight: 22,
  },
  emptyTitle: {
    color: withuColors.navy,
    fontSize: 18,
    fontWeight: '900',
    marginBottom: 6,
  },
  emptyText: {
    color: withuColors.muted,
    fontSize: 14,
    lineHeight: 22,
  },
});
