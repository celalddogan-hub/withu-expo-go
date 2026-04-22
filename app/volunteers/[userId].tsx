import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '../../src/lib/supabase';
import { ensureMatchedConversation } from '../../src/lib/matchChat';
import {
  withuColors,
  withuRadius,
  withuShadows,
  withuSpacing,
} from '../../src/theme/withuTheme';
import {
  WithUAvatar,
  WithUPage,
  WithUPrimaryButton,
  WithUScreen,
  WithUTopBar,
} from '../../src/components/withu/WithUPrimitives';

type ActiveVolunteerRow = {
  user_id: string;
  application_id: string | null;
  role_sv: string | null;
  bio_sv: string | null;
  tags: string[] | null;
  age_groups: string[] | null;
  weekly_hours: number | null;
  is_active: boolean;
  available_now: boolean;
  available_until: string | null;
  total_sessions: number | null;
  rating_count: number | null;
  rating_average: number | null;
  approved_at: string | null;
  name: string | null;
  age: number | null;
  city: string | null;
  avatar_url: string | null;
  avatar_emoji: string | null;
  is_bankid_verified: boolean | null;
};

type ContactRequestRow = {
  id: string;
  requester_user_id: string;
  volunteer_user_id: string;
  volunteer_application_id: string | null;
  message: string | null;
  status: 'pending' | 'accepted' | 'declined' | 'closed';
  created_at: string | null;
  updated_at: string | null;
  accepted_at: string | null;
  declined_at: string | null;
  closed_at: string | null;
};

function getAvatarEmoji(role?: string | null, fallback?: string | null) {
  if (fallback && fallback.trim()) return fallback;

  const value = (role || '').toLowerCase();

  if (value.includes('promenad')) return '🚶';
  if (value.includes('senior')) return '🌿';
  if (value.includes('chatt')) return '💬';
  if (value.includes('samtal')) return '🫶';

  return '🤝';
}

function getMinutesLeft(value?: string | null) {
  if (!value) return 0;
  const diff = new Date(value).getTime() - Date.now();
  return Math.max(0, Math.ceil(diff / 60000));
}

function formatShortDate(value?: string | null) {
  if (!value) return 'Okänt datum';

  const date = new Date(value);

  return date.toLocaleDateString('sv-SE', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function formatDateTime(value?: string | null) {
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

function getRequestStatusLabel(status?: string | null) {
  if (status === 'accepted') return 'Godkänd kontakt';
  if (status === 'declined') return 'Nekad';
  if (status === 'closed') return 'Stängd';
  return 'Skickad';
}

function getRequestStatusStyle(status?: string | null) {
  if (status === 'accepted') {
    return {
      backgroundColor: '#EAF5F1',
      borderColor: '#B8DDD5',
      textColor: '#166534',
    };
  }

  if (status === 'declined') {
    return {
      backgroundColor: '#FCEAEA',
      borderColor: '#F2C8C8',
      textColor: '#B42318',
    };
  }

  if (status === 'closed') {
    return {
      backgroundColor: '#F4F6FA',
      borderColor: '#D6DCE8',
      textColor: '#475569',
    };
  }

  return {
    backgroundColor: '#FFF7E8',
    borderColor: '#F1DEC2',
    textColor: '#A16207',
  };
}

export default function VolunteerProfileScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ userId?: string }>();
  const userId = typeof params.userId === 'string' ? params.userId : '';

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [openingChat, setOpeningChat] = useState(false);
  const [errorText, setErrorText] = useState('');
  const [currentUserId, setCurrentUserId] = useState('');
  const [volunteer, setVolunteer] = useState<ActiveVolunteerRow | null>(null);
  const [latestRequest, setLatestRequest] = useState<ContactRequestRow | null>(null);
  const [draftMessage, setDraftMessage] = useState('');

  const loadVolunteer = useCallback(async () => {
    if (!userId) {
      setErrorText('Kunde inte hitta volontären.');
      setLoading(false);
      setRefreshing(false);
      return;
    }

    try {
      setErrorText('');

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError) throw userError;
      if (!user) throw new Error('Du måste logga in.');

      setCurrentUserId(user.id);

      const [
        { data: volunteerRow, error: volunteerError },
        { data: requestRows, error: requestError },
      ] = await Promise.all([
        supabase
          .from('active_volunteers_view')
          .select('*')
          .eq('user_id', userId)
          .maybeSingle(),

        supabase
          .from('volunteer_contact_requests')
          .select('*')
          .eq('requester_user_id', user.id)
          .eq('volunteer_user_id', userId)
          .order('created_at', { ascending: false })
          .limit(1),
      ]);

      if (volunteerError) throw volunteerError;
      if (requestError) throw requestError;

      if (!volunteerRow) {
        setVolunteer(null);
        setLatestRequest(null);
        setErrorText('Volontären hittades inte.');
        return;
      }

      const request = ((requestRows ?? []) as ContactRequestRow[])[0] ?? null;

      setVolunteer(volunteerRow as ActiveVolunteerRow);
      setLatestRequest(request);

      if (request?.message) {
        setDraftMessage(request.message);
      } else {
        setDraftMessage('');
      }
    } catch (error: any) {
      setVolunteer(null);
      setLatestRequest(null);
      setErrorText(error?.message || 'Kunde inte ladda volontären.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [userId]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      loadVolunteer();
    }, [loadVolunteer])
  );

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadVolunteer();
  };

  const liveNow = useMemo(() => {
    if (!volunteer?.available_now || !volunteer?.available_until) return false;
    return new Date(volunteer.available_until).getTime() > Date.now();
  }, [volunteer]);

  const canSendRequest = useMemo(() => {
    if (!volunteer) return false;
    if (!currentUserId) return false;
    if (currentUserId === volunteer.user_id) return false;
    if (latestRequest?.status === 'pending') return false;
    if (latestRequest?.status === 'accepted') return false;
    return true;
  }, [volunteer, currentUserId, latestRequest]);

  const handleSendRequest = async () => {
    if (!volunteer || !currentUserId) return;

    if (currentUserId === volunteer.user_id) {
      Alert.alert('Egen profil', 'Du kan inte skicka en förfrågan till dig själv.');
      return;
    }

    if (!canSendRequest) {
      Alert.alert('Redan skickad', 'Det finns redan en aktiv kontaktförfrågan.');
      return;
    }

    try {
      setSubmitting(true);

      const { error } = await supabase.from('volunteer_contact_requests').insert({
        requester_user_id: currentUserId,
        volunteer_user_id: volunteer.user_id,
        volunteer_application_id: volunteer.application_id,
        message: draftMessage.trim() || null,
        status: 'pending',
        updated_at: new Date().toISOString(),
      });

      if (error) throw error;

      await loadVolunteer();

      Alert.alert(
        'Förfrågan skickad',
        'Din kontaktförfrågan är nu skickad till volontären.'
      );
    } catch (error: any) {
      Alert.alert('Kunde inte skicka', error?.message || 'Något gick fel.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleOpenChat = async () => {
    if (!volunteer || !currentUserId || !latestRequest || latestRequest.status !== 'accepted') {
      return;
    }

    try {
      setOpeningChat(true);

      const introMessage =
        latestRequest.message?.trim()
          ? `Hej! Vi har nu en godkänd volontärkontakt. Du skrev först: "${latestRequest.message.trim()}" 👋`
          : 'Hej! Nu är er volontärkontakt godkänd 👋';

      const { conversationKey } = await ensureMatchedConversation(
        currentUserId,
        volunteer.user_id,
        introMessage
      );

      router.push({
        pathname: '/chat/[conversationKey]',
        params: { conversationKey },
      });
    } catch (error: any) {
      Alert.alert('Kunde inte öppna chatten', error?.message || 'Något gick fel.');
    } finally {
      setOpeningChat(false);
    }
  };

  if (loading) {
    return (
      <WithUScreen>
        <WithUTopBar
          title="Volontär"
          subtitle="Profil"
          right={<WithUAvatar emoji="🤝" size={34} />}
        />
        <WithUPage style={styles.pageOnly}>
          <View style={styles.stateCard}>
            <ActivityIndicator size="large" color={withuColors.coral} />
            <Text style={styles.stateTitle}>Laddar profil...</Text>
            <Text style={styles.stateText}>Vi hämtar volontärens information.</Text>
          </View>
        </WithUPage>
      </WithUScreen>
    );
  }

  if (errorText || !volunteer) {
    return (
      <WithUScreen>
        <WithUTopBar
          title="Volontär"
          subtitle="Profil"
          right={<WithUAvatar emoji="🤝" size={34} />}
        />
        <WithUPage style={styles.pageOnly}>
          <View style={styles.stateCard}>
            <Text style={styles.stateTitle}>Kunde inte ladda</Text>
            <Text style={styles.stateText}>{errorText || 'Volontären hittades inte.'}</Text>
            <WithUPrimaryButton title="Försök igen" onPress={loadVolunteer} />
            <WithUPrimaryButton
              title="Tillbaka"
              onPress={() => router.back()}
              style={styles.secondaryButton}
            />
          </View>
        </WithUPage>
      </WithUScreen>
    );
  }

  const statusStyle = getRequestStatusStyle(latestRequest?.status);

  return (
    <WithUScreen>
      <WithUTopBar
        title="Volontär"
        subtitle="Profil"
        right={<WithUAvatar emoji="🤝" size={34} />}
      />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
        showsVerticalScrollIndicator={false}
      >
        <WithUPage style={styles.page}>
          <View style={styles.heroCard}>
            <WithUAvatar
              emoji={getAvatarEmoji(volunteer.role_sv, volunteer.avatar_emoji)}
              size={74}
            />

            <Text style={styles.nameText}>
              {volunteer.name || 'Volontär'}
              {volunteer.age ? `, ${volunteer.age}` : ''}
            </Text>

            <Text style={styles.metaText}>
              {volunteer.city || 'Plats saknas'} · {volunteer.role_sv || 'Roll saknas'}
            </Text>

            <View style={styles.badgeRow}>
              {volunteer.is_bankid_verified ? (
                <View style={styles.bankIdBadge}>
                  <Text style={styles.bankIdBadgeText}>✓ BankID-verifierad</Text>
                </View>
              ) : null}

              {liveNow ? (
                <View style={styles.liveBadge}>
                  <Text style={styles.liveBadgeText}>LIVE NU</Text>
                </View>
              ) : (
                <View style={styles.normalBadge}>
                  <Text style={styles.normalBadgeText}>Godkänd volontär</Text>
                </View>
              )}
            </View>
          </View>

          <View style={styles.infoCard}>
            <Text style={styles.sectionTitle}>Om volontären</Text>
            <Text style={styles.bioText}>
              {volunteer.bio_sv || 'Ingen bio har lagts till ännu.'}
            </Text>
          </View>

          {(volunteer.tags ?? []).length > 0 ? (
            <View style={styles.infoCard}>
              <Text style={styles.sectionTitle}>Taggar</Text>
              <View style={styles.tagWrap}>
                {(volunteer.tags ?? []).map((tag) => (
                  <View key={tag} style={styles.greenTag}>
                    <Text style={styles.greenTagText}>{tag}</Text>
                  </View>
                ))}
              </View>
            </View>
          ) : null}

          {(volunteer.age_groups ?? []).length > 0 ? (
            <View style={styles.infoCard}>
              <Text style={styles.sectionTitle}>Stöttar åldersgrupper</Text>
              <View style={styles.tagWrap}>
                {(volunteer.age_groups ?? []).map((group) => (
                  <View key={group} style={styles.blueTag}>
                    <Text style={styles.blueTagText}>{group}</Text>
                  </View>
                ))}
              </View>
            </View>
          ) : null}

          <View style={styles.infoCard}>
            <Text style={styles.sectionTitle}>Info</Text>

            <Text style={styles.infoLine}>
              Godkänd: {formatShortDate(volunteer.approved_at)}
            </Text>

            <Text style={styles.infoLine}>
              Timmar per vecka: {volunteer.weekly_hours ?? 0}
            </Text>

            <Text style={styles.infoLine}>
              Samtal: {volunteer.total_sessions ?? 0}
            </Text>

            <Text style={styles.infoLine}>
              Betyg: {(volunteer.rating_average ?? 0).toFixed(1)}
            </Text>

            {liveNow && volunteer.available_until ? (
              <Text style={styles.liveTimeText}>
                Tillgänglig cirka {getMinutesLeft(volunteer.available_until)} min till
              </Text>
            ) : (
              <Text style={styles.infoLine}>Inte live just nu</Text>
            )}
          </View>

          <View style={styles.infoCard}>
            <Text style={styles.sectionTitle}>Skicka kontaktförfrågan</Text>
            <Text style={styles.helpText}>
              Skriv gärna ett kort meddelande. När volontären godkänner kan ni öppna samma chatt här.
            </Text>

            <TextInput
              value={draftMessage}
              onChangeText={setDraftMessage}
              placeholder="Hej, jag skulle vilja prata en stund..."
              placeholderTextColor={withuColors.muted}
              multiline
              style={styles.input}
              editable={canSendRequest && !submitting}
            />

            {latestRequest ? (
              <View
                style={[
                  styles.requestStatusBox,
                  {
                    backgroundColor: statusStyle.backgroundColor,
                    borderColor: statusStyle.borderColor,
                  },
                ]}
              >
                <Text style={[styles.requestStatusTitle, { color: statusStyle.textColor }]}>
                  {getRequestStatusLabel(latestRequest.status)}
                </Text>

                <Text style={[styles.requestStatusText, { color: statusStyle.textColor }]}>
                  Skickad: {formatDateTime(latestRequest.created_at)}
                </Text>

                {latestRequest.message ? (
                  <Text style={[styles.requestStatusText, { color: statusStyle.textColor }]}>
                    Meddelande: {latestRequest.message}
                  </Text>
                ) : null}
              </View>
            ) : null}

            {latestRequest?.status === 'accepted' ? (
              <WithUPrimaryButton
                title={openingChat ? 'Öppnar chatt...' : 'Öppna chatt'}
                onPress={handleOpenChat}
                disabled={openingChat}
              />
            ) : (
              <WithUPrimaryButton
                title={
                  submitting
                    ? 'Skickar...'
                    : latestRequest?.status === 'pending'
                    ? 'Förfrågan redan skickad'
                    : liveNow
                    ? 'Skicka förfrågan nu'
                    : 'Skicka stödfråga'
                }
                onPress={handleSendRequest}
                disabled={!canSendRequest || submitting}
              />
            )}
          </View>

          <WithUPrimaryButton
            title="Tillbaka till volontärer"
            onPress={() => router.back()}
            style={styles.secondaryButton}
          />
        </WithUPage>
      </ScrollView>
    </WithUScreen>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
    backgroundColor: withuColors.cream,
  },
  content: {
    paddingBottom: 36,
  },
  page: {
    paddingTop: withuSpacing.lg,
  },
  pageOnly: {
    paddingTop: withuSpacing.xl,
  },
  heroCard: {
    backgroundColor: withuColors.white,
    borderRadius: withuRadius.xl,
    borderWidth: 1,
    borderColor: withuColors.line,
    padding: withuSpacing.xl,
    alignItems: 'center',
    marginBottom: 16,
    ...withuShadows.card,
  },
  nameText: {
    marginTop: 12,
    fontSize: 32,
    fontWeight: '900',
    color: withuColors.navy,
    textAlign: 'center',
  },
  metaText: {
    marginTop: 6,
    fontSize: 15,
    lineHeight: 24,
    color: withuColors.muted,
    textAlign: 'center',
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 14,
    justifyContent: 'center',
  },
  bankIdBadge: {
    backgroundColor: '#EAF5F1',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  bankIdBadgeText: {
    color: '#166534',
    fontSize: 12,
    fontWeight: '900',
  },
  liveBadge: {
    backgroundColor: '#FCEAEA',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  liveBadgeText: {
    color: '#B42318',
    fontSize: 12,
    fontWeight: '900',
  },
  normalBadge: {
    backgroundColor: '#EEF4FF',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  normalBadgeText: {
    color: '#1D4ED8',
    fontSize: 12,
    fontWeight: '900',
  },
  infoCard: {
    backgroundColor: withuColors.white,
    borderRadius: withuRadius.xl,
    borderWidth: 1,
    borderColor: withuColors.line,
    padding: withuSpacing.lg,
    marginBottom: 16,
    ...withuShadows.card,
  },
  sectionTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: withuColors.navy,
    marginBottom: 10,
  },
  bioText: {
    fontSize: 15,
    lineHeight: 24,
    color: '#334155',
  },
  helpText: {
    fontSize: 14,
    lineHeight: 22,
    color: withuColors.muted,
    marginBottom: 12,
  },
  infoLine: {
    fontSize: 15,
    lineHeight: 24,
    color: '#334155',
    marginBottom: 6,
  },
  tagWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  greenTag: {
    backgroundColor: '#EAF5F1',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  greenTagText: {
    color: '#166534',
    fontSize: 12,
    fontWeight: '800',
  },
  blueTag: {
    backgroundColor: '#EEF4FF',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  blueTagText: {
    color: '#1D4ED8',
    fontSize: 12,
    fontWeight: '800',
  },
  liveTimeText: {
    marginTop: 8,
    color: '#B42318',
    fontSize: 14,
    fontWeight: '900',
  },
  input: {
    minHeight: 110,
    borderRadius: withuRadius.lg,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: withuColors.navy,
    fontSize: 14,
    textAlignVertical: 'top',
    marginBottom: 14,
  },
  requestStatusBox: {
    borderRadius: withuRadius.lg,
    borderWidth: 1,
    padding: 12,
    marginBottom: 14,
  },
  requestStatusTitle: {
    fontSize: 16,
    fontWeight: '900',
    marginBottom: 6,
  },
  requestStatusText: {
    fontSize: 13,
    lineHeight: 20,
  },
  secondaryButton: {
    marginTop: 4,
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
    fontSize: 24,
    fontWeight: '900',
    marginBottom: 10,
    textAlign: 'center',
  },
  stateText: {
    color: '#555555',
    fontSize: 15,
    lineHeight: 24,
    textAlign: 'center',
    marginBottom: 14,
  },
});