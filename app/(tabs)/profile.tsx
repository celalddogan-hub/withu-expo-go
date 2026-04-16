import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { ACTIVITY_CATEGORIES } from '../../constants/activities';
import { useAppStore } from '../../src/store/useAppStore';
import { supabase } from '../../src/lib/supabase';

type ProfileRow = {
  id: string;
  name: string | null;
  city: string | null;
  age: number | null;
  bio: string | null;
  activities: string[] | null;
  avatar_emoji: string | null;
  is_bankid_verified: boolean | null;
  preferred_age_min: number | null;
  preferred_age_max: number | null;
};

function getProfileEmoji(activity?: string) {
  const value = (activity || '').toLowerCase();

  if (value.includes('kafé') || value.includes('fika') || value.includes('lunch')) return '☕';
  if (value.includes('promenad') || value.includes('löpning') || value.includes('cykling')) return '🚶';
  if (value.includes('stud') || value.includes('språk') || value.includes('plugg')) return '📚';
  if (value.includes('träning') || value.includes('gym') || value.includes('yoga')) return '💪';
  if (value.includes('spel') || value.includes('rollspel')) return '🎲';
  if (value.includes('film') || value.includes('konsert')) return '🎬';

  return '🙂';
}

export default function ProfileScreen() {
  const router = useRouter();

  const profileName = useAppStore((s) => s.profileName);
  const profileCity = useAppStore((s) => s.profileCity);
  const selectedActivities = useAppStore((s) => s.selectedActivities);

  const setProfileName = useAppStore((s) => s.setProfileName);
  const setProfileCity = useAppStore((s) => s.setProfileCity);
  const setSelectedActivities = useAppStore((s) => s.setSelectedActivities);
  const toggleSelectedActivity = useAppStore((s) => s.toggleSelectedActivity);

  const [aboutMe, setAboutMe] = useState('');
  const [age, setAge] = useState('');
  const [preferredAgeMin, setPreferredAgeMin] = useState('18');
  const [preferredAgeMax, setPreferredAgeMax] = useState('99');
  const [currentUserEmail, setCurrentUserEmail] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);

  const loadProfile = useCallback(async () => {
    try {
      setLoadingProfile(true);

      const {
        data: { user },
      } = await supabase.auth.getUser();

      setCurrentUserEmail(user?.email ?? null);

      if (!user) {
        setLoadingProfile(false);
        return;
      }

      const { data, error } = await supabase
        .from('profiles')
        .select(
          'id, name, city, age, bio, activities, avatar_emoji, is_bankid_verified, preferred_age_min, preferred_age_max'
        )
        .eq('id', user.id)
        .maybeSingle();

      if (error) {
        throw error;
      }

      const profile = data as ProfileRow | null;

      if (profile) {
        setProfileName(profile.name ?? '');
        setProfileCity(profile.city ?? '');
        setAge(profile.age != null ? String(profile.age) : '');
        setAboutMe(profile.bio ?? '');
        setSelectedActivities(profile.activities ?? []);
        setPreferredAgeMin(
          profile.preferred_age_min != null ? String(profile.preferred_age_min) : '18'
        );
        setPreferredAgeMax(
          profile.preferred_age_max != null ? String(profile.preferred_age_max) : '99'
        );
      }
    } catch (error: any) {
      Alert.alert('Kunde inte ladda profilen', error?.message || 'Något gick fel.');
    } finally {
      setLoadingProfile(false);
    }
  }, [setProfileCity, setProfileName, setSelectedActivities]);

  useEffect(() => {
    loadProfile();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      loadProfile();
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [loadProfile]);

  const selectedEmoji = useMemo(() => {
    return getProfileEmoji(selectedActivities[0]);
  }, [selectedActivities]);

  const profileCompletion = useMemo(() => {
    let points = 0;
    if (profileName.trim()) points += 1;
    if (profileCity.trim()) points += 1;
    if (aboutMe.trim()) points += 1;
    if (selectedActivities.length > 0) points += 1;
    if (age.trim()) points += 1;
    if (preferredAgeMin.trim() && preferredAgeMax.trim()) points += 1;

    return Math.round((points / 6) * 100);
  }, [profileName, profileCity, aboutMe, selectedActivities, age, preferredAgeMin, preferredAgeMax]);

  const handleActivityPress = (item: string) => {
    const isSelected = selectedActivities.includes(item);

    if (!isSelected && selectedActivities.length >= 15) {
      Alert.alert('Max 15 aktiviteter', 'Du kan välja högst 15 aktiviteter i profilen.');
      return;
    }

    toggleSelectedActivity(item);
    setSaved(false);
  };

  const handleSave = async () => {
    try {
      setSavingProfile(true);

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        Alert.alert('Inte inloggad', 'Du måste logga in först.');
        return;
      }

      const parsedAge = age.trim() ? Number(age.trim()) : null;
      const parsedPreferredMin = preferredAgeMin.trim()
        ? Number(preferredAgeMin.trim())
        : null;
      const parsedPreferredMax = preferredAgeMax.trim()
        ? Number(preferredAgeMax.trim())
        : null;

      if (parsedAge !== null && (Number.isNaN(parsedAge) || parsedAge < 13 || parsedAge > 120)) {
        Alert.alert('Ogiltig ålder', 'Skriv en giltig ålder mellan 13 och 120.');
        return;
      }

      if (
        parsedPreferredMin === null ||
        parsedPreferredMax === null ||
        Number.isNaN(parsedPreferredMin) ||
        Number.isNaN(parsedPreferredMax)
      ) {
        Alert.alert('Åldersfilter saknas', 'Fyll i både min och max ålder för matchning.');
        return;
      }

      if (parsedPreferredMin < 13 || parsedPreferredMin > 120) {
        Alert.alert('Ogiltig minålder', 'Minåldern måste vara mellan 13 och 120.');
        return;
      }

      if (parsedPreferredMax < 13 || parsedPreferredMax > 120) {
        Alert.alert('Ogiltig maxålder', 'Maxåldern måste vara mellan 13 och 120.');
        return;
      }

      if (parsedPreferredMin > parsedPreferredMax) {
        Alert.alert('Fel åldersintervall', 'Minåldern kan inte vara högre än maxåldern.');
        return;
      }

      const avatarEmoji = getProfileEmoji(selectedActivities[0]);

      const { error } = await supabase.from('profiles').upsert(
        {
          id: user.id,
          name: profileName.trim(),
          city: profileCity.trim(),
          age: parsedAge,
          bio: aboutMe.trim(),
          activities: selectedActivities,
          avatar_emoji: avatarEmoji,
          preferred_age_min: parsedPreferredMin,
          preferred_age_max: parsedPreferredMax,
        },
        { onConflict: 'id' }
      );

      if (error) {
        throw error;
      }

      setSaved(true);

      setTimeout(() => {
        setSaved(false);
      }, 1800);
    } catch (error: any) {
      Alert.alert('Kunde inte spara profilen', error?.message || 'Något gick fel.');
    } finally {
      setSavingProfile(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setCurrentUserEmail(null);
    Alert.alert('Utloggad', 'Du är nu utloggad.');
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.pageTitle}>Profil</Text>
      <Text style={styles.pageSubtitle}>Din profil och hur andra ser dig</Text>

      <View style={styles.heroCard}>
        <View style={styles.avatarCircle}>
          <Text style={styles.avatarEmoji}>{selectedEmoji}</Text>
        </View>

        <Text style={styles.heroName}>{profileName || 'Ditt namn'}</Text>

        <View style={styles.verifiedBadge}>
          <Text style={styles.verifiedBadgeText}>✓ BankID-verifierad</Text>
        </View>

        <Text style={styles.heroMeta}>
          {profileCity ? profileCity : 'Lägg till din plats'}
        </Text>

        {currentUserEmail ? (
          <Text style={styles.heroEmail}>{currentUserEmail}</Text>
        ) : (
          <Pressable style={styles.loginButton} onPress={() => router.push('/login')}>
            <Text style={styles.loginButtonText}>Öppna login</Text>
          </Pressable>
        )}
      </View>

      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <Text style={styles.statNumber}>{selectedActivities.length}/15</Text>
          <Text style={styles.statLabel}>Aktiviteter</Text>
        </View>

        <View style={styles.statCard}>
          <Text style={styles.statNumber}>{profileCompletion}%</Text>
          <Text style={styles.statLabel}>Profil klar</Text>
        </View>

        <View style={styles.statCard}>
          <Text style={styles.statNumber}>{currentUserEmail ? 'På' : 'Av'}</Text>
          <Text style={styles.statLabel}>Konto</Text>
        </View>
      </View>

      <View style={styles.accountCard}>
        <Text style={styles.sectionTitle}>Konto</Text>

        <View style={styles.accountButtonsRow}>
          <Pressable
            style={[styles.accountButton, styles.secondaryAccountButton]}
            onPress={() => router.push('/login')}
          >
            <Text style={styles.secondaryAccountButtonText}>
              Skapa konto / Byt konto
            </Text>
          </Pressable>

          <Pressable
            style={[styles.accountButton, styles.logoutButton]}
            onPress={handleLogout}
          >
            <Text style={styles.logoutButtonText}>Logga ut</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Grunduppgifter</Text>

        <Text style={styles.label}>Namn</Text>
        <TextInput
          value={profileName}
          onChangeText={(value) => {
            setProfileName(value);
            setSaved(false);
          }}
          placeholder="Skriv ditt namn"
          placeholderTextColor="#7A8AAA"
          style={styles.input}
        />

        <Text style={styles.label}>Plats</Text>
        <TextInput
          value={profileCity}
          onChangeText={(value) => {
            setProfileCity(value);
            setSaved(false);
          }}
          placeholder="Skriv din stad"
          placeholderTextColor="#7A8AAA"
          style={styles.input}
        />

        <Text style={styles.label}>Ålder</Text>
        <TextInput
          value={age}
          onChangeText={(value) => {
            const onlyNumbers = value.replace(/[^0-9]/g, '');
            setAge(onlyNumbers);
            setSaved(false);
          }}
          placeholder="Skriv din ålder"
          placeholderTextColor="#7A8AAA"
          keyboardType="number-pad"
          style={styles.input}
        />

        <Text style={styles.label}>Om mig</Text>
        <TextInput
          value={aboutMe}
          onChangeText={(value) => {
            setAboutMe(value);
            setSaved(false);
          }}
          placeholder="Beskriv dig själv kort"
          placeholderTextColor="#7A8AAA"
          style={[styles.input, styles.textArea]}
          multiline
        />
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Åldersfilter för matchning</Text>
        <Text style={styles.helperText}>
          Välj vilka åldrar du vill kunna matcha med.
        </Text>

        <View style={styles.ageRangeRow}>
          <View style={styles.ageRangeBox}>
            <Text style={styles.label}>Min ålder</Text>
            <TextInput
              value={preferredAgeMin}
              onChangeText={(value) => {
                const onlyNumbers = value.replace(/[^0-9]/g, '');
                setPreferredAgeMin(onlyNumbers);
                setSaved(false);
              }}
              placeholder="18"
              placeholderTextColor="#7A8AAA"
              keyboardType="number-pad"
              style={styles.input}
            />
          </View>

          <View style={styles.ageRangeBox}>
            <Text style={styles.label}>Max ålder</Text>
            <TextInput
              value={preferredAgeMax}
              onChangeText={(value) => {
                const onlyNumbers = value.replace(/[^0-9]/g, '');
                setPreferredAgeMax(onlyNumbers);
                setSaved(false);
              }}
              placeholder="99"
              placeholderTextColor="#7A8AAA"
              keyboardType="number-pad"
              style={styles.input}
            />
          </View>
        </View>
      </View>

      <View style={styles.card}>
        <View style={styles.activitiesHeader}>
          <Text style={styles.sectionTitle}>Välj aktiviteter</Text>

          <View style={styles.activitiesCountBadge}>
            <Text style={styles.activitiesCount}>{selectedActivities.length}/15 valda</Text>
          </View>
        </View>

        <Text style={styles.helperText}>
          Välj upp till 15 aktiviteter som beskriver vad du gillar att göra.
        </Text>

        <View style={styles.selectedActivitiesBox}>
          {selectedActivities.length > 0 ? (
            selectedActivities.map((item) => (
              <View key={item} style={styles.selectedActivityChip}>
                <Text style={styles.selectedActivityChipText}>{item}</Text>
              </View>
            ))
          ) : (
            <Text style={styles.selectedActivitiesPlaceholder}>
              Inga aktiviteter valda ännu.
            </Text>
          )}
        </View>

        {ACTIVITY_CATEGORIES.map((category) => (
          <View key={category.id} style={styles.categoryCard}>
            <View style={styles.categoryHeader}>
              <View style={styles.categoryEmojiBadge}>
                <Text style={styles.categoryEmojiText}>{category.emoji}</Text>
              </View>

              <Text style={styles.categoryTitle}>{category.title}</Text>
            </View>

            <View style={styles.chipsWrap}>
              {category.items.map((item) => {
                const active = selectedActivities.includes(item);

                return (
                  <Pressable
                    key={item}
                    style={[styles.chip, active && styles.chipActive]}
                    onPress={() => handleActivityPress(item)}
                  >
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>
                      {item}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        ))}

        <Pressable
          style={[styles.saveButton, savingProfile && styles.saveButtonDisabled]}
          onPress={handleSave}
          disabled={savingProfile || loadingProfile}
        >
          <Text style={styles.saveButtonText}>
            {savingProfile ? 'Sparar...' : saved ? '✓ Sparat!' : 'Spara profil'}
          </Text>
        </Pressable>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Förhandsvisning</Text>

        <View style={styles.previewTop}>
          <View style={styles.previewAvatar}>
            <Text style={styles.previewAvatarEmoji}>{selectedEmoji}</Text>
          </View>

          <View style={styles.previewInfo}>
            <Text style={styles.previewName}>
              {profileName || 'Ditt namn'}
              {age.trim() ? `, ${age}` : ''}
            </Text>
            <Text style={styles.previewCity}>
              {profileCity || 'Din plats'}
            </Text>
          </View>
        </View>

        <Text style={styles.previewAbout}>
          {aboutMe.trim() || 'Din korta profiltext kommer att visas här.'}
        </Text>

        <Text style={styles.previewMatchRange}>
          Vill matcha med: {preferredAgeMin || '-'}–{preferredAgeMax || '-'} år
        </Text>

        <View style={styles.previewChips}>
          {selectedActivities.length > 0 ? (
            selectedActivities.map((item) => (
              <View key={item} style={styles.previewChip}>
                <Text style={styles.previewChipText}>{item}</Text>
              </View>
            ))
          ) : (
            <Text style={styles.previewHint}>Välj aktiviteter för att se dem här.</Text>
          )}
        </View>

        {loadingProfile ? (
          <Text style={styles.loadingText}>Laddar profil från servern...</Text>
        ) : null}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F0F2F8',
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 64,
    paddingBottom: 40,
  },
  pageTitle: {
    color: '#1B2B4B',
    fontSize: 30,
    fontWeight: '800',
    marginBottom: 4,
  },
  pageSubtitle: {
    color: '#7A8AAA',
    fontSize: 14,
    marginBottom: 18,
  },
  heroCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#DDE2EF',
    padding: 24,
    alignItems: 'center',
    marginBottom: 16,
    shadowColor: '#1B2B4B',
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  avatarCircle: {
    width: 104,
    height: 104,
    borderRadius: 52,
    backgroundColor: '#EEF1F8',
    borderWidth: 2,
    borderColor: '#1C5E52',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  avatarEmoji: {
    fontSize: 48,
  },
  heroName: {
    color: '#1B2B4B',
    fontSize: 28,
    fontWeight: '800',
    marginBottom: 10,
    textAlign: 'center',
  },
  verifiedBadge: {
    backgroundColor: '#E8F4F0',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginBottom: 10,
  },
  verifiedBadgeText: {
    color: '#1C5E52',
    fontSize: 13,
    fontWeight: '800',
  },
  heroMeta: {
    color: '#7A8AAA',
    fontSize: 15,
    marginBottom: 6,
    textAlign: 'center',
  },
  heroEmail: {
    color: '#7A8AAA',
    fontSize: 13,
    textAlign: 'center',
  },
  loginButton: {
    marginTop: 6,
    backgroundColor: '#1C5E52',
    borderRadius: 14,
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  loginButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#DDE2EF',
    paddingVertical: 18,
    alignItems: 'center',
    marginHorizontal: 4,
    shadowColor: '#1B2B4B',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  statNumber: {
    color: '#1B2B4B',
    fontSize: 24,
    fontWeight: '800',
    marginBottom: 4,
  },
  statLabel: {
    color: '#7A8AAA',
    fontSize: 12,
    fontWeight: '700',
  },
  accountCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#DDE2EF',
    padding: 22,
    marginBottom: 16,
    shadowColor: '#1B2B4B',
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  accountButtonsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  accountButton: {
    flex: 1,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryAccountButton: {
    backgroundColor: '#EEF1F8',
    borderWidth: 1,
    borderColor: '#DDE2EF',
  },
  secondaryAccountButtonText: {
    color: '#1B2B4B',
    fontSize: 14,
    fontWeight: '800',
    textAlign: 'center',
  },
  logoutButton: {
    backgroundColor: '#FCEAEA',
    borderWidth: 1,
    borderColor: '#F2C8C8',
  },
  logoutButtonText: {
    color: '#B42318',
    fontSize: 14,
    fontWeight: '800',
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#DDE2EF',
    padding: 22,
    marginBottom: 16,
    shadowColor: '#1B2B4B',
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  sectionTitle: {
    color: '#1B2B4B',
    fontSize: 24,
    fontWeight: '800',
    marginBottom: 14,
  },
  helperText: {
    color: '#7A8AAA',
    fontSize: 14,
    lineHeight: 22,
    marginBottom: 12,
  },
  label: {
    color: '#1B2B4B',
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 8,
    marginTop: 4,
  },
  input: {
    backgroundColor: '#F0F2F8',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#DDE2EF',
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: '#1B2B4B',
    fontSize: 15,
    marginBottom: 14,
  },
  textArea: {
    minHeight: 110,
    textAlignVertical: 'top',
  },
  ageRangeRow: {
    flexDirection: 'row',
    gap: 12,
  },
  ageRangeBox: {
    flex: 1,
  },
  activitiesHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  activitiesCountBadge: {
    backgroundColor: '#FEF4E8',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  activitiesCount: {
    color: '#C07020',
    fontSize: 12,
    fontWeight: '800',
  },
  selectedActivitiesBox: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#DDE2EF',
    borderRadius: 18,
    padding: 12,
    marginBottom: 10,
  },
  selectedActivityChip: {
    backgroundColor: '#E8F4F0',
    borderWidth: 1,
    borderColor: '#1C5E52',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 7,
    marginRight: 8,
    marginBottom: 8,
  },
  selectedActivityChipText: {
    color: '#1C5E52',
    fontSize: 13,
    fontWeight: '800',
  },
  selectedActivitiesPlaceholder: {
    color: '#7A8AAA',
    fontSize: 14,
  },
  categoryCard: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E7ECF5',
    borderRadius: 18,
    padding: 14,
    marginTop: 12,
  },
  categoryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  categoryEmojiBadge: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#EEF1F8',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  categoryEmojiText: {
    fontSize: 16,
  },
  categoryTitle: {
    color: '#1B2B4B',
    fontSize: 16,
    fontWeight: '800',
    flex: 1,
  },
  chipsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  chip: {
    backgroundColor: '#F7F9FC',
    borderWidth: 1,
    borderColor: '#DDE2EF',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginRight: 8,
    marginBottom: 8,
  },
  chipActive: {
    backgroundColor: '#E8F4F0',
    borderColor: '#1C5E52',
  },
  chipText: {
    color: '#1B2B4B',
    fontSize: 13,
    fontWeight: '700',
  },
  chipTextActive: {
    color: '#1C5E52',
  },
  saveButton: {
    backgroundColor: '#1C5E52',
    borderRadius: 16,
    paddingVertical: 17,
    alignItems: 'center',
    marginTop: 18,
    shadowColor: '#1C5E52',
    shadowOpacity: 0.18,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
  },
  previewTop: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },
  previewAvatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#EEF1F8',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  previewAvatarEmoji: {
    fontSize: 30,
  },
  previewInfo: {
    flex: 1,
  },
  previewName: {
    color: '#1B2B4B',
    fontSize: 22,
    fontWeight: '800',
    marginBottom: 2,
  },
  previewCity: {
    color: '#7A8AAA',
    fontSize: 14,
  },
  previewAbout: {
    color: '#333333',
    fontSize: 15,
    lineHeight: 24,
    marginBottom: 14,
  },
  previewMatchRange: {
    color: '#1B2B4B',
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 14,
  },
  previewChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  previewChip: {
    backgroundColor: '#EEF1F8',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginRight: 8,
    marginBottom: 8,
  },
  previewChipText: {
    color: '#1B2B4B',
    fontSize: 13,
    fontWeight: '800',
  },
  previewHint: {
    color: '#7A8AAA',
    fontSize: 14,
  },
  loadingText: {
    color: '#7A8AAA',
    fontSize: 13,
    marginTop: 8,
  },
});