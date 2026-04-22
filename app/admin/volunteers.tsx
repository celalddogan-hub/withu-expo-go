import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import { supabase } from '../../src/lib/supabase';
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

type VolunteerApplicationRow = {
  id: string;
  user_id: string;
  status: string | null;
  role_sv: string | null;
  submitted_at: string | null;
  created_at: string | null;
};

type VolunteerProfileRow = {
  user_id: string;
  role_sv: string | null;
};

type ProfileRow = {
  id: string;
  name: string | null;
  city: string | null;
  age: number | null;
  avatar_emoji: string | null;
  is_bankid_verified: boolean | null;
  bio: string | null;
  activities: string[] | null;
};

type ActiveVolunteerRow = {
  availability_id: string;
  volunteer_user_id: string;
  name: string | null;
  city: string | null;
  avatar_emoji: string | null;
  is_bankid_verified: boolean | null;
  role_sv: string | null;
  title: string | null;
  message: string | null;
  active_from: string | null;
  active_until: string | null;
  max_pending_requests: number | null;
  pending_requests: number | null;
};

function formatDate(value?: string | null) {
  if (!value) return '—';

  try {
    return new Date(value).toLocaleDateString('sv-SE', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return '—';
  }
}

function formatDateTime(value?: string | null) {
  if (!value) return '—';

  try {
    return new Date(value).toLocaleString('sv-SE', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '—';
  }
}

export default function AdminVolunteersScreen() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [checkingAdmin, setCheckingAdmin] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [workingId, setWorkingId] = useState('');
  const [errorText, setErrorText] = useState('');

  const [applications, setApplications] = useState<VolunteerApplicationRow[]>([]);
  const [approvedVolunteers, setApprovedVolunteers] = useState<VolunteerProfileRow[]>([]);
  const [activeVolunteers, setActiveVolunteers] = useState<ActiveVolunteerRow[]>([]);
  const [profilesMap, setProfilesMap] = useState<Map<string, ProfileRow>>(new Map());

  const loadAdminData = useCallback(async () => {
    try {
      setErrorText('');

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError) throw userError;

      if (!user) {
        setIsAdmin(false);
        setErrorText('Du måste logga in.');
        return;
      }

      const { data: adminRow, error: adminError } = await supabase
        .from('admins')
        .select('user_id')
        .eq('user_id', user.id)
        .maybeSingle();

      if (adminError) throw adminError;

      const adminAllowed = !!adminRow;
      setIsAdmin(adminAllowed);

      if (!adminAllowed) {
        setErrorText('Du har inte adminåtkomst.');
        return;
      }

      const [
        { data: applicationRows, error: applicationsError },
        { data: volunteerProfileRows, error: volunteerProfilesError },
        { data: activeRows, error: activeRowsError },
      ] = await Promise.all([
        supabase
          .from('volunteer_applications')
          .select('id, user_id, status, role_sv, submitted_at, created_at')
          .order('submitted_at', { ascending: false, nullsFirst: false })
          .order('created_at', { ascending: false }),

        supabase
          .from('volunteer_profiles')
          .select('user_id, role_sv'),

        supabase
          .from('active_volunteers_now')
          .select(
            'availability_id, volunteer_user_id, name, city, avatar_emoji, is_bankid_verified, role_sv, title, message, active_from, active_until, max_pending_requests, pending_requests'
          )
          .order('active_from', { ascending: false }),
      ]);

      if (applicationsError) throw applicationsError;
      if (volunteerProfilesError) throw volunteerProfilesError;
      if (activeRowsError) throw activeRowsError;

      const applicationList = (applicationRows ?? []) as VolunteerApplicationRow[];
      const volunteerProfileList = (volunteerProfileRows ?? []) as VolunteerProfileRow[];
      const activeVolunteerList = (activeRows ?? []) as ActiveVolunteerRow[];

      const allUserIds = [
        ...new Set([
          ...applicationList.map((row) => row.user_id),
          ...volunteerProfileList.map((row) => row.user_id),
          ...activeVolunteerList.map((row) => row.volunteer_user_id),
        ]),
      ];

      let profileMap = new Map<string, ProfileRow>();

      if (allUserIds.length > 0) {
        const { data: profileRows, error: profilesError } = await supabase
          .from('profiles')
          .select(
            'id, name, city, age, avatar_emoji, is_bankid_verified, bio, activities'
          )
          .in('id', allUserIds);

        if (profilesError) throw profilesError;

        ((profileRows ?? []) as ProfileRow[]).forEach((profile) => {
          profileMap.set(profile.id, profile);
        });
      }

      setApplications(applicationList);
      setApprovedVolunteers(volunteerProfileList);
      setActiveVolunteers(activeVolunteerList);
      setProfilesMap(profileMap);
    } catch (error: any) {
      setErrorText(error?.message || 'Kunde inte ladda admin / volontärer.');
    } finally {
      setLoading(false);
      setRefreshing(false);
      setCheckingAdmin(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      loadAdminData();
    }, [loadAdminData])
  );

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadAdminData();
  };

  const handleApprove = async (application: VolunteerApplicationRow) => {
    try {
      setWorkingId(application.id);

      const roleSv = application.role_sv || 'Volontär';

      const { error: updateApplicationError } = await supabase
        .from('volunteer_applications')
        .update({
          status: 'approved',
        })
        .eq('id', application.id);

      if (updateApplicationError) throw updateApplicationError;

      const { data: existingVolunteerProfile, error: existingError } = await supabase
        .from('volunteer_profiles')
        .select('user_id')
        .eq('user_id', application.user_id)
        .maybeSingle();

      if (existingError) throw existingError;

      if (existingVolunteerProfile?.user_id) {
        const { error: updateVolunteerProfileError } = await supabase
          .from('volunteer_profiles')
          .update({
            role_sv: roleSv,
          })
          .eq('user_id', application.user_id);

        if (updateVolunteerProfileError) throw updateVolunteerProfileError;
      } else {
        const { error: insertVolunteerProfileError } = await supabase
          .from('volunteer_profiles')
          .insert({
            user_id: application.user_id,
            role_sv: roleSv,
          });

        if (insertVolunteerProfileError) throw insertVolunteerProfileError;
      }

      await loadAdminData();

      Alert.alert('Klart', 'Volontären är nu godkänd och finns i volontärprogrammet.');
    } catch (error: any) {
      Alert.alert('Kunde inte godkänna', error?.message || 'Något gick fel.');
    } finally {
      setWorkingId('');
    }
  };

  const handleReject = async (application: VolunteerApplicationRow) => {
    try {
      setWorkingId(application.id);

      const { error } = await supabase
        .from('volunteer_applications')
        .update({
          status: 'rejected',
        })
        .eq('id', application.id);

      if (error) throw error;

      await loadAdminData();

      Alert.alert('Klart', 'Ansökan har nekats.');
    } catch (error: any) {
      Alert.alert('Kunde inte neka', error?.message || 'Något gick fel.');
    } finally {
      setWorkingId('');
    }
  };

  const pendingApplications = useMemo(
    () =>
      applications.filter(
        (item) => (item.status || '').toLowerCase() === 'pending'
      ),
    [applications]
  );

  const approvedApplications = useMemo(
    () =>
      applications.filter(
        (item) => (item.status || '').toLowerCase() === 'approved'
      ),
    [applications]
  );

  if (loading || checkingAdmin) {
    return (
      <WithUScreen>
        <WithUTopBar
          title="Admin"
          subtitle="Volontärprogram"
          right={<WithUAvatar emoji="🛡️" size={34} />}
        />
        <WithUPage style={styles.pageOnly}>
          <View style={styles.stateCard}>
            <ActivityIndicator size="large" color={withuColors.teal} />
            <Text style={styles.stateTitle}>Laddar admin...</Text>
            <Text style={styles.stateText}>Vi hämtar volontäransökningar och status.</Text>
          </View>
        </WithUPage>
      </WithUScreen>
    );
  }

  if (!isAdmin) {
    return (
      <WithUScreen>
        <WithUTopBar
          title="Admin"
          subtitle="Volontärprogram"
          right={<WithUAvatar emoji="🛡️" size={34} />}
        />
        <WithUPage style={styles.pageOnly}>
          <View style={styles.stateCard}>
            <Text style={styles.stateTitle}>Ingen åtkomst</Text>
            <Text style={styles.stateText}>{errorText || 'Du har inte adminåtkomst.'}</Text>
            <Pressable style={styles.secondaryAction} onPress={() => router.back()}>
              <Text style={styles.secondaryActionText}>Gå tillbaka</Text>
            </Pressable>
          </View>
        </WithUPage>
      </WithUScreen>
    );
  }

  return (
    <WithUScreen>
      <WithUTopBar
        title="Admin"
        subtitle="Volontärprogram"
        right={<WithUAvatar emoji="🛡️" size={34} />}
      />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
        showsVerticalScrollIndicator={false}
      >
        <WithUPage style={styles.page}>
          <View style={styles.heroCard}>
            <Text style={styles.heroTitle}>Volontäröversikt</Text>
            <Text style={styles.heroText}>
              Här kan du granska nya ansökningar, se godkända volontärer och följa vilka som är aktiva just nu.
            </Text>
          </View>

          <View style={styles.statsRow}>
            <View style={styles.statCard}>
              <Text style={styles.statNumber}>{pendingApplications.length}</Text>
              <Text style={styles.statLabel}>Väntar</Text>
            </View>

            <View style={styles.statCard}>
              <Text style={styles.statNumber}>{approvedVolunteers.length}</Text>
              <Text style={styles.statLabel}>Godkända</Text>
            </View>

            <View style={styles.statCard}>
              <Text style={styles.statNumber}>{activeVolunteers.length}</Text>
              <Text style={styles.statLabel}>Aktiva nu</Text>
            </View>
          </View>

          {!!errorText && (
            <View style={styles.errorCard}>
              <Text style={styles.errorTitle}>Obs</Text>
              <Text style={styles.errorText}>{errorText}</Text>
            </View>
          )}

          <View style={styles.sectionBlock}>
            <Text style={styles.sectionTitle}>Nya ansökningar</Text>

            {pendingApplications.length === 0 ? (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyTitle}>Inga väntande ansökningar</Text>
                <Text style={styles.emptyText}>När någon skickar in en ny volontäransökan visas den här.</Text>
              </View>
            ) : (
              <View style={styles.listWrap}>
                {pendingApplications.map((application) => {
                  const profile = profilesMap.get(application.user_id);

                  return (
                    <View key={application.id} style={styles.applicationCard}>
                      <View style={styles.applicationTop}>
                        <WithUAvatar emoji={profile?.avatar_emoji || '💚'} size={56} />

                        <View style={styles.applicationMeta}>
                          <Text style={styles.applicationName}>
                            {profile?.name || 'Användare'}
                            {profile?.age ? `, ${profile.age}` : ''}
                          </Text>

                          <Text style={styles.applicationSub}>
                            {profile?.city || 'Plats saknas'}
                            {application.role_sv ? ` · ${application.role_sv}` : ''}
                          </Text>

                          <View style={styles.badgesRow}>
                            <View style={styles.pendingBadge}>
                              <Text style={styles.pendingBadgeText}>Väntar på granskning</Text>
                            </View>

                            {profile?.is_bankid_verified ? (
                              <View style={styles.bankIdBadge}>
                                <Text style={styles.bankIdBadgeText}>✓ BankID</Text>
                              </View>
                            ) : null}
                          </View>
                        </View>
                      </View>

                      {!!profile?.bio?.trim() && (
                        <View style={styles.bioBox}>
                          <Text style={styles.bioText}>{profile.bio.trim()}</Text>
                        </View>
                      )}

                      {(profile?.activities ?? []).length > 0 ? (
                        <View style={styles.activityRow}>
                          {(profile?.activities ?? []).slice(0, 4).map((item) => (
                            <View key={item} style={styles.activityPill}>
                              <Text style={styles.activityPillText}>{item}</Text>
                            </View>
                          ))}
                        </View>
                      ) : null}

                      <Text style={styles.dateText}>
                        Skickad: {formatDateTime(application.submitted_at || application.created_at)}
                      </Text>

                      <View style={styles.actionsRow}>
                        <Pressable
                          style={[styles.approveButton, workingId === application.id && styles.buttonDisabled]}
                          onPress={() => handleApprove(application)}
                          disabled={workingId === application.id}
                        >
                          <Text style={styles.approveButtonText}>
                            {workingId === application.id ? 'Jobbar...' : '✓ Godkänn'}
                          </Text>
                        </Pressable>

                        <Pressable
                          style={[styles.rejectButton, workingId === application.id && styles.buttonDisabled]}
                          onPress={() => handleReject(application)}
                          disabled={workingId === application.id}
                        >
                          <Text style={styles.rejectButtonText}>✕ Neka</Text>
                        </Pressable>
                      </View>
                    </View>
                  );
                })}
              </View>
            )}
          </View>

          <View style={styles.sectionBlock}>
            <Text style={styles.sectionTitle}>Godkända volontärer</Text>

            {approvedVolunteers.length === 0 ? (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyTitle}>Inga godkända volontärer ännu</Text>
                <Text style={styles.emptyText}>När du godkänner ansökningar kommer de att visas här.</Text>
              </View>
            ) : (
              <View style={styles.listWrap}>
                {approvedVolunteers.map((volunteer) => {
                  const profile = profilesMap.get(volunteer.user_id);
                  const isCurrentlyActive = activeVolunteers.some(
                    (item) => item.volunteer_user_id === volunteer.user_id
                  );

                  return (
                    <View key={volunteer.user_id} style={styles.approvedCard}>
                      <View style={styles.applicationTop}>
                        <WithUAvatar emoji={profile?.avatar_emoji || '💚'} size={52} />

                        <View style={styles.applicationMeta}>
                          <Text style={styles.applicationName}>
                            {profile?.name || 'Volontär'}
                            {profile?.age ? `, ${profile.age}` : ''}
                          </Text>

                          <Text style={styles.applicationSub}>
                            {profile?.city || 'Plats saknas'}
                            {volunteer.role_sv ? ` · ${volunteer.role_sv}` : ''}
                          </Text>

                          <View style={styles.badgesRow}>
                            <View style={styles.approvedBadge}>
                              <Text style={styles.approvedBadgeText}>Godkänd volontär</Text>
                            </View>

                            {isCurrentlyActive ? (
                              <View style={styles.activeNowBadge}>
                                <Text style={styles.activeNowBadgeText}>Aktiv nu</Text>
                              </View>
                            ) : null}
                          </View>
                        </View>
                      </View>
                    </View>
                  );
                })}
              </View>
            )}
          </View>

          <View style={styles.sectionBlock}>
            <Text style={styles.sectionTitle}>Aktiva just nu</Text>

            {activeVolunteers.length === 0 ? (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyTitle}>Ingen volontär aktiv just nu</Text>
                <Text style={styles.emptyText}>När en godkänd volontär slår på tillgänglig nu visas det här.</Text>
              </View>
            ) : (
              <View style={styles.listWrap}>
                {activeVolunteers.map((item) => (
                  <View key={item.availability_id} style={styles.activeCard}>
                    <View style={styles.applicationTop}>
                      <WithUAvatar emoji={item.avatar_emoji || '💚'} size={52} />

                      <View style={styles.applicationMeta}>
                        <Text style={styles.applicationName}>
                          {item.name || 'Volontär'}
                        </Text>

                        <Text style={styles.applicationSub}>
                          {item.city || 'Plats saknas'}
                          {item.role_sv ? ` · ${item.role_sv}` : ''}
                        </Text>

                        <View style={styles.badgesRow}>
                          <View style={styles.activeNowBadge}>
                            <Text style={styles.activeNowBadgeText}>Aktiv nu</Text>
                          </View>
                        </View>
                      </View>
                    </View>

                    {!!item.message && (
                      <View style={styles.bioBox}>
                        <Text style={styles.bioText}>{item.message}</Text>
                      </View>
                    )}

                    <Text style={styles.dateText}>
                      Start: {formatDateTime(item.active_from)}
                    </Text>
                    <Text style={styles.dateText}>
                      Slut: {formatDateTime(item.active_until)}
                    </Text>
                    <Text style={styles.dateText}>
                      Väntande förfrågningar: {item.pending_requests ?? 0}/{item.max_pending_requests ?? 0}
                    </Text>
                  </View>
                ))}
              </View>
            )}
          </View>

          <View style={styles.sectionBlock}>
            <Text style={styles.sectionTitle}>Historik</Text>

            {approvedApplications.length === 0 ? (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyTitle}>Ingen historik ännu</Text>
                <Text style={styles.emptyText}>Godkända ansökningar visas här när de finns.</Text>
              </View>
            ) : (
              <View style={styles.historyWrap}>
                {approvedApplications.slice(0, 10).map((application) => {
                  const profile = profilesMap.get(application.user_id);

                  return (
                    <View key={application.id} style={styles.historyRow}>
                      <Text style={styles.historyName}>
                        {profile?.name || 'Användare'}
                      </Text>
                      <Text style={styles.historyDate}>
                        {formatDate(application.submitted_at || application.created_at)}
                      </Text>
                    </View>
                  );
                })}
              </View>
            )}
          </View>
        </WithUPage>
      </ScrollView>
    </WithUScreen>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
    backgroundColor: '#F4F6FB',
  },
  content: {
    paddingBottom: 40,
  },
  page: {
    paddingTop: withuSpacing.lg,
  },
  pageOnly: {
    paddingTop: withuSpacing.xl,
  },
  heroCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: withuRadius.xl,
    borderWidth: 1,
    borderColor: '#E6EAF4',
    padding: withuSpacing.lg,
    marginBottom: 14,
    ...withuShadows.card,
  },
  heroTitle: {
    fontSize: 30,
    fontWeight: '900',
    color: '#20325E',
    marginBottom: 8,
  },
  heroText: {
    fontSize: 15,
    lineHeight: 24,
    color: '#5B6785',
  },
  statsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 14,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E6EAF4',
    paddingVertical: 18,
    paddingHorizontal: 12,
    alignItems: 'center',
    ...withuShadows.card,
  },
  statNumber: {
    fontSize: 24,
    fontWeight: '900',
    color: '#20325E',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: withuColors.muted,
  },
  sectionBlock: {
    marginBottom: 18,
  },
  sectionTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: '#20325E',
    marginBottom: 12,
  },
  listWrap: {
    gap: 12,
  },
  applicationCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E6EAF4',
    padding: 16,
    ...withuShadows.card,
  },
  approvedCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E6EAF4',
    padding: 16,
    ...withuShadows.card,
  },
  activeCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E6EAF4',
    padding: 16,
    ...withuShadows.card,
  },
  applicationTop: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
    marginBottom: 12,
  },
  applicationMeta: {
    flex: 1,
  },
  applicationName: {
    fontSize: 18,
    fontWeight: '900',
    color: '#20325E',
    marginBottom: 2,
  },
  applicationSub: {
    fontSize: 13,
    color: withuColors.muted,
    marginBottom: 8,
  },
  badgesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  pendingBadge: {
    backgroundColor: '#FFF7E8',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  pendingBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#9C640C',
  },
  approvedBadge: {
    backgroundColor: '#E8F7F3',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  approvedBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: withuColors.teal,
  },
  activeNowBadge: {
    backgroundColor: '#EEF4FF',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  activeNowBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#20325E',
  },
  bankIdBadge: {
    backgroundColor: '#EAF5F1',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  bankIdBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#1C5E52',
  },
  bioBox: {
    backgroundColor: '#F7FAFD',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E6EAF4',
    padding: 12,
    marginBottom: 10,
  },
  bioText: {
    fontSize: 14,
    lineHeight: 22,
    color: '#33415C',
  },
  activityRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 10,
  },
  activityPill: {
    backgroundColor: '#F2F5FB',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  activityPillText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#20325E',
  },
  dateText: {
    fontSize: 12,
    lineHeight: 18,
    color: withuColors.muted,
    marginBottom: 4,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 10,
  },
  approveButton: {
    flex: 1,
    minHeight: 50,
    borderRadius: 16,
    backgroundColor: withuColors.teal,
    alignItems: 'center',
    justifyContent: 'center',
  },
  approveButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '900',
  },
  rejectButton: {
    flex: 1,
    minHeight: 50,
    borderRadius: 16,
    backgroundColor: '#FFF4F4',
    borderWidth: 1,
    borderColor: '#F2D1D1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rejectButtonText: {
    color: '#BB4C4C',
    fontSize: 15,
    fontWeight: '800',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  emptyCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E6EAF4',
    padding: 20,
    alignItems: 'center',
    ...withuShadows.card,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: '#20325E',
    textAlign: 'center',
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    lineHeight: 22,
    color: '#5B6785',
    textAlign: 'center',
  },
  errorCard: {
    backgroundColor: '#FFF4F4',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#F2D1D1',
    padding: 14,
    marginBottom: 14,
  },
  errorTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: '#A13B3B',
    marginBottom: 4,
  },
  errorText: {
    fontSize: 13,
    lineHeight: 20,
    color: '#A13B3B',
  },
  historyWrap: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E6EAF4',
    padding: 12,
    ...withuShadows.card,
  },
  historyRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#EEF2F7',
  },
  historyName: {
    flex: 1,
    fontSize: 14,
    fontWeight: '800',
    color: '#20325E',
  },
  historyDate: {
    fontSize: 12,
    color: withuColors.muted,
    fontWeight: '700',
  },
  stateCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: withuRadius.xl,
    borderWidth: 1,
    borderColor: '#E6EAF4',
    padding: withuSpacing.xxl,
    alignItems: 'center',
    ...withuShadows.card,
  },
  stateTitle: {
    color: '#20325E',
    fontSize: 24,
    fontWeight: '900',
    marginTop: 12,
    marginBottom: 8,
    textAlign: 'center',
  },
  stateText: {
    color: '#5B6785',
    fontSize: 15,
    lineHeight: 24,
    textAlign: 'center',
    marginBottom: 16,
  },
  secondaryAction: {
    backgroundColor: '#F1F5FC',
    borderWidth: 1,
    borderColor: '#DCE4F3',
    minHeight: 50,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  secondaryActionText: {
    color: '#20325E',
    fontSize: 15,
    fontWeight: '800',
  },
});