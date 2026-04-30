import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import { createScopedRealtimeChannel, removeChannelSafely } from '../../lib/realtime';
import {
  acceptVolunteerSupportRequest,
  declineVolunteerSupportRequest,
  endMyVolunteerAvailability,
  getMyVolunteerStatus,
  listIncomingVolunteerRequests,
  refreshExpiredMyAvailability,
  setVolunteerActiveNow,
  type IncomingVolunteerSupportRequest,
} from '../../lib/volunteerSupport';
import {
  withuColors,
  withuRadius,
  withuShadows,
  withuSpacing,
} from '../../theme/withuTheme';

type Props = {
  userId: string;
};

function formatRemainingTime(activeUntil?: string | null, _tick?: number) {
  if (!activeUntil) return '—';

  const remainingMs = new Date(activeUntil).getTime() - Date.now();
  if (remainingMs <= 0) return '00:00';

  const totalSeconds = Math.floor(remainingMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  const mm = String(minutes).padStart(2, '0');
  const ss = String(seconds).padStart(2, '0');

  return `${mm}:${ss}`;
}

function firstName(name?: string | null) {
  if (!name) return 'Användare';
  return name.trim().split(' ')[0] || 'Användare';
}

export default function VolunteerStatusCard({ userId }: Props) {
  const router = useRouter();
  const channelRef = useRef<RealtimeChannel | null>(null);

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [processingRequestId, setProcessingRequestId] = useState('');
  const [isApprovedVolunteer, setIsApprovedVolunteer] = useState(false);
  const [roleSv, setRoleSv] = useState('Volontär');

  const [activeAvailabilityId, setActiveAvailabilityId] = useState<string | null>(null);
  const [activeUntil, setActiveUntil] = useState<string | null>(null);
  const [activeTitle, setActiveTitle] = useState('');
  const [activeMessage, setActiveMessage] = useState('');

  const [pendingRequests, setPendingRequests] = useState(0);
  const [acceptedOpenRequests, setAcceptedOpenRequests] = useState(0);
  const [incomingRequests, setIncomingRequests] = useState<IncomingVolunteerSupportRequest[]>(
    []
  );

  const [tick, setTick] = useState(0);

  const [draftTitle, setDraftTitle] = useState('Jag kan prata nu');
  const [draftMessage, setDraftMessage] = useState(
    'Jag är här och kan lyssna. Berätta gärna kort vad du behöver hjälp med.'
  );

  const loadStatus = useCallback(async () => {
    if (!userId) return;

    try {
      await refreshExpiredMyAvailability(userId);

      const [status, incoming] = await Promise.all([
        getMyVolunteerStatus(userId),
        listIncomingVolunteerRequests(userId),
      ]);

      setIsApprovedVolunteer(status.isApprovedVolunteer);
      setRoleSv(status.roleSv || 'Volontär');
      setActiveAvailabilityId(status.activeAvailability?.id ?? null);
      setActiveUntil(status.activeAvailability?.active_until ?? null);
      setActiveTitle(status.activeAvailability?.title ?? '');
      setActiveMessage(status.activeAvailability?.message ?? '');
      setPendingRequests(status.pendingRequests ?? 0);
      setAcceptedOpenRequests(status.acceptedOpenRequests ?? 0);
      setIncomingRequests(incoming ?? []);
    } catch {
      setIsApprovedVolunteer(false);
      setActiveAvailabilityId(null);
      setActiveUntil(null);
      setActiveTitle('');
      setActiveMessage('');
      setPendingRequests(0);
      setAcceptedOpenRequests(0);
      setIncomingRequests([]);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  const teardownRealtime = useCallback(async () => {
    const current = channelRef.current;
    channelRef.current = null;
    await removeChannelSafely(current);
  }, []);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      loadStatus();
    }, [loadStatus])
  );

  useEffect(() => {
    if (!userId) return;

    let cancelled = false;

    const startRealtime = async () => {
      await teardownRealtime();

      const channel = createScopedRealtimeChannel('volunteer-status-live', userId)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'volunteer_availability',
            filter: `volunteer_user_id=eq.${userId}`,
          },
          () => {
            loadStatus();
          }
        )
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'volunteer_support_requests',
            filter: `volunteer_user_id=eq.${userId}`,
          },
          () => {
            loadStatus();
          }
        );

      channel.subscribe((status) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          loadStatus();
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
  }, [userId, loadStatus, teardownRealtime]);

  useEffect(() => {
    if (!activeUntil) return;

    const timer = setInterval(() => {
      setTick((prev) => prev + 1);
    }, 1000);

    return () => clearInterval(timer);
  }, [activeUntil]);

  useEffect(() => {
    if (!userId) return;

    const syncInterval = setInterval(() => {
      loadStatus();
    }, 15000);

    return () => clearInterval(syncInterval);
  }, [userId, loadStatus]);

  const handleGoActive = async () => {
    if (!userId || busy) return;

    const title = draftTitle.trim();
    const message = draftMessage.trim();

    if (!title) {
      Alert.alert('Rubrik saknas', 'Skriv en kort rubrik för din volontärstatus.');
      return;
    }

    if (!message) {
      Alert.alert('Text saknas', 'Skriv en kort text så användaren vet vad du kan hjälpa med.');
      return;
    }

    try {
      setBusy(true);

      await setVolunteerActiveNow({
        userId,
        minutes: 60,
        title,
        message,
        maxPendingRequests: 5,
      });

      await loadStatus();
    } catch (error: any) {
      Alert.alert('Kunde inte aktivera volontärläge', error?.message || 'Något gick fel.');
    } finally {
      setBusy(false);
    }
  };

  const handleGoInactive = async () => {
    if (!userId || busy) return;

    try {
      setBusy(true);
      await endMyVolunteerAvailability(userId);
      await loadStatus();
    } catch (error: any) {
      Alert.alert('Kunde inte stänga av volontärläge', error?.message || 'Något gick fel.');
    } finally {
      setBusy(false);
    }
  };

  const handleAccept = async (requestId: string) => {
    if (!userId || processingRequestId) return;

    try {
      setProcessingRequestId(requestId);

      const result = await acceptVolunteerSupportRequest({
        requestId,
        volunteerUserId: userId,
      });

      await loadStatus();

      router.push({
        pathname: '/chat/[conversationKey]',
        params: { conversationKey: result.conversationKey },
      });
    } catch (error: any) {
      Alert.alert('Kunde inte acceptera', error?.message || 'Något gick fel.');
    } finally {
      setProcessingRequestId('');
    }
  };

  const handleDecline = async (requestId: string) => {
    if (!userId || processingRequestId) return;

    try {
      setProcessingRequestId(requestId);

      await declineVolunteerSupportRequest({
        requestId,
        volunteerUserId: userId,
      });

      await loadStatus();
    } catch (error: any) {
      Alert.alert('Kunde inte neka', error?.message || 'Något gick fel.');
    } finally {
      setProcessingRequestId('');
    }
  };

  const remainingText = useMemo(() => formatRemainingTime(activeUntil, tick), [activeUntil, tick]);

  if (loading) {
    return (
      <View style={styles.card}>
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="small" color={withuColors.teal} />
          <Text style={styles.loadingText}>Laddar volontärstatus...</Text>
        </View>
      </View>
    );
  }

  if (!isApprovedVolunteer) {
    return null;
  }

  const isActive = !!activeAvailabilityId;

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <View style={styles.headerTextWrap}>
          <Text style={styles.title}>Volontärstatus</Text>
          <Text style={styles.subtitle}>{roleSv}</Text>
        </View>

        <View style={styles.badge}>
          <Text style={styles.badgeText}>💚 Godkänd volontär</Text>
        </View>
      </View>

      {isActive ? (
        <>
          <View style={styles.activeBox}>
            <View style={styles.activeLeft}>
              <Text style={styles.activeEmoji}>💚</Text>
              <View style={styles.activeTextWrap}>
                <Text style={styles.activeTitle}>Du är tillgänglig nu</Text>
                <Text style={styles.activeSub}>
                  Andra användare kan nu skicka hjälpfrågor till dig
                </Text>
              </View>
            </View>

            <Pressable
              style={[styles.stopBtn, busy && styles.btnDisabled]}
              onPress={handleGoInactive}
              disabled={busy}
            >
              <Text style={styles.stopBtnText}>{busy ? '...' : 'Stäng av'}</Text>
            </Pressable>
          </View>

          <View style={styles.liveMessageCard}>
            <Text style={styles.liveLabel}>Din aktiva rubrik</Text>
            <Text style={styles.liveTitleText}>{activeTitle || 'Jag kan prata nu'}</Text>

            <Text style={styles.liveLabel}>Din aktiva text</Text>
            <Text style={styles.liveMessageText}>
              {activeMessage || 'Jag är här och kan lyssna.'}
            </Text>
          </View>

          <View style={styles.statsRow}>
            <View style={styles.statCard}>
              <Text style={styles.statNumber}>{remainingText}</Text>
              <Text style={styles.statLabel}>Tid kvar</Text>
            </View>

            <View style={styles.statCard}>
              <Text style={styles.statNumber}>{pendingRequests}</Text>
              <Text style={styles.statLabel}>Väntar</Text>
            </View>

            <View style={styles.statCard}>
              <Text style={styles.statNumber}>{acceptedOpenRequests}</Text>
              <Text style={styles.statLabel}>Accepterade</Text>
            </View>
          </View>

          <Text style={styles.helperNote}>
            Vill du ändra din text, stäng av volontärläge och publicera på nytt.
          </Text>
        </>
      ) : (
        <>
          <View style={styles.inactiveBox}>
            <Text style={styles.inactiveTitle}>Du är inte aktiv just nu</Text>
            <Text style={styles.inactiveText}>
              Fyll i hur du vill presentera dig och publicera sedan att du är aktiv nu.
            </Text>
          </View>

          <View style={styles.formBlock}>
            <Text style={styles.fieldLabel}>Kort rubrik</Text>
            <TextInput
              value={draftTitle}
              onChangeText={setDraftTitle}
              placeholder="Till exempel: Jag kan prata nu"
              placeholderTextColor={withuColors.muted}
              style={styles.input}
              maxLength={60}
            />

            <Text style={styles.fieldLabel}>Vad vill du visa för användaren?</Text>
            <TextInput
              value={draftMessage}
              onChangeText={setDraftMessage}
              placeholder="Skriv kort att du lyssnar och kan hjälpa just nu..."
              placeholderTextColor={withuColors.muted}
              multiline
              textAlignVertical="top"
              style={styles.textArea}
              maxLength={220}
            />
          </View>

          <Pressable
            style={[styles.goLiveBtn, busy && styles.btnDisabled]}
            onPress={handleGoActive}
            disabled={busy}
          >
            <Text style={styles.goLiveBtnText}>
              {busy ? 'Startar...' : '💚 Publicera att jag är aktiv nu'}
            </Text>
          </Pressable>
        </>
      )}

      <View style={styles.requestsSection}>
        <Text style={styles.requestsTitle}>Inkommande hjälpfrågor</Text>

        {incomingRequests.length === 0 ? (
          <View style={styles.noRequestsBox}>
            <Text style={styles.noRequestsText}>Inga nya hjälpfrågor just nu.</Text>
          </View>
        ) : (
          <View style={styles.requestsList}>
            {incomingRequests.map((request) => {
              const isProcessing = processingRequestId === request.id;

              return (
                <View key={request.id} style={styles.requestCard}>
                  <View style={styles.requestTop}>
                    <View style={styles.requestAvatar}>
                      <Text style={styles.requestAvatarText}>
                        {request.requester_avatar_emoji || '🙂'}
                      </Text>
                    </View>

                    <View style={styles.requestMeta}>
                      <Text style={styles.requestName}>
                        {firstName(request.requester_name)}
                      </Text>
                      <Text style={styles.requestSub}>
                        {request.requester_city || 'Plats saknas'}
                      </Text>
                    </View>

                    {request.requester_bankid_verified ? (
                      <View style={styles.requestBankIdBadge}>
                        <Text style={styles.requestBankIdBadgeText}>✓ BankID</Text>
                      </View>
                    ) : null}
                  </View>

                  {!!request.intro_message?.trim() && (
                    <View style={styles.requestMessageBox}>
                      <Text style={styles.requestMessageText}>
                        {request.intro_message.trim()}
                      </Text>
                    </View>
                  )}

                  <View style={styles.requestActions}>
                    <Pressable
                      style={[styles.acceptBtn, isProcessing && styles.btnDisabled]}
                      onPress={() => handleAccept(request.id)}
                      disabled={isProcessing}
                    >
                      <Text style={styles.acceptBtnText}>
                        {isProcessing ? '...' : 'Ja, hjälp'}
                      </Text>
                    </Pressable>

                    <Pressable
                      style={[styles.declineBtn, isProcessing && styles.btnDisabled]}
                      onPress={() => handleDecline(request.id)}
                      disabled={isProcessing}
                    >
                      <Text style={styles.declineBtnText}>Neka</Text>
                    </Pressable>
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: withuColors.white,
    borderRadius: withuRadius.xl,
    borderWidth: 1,
    borderColor: withuColors.line,
    padding: withuSpacing.lg,
    marginTop: 14,
    ...withuShadows.card,
  },
  loadingWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  loadingText: {
    color: withuColors.muted,
    fontSize: 14,
    fontWeight: '700',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 10,
    marginBottom: 12,
  },
  headerTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontSize: 18,
    fontWeight: '900',
    color: withuColors.navy,
    marginBottom: 3,
  },
  subtitle: {
    fontSize: 12,
    color: withuColors.muted,
    fontWeight: '700',
  },
  badge: {
    backgroundColor: withuColors.successBg,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    alignSelf: 'flex-start',
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: withuColors.success,
  },
  activeBox: {
    backgroundColor: withuColors.teal,
    borderRadius: withuRadius.lg,
    padding: 14,
    marginBottom: 12,
  },
  activeLeft: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 12,
    alignItems: 'center',
  },
  activeTextWrap: {
    flex: 1,
  },
  activeEmoji: {
    fontSize: 24,
  },
  activeTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: '#FFFFFF',
    marginBottom: 2,
  },
  activeSub: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.82)',
    lineHeight: 18,
  },
  stopBtn: {
    backgroundColor: '#FFFFFF',
    borderRadius: 999,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stopBtnText: {
    color: withuColors.teal,
    fontSize: 14,
    fontWeight: '900',
  },
  liveMessageCard: {
    backgroundColor: '#F7FAFD',
    borderRadius: withuRadius.lg,
    borderWidth: 1,
    borderColor: withuColors.line,
    padding: 12,
    marginBottom: 12,
  },
  liveLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: withuColors.muted,
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  liveTitleText: {
    fontSize: 15,
    fontWeight: '900',
    color: withuColors.navy,
    marginBottom: 10,
  },
  liveMessageText: {
    fontSize: 14,
    lineHeight: 22,
    color: '#33415C',
  },
  statsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#F4F6FA',
    borderRadius: withuRadius.lg,
    paddingVertical: 12,
    paddingHorizontal: 10,
    alignItems: 'center',
  },
  statNumber: {
    fontSize: 18,
    fontWeight: '900',
    color: withuColors.navy,
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: withuColors.muted,
  },
  helperNote: {
    marginTop: 10,
    fontSize: 12,
    lineHeight: 18,
    color: withuColors.muted,
  },
  inactiveBox: {
    backgroundColor: withuColors.tealBg,
    borderRadius: withuRadius.lg,
    padding: 14,
    marginBottom: 12,
  },
  inactiveTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: withuColors.navy,
    marginBottom: 4,
  },
  inactiveText: {
    fontSize: 13,
    lineHeight: 20,
    color: withuColors.muted,
  },
  formBlock: {
    marginBottom: 12,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '800',
    color: withuColors.navy,
    marginBottom: 8,
    marginTop: 4,
  },
  input: {
    minHeight: 50,
    borderRadius: 14,
    backgroundColor: '#F4F6FA',
    borderWidth: 1,
    borderColor: withuColors.line,
    paddingHorizontal: 12,
    color: withuColors.navy,
    fontSize: 14,
    marginBottom: 10,
  },
  textArea: {
    minHeight: 100,
    borderRadius: 14,
    backgroundColor: '#F4F6FA',
    borderWidth: 1,
    borderColor: withuColors.line,
    paddingHorizontal: 12,
    paddingVertical: 12,
    color: withuColors.navy,
    fontSize: 14,
    marginBottom: 2,
  },
  goLiveBtn: {
    width: '100%',
    minHeight: 56,
    backgroundColor: '#1C5E52',
    borderRadius: 18,
    paddingVertical: 16,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    marginBottom: 6,
  },
  goLiveBtnText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '900',
    textAlign: 'center',
  },
  requestsSection: {
    marginTop: 16,
  },
  requestsTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: withuColors.navy,
    marginBottom: 10,
  },
  noRequestsBox: {
    backgroundColor: '#F7FAFD',
    borderRadius: withuRadius.lg,
    borderWidth: 1,
    borderColor: withuColors.line,
    padding: 14,
  },
  noRequestsText: {
    fontSize: 13,
    lineHeight: 20,
    color: withuColors.muted,
  },
  requestsList: {
    gap: 10,
  },
  requestCard: {
    backgroundColor: '#F7FAFD',
    borderRadius: withuRadius.lg,
    borderWidth: 1,
    borderColor: withuColors.line,
    padding: 12,
  },
  requestTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
  },
  requestAvatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#EEF4FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  requestAvatarText: {
    fontSize: 20,
  },
  requestMeta: {
    flex: 1,
  },
  requestName: {
    fontSize: 14,
    fontWeight: '900',
    color: withuColors.navy,
    marginBottom: 2,
  },
  requestSub: {
    fontSize: 12,
    color: withuColors.muted,
  },
  requestBankIdBadge: {
    backgroundColor: withuColors.successBg,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  requestBankIdBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: withuColors.success,
  },
  requestMessageBox: {
    backgroundColor: '#FFFFFF',
    borderRadius: withuRadius.md,
    borderWidth: 1,
    borderColor: withuColors.line,
    padding: 10,
    marginBottom: 10,
  },
  requestMessageText: {
    fontSize: 13,
    lineHeight: 20,
    color: '#33415C',
  },
  requestActions: {
    flexDirection: 'row',
    gap: 8,
  },
  acceptBtn: {
    flex: 1,
    backgroundColor: withuColors.teal,
    borderRadius: 14,
    minHeight: 46,
    alignItems: 'center',
    justifyContent: 'center',
  },
  acceptBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '900',
  },
  declineBtn: {
    flex: 1,
    backgroundColor: '#FFF4F4',
    borderWidth: 1,
    borderColor: '#F2D1D1',
    borderRadius: 14,
    minHeight: 46,
    alignItems: 'center',
    justifyContent: 'center',
  },
  declineBtnText: {
    color: '#BB4C4C',
    fontSize: 14,
    fontWeight: '800',
  },
  btnDisabled: {
    opacity: 0.6,
  },
});
