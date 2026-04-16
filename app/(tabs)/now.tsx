import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
import { supabase } from '../../src/lib/supabase';
import {
  withuColors,
  withuRadius,
  withuShadows,
  withuSpacing,
} from '../../src/theme/withuTheme';
import {
  WithUAvatar,
  WithUBadge,
  WithUCard,
  WithUPage,
  WithUPrimaryButton,
  WithUSectionLabel,
  WithUScreen,
  WithUSubtitle,
  WithUTitle,
  WithUTopBar,
} from '../../src/components/withu/WithUPrimitives';

type OwnProfile = {
  id: string;
  name: string | null;
  city: string | null;
  activities: string[] | null;
  is_profile_complete: boolean | null;
};

type NowStatusRow = {
  id: string;
  user_id: string;
  activity: string;
  message: string | null;
  city: string | null;
  is_active: boolean;
  expires_at: string;
  created_at: string;
  updated_at: string;
};

type ProfileRow = {
  id: string;
  name: string | null;
  age: number | null;
  city: string | null;
  activities: string[] | null;
  avatar_emoji: string | null;
  is_bankid_verified: boolean | null;
};

type LiveCard = {
  user_id: string;
  activity: string;
  message: string | null;
  city: string | null;
  expires_at: string;
  profile: ProfileRow | null;
};

function getAvatarEmoji(activity?: string, fallback?: string | null) {
  if (fallback && fallback.trim()) return fallback;

  const value = (activity || '').toLowerCase();

  if (value.includes('kafé') || value.includes('fika') || value.includes('lunch')) return '☕';
  if (value.includes('promenad') || value.includes('löpning') || value.includes('cykling')) return '🚶';
  if (value.includes('plug') || value.includes('studie') || value.includes('språk') || value.includes('läxhjälp')) return '📚';
  if (value.includes('brädspel') || value.includes('rollspel') || value.includes('escape') || value.includes('dataspel') || value.includes('spela')) return '🎲';
  if (value.includes('yoga') || value.includes('gym') || value.includes('träning') || value.includes('padel')) return '💪';
  if (value.includes('konsert') || value.includes('film') || value.includes('utställning') || value.includes('foto')) return '🎬';
  if (value.includes('musik')) return '🎵';
  if (value.includes('mat') || value.includes('restaurang') || value.includes('baka') || value.includes('lunch')) return '🍽️';
  if (value.includes('språk')) return '🗣️';
  if (value.includes('telefon')) return '📞';
  if (value.includes('kultur')) return '🌍';
  if (value.includes('natur')) return '🌿';

  return '🙂';
}

function getActivityEmoji(activity?: string) {
  const value = (activity || '').toLowerCase();

  if (value.includes('kafé') || value.includes('fika')) return '☕';
  if (value.includes('lunch')) return '🍽️';
  if (value.includes('bara prata')) return '💬';
  if (value.includes('promenad')) return '🚶';
  if (value.includes('rollspel')) return '🎲';
  if (value.includes('escape')) return '🗝️';
  if (value.includes('brädspel')) return '🎯';
  if (value.includes('dataspel')) return '🎮';
  if (value.includes('läxhjälp')) return '📚';
  if (value.includes('språkbyte')) return '🗣️';
  if (value.includes('padel')) return '🏓';
  if (value.includes('löpning')) return '🏃';
  if (value.includes('foto')) return '📷';
  if (value.includes('kulturutbyte')) return '🌍';
  if (value.includes('telefonsamtal')) return '📞';
  if (value.includes('musik')) return '🎵';
  if (value.includes('träna')) return '💪';
  if (value.includes('studera')) return '📚';
  if (value.includes('natur')) return '🌿';

  return '✨';
}

function getMinutesLeft(expiresAt: string) {
  const diff = new Date(expiresAt).getTime() - Date.now();
  return Math.max(0, Math.ceil(diff / 60000));
}

export default function NowScreen() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deactivating, setDeactivating] = useState(false);

  const [currentUserId, setCurrentUserId] = useState('');
  const [ownProfile, setOwnProfile] = useState<OwnProfile | null>(null);
  const [myNowStatus, setMyNowStatus] = useState<NowStatusRow | null>(null);
  const [liveCards, setLiveCards] = useState<LiveCard[]>([]);

  const [selectedActivity, setSelectedActivity] = useState('');
  const [message, setMessage] = useState('');

  const [errorText, setErrorText] = useState('');
  const [missingProfileReason, setMissingProfileReason] = useState('');

  const availableActivities = useMemo(() => {
    return ownProfile?.activities ?? [];
  }, [ownProfile]);

  const loadNowData = useCallback(async () => {
    try {
      setErrorText('');
      setMissingProfileReason('');

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setErrorText('Du måste logga in för att använda Nu.');
        return;
      }

      setCurrentUserId(user.id);

      const { data: blockedRows, error: blockedError } = await supabase
        .from('blocked_users')
        .select('blockerad_av, blockerad')
        .or(`blockerad_av.eq.${user.id},blockerad.eq.${user.id}`);

      if (blockedError) throw blockedError;

      const blockedIds = new Set(
        (blockedRows ?? [])
          .map((row: any) =>
            row.blockerad_av === user.id ? row.blockerad : row.blockerad_av
          )
          .filter(Boolean)
      );

      const { data: ownData, error: ownError } = await supabase
        .from('profiles')
        .select('id, name, city, activities, is_profile_complete')
        .eq('id', user.id)
        .maybeSingle();

      if (ownError) throw ownError;

      const profile = (ownData as OwnProfile | null) ?? null;
      setOwnProfile(profile);

      if (!profile) {
        setMissingProfileReason(
          'Din profil hittades inte. Gå till Profil och spara din profil först.'
        );
        return;
      }

      if (profile.is_profile_complete === false) {
        setMissingProfileReason(
          'Din profil är inte klar ännu. Fyll i namn, stad och aktiviteter i Profil.'
        );
        return;
      }

      if (!profile.activities || profile.activities.length === 0) {
        setMissingProfileReason(
          'Välj minst en aktivitet i Profil innan du använder Nu.'
        );
        return;
      }

      const now = new Date().toISOString();

      const { data: myNowData, error: myNowError } = await supabase
        .from('now_status')
        .select('*')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .gt('expires_at', now)
        .maybeSingle();

      if (myNowError) throw myNowError;

      const myStatus = (myNowData as NowStatusRow | null) ?? null;
      setMyNowStatus(myStatus);

      if (myStatus) {
        setSelectedActivity(myStatus.activity);
        setMessage(myStatus.message ?? '');
      } else {
        setSelectedActivity((prev) => prev || profile.activities?.[0] || '');
      }

      const { data: liveData, error: liveError } = await supabase
        .from('now_status')
        .select('*')
        .neq('user_id', user.id)
        .eq('is_active', true)
        .gt('expires_at', now)
        .order('created_at', { ascending: false });

      if (liveError) throw liveError;

      const activeRows = ((liveData ?? []) as NowStatusRow[]).filter(
        (item) => !blockedIds.has(item.user_id)
      );

      if (activeRows.length === 0) {
        setLiveCards([]);
        return;
      }

      const profileIds = activeRows.map((item) => item.user_id);

      const { data: otherProfiles, error: profilesError } = await supabase
        .from('profiles')
        .select('id, name, age, city, activities, avatar_emoji, is_bankid_verified')
        .in('id', profileIds);

      if (profilesError) throw profilesError;

      const profileMap = new Map<string, ProfileRow>();
      ((otherProfiles ?? []) as ProfileRow[]).forEach((item) => {
        profileMap.set(item.id, item);
      });

      const merged: LiveCard[] = activeRows
        .map((item) => ({
          user_id: item.user_id,
          activity: item.activity,
          message: item.message,
          city: item.city,
          expires_at: item.expires_at,
          profile: profileMap.get(item.user_id) ?? null,
        }))
        .filter((item) => !!item.profile);

      setLiveCards(merged);
    } catch (error: any) {
      setErrorText(error?.message || 'Kunde inte ladda Nu-sidan.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      loadNowData();
    }, [loadNowData])
  );

  useEffect(() => {
    if (!selectedActivity && availableActivities.length > 0) {
      setSelectedActivity(availableActivities[0]);
    }
  }, [availableActivities, selectedActivity]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadNowData();
  };

  const handleActivate = async () => {
    if (!currentUserId || !ownProfile || saving) return;

    if (!selectedActivity) {
      Alert.alert('Välj aktivitet', 'Du behöver välja en aktivitet först.');
      return;
    }

    try {
      setSaving(true);

      const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();

      const payload = {
        user_id: currentUserId,
        activity: selectedActivity,
        message: message.trim() || null,
        city: ownProfile.city || null,
        is_active: true,
        expires_at: expiresAt,
      };

      const { error } = await supabase
        .from('now_status')
        .upsert(payload, { onConflict: 'user_id' });

      if (error) throw error;

      Alert.alert('Aktiverad', 'Din tillgänglighet är nu live i 60 minuter.');
      await loadNowData();
    } catch (error: any) {
      Alert.alert('Kunde inte aktivera', error?.message || 'Något gick fel.');
    } finally {
      setSaving(false);
    }
  };

  const handleDeactivate = async () => {
    if (!currentUserId || deactivating) return;

    try {
      setDeactivating(true);

      const { error } = await supabase
        .from('now_status')
        .update({
          is_active: false,
          expires_at: new Date().toISOString(),
        })
        .eq('user_id', currentUserId);

      if (error) throw error;

      Alert.alert('Avslutad', 'Du är inte längre live i Nu.');
      await loadNowData();
    } catch (error: any) {
      Alert.alert('Kunde inte avsluta', error?.message || 'Något gick fel.');
    } finally {
      setDeactivating(false);
    }
  };

  const minutesLeft = useMemo(() => {
    if (!myNowStatus) return 0;
    return getMinutesLeft(myNowStatus.expires_at);
  }, [myNowStatus]);

  if (loading) {
    return (
      <WithUScreen>
        <WithUTopBar
          title="WithU"
          subtitle="Du är aldrig ensam."
          right={<WithUAvatar emoji="😊" size={34} />}
        />
        <WithUPage style={styles.pageOnly}>
          <View style={styles.stateCard}>
            <ActivityIndicator size="large" color={withuColors.coral} />
            <Text style={styles.stateTitle}>Laddar Nu...</Text>
            <Text style={styles.stateText}>
              Vi hämtar din aktivitet och vilka som är live just nu.
            </Text>
          </View>
        </WithUPage>
      </WithUScreen>
    );
  }

  if (errorText) {
    return (
      <WithUScreen>
        <WithUTopBar
          title="WithU"
          subtitle="Du är aldrig ensam."
          right={<WithUAvatar emoji="😊" size={34} />}
        />
        <WithUPage style={styles.pageOnly}>
          <View style={styles.stateCard}>
            <Text style={styles.stateTitle}>Nu kunde inte laddas</Text>
            <Text style={styles.stateText}>{errorText}</Text>
            <WithUPrimaryButton title="Försök igen" onPress={loadNowData} />
          </View>
        </WithUPage>
      </WithUScreen>
    );
  }

  if (missingProfileReason) {
    return (
      <WithUScreen>
        <WithUTopBar
          title="WithU"
          subtitle="Du är aldrig ensam."
          right={<WithUAvatar emoji="😊" size={34} />}
        />
        <WithUPage style={styles.pageOnly}>
          <View style={styles.stateCard}>
            <Text style={styles.stateTitle}>Komplettera din profil</Text>
            <Text style={styles.stateText}>{missingProfileReason}</Text>
            <WithUPrimaryButton title="Ladda om" onPress={loadNowData} />
          </View>
        </WithUPage>
      </WithUScreen>
    );
  }

  return (
    <WithUScreen>
      <WithUTopBar
        title="WithU"
        subtitle="Du är aldrig ensam."
        right={<WithUAvatar emoji="😊" size={34} />}
      />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
        showsVerticalScrollIndicator={false}
      >
        <WithUPage style={styles.page}>
          <View style={styles.heroBlock}>
            <Text style={styles.heroTitle}>Nu</Text>
            <Text style={styles.heroSubtitle}>
              Dela vad du vill göra just nu i 60 minuter. Andra kan hitta dig snabbare när ni söker samma sak.
            </Text>
          </View>

          <WithUCard style={styles.mainCard}>
            <WithUSectionLabel>Jag är här nu</WithUSectionLabel>
            <WithUTitle style={styles.cardTitle}>Dela tillgänglighet i 60 minuter</WithUTitle>
            <WithUSubtitle>
              Välj aktivitet och skriv gärna ett kort meddelande. Det här sparas i Supabase och visas live för andra.
            </WithUSubtitle>

            <View style={styles.activitiesWrap}>
              {availableActivities.map((item) => {
                const selected = selectedActivity === item;

                return (
                  <Pressable
                    key={item}
                    onPress={() => setSelectedActivity(item)}
                    style={[
                      styles.activityChip,
                      selected && styles.activityChipSelected,
                    ]}
                  >
                    <Text
                      style={[
                        styles.activityChipText,
                        selected && styles.activityChipTextSelected,
                      ]}
                    >
                      {getActivityEmoji(item)} {item}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <Text style={styles.selectedText}>
              Vald aktivitet: {selectedActivity || 'Ingen vald ännu'}
            </Text>

            <Text style={styles.inputLabel}>Valfritt meddelande</Text>
            <TextInput
              value={message}
              onChangeText={setMessage}
              placeholder="Skriv något kort, t.ex. 'Tar gärna en kaffe efter jobbet'"
              placeholderTextColor={withuColors.muted}
              multiline
              style={styles.input}
              maxLength={160}
            />

            {myNowStatus ? (
              <View style={styles.liveStatusBox}>
                <View style={styles.liveStatusHeader}>
                  <Text style={styles.liveStatusTitle}>Du är live nu</Text>
                  <WithUBadge title={`${minutesLeft} min kvar`} variant="verified" />
                </View>

                <Text style={styles.liveStatusText}>
                  Aktivitet: {myNowStatus.activity}
                </Text>

                {!!myNowStatus.message && (
                  <Text style={styles.liveStatusText}>
                    Meddelande: {myNowStatus.message}
                  </Text>
                )}

                <View style={styles.liveButtonsRow}>
                  <WithUPrimaryButton
                    title={saving ? 'Uppdaterar...' : 'Uppdatera'}
                    onPress={handleActivate}
                    style={styles.liveButton}
                  />
                  <Pressable
                    style={[styles.stopButton, deactivating && styles.buttonDisabled]}
                    onPress={handleDeactivate}
                    disabled={deactivating}
                  >
                    <Text style={styles.stopButtonText}>
                      {deactivating ? 'Vänta...' : 'Avsluta'}
                    </Text>
                  </Pressable>
                </View>
              </View>
            ) : (
              <WithUPrimaryButton
                title={saving ? 'Aktiverar...' : 'Aktivera'}
                onPress={handleActivate}
                disabled={saving}
                style={styles.activateButton}
              />
            )}
          </WithUCard>

          <WithUCard>
            <View style={styles.liveHeader}>
              <View>
                <WithUSectionLabel>I närheten</WithUSectionLabel>
                <WithUTitle>Live just nu</WithUTitle>
              </View>
              <WithUBadge title="LIVE" variant="verified" />
            </View>

            <WithUSubtitle style={styles.liveSubtitle}>
              Första versionen använder stad och aktivitet för att visa relevanta personer.
            </WithUSubtitle>

            {liveCards.length === 0 ? (
              <View style={styles.emptyLiveBox}>
                <Text style={styles.emptyLiveTitle}>Ingen är live just nu</Text>
                <Text style={styles.emptyLiveText}>
                  När fler använder Nu kommer du se aktiva personer här direkt.
                </Text>
              </View>
            ) : (
              <View style={styles.liveCardsWrap}>
                {liveCards.map((item) => {
                  const profile = item.profile;
                  const avatarEmoji = getAvatarEmoji(
                    item.activity,
                    profile?.avatar_emoji
                  );

                  return (
                    <View key={item.user_id} style={styles.liveCard}>
                      <View style={styles.liveCardTop}>
                        <WithUAvatar emoji={avatarEmoji} size={54} />
                        <View style={styles.liveCardInfo}>
                          <Text style={styles.liveName}>
                            {profile?.name || 'Användare'}
                            {profile?.age ? `, ${profile.age}` : ''}
                          </Text>
                          <Text style={styles.liveMeta}>
                            {(item.city || profile?.city || 'Plats saknas') + ' · ' + item.activity}
                          </Text>
                        </View>

                        {profile?.is_bankid_verified ? (
                          <WithUBadge title="✓ BankID" variant="verified" />
                        ) : null}
                      </View>

                      {!!item.message && (
                        <Text style={styles.liveMessage}>{item.message}</Text>
                      )}

                      <Text style={styles.liveTime}>
                        Aktiv i cirka {getMinutesLeft(item.expires_at)} min till
                      </Text>
                    </View>
                  );
                })}
              </View>
            )}
          </WithUCard>
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
  heroBlock: {
    marginBottom: 18,
  },
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
  mainCard: {
    marginBottom: 18,
  },
  cardTitle: {
    marginBottom: 8,
  },
  activitiesWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 18,
    marginBottom: 14,
  },
  activityChip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 2,
    borderColor: withuColors.line,
    backgroundColor: withuColors.white,
  },
  activityChipSelected: {
    borderColor: withuColors.coral,
    backgroundColor: withuColors.coralBg,
  },
  activityChipText: {
    color: withuColors.navy,
    fontSize: 13,
    fontWeight: '800',
  },
  activityChipTextSelected: {
    color: withuColors.coral,
  },
  selectedText: {
    fontSize: 14,
    color: withuColors.navy,
    fontWeight: '700',
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: withuColors.muted,
    marginBottom: 10,
  },
  input: {
    minHeight: 110,
    borderRadius: withuRadius.lg,
    backgroundColor: withuColors.soft,
    borderWidth: 1,
    borderColor: withuColors.line,
    paddingHorizontal: 16,
    paddingVertical: 16,
    color: withuColors.navy,
    fontSize: 16,
    textAlignVertical: 'top',
  },
  activateButton: {
    marginTop: 18,
  },
  liveStatusBox: {
    marginTop: 18,
    backgroundColor: withuColors.successBg,
    borderRadius: withuRadius.lg,
    borderWidth: 1,
    borderColor: '#B9E1D4',
    padding: withuSpacing.lg,
  },
  liveStatusHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
    flexWrap: 'wrap',
  },
  liveStatusTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: withuColors.navy,
    marginBottom: 6,
  },
  liveStatusText: {
    color: '#33524A',
    fontSize: 14,
    lineHeight: 22,
    marginBottom: 4,
  },
  liveButtonsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
  },
  liveButton: {
    flex: 1,
  },
  stopButton: {
    flex: 1,
    minHeight: 54,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#E8B8B1',
    backgroundColor: '#FCEAEA',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stopButtonText: {
    color: withuColors.navy,
    fontSize: 15,
    fontWeight: '800',
  },
  liveHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  liveSubtitle: {
    marginBottom: 16,
  },
  emptyLiveBox: {
    backgroundColor: withuColors.soft,
    borderRadius: withuRadius.lg,
    padding: withuSpacing.xl,
  },
  emptyLiveTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: withuColors.navy,
    marginBottom: 8,
  },
  emptyLiveText: {
    fontSize: 14,
    lineHeight: 22,
    color: '#555555',
  },
  liveCardsWrap: {
    gap: 12,
  },
  liveCard: {
    backgroundColor: withuColors.white,
    borderRadius: withuRadius.lg,
    borderWidth: 1,
    borderColor: withuColors.line,
    padding: withuSpacing.lg,
    ...withuShadows.card,
  },
  liveCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  liveCardInfo: {
    flex: 1,
    marginLeft: 12,
    marginRight: 8,
  },
  liveName: {
    fontSize: 18,
    fontWeight: '900',
    color: withuColors.navy,
    marginBottom: 3,
  },
  liveMeta: {
    fontSize: 13,
    color: withuColors.muted,
  },
  liveMessage: {
    fontSize: 15,
    lineHeight: 23,
    color: '#444444',
    marginBottom: 8,
  },
  liveTime: {
    fontSize: 12,
    color: withuColors.muted,
    fontWeight: '700',
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
    marginTop: 14,
    marginBottom: 10,
    textAlign: 'center',
  },
  stateText: {
    color: '#555555',
    fontSize: 15,
    lineHeight: 24,
    textAlign: 'center',
    marginBottom: 20,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
});