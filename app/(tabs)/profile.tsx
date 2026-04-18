import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  ActivityIndicator,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { supabase } from '../../src/lib/supabase';

type Category = {
  title: string;
  emoji: string;
  items: string[];
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

type ProfileRow = {
  id: string;
  name: string | null;
  city: string | null;
  age: number | null;
  bio: string | null;
  avatar_url: string | null;
  min_age: number | null;
  max_age: number | null;
  activities: string[] | null;
};

export default function ProfileScreen() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [city, setCity] = useState('');
  const [age, setAge] = useState('');
  const [bio, setBio] = useState('');
  const [minAge, setMinAge] = useState(DEFAULT_MIN_AGE);
  const [maxAge, setMaxAge] = useState(DEFAULT_MAX_AGE);
  const [selectedActivities, setSelectedActivities] = useState<string[]>([]);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

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

      setEmail(authData.user.email ?? '');

      const { data, error } = await supabase
        .from('profiles')
        .select('id, name, city, age, bio, avatar_url, min_age, max_age, activities')
        .eq('id', authData.user.id)
        .single();

      if (error && error.code !== 'PGRST116') {
        throw error;
      }

      const profile = data as ProfileRow | null;

      if (profile) {
        setName(profile.name ?? '');
        setCity(profile.city ?? '');
        setAge(profile.age ? String(profile.age) : '');
        setBio(profile.bio ?? '');
        setAvatarUrl(profile.avatar_url ?? null);
        setMinAge(profile.min_age ? String(profile.min_age) : DEFAULT_MIN_AGE);
        setMaxAge(profile.max_age ? String(profile.max_age) : DEFAULT_MAX_AGE);
        setSelectedActivities(profile.activities ?? []);
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
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (result.canceled || !result.assets?.length) {
        return;
      }

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

      const { data: publicUrlData } = supabase.storage
        .from('profile-images')
        .getPublicUrl(filePath);

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
      Alert.alert(
        'Kunde inte ta bort bild',
        error?.message ?? 'Något gick fel. Försök igen.'
      );
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
        Alert.alert('Plats saknas', 'Fyll i din plats.');
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
        age: ageNumber,
        bio: bio.trim(),
        avatar_url: avatarUrl,
        min_age: minAgeNumber,
        max_age: maxAgeNumber,
        activities: selectedActivities,
        updated_at: new Date().toISOString(),
      };

      const { error } = await supabase
        .from('profiles')
        .upsert(payload, { onConflict: 'id' });

      if (error) throw error;

      Alert.alert('Klart', 'Profilen är sparad.');
      setIsEditing(false);
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
          await supabase.auth.signOut();
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
          await supabase.auth.signOut();
          router.replace('/login');
        },
      },
    ]);
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
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.pageTitle}>Profil</Text>
      <Text style={styles.pageSubtitle}>Din profil och hur andra ser dig</Text>

      <View style={styles.heroCard}>
        <TouchableOpacity
          activeOpacity={0.9}
          onPress={pickAndUploadAvatar}
          style={styles.avatarButton}
        >
          {avatarUrl ? (
            <Image source={{ uri: avatarUrl }} style={styles.avatarImage} />
          ) : (
            <View style={styles.avatarFallback}>
              <Ionicons name="person" size={60} color="#617092" />
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

        <Text style={styles.profileName}>{name || 'Ditt namn'}</Text>
        <Text style={styles.profileMeta}>
          {city || 'Din plats'}
          {age ? ` • ${age} år` : ''}
        </Text>

        <View style={styles.pillRow}>
          <View style={styles.coolPill}>
            <Ionicons name="checkmark-circle" size={16} color="#1C5E52" />
            <Text style={styles.coolPillText}>{completionPercent}% profil klar</Text>
          </View>

          <View style={styles.coolPill}>
            <Ionicons name="people-outline" size={16} color="#20325E" />
            <Text style={styles.coolPillText}>{selectedActivities.length}/{MAX_ACTIVITIES} aktiviteter</Text>
          </View>
        </View>

        <View style={styles.heroButtons}>
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={() => setIsEditing((v) => !v)}
          >
            <Text style={styles.primaryButtonText}>
              {isEditing ? 'Stäng redigering' : 'Redigera profil'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.secondaryCompactButton} onPress={pickAndUploadAvatar}>
            <Text style={styles.secondaryCompactButtonText}>
              {avatarUrl ? 'Byt bild' : 'Lägg till bild'}
            </Text>
          </TouchableOpacity>
        </View>

        {avatarUrl ? (
          <TouchableOpacity onPress={removeAvatar}>
            <Text style={styles.removeAvatarText}>Ta bort bild</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {!isEditing ? (
        <>
          <View style={styles.statsRow}>
            <View style={styles.statCard}>
              <Text style={styles.statNumber}>{minAge}–{maxAge}</Text>
              <Text style={styles.statLabel}>Matchning</Text>
            </View>

            <View style={styles.statCard}>
              <Text style={styles.statNumber}>{selectedActivities.length}</Text>
              <Text style={styles.statLabel}>Valda</Text>
            </View>

            <View style={styles.statCard}>
              <Text style={styles.statNumber}>{avatarUrl ? 'Ja' : 'Nej'}</Text>
              <Text style={styles.statLabel}>Profilbild</Text>
            </View>
          </View>

          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Om mig</Text>
            <Text style={styles.bodyText}>
              {bio || 'Skriv något kort om dig själv så andra får en bättre känsla av vem du är.'}
            </Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Jag vill matcha med</Text>
            <Text style={styles.bodyText}>{minAge}–{maxAge} år</Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Aktiviteter</Text>
            <View style={styles.chipsWrap}>
              {selectedActivities.length ? (
                selectedActivities.map((item) => (
                  <View key={`selected-${item}`} style={[styles.chip, styles.chipActive]}>
                    <Text style={[styles.chipText, styles.chipTextActive]}>{item}</Text>
                  </View>
                ))
              ) : (
                <Text style={styles.mutedText}>Inga aktiviteter valda ännu.</Text>
              )}
            </View>
          </View>

          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Konto</Text>
            {!!email && <Text style={styles.accountEmail}>{email}</Text>}

            <View style={styles.accountRow}>
              <TouchableOpacity style={styles.secondaryButton} onPress={switchAccount}>
                <Text style={styles.secondaryButtonText}>Byt konto</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.dangerButton} onPress={logout}>
                <Text style={styles.dangerButtonText}>Logga ut</Text>
              </TouchableOpacity>
            </View>
          </View>
        </>
      ) : (
        <>
          <View style={styles.card}>
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
              placeholder="Din stad"
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
            <Text style={styles.sectionTitle}>Åldersfilter för matchning</Text>
            <Text style={styles.mutedText}>Välj vilka åldrar du vill kunna matcha med.</Text>

            <View style={styles.ageRow}>
              <View style={styles.ageCol}>
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

              <View style={styles.ageCol}>
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
              <Text style={styles.sectionTitle}>Välj aktiviteter</Text>
              <View style={styles.blueBadge}>
                <Text style={styles.blueBadgeText}>{selectedActivities.length}/{MAX_ACTIVITIES}</Text>
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
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#F4F6FB',
  },

  content: {
    padding: 20,
    paddingBottom: 40,
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

  pageTitle: {
    fontSize: 34,
    lineHeight: 40,
    fontWeight: '800',
    color: '#20325E',
    marginBottom: 8,
  },

  pageSubtitle: {
    fontSize: 16,
    lineHeight: 24,
    color: '#7A8AAA',
    marginBottom: 16,
  },

  heroCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 30,
    padding: 24,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E6EAF4',
    alignItems: 'center',
  },

  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 28,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E6EAF4',
  },

  avatarButton: {
    width: 136,
    height: 136,
    borderRadius: 68,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    marginBottom: 16,
  },

  avatarImage: {
    width: 136,
    height: 136,
    borderRadius: 68,
    borderWidth: 4,
    borderColor: '#1C5E52',
  },

  avatarFallback: {
    width: 136,
    height: 136,
    borderRadius: 68,
    backgroundColor: '#F2F4FA',
    borderWidth: 4,
    borderColor: '#1C5E52',
    alignItems: 'center',
    justifyContent: 'center',
  },

  cameraBadge: {
    position: 'absolute',
    right: 4,
    bottom: 4,
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#1C5E52',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },

  profileName: {
    fontSize: 32,
    lineHeight: 38,
    fontWeight: '800',
    color: '#20325E',
    marginBottom: 8,
  },

  profileMeta: {
    fontSize: 16,
    lineHeight: 22,
    color: '#7A8AAA',
    marginBottom: 14,
    textAlign: 'center',
  },

  pillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    justifyContent: 'center',
    marginBottom: 16,
  },

  coolPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#EEF4FF',
    borderWidth: 1,
    borderColor: '#D8E4FA',
  },

  coolPillText: {
    color: '#20325E',
    fontSize: 14,
    fontWeight: '700',
  },

  heroButtons: {
    width: '100%',
    gap: 10,
  },

  primaryButton: {
    minHeight: 56,
    borderRadius: 18,
    backgroundColor: '#1C5E52',
    alignItems: 'center',
    justifyContent: 'center',
  },

  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '800',
  },

  secondaryCompactButton: {
    minHeight: 52,
    borderRadius: 18,
    backgroundColor: '#EFF3FB',
    borderWidth: 1,
    borderColor: '#DCE4F3',
    alignItems: 'center',
    justifyContent: 'center',
  },

  secondaryCompactButtonText: {
    color: '#20325E',
    fontSize: 16,
    fontWeight: '800',
  },

  removeAvatarText: {
    marginTop: 12,
    color: '#C0392B',
    fontSize: 15,
    fontWeight: '600',
  },

  statsRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },

  statCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    paddingVertical: 18,
    paddingHorizontal: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E6EAF4',
  },

  statNumber: {
    fontSize: 20,
    lineHeight: 26,
    fontWeight: '800',
    color: '#20325E',
    marginBottom: 6,
    textAlign: 'center',
  },

  statLabel: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
    color: '#7A8AAA',
    textAlign: 'center',
  },

  sectionTitle: {
    fontSize: 28,
    lineHeight: 34,
    fontWeight: '800',
    color: '#20325E',
    marginBottom: 14,
  },

  bodyText: {
    fontSize: 18,
    lineHeight: 30,
    color: '#26334F',
  },

  mutedText: {
    fontSize: 16,
    lineHeight: 24,
    color: '#7A8AAA',
  },

  accountEmail: {
    fontSize: 15,
    lineHeight: 22,
    color: '#7A8AAA',
    marginBottom: 14,
  },

  fieldLabel: {
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '700',
    color: '#20325E',
    marginBottom: 8,
    marginTop: 12,
  },

  input: {
    minHeight: 62,
    borderRadius: 18,
    backgroundColor: '#F2F4FA',
    borderWidth: 1,
    borderColor: '#E0E6F2',
    paddingHorizontal: 16,
    fontSize: 16,
    color: '#20325E',
  },

  textArea: {
    minHeight: 130,
    paddingTop: 16,
    paddingBottom: 16,
  },

  ageRow: {
    flexDirection: 'row',
    gap: 12,
  },

  ageCol: {
    flex: 1,
  },

  activitiesHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 8,
  },

  blueBadge: {
    backgroundColor: '#EEF4FF',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: '#D8E4FA',
  },

  blueBadgeText: {
    color: '#20325E',
    fontSize: 14,
    fontWeight: '800',
  },

  categoryCard: {
    backgroundColor: '#FBFCFF',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#E6EAF4',
    padding: 16,
    marginTop: 12,
  },

  categoryTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },

  categoryEmoji: {
    fontSize: 24,
    marginRight: 10,
  },

  categoryTitle: {
    fontSize: 20,
    lineHeight: 26,
    fontWeight: '800',
    color: '#20325E',
  },

  chipsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },

  chip: {
    backgroundColor: '#F3F6FC',
    borderWidth: 1.5,
    borderColor: '#D7DFEF',
    borderRadius: 999,
    paddingHorizontal: 18,
    paddingVertical: 12,
  },

  chipActive: {
    backgroundColor: '#EAF6F2',
    borderColor: '#1C5E52',
  },

  chipText: {
    color: '#20325E',
    fontSize: 16,
    fontWeight: '700',
  },

  chipTextActive: {
    color: '#1C5E52',
  },

  saveButton: {
    backgroundColor: '#1C5E52',
    minHeight: 64,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },

  saveButtonText: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '800',
  },

  accountRow: {
    flexDirection: 'row',
    gap: 12,
  },

  secondaryButton: {
    flex: 1,
    minHeight: 64,
    backgroundColor: '#EFF3FB',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#DCE4F3',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },

  secondaryButtonText: {
    color: '#20325E',
    fontSize: 18,
    fontWeight: '800',
    textAlign: 'center',
  },

  dangerButton: {
    flex: 1,
    minHeight: 64,
    backgroundColor: '#FBECEC',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#F2CACA',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },

  dangerButtonText: {
    color: '#C0392B',
    fontSize: 18,
    fontWeight: '800',
    textAlign: 'center',
  },
});