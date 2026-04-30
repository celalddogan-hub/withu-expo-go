import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { supabase } from '../../src/lib/supabase';
import VolunteerStatusCard from '../../src/components/volunteer/VolunteerStatusCard';
import { WithUAvatar } from '../../src/components/withu/WithUPrimitives';
import { checkContentSafety, getContentSafetyAlert } from '../../src/lib/contentSafety';

type ProfileTab = 'profile' | 'friends' | 'settings';

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
  avatar_emoji: string | null;
  min_age: number | null;
  max_age: number | null;
  activities: string[] | null;
  is_bankid_verified: boolean | null;
  email_verified: boolean | null;
  phone_verified: boolean | null;
  bankid_verified: boolean | null;
  verification_level: string | null;
  trust_score: number | null;
  is_limited: boolean | null;
  limited_until: string | null;
  accepted_rules_at: string | null;
};

type MatchRow = {
  user_id: string;
  target_id: string;
  is_match: boolean | null;
  created_at: string | null;
};

type FriendProfile = {
  id: string;
  name: string | null;
  age: number | null;
  city: string | null;
  bio: string | null;
  activities: string[] | null;
  avatar_url: string | null;
  avatar_emoji: string | null;
  is_bankid_verified: boolean | null;
};

const ACTIVITY_CATEGORIES: Category[] = [
  {
    title: 'Fika & samtal',
    emoji: '☕',
    items: ['Kafébesök', 'Lunch', 'Middag', 'Bara prata', 'Promenad och prat', 'Picknick'],
  },
  {
    title: 'Gaming & fritid',
    emoji: '🎮',
    items: ['Datorspel', 'Brädspel', 'Rollspel', 'Escape room', 'Kortspel', 'Sällskapsspel'],
  },
  {
    title: 'Studier & lärande',
    emoji: '📚',
    items: ['Läxhjälp', 'Språkbyte', 'Pluggsällskap', 'Studiecirkel', 'Bokclub', 'Debatt'],
  },
  {
    title: 'Träning & sport',
    emoji: '💪',
    items: ['Löpning', 'Gym', 'Yoga', 'Padel', 'Cykling', 'Simning', 'Fotboll', 'Vandring'],
  },
  {
    title: 'Musik & kultur',
    emoji: '🎵',
    items: ['Konserter', 'Replokal', 'Teater', 'Bio', 'Museum', 'Konstutställning', 'Danslektion'],
  },
  {
    title: 'Stöd & samtal',
    emoji: '💬',
    items: ['Telefonsamtal', 'Videosamtal', 'Anonymt stöd', 'Krisstöd', 'Lyssna och prata'],
  },
  {
    title: 'Språk & integration',
    emoji: '🌍',
    items: ['Kulturutbyte', 'Språkcafé', 'Integration', 'Internationell matlagning', 'Konversationsträning'],
  },
  {
    title: 'Senior & hembesök',
    emoji: '🧓',
    items: ['Sällskap hemma', 'Promenadkompis', 'Berättarstund', 'Kortspel hemma', 'Hjälp med teknik'],
  },
  {
    title: 'Natur & friluftsliv',
    emoji: '🌿',
    items: ['Naturpromenader', 'Fågelskådning', 'Bärplockning', 'Fiske', 'Camping', 'Trädgård'],
  },
  {
    title: 'Mat & dryck',
    emoji: '🍳',
    items: ['Laga mat tillsammans', 'Baka', 'Vinprovning', 'Matmarknad', 'Provlaga recept'],
  },
];

const MAX_ACTIVITIES = 20;
const DEFAULT_MIN_AGE = '18';
const DEFAULT_MAX_AGE = '99';
const DELETE_CONFIRM_TEXT = 'TA BORT';

function makeConversationKey(a: string, b: string) {
  return [a, b].sort().join('__');
}

function initialsFromName(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '🙂';
  return parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
}

function sanitizeAgeInput(value: string) {
  return value.replace(/\D/g, '').slice(0, 2);
}

function parseAgeInput(value: string) {
  const normalized = sanitizeAgeInput(value);
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

export default function ProfileScreen() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [activeTab, setActiveTab] = useState<ProfileTab>('profile');
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
  const [avatarEmoji, setAvatarEmoji] = useState('🙂');
  const [isBankIdVerified, setIsBankIdVerified] = useState(false);
  const [emailVerified, setEmailVerified] = useState(false);
  const [phoneVerified, setPhoneVerified] = useState(false);
  const [verificationLevel, setVerificationLevel] = useState('new');
  const [trustScore, setTrustScore] = useState(0);
  const [isLimited, setIsLimited] = useState(true);
  const [limitedUntil, setLimitedUntil] = useState<string | null>(null);
  const [acceptedRulesAt, setAcceptedRulesAt] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [friends, setFriends] = useState<FriendProfile[]>([]);

  const canConfirmDelete =
    deleteConfirmValue.trim().toUpperCase() === DELETE_CONFIRM_TEXT && !deletingAccount;

  const profileCompletion = useMemo(() => {
    const checks = [
      name.trim().length > 1,
      city.trim().length > 1,
      (parseAgeInput(age) ?? 0) >= 18,
      bio.trim().length > 10,
      selectedActivities.length > 0,
      !!avatarUrl,
    ];

    return Math.round((checks.filter(Boolean).length / checks.length) * 100);
  }, [name, city, age, bio, selectedActivities, avatarUrl]);

  const publicName = name.trim() || 'Din profil';
  const publicPlace = [city.trim(), country.trim()].filter(Boolean).join(', ') || 'Lägg till stad';
  const visibleActivities = selectedActivities.slice(0, 10);
  const rulesAccepted = !!acceptedRulesAt;
  const limitedUntilTime = limitedUntil ? new Date(limitedUntil).getTime() : 0;
  const limitedActive = isLimited && (!limitedUntil || limitedUntilTime > Date.now());

  const loadFriends = useCallback(async (userId: string) => {
    const [{ data: outgoing, error: outgoingError }, { data: incoming, error: incomingError }] =
      await Promise.all([
        supabase
          .from('matches')
          .select('user_id, target_id, is_match, created_at')
          .eq('user_id', userId)
          .eq('is_match', true),
        supabase
          .from('matches')
          .select('user_id, target_id, is_match, created_at')
          .eq('target_id', userId)
          .eq('is_match', true),
      ]);

    if (outgoingError) throw outgoingError;
    if (incomingError) throw incomingError;

    const rows = [...((outgoing ?? []) as MatchRow[]), ...((incoming ?? []) as MatchRow[])];
    const friendIds = [...new Set(rows.map((row) => (row.user_id === userId ? row.target_id : row.user_id)))];

    if (!friendIds.length) {
      setFriends([]);
      return;
    }

    const { data: profiles, error } = await supabase
      .from('profiles')
      .select('id, name, age, city, bio, activities, avatar_url, avatar_emoji, is_bankid_verified')
      .in('id', friendIds);

    if (error) throw error;
    setFriends((profiles ?? []) as FriendProfile[]);
  }, []);

  const loadProfile = useCallback(async () => {
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
              'id, name, city, country, age, bio, avatar_url, avatar_emoji, min_age, max_age, activities, is_bankid_verified, email_verified, phone_verified, bankid_verified, verification_level, trust_score, is_limited, limited_until, accepted_rules_at'
            )
            .eq('id', authData.user.id)
            .maybeSingle(),
          supabase.from('admins').select('user_id').eq('user_id', authData.user.id).maybeSingle(),
        ]);

      if (profileError) throw profileError;
      if (adminError) throw adminError;

      const profile = profileData as ProfileRow | null;
      setIsAdmin(!!adminData);

      if (profile) {
        setName(profile.name ?? '');
        setCity(profile.city ?? '');
        setCountry(profile.country ?? 'Sverige');
        setAge(profile.age != null ? String(profile.age) : '');
        setBio(profile.bio ?? '');
        setAvatarUrl(profile.avatar_url ?? null);
        setAvatarEmoji(profile.avatar_emoji ?? '🙂');
        setMinAge(profile.min_age != null ? String(profile.min_age) : DEFAULT_MIN_AGE);
        setMaxAge(profile.max_age != null ? String(profile.max_age) : DEFAULT_MAX_AGE);
        setSelectedActivities(profile.activities ?? []);
        setIsBankIdVerified(!!profile.is_bankid_verified || !!profile.bankid_verified);
        setEmailVerified(!!profile.email_verified || !!authData.user.email_confirmed_at);
        setPhoneVerified(!!profile.phone_verified);
        setVerificationLevel(profile.verification_level ?? 'new');
        setTrustScore(profile.trust_score ?? 0);
        setIsLimited(profile.is_limited ?? true);
        setLimitedUntil(profile.limited_until ?? null);
        setAcceptedRulesAt(profile.accepted_rules_at ?? null);
      }

      await loadFriends(authData.user.id);
    } catch (error: any) {
      Alert.alert('Kunde inte ladda profil', error?.message ?? 'Försök igen om en stund.');
    } finally {
      setLoading(false);
    }
  }, [loadFriends, router]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  function toggleActivity(activity: string) {
    setSelectedActivities((current) => {
      if (current.includes(activity)) {
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
        Alert.alert('Tillåt bilder', 'WithU behöver tillgång till dina bilder för att lägga till profilbild.');
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
      const currentAgeNumber = parseAgeInput(age);
      const currentMinAgeNumber = parseAgeInput(minAge) ?? Number(DEFAULT_MIN_AGE);
      const currentMaxAgeNumber = parseAgeInput(maxAge) ?? Number(DEFAULT_MAX_AGE);

      const { error: updateError } = await supabase.from('profiles').upsert(
        {
          id: authData.user.id,
          name: name.trim() || 'Ny användare',
          city: city.trim() || null,
          country: country.trim() || 'Sverige',
          age: currentAgeNumber,
          bio: bio.trim() || null,
          avatar_url: publicUrl,
          min_age: currentMinAgeNumber,
          max_age: currentMaxAgeNumber,
          activities: selectedActivities,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'id' }
      );

      if (updateError) throw updateError;

      setAvatarUrl(publicUrl);
      Alert.alert('Klart', 'Profilbilden är uppladdad.');
    } catch (error: any) {
      Alert.alert('Kunde inte ladda upp bild', error?.message ?? 'Något gick fel. Försök igen.');
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
        .update({ avatar_url: null, updated_at: new Date().toISOString() })
        .eq('id', authData.user.id);

      if (error) throw error;
      setAvatarUrl(null);
    } catch (error: any) {
      Alert.alert('Kunde inte ta bort bild', error?.message ?? 'Något gick fel. Försök igen.');
    }
  }

  async function saveProfile() {
    try {
      const ageNumber = parseAgeInput(age);
      const minAgeNumber = parseAgeInput(minAge) ?? Number(DEFAULT_MIN_AGE);
      const maxAgeNumber = parseAgeInput(maxAge) ?? Number(DEFAULT_MAX_AGE);

      if (!name.trim()) {
        Alert.alert('Namn saknas', 'Fyll i ditt namn.');
        return;
      }

      if (!city.trim()) {
        Alert.alert('Stad saknas', 'Fyll i vilken stad du bor i.');
        return;
      }

      if (ageNumber == null) {
        Alert.alert('Ålder saknas', 'Skriv din egen ålder, till exempel 32.');
        return;
      }

      if (ageNumber < 18 || ageNumber > 99) {
        Alert.alert('Ogiltig ålder', 'WithU är 18+ just nu. Ålder måste vara mellan 18 och 99.');
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
      setAge(String(ageNumber));
      setMinAge(String(minAgeNumber));
      setMaxAge(String(maxAgeNumber));

      const { error } = await supabase.from('profiles').upsert(
        {
          id: authData.user.id,
          name: name.trim(),
          city: city.trim(),
          country: country.trim() || 'Sverige',
          age: ageNumber,
          bio: bio.trim(),
          avatar_url: avatarUrl,
          min_age: minAgeNumber,
          max_age: maxAgeNumber,
          activities: selectedActivities,
          is_profile_complete: true,
          email_verified: !!authData.user.email_confirmed_at,
          verification_level: authData.user.email_confirmed_at ? 'email' : 'new',
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'id' }
      );

      if (error) throw error;

      setIsEditing(false);
      await loadProfile();
      Alert.alert('Klart', 'Profilen är sparad.');
    } catch (error: any) {
      Alert.alert('Kunde inte spara', error?.message ?? 'Något gick fel.');
    } finally {
      setSaving(false);
    }
  }

  async function acceptSafetyRules() {
    if (!currentUserId || saving) return;

    try {
      setSaving(true);
      const now = new Date().toISOString();
      const { error } = await supabase
        .from('profiles')
        .update({
          accepted_rules_at: now,
          email_verified: emailVerified,
          verification_level: emailVerified ? 'email' : 'new',
          updated_at: now,
        })
        .eq('id', currentUserId);

      if (error) throw error;
      setAcceptedRulesAt(now);
      setVerificationLevel(emailVerified ? 'email' : 'new');
      Alert.alert('Klart', 'Trygghetsreglerna är godkända. Nu kan du använda WithU mer tryggt.');
    } catch (error: any) {
      Alert.alert('Kunde inte spara', error?.message ?? 'Försök igen.');
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
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: { confirmText: DELETE_CONFIRM_TEXT },
      });

      if (error) throw error;

      await supabase.auth.signOut({ scope: 'local' });
      setDeleteModalVisible(false);
      router.replace('/login');
    } catch (error: any) {
      Alert.alert('Kunde inte ta bort konto', error?.message ?? 'Något gick fel. Försök igen.');
    } finally {
      setDeletingAccount(false);
    }
  }

  function renderProfileView() {
    return (
      <>
        <View style={styles.heroCard}>
          <TouchableOpacity activeOpacity={0.88} onPress={pickAndUploadAvatar} style={styles.avatarWrap}>
            <WithUAvatar emoji={avatarEmoji || initialsFromName(publicName)} imageUrl={avatarUrl} size={106} online />
            <View style={styles.cameraBadge}>
              {uploadingAvatar ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Ionicons name="camera" size={18} color="#FFFFFF" />
              )}
            </View>
          </TouchableOpacity>

          <View style={styles.heroText}>
            <Text style={styles.eyebrow}>TRYGGT KONTAKTKORT</Text>
            <Text style={styles.profileName}>{publicName}</Text>
            <Text style={styles.profileMeta}>
              {[age ? `${age} år` : null, publicPlace].filter(Boolean).join(' · ')}
            </Text>
          </View>

          <View style={styles.badgeRow}>
            <View style={styles.badge}>
              <Ionicons name="checkmark-circle" size={15} color="#1C5E52" />
              <Text style={styles.badgeText}>{profileCompletion}% klar</Text>
            </View>
            <View style={styles.badge}>
              <Ionicons
                name={isBankIdVerified ? 'shield-checkmark' : 'shield-outline'}
                size={15}
                color={isBankIdVerified ? '#1C5E52' : '#7A8499'}
              />
              <Text style={styles.badgeText}>{isBankIdVerified ? 'Verifierad' : 'Ej verifierad'}</Text>
            </View>
            <View style={styles.badge}>
              <Ionicons
                name={rulesAccepted ? 'shield-checkmark-outline' : 'alert-circle-outline'}
                size={15}
                color={rulesAccepted ? '#1C5E52' : '#E05C4B'}
              />
              <Text style={styles.badgeText}>{rulesAccepted ? 'Regler godkända' : 'Regler saknas'}</Text>
            </View>
          </View>

          <View style={styles.heroActions}>
            <TouchableOpacity style={styles.primaryButton} onPress={() => setIsEditing(true)}>
              <Text style={styles.primaryButtonText}>Ändra min info</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.secondaryButton} onPress={() => router.push('/volunteers')}>
              <Text style={styles.secondaryButtonText}>Volontärstöd</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{friends.length}</Text>
            <Text style={styles.statLabel}>Trygga kontakter</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{selectedActivities.length}</Text>
            <Text style={styles.statLabel}>Aktiviteter</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{minAge}–{maxAge}</Text>
            <Text style={styles.statLabel}>Matchning</Text>
          </View>
        </View>

        <VolunteerStatusCard userId={currentUserId} />

        <View style={styles.card}>
          <View style={styles.sectionHeader}>
            <View>
              <Text style={styles.sectionLabel}>DET HÄR SÖKER JAG</Text>
              <Text style={styles.sectionTitle}>Behov och kontakt</Text>
            </View>
            <Pressable onPress={() => setIsEditing(true)}>
              <Text style={styles.sectionAction}>Ändra</Text>
            </Pressable>
          </View>
          <Text style={styles.bodyText}>
            {bio || 'Skriv kort vad du söker just nu. Det gör det lättare för rätt person att våga säga hej.'}
          </Text>
        </View>

        <View style={styles.card}>
          <View style={styles.sectionHeader}>
            <View>
              <Text style={styles.sectionLabel}>SÄTT ATT MÖTAS</Text>
              <Text style={styles.sectionTitle}>Det här kan jag tänka mig</Text>
            </View>
            <Pressable onPress={() => setIsEditing(true)}>
              <Text style={styles.sectionAction}>Välj</Text>
            </Pressable>
          </View>
          <View style={styles.chipsWrap}>
            {visibleActivities.length ? (
              visibleActivities.map((item) => (
                <View key={item} style={styles.chipActive}>
                  <Text style={styles.chipActiveText}>{item}</Text>
                </View>
              ))
            ) : (
              <Text style={styles.mutedText}>Inga aktiviteter valda ännu.</Text>
            )}
          </View>
        </View>

        <View style={styles.card}>
          <View style={styles.sectionHeader}>
            <View>
              <Text style={styles.sectionLabel}>TRYGGA KONTAKTER</Text>
              <Text style={styles.sectionTitle}>Personer du valt att prata med</Text>
            </View>
            <Pressable onPress={() => setActiveTab('friends')}>
              <Text style={styles.sectionAction}>Se alla</Text>
            </Pressable>
          </View>

          {friends.length ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.friendStrip}>
              {friends.slice(0, 8).map((friend) => (
                <Pressable
                  key={friend.id}
                  style={styles.friendMini}
                  onPress={() => router.push(`/chat/${makeConversationKey(currentUserId, friend.id)}`)}
                >
                  <WithUAvatar
                    emoji={friend.avatar_emoji || initialsFromName(friend.name || '')}
                    imageUrl={friend.avatar_url}
                    size={56}
                  />
                  <Text numberOfLines={1} style={styles.friendMiniName}>
                    {friend.name || 'Kontakt'}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          ) : (
            <Text style={styles.mutedText}>När båda valt kontakt syns personen här.</Text>
          )}
        </View>
      </>
    );
  }

  function renderFriendsView() {
    return (
      <View style={styles.card}>
        <Text style={styles.sectionLabel}>DINA TRYGGA KONTAKTER</Text>
        <Text style={styles.sectionTitle}>Samtal där båda valt kontakt</Text>
        <Text style={styles.bodyText}>
          Här samlas personer där båda har valt att prata. Gemenskap kan visas bara för dina trygga kontakter.
        </Text>

        <View style={styles.friendList}>
          {friends.length ? (
            friends.map((friend) => (
              <Pressable
                key={friend.id}
                style={styles.friendRow}
                onPress={() => router.push(`/chat/${makeConversationKey(currentUserId, friend.id)}`)}
              >
                <WithUAvatar
                  emoji={friend.avatar_emoji || initialsFromName(friend.name || '')}
                  imageUrl={friend.avatar_url}
                  size={54}
                />
                <View style={styles.friendInfo}>
                  <Text style={styles.friendName}>
                    {friend.name || 'Kontakt'}{friend.age ? `, ${friend.age}` : ''}
                  </Text>
                  <Text style={styles.friendMeta}>{friend.city || 'Ingen stad'} · {friend.activities?.[0] || 'Prata'}</Text>
                </View>
                <Ionicons name="chatbubble-ellipses-outline" size={22} color="#1C5E52" />
              </Pressable>
            ))
          ) : (
            <View style={styles.emptyState}>
              <Text style={styles.emptyIcon}>💙</Text>
              <Text style={styles.emptyTitle}>Inga trygga kontakter ännu</Text>
              <Text style={styles.emptyText}>Gå till Hitta och tryck “Vill prata” på personer du vill lära känna.</Text>
              <TouchableOpacity style={styles.primaryButton} onPress={() => router.push('/')}>
                <Text style={styles.primaryButtonText}>Öppna Hitta</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>
    );
  }

  function renderSettingsView() {
    return (
      <>
        <View style={styles.card}>
          <Text style={styles.sectionLabel}>KONTO</Text>
          <Text style={styles.sectionTitle}>Inloggning och säkerhet</Text>
          {!!email && <Text style={styles.bodyText}>{email}</Text>}

          <View style={styles.settingsList}>
            <Pressable style={styles.settingRow} onPress={() => setIsEditing(true)}>
              <Ionicons name="person-outline" size={22} color="#1C5E52" />
              <View style={styles.settingTextWrap}>
                <Text style={styles.settingTitle}>Ändra min info</Text>
                <Text style={styles.settingSub}>Namn, stad, behov, profilbild och aktiviteter</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#9AA4B8" />
            </Pressable>

            <Pressable style={styles.settingRow} onPress={() => router.push('/volunteers')}>
              <Ionicons name="heart-outline" size={22} color="#E05C4B" />
              <View style={styles.settingTextWrap}>
                <Text style={styles.settingTitle}>Volontärstöd</Text>
                <Text style={styles.settingSub}>Ansök, visa status eller hitta stödpersoner</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#9AA4B8" />
            </Pressable>

            {isAdmin ? (
              <Pressable style={styles.settingRow} onPress={() => router.push('/admin/reports')}>
                <Ionicons name="shield-checkmark-outline" size={22} color="#8F2D0A" />
                <View style={styles.settingTextWrap}>
                  <Text style={styles.settingTitle}>Admin och rapporter</Text>
                  <Text style={styles.settingSub}>Hantera rapporter, blockeringar och trygghet</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color="#9AA4B8" />
              </Pressable>
            ) : null}

            <Pressable style={styles.settingRow} onPress={removeAvatar}>
              <Ionicons name="image-outline" size={22} color="#617092" />
              <View style={styles.settingTextWrap}>
                <Text style={styles.settingTitle}>Ta bort profilbild</Text>
                <Text style={styles.settingSub}>Du kan lägga upp en ny bild senare</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#9AA4B8" />
            </Pressable>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionLabel}>TRYGGHET</Text>
          <Text style={styles.sectionTitle}>Synlighet och konto</Text>
          <Text style={styles.bodyText}>
            Din exakta plats visas aldrig. Personer ser bara stad, behov, aktiviteter och profilbild om du själv lägger upp en.
          </Text>
          <View style={styles.trustBox}>
            <Text style={styles.trustTitle}>Kontostatus: {verificationLevel}</Text>
            <Text style={styles.trustText}>
              E-post {emailVerified ? 'godkänd' : 'saknas'} · Telefon {phoneVerified ? 'godkänd' : 'kommer senare'} · Trust {trustScore}/100
            </Text>
            {limitedActive ? (
              <Text style={styles.trustWarning}>
                Nytt konto är begränsat i början. Det stoppar spam och falska registreringar.
              </Text>
            ) : null}
            {!rulesAccepted ? (
              <TouchableOpacity style={styles.rulesButton} onPress={acceptSafetyRules} disabled={saving}>
                <Text style={styles.rulesButtonText}>Godkänn trygghetsregler</Text>
              </TouchableOpacity>
            ) : (
              <Text style={styles.rulesOk}>Trygghetsregler godkända.</Text>
            )}
          </View>
          <View style={styles.accountActions}>
            <TouchableOpacity style={styles.neutralButton} onPress={logout}>
              <Text style={styles.neutralButtonText}>Logga ut</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.dangerButton}
              onPress={() => {
                setDeleteConfirmValue('');
                setDeleteModalVisible(true);
              }}
            >
              <Text style={styles.dangerButtonText}>Radera konto</Text>
            </TouchableOpacity>
          </View>
        </View>
      </>
    );
  }

  function renderEditView() {
    return (
      <>
        <View style={styles.editHeader}>
          <Pressable style={styles.roundIconButton} onPress={() => setIsEditing(false)}>
            <Ionicons name="close" size={24} color="#20325E" />
          </Pressable>
          <Text style={styles.editTitle}>Ändra min info</Text>
          <Pressable style={styles.savePill} onPress={saveProfile} disabled={saving}>
            {saving ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.savePillText}>Spara</Text>}
          </Pressable>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionLabel}>GRUNDUPPGIFTER</Text>
          <Text style={styles.fieldLabel}>Namn</Text>
          <TextInput value={name} onChangeText={setName} placeholder="Ditt namn" placeholderTextColor="#9AA6C1" style={styles.input} />

          <Text style={styles.fieldLabel}>Stad</Text>
          <TextInput value={city} onChangeText={setCity} placeholder="Till exempel Stockholm" placeholderTextColor="#9AA6C1" style={styles.input} />

          <Text style={styles.fieldLabel}>Land</Text>
          <TextInput value={country} onChangeText={setCountry} placeholder="Sverige" placeholderTextColor="#9AA6C1" style={styles.input} />

          <Text style={styles.fieldLabel}>Ålder</Text>
          <TextInput
            value={age}
            onChangeText={(value) => setAge(sanitizeAgeInput(value))}
            placeholder="Din ålder"
            placeholderTextColor="#9AA6C1"
            keyboardType="number-pad"
            maxLength={2}
            style={styles.input}
          />
          <Text style={styles.inputHint}>WithU är 18+ just nu. Du väljer själv vilka åldrar du vill matcha och kontakta nedan.</Text>

          <Text style={styles.fieldLabel}>Det här söker jag</Text>
          <TextInput
            value={bio}
            onChangeText={setBio}
            placeholder="Skriv kort vad du söker eller kan ge"
            placeholderTextColor="#9AA6C1"
            multiline
            textAlignVertical="top"
            style={[styles.input, styles.textArea]}
          />
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionLabel}>MATCHNING</Text>
          <Text style={styles.sectionTitle}>Vilka åldrar vill du matcha med?</Text>
          <Text style={styles.inputHint}>Personer utanför detta spann visas inte i Hitta.</Text>
          <View style={styles.ageRow}>
            <View style={styles.ageCol}>
              <Text style={styles.fieldLabel}>Från</Text>
              <TextInput value={minAge} onChangeText={(value) => setMinAge(sanitizeAgeInput(value))} placeholder="18" keyboardType="number-pad" maxLength={2} style={styles.input} />
            </View>
            <View style={styles.ageCol}>
              <Text style={styles.fieldLabel}>Till</Text>
              <TextInput value={maxAge} onChangeText={(value) => setMaxAge(sanitizeAgeInput(value))} placeholder="99" keyboardType="number-pad" maxLength={2} style={styles.input} />
            </View>
          </View>
        </View>

        <View style={styles.card}>
          <View style={styles.sectionHeader}>
            <View>
              <Text style={styles.sectionLabel}>SÄTT ATT MÖTAS</Text>
              <Text style={styles.sectionTitle}>Vad känns tryggt för dig?</Text>
            </View>
            <View style={styles.counterBadge}>
              <Text style={styles.counterBadgeText}>{selectedActivities.length}/{MAX_ACTIVITIES}</Text>
            </View>
          </View>

          {ACTIVITY_CATEGORIES.map((category) => (
            <View key={category.title} style={styles.categoryBlock}>
              <Text style={styles.categoryTitle}>{category.emoji} {category.title}</Text>
              <View style={styles.chipsWrap}>
                {category.items.map((item) => {
                  const active = selectedActivities.includes(item);
                  return (
                    <Pressable
                      key={`${category.title}-${item}`}
                      onPress={() => toggleActivity(item)}
                      style={[styles.choiceChip, active && styles.choiceChipActive]}
                    >
                      <Text style={[styles.choiceChipText, active && styles.choiceChipTextActive]}>{item}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ))}
        </View>
      </>
    );
  }

  if (loading) {
    return (
      <View style={styles.loadingWrap}>
        <ActivityIndicator size="large" color="#1C5E52" />
        <Text style={styles.loadingText}>Laddar din sida...</Text>
      </View>
    );
  }

  return (
    <>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 88 : 0}
        style={styles.screen}
      >
        <ScrollView
          style={styles.screen}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
        >
          <View style={styles.pageHeader}>
            <Text style={styles.pageTitle}>Jag</Text>
            <Text style={styles.pageSubtitle}>Din trygghet, dina kontakter och hur andra kan möta dig.</Text>
          </View>

          {!isEditing ? (
            <View style={styles.tabs}>
              {[
                { key: 'profile' as const, label: 'Jag', icon: 'person-outline' as const },
                { key: 'friends' as const, label: 'Trygga kontakter', icon: 'people-outline' as const },
                { key: 'settings' as const, label: 'Trygghet', icon: 'settings-outline' as const },
              ].map((tab) => {
                const active = activeTab === tab.key;
                return (
                  <Pressable
                    key={tab.key}
                    style={[styles.tabButton, active && styles.tabButtonActive]}
                    onPress={() => setActiveTab(tab.key)}
                  >
                    <Ionicons name={tab.icon} size={18} color={active ? '#FFFFFF' : '#617092'} />
                    <Text style={[styles.tabText, active && styles.tabTextActive]}>{tab.label}</Text>
                  </Pressable>
                );
              })}
            </View>
          ) : null}

          {isEditing
            ? renderEditView()
            : activeTab === 'profile'
              ? renderProfileView()
              : activeTab === 'friends'
                ? renderFriendsView()
                : renderSettingsView()}
        </ScrollView>
      </KeyboardAvoidingView>

      <Modal
        visible={deleteModalVisible}
        transparent
        animationType="slide"
        presentationStyle="overFullScreen"
        onRequestClose={() => {
          if (!deletingAccount) setDeleteModalVisible(false);
        }}
      >
        <KeyboardAvoidingView
          style={styles.modalKeyboardWrap}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <Pressable
            style={styles.modalOverlay}
            onPress={() => {
              if (!deletingAccount) setDeleteModalVisible(false);
            }}
          >
            <Pressable style={styles.deleteModalSheet} onPress={() => {}}>
              <Text style={styles.deleteModalTitle}>Radera konto</Text>
              <Text style={styles.deleteModalText}>
                Det här raderar ditt konto permanent. Skriv{' '}
                <Text style={styles.deleteModalStrong}>{DELETE_CONFIRM_TEXT}</Text> för att fortsätta.
              </Text>
              <TextInput
                value={deleteConfirmValue}
                onChangeText={setDeleteConfirmValue}
                placeholder={`Skriv ${DELETE_CONFIRM_TEXT}`}
                placeholderTextColor="#9AA6C1"
                autoCapitalize="characters"
                style={styles.input}
              />
              <View style={styles.deleteModalActions}>
                <Pressable style={styles.neutralButton} onPress={() => setDeleteModalVisible(false)}>
                  <Text style={styles.neutralButtonText}>Avbryt</Text>
                </Pressable>
                <Pressable
                  style={[styles.dangerButton, !canConfirmDelete && styles.disabledButton]}
                  onPress={deleteAccount}
                  disabled={!canConfirmDelete}
                >
                  {deletingAccount ? (
                    <ActivityIndicator color="#FFFFFF" />
                  ) : (
                    <Text style={styles.dangerButtonText}>Radera</Text>
                  )}
                </Pressable>
              </View>
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
    paddingTop: 18,
    paddingBottom: 42,
  },
  loadingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F7F6F2',
  },
  loadingText: {
    marginTop: 12,
    color: '#20325E',
    fontSize: 16,
    fontWeight: '700',
  },
  pageHeader: {
    marginBottom: 14,
  },
  pageTitle: {
    color: '#0F1E38',
    fontSize: 34,
    fontWeight: '900',
    lineHeight: 40,
  },
  pageSubtitle: {
    color: '#7A8499',
    fontSize: 15,
    lineHeight: 22,
    marginTop: 4,
  },
  tabs: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 14,
  },
  tabButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E2E7F0',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  tabButtonActive: {
    backgroundColor: '#1C5E52',
    borderColor: '#1C5E52',
  },
  tabText: {
    color: '#617092',
    fontSize: 12,
    fontWeight: '900',
  },
  tabTextActive: {
    color: '#FFFFFF',
  },
  heroCard: {
    backgroundColor: '#0F1E38',
    borderRadius: 28,
    padding: 20,
    marginBottom: 12,
    shadowColor: '#0F1E38',
    shadowOpacity: 0.16,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 3,
  },
  avatarWrap: {
    alignSelf: 'center',
    width: 112,
    height: 112,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cameraBadge: {
    position: 'absolute',
    right: 0,
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
  heroText: {
    alignItems: 'center',
    marginTop: 14,
  },
  eyebrow: {
    color: '#7ED3C4',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1.4,
    marginBottom: 8,
  },
  profileName: {
    color: '#FFFFFF',
    fontSize: 31,
    fontWeight: '900',
    lineHeight: 36,
    textAlign: 'center',
  },
  profileMeta: {
    color: 'rgba(255,255,255,0.72)',
    fontSize: 15,
    lineHeight: 22,
    marginTop: 5,
    textAlign: 'center',
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
    marginTop: 16,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
  heroActions: {
    marginTop: 18,
    gap: 10,
  },
  primaryButton: {
    minHeight: 52,
    borderRadius: 18,
    backgroundColor: '#E05C4B',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '900',
  },
  secondaryButton: {
    minHeight: 52,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  secondaryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '900',
  },
  statsRow: {
    flexDirection: 'row',
    gap: 9,
    marginBottom: 12,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E6EAF4',
    paddingVertical: 14,
    paddingHorizontal: 8,
    alignItems: 'center',
  },
  statValue: {
    color: '#0F1E38',
    fontSize: 20,
    fontWeight: '900',
    lineHeight: 25,
  },
  statLabel: {
    color: '#7A8499',
    fontSize: 12,
    fontWeight: '800',
    marginTop: 4,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#E6EAF4',
    padding: 18,
    marginBottom: 12,
    shadowColor: '#20325E',
    shadowOpacity: 0.05,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 8,
  },
  sectionLabel: {
    color: '#7A8499',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1.2,
    marginBottom: 7,
  },
  sectionTitle: {
    color: '#0F1E38',
    fontSize: 21,
    fontWeight: '900',
    lineHeight: 27,
    marginBottom: 8,
  },
  sectionAction: {
    color: '#E05C4B',
    fontSize: 14,
    fontWeight: '900',
  },
  bodyText: {
    color: '#34405A',
    fontSize: 15,
    lineHeight: 24,
  },
  mutedText: {
    color: '#7A8499',
    fontSize: 15,
    lineHeight: 22,
  },
  chipsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chipActive: {
    backgroundColor: '#EAF6F2',
    borderColor: '#1C5E52',
    borderWidth: 1.5,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  chipActiveText: {
    color: '#1C5E52',
    fontSize: 14,
    fontWeight: '900',
  },
  friendStrip: {
    gap: 12,
    paddingRight: 6,
  },
  friendMini: {
    width: 72,
    alignItems: 'center',
  },
  friendMiniName: {
    color: '#20325E',
    fontSize: 12,
    fontWeight: '800',
    marginTop: 6,
    maxWidth: 72,
  },
  friendList: {
    marginTop: 12,
  },
  friendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#EEF1F6',
  },
  friendInfo: {
    flex: 1,
  },
  friendName: {
    color: '#0F1E38',
    fontSize: 17,
    fontWeight: '900',
  },
  friendMeta: {
    color: '#7A8499',
    fontSize: 13,
    fontWeight: '700',
    marginTop: 3,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 18,
  },
  emptyIcon: {
    fontSize: 38,
    marginBottom: 10,
  },
  emptyTitle: {
    color: '#0F1E38',
    fontSize: 22,
    fontWeight: '900',
    marginBottom: 6,
  },
  emptyText: {
    color: '#7A8499',
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    marginBottom: 16,
  },
  settingsList: {
    marginTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#EEF1F6',
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#EEF1F6',
  },
  settingTextWrap: {
    flex: 1,
  },
  settingTitle: {
    color: '#0F1E38',
    fontSize: 15,
    fontWeight: '900',
  },
  settingSub: {
    color: '#7A8499',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 2,
  },
  accountActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 16,
  },
  trustBox: {
    marginTop: 14,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#B8DDD5',
    backgroundColor: '#EAF6F2',
    padding: 14,
  },
  trustTitle: {
    color: '#0F1E38',
    fontSize: 16,
    fontWeight: '900',
    marginBottom: 5,
  },
  trustText: {
    color: '#39506C',
    fontSize: 13,
    fontWeight: '800',
    lineHeight: 19,
  },
  trustWarning: {
    color: '#8F2D0A',
    fontSize: 12,
    fontWeight: '800',
    lineHeight: 18,
    marginTop: 8,
  },
  rulesButton: {
    minHeight: 46,
    borderRadius: 15,
    backgroundColor: '#1C5E52',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
  },
  rulesButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '900',
  },
  rulesOk: {
    color: '#1C5E52',
    fontSize: 13,
    fontWeight: '900',
    marginTop: 10,
  },
  neutralButton: {
    flex: 1,
    minHeight: 52,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#DCE4F3',
    backgroundColor: '#F4F7FC',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  neutralButtonText: {
    color: '#20325E',
    fontSize: 15,
    fontWeight: '900',
  },
  dangerButton: {
    flex: 1,
    minHeight: 52,
    borderRadius: 16,
    backgroundColor: '#C93C3C',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  dangerButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '900',
  },
  editHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  roundIconButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E6EAF4',
    alignItems: 'center',
    justifyContent: 'center',
  },
  editTitle: {
    color: '#0F1E38',
    fontSize: 21,
    fontWeight: '900',
  },
  savePill: {
    minWidth: 82,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#1C5E52',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  savePillText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '900',
  },
  fieldLabel: {
    color: '#20325E',
    fontSize: 14,
    fontWeight: '900',
    marginBottom: 8,
    marginTop: 10,
  },
  input: {
    minHeight: 56,
    borderRadius: 17,
    backgroundColor: '#F3F6FC',
    borderWidth: 1,
    borderColor: '#DFE6F2',
    paddingHorizontal: 15,
    color: '#20325E',
    fontSize: 16,
    fontWeight: '700',
  },
  inputHint: {
    color: '#74819C',
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 18,
    marginTop: 7,
  },
  textArea: {
    minHeight: 126,
    paddingTop: 15,
    paddingBottom: 15,
    lineHeight: 22,
  },
  ageRow: {
    flexDirection: 'row',
    gap: 10,
  },
  ageCol: {
    flex: 1,
  },
  counterBadge: {
    backgroundColor: '#EEF4FF',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#D8E4FA',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  counterBadgeText: {
    color: '#20325E',
    fontSize: 13,
    fontWeight: '900',
  },
  categoryBlock: {
    marginTop: 14,
  },
  categoryTitle: {
    color: '#20325E',
    fontSize: 16,
    fontWeight: '900',
    marginBottom: 10,
  },
  choiceChip: {
    backgroundColor: '#F3F6FC',
    borderWidth: 1.5,
    borderColor: '#D7DFEF',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  choiceChipActive: {
    backgroundColor: '#EAF6F2',
    borderColor: '#1C5E52',
  },
  choiceChipText: {
    color: '#20325E',
    fontSize: 14,
    fontWeight: '800',
  },
  choiceChipTextActive: {
    color: '#1C5E52',
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
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 20,
    borderWidth: 1,
    borderColor: '#E6EAF4',
  },
  deleteModalTitle: {
    color: '#0F1E38',
    fontSize: 25,
    fontWeight: '900',
    marginBottom: 10,
  },
  deleteModalText: {
    color: '#5B6785',
    fontSize: 15,
    lineHeight: 23,
    marginBottom: 14,
  },
  deleteModalStrong: {
    color: '#C93C3C',
    fontWeight: '900',
  },
  deleteModalActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
  },
  disabledButton: {
    opacity: 0.5,
  },
});
