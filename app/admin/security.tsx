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
import {
  WithUAvatar,
  WithUCard,
  WithUPage,
  WithUScreen,
  WithUTopBar,
} from '../../src/components/withu/WithUPrimitives';
import { isCurrentUserAdmin } from '../../src/lib/moderation';
import { supabase } from '../../src/lib/supabase';
import {
  withuColors,
  withuRadius,
  withuShadows,
  withuSpacing,
} from '../../src/theme/withuTheme';

type SecurityAuditRow = {
  table_name: string;
  rls_enabled: boolean;
  policy_count: number;
  risk: 'ok' | 'missing_table' | 'rls_off' | 'no_policies' | string;
};

const RISK_COPY: Record<string, { label: string; text: string; color: string; icon: keyof typeof Ionicons.glyphMap }> = {
  ok: {
    label: 'Skyddad',
    text: 'RLS är på och policies finns.',
    color: withuColors.success,
    icon: 'shield-checkmark-outline',
  },
  missing_table: {
    label: 'Saknas',
    text: 'Tabellen finns inte i databasen.',
    color: '#B42318',
    icon: 'alert-circle-outline',
  },
  rls_off: {
    label: 'RLS av',
    text: 'Tabellen behöver Row Level Security.',
    color: '#B42318',
    icon: 'lock-open-outline',
  },
  no_policies: {
    label: 'Policy saknas',
    text: 'RLS är på men inga policies hittades.',
    color: '#D97706',
    icon: 'warning-outline',
  },
};

function getRiskInfo(risk: string) {
  return (
    RISK_COPY[risk] ?? {
      label: risk,
      text: 'Kontrollera tabellen manuellt.',
      color: '#D97706',
      icon: 'warning-outline' as const,
    }
  );
}

export default function AdminSecurityScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorText, setErrorText] = useState('');
  const [rows, setRows] = useState<SecurityAuditRow[]>([]);

  const loadAudit = useCallback(async () => {
    try {
      setErrorText('');

      const adminAllowed = await isCurrentUserAdmin();
      if (!adminAllowed) {
        setRows([]);
        setErrorText('Du har inte adminåtkomst.');
        return;
      }

      const { data, error } = await supabase.rpc('get_admin_security_audit');
      if (error) throw error;

      setRows((data ?? []) as SecurityAuditRow[]);
    } catch (error: any) {
      setRows([]);
      setErrorText(error?.message || 'Kunde inte ladda säkerhetskontroll.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      loadAudit();
    }, [loadAudit])
  );

  const summary = useMemo(() => {
    const ok = rows.filter((row) => row.risk === 'ok').length;
    return {
      ok,
      warning: rows.length - ok,
      total: rows.length,
    };
  }, [rows]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadAudit();
  };

  if (loading) {
    return (
      <WithUScreen>
        <WithUTopBar title="Admin" subtitle="Säkerhet" right={<WithUAvatar emoji="🛡️" size={34} />} />
        <View style={styles.centerState}>
          <ActivityIndicator size="large" color={withuColors.coral} />
          <Text style={styles.centerTitle}>Kontrollerar databasen...</Text>
        </View>
      </WithUScreen>
    );
  }

  return (
    <WithUScreen>
      <WithUTopBar title="Admin" subtitle="Säkerhet" right={<WithUAvatar emoji="🛡️" size={34} />} />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
        showsVerticalScrollIndicator={false}
      >
        <WithUPage style={styles.page}>
          <View style={styles.heroBlock}>
            <Text style={styles.heroEyebrow}>SUPABASE</Text>
            <Text style={styles.heroTitle}>Säkerhetskontroll</Text>
            <Text style={styles.heroSubtitle}>
              Snabb adminvy för att se om viktiga tabeller har RLS och policies.
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

          {errorText ? (
            <WithUCard>
              <Text style={styles.errorTitle}>Kunde inte köra kontrollen</Text>
              <Text style={styles.errorText}>{errorText}</Text>
            </WithUCard>
          ) : (
            <>
              <View style={styles.summaryRow}>
                <View style={styles.summaryCard}>
                  <Text style={styles.summaryValue}>{summary.ok}</Text>
                  <Text style={styles.summaryLabel}>Skyddade</Text>
                </View>
                <View style={styles.summaryCard}>
                  <Text style={[styles.summaryValue, summary.warning ? styles.warningValue : styles.okValue]}>
                    {summary.warning}
                  </Text>
                  <Text style={styles.summaryLabel}>Varningar</Text>
                </View>
                <View style={styles.summaryCard}>
                  <Text style={styles.summaryValue}>{summary.total}</Text>
                  <Text style={styles.summaryLabel}>Kontrollerade</Text>
                </View>
              </View>

              <WithUCard style={styles.infoCard}>
                <Text style={styles.infoTitle}>Så använder vi den här vyn</Text>
                <Text style={styles.infoText}>
                  Rött betyder att vi behöver täta databasen innan fler användare släpps in. Grönt betyder inte att allt
                  är färdigt, men att grundskyddet finns på tabellen.
                </Text>
              </WithUCard>

              {rows.map((row) => {
                const risk = getRiskInfo(row.risk);
                return (
                  <WithUCard key={row.table_name} style={styles.auditCard}>
                    <View style={styles.auditHeader}>
                      <View style={[styles.statusIcon, { backgroundColor: `${risk.color}18` }]}>
                        <Ionicons name={risk.icon} size={22} color={risk.color} />
                      </View>
                      <View style={styles.auditTextCol}>
                        <Text style={styles.tableName}>{row.table_name}</Text>
                        <Text style={styles.tableMeta}>
                          RLS: {row.rls_enabled ? 'på' : 'av'} · Policies: {row.policy_count}
                        </Text>
                      </View>
                      <View style={[styles.riskPill, { backgroundColor: `${risk.color}18` }]}>
                        <Text style={[styles.riskText, { color: risk.color }]}>{risk.label}</Text>
                      </View>
                    </View>
                    <Text style={styles.riskDescription}>{risk.text}</Text>
                  </WithUCard>
                );
              })}
            </>
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
    marginTop: 14,
    color: withuColors.navy,
    fontSize: 18,
    fontWeight: '900',
  },
  heroBlock: {
    marginBottom: 16,
  },
  heroEyebrow: {
    color: withuColors.coral,
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 1.6,
    marginBottom: 6,
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
    gap: 8,
    marginBottom: 16,
  },
  navChip: {
    minHeight: 42,
    borderRadius: withuRadius.pill,
    borderWidth: 1,
    borderColor: '#D8E4FA',
    backgroundColor: '#EEF4FF',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
    ...withuShadows.card,
  },
  navChipText: {
    color: withuColors.navy,
    fontSize: 12,
    fontWeight: '900',
  },
  errorTitle: {
    color: withuColors.navy,
    fontSize: 18,
    fontWeight: '900',
    marginBottom: 8,
  },
  errorText: {
    color: withuColors.muted,
    fontSize: 14,
    lineHeight: 22,
  },
  summaryRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 14,
  },
  summaryCard: {
    flex: 1,
    backgroundColor: withuColors.white,
    borderRadius: withuRadius.lg,
    borderWidth: 1,
    borderColor: '#E1E6F0',
    padding: 12,
    ...withuShadows.card,
  },
  summaryValue: {
    color: withuColors.navy,
    fontSize: 26,
    fontWeight: '900',
  },
  okValue: {
    color: withuColors.success,
  },
  warningValue: {
    color: '#B42318',
  },
  summaryLabel: {
    color: withuColors.muted,
    fontSize: 11,
    fontWeight: '900',
    marginTop: 2,
  },
  infoCard: {
    marginBottom: 14,
  },
  infoTitle: {
    color: withuColors.navy,
    fontSize: 18,
    fontWeight: '900',
    marginBottom: 8,
  },
  infoText: {
    color: withuColors.muted,
    fontSize: 14,
    lineHeight: 22,
  },
  auditCard: {
    marginBottom: 12,
  },
  auditHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusIcon: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  auditTextCol: {
    flex: 1,
    minWidth: 0,
  },
  tableName: {
    color: withuColors.navy,
    fontSize: 16,
    fontWeight: '900',
  },
  tableMeta: {
    color: withuColors.muted,
    fontSize: 12,
    fontWeight: '700',
    marginTop: 3,
  },
  riskPill: {
    borderRadius: withuRadius.pill,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  riskText: {
    fontSize: 11,
    fontWeight: '900',
  },
  riskDescription: {
    color: withuColors.muted,
    fontSize: 13,
    lineHeight: 20,
    marginTop: 12,
  },
});
