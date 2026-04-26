import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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
import { isCurrentUserAdmin } from '../../src/lib/moderation';
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

type ReportStatus = 'open' | 'in_progress' | 'resolved' | 'dismissed' | string;

type ReportRow = {
  id: string;
  reporter_id?: string | null;
  reported_user_id?: string | null;
  reported_profile_id?: string | null;
  target_user_id?: string | null;
  source?: string | null;
  reason?: string | null;
  details?: string | null;
  conversation_id?: string | null;
  admin_note?: string | null;
  status?: ReportStatus | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type ProfileRow = {
  id: string;
  name: string | null;
  city: string | null;
  age: number | null;
};

type ReportCard = ReportRow & {
  reporterProfile: ProfileRow | null;
  reportedProfile: ProfileRow | null;
};

function formatDate(value?: string | null) {
  if (!value) return 'Okänt datum';

  const date = new Date(value);

  return date.toLocaleString('sv-SE', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getNormalizedStatus(status?: string | null): 'open' | 'in_progress' | 'resolved' | 'dismissed' {
  if (status === 'resolved') return 'resolved';
  if (status === 'dismissed') return 'dismissed';
  if (status === 'in_progress') return 'in_progress';
  return 'open';
}

function getStatusLabel(status?: string | null) {
  const normalized = getNormalizedStatus(status);

  if (normalized === 'resolved') return 'Löst';
  if (normalized === 'dismissed') return 'Avfärdad';
  if (normalized === 'in_progress') return 'Pågår';
  return 'Öppen';
}

function getStatusChipStyle(status?: string | null) {
  const normalized = getNormalizedStatus(status);

  if (normalized === 'resolved') {
    return {
      backgroundColor: '#EAF5F1',
      borderColor: '#B8DDD5',
      textColor: '#166534',
    };
  }

  if (normalized === 'dismissed') {
    return {
      backgroundColor: '#FCEAEA',
      borderColor: '#F2C8C8',
      textColor: '#B42318',
    };
  }

  if (normalized === 'in_progress') {
    return {
      backgroundColor: '#EEF4FF',
      borderColor: '#D8E4FA',
      textColor: '#1D4ED8',
    };
  }

  return {
    backgroundColor: '#FFF7E8',
    borderColor: '#F1DEC2',
    textColor: '#A16207',
  };
}

export default function AdminReportsScreen() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [savingId, setSavingId] = useState('');
  const [errorText, setErrorText] = useState('');
  const [items, setItems] = useState<ReportCard[]>([]);
  const [noteById, setNoteById] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState<'all' | 'open' | 'in_progress' | 'resolved' | 'dismissed'>('all');

  const loadData = useCallback(async () => {
    try {
      setErrorText('');

      const adminAllowed = await isCurrentUserAdmin();
      if (!adminAllowed) {
        setItems([]);
        setErrorText('Du har inte adminåtkomst.');
        return;
      }

      const { data, error } = await supabase
        .from('reports')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;

      const reports = ((data ?? []) as ReportRow[]).map((item) => ({
        ...item,
        status: getNormalizedStatus(item.status),
      }));

      if (reports.length === 0) {
        setItems([]);
        return;
      }

      const profileIds = new Set<string>();

      reports.forEach((report) => {
        if (report.reporter_id) profileIds.add(report.reporter_id);
        if (report.reported_user_id) profileIds.add(report.reported_user_id);
        if (report.reported_profile_id) profileIds.add(report.reported_profile_id);
        if (report.target_user_id) profileIds.add(report.target_user_id);
      });

      const ids = [...profileIds];

      let profileMap = new Map<string, ProfileRow>();

      if (ids.length > 0) {
        const { data: profileRows, error: profileError } = await supabase
          .from('profiles')
          .select('id, name, city, age')
          .in('id', ids);

        if (profileError) throw profileError;

        ((profileRows ?? []) as ProfileRow[]).forEach((profile) => {
          profileMap.set(profile.id, profile);
        });
      }

      const builtItems: ReportCard[] = reports.map((report) => {
        const reportedId =
          report.reported_user_id || report.reported_profile_id || report.target_user_id || null;

        return {
          ...report,
          reporterProfile: report.reporter_id ? profileMap.get(report.reporter_id) ?? null : null,
          reportedProfile: reportedId ? profileMap.get(reportedId) ?? null : null,
        };
      });

      setItems(builtItems);

      const nextNotes: Record<string, string> = {};
      builtItems.forEach((item) => {
        nextNotes[item.id] = item.admin_note ?? '';
      });
      setNoteById(nextNotes);
    } catch (error: any) {
      setItems([]);
      setErrorText(error?.message || 'Kunde inte ladda rapporter.');
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

  const updateStatus = async (
    item: ReportCard,
    nextStatus: 'open' | 'in_progress' | 'resolved' | 'dismissed'
  ) => {
    try {
      setSavingId(item.id);

      const { error } = await supabase
        .from('reports')
        .update({
          status: nextStatus,
          admin_note: noteById[item.id]?.trim() || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', item.id);

      if (error) throw error;

      setItems((prev) =>
        prev.map((current) =>
          current.id === item.id
            ? {
                ...current,
                status: nextStatus,
                admin_note: noteById[item.id]?.trim() || null,
                updated_at: new Date().toISOString(),
              }
            : current
        )
      );

      Alert.alert('Sparat', `Rapporten är nu ${getStatusLabel(nextStatus).toLowerCase()}.`);
    } catch (error: any) {
      Alert.alert('Kunde inte spara', error?.message || 'Något gick fel.');
    } finally {
      setSavingId('');
    }
  };

  const filteredItems = useMemo(() => {
    if (filter === 'all') return items;
    return items.filter((item) => getNormalizedStatus(item.status) === filter);
  }, [items, filter]);

  const openCount = items.filter((item) => getNormalizedStatus(item.status) === 'open').length;
  const progressCount = items.filter((item) => getNormalizedStatus(item.status) === 'in_progress').length;
  const resolvedCount = items.filter((item) => getNormalizedStatus(item.status) === 'resolved').length;
  const dismissedCount = items.filter((item) => getNormalizedStatus(item.status) === 'dismissed').length;

  if (loading) {
    return (
      <WithUScreen>
        <WithUTopBar
          title="Admin"
          subtitle="Rapporter"
          right={<WithUAvatar emoji="🛡️" size={34} />}
        />
        <WithUPage style={styles.pageOnly}>
          <View style={styles.stateCard}>
            <ActivityIndicator size="large" color={withuColors.coral} />
            <Text style={styles.stateTitle}>Laddar rapporter...</Text>
            <Text style={styles.stateText}>Vi hämtar inkomna rapporter.</Text>
          </View>
        </WithUPage>
      </WithUScreen>
    );
  }

  return (
    <WithUScreen>
      <WithUTopBar
        title="Admin"
        subtitle="Rapporter"
        right={<WithUAvatar emoji="🛡️" size={34} />}
      />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <WithUPage style={styles.page}>
          <View style={styles.heroBlock}>
            <Text style={styles.heroTitle}>Rapporter</Text>
            <Text style={styles.heroSubtitle}>
              Admin kan här se rapporter och hoppa vidare till volontäransökningar.
            </Text>
          </View>

          <View style={styles.navRow}>
            <Pressable style={styles.navChip} onPress={() => router.push('/admin')}>
              <Text style={styles.navChipText}>Admincenter</Text>
            </Pressable>

            <Pressable style={styles.navChip} onPress={() => router.push('/admin/volunteers')}>
              <Text style={styles.navChipText}>Volontäransökningar</Text>
            </Pressable>
          </View>

          <View style={styles.statsRow}>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>{openCount}</Text>
              <Text style={styles.statLabel}>Öppna</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>{progressCount}</Text>
              <Text style={styles.statLabel}>Pågår</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>{resolvedCount}</Text>
              <Text style={styles.statLabel}>Lösta</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>{dismissedCount}</Text>
              <Text style={styles.statLabel}>Avfärdade</Text>
            </View>
          </View>

          <View style={styles.filterRow}>
            {[
              { key: 'open', label: 'Öppna' },
              { key: 'in_progress', label: 'Pågår' },
              { key: 'resolved', label: 'Lösta' },
              { key: 'dismissed', label: 'Avfärdade' },
              { key: 'all', label: 'Alla' },
            ].map((option) => {
              const active = filter === option.key;

              return (
                <Pressable
                  key={option.key}
                  style={[styles.filterChip, active && styles.filterChipActive]}
                  onPress={() => setFilter(option.key as any)}
                >
                  <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>
                    {option.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {errorText ? (
            <View style={styles.stateCard}>
              <Text style={styles.stateTitle}>Fel</Text>
              <Text style={styles.stateText}>{errorText}</Text>
            </View>
          ) : filteredItems.length === 0 ? (
            <View style={styles.stateCard}>
              <Text style={styles.stateTitle}>Inga rapporter</Text>
              <Text style={styles.stateText}>Det finns inga rapporter i det här filtret.</Text>
            </View>
          ) : (
            <View style={styles.listWrap}>
              {filteredItems.map((item) => {
                const chip = getStatusChipStyle(item.status);
                const isSaving = savingId === item.id;

                return (
                  <View key={item.id} style={styles.card}>
                    <View style={styles.cardTop}>
                      <View style={styles.statusChipWrap}>
                        <View
                          style={[
                            styles.statusChip,
                            {
                              backgroundColor: chip.backgroundColor,
                              borderColor: chip.borderColor,
                            },
                          ]}
                        >
                          <Text style={[styles.statusChipText, { color: chip.textColor }]}>
                            {getStatusLabel(item.status)}
                          </Text>
                        </View>
                      </View>

                      <Text style={styles.dateText}>{formatDate(item.created_at)}</Text>
                    </View>

                    <Text style={styles.reasonTitle}>{item.reason || 'Rapport'}</Text>
                    <Text style={styles.infoText}>Källa: {item.source || 'Okänd'}</Text>
                    <Text style={styles.infoText}>
                      Rapporterad av: {item.reporterProfile?.name || item.reporter_id || 'Okänd'}
                    </Text>
                    <Text style={styles.infoText}>
                      Rapporterad person:{' '}
                      {item.reportedProfile?.name ||
                        item.reported_user_id ||
                        item.reported_profile_id ||
                        item.target_user_id ||
                        'Okänd'}
                    </Text>

                    {!!item.details && (
                      <View style={styles.detailsBox}>
                        <Text style={styles.detailsLabel}>Detaljer</Text>
                        <Text style={styles.detailsText}>{item.details}</Text>
                      </View>
                    )}

                    {!!item.conversation_id && (
                      <Text style={styles.metaSmall}>Konversation: {item.conversation_id}</Text>
                    )}

                    <Text style={styles.metaSmall}>
                      Senast uppdaterad: {formatDate(item.updated_at || item.created_at)}
                    </Text>

                    <Text style={styles.inputLabel}>Admin-notering</Text>
                    <TextInput
                      value={noteById[item.id] ?? ''}
                      onChangeText={(value) =>
                        setNoteById((prev) => ({ ...prev, [item.id]: value }))
                      }
                      placeholder="Skriv intern notering..."
                      placeholderTextColor={withuColors.muted}
                      multiline
                      style={styles.input}
                    />

                    <View style={styles.buttonGrid}>
                      <Pressable
                        style={[styles.actionButton, styles.openButton, isSaving && styles.disabled]}
                        onPress={() => updateStatus(item, 'open')}
                        disabled={isSaving}
                      >
                        <Text style={styles.openButtonText}>{isSaving ? 'Vänta...' : 'Öppen'}</Text>
                      </Pressable>

                      <Pressable
                        style={[styles.actionButton, styles.progressButton, isSaving && styles.disabled]}
                        onPress={() => updateStatus(item, 'in_progress')}
                        disabled={isSaving}
                      >
                        <Text style={styles.progressButtonText}>{isSaving ? 'Vänta...' : 'Pågår'}</Text>
                      </Pressable>

                      <Pressable
                        style={[styles.actionButton, styles.resolveButton, isSaving && styles.disabled]}
                        onPress={() => updateStatus(item, 'resolved')}
                        disabled={isSaving}
                      >
                        <Text style={styles.resolveButtonText}>{isSaving ? 'Vänta...' : 'Löst'}</Text>
                      </Pressable>

                      <Pressable
                        style={[styles.actionButton, styles.dismissButton, isSaving && styles.disabled]}
                        onPress={() => updateStatus(item, 'dismissed')}
                        disabled={isSaving}
                      >
                        <Text style={styles.dismissButtonText}>{isSaving ? 'Vänta...' : 'Avfärda'}</Text>
                      </Pressable>
                    </View>
                  </View>
                );
              })}
            </View>
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
  pageOnly: { paddingTop: withuSpacing.xl },
  heroBlock: { marginBottom: 18 },
  heroTitle: {
    fontSize: 34,
    fontWeight: '900',
    color: withuColors.navy,
    marginBottom: 8,
  },
  heroSubtitle: {
    fontSize: 15,
    lineHeight: 24,
    color: withuColors.muted,
  },
  navRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  navChip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: '#EEF4FF',
    borderWidth: 1,
    borderColor: '#D8E4FA',
  },
  navChipText: {
    color: withuColors.navy,
    fontSize: 13,
    fontWeight: '900',
  },
  statsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 16,
  },
  statCard: {
    width: '47%',
    backgroundColor: withuColors.white,
    borderRadius: withuRadius.lg,
    borderWidth: 1,
    borderColor: withuColors.line,
    padding: 16,
    alignItems: 'center',
    ...withuShadows.card,
  },
  statValue: {
    fontSize: 24,
    fontWeight: '900',
    color: withuColors.navy,
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: withuColors.muted,
  },
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#D6DCE8',
  },
  filterChipActive: {
    backgroundColor: withuColors.teal,
    borderColor: withuColors.teal,
  },
  filterChipText: {
    color: withuColors.navy,
    fontSize: 13,
    fontWeight: '800',
  },
  filterChipTextActive: {
    color: '#FFFFFF',
  },
  listWrap: {
    gap: 14,
  },
  card: {
    backgroundColor: withuColors.white,
    borderRadius: withuRadius.xl,
    borderWidth: 1,
    borderColor: withuColors.line,
    padding: 16,
    ...withuShadows.card,
  },
  cardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 10,
  },
  statusChipWrap: {
    flex: 1,
  },
  statusChip: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  statusChipText: {
    fontSize: 12,
    fontWeight: '900',
  },
  dateText: {
    fontSize: 12,
    fontWeight: '800',
    color: withuColors.muted,
  },
  reasonTitle: {
    fontSize: 26,
    fontWeight: '900',
    color: withuColors.navy,
    marginBottom: 10,
  },
  infoText: {
    fontSize: 14,
    lineHeight: 22,
    color: '#475569',
    marginBottom: 4,
  },
  detailsBox: {
    marginTop: 12,
    backgroundColor: '#F8FAFC',
    borderRadius: withuRadius.lg,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 12,
  },
  detailsLabel: {
    fontSize: 11,
    fontWeight: '900',
    color: '#64748B',
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  detailsText: {
    fontSize: 14,
    lineHeight: 22,
    color: '#334155',
  },
  metaSmall: {
    marginTop: 8,
    color: withuColors.muted,
    fontSize: 12,
    lineHeight: 18,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '900',
    color: withuColors.navy,
    marginTop: 14,
    marginBottom: 8,
  },
  input: {
    minHeight: 90,
    borderRadius: withuRadius.lg,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: withuColors.navy,
    fontSize: 14,
    textAlignVertical: 'top',
  },
  buttonGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 14,
  },
  actionButton: {
    minWidth: '47%',
    minHeight: 48,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  openButton: {
    backgroundColor: '#FFF7E8',
    borderWidth: 1,
    borderColor: '#F1DEC2',
  },
  openButtonText: {
    color: '#A16207',
    fontSize: 14,
    fontWeight: '900',
  },
  progressButton: {
    backgroundColor: '#EEF4FF',
    borderWidth: 1,
    borderColor: '#D8E4FA',
  },
  progressButtonText: {
    color: '#1D4ED8',
    fontSize: 14,
    fontWeight: '900',
  },
  resolveButton: {
    backgroundColor: '#EAF5F1',
    borderWidth: 1,
    borderColor: '#B8DDD5',
  },
  resolveButtonText: {
    color: '#166534',
    fontSize: 14,
    fontWeight: '900',
  },
  dismissButton: {
    backgroundColor: '#FCEAEA',
    borderWidth: 1,
    borderColor: '#F2C8C8',
  },
  dismissButtonText: {
    color: '#B42318',
    fontSize: 14,
    fontWeight: '900',
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
    marginTop: 12,
    marginBottom: 10,
    textAlign: 'center',
  },
  stateText: {
    color: '#555555',
    fontSize: 15,
    lineHeight: 24,
    textAlign: 'center',
  },
  disabled: {
    opacity: 0.6,
  },
});
