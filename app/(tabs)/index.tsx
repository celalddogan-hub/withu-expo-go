import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import { supabase } from '../../src/lib/supabase';
import { listActiveVolunteers } from '../../src/lib/volunteerSupport';
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

type BehovType = 'vara' | 'prata' | 'gora' | null;

type ProfileRow = {
  id: string;
  name: string | null;
  age: number | null;
  city: string | null;
  activities: string[] | null;
  avatar_emoji: string | null;
  is_bankid_verified: boolean | null;
  bio: string | null;
};

type MatchRow = {
  id: string;
  user_id: string;
  target_id: string;
  action: string;
  is_match: boolean | null;
};

type BlockedRow = {
  blockerad_av: string | null;
  blockerad: string | null;
};

const MATCH_ACTIONS = ['like', 'superlike'];

function normalize(value: string) {
  return value
    .toLowerCase()
    .replaceAll('å', 'a')
    .replaceAll('ä', 'a')
    .replaceAll('ö', 'o')
    .trim();
}

function makeConversationKey(a: string, b: string) {
  return [a, b].sort().join('__');
}

function getAvatarEmoji(activity?: string, fallback?: string | null) {
  if (fallback && fallback.trim()) return fallback;

  const value = normalize(activity || '');

  if (value.includes('kafe') || value.includes('fika') || value.includes('lunch')) return '☕';
  if (value.includes('promenad') || value.includes('lopning') || value.includes('spring')) return '🚶';
  if (value.includes('studie') || value.includes('laxhjalp') || value.includes('plugg')) return '📚';
  if (value.includes('bradspel') || value.includes('escape') || value.includes('spel')) return '🎲';
  if (value.includes('gym') || value.includes('traning') || value.includes('yoga')) return '💪';
  if (value.includes('konsert') || value.includes('film') || value.includes('bio')) return '🎬';
  if (value.includes('musik')) return '🎵';
  if (value.includes('natur')) return '🌿';

  return '🙂';
}

function profileMatchesBehov(profile: ProfileRow, behov: BehovType) {
  if (!behov) return true;

  const activities = (profile.activities ?? []).map(normalize).join(' ');
  const bio = normalize(profile.bio ?? '');
  const haystack = `${activities} ${bio}`;

  if (behov === 'vara') {
    return (
      haystack.includes('sallskap') ||
      haystack.includes('promenad') ||
      haystack.includes('fika') ||
      haystack.includes('hang') ||
      haystack.includes('bara vara') ||
      haystack.includes('natur') ||
      haystack.includes('kaffe') ||
      haystack.includes('lunch') ||
      haystack.includes('umgas')
    );
  }

  if (behov === 'prata') {
    return (
      haystack.includes('prata') ||
      haystack.includes('lyssna') ||
      haystack.includes('samtal') ||
      haystack.includes('stotta') ||
      haystack.includes('chatt') ||
      haystack.includes('snacka') ||
      haystack.includes('kaensla') ||
      haystack.includes('kansla')
    );
  }

  if (behov === 'gora') {
    return (
      haystack.includes('aktivitet') ||
      haystack.includes('gym') ||
      haystack.includes('yoga') ||
      haystack.includes('film') ||
      haystack.includes('konsert') ||
      haystack.includes('spel') ||
      haystack.includes('bradspel') ||
      haystack.includes('escape') ||
      haystack.includes('plugg') ||
      haystack.includes('studie')
    );
  }

  return true;
}

async function loadBlockedIds(currentUserId: string) {
  const { data, error } = await supabase
    .from('blocked_users')
    .select('blockerad_av, blockerad')
    .or(`blockerad_av.eq.${currentUserId},blockerad.eq.${currentUserId}`);

  if (error) throw error;

  return new Set(
    ((data ?? []) as BlockedRow[])
      .map((row) => (row.blockerad_av === currentUserId ? row.blockerad : row.blockerad_av))
      .filter(Boolean) as string[]
  );
}

export default function HittaScreen() {
  const router = useRouter();

  const [valtBehov, setValtBehov] = useState<BehovType>(null);
  const [profiler, setProfiler] = useState<ProfileRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState<string | null>(null);

  const [currentUserId, setCurrentUserId] = useState('');
  const [userName, setUserName] = useState('');
  const [kontaktadeIds, setKontaktadeIds] = useState<string[]>([]);
  const [matchedIds, setMatchedIds] = useState<string[]>([]);

  const [volunteerCount, setVolunteerCount] = useState(0);
  const [volunteerLoading, setVolunteerLoading] = useState(true);

  const behovData = useMemo(
    () => ({
      vara: {
        emoji: '🌿',
        titel: 'Folk som vill ha sällskap',
        sub: 'Gilla och gå vidare - om ni båda gillar öppnas chatten.',
      },
      prata: {
        emoji: '💬',
        titel: 'Folk som vill prata',
        sub: 'Gilla och gå vidare - om ni båda gillar öppnas chatten.',
      },
      gora: {
        emoji: '🤝',
        titel: 'Folk som vill göra något',
        sub: 'Gilla och gå vidare - om ni båda gillar öppnas chatten.',
      },
    }),
    []
  );

  const loadHeaderData = useCallback(async () => {
    try {
      setVolunteerLoading(true);

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError) throw userError;
      if (!user) {
        setCurrentUserId('');
        setUserName('');
        setVolunteerCount(0);
        return;
      }

      setCurrentUserId(user.id);

      const [{ data: ownProfile }, volunteers] = await Promise.all([
        supabase.from('profiles').select('name').eq('id', user.id).maybeSingle(),
        listActiveVolunteers(),
      ]);

      setUserName(ownProfile?.name || '');
      setVolunteerCount(volunteers.filter((item) => item.volunteer_user_id !== user.id).length);
    } catch {
      setVolunteerCount(0);
    } finally {
      setVolunteerLoading(false);
    }
  }, []);

  const laddaProfiler = useCallback(async (behov: BehovType) => {
    try {
      setLoading(true);

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError) throw userError;

      if (!user) {
        setProfiler([]);
        setKontaktadeIds([]);
        setMatchedIds([]);
        setCurrentUserId('');
        return;
      }

      setCurrentUserId(user.id);

      const [
        { data: ownData, error: ownError },
        { data: outgoingRows, error: outgoingError },
        { data: incomingRows, error: incomingError },
        blockedIds,
        { data: profileData, error: profileError },
      ] = await Promise.all([
        supabase.from('profiles').select('name').eq('id', user.id).maybeSingle(),
        supabase
          .from('matches')
          .select('id, user_id, target_id, action, is_match')
          .eq('user_id', user.id)
          .in('action', MATCH_ACTIONS),
        supabase
          .from('matches')
          .select('id, user_id, target_id, action, is_match')
          .eq('target_id', user.id)
          .in('action', MATCH_ACTIONS),
        loadBlockedIds(user.id),
        supabase
          .from('profiles')
          .select('id, name, age, city, activities, avatar_emoji, is_bankid_verified, bio')
          .neq('id', user.id)
          .eq('is_profile_complete', true),
      ]);

      if (ownError) throw ownError;
      if (outgoingError) throw outgoingError;
      if (incomingError) throw incomingError;
      if (profileError) throw profileError;

      setUserName(ownData?.name || '');

      const outgoing = (outgoingRows ?? []) as MatchRow[];
      const incoming = (incomingRows ?? []) as MatchRow[];

      const contactedIds = [...new Set(outgoing.map((row) => row.target_id))];
      setKontaktadeIds(contactedIds);

      const alreadyMatchedIds = new Set(
        outgoing.filter((row) => row.is_match === true).map((row) => row.target_id)
      );

      const mutualIds = [...new Set(incoming.map((row) => row.user_id))].filter((otherUserId) =>
        contactedIds.includes(otherUserId)
      );

      const needRepairIds = mutualIds.filter((id) => !alreadyMatchedIds.has(id));

      if (needRepairIds.length > 0) {
        for (const otherUserId of needRepairIds) {
          if (blockedIds.has(otherUserId)) continue;

          const [ownUpdate, otherUpdate] = await Promise.all([
            supabase
              .from('matches')
              .update({ is_match: true })
              .eq('user_id', user.id)
              .eq('target_id', otherUserId)
              .in('action', MATCH_ACTIONS),

            supabase
              .from('matches')
              .update({ is_match: true })
              .eq('user_id', otherUserId)
              .eq('target_id', user.id)
              .in('action', MATCH_ACTIONS),
          ]);

          if (ownUpdate.error) throw ownUpdate.error;
          if (otherUpdate.error) throw otherUpdate.error;

          alreadyMatchedIds.add(otherUserId);
        }
      }

      const finalMatchedIds = [...alreadyMatchedIds];
      setMatchedIds(finalMatchedIds);

      const filtered = ((profileData ?? []) as ProfileRow[])
        .filter((p) => !blockedIds.has(p.id))
        .filter((p) => !alreadyMatchedIds.has(p.id))
        .filter((p) => !contactedIds.includes(p.id))
        .filter((p) => (p.activities ?? []).length > 0 || !!p.bio?.trim())
        .filter((p) => profileMatchesBehov(p, behov));

      setProfiler(filtered);
    } catch (error: any) {
      Alert.alert('Fel', error?.message || 'Kunde inte ladda profiler.');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadHeaderData();

      if (valtBehov) {
        laddaProfiler(valtBehov);
      }
    }, [valtBehov, loadHeaderData, laddaProfiler])
  );

  const hanteraBehovVal = async (behov: BehovType) => {
    setValtBehov(behov);
    await laddaProfiler(behov);
  };

  const horAvDig = async (profil: ProfileRow) => {
    if (!currentUserId || sending) return;

    try {
      setSending(profil.id);

      const blockedIds = await loadBlockedIds(currentUserId);

      if (blockedIds.has(profil.id)) {
        Alert.alert('Inte tillgänglig', 'Den här personen är inte tillgänglig för kontakt.');
        setProfiler((prev) => prev.filter((p) => p.id !== profil.id));
        return;
      }

      const { data: existingOwn, error: existingOwnError } = await supabase
        .from('matches')
        .select('id, is_match')
        .eq('user_id', currentUserId)
        .eq('target_id', profil.id)
        .eq('action', 'like')
        .maybeSingle();

      if (existingOwnError) throw existingOwnError;

      if (!existingOwn?.id) {
        const { error: insertError } = await supabase.from('matches').insert({
          user_id: currentUserId,
          target_id: profil.id,
          action: 'like',
          is_match: false,
        });

        if (insertError) throw insertError;
      }

      const { data: reciprocalLike, error: reciprocalLikeError } = await supabase
        .from('matches')
        .select('id, is_match')
        .eq('user_id', profil.id)
        .eq('target_id', currentUserId)
        .in('action', MATCH_ACTIONS)
        .maybeSingle();

      if (reciprocalLikeError) throw reciprocalLikeError;

      const isMatch = !!reciprocalLike?.id;

      if (isMatch) {
        const [updateOwn, updateReciprocal] = await Promise.all([
          supabase
            .from('matches')
            .update({ is_match: true })
            .eq('user_id', currentUserId)
            .eq('target_id', profil.id)
            .in('action', MATCH_ACTIONS),

          supabase
            .from('matches')
            .update({ is_match: true })
            .eq('user_id', profil.id)
            .eq('target_id', currentUserId)
            .in('action', MATCH_ACTIONS),
        ]);

        if (updateOwn.error) throw updateOwn.error;
        if (updateReciprocal.error) throw updateReciprocal.error;
      }

      setKontaktadeIds((prev) => (prev.includes(profil.id) ? prev : [...prev, profil.id]));
      setProfiler((prev) => prev.filter((p) => p.id !== profil.id));

      if (isMatch) {
        setMatchedIds((prev) => (prev.includes(profil.id) ? prev : [...prev, profil.id]));

        const conversationKey = makeConversationKey(currentUserId, profil.id);

        Alert.alert(
          'Match! 🎉',
          `Du och ${profil.name || 'personen'} gillade varandra. Chatten öppnas direkt.`
        );

        router.push({
          pathname: '/chat/[conversationKey]',
          params: { conversationKey },
        });
      } else {
        Alert.alert(
          'Gillat 💙',
          `${profil.name || 'Personen'} flyttades bort från listan. Om personen också gillar dig öppnas chatten.`
        );
      }
    } catch (error: any) {
      Alert.alert('Kunde inte gilla', error?.message || 'Något gick fel.');
    } finally {
      setSending(null);
    }
  };

  const volunteerBannerTitle = volunteerLoading
    ? 'Kollar volontärer...'
    : volunteerCount > 0
    ? 'Mår du dåligt?'
    : 'Behöver du någon som lyssnar?';

  const volunteerBannerSubtitle = volunteerLoading
    ? 'Vi hämtar vilka som är aktiva just nu.'
    : volunteerCount > 0
    ? volunteerCount === 1
      ? '1 volontär är aktiv just nu.'
      : `${volunteerCount} volontärer är aktiva just nu.`
    : 'Just nu är ingen volontär aktiv, men du kan ändå öppna volontärsidan.';

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
        showsVerticalScrollIndicator={false}
      >
        <WithUPage style={styles.page}>
          <View style={styles.heroBlock}>
            <Text style={styles.heroTitle}>{userName ? `Hej ${userName} 👋` : 'Hej 👋'}</Text>
            <Text style={styles.heroSub}>Vad behöver du just nu? Vi hittar rätt för dig.</Text>
          </View>

          <Pressable style={styles.volunteerBanner} onPress={() => router.push('/volunteers')}>
            <View style={styles.volunteerBannerIconWrap}>
              <Text style={styles.volunteerBannerIcon}>💚</Text>
            </View>

            <View style={styles.volunteerBannerTextWrap}>
              <Text style={styles.volunteerBannerTitle}>{volunteerBannerTitle}</Text>
              <Text style={styles.volunteerBannerSub}>{volunteerBannerSubtitle}</Text>
            </View>

            <View style={styles.volunteerBannerButton}>
              <Text style={styles.volunteerBannerButtonText}>
                {volunteerCount > 0 ? 'Prata' : 'Öppna'}
              </Text>
            </View>
          </Pressable>

          {!valtBehov ? (
            <View style={styles.behovKort}>
              <Text style={styles.behovFraga}>Hur kan WithU hjälpa dig idag?</Text>

              <Pressable
                style={[styles.behovOption, styles.behovVara]}
                onPress={() => hanteraBehovVal('vara')}
              >
                <Text style={styles.behovEmoji}>🌿</Text>
                <View style={styles.behovTextWrap}>
                  <Text style={styles.behovOptionTitel}>Bara vara med folk</Text>
                  <Text style={styles.behovOptionSub}>
                    Ingen press. Ingen presentation. Bara sällskap.
                  </Text>
                </View>
                <Text style={styles.behovPil}>›</Text>
              </Pressable>

              <Pressable
                style={[styles.behovOption, styles.behovPrata]}
                onPress={() => hanteraBehovVal('prata')}
              >
                <Text style={styles.behovEmoji}>💬</Text>
                <View style={styles.behovTextWrap}>
                  <Text style={styles.behovOptionTitel}>Prata med någon</Text>
                  <Text style={styles.behovOptionSub}>
                    Gilla personer du vill prata med. Om ni båda gillar öppnas chatten.
                  </Text>
                </View>
                <Text style={styles.behovPil}>›</Text>
              </Pressable>

              <Pressable
                style={[styles.behovOption, styles.behovGora]}
                onPress={() => hanteraBehovVal('gora')}
              >
                <Text style={styles.behovEmoji}>🤝</Text>
                <View style={styles.behovTextWrap}>
                  <Text style={styles.behovOptionTitel}>Göra något tillsammans</Text>
                  <Text style={styles.behovOptionSub}>
                    Hitta någon med samma intressen i din stad.
                  </Text>
                </View>
                <Text style={styles.behovPil}>›</Text>
              </Pressable>

              <View style={styles.tryggBanner}>
                <Text style={styles.tryggText}>
                  🔒 Du väljer alltid hur mycket du vill dela om dig själv
                </Text>
              </View>
            </View>
          ) : (
            <>
              <Pressable
                style={styles.tillbakaKnapp}
                onPress={() => {
                  setValtBehov(null);
                  setProfiler([]);
                }}
              >
                <Text style={styles.tillbakaText}>← Byt behov</Text>
              </Pressable>

              <View style={styles.valtBehovHeader}>
                <Text style={styles.valtBehovEmoji}>{behovData[valtBehov].emoji}</Text>
                <View style={styles.valtBehovTextWrap}>
                  <Text style={styles.valtBehovTitel}>{behovData[valtBehov].titel}</Text>
                  <Text style={styles.valtBehovSub}>{behovData[valtBehov].sub}</Text>
                </View>
              </View>

              <View style={styles.infoBox}>
                <Text style={styles.infoBoxText}>
                  💙 Tryck "Gilla" och gå vidare. Om personen också gillar dig öppnas chatten direkt.
                </Text>
              </View>

              {loading ? (
                <View style={styles.laddningWrap}>
                  <ActivityIndicator size="large" color={withuColors.teal} />
                  <Text style={styles.laddningText}>Letar efter rätt personer...</Text>
                </View>
              ) : profiler.length === 0 ? (
                <View style={styles.tomtKort}>
                  <Text style={styles.tomtTitel}>Ingen ny profil just nu</Text>
                  <Text style={styles.tomtText}>
                    Du har redan gått igenom de profiler som passar just nu. Prova igen senare eller byt behov.
                  </Text>
                  <Pressable
                    style={styles.provaAnnatKnapp}
                    onPress={() => {
                      setValtBehov(null);
                      setProfiler([]);
                    }}
                  >
                    <Text style={styles.provaAnnatText}>Prova ett annat val</Text>
                  </Pressable>
                </View>
              ) : (
                <View style={styles.profilerLista}>
                  {profiler.map((profil) => {
                    const harKontaktat = kontaktadeIds.includes(profil.id);
                    const arMatch = matchedIds.includes(profil.id);
                    const aktivitet = (profil.activities ?? [])[0] || '';
                    const emoji = getAvatarEmoji(aktivitet, profil.avatar_emoji);
                    const conversationKey = makeConversationKey(currentUserId, profil.id);

                    return (
                      <View key={profil.id} style={styles.profilKort}>
                        <View style={styles.profilTop}>
                          <View style={styles.profilAvatarWrap}>
                            <Text style={styles.profilAvatarEmoji}>{emoji}</Text>
                          </View>

                          <View style={styles.profilInfoWrap}>
                            <Text style={styles.profilNamn}>
                              {profil.name || 'Användare'}
                              {profil.age ? `, ${profil.age}` : ''}
                            </Text>

                            <Text style={styles.profilMeta}>
                              {profil.city || 'Plats saknas'}
                              {aktivitet ? ` · ${aktivitet}` : ''}
                            </Text>

                            {profil.is_bankid_verified ? (
                              <View style={styles.bankidBadge}>
                                <Text style={styles.bankidText}>✓ BankID</Text>
                              </View>
                            ) : null}
                          </View>
                        </View>

                        {!!profil.bio?.trim() && (
                          <View style={styles.bioBubble}>
                            <Text style={styles.bioText}>"{profil.bio.trim()}"</Text>
                          </View>
                        )}

                        {(profil.activities ?? []).length > 0 && (
                          <View style={styles.aktiviteterRad}>
                            {(profil.activities ?? []).slice(0, 3).map((akt) => (
                              <View key={akt} style={styles.aktivitetPill}>
                                <Text style={styles.aktivitetText}>{akt}</Text>
                              </View>
                            ))}
                          </View>
                        )}

                        <View style={styles.buttonStack}>
                          {arMatch ? (
                            <Pressable
                              style={styles.oppnaChattKnapp}
                              onPress={() =>
                                router.push({
                                  pathname: '/chat/[conversationKey]',
                                  params: { conversationKey },
                                })
                              }
                            >
                              <Text style={styles.oppnaChattText}>💬 Öppna chatt</Text>
                            </Pressable>
                          ) : harKontaktat ? (
                            <View style={styles.skickatKnapp}>
                              <Text style={styles.skickatText}>✓ Gillad - väntar på svar</Text>
                            </View>
                          ) : (
                            <>
                              <Pressable
                                style={[
                                  styles.horAvDigKnapp,
                                  sending === profil.id && styles.knappDisabled,
                                ]}
                                onPress={() => horAvDig(profil)}
                                disabled={!!sending}
                              >
                                <Text style={styles.horAvDigText}>
                                  {sending === profil.id ? 'Skickar...' : '💙 Gilla'}
                                </Text>
                              </Pressable>

                              <Pressable
                                style={styles.nastaKnapp}
                                onPress={() =>
                                  setProfiler((prev) => prev.filter((p) => p.id !== profil.id))
                                }
                                disabled={!!sending}
                              >
                                <Text style={styles.nastaText}>Nästa profil</Text>
                              </Pressable>
                            </>
                          )}
                        </View>
                      </View>
                    );
                  })}
                </View>
              )}
            </>
          )}
        </WithUPage>
      </ScrollView>
    </WithUScreen>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: withuColors.cream },
  content: { paddingBottom: 40 },
  page: { paddingTop: withuSpacing.lg },

  heroBlock: { marginBottom: 18 },
  heroTitle: {
    fontSize: 28,
    fontWeight: '900',
    color: withuColors.navy,
    marginBottom: 6,
  },
  heroSub: { fontSize: 15, lineHeight: 22, color: withuColors.muted },

  volunteerBanner: {
    backgroundColor: '#EAF5F1',
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: '#1C5E52',
    padding: 14,
    marginBottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
  },
  volunteerBannerIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#1C5E52',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  volunteerBannerIcon: {
    fontSize: 24,
  },
  volunteerBannerTextWrap: {
    flex: 1,
    paddingRight: 10,
  },
  volunteerBannerTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: withuColors.navy,
    marginBottom: 3,
  },
  volunteerBannerSub: {
    fontSize: 12,
    lineHeight: 18,
    color: '#1C5E52',
    fontWeight: '700',
  },
  volunteerBannerButton: {
    backgroundColor: '#1C5E52',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  volunteerBannerButtonText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '900',
  },

  behovKort: {
    backgroundColor: withuColors.white,
    borderRadius: withuRadius.xl,
    borderWidth: 1,
    borderColor: withuColors.line,
    padding: withuSpacing.xl,
    ...withuShadows.card,
  },
  behovFraga: {
    fontSize: 17,
    fontWeight: '900',
    color: withuColors.navy,
    textAlign: 'center',
    marginBottom: 16,
    lineHeight: 24,
  },
  behovOption: {
    borderRadius: withuRadius.lg,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1.5,
    marginBottom: 10,
  },
  behovVara: {
    borderColor: withuColors.success,
    backgroundColor: withuColors.successBg,
  },
  behovPrata: {
    borderColor: '#7B9FE0',
    backgroundColor: 'rgba(123,159,224,0.08)',
  },
  behovGora: {
    borderColor: withuColors.coral,
    backgroundColor: withuColors.coralBg,
  },
  behovEmoji: { fontSize: 26 },
  behovTextWrap: { flex: 1 },
  behovOptionTitel: {
    fontSize: 15,
    fontWeight: '800',
    color: withuColors.navy,
  },
  behovOptionSub: {
    fontSize: 12,
    color: withuColors.muted,
    marginTop: 2,
    lineHeight: 17,
  },
  behovPil: { fontSize: 22, color: withuColors.muted },

  tryggBanner: {
    backgroundColor: withuColors.tealBg,
    borderRadius: withuRadius.md,
    padding: 10,
    marginTop: 6,
  },
  tryggText: {
    fontSize: 12,
    color: withuColors.teal,
    fontWeight: '700',
    textAlign: 'center',
  },

  tillbakaKnapp: { marginBottom: 14 },
  tillbakaText: {
    fontSize: 14,
    color: withuColors.teal,
    fontWeight: '700',
  },

  valtBehovHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: withuColors.white,
    borderRadius: withuRadius.lg,
    borderWidth: 1,
    borderColor: withuColors.line,
    padding: 14,
    marginBottom: 10,
    ...withuShadows.card,
  },
  valtBehovEmoji: { fontSize: 28 },
  valtBehovTextWrap: { flex: 1 },
  valtBehovTitel: {
    fontSize: 16,
    fontWeight: '900',
    color: withuColors.navy,
  },
  valtBehovSub: { fontSize: 12, color: withuColors.muted, marginTop: 2 },

  infoBox: {
    backgroundColor: withuColors.tealBg,
    borderRadius: withuRadius.md,
    padding: 12,
    marginBottom: 16,
  },
  infoBoxText: {
    fontSize: 13,
    color: '#111827',
    fontWeight: '800',
    lineHeight: 22,
  },

  laddningWrap: { alignItems: 'center', padding: 40 },
  laddningText: {
    marginTop: 12,
    color: withuColors.muted,
    fontSize: 14,
    fontWeight: '600',
  },

  tomtKort: {
    backgroundColor: withuColors.white,
    borderRadius: withuRadius.xl,
    borderWidth: 1,
    borderColor: withuColors.line,
    padding: withuSpacing.xxl,
    alignItems: 'center',
    ...withuShadows.card,
  },
  tomtTitel: {
    fontSize: 22,
    fontWeight: '900',
    color: withuColors.navy,
    marginBottom: 8,
    textAlign: 'center',
  },
  tomtText: {
    fontSize: 14,
    lineHeight: 22,
    color: '#555',
    textAlign: 'center',
    marginBottom: 18,
  },
  provaAnnatKnapp: {
    backgroundColor: withuColors.teal,
    borderRadius: 999,
    paddingVertical: 14,
    paddingHorizontal: 24,
  },
  provaAnnatText: {
    color: withuColors.white,
    fontSize: 15,
    fontWeight: '800',
  },

  profilerLista: { gap: 12 },
  profilKort: {
    backgroundColor: withuColors.white,
    borderRadius: withuRadius.xl,
    borderWidth: 1,
    borderColor: withuColors.line,
    padding: withuSpacing.lg,
    ...withuShadows.card,
  },
  profilTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 10,
  },
  profilAvatarWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: withuColors.coralBg,
    borderWidth: 1,
    borderColor: '#F0D9D4',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  profilAvatarEmoji: { fontSize: 26 },
  profilInfoWrap: { flex: 1 },
  profilNamn: {
    fontSize: 18,
    fontWeight: '900',
    color: withuColors.navy,
    marginBottom: 2,
  },
  profilMeta: {
    fontSize: 13,
    color: withuColors.muted,
    marginBottom: 4,
  },

  bankidBadge: {
    backgroundColor: withuColors.successBg,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
    alignSelf: 'flex-start',
  },
  bankidText: {
    fontSize: 11,
    fontWeight: '800',
    color: withuColors.success,
  },

  bioBubble: {
    backgroundColor: withuColors.soft,
    borderRadius: withuRadius.md,
    padding: 10,
    marginBottom: 10,
  },
  bioText: {
    fontSize: 13,
    lineHeight: 20,
    color: '#444',
    fontStyle: 'italic',
  },

  aktiviteterRad: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 14,
  },
  aktivitetPill: {
    backgroundColor: withuColors.soft,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  aktivitetText: {
    fontSize: 12,
    fontWeight: '700',
    color: withuColors.navy,
  },

  buttonStack: {
    gap: 10,
    marginTop: 4,
  },
  horAvDigKnapp: {
    width: '100%',
    backgroundColor: '#0F766E',
    borderRadius: 18,
    paddingVertical: 16,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 56,
  },
  horAvDigText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '900',
    textAlign: 'center',
  },

  nastaKnapp: {
    width: '100%',
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: withuColors.line,
    borderRadius: 18,
    paddingVertical: 16,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 56,
  },
  nastaText: {
    color: withuColors.navy,
    fontSize: 18,
    fontWeight: '800',
    textAlign: 'center',
  },

  skickatKnapp: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#111827',
    borderRadius: 18,
    paddingVertical: 16,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 56,
  },
  skickatText: {
    color: '#111827',
    fontSize: 16,
    fontWeight: '900',
    textAlign: 'center',
  },

  oppnaChattKnapp: {
    width: '100%',
    backgroundColor: '#0F766E',
    borderRadius: 18,
    paddingVertical: 16,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 56,
  },
  oppnaChattText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '900',
    textAlign: 'center',
  },

  knappDisabled: { opacity: 0.5 },
});