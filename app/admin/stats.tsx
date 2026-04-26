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

type PlatformStats = {
  total_users: number;
  completed_profiles: number;
  active_24h: number;
  active_7d: number;
  total_matches: number;
  accepted_matches: number;
  total_messages: number;
  total_posts: number;
  total_thoughts: number;
  open_reports: number;
  crisis_reports: number;
  total_blocks: number;
  active_volunteers: number;
  pending_volunteer_applications: number;
  volunteer_contact_requests: number;
};

type StatCard = {
  label: string;
  value: number;
  sub: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
};

const EMPTY_STATS: PlatformStats = {
  total_users: 0,
  completed_profiles: 0,
  active_24h: 0,
  active_7d: 0,
  total_matches: 0,
  accepted_matches: 0,
  total_messages: 0,
  total_posts: 0,
  total_thoughts: 0,
  open_reports: 0,
  crisis_reports: 0,
  total_blocks: 0,
  active_volunteers: 0,
  pending_volunteer_applications: 0,
  volunteer_contact_requests: 0,
};

function formatNumber(value: number) {
  return new Intl.NumberFormat('sv-SE').format(value || 0);
}

function percent(value: number, total: number) {
  if (!total) return 0;
  return Math.round((value / total) * 100);
}

export default function AdminStatsScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorText, setErrorText] = useState('');
  const [stats, setStats] = useState<PlatformStats>(EMPTY_STATS);

  const loadStats = useCallback(async () => {
    try {
      setErrorText('');

      const adminAllowed = await isCurrentUserAdmin();
      if (!adminAllowed) {
        setErrorText('Du har inte adminåtkomst.');
        setStats(EMPTY_STATS);
        return;
      }

      const { data, error } = await supabase.rpc('get_admin_platform_stats');
      if (error) throw error;

      const row = Array.isArray(data) ? data[0] : data;
      setStats({ ...EMPTY_STATS, ...(row as Partial<PlatformStats>) });
    } catch (error: any) {
      setStats(EMPTY_STATS);
      setErrorText(error?.message || 'Kunde inte ladda statistik.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      loadStats();
    }, [loadStats])
  );

  const cards = useMemo<StatCard[]>(
    () => [
      {
        label: 'Användare',
        value: stats.total_users,
        sub: `${percent(stats.completed_profiles, stats.total_users)}% kompletta profiler`,
        icon: 'people-outline',
        color: withuColors.navy,
      },
      {
        label: 'Aktiva 7 dagar',
        value: stats.active_7d,
        sub: `${stats.active_24h} aktiva senaste 24h`,
        icon: 'pulse-outline',
        color: withuColors.success,
      },
      {
        label: 'Matchningar',
        value: stats.accepted_matches,
        sub: `${stats.total_matches} totala förfrågningar`,
        icon: 'heart-outline',
        color: withuColors.coral,
      },
      {
        label: 'Meddelanden',
        value: stats.total_messages,
        sub: 'Chattar mellan användare',
        icon: 'chatbubbles-outline',
        color: '#2F6FED',
      },
      {
        label: 'Flöde',
        value: stats.total_posts,
        sub: `${stats.total_thoughts} tankar publicerade`,
        icon: 'newspaper-outline',
        color: withuColors.teal,
      },
      {
        label: 'Öppna rapporter',
        value: stats.open_reports,
        sub: `${stats.crisis_reports} kris-/hotflaggor totalt`,
        icon: 'shield-checkmark-outline',
        color: '#B42318',
      },
      {
        label: 'Blockeringar',
        value: stats.total_blocks,
        sub: 'Trygghetsåtgärder från användare',
        icon: 'ban-outline',
        color: '#7A4FD1',
      },
      {
        label: 'Volontärer',
        value: stats.active_volunteers,
        sub: `${stats.pending_volunteer_applications} ansökningar väntar`,
        icon: 'hand-left-outline',
        color: '#D4A843',
      },
    ],
    [stats]
  );

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadStats();
  };

  if (loading) {
    return (
      <WithUScreen>
        <WithUTopBar title="Admin" subtitle="Statistik" right={<WithUAvatar emoji="📊" size={34} />} />
        <View style={styles.centerState}>
          <ActivityIndicator size="large" color={withuColors.coral} />
          <Text style={styles.centerTitle}>Laddar statistik...</Text>
        </View>
      </WithUScreen>
    );
  }

  return (
    <WithUScreen>
      <WithUTopBar title="Admin" subtitle="Statistik" right={<WithUAvatar emoji="📊" size={34} />} />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
        showsVerticalScrollIndicator={false}
      >
        <WithUPage style={styles.page}>
          <View style={styles.heroBlock}>
            <Text style={styles.heroEyebrow}>KOMMUN & ADMIN</Text>
            <Text style={styles.heroTitle}>Statistikdashboard</Text>
            <Text style={styles.heroSubtitle}>
              Samlade, anonymiserade siffror för trygghet, aktivitet och volontärarbete.
            </Text>
          </View>

          <View style={styles.navRow}>
            <Pressable style={styles.navChip} onPress={() => router.push('/admin')}>
              <Text style={styles.navChipText}>Admincenter</Text>
            </Pressable>
            <Pressable style={styles.navChip} onPress={() => router.push('/admin/reports')}>
              <Text style={styles.navChipText}>Rapporter</Text>
            </Pressable>
            <Pressable style={styles.navChip} onPress={() => router.push('/admin/volunteers')}>
              <Text style={styles.navChipText}>Volontärer</Text>
            </Pressable>
          </View>

          {errorText ? (
            <WithUCard>
              <Text style={styles.errorTitle}>Kunde inte ladda statistik</Text>
              <Text style={styles.errorText}>{errorText}</Text>
            </WithUCard>
          ) : (
            <>
              <View style={styles.cardGrid}>
                {cards.map((card) => (
                  <View key={card.label} style={styles.statCard}>
                    <View style={[styles.iconWrap, { backgroundColor: `${card.color}18` }]}>
                      <Ionicons name={card.icon} size={22} color={card.color} />
                    </View>
                    <Text style={styles.statValue}>{formatNumber(card.value)}</Text>
                    <Text style={styles.statLabel}>{card.label}</Text>
                    <Text style={styles.statSub}>{card.sub}</Text>
                  </View>
                ))}
              </View>

              <WithUCard style={styles.summaryCard}>
                <Text style={styles.summaryTitle}>Volontärflöde</Text>
                <Text style={styles.summaryText}>
                  {formatNumber(stats.volunteer_contact_requests)} stöd-/kontaktförfrågningar har skapats.
                </Text>
              </WithUCard>
            </>
          )}
        </WithUPage>
      </ScrollView>
    </WithUScreen>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: withuColors.cream },
  content: { paddingBottom: 36 },
  page: { paddingTop: withuSpacing.lg },
  centerState: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  centerTitle: { marginTop: 12, color: withuColors.navy, fontSize: 20, fontWeight: '900' },
  heroBlock: { marginBottom: 18 },
  heroEyebrow: {
    color: withuColors.teal,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1,
    marginBottom: 8,
  },
  heroTitle: { fontSize: 34, fontWeight: '900', color: withuColors.navy, marginBottom: 8 },
  heroSubtitle: { fontSize: 15, lineHeight: 24, color: withuColors.muted },
  navRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  navChip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: '#EEF4FF',
    borderWidth: 1,
    borderColor: '#D8E4FA',
  },
  navChipText: { color: withuColors.navy, fontSize: 13, fontWeight: '900' },
  cardGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  statCard: {
    width: '48%',
    minHeight: 152,
    backgroundColor: withuColors.white,
    borderRadius: withuRadius.lg,
    borderWidth: 1,
    borderColor: '#ECEEF4',
    padding: 14,
    ...withuShadows.card,
  },
  iconWrap: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  statValue: { color: withuColors.navy, fontSize: 30, fontWeight: '900', marginBottom: 4 },
  statLabel: { color: withuColors.navy, fontSize: 14, fontWeight: '900', marginBottom: 4 },
  statSub: { color: withuColors.muted, fontSize: 11, lineHeight: 16, fontWeight: '700' },
  summaryCard: { marginTop: 14 },
  summaryTitle: { color: withuColors.navy, fontSize: 18, fontWeight: '900', marginBottom: 6 },
  summaryText: { color: withuColors.muted, fontSize: 14, lineHeight: 22 },
  errorTitle: { color: withuColors.navy, fontSize: 20, fontWeight: '900', marginBottom: 8 },
  errorText: { color: withuColors.muted, fontSize: 14, lineHeight: 22 },
});
