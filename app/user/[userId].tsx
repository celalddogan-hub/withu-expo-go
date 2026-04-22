import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useLocalSearchParams, useRouter } from 'expo-router';
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

type PublicProfileRow = {
  id: string;
  name: string | null;
  city: string | null;
  age: number | null;
  bio: string | null;
  avatar_url: string | null;
  avatar_emoji: string | null;
  activities: string[] | null;
  is_bankid_verified: boolean | null;
};

type BlockedRow = {
  blockerad_av: string | null;
  blockerad: string | null;
};

function normalizeUserId(value: string | string[] | undefined) {
  if (Array.isArray(value)) return value[0] || '';
  return value || '';
}

export default function PublicUserProfileScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ userId?: string | string[] }>();

  const [loading, setLoading] = useState(true);
  const [errorText, setErrorText] = useState('');
  const [notAvailable, setNotAvailable] = useState(false);
  const [profile, setProfile] = useState<PublicProfileRow | null>(null);

  const loadProfile = useCallback(async () => {
    try {
      setLoading(true);
      setErrorText('');
      setNotAvailable(false);
      setProfile(null);

      const targetUserId = normalizeUserId(params.userId);

      if (!targetUserId) {
        throw new Error('Ingen profil angavs.');
      }

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError) throw userError;
      if (!user) {
        throw new Error('Du måste logga in för att se profiler.');
      }

      const { data: blockedRows, error: blockedError } = await supabase
        .from('blocked_users')
        .select('blockerad_av, blockerad')
        .or(
          `and(blockerad_av.eq.${user.id},blockerad.eq.${targetUserId}),and(blockerad_av.eq.${targetUserId},blockerad.eq.${user.id})`
        );

      if (blockedError) throw blockedError;

      const isBlocked = ((blockedRows ?? []) as BlockedRow[]).some(
        (row) =>
          (row.blockerad_av === user.id && row.blockerad === targetUserId) ||
          (row.blockerad_av === targetUserId && row.blockerad === user.id)
      );

      if (isBlocked) {
        setNotAvailable(true);
        return;
      }

      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select(
          'id, name, city, age, bio, avatar_url, avatar_emoji, activities, is_bankid_verified'
        )
        .eq('id', targetUserId)
        .maybeSingle();

      if (profileError) throw profileError;

      if (!profileData) {
        setNotAvailable(true);
        return;
      }

      const nextProfile = profileData as PublicProfileRow;

      const hasVisibleContent =
        !!nextProfile.name?.trim() ||
        !!nextProfile.city?.trim() ||
        !!nextProfile.bio?.trim() ||
        !!nextProfile.avatar_url ||
        !!nextProfile.avatar_emoji ||
        (nextProfile.activities ?? []).length > 0;

      if (!hasVisibleContent) {
        setNotAvailable(true);
        return;
      }

      setProfile(nextProfile);
    } catch (error: any) {
      setErrorText(error?.message || 'Kunde inte ladda profilen.');
    } finally {
      setLoading(false);
    }
  }, [params.userId]);

  useFocusEffect(
    useCallback(() => {
      loadProfile();
    }, [loadProfile])
  );

  return (
    <WithUScreen>
      <WithUTopBar
        title="Profil"
        subtitle="Offentlig profil"
        right={<WithUAvatar emoji={profile?.avatar_emoji || '🙂'} size={34} />}
      />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <WithUPage style={styles.page}>
          <Pressable style={styles.backButton} onPress={() => router.back()}>
            <Text style={styles.backButtonText}>← Tillbaka</Text>
          </Pressable>

          {loading ? (
            <View style={styles.stateCard}>
              <ActivityIndicator size="large" color={withuColors.teal} />
              <Text style={styles.stateTitle}>Laddar profil...</Text>
              <Text style={styles.stateText}>Vi hämtar personens information.</Text>
            </View>
          ) : errorText ? (
            <View style={styles.stateCard}>
              <Text style={styles.stateTitle}>Något gick fel</Text>
              <Text style={styles.stateText}>{errorText}</Text>

              <Pressable style={styles.primaryButton} onPress={loadProfile}>
                <Text style={styles.primaryButtonText}>Försök igen</Text>
              </Pressable>
            </View>
          ) : notAvailable || !profile ? (
            <View style={styles.stateCard}>
              <Text style={styles.stateTitle}>Profilen är inte tillgänglig</Text>
              <Text style={styles.stateText}>
                Den här profilen kan inte visas just nu.
              </Text>
            </View>
          ) : (
            <>
              <View style={styles.heroCard}>
                <View style={styles.avatarWrap}>
                  {profile.avatar_url ? (
                    <Image source={{ uri: profile.avatar_url }} style={styles.avatarImage} />
                  ) : (
                    <View style={styles.avatarFallback}>
                      <Text style={styles.avatarFallbackEmoji}>
                        {profile.avatar_emoji || '🙂'}
                      </Text>
                    </View>
                  )}
                </View>

                <Text style={styles.nameText}>
                  {profile.name || 'Medlem'}
                  {profile.age ? `, ${profile.age}` : ''}
                </Text>

                <Text style={styles.metaText}>
                  {profile.city || 'Plats saknas'}
                </Text>

                {profile.is_bankid_verified ? (
                  <View style={styles.bankIdBadge}>
                    <Text style={styles.bankIdBadgeText}>✓ BankID verifierad</Text>
                  </View>
                ) : null}

                <Text style={styles.helperText}>
                  Det här är personens offentliga profil i WithU.
                </Text>
              </View>

              <View style={styles.card}>
                <Text style={styles.sectionEyebrow}>OM PERSONEN</Text>
                <Text style={styles.sectionTitle}>Vem personen är</Text>
                <Text style={styles.bodyText}>
                  {profile.bio?.trim()
                    ? profile.bio.trim()
                    : 'Personen har inte skrivit någon presentation ännu.'}
                </Text>
              </View>

              <View style={styles.card}>
                <Text style={styles.sectionEyebrow}>PLATS</Text>
                <Text style={styles.sectionTitle}>Bor i</Text>
                <Text style={styles.bodyText}>
                  {profile.city?.trim() || 'Plats saknas'}
                </Text>
              </View>

              <View style={styles.card}>
                <Text style={styles.sectionEyebrow}>INTRESSEN</Text>
                <Text style={styles.sectionTitle}>Aktiviteter</Text>

                {(profile.activities ?? []).length > 0 ? (
                  <View style={styles.chipsWrap}>
                    {(profile.activities ?? []).map((activity) => (
                      <View key={activity} style={styles.chip}>
                        <Text style={styles.chipText}>{activity}</Text>
                      </View>
                    ))}
                  </View>
                ) : (
                  <Text style={styles.bodyText}>
                    Inga aktiviteter är visade ännu.
                  </Text>
                )}
              </View>

              <View style={styles.infoCard}>
                <Text style={styles.infoCardText}>
                  🔒 Den här sidan visar bara offentlig information från profilen.
                </Text>
              </View>
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
    backgroundColor: withuColors.cream,
  },
  content: {
    paddingBottom: 40,
  },
  page: {
    paddingTop: withuSpacing.lg,
  },

  backButton: {
    marginBottom: 14,
    alignSelf: 'flex-start',
  },
  backButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: withuColors.teal,
  },

  heroCard: {
    backgroundColor: withuColors.white,
    borderRadius: withuRadius.xl,
    borderWidth: 1,
    borderColor: withuColors.line,
    padding: withuSpacing.xl,
    alignItems: 'center',
    marginBottom: 14,
    ...withuShadows.card,
  },

  avatarWrap: {
    marginBottom: 12,
  },
  avatarImage: {
    width: 108,
    height: 108,
    borderRadius: 54,
    borderWidth: 3,
    borderColor: withuColors.teal,
  },
  avatarFallback: {
    width: 108,
    height: 108,
    borderRadius: 54,
    backgroundColor: withuColors.soft,
    borderWidth: 3,
    borderColor: withuColors.teal,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarFallbackEmoji: {
    fontSize: 42,
  },

  nameText: {
    fontSize: 28,
    fontWeight: '900',
    color: withuColors.navy,
    textAlign: 'center',
    marginBottom: 4,
  },
  metaText: {
    fontSize: 15,
    color: withuColors.muted,
    textAlign: 'center',
    marginBottom: 10,
  },

  bankIdBadge: {
    backgroundColor: withuColors.successBg,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
    marginBottom: 10,
  },
  bankIdBadgeText: {
    fontSize: 12,
    fontWeight: '800',
    color: withuColors.success,
  },

  helperText: {
    fontSize: 13,
    lineHeight: 20,
    color: withuColors.muted,
    textAlign: 'center',
  },

  card: {
    backgroundColor: withuColors.white,
    borderRadius: withuRadius.xl,
    borderWidth: 1,
    borderColor: withuColors.line,
    padding: withuSpacing.lg,
    marginBottom: 14,
    ...withuShadows.card,
  },

  sectionEyebrow: {
    fontSize: 11,
    fontWeight: '800',
    color: withuColors.muted,
    marginBottom: 8,
    letterSpacing: 1,
  },
  sectionTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: withuColors.navy,
    marginBottom: 10,
  },
  bodyText: {
    fontSize: 15,
    lineHeight: 24,
    color: '#334155',
  },

  chipsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    backgroundColor: withuColors.soft,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  chipText: {
    fontSize: 13,
    fontWeight: '700',
    color: withuColors.navy,
  },

  infoCard: {
    backgroundColor: withuColors.tealBg,
    borderRadius: withuRadius.lg,
    padding: 12,
  },
  infoCardText: {
    fontSize: 13,
    lineHeight: 21,
    color: withuColors.teal,
    fontWeight: '700',
    textAlign: 'center',
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
    marginTop: 12,
    marginBottom: 8,
    textAlign: 'center',
  },
  stateText: {
    color: '#555555',
    fontSize: 15,
    lineHeight: 24,
    textAlign: 'center',
    marginBottom: 18,
  },

  primaryButton: {
    minHeight: 52,
    borderRadius: 16,
    backgroundColor: withuColors.teal,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '900',
  },
});