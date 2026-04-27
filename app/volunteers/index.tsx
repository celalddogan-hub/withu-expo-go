import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
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
import {
  createScopedRealtimeChannel,
  removeChannelSafely,
} from '../../src/lib/realtime';
import {
  type ActiveVolunteerNowRow,
  type VolunteerSupportRequestRow,
  getMyVolunteerRequests,
  listActiveVolunteers,
  sendVolunteerSupportRequest,
} from '../../src/lib/volunteerSupport';
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

type MyVolunteerApplicationRow = {
  id: string;
  status: 'pending' | 'approved' | 'rejected' | string | null;
  role_sv: string | null;
  submitted_at: string | null;
  created_at: string | null;
};

function formatRemaining(activeUntil?: string | null, _tick?: number) {
  if (!activeUntil) return 'Aktiv nu';

  const remainingMs = new Date(activeUntil).getTime() - Date.now();
  if (remainingMs <= 0) return 'Slutar snart';

  const totalMinutes = Math.floor(remainingMs / 60000);
  if (totalMinutes < 1) return 'Mindre än 1 min kvar';
  if (totalMinutes === 1) return '1 min kvar';
  if (totalMinutes < 60) return `${totalMinutes} min kvar`;

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (minutes === 0) return `${hours} h kvar`;
  return `${hours} h ${minutes} min kvar`;
}

function makeStatusMap(rows: VolunteerSupportRequestRow[]) {
  const map = new Map<string, VolunteerSupportRequestRow>();

  rows.forEach((row) => {
    const existing = map.get(row.volunteer_user_id);

    if (!existing) {
      map.set(row.volunteer_user_id, row);
      return;
    }

    const rowTime = new Date(row.created_at).getTime();
    const existingTime = new Date(existing.created_at).getTime();

    if (rowTime > existingTime) {
      map.set(row.volunteer_user_id, row);
    }
  });

  return map;
}

function getSlotsLeft(volunteer: ActiveVolunteerNowRow) {
  const max = volunteer.max_pending_requests ?? 0;
  const pending = volunteer.pending_requests ?? 0;
  return Math.max(0, max - pending);
}

function formatApplicationDate(value?: string | null) {
  if (!value) return 'nyligen';

  return new Intl.DateTimeFormat('sv-SE', {
    day: 'numeric',
    month: 'short',
  }).format(new Date(value));
}

function getApplicationStatusTitle(status?: string | null) {
  if (status === 'approved') return 'Godkänd volontär';
  if (status === 'rejected') return 'Ansökan behöver ändras';
  return 'Ansökan väntar';
}

function getApplicationStatusText(status?: string | null) {
  if (status === 'approved') {
    return 'Du kan nu synas som volontär när du aktiverar dig.';
  }

  if (status === 'rejected') {
    return 'Öppna ansökan, läs svaret och skicka in igen när du är redo.';
  }

  return 'Admin granskar din ansökan. Du ser statusen här hela tiden.';
}

export default function VolunteersScreen() {
  const router = useRouter();
  const channelRef = useRef<RealtimeChannel | null>(null);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sending, setSending] = useState(false);
  const [currentUserId, setCurrentUserId] = useState('');
  const [volunteers, setVolunteers] = useState<ActiveVolunteerNowRow[]>([]);
  const [myRequests, setMyRequests] = useState<VolunteerSupportRequestRow[]>([]);
  const [myApplication, setMyApplication] = useState<MyVolunteerApplicationRow | null>(null);
  const [selectedVolunteer, setSelectedVolunteer] = useState<ActiveVolunteerNowRow | null>(null);
  const [introMessage, setIntroMessage] = useState('');
  const [errorText, setErrorText] = useState('');
  const [tick, setTick] = useState(0);

  const requestMap = useMemo(() => makeStatusMap(myRequests), [myRequests]);

  const loadData = useCallback(async () => {
    try {
      setErrorText('');

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError) throw userError;

      if (!user) {
        setCurrentUserId('');
        setVolunteers([]);
        setMyRequests([]);
        setMyApplication(null);
        setErrorText('Du måste logga in för att se volontärer.');
        return;
      }

      setCurrentUserId(user.id);

      const [activeVolunteers, requests, applicationResult] = await Promise.all([
        listActiveVolunteers(),
        getMyVolunteerRequests(user.id),
        supabase
          .from('volunteer_applications')
          .select('id, status, role_sv, submitted_at, created_at')
          .eq('user_id', user.id)
          .order('submitted_at', { ascending: false, nullsFirst: false })
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);

      if (applicationResult.error) throw applicationResult.error;

      const visibleVolunteers = activeVolunteers
        .filter((item) => item.volunteer_user_id !== user.id)
        .sort((a, b) => {
          const aSlots = getSlotsLeft(a);
          const bSlots = getSlotsLeft(b);

          if (bSlots !== aSlots) return bSlots - aSlots;
          if (!!b.is_bankid_verified !== !!a.is_bankid_verified) {
            return Number(!!b.is_bankid_verified) - Number(!!a.is_bankid_verified);
          }

          return (a.name || '').localeCompare(b.name || '', 'sv');
        });

      setVolunteers(visibleVolunteers);
      setMyRequests(requests);
      setMyApplication((applicationResult.data as MyVolunteerApplicationRow | null) ?? null);
    } catch (error: any) {
      setErrorText(error?.message || 'Kunde inte ladda volontärer.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const teardownRealtime = useCallback(async () => {
    const current = channelRef.current;
    channelRef.current = null;
    await removeChannelSafely(current);
  }, []);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      loadData();
    }, [loadData])
  );

  useEffect(() => {
    if (!currentUserId) return;

    let cancelled = false;

    const startRealtime = async () => {
      await teardownRealtime();

      const channel = createScopedRealtimeChannel('volunteers-live', currentUserId)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'volunteer_availability',
          },
          () => {
            loadData();
          }
        )
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'volunteer_support_requests',
            filter: `requester_user_id=eq.${currentUserId}`,
          },
          () => {
            loadData();
          }
        );

      channel.subscribe((status) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          loadData();
        }
      });

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
  }, [currentUserId, loadData, teardownRealtime]);

  useEffect(() => {
    if (!currentUserId) return;

    const interval = setInterval(() => {
      loadData();
    }, 15000);

    return () => clearInterval(interval);
  }, [currentUserId, loadData]);

  useEffect(() => {
    const interval = setInterval(() => {
      setTick((prev) => prev + 1);
    }, 30000);

    return () => clearInterval(interval);
  }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadData();
  };

  const openSupportModal = (volunteer: ActiveVolunteerNowRow) => {
    const existing = requestMap.get(volunteer.volunteer_user_id);
    const slotsLeft = getSlotsLeft(volunteer);

    if (slotsLeft <= 0) {
      Alert.alert(
        'Full just nu',
        'Den här volontären har redan flera väntande hjälpfrågor. Prova en annan volontär.'
      );
      return;
    }

    if (existing?.status === 'pending') {
      Alert.alert(
        'Redan skickat',
        'Du har redan en väntande hjälpfråga till den här volontären.'
      );
      return;
    }

    if (existing?.status === 'accepted') {
      if (existing.conversation_key) {
        router.push({
          pathname: '/chat/[conversationKey]',
          params: { conversationKey: existing.conversation_key },
        });
        return;
      }

      Alert.alert('Redan godkänd', 'Volontären har redan godkänt din förfrågan.');
      return;
    }

    setSelectedVolunteer(volunteer);
    setIntroMessage('');
  };

  const handleSendRequest = async () => {
    if (!selectedVolunteer || !currentUserId || sending) return;

    const trimmedMessage = introMessage.trim();

    if (trimmedMessage.length < 3) {
      Alert.alert(
        'Skriv lite mer',
        'Skriv gärna kort vad du behöver hjälp med innan du skickar.'
      );
      return;
    }

    try {
      setSending(true);

      await sendVolunteerSupportRequest({
        availabilityId: selectedVolunteer.availability_id,
        volunteerUserId: selectedVolunteer.volunteer_user_id,
        requesterUserId: currentUserId,
        introMessage: trimmedMessage,
      });

      setSelectedVolunteer(null);
      setIntroMessage('');

      await loadData();

      Alert.alert(
        'Skickat',
        'Din hjälpfråga är skickad. Volontären väljer nu om den kan hjälpa dig.'
      );
    } catch (error: any) {
      Alert.alert('Kunde inte skicka', error?.message || 'Något gick fel.');
    } finally {
      setSending(false);
    }
  };

  const closeModal = () => {
    if (sending) return;
    setSelectedVolunteer(null);
    setIntroMessage('');
  };

  if (loading) {
    return (
      <WithUScreen>
        <WithUTopBar
          title="Volontärer"
          subtitle="Tryggt stöd när du behöver det."
          right={<WithUAvatar emoji="💚" size={34} />}
        />
        <WithUPage style={styles.pageOnly}>
          <View style={styles.stateCard}>
            <ActivityIndicator size="large" color={withuColors.teal} />
            <Text style={styles.stateTitle}>Laddar volontärer...</Text>
            <Text style={styles.stateText}>Vi kollar vilka som är aktiva just nu.</Text>
          </View>
        </WithUPage>
      </WithUScreen>
    );
  }

  return (
    <WithUScreen>
      <WithUTopBar
        title="Volontärer"
        subtitle="Tryggt stöd när du behöver det."
        right={<WithUAvatar emoji="💚" size={34} />}
      />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
        showsVerticalScrollIndicator={false}
      >
        <WithUPage style={styles.page}>
          <View style={styles.heroCard}>
            <Text style={styles.heroTitle}>Prata med en volontär</Text>
            <Text style={styles.heroText}>
              Här ser du volontärer som är aktiva just nu. Du behöver inte matcha.
              Skicka en hjälpfråga så väljer volontären om den kan hjälpa dig.
            </Text>
          </View>

          {myApplication ? (
            <Pressable
              style={styles.applicationStatusCard}
              onPress={() => router.push('/volunteers/apply')}
            >
              <Text style={styles.applicationStatusKicker}>Din volontäransökan</Text>
              <Text style={styles.applicationStatusTitle}>
                {getApplicationStatusTitle(myApplication.status)}
              </Text>
              <Text style={styles.applicationStatusMeta}>
                {(myApplication.role_sv || 'Volontär')} · skickad{' '}
                {formatApplicationDate(myApplication.submitted_at || myApplication.created_at)}
              </Text>
              <Text style={styles.applicationStatusText}>
                {getApplicationStatusText(myApplication.status)}
              </Text>
            </Pressable>
          ) : (
            <Pressable
              style={styles.applyVolunteerCard}
              onPress={() => router.push('/volunteers/apply')}
            >
              <View style={styles.applyVolunteerIcon}>
                <Text style={styles.applyVolunteerEmoji}>🤝</Text>
              </View>
              <View style={styles.applyVolunteerTextWrap}>
                <Text style={styles.applyVolunteerTitle}>Vill du hjälpa andra?</Text>
                <Text style={styles.applyVolunteerText}>
                  Ansök som volontär och syns här när admin har godkänt dig.
                </Text>
              </View>
              <Text style={styles.applyVolunteerArrow}>›</Text>
            </Pressable>
          )}

          {errorText ? (
            <View style={styles.stateCard}>
              <Text style={styles.stateTitle}>Något gick fel</Text>
              <Text style={styles.stateText}>{errorText}</Text>
            </View>
          ) : volunteers.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyEmoji}>💙</Text>
              <Text style={styles.emptyTitle}>Inga volontärer tillgängliga just nu</Text>
              <Text style={styles.emptyText}>
                Ingen volontär är aktiv just nu. Prova igen om en stund eller dela en tanke i Tankar.
              </Text>

              <Pressable
                style={styles.secondaryAction}
                onPress={() => router.push('/(tabs)/explore' as any)}
              >
                <Text style={styles.secondaryActionText}>Öppna Tankar</Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.listWrap}>
              {volunteers.map((volunteer) => {
                const request = requestMap.get(volunteer.volunteer_user_id);
                const isPending = request?.status === 'pending';
                const isAccepted = request?.status === 'accepted';
                const isDeclined = request?.status === 'declined';
                const canOpenChat = isAccepted && !!request?.conversation_key;
                const slotsLeft = getSlotsLeft(volunteer);
                const isFull = slotsLeft <= 0;

                return (
                  <View key={volunteer.availability_id} style={styles.volunteerCard}>
                    <View style={styles.topRow}>
                      <WithUAvatar emoji={volunteer.avatar_emoji || '🙂'} size={60} />

                      <View style={styles.topText}>
                        <Text style={styles.nameText}>{volunteer.name || 'Volontär'}</Text>

                        <Text style={styles.metaText}>
                          {volunteer.city || 'Plats saknas'}
                          {volunteer.role_sv ? ` · ${volunteer.role_sv}` : ''}
                        </Text>

                        <View style={styles.badgesRow}>
                          <View style={styles.activeBadge}>
                            <Text style={styles.activeBadgeText}>💚 Aktiv nu</Text>
                          </View>

                          {volunteer.is_bankid_verified ? (
                            <View style={styles.bankIdBadge}>
                              <Text style={styles.bankIdBadgeText}>✓ BankID</Text>
                            </View>
                          ) : null}
                        </View>
                      </View>
                    </View>

                    {!!volunteer.message && (
                      <View style={styles.messageBox}>
                        <Text style={styles.messageText}>{volunteer.message}</Text>
                      </View>
                    )}

                    <View style={styles.infoRow}>
                      <Text style={styles.infoLabel}>
                        {formatRemaining(volunteer.active_until, tick)}
                      </Text>
                      <Text style={styles.infoValue}>
                        Platser kvar: {slotsLeft}/{volunteer.max_pending_requests}
                      </Text>
                    </View>

                    {canOpenChat ? (
                      <Pressable
                        style={styles.primaryAction}
                        onPress={() =>
                          router.push({
                            pathname: '/chat/[conversationKey]',
                            params: { conversationKey: request?.conversation_key as string },
                          })
                        }
                      >
                        <Text style={styles.primaryActionText}>💬 Öppna chatt</Text>
                      </Pressable>
                    ) : isAccepted ? (
                      <View style={styles.acceptedState}>
                        <Text style={styles.acceptedStateText}>
                          ✅ Volontären har godkänt din förfrågan
                        </Text>
                      </View>
                    ) : isPending ? (
                      <View style={styles.pendingState}>
                        <Text style={styles.pendingStateText}>
                          ⏳ Skickad · väntar på svar
                        </Text>
                      </View>
                    ) : isFull ? (
                      <View style={styles.fullState}>
                        <Text style={styles.fullStateText}>Volontären är full just nu</Text>
                      </View>
                    ) : (
                      <Pressable
                        style={styles.primaryAction}
                        onPress={() => openSupportModal(volunteer)}
                      >
                        <Text style={styles.primaryActionText}>💚 Skicka hjälpfråga</Text>
                      </Pressable>
                    )}

                    {isDeclined ? (
                      <View style={styles.retryBox}>
                        <Text style={styles.declinedText}>
                          Den senaste förfrågan blev nekad. Du kan prova igen senare eller välja en annan volontär.
                        </Text>

                        {!isFull ? (
                          <Pressable
                            style={styles.retryButton}
                            onPress={() => openSupportModal(volunteer)}
                          >
                            <Text style={styles.retryButtonText}>Försök igen</Text>
                          </Pressable>
                        ) : null}
                      </View>
                    ) : null}
                  </View>
                );
              })}
            </View>
          )}
        </WithUPage>
      </ScrollView>

      <Modal
        visible={!!selectedVolunteer}
        transparent
        animationType="slide"
        onRequestClose={closeModal}
      >
        <View style={styles.modalOverlay}>
          <Pressable style={styles.modalBackdrop} onPress={closeModal} />

          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            keyboardVerticalOffset={20}
            style={styles.modalKeyboardWrap}
          >
            <View style={styles.modalSheet}>
              <View style={styles.modalHandle} />

              <ScrollView
                style={styles.modalScroll}
                contentContainerStyle={styles.modalScrollContent}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
              >
                <Text style={styles.modalTitle}>Skicka hjälpfråga</Text>

                <Text style={styles.modalText}>
                  {selectedVolunteer?.name || 'Volontären'} får välja om den kan hjälpa dig just nu.
                </Text>

                <Text style={styles.modalLabel}>Vad behöver du hjälp med?</Text>

                <TextInput
                  value={introMessage}
                  onChangeText={setIntroMessage}
                  placeholder="Till exempel: Jag behöver någon att prata med just nu..."
                  placeholderTextColor="#8A97B8"
                  multiline
                  textAlignVertical="top"
                  style={styles.modalInput}
                  maxLength={220}
                  autoFocus
                />

                <Text style={styles.counterText}>{introMessage.trim().length}/220</Text>
              </ScrollView>

              <View style={styles.modalActions}>
                <Pressable
                  style={styles.cancelButton}
                  onPress={closeModal}
                  disabled={sending}
                >
                  <Text style={styles.cancelButtonText}>Avbryt</Text>
                </Pressable>

                <Pressable
                  style={[
                    styles.sendButton,
                    (sending || introMessage.trim().length < 3) && styles.disabledButton,
                  ]}
                  onPress={handleSendRequest}
                  disabled={sending || introMessage.trim().length < 3}
                >
                  <Text style={styles.sendButtonText}>
                    {sending ? 'Skickar...' : 'Skicka fråga'}
                  </Text>
                </Pressable>
              </View>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
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
    fontSize: 28,
    fontWeight: '900',
    color: '#20325E',
    marginBottom: 8,
  },
  heroText: {
    fontSize: 15,
    lineHeight: 24,
    color: '#5B6785',
  },
  applicationStatusCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: withuRadius.xl,
    borderWidth: 1,
    borderColor: '#DCE4F3',
    padding: withuSpacing.lg,
    marginBottom: 14,
    ...withuShadows.card,
  },
  applicationStatusKicker: {
    color: withuColors.teal,
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0.4,
    marginBottom: 6,
    textTransform: 'uppercase',
  },
  applicationStatusTitle: {
    color: '#20325E',
    fontSize: 21,
    fontWeight: '900',
    marginBottom: 4,
  },
  applicationStatusMeta: {
    color: '#6F7B99',
    fontSize: 13,
    fontWeight: '800',
    marginBottom: 8,
  },
  applicationStatusText: {
    color: '#5B6785',
    fontSize: 14,
    lineHeight: 21,
  },
  applyVolunteerCard: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: withuRadius.xl,
    borderWidth: 1,
    borderColor: '#DCE4F3',
    flexDirection: 'row',
    gap: 12,
    marginBottom: 14,
    padding: withuSpacing.lg,
    ...withuShadows.card,
  },
  applyVolunteerIcon: {
    alignItems: 'center',
    backgroundColor: '#E8F7F3',
    borderRadius: 20,
    height: 54,
    justifyContent: 'center',
    width: 54,
  },
  applyVolunteerEmoji: {
    fontSize: 26,
  },
  applyVolunteerTextWrap: {
    flex: 1,
  },
  applyVolunteerTitle: {
    color: '#20325E',
    fontSize: 18,
    fontWeight: '900',
    marginBottom: 3,
  },
  applyVolunteerText: {
    color: '#5B6785',
    fontSize: 13,
    lineHeight: 19,
  },
  applyVolunteerArrow: {
    color: '#20325E',
    fontSize: 32,
    fontWeight: '500',
  },
  listWrap: {
    gap: 12,
  },
  volunteerCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: withuRadius.xl,
    borderWidth: 1,
    borderColor: '#E6EAF4',
    padding: withuSpacing.lg,
    ...withuShadows.card,
  },
  topRow: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
    marginBottom: 12,
  },
  topText: {
    flex: 1,
  },
  nameText: {
    fontSize: 20,
    fontWeight: '900',
    color: '#20325E',
    marginBottom: 2,
  },
  metaText: {
    fontSize: 13,
    color: withuColors.muted,
    marginBottom: 8,
  },
  badgesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  activeBadge: {
    backgroundColor: '#E8F7F3',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  activeBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: withuColors.teal,
  },
  bankIdBadge: {
    backgroundColor: '#EEF4FF',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  bankIdBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#20325E',
  },
  messageBox: {
    backgroundColor: '#F7FAFD',
    borderRadius: withuRadius.lg,
    borderWidth: 1,
    borderColor: '#E6EAF4',
    padding: 12,
    marginBottom: 10,
  },
  messageText: {
    fontSize: 14,
    lineHeight: 22,
    color: '#33415C',
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 12,
  },
  infoLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: withuColors.teal,
  },
  infoValue: {
    fontSize: 12,
    fontWeight: '700',
    color: withuColors.muted,
  },
  primaryAction: {
    width: '100%',
    minHeight: 54,
    backgroundColor: '#E05C4B',
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  primaryActionText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '900',
    textAlign: 'center',
  },
  secondaryAction: {
    backgroundColor: '#F1F5FC',
    borderWidth: 1,
    borderColor: '#DCE4F3',
    minHeight: 50,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 6,
  },
  secondaryActionText: {
    color: '#20325E',
    fontSize: 15,
    fontWeight: '800',
  },
  pendingState: {
    backgroundColor: '#FFF7E8',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#F2D6A2',
    paddingVertical: 14,
    paddingHorizontal: 14,
  },
  pendingStateText: {
    color: '#9C640C',
    fontSize: 14,
    fontWeight: '800',
    textAlign: 'center',
  },
  acceptedState: {
    backgroundColor: '#E8F7F3',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#B7E4D7',
    paddingVertical: 14,
    paddingHorizontal: 14,
  },
  acceptedStateText: {
    color: withuColors.teal,
    fontSize: 14,
    fontWeight: '800',
    textAlign: 'center',
  },
  fullState: {
    backgroundColor: '#F3F4F6',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    paddingVertical: 14,
    paddingHorizontal: 14,
  },
  fullStateText: {
    color: '#6B7280',
    fontSize: 14,
    fontWeight: '800',
    textAlign: 'center',
  },
  retryBox: {
    marginTop: 10,
  },
  declinedText: {
    fontSize: 12,
    lineHeight: 18,
    color: '#8A6A2F',
    marginBottom: 8,
  },
  retryButton: {
    minHeight: 42,
    borderRadius: 14,
    backgroundColor: '#F1F5FC',
    borderWidth: 1,
    borderColor: '#DCE4F3',
    alignItems: 'center',
    justifyContent: 'center',
  },
  retryButtonText: {
    color: '#20325E',
    fontSize: 14,
    fontWeight: '800',
  },
  emptyCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: withuRadius.xl,
    borderWidth: 1,
    borderColor: '#E6EAF4',
    padding: withuSpacing.xxl,
    alignItems: 'center',
    ...withuShadows.card,
  },
  emptyEmoji: {
    fontSize: 36,
    marginBottom: 10,
  },
  emptyTitle: {
    fontSize: 24,
    fontWeight: '900',
    color: '#20325E',
    textAlign: 'center',
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 15,
    lineHeight: 24,
    color: '#5B6785',
    textAlign: 'center',
    marginBottom: 16,
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
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(20,28,45,0.30)',
  },
  modalBackdrop: {
    flex: 1,
  },
  modalKeyboardWrap: {
    width: '100%',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderWidth: 1,
    borderColor: '#E6EAF4',
    maxHeight: '82%',
    minHeight: 420,
  },
  modalHandle: {
    alignSelf: 'center',
    width: 48,
    height: 5,
    borderRadius: 999,
    backgroundColor: '#D7DDEB',
    marginTop: 10,
    marginBottom: 8,
  },
  modalScroll: {
    flexGrow: 0,
  },
  modalScrollContent: {
    paddingHorizontal: 20,
    paddingTop: 6,
    paddingBottom: 14,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: '#20325E',
    marginBottom: 8,
  },
  modalText: {
    fontSize: 14,
    lineHeight: 22,
    color: '#5B6785',
    marginBottom: 14,
  },
  modalLabel: {
    fontSize: 14,
    fontWeight: '800',
    color: '#20325E',
    marginBottom: 8,
  },
  modalInput: {
    minHeight: 140,
    borderRadius: 16,
    backgroundColor: '#F4F6FB',
    borderWidth: 1,
    borderColor: '#DCE4F3',
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: '#20325E',
    fontSize: 15,
    marginBottom: 8,
  },
  counterText: {
    fontSize: 12,
    color: '#7A8AAA',
    textAlign: 'right',
    fontWeight: '700',
  },
  modalActions: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: Platform.OS === 'ios' ? 26 : 16,
    borderTopWidth: 1,
    borderTopColor: '#ECEEF4',
    backgroundColor: '#FFFFFF',
  },
  cancelButton: {
    flex: 1,
    minHeight: 54,
    borderRadius: 16,
    backgroundColor: '#EEF2F7',
    borderWidth: 1,
    borderColor: '#D6DFEE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButtonText: {
    color: '#20325E',
    fontSize: 16,
    fontWeight: '800',
  },
  sendButton: {
    flex: 1,
    minHeight: 54,
    borderRadius: 16,
    backgroundColor: '#E05C4B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '900',
  },
  disabledButton: {
    opacity: 0.45,
  },
});
