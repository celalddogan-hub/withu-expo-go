import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { supabase } from '../../src/lib/supabase';
import VolunteerStatusCard from '../../src/components/volunteer/VolunteerStatusCard';
import { checkContentSafety, getContentSafetyAlert } from '../../src/lib/contentSafety';

type Category = {
  title: string;
  emoji: string;
  items: string[];
};

type ProfileRow = {
  id: string;
  name: string | null;
  city: string | null;
  country: string | null;
  age: number | null;
  bio: string | null;
  avatar_url: string | null;
  min_age: number | null;
  max_age: number | null;
  activities: string[] | null;
  is_bankid_verified: boolean | null;
};

const ACTIVITY_CATEGORIES: Category[] = [
  {
    title: 'Fika & Samtal',
    emoji: '☕️',
    items: ['Kafébesök', 'Lunch', 'Promenad', 'Bara prata'],
  },
  {
    title: 'Gaming & Fritid',
    emoji: '🎮',
    items: ['Datorspel', 'Brädspel', 'Rollspel', 'Escape room'],
  },
  {
    title: 'Studier & Tandem',
    emoji: '📚',
    items: ['Läxhjälp', 'Språkbyte', 'Studiecirkel', 'Pluggsällskap'],
  },
  {
    title: 'Träning & Sport',
    emoji: '💪',
    items: ['Löpning', 'Gym', 'Yoga', 'Padel', 'Cykling', 'Simning'],
  },
  {
    title: 'Musik & Kultur',
    emoji: '🎸',
    items: ['Konserter', 'Replokal', 'Teater'],
  },
  {
    title: 'Kreativitet',
    emoji: '🎨',
    items: ['Foto', 'Konst', 'Skrivande', 'Design', 'Hantverk'],
  },
  {
    title: 'Familj & Föräldrar',
    emoji: '👨‍👩‍👧‍👦',
    items: ['Lekpark', 'Föräldraträff', 'Barnaktiviteter'],
  },
  {
    title: 'Språk & Kultur',
    emoji: '🌍',
    items: ['Kulturutbyte', 'Integration', 'Språkcafé'],
  },
  {
    title: 'Senior & Hembesök',
    emoji: '🧓',
    items: ['Sällskap hemma', 'Promenad', 'Berättarstund'],
  },
  {
    title: 'Bara Prata',
    emoji: '💬',
    items: ['Telefonsamtal', 'Videosamtal', 'Anonymt stöd'],
  },
];

const MAX_ACTIVITIES = 15;
const DEFAULT_MIN_AGE = '18';
const DEFAULT_MAX_AGE = '99';
const DELETE_CONFIRM_TEXT = 'TA BORT';

export default function ProfileScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();

  const isWide = width >= 900;
  const isTablet = width >= 700;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);

  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
  const [deleteConfirmValue, setDeleteConfirmValue] = useState('');

  const [currentUserId, setCurrentUserId] = useState('');
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [city, setCity] = useState('');
  const [country, setCountry] = useState('Sverige');
  const [age, setAge] = useState('');
  const [bio, setBio] = useState('');
  const [minAge, setMinAge] = useState(DEFAULT_MIN_AGE);
  const [maxAge, setMaxAge] = useState(DEFAULT_MAX_AGE);
  const [selectedActivities, setSelectedActivities] = useState<string[]>([]);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  const [isBankIdVerified, setIsBankIdVerified] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  const completionPercent = useMemo(() => {
    const checks = [
      name.trim().length > 1,
      city.trim().length > 1,
      Number(age) > 0,
      bio.trim().length > 10,
      Number(minAge) > 0,
      Number(maxAge) >= Number(minAge),
      selectedActivities.length > 0,
      !!avatarUrl,
    ];
    const completed = checks.filter(Boolean).length;
    return Math.round((completed / checks.length) * 100);
  }, [name, city, age, bio, minAge, maxAge, selectedActivities, avatarUrl]);

  const visibleActivities = selectedActivities.slice(0, isTablet ? 12 : 8);
  const hiddenActivities = Math.max(0, selectedActivities.length - visibleActivities.length);

  const canConfirmDelete =
    deleteConfirmValue.trim().toUpperCase() === DELETE_CONFIRM_TEXT && !deletingAccount;

  useEffect(() => {
    loadProfile();
  }, []);

  async function loadProfile() {
    try {
      setLoading(true);

      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError) throw authError;

      if (!authData.user) {
        router.replace('/login');
        return;
      }

      setCurrentUserId(authData.user.id);
      setEmail(authData.user.email ?? '');

      const [{ data: profileData, error: profileError }, { data: adminData, error: adminError }] =
        await Promise.all([
          supabase
            .from('profiles')
            .select(
              'id, name, city, country, age, bio, avatar_url, min_age, max_age, activities, is_bankid_verified'
            )
            .eq('id', authData.user.id)
            .single(),
          supabase.from('admins').select('user_id').eq('user_id', authData.user.id).maybeSingle(),
        ]);

      if (profileError && profileError.code !== 'PGRST116') {
        throw profileError;
      }

      if (adminError) {
        throw adminError;
      }

      const profile = profileData as ProfileRow | null;

      setIsAdmin(!!adminData);

      if (profile) {
        setName(profile.name ?? '');
        setCity(profile.city ?? '');
        setCountry(profile.country ?? 'Sverige');
        setAge(profile.age ? String(profile.age) : '');
        setBio(profile.bio ?? '');
        setAvatarUrl(profile.avatar_url ?? null);
        setMinAge(profile.min_age ? String(profile.min_age) : DEFAULT_MIN_AGE);
        setMaxAge(profile.max_age ? String(profile.max_age) : DEFAULT_MAX_AGE);
        setSelectedActivities(profile.activities ?? []);
        setIsBankIdVerified(!!profile.is_bankid_verified);
      } else {
        setIsBankIdVerified(false);
      }
    } catch (error: any) {
      Alert.alert('Fel', error?.message ?? 'Kunde inte ladda profilen.');
    } finally {
      setLoading(false);
    }
  }

  function toggleActivity(activity: string) {
    setSelectedActivities((current) => {
      const exists = current.includes(activity);

      if (exists) {
        return current.filter((item) => item !== activity);
      }

      if (current.length >= MAX_ACTIVITIES) {
        Alert.alert('Max antal aktiviteter', `Du kan välja upp till ${MAX_ACTIVITIES} aktiviteter.`);
        return current;
      }

      return [...current, activity];
    });
  }

  async function pickAndUploadAvatar() {
    try {
      setUploadingAvatar(true);

      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError || !authData.user) {
        Alert.alert('Inte inloggad', 'Logga in igen och försök på nytt.');
        return;
      }

      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert(
          'Tillåt bilder',
          'WithU behöver tillgång till dina bilder för att kunna lägga till en profilbild.'
        );
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'] as any,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.82,
      });

      if (result.canceled || !result.assets?.length) return;

      const asset = result.assets[0];
      const fileExt = asset.fileName?.split('.').pop()?.toLowerCase() || 'jpg';
      const filePath = `${authData.user.id}/avatar-${Date.now()}.${fileExt}`;

      const response = await fetch(asset.uri);
      const arrayBuffer = await response.arrayBuffer();

      const { error: uploadError } = await supabase.storage
        .from('profile-images')
        .upload(filePath, arrayBuffer, {
          contentType: asset.mimeType ?? 'image/jpeg',
          upsert: true,
        });

      if (uploadError) throw uploadError;

      const { data: publicUrlData } = supabase.storage.from('profile-images').getPublicUrl(filePath);

      const publicUrl = publicUrlData.publicUrl;
      const timestamp = new Date().toISOString();

      const { data: updatedRow, error: updateError } = await supabase
        .from('profiles')
        .update({
          avatar_url: publicUrl,
          updated_at: timestamp,
        })
        .eq('id', authData.user.id)
        .select('id')
        .maybeSingle();

      if (updateError) throw updateError;

      if (!updatedRow) {
        if (!name.trim()) {
          throw new Error('Fyll i namn och spara profil först innan du lägger till bild.');
        }

        const { error: insertError } = await supabase.from('profiles').insert({
          id: authData.user.id,
          name: name.trim(),
          city: city.trim() || null,
          age: age ? Number(age) : null,
          bio: bio.trim() || null,
          avatar_url: publicUrl,
          min_age: minAge ? Number(minAge) : 18,
          max_age: maxAge ? Number(maxAge) : 99,
          activities: selectedActivities,
          updated_at: timestamp,
        });

        if (insertError) throw insertError;
      }

      setAvatarUrl(publicUrl);
      Alert.alert('Klart', 'Profilbilden är uppladdad.');
    } catch (error: any) {
      Alert.alert(
        'Kunde inte ladda upp bild',
        error?.message ?? 'Något gick fel. Försök igen.'
      );
    } finally {
      setUploadingAvatar(false);
    }
  }

  async function removeAvatar() {
    try {
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError || !authData.user) {
        Alert.alert('Inte inloggad', 'Logga in igen och försök på nytt.');
        return;
      }

      const { error } = await supabase
        .from('profiles')
        .update({
          avatar_url: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', authData.user.id);

      if (error) throw error;

      setAvatarUrl(null);
    } catch (error: any) {
      Alert.alert('Kunde inte ta bort bild', error?.message ?? 'Något gick fel. Försök igen.');
    }
  }

  async function saveProfile() {
    try {
      const ageNumber = Number(age);
      const minAgeNumber = Number(minAge);
      const maxAgeNumber = Number(maxAge);

      if (!name.trim()) {
        Alert.alert('Namn saknas', 'Fyll i ditt namn.');
        return;
      }

      if (!city.trim()) {
        Alert.alert('Stad saknas', 'Fyll i vilken stad du bor i.');
        return;
      }

      if (!country.trim()) {
        Alert.alert('Land saknas', 'Fyll i vilket land du bor i.');
        return;
      }

      if (!ageNumber || ageNumber < 18 || ageNumber > 99) {
        Alert.alert('Ogiltig ålder', 'Ålder måste vara mellan 18 och 99.');
        return;
      }

      if (minAgeNumber < 18 || maxAgeNumber > 99 || minAgeNumber > maxAgeNumber) {
        Alert.alert('Ogiltigt åldersspann', 'Kontrollera åldersfiltret.');
        return;
      }

      const safety = checkContentSafety(bio);
      if (!safety.allowed) {
        const alert = getContentSafetyAlert(safety);
        Alert.alert(alert.title, alert.body);
        return;
      }

      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError || !authData.user) {
        Alert.alert('Inte inloggad', 'Logga in igen och försök på nytt.');
        return;
      }

      setSaving(true);

      const payload = {
        id: authData.user.id,
        name: name.trim(),
        city: city.trim(),
        country: country.trim(),
        age: ageNumber,
        bio: bio.trim(),
        avatar_url: avatarUrl,
        min_age: minAgeNumber,
        max_age: maxAgeNumber,
        activities: selectedActivities,
        is_profile_complete: true,
        updated_at: new Date().toISOString(),
      };

      const { error } = await supabase.from('profiles').upsert(payload, { onConflict: 'id' });

      if (error) throw error;

      Alert.alert('Klart', 'Profilen är sparad.');
      setIsEditing(false);
      await loadProfile();
    } catch (error: any) {
      Alert.alert('Kunde inte spara', error?.message ?? 'Något gick fel.');
    } finally {
      setSaving(false);
    }
  }

  async function logout() {
    Alert.alert('Logga ut', 'Vill du logga ut?', [
      { text: 'Avbryt', style: 'cancel' },
      {
        text: 'Logga ut',
        style: 'destructive',
        onPress: async () => {
          await supabase.auth.signOut({ scope: 'local' });
          router.replace('/login');
        },
      },
    ]);
  }

  async function switchAccount() {
    Alert.alert('Byt konto', 'Du kommer att loggas ut först.', [
      { text: 'Avbryt', style: 'cancel' },
      {
        text: 'Fortsätt',
        onPress: async () => {
          await supabase.auth.signOut({ scope: 'local' });
          router.replace('/login');
        },
      },
    ]);
  }

  function openDeleteAccountModal() {
    setDeleteConfirmValue('');
    setDeleteModalVisible(true);
  }

  async function deleteAccount() {
    if (!canConfirmDelete || deletingAccount) return;

    try {
      setDeletingAccount(true);

      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError) throw sessionError;
      if (!session?.access_token) {
        throw new Error('Ingen aktiv session hittades. Logga in igen och försök igen.');
      }

      const { error } = await supabase.functions.invoke('delete-account', {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
        body: {
          confirmText: DELETE_CONFIRM_TEXT,
        },
      });

      if (error) {
        let message = error.message || 'Något gick fel.';
        try {
          const details = await (error as any)?.context?.json?.();
          if (details?.error) {
            message = details.error;
          }
        } catch {
          // ignore
        }
        throw new Error(message);
      }

      await supabase.auth.signOut({ scope: 'local' });

      setDeleteModalVisible(false);
      setDeleteConfirmValue('');

      Alert.alert('Kontot är borttaget', 'Ditt konto har raderats.', [
        {
          text: 'OK',
          onPress: () => router.replace('/login'),
        },
      ]);
    } catch (error: any) {
      Alert.alert(
        'Kunde inte ta bort konto',
        error?.message ?? 'Något gick fel. Försök igen.'
      );
    } finally {
      setDeletingAccount(false);
    }
  }

  if (loading) {
    return (
      <View style={styles.loadingWrap}>
        <ActivityIndicator size="large" color="#1C5E52" />
        <Text style={styles.loadingText}>Laddar profil...</Text>
      </View>
    );
  }

  return (
    <>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 84 : 0}
        style={styles.screen}
      >
        <ScrollView
          style={styles.screen}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
        >
          <View style={[styles.pageWrap, isWide && styles.pageWrapWide]}>
          <View style={styles.pageHeader}>
            <Text style={styles.pageTitle}>Profil</Text>
            <Text style={styles.pageSubtitle}>Din profil och hur andra ser dig</Text>
          </View>

          <View style={styles.heroCard}>
            <View
              style={[
                styles.heroTop,
                {
                  flexDirection: isTablet ? 'row' : 'column',
                  alignItems: 'center',
                },
              ]}
            >
              <TouchableOpacity
                activeOpacity={0.9}
                onPress={pickAndUploadAvatar}
                style={[styles.avatarButton, isTablet && { marginBottom: 0, marginRight: 20 }]}
              >
                {avatarUrl ? (
                  <Image source={{ uri: avatarUrl }} style={styles.avatarImage} />
                ) : (
                  <View style={styles.avatarFallback}>
                    <Ionicons name="person" size={56} color="#617092" />
                  </View>
                )}

                <View style={styles.cameraBadge}>
                  {uploadingAvatar ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Ionicons name="camera" size={18} color="#FFFFFF" />
                  )}
                </View>
              </TouchableOpacity>

              <View style={[styles.heroTextWrap, isTablet && { alignItems: 'flex-start' }]}>
                <Text style={styles.heroEyebrow}>MIN PROFIL</Text>
                <Text style={styles.profileName}>{name || 'Ditt namn'}</Text>
                <Text style={styles.profileMeta}>
                  {[city || 'Din plats', country || null, age ? `${age} år` : null]
                    .filter(Boolean)
                    .join(' • ')}
                </Text>

                <View style={styles.heroPillsRow}>
                  <View style={styles.heroPill}>
                    <Ionicons name="checkmark-circle" size={15} color="#1C5E52" />
                    <Text style={styles.heroPillText}>{completionPercent}% profil klar</Text>
                  </View>

                  <View style={styles.heroPill}>
                    <Ionicons name="sparkles-outline" size={15} color="#20325E" />
                    <Text style={styles.heroPillText}>
                      {selectedActivities.length}/{MAX_ACTIVITIES} aktiviteter
                    </Text>
                  </View>

                  <View style={styles.heroPill}>
                    <Ionicons
                      name={isBankIdVerified ? 'shield-checkmark' : 'shield-outline'}
                      size={15}
                      color={isBankIdVerified ? '#1C5E52' : '#8A97B8'}
                    />
                    <Text style={styles.heroPillText}>
                      {isBankIdVerified ? 'BankID verifierad' : 'Ingen BankID ännu'}
                    </Text>
                  </View>
                </View>

                {!!email && <Text style={styles.emailText}>{email}</Text>}
              </View>
            </View>

            <View style={[styles.heroActions, { flexDirection: isTablet ? 'row' : 'column' }]}>
              <TouchableOpacity
                style={[styles.primaryButton, isTablet && styles.heroActionHalf]}
                onPress={() => setIsEditing((v) => !v)}
              >
                <Text style={styles.primaryButtonText}>
                  {isEditing ? 'Stäng redigering' : 'Redigera profil'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.secondaryButtonStrong, isTablet && styles.heroActionHalf]}
                onPress={pickAndUploadAvatar}
              >
                <Text style={styles.secondaryButtonStrongText}>
                  {avatarUrl ? 'Byt bild' : 'Lägg till bild'}
                </Text>
              </TouchableOpacity>
            </View>

            {avatarUrl ? (
              <TouchableOpacity onPress={removeAvatar}>
                <Text style={styles.removeAvatarText}>Ta bort profilbild</Text>
              </TouchableOpacity>
            ) : null}
          </View>

          {currentUserId ? <VolunteerStatusCard userId={currentUserId} /> : null}

          <View style={styles.statsRow}>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>
                {minAge}–{maxAge}
              </Text>
              <Text style={styles.statLabel}>Matchning</Text>
            </View>

            <View style={styles.statCard}>
              <Text style={styles.statValue}>{selectedActivities.length}</Text>
              <Text style={styles.statLabel}>Valda</Text>
            </View>

            <View style={[styles.statCard, styles.statCardLast]}>
              <Text style={styles.statValue}>{avatarUrl ? 'Ja' : 'Nej'}</Text>
              <Text style={styles.statLabel}>Profilbild</Text>
            </View>
          </View>

          {!isEditing ? (
            <>
              <View style={styles.card}>
                <Text style={styles.sectionEyebrow}>VERIFIERING</Text>
                <Text style={styles.sectionTitle}>BankID-status</Text>
                <Text style={styles.bodyText}>
                  {isBankIdVerified
                    ? 'Din profil är BankID-verifierad och du kan använda funktioner som kräver verifiering.'
                    : 'Din profil är inte BankID-verifierad ännu. Volontäransökan kräver BankID-verifiering.'}
                </Text>
              </View>

              <View style={styles.card}>
                <Text style={styles.sectionEyebrow}>OM MIG</Text>
                <Text style={styles.sectionTitle}>Det här ser andra</Text>
                <Text style={styles.bodyText}>
                  {bio ||
                    'Skriv något kort om dig själv så att andra får en bättre känsla av vem du är.'}
                </Text>
              </View>

              <View style={styles.card}>
                <Text style={styles.sectionEyebrow}>MATCHNING</Text>
                <Text style={styles.sectionTitle}>Jag vill matcha med</Text>
                <Text style={styles.matchingText}>
                  {minAge}–{maxAge} år
                </Text>
              </View>

              <View style={styles.card}>
                <Text style={styles.sectionEyebrow}>INTRESSEN</Text>
                <Text style={styles.sectionTitle}>Valda aktiviteter</Text>

                <View style={styles.chipsWrap}>
                  {visibleActivities.length ? (
                    <>
                      {visibleActivities.map((item) => (
                        <View key={item} style={[styles.chip, styles.chipActive]}>
                          <Text style={[styles.chipText, styles.chipTextActive]}>{item}</Text>
                        </View>
                      ))}
                      {hiddenActivities > 0 ? (
                        <View style={styles.moreChip}>
                          <Text style={styles.moreChipText}>+{hiddenActivities} fler</Text>
                        </View>
                      ) : null}
                    </>
                  ) : (
                    <Text style={styles.mutedText}>Inga aktiviteter valda ännu.</Text>
                  )}
                </View>
              </View>

              <View style={styles.card}>
                <Text style={styles.sectionEyebrow}>VOLONTÄRPROGRAM</Text>
                <Text style={styles.sectionTitle}>Stötta andra</Text>
                <Text style={styles.bodyText}>
                  Öppna volontärprogrammet för att se aktiva volontärer eller skicka in en ansökan.
                </Text>

                <TouchableOpacity
                  style={[styles.primaryButton, { marginTop: 16, marginBottom: 0 }]}
                  onPress={() => router.push('/volunteers')}
                >
                  <Text style={styles.primaryButtonText}>Öppna volontärer</Text>
                </TouchableOpacity>
              </View>

              {isAdmin ? (
                <View style={styles.card}>
                  <Text style={styles.sectionEyebrow}>ADMIN</Text>
                  <Text style={styles.sectionTitle}>Moderering</Text>
                  <Text style={styles.bodyText}>
                    Du har adminåtkomst. Härifrån kan du öppna rapportöversikten.
                  </Text>

                  <TouchableOpacity
                    style={[styles.adminButton, { marginTop: 16 }]}
                    onPress={() => router.push('/admin/reports')}
                  >
                    <Text style={styles.adminButtonText}>🛡 Öppna admin / rapporter</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.primaryButton, { marginTop: 12, marginBottom: 0 }]}
                    onPress={() => router.push('/admin/volunteers')}
                  >
                    <Text style={styles.primaryButtonText}>💚 Öppna admin / volontärer</Text>
                  </TouchableOpacity>
                </View>
              ) : null}

              <View style={styles.card}>
                <Text style={styles.sectionEyebrow}>KONTO</Text>
                <Text style={styles.sectionTitle}>Inloggning och konto</Text>

                <View style={styles.accountActions}>
                  <TouchableOpacity
                    style={[styles.accountButton, styles.accountNeutral]}
                    onPress={switchAccount}
                  >
                    <Text style={styles.accountNeutralText}>Byt konto</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.accountButton, styles.accountDanger, styles.accountButtonLast]}
                    onPress={logout}
                  >
                    <Text style={styles.accountDangerText}>Logga ut</Text>
                  </TouchableOpacity>
                </View>
              </View>

              <View style={[styles.card, styles.deleteCard]}>
                <Text style={styles.sectionEyebrow}>FAROZON</Text>
                <Text style={styles.sectionTitle}>Ta bort konto</Text>
                <Text style={styles.bodyText}>
                  Det här tar bort ditt konto permanent. Åtgärden går inte att ångra.
                </Text>

                <TouchableOpacity
                  style={[styles.deleteButton, { marginTop: 16 }]}
                  onPress={openDeleteAccountModal}
                >
                  <Text style={styles.deleteButtonText}>Ta bort konto permanent</Text>
                </TouchableOpacity>
              </View>
            </>
          ) : (
            <>
              <View style={styles.card}>
                <Text style={styles.sectionEyebrow}>REDIGERA</Text>
                <Text style={styles.sectionTitle}>Grunduppgifter</Text>

                <Text style={styles.fieldLabel}>Namn</Text>
                <TextInput
                  value={name}
                  onChangeText={setName}
                  placeholder="Ditt namn"
                  placeholderTextColor="#8A97B8"
                  style={styles.input}
                />

                <Text style={styles.fieldLabel}>Plats</Text>
                <TextInput
                  value={city}
                  onChangeText={setCity}
                  placeholder="Till exempel Stockholm"
                  placeholderTextColor="#8A97B8"
                  style={styles.input}
                />

                <Text style={styles.fieldLabel}>Land</Text>
                <TextInput
                  value={country}
                  onChangeText={setCountry}
                  placeholder="Till exempel Sverige"
                  placeholderTextColor="#8A97B8"
                  style={styles.input}
                />

                <Text style={styles.fieldLabel}>Ålder</Text>
                <TextInput
                  value={age}
                  onChangeText={setAge}
                  placeholder="Din ålder"
                  placeholderTextColor="#8A97B8"
                  keyboardType="number-pad"
                  style={styles.input}
                />

                <Text style={styles.fieldLabel}>Om mig</Text>
                <TextInput
                  value={bio}
                  onChangeText={setBio}
                  placeholder="Skriv kort om dig själv"
                  placeholderTextColor="#8A97B8"
                  multiline
                  textAlignVertical="top"
                  style={[styles.input, styles.textArea]}
                />
              </View>

              <View style={styles.card}>
                <Text style={styles.sectionEyebrow}>FILTER</Text>
                <Text style={styles.sectionTitle}>Åldersfilter för matchning</Text>
                <Text style={styles.helperText}>Välj vilka åldrar du vill kunna matcha med.</Text>

                <View style={[styles.editRow, { flexDirection: isTablet ? 'row' : 'column' }]}>
                  <View style={styles.editCol}>
                    <Text style={styles.fieldLabel}>Min ålder</Text>
                    <TextInput
                      value={minAge}
                      onChangeText={setMinAge}
                      placeholder="18"
                      placeholderTextColor="#8A97B8"
                      keyboardType="number-pad"
                      style={styles.input}
                    />
                  </View>

                  <View style={[styles.editCol, styles.editColLast]}>
                    <Text style={styles.fieldLabel}>Max ålder</Text>
                    <TextInput
                      value={maxAge}
                      onChangeText={setMaxAge}
                      placeholder="99"
                      placeholderTextColor="#8A97B8"
                      keyboardType="number-pad"
                      style={styles.input}
                    />
                  </View>
                </View>
              </View>

              <View style={styles.card}>
                <View style={styles.activitiesHeader}>
                  <View>
                    <Text style={styles.sectionEyebrow}>INTRESSEN</Text>
                    <Text style={styles.sectionTitle}>Välj aktiviteter</Text>
                  </View>

                  <View style={styles.counterBadge}>
                    <Text style={styles.counterBadgeText}>
                      {selectedActivities.length}/{MAX_ACTIVITIES}
                    </Text>
                  </View>
                </View>

                {ACTIVITY_CATEGORIES.map((category) => (
                  <View key={category.title} style={styles.categoryCard}>
                    <View style={styles.categoryTitleRow}>
                      <Text style={styles.categoryEmoji}>{category.emoji}</Text>
                      <Text style={styles.categoryTitle}>{category.title}</Text>
                    </View>

                    <View style={styles.chipsWrap}>
                      {category.items.map((item) => {
                        const active = selectedActivities.includes(item);

                        return (
                          <TouchableOpacity
                            key={`${category.title}-${item}`}
                            onPress={() => toggleActivity(item)}
                            style={[styles.chip, active && styles.chipActive]}
                          >
                            <Text style={[styles.chipText, active && styles.chipTextActive]}>
                              {item}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>
                ))}
              </View>

              <TouchableOpacity style={styles.saveButton} onPress={saveProfile} disabled={saving}>
                {saving ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.saveButtonText}>Spara ändringar</Text>
                )}
              </TouchableOpacity>
            </>
          )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <Modal
        visible={deleteModalVisible}
        transparent
        animationType="slide"
        presentationStyle="overFullScreen"
        onRequestClose={() => {
          if (!deletingAccount) {
            setDeleteModalVisible(false);
            setDeleteConfirmValue('');
          }
        }}
      >
        <KeyboardAvoidingView
          style={styles.modalKeyboardWrap}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 12 : 0}
        >
          <Pressable
            style={styles.modalOverlay}
            onPress={() => {
              if (deletingAccount) return;
              setDeleteModalVisible(false);
              setDeleteConfirmValue('');
            }}
          >
            <Pressable style={styles.deleteModalSheet} onPress={() => {}}>
              <ScrollView
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.deleteModalContent}
              >
                <Text style={styles.deleteModalTitle}>Ta bort konto</Text>

                <Text style={styles.deleteModalText}>
                  Det här raderar ditt konto permanent. Skriv{' '}
                  <Text style={styles.deleteModalStrong}>{DELETE_CONFIRM_TEXT}</Text> för att
                  fortsätta.
                </Text>

                <TextInput
                  value={deleteConfirmValue}
                  onChangeText={setDeleteConfirmValue}
                  placeholder={`Skriv ${DELETE_CONFIRM_TEXT}`}
                  placeholderTextColor="#9AA6C1"
                  autoCapitalize="characters"
                  autoCorrect={false}
                  editable={!deletingAccount}
                  returnKeyType="done"
                  style={styles.deleteInput}
                />

                <View style={styles.deleteModalActions}>
                  <Pressable
                    style={[styles.deleteCancelButton, deletingAccount && styles.disabledButton]}
                    onPress={() => {
                      if (deletingAccount) return;
                      setDeleteModalVisible(false);
                      setDeleteConfirmValue('');
                    }}
                    disabled={deletingAccount}
                  >
                    <Text style={styles.deleteCancelButtonText}>Avbryt</Text>
                  </Pressable>

                  <Pressable
                    style={[
                      styles.deleteConfirmButton,
                      (!canConfirmDelete || deletingAccount) && styles.disabledButton,
                    ]}
                    onPress={deleteAccount}
                    disabled={!canConfirmDelete || deletingAccount}
                  >
                    {deletingAccount ? (
                      <ActivityIndicator color="#FFFFFF" />
                    ) : (
                      <Text style={styles.deleteConfirmButtonText}>Radera konto</Text>
                    )}
                  </Pressable>
                </View>
              </ScrollView>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#F7F6F2',
  },

  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 40,
  },

  pageWrap: {
    width: '100%',
    maxWidth: 820,
    alignSelf: 'center',
  },

  pageWrapWide: {
    maxWidth: 860,
  },

  pageHeader: {
    marginBottom: 12,
  },

  pageTitle: {
    fontSize: 30,
    lineHeight: 36,
    fontWeight: '900',
    color: '#0F1E38',
    marginBottom: 4,
  },

  pageSubtitle: {
    fontSize: 14,
    lineHeight: 21,
    color: '#6D778C',
  },

  loadingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F4F6FB',
  },

  loadingText: {
    marginTop: 12,
    color: '#20325E',
    fontSize: 16,
    fontWeight: '600',
  },

  heroCard: {
    backgroundColor: '#0F1E38',
    borderRadius: 26,
    padding: 20,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    shadowColor: '#0F1E38',
    shadowOpacity: Platform.OS === 'web' ? 0.06 : 0.16,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 3,
  },

  heroTop: {
    marginBottom: 18,
  },

  avatarButton: {
    width: 108,
    height: 108,
    borderRadius: 54,
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },

  avatarImage: {
    width: 108,
    height: 108,
    borderRadius: 54,
    borderWidth: 3,
    borderColor: '#FFFFFF',
  },

  avatarFallback: {
    width: 108,
    height: 108,
    borderRadius: 54,
    backgroundColor: '#EEF4FF',
    borderWidth: 3,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },

  cameraBadge: {
    position: 'absolute',
    right: 2,
    bottom: 2,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#E05C4B',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },

  heroTextWrap: {
    flex: 1,
    alignItems: 'center',
  },

  heroEyebrow: {
    fontSize: 11,
    lineHeight: 14,
    letterSpacing: 1.4,
    fontWeight: '800',
    color: '#7ED3C4',
    marginBottom: 8,
  },

  profileName: {
    fontSize: 29,
    lineHeight: 34,
    fontWeight: '900',
    color: '#FFFFFF',
    marginBottom: 4,
    textAlign: 'center',
  },

  profileMeta: {
    fontSize: 14,
    lineHeight: 22,
    color: 'rgba(255,255,255,0.72)',
    marginBottom: 12,
    textAlign: 'center',
  },

  heroPillsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    marginBottom: 10,
  },

  heroPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginRight: 8,
    marginBottom: 8,
  },

  heroPillText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
    marginLeft: 6,
  },

  emailText: {
    fontSize: 14,
    lineHeight: 20,
    color: 'rgba(255,255,255,0.62)',
  },

  heroActions: {
    marginTop: 2,
  },

  heroActionHalf: {
    flex: 1,
  },

  primaryButton: {
    minHeight: 52,
    borderRadius: 16,
    backgroundColor: '#E05C4B',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    marginBottom: 10,
  },

  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
  },

  secondaryButtonStrong: {
    minHeight: 52,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    marginBottom: 10,
  },

  secondaryButtonStrongText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
  },

  adminButton: {
    minHeight: 56,
    borderRadius: 18,
    backgroundColor: '#8F2D0A',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },

  adminButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '900',
  },

  removeAvatarText: {
    marginTop: 4,
    color: 'rgba(255,255,255,0.7)',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },

  statsRow: {
    flexDirection: 'row',
    marginBottom: 14,
  },

  statCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    paddingVertical: 14,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: '#E6EAF4',
    alignItems: 'center',
    marginRight: 10,
  },

  statCardLast: {
    marginRight: 0,
  },

  statValue: {
    fontSize: 20,
    lineHeight: 26,
    fontWeight: '900',
    color: '#0F1E38',
    marginBottom: 5,
  },

  statLabel: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
    color: '#7A8AAA',
    textAlign: 'center',
  },

  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 18,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E6EAF4',
    shadowColor: '#20325E',
    shadowOpacity: Platform.OS === 'web' ? 0.03 : 0.05,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },

  deleteCard: {
    borderColor: '#F2D1D1',
    backgroundColor: '#FFF9F9',
  },

  sectionEyebrow: {
    fontSize: 11,
    lineHeight: 14,
    letterSpacing: 1.2,
    fontWeight: '800',
    color: '#7A8AAA',
    marginBottom: 8,
  },

  sectionTitle: {
    fontSize: 21,
    lineHeight: 27,
    fontWeight: '900',
    color: '#0F1E38',
    marginBottom: 8,
  },

  bodyText: {
    fontSize: 15,
    lineHeight: 24,
    color: '#34405A',
  },

  matchingText: {
    fontSize: 20,
    lineHeight: 26,
    fontWeight: '800',
    color: '#20325E',
  },

  mutedText: {
    fontSize: 15,
    lineHeight: 22,
    color: '#7A8AAA',
  },

  accountActions: {
    flexDirection: 'row',
    marginTop: 6,
  },

  accountButton: {
    flex: 1,
    minHeight: 54,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    marginRight: 10,
  },

  accountButtonLast: {
    marginRight: 0,
  },

  accountNeutral: {
    backgroundColor: '#F1F5FC',
    borderWidth: 1,
    borderColor: '#DCE4F3',
  },

  accountNeutralText: {
    color: '#20325E',
    fontSize: 16,
    fontWeight: '800',
  },

  accountDanger: {
    backgroundColor: '#FFF4F4',
    borderWidth: 1,
    borderColor: '#F2D1D1',
  },

  accountDangerText: {
    color: '#BB4C4C',
    fontSize: 16,
    fontWeight: '800',
  },

  deleteButton: {
    minHeight: 56,
    borderRadius: 18,
    backgroundColor: '#C93C3C',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },

  deleteButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '900',
  },

  fieldLabel: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '700',
    color: '#20325E',
    marginBottom: 8,
    marginTop: 10,
  },

  helperText: {
    fontSize: 15,
    lineHeight: 22,
    color: '#7A8AAA',
    marginBottom: 6,
  },

  input: {
    minHeight: 58,
    borderRadius: 16,
    backgroundColor: '#F2F5FB',
    borderWidth: 1,
    borderColor: '#E0E6F2',
    paddingHorizontal: 16,
    fontSize: 16,
    color: '#20325E',
  },

  textArea: {
    minHeight: 126,
    paddingTop: 16,
    paddingBottom: 16,
  },

  editRow: {
    marginTop: 2,
  },

  editCol: {
    flex: 1,
    marginRight: 10,
  },

  editColLast: {
    marginRight: 0,
  },

  activitiesHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 8,
  },

  counterBadge: {
    backgroundColor: '#EEF4FF',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#D8E4FA',
  },

  counterBadgeText: {
    color: '#20325E',
    fontSize: 14,
    fontWeight: '800',
  },

  categoryCard: {
    backgroundColor: '#FBFCFF',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E6EAF4',
    padding: 16,
    marginTop: 10,
  },

  categoryTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },

  categoryEmoji: {
    fontSize: 22,
    marginRight: 10,
  },

  categoryTitle: {
    fontSize: 19,
    lineHeight: 24,
    fontWeight: '800',
    color: '#20325E',
  },

  chipsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },

  chip: {
    backgroundColor: '#F3F6FC',
    borderWidth: 1.5,
    borderColor: '#D7DFEF',
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 10,
    marginRight: 10,
    marginBottom: 10,
  },

  chipActive: {
    backgroundColor: '#EAF6F2',
    borderColor: '#1C5E52',
  },

  chipText: {
    color: '#20325E',
    fontSize: 15,
    fontWeight: '700',
  },

  chipTextActive: {
    color: '#1C5E52',
  },

  moreChip: {
    backgroundColor: '#EEF4FF',
    borderWidth: 1,
    borderColor: '#D8E4FA',
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 10,
    marginRight: 10,
    marginBottom: 10,
  },

  moreChipText: {
    color: '#20325E',
    fontSize: 14,
    fontWeight: '700',
  },

  saveButton: {
    backgroundColor: '#1C5E52',
    minHeight: 60,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },

  saveButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '800',
  },

  modalKeyboardWrap: {
    flex: 1,
    justifyContent: 'flex-end',
  },

  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(24, 36, 65, 0.28)',
    paddingHorizontal: 10,
    paddingBottom: Platform.OS === 'ios' ? 10 : 8,
  },

  deleteModalSheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    borderWidth: 1,
    borderColor: '#E6EAF4',
    maxHeight: '72%',
  },

  deleteModalContent: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: Platform.OS === 'ios' ? 20 : 16,
  },

  deleteModalTitle: {
    fontSize: 24,
    fontWeight: '900',
    color: '#20325E',
    marginBottom: 10,
  },

  deleteModalText: {
    fontSize: 15,
    lineHeight: 24,
    color: '#5B6785',
    marginBottom: 14,
  },

  deleteModalStrong: {
    color: '#BB3B3B',
    fontWeight: '900',
  },

  deleteInput: {
    minHeight: 54,
    borderRadius: 16,
    backgroundColor: '#FFF7F7',
    borderWidth: 1,
    borderColor: '#F1D1D1',
    paddingHorizontal: 14,
    fontSize: 16,
    color: '#20325E',
    marginBottom: 16,
  },

  deleteModalActions: {
    flexDirection: 'row',
    gap: 10,
  },

  deleteCancelButton: {
    flex: 1,
    minHeight: 52,
    borderRadius: 16,
    backgroundColor: '#F1F5FC',
    borderWidth: 1,
    borderColor: '#DCE4F3',
    alignItems: 'center',
    justifyContent: 'center',
  },

  deleteCancelButtonText: {
    color: '#20325E',
    fontSize: 15,
    fontWeight: '800',
  },

  deleteConfirmButton: {
    flex: 1,
    minHeight: 52,
    borderRadius: 16,
    backgroundColor: '#C93C3C',
    alignItems: 'center',
    justifyContent: 'center',
  },

  deleteConfirmButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '900',
  },

  disabledButton: {
    opacity: 0.55,
  },
});
