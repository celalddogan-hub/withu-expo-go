import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Modal,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '../src/lib/supabase';
import {
  withuColors,
  withuRadius,
  withuShadows,
  withuSpacing,
} from '../src/theme/withuTheme';

type RemoteProfile = {
  id: string;
  name: string | null;
  age: number | null;
  age_group: string | null;
  city: string | null;
  bio: string | null;
  activities: string[] | null;
  preferred_age_min: number | null;
  preferred_age_max: number | null;
  is_bankid_verified: boolean | null;
  avatar_emoji: string | null;
  is_profile_complete: boolean | null;
  updated_at: string | null;
};

type OwnProfile = {
  age: number | null;
  activities: string[] | null;
  preferred_age_min: number | null;
  preferred_age_max: number | null;
  is_profile_complete: boolean | null;
};

function getAvatarEmoji(activity?: string, fallback?: string | null) {
  if (fallback && fallback.trim()) return fallback;

  const value = (activity || '').toLowerCase();

  if (value.includes('kafé') || value.includes('fika') || value.includes('lunch')) return '☕';
  if (value.includes('promenad') || value.includes('löpning') || value.includes('cykling')) return '🚶';
  if (value.includes('plug') || value.includes('studie') || value.includes('språk')) return '📚';
  if (value.includes('brädspel') || value.includes('rollspel') || value.includes('escape')) return '🎲';
  if (value.includes('yoga') || value.includes('gym') || value.includes('träning')) return '💪';
  if (value.includes('konsert') || value.includes('film') || value.includes('utställning')) return '🎬';
  if (value.includes('mat') || value.includes('restaurang') || value.includes('baka')) return '🍽️';

  return '🙂';
}

function getOverlapCount(a: string[] = [], b: string[] = []) {
  const bSet = new Set(b);
  return a.filter((item) => bSet.has(item)).length;
}

export default function SwipeDeck() {
  const [profiles, setProfiles] = useState<RemoteProfile[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [currentUserId, setCurrentUserId] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [acting, setActing] = useState(false);
  const [errorText, setErrorText] = useState('');
  const [missingProfileReason, setMissingProfileReason] = useState('');
  const [myActivities, setMyActivities] = useState<string[]>([]);
  const [matchModalVisible, setMatchModalVisible] = useState(false);
  const [matchedName, setMatchedName] = useState('');

  const actingRef = useRef(false);
  const swipe = useRef(new Animated.ValueXY()).current;

  const moveNext = useCallback(() => {
    setCurrentIndex((prev) => prev + 1);
  }, []);

  const resetCardPosition = useCallback(() => {
    swipe.setValue({ x: 0, y: 0 });
  }, [swipe]);

  useEffect(() => {
    resetCardPosition();
  }, [currentIndex, resetCardPosition]);

  const animateBack = useCallback(() => {
    Animated.spring(swipe, {
      toValue: { x: 0, y: 0 },
      tension: 50,
      friction: 7,
      useNativeDriver: false,
    }).start();
  }, [swipe]);

  const animateOut = useCallback(
    (direction: 'left' | 'right') => {
      return new Promise<void>((resolve) => {
        Animated.timing(swipe, {
          toValue: {
            x: direction === 'right' ? 520 : -520,
            y: direction === 'right' ? 35 : -35,
          },
          duration: 230,
          useNativeDriver: false,
        }).start(() => {
          resolve();
        });
      });
    },
    [swipe]
  );

  const loadProfiles = useCallback(async () => {
    try {
      setLoading(true);
      setRefreshing(true);
      setErrorText('');
      setMissingProfileReason('');

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setProfiles([]);
        setCurrentUserId('');
        setErrorText('Du måste logga in för att använda Hitta.');
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
        .select('age, activities, preferred_age_min, preferred_age_max, is_profile_complete')
        .eq('id', user.id)
        .maybeSingle();

      if (ownError) throw ownError;

      const ownProfile = ownData as OwnProfile | null;

      if (!ownProfile) {
        setProfiles([]);
        setMissingProfileReason(
          'Din profil hittades inte. Gå till Profil och spara din profil en gång.'
        );
        return;
      }

      const myAge = ownProfile.age;
      const ownActivities = ownProfile.activities ?? [];
      const myMin = ownProfile.preferred_age_min ?? 18;
      const myMax = ownProfile.preferred_age_max ?? 99;

      setMyActivities(ownActivities);

      if (ownProfile.is_profile_complete === false) {
        setProfiles([]);
        setMissingProfileReason(
          'Din profil är inte klar ännu. Fyll i namn, stad, bio, ålder och aktiviteter i Profil.'
        );
        return;
      }

      if (myAge == null) {
        setProfiles([]);
        setMissingProfileReason('Lägg till din ålder i Profil för att använda Hitta.');
        return;
      }

      if (ownActivities.length === 0) {
        setProfiles([]);
        setMissingProfileReason(
          'Välj minst en aktivitet i Profil för att använda Hitta.'
        );
        return;
      }

      const { data: swipeRows, error: swipeError } = await supabase
        .from('matches')
        .select('target_id')
        .eq('user_id', user.id);

      if (swipeError) throw swipeError;

      const seenIds = new Set(
        (swipeRows ?? []).map((row: any) => row.target_id).filter(Boolean)
      );

      const { data, error } = await supabase
        .from('profiles')
        .select(
          'id, name, age, age_group, city, bio, activities, preferred_age_min, preferred_age_max, is_bankid_verified, avatar_emoji, is_profile_complete, updated_at'
        )
        .neq('id', user.id);

      if (error) throw error;

      const rows = (data ?? []) as RemoteProfile[];

      const filtered = rows
        .filter((profile) => !seenIds.has(profile.id))
        .filter((profile) => !blockedIds.has(profile.id))
        .filter((profile) => profile.is_profile_complete !== false)
        .filter((profile) => profile.age != null)
        .filter((profile) => (profile.activities ?? []).length > 0)
        .filter((profile) => {
          const overlap = getOverlapCount(ownActivities, profile.activities ?? []);
          return overlap > 0;
        })
        .filter((profile) => {
          const theirAge = profile.age ?? 0;
          return theirAge >= myMin && theirAge <= myMax;
        })
        .filter((profile) => {
          const theirMin = profile.preferred_age_min ?? 18;
          const theirMax = profile.preferred_age_max ?? 99;
          return myAge >= theirMin && myAge <= theirMax;
        })
        .sort((a, b) => {
          const overlapA = getOverlapCount(ownActivities, a.activities ?? []);
          const overlapB = getOverlapCount(ownActivities, b.activities ?? []);
          if (overlapB !== overlapA) return overlapB - overlapA;

          const bankA = a.is_bankid_verified ? 1 : 0;
          const bankB = b.is_bankid_verified ? 1 : 0;
          if (bankB !== bankA) return bankB - bankA;

          const dateA = a.updated_at ? new Date(a.updated_at).getTime() : 0;
          const dateB = b.updated_at ? new Date(b.updated_at).getTime() : 0;
          return dateB - dateA;
        });

      setProfiles(filtered);
      setCurrentIndex(0);
    } catch (error: any) {
      setProfiles([]);
      setErrorText(error?.message || 'Kunde inte hämta profiler.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadProfiles();
    }, [loadProfiles])
  );

  const currentPerson = profiles[currentIndex];

  const primaryActivity = useMemo(() => {
    return (currentPerson?.activities ?? [])[0] || 'Aktivitet';
  }, [currentPerson]);

  const avatarEmoji = useMemo(() => {
    return getAvatarEmoji(primaryActivity, currentPerson?.avatar_emoji);
  }, [primaryActivity, currentPerson]);

  const overlapCount = useMemo(() => {
    if (!currentPerson) return 0;
    return getOverlapCount(myActivities, currentPerson.activities ?? []);
  }, [currentPerson, myActivities]);

  const sharedActivities = useMemo(() => {
    if (!currentPerson) return [];
    const mySet = new Set(myActivities);
    return (currentPerson.activities ?? []).filter((item) => mySet.has(item)).slice(0, 4);
  }, [currentPerson, myActivities]);

  const allActivities = (currentPerson?.activities ?? []).slice(0, 6);

  const handleAction = useCallback(
    async (action: 'like' | 'pass') => {
      if (!currentPerson || !currentUserId || actingRef.current) return;

      try {
        actingRef.current = true;
        setActing(true);

        let isMatch = false;
        const personName = currentPerson.name || 'personen';

        if (action === 'like') {
          const { data: reciprocalLike, error: reciprocalError } = await supabase
            .from('matches')
            .select('id')
            .eq('user_id', currentPerson.id)
            .eq('target_id', currentUserId)
            .eq('action', 'like')
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

          if (reciprocalError) throw reciprocalError;

          isMatch = !!reciprocalLike?.id;

          const { error: insertError } = await supabase.from('matches').insert({
            user_id: currentUserId,
            target_id: currentPerson.id,
            action: 'like',
            is_match: isMatch,
          });

          if (insertError) throw insertError;

          if (isMatch && reciprocalLike?.id) {
            const { error: updateError } = await supabase
              .from('matches')
              .update({ is_match: true })
              .eq('id', reciprocalLike.id);

            if (updateError) throw updateError;
          }
        } else {
          const { error: insertError } = await supabase.from('matches').insert({
            user_id: currentUserId,
            target_id: currentPerson.id,
            action: 'pass',
            is_match: false,
          });

          if (insertError) throw insertError;
        }

        await animateOut(action === 'like' ? 'right' : 'left');

        moveNext();
        resetCardPosition();

        if (action === 'like' && isMatch) {
          setMatchedName(personName);
          setMatchModalVisible(true);
        }
      } catch (error: any) {
        animateBack();
        Alert.alert(
          action === 'like' ? 'Kunde inte gilla' : 'Kunde inte passa',
          error?.message || 'Något gick fel.'
        );
      } finally {
        actingRef.current = false;
        setActing(false);
      }
    },
    [animateBack, animateOut, currentPerson, currentUserId, moveNext, resetCardPosition]
  );

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gestureState) => {
          return Math.abs(gestureState.dx) > 8 || Math.abs(gestureState.dy) > 8;
        },
        onPanResponderMove: (_, gestureState) => {
          if (actingRef.current) return;

          swipe.setValue({
            x: gestureState.dx,
            y: gestureState.dy * 0.08,
          });
        },
        onPanResponderRelease: (_, gestureState) => {
          if (actingRef.current) return;

          if (gestureState.dx > 110) {
            handleAction('like');
            return;
          }

          if (gestureState.dx < -110) {
            handleAction('pass');
            return;
          }

          animateBack();
        },
      }),
    [animateBack, handleAction, swipe]
  );

  const rotate = swipe.x.interpolate({
    inputRange: [-220, 0, 220],
    outputRange: ['-10deg', '0deg', '10deg'],
    extrapolate: 'clamp',
  });

  const likeOpacity = swipe.x.interpolate({
    inputRange: [0, 60, 130],
    outputRange: [0, 0.45, 1],
    extrapolate: 'clamp',
  });

  const passOpacity = swipe.x.interpolate({
    inputRange: [-130, -60, 0],
    outputRange: [1, 0.45, 0],
    extrapolate: 'clamp',
  });

  if (loading) {
    return (
      <View style={styles.stateCard}>
        <ActivityIndicator size="large" color={withuColors.coral} />
        <Text style={styles.stateTitle}>Laddar profiler...</Text>
        <Text style={styles.stateText}>
          Vi hämtar personer som matchar dina intressen och preferenser.
        </Text>
      </View>
    );
  }

  if (errorText) {
    return (
      <View style={styles.stateCard}>
        <Text style={styles.stateTitle}>Hitta kunde inte laddas</Text>
        <Text style={styles.stateText}>{errorText}</Text>

        <Pressable style={styles.primaryButton} onPress={loadProfiles}>
          <Text style={styles.primaryButtonText}>
            {refreshing ? 'Uppdaterar...' : 'Försök igen'}
          </Text>
        </Pressable>
      </View>
    );
  }

  if (missingProfileReason) {
    return (
      <View style={styles.stateCard}>
        <Text style={styles.stateTitle}>Komplettera din profil</Text>
        <Text style={styles.stateText}>{missingProfileReason}</Text>

        <Pressable style={styles.primaryButton} onPress={loadProfiles}>
          <Text style={styles.primaryButtonText}>
            {refreshing ? 'Uppdaterar...' : 'Ladda om'}
          </Text>
        </Pressable>
      </View>
    );
  }

  if (!currentPerson) {
    return (
      <View style={styles.stateCard}>
        <Text style={styles.stateTitle}>Inga profiler just nu</Text>
        <Text style={styles.stateText}>
          Det finns inga andra profiler som matchar dina aktiviteter och åldersfilter just nu.
        </Text>

        <Pressable style={styles.primaryButton} onPress={loadProfiles}>
          <Text style={styles.primaryButtonText}>
            {refreshing ? 'Uppdaterar...' : 'Ladda om'}
          </Text>
        </Pressable>
      </View>
    );
  }

  return (
    <>
      <Modal
        visible={matchModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setMatchModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.matchModal}>
            <Text style={styles.matchEmoji}>🎉</Text>
            <Text style={styles.matchTitle}>Det är en match!</Text>
            <Text style={styles.matchText}>
              Du och {matchedName} gillar varandra. Nu kan ni börja chatta.
            </Text>

            <Pressable
              style={styles.matchButton}
              onPress={() => setMatchModalVisible(false)}
            >
              <Text style={styles.matchButtonText}>Fortsätt</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <View style={styles.deckWrap}>
        <Animated.View
          {...panResponder.panHandlers}
          style={[
            styles.card,
            {
              transform: [{ translateX: swipe.x }, { translateY: swipe.y }, { rotate }],
            },
          ]}
        >
          <View style={styles.stampRow}>
            <Animated.View style={[styles.stamp, styles.stampLike, { opacity: likeOpacity }]}>
              <Text style={styles.stampLikeText}>GILLA</Text>
            </Animated.View>

            <Animated.View style={[styles.stamp, styles.stampPass, { opacity: passOpacity }]}>
              <Text style={styles.stampPassText}>PASSA</Text>
            </Animated.View>
          </View>

          <View style={styles.cardTopRow}>
            <View style={styles.avatarWrap}>
              <Text style={styles.avatarEmoji}>{avatarEmoji}</Text>
            </View>

            <View style={styles.topMetaWrap}>
              <View style={styles.badgeRow}>
                {currentPerson.is_bankid_verified ? (
                  <View style={[styles.badge, styles.badgeVerified]}>
                    <Text style={[styles.badgeText, styles.badgeTextVerified]}>
                      ✓ BankID
                    </Text>
                  </View>
                ) : (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>Profil</Text>
                  </View>
                )}

                {overlapCount > 0 ? (
                  <View style={[styles.badge, styles.badgeCoral]}>
                    <Text style={[styles.badgeText, styles.badgeTextCoral]}>
                      {overlapCount} gemensamma
                    </Text>
                  </View>
                ) : null}
              </View>
            </View>
          </View>

          <Text style={styles.name}>
            {currentPerson.name || 'Användare'}
            {currentPerson.age ? `, ${currentPerson.age}` : ''}
          </Text>

          <Text style={styles.metaLine}>
            {currentPerson.city ? `📍 ${currentPerson.city}` : '📍 Plats saknas'}
            {currentPerson.age_group ? ` · ${currentPerson.age_group}` : ''}
            {primaryActivity ? ` · ${primaryActivity}` : ''}
          </Text>

          {!!currentPerson.bio?.trim() && (
            <Text style={styles.bio}>{currentPerson.bio}</Text>
          )}

          {sharedActivities.length > 0 ? (
            <>
              <Text style={styles.sectionTitle}>Ni båda gillar</Text>
              <View style={styles.pillsWrap}>
                {sharedActivities.map((item) => (
                  <View key={`shared-${item}`} style={[styles.activityPill, styles.sharedPill]}>
                    <Text style={[styles.activityPillText, styles.sharedPillText]}>{item}</Text>
                  </View>
                ))}
              </View>
            </>
          ) : null}

          <Text style={styles.sectionTitle}>Intressen</Text>
          <View style={styles.pillsWrap}>
            {allActivities.map((item) => (
              <View key={item} style={styles.activityPill}>
                <Text style={styles.activityPillText}>{item}</Text>
              </View>
            ))}
          </View>

          <View style={styles.hintRow}>
            <Text style={styles.hintText}>Svep vänster för att passa</Text>
            <Text style={styles.hintText}>Svep höger för att gilla</Text>
          </View>

          <View style={styles.actionsRow}>
            <Pressable
              style={[styles.actionButton, styles.passButton, acting && styles.buttonDisabled]}
              onPress={() => handleAction('pass')}
              disabled={acting}
            >
              <Text style={styles.passButtonText}>{acting ? 'Vänta...' : '✕ Passa'}</Text>
            </Pressable>

            <Pressable
              style={[styles.actionButton, styles.likeButton, acting && styles.buttonDisabled]}
              onPress={() => handleAction('like')}
              disabled={acting}
            >
              <Text style={styles.likeButtonText}>{acting ? 'Vänta...' : '💙 Gilla'}</Text>
            </Pressable>
          </View>
        </Animated.View>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  deckWrap: {
    minHeight: 620,
  },
  card: {
    backgroundColor: withuColors.white,
    borderRadius: withuRadius.xl,
    borderWidth: 1,
    borderColor: withuColors.line,
    padding: withuSpacing.xl,
    ...withuShadows.card,
  },
  stampRow: {
    position: 'absolute',
    top: 22,
    left: 20,
    right: 20,
    zIndex: 5,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  stamp: {
    borderWidth: 3,
    borderRadius: 14,
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: withuColors.white,
  },
  stampLike: {
    borderColor: withuColors.success,
    transform: [{ rotate: '-10deg' }],
  },
  stampPass: {
    borderColor: withuColors.coral,
    transform: [{ rotate: '10deg' }],
  },
  stampLikeText: {
    color: withuColors.success,
    fontSize: 18,
    fontWeight: '900',
  },
  stampPassText: {
    color: withuColors.coral,
    fontSize: 18,
    fontWeight: '900',
  },
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 18,
    marginTop: 28,
  },
  avatarWrap: {
    width: 78,
    height: 78,
    borderRadius: 39,
    backgroundColor: withuColors.coralBg,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#F0D9D4',
  },
  avatarEmoji: {
    fontSize: 36,
  },
  topMetaWrap: {
    flex: 1,
    alignItems: 'flex-end',
    marginLeft: 12,
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
  },
  badge: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: withuColors.soft,
    marginLeft: 8,
    marginBottom: 8,
  },
  badgeVerified: {
    backgroundColor: withuColors.successBg,
  },
  badgeCoral: {
    backgroundColor: withuColors.coralBg,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: withuColors.muted,
  },
  badgeTextVerified: {
    color: withuColors.success,
  },
  badgeTextCoral: {
    color: withuColors.coral,
  },
  name: {
    fontSize: 34,
    fontWeight: '900',
    color: withuColors.navy,
    marginBottom: 8,
    lineHeight: 40,
  },
  metaLine: {
    fontSize: 15,
    color: withuColors.muted,
    marginBottom: 16,
    lineHeight: 22,
  },
  bio: {
    fontSize: 15,
    lineHeight: 24,
    color: '#444444',
    marginBottom: 18,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: withuColors.muted,
    marginBottom: 10,
  },
  pillsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 18,
  },
  activityPill: {
    backgroundColor: withuColors.soft,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginRight: 8,
    marginBottom: 8,
  },
  sharedPill: {
    backgroundColor: withuColors.coralBg,
  },
  activityPillText: {
    color: withuColors.navy,
    fontSize: 12,
    fontWeight: '700',
  },
  sharedPillText: {
    color: withuColors.coral,
  },
  hintRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 2,
    marginBottom: 14,
  },
  hintText: {
    color: withuColors.muted,
    fontSize: 11,
    fontWeight: '600',
  },
  actionsRow: {
    flexDirection: 'row',
    marginTop: 6,
  },
  actionButton: {
    flex: 1,
    minHeight: 58,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  passButton: {
    backgroundColor: '#FCEAEA',
    borderWidth: 1,
    borderColor: '#F2C8C8',
    marginRight: 10,
  },
  likeButton: {
    backgroundColor: withuColors.coral,
  },
  passButtonText: {
    color: withuColors.navy,
    fontSize: 16,
    fontWeight: '800',
  },
  likeButtonText: {
    color: withuColors.white,
    fontSize: 16,
    fontWeight: '800',
  },
  buttonDisabled: {
    opacity: 0.65,
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
  primaryButton: {
    backgroundColor: withuColors.coral,
    borderRadius: 999,
    paddingVertical: 16,
    paddingHorizontal: 24,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 180,
  },
  primaryButtonText: {
    color: withuColors.white,
    fontSize: 16,
    fontWeight: '800',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(10, 16, 28, 0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  matchModal: {
    width: '100%',
    backgroundColor: withuColors.white,
    borderRadius: withuRadius.xl,
    padding: withuSpacing.xxl,
    alignItems: 'center',
    ...withuShadows.card,
  },
  matchEmoji: {
    fontSize: 52,
    marginBottom: 10,
  },
  matchTitle: {
    fontSize: 28,
    fontWeight: '900',
    color: withuColors.navy,
    marginBottom: 10,
    textAlign: 'center',
  },
  matchText: {
    color: '#555555',
    fontSize: 15,
    lineHeight: 24,
    textAlign: 'center',
    marginBottom: 20,
  },
  matchButton: {
    backgroundColor: withuColors.coral,
    borderRadius: 999,
    paddingVertical: 15,
    paddingHorizontal: 28,
    minWidth: 180,
    alignItems: 'center',
  },
  matchButtonText: {
    color: withuColors.white,
    fontSize: 16,
    fontWeight: '800',
  },
});