import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as Location from 'expo-location';
import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../src/lib/supabase';
import { NearbyMap, type NearbyMapRegion } from '../../src/components/NearbyMap';

type NearbyProfileRow = {
  id: string;
  name: string | null;
  city: string | null;
  activities: string[] | null;
  avatar_emoji: string | null;
  is_bankid_verified: boolean | null;
  latitude: number | null;
  longitude: number | null;
};

type NearbyPerson = NearbyProfileRow & {
  distanceKm: number;
};

const RADIUS_OPTIONS = [1, 2, 5] as const;
const PIN_COLORS = ['#38A87A', '#5C6BC0', '#DF5A47', '#E8922A', '#8E6BBF', '#2196A8'];

function toRadians(value: number) {
  return (value * Math.PI) / 180;
}

function getDistanceKm(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }) {
  const earthKm = 6371;
  const dLat = toRadians(b.latitude - a.latitude);
  const dLon = toRadians(b.longitude - a.longitude);
  const lat1 = toRadians(a.latitude);
  const lat2 = toRadians(b.latitude);
  const h =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return earthKm * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function roundCoordinate(value: number) {
  return Math.round(value * 1000) / 1000;
}

function formatDistance(value: number) {
  if (value < 1) return `${Math.max(50, Math.round((value * 1000) / 50) * 50)} m`;
  return `${value.toFixed(value < 10 ? 1 : 0)} km`;
}

function getFirstActivity(items?: string[] | null) {
  return (items ?? []).find((item) => !item.startsWith('Språk: ')) || 'Bara prata';
}

function getInitials(name?: string | null) {
  const clean = name?.trim();
  if (!clean) return 'WU';
  return clean
    .split(/\s+/)
    .map((part) => part[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

export default function NearbyScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [radiusKm, setRadiusKm] = useState<(typeof RADIUS_OPTIONS)[number]>(2);
  const [myPosition, setMyPosition] = useState<{ latitude: number; longitude: number } | null>(null);
  const [people, setPeople] = useState<NearbyPerson[]>([]);
  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [errorText, setErrorText] = useState('');
  const [setupText, setSetupText] = useState('');

  const region = useMemo<NearbyMapRegion | null>(() => {
    if (!myPosition) return null;
    const delta = Math.max(0.025, radiusKm * 0.018);
    return {
      latitude: myPosition.latitude,
      longitude: myPosition.longitude,
      latitudeDelta: delta,
      longitudeDelta: delta,
    };
  }, [myPosition, radiusKm]);

  const visiblePeople = useMemo(
    () =>
      people
        .filter((person) => person.distanceKm <= radiusKm)
        .filter((person) => {
          const cleanQuery = query.trim().toLowerCase();
          if (!cleanQuery) return true;
          const searchable = [person.name, person.city, ...(person.activities ?? [])]
            .filter(Boolean)
            .join(' ')
            .toLowerCase();
          return searchable.includes(cleanQuery);
        })
        .map((person, index) => ({
          ...person,
          activityLabel: getFirstActivity(person.activities),
          initials: getInitials(person.name),
          pinColor: PIN_COLORS[index % PIN_COLORS.length],
        })),
    [people, query, radiusKm]
  );

  const loadNearby = useCallback(async () => {
    try {
      setErrorText('');
      setSetupText('');

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError) throw userError;
      if (!user) {
        setErrorText('Du måste logga in för att se personer nära dig.');
        setPeople([]);
        return;
      }

      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) {
        setErrorText('Platsåtkomst behövs för att visa personer inom 1 till 5 kilometer.');
        setPeople([]);
        return;
      }

      const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const nextPosition = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      };
      const approximatePosition = {
        latitude: roundCoordinate(nextPosition.latitude),
        longitude: roundCoordinate(nextPosition.longitude),
      };

      setMyPosition(nextPosition);

      const { error: saveError } = await supabase
        .from('profiles')
        .update({
          latitude: approximatePosition.latitude,
          longitude: approximatePosition.longitude,
          location_updated_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', user.id);

      if (saveError) {
        setSetupText('Databasen saknar platskolumner. Kör migrationsfilen för karta.');
      }

      const { data, error } = await supabase
        .from('profiles')
        .select('id, name, city, activities, avatar_emoji, is_bankid_verified, latitude, longitude')
        .neq('id', user.id)
        .eq('is_discoverable', true)
        .not('latitude', 'is', null)
        .not('longitude', 'is', null)
        .limit(200);

      if (error) {
        setSetupText('Databasen saknar platskolumner. Kör migrationsfilen för karta.');
        setPeople([]);
        return;
      }

      const built = ((data ?? []) as NearbyProfileRow[])
        .filter((profile) => typeof profile.latitude === 'number' && typeof profile.longitude === 'number')
        .map((profile) => ({
          ...profile,
          distanceKm: getDistanceKm(nextPosition, {
            latitude: profile.latitude!,
            longitude: profile.longitude!,
          }),
        }))
        .filter((profile) => profile.distanceKm <= 5)
        .sort((a, b) => a.distanceKm - b.distanceKm);

      setPeople(built);
    } catch (error: any) {
      setErrorText(error?.message || 'Kunde inte ladda personer nära dig.');
      setPeople([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      loadNearby();
    }, [loadNearby])
  );

  const refresh = async () => {
    setRefreshing(true);
    await loadNearby();
  };

  const openProfile = (userId: string) => {
    router.push({ pathname: '/user/[userId]', params: { userId } });
  };

  const openNow = () => {
    router.push('/now');
  };

  if (loading) {
    return (
      <View style={styles.centerState}>
        <ActivityIndicator size="large" color="#E05C4B" />
        <Text style={styles.centerTitle}>Laddar karta...</Text>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <View style={styles.mapWrap}>
        {region ? (
          <NearbyMap
            region={region}
            myPosition={myPosition!}
            radiusKm={radiusKm}
            people={visiblePeople}
            formatDistance={formatDistance}
            onOpenProfile={openProfile}
            onSelectPerson={setSelectedPersonId}
            selectedPersonId={selectedPersonId}
          />
        ) : (
          <View style={styles.mapFallback}>
            <Text style={styles.centerTitle}>Nära dig</Text>
            <Text style={styles.stateText}>{errorText || 'Kartan behöver platsåtkomst.'}</Text>
          </View>
        )}

        <View style={styles.panel}>
          <Text style={styles.eyebrow}>WithU</Text>
          <Text style={styles.title}>Nära dig</Text>
          <Text style={styles.subtitle}>Personer inom {radiusKm} km</Text>

          <View style={styles.searchBar}>
            <Ionicons name="search" size={17} color="#8B8FA8" />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Sök aktivitet eller område"
              placeholderTextColor="#8B8FA8"
              style={styles.searchInput}
              returnKeyType="search"
            />
          </View>

          <View style={styles.radiusRow}>
            {RADIUS_OPTIONS.map((option) => (
              <Pressable
                key={option}
                style={[styles.radiusChip, radiusKm === option && styles.radiusChipActive]}
                onPress={() => setRadiusKm(option)}
              >
                <Text style={[styles.radiusText, radiusKm === option && styles.radiusTextActive]}>
                  {option} km
                </Text>
              </Pressable>
            ))}
          </View>

          {setupText ? <Text style={styles.setupText}>{setupText}</Text> : null}

          <ScrollView
            style={styles.peopleList}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
          >
            {visiblePeople.length === 0 ? (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyTitle}>Ingen nära just nu</Text>
                <Text style={styles.emptyText}>När fler väljer att synas visas de här.</Text>
              </View>
            ) : (
              visiblePeople.map((person) => (
                <Pressable key={person.id} style={styles.personRow} onPress={() => openProfile(person.id)}>
                  <View style={[styles.avatar, { backgroundColor: person.pinColor }]}>
                    <Text style={styles.avatarText}>{person.initials}</Text>
                  </View>
                  <View style={styles.personInfo}>
                    <Text style={styles.personName}>{person.name || 'Medlem'}</Text>
                    <Text style={styles.personMeta}>
                      {person.city || 'Plats saknas'} · {formatDistance(person.distanceKm)}
                    </Text>
                    <Text style={styles.personActivity}>{person.activityLabel}</Text>
                  </View>
                </Pressable>
              ))
            )}
          </ScrollView>

          <Pressable style={styles.nowButton} onPress={openNow}>
            <Text style={styles.nowButtonText}>Jag är här nu</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F8F7F4' },
  mapWrap: { flex: 1 },
  mapFallback: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  panel: {
    position: 'absolute',
    left: 14,
    right: 14,
    bottom: 16,
    maxHeight: '58%',
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 16,
    borderWidth: 1,
    borderColor: '#ECEEF4',
  },
  eyebrow: { color: '#1C5E52', fontSize: 11, fontWeight: '900', letterSpacing: 1, marginBottom: 4 },
  title: { color: '#0F1E38', fontSize: 25, fontWeight: '900' },
  subtitle: { color: '#7A8399', fontSize: 13, fontWeight: '700', marginTop: 2 },
  searchBar: {
    minHeight: 46,
    borderRadius: 16,
    backgroundColor: '#F8FAFC',
    borderWidth: 1.5,
    borderColor: '#DDE2EF',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    marginTop: 12,
  },
  searchInput: { flex: 1, color: '#0F1E38', fontSize: 14, fontWeight: '800', marginLeft: 8 },
  radiusRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
  radiusChip: { borderRadius: 999, borderWidth: 1.5, borderColor: '#DDE2EF', paddingHorizontal: 14, paddingVertical: 8 },
  radiusChipActive: { backgroundColor: '#1C5E52', borderColor: '#1C5E52' },
  radiusText: { color: '#0F1E38', fontSize: 12, fontWeight: '900' },
  radiusTextActive: { color: '#FFFFFF' },
  setupText: { color: '#C07020', fontSize: 12, fontWeight: '800', marginTop: 10 },
  peopleList: { marginTop: 12 },
  personRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderTopWidth: 1, borderTopColor: '#EEF1F6' },
  avatar: { width: 44, height: 44, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  avatarText: { color: '#FFFFFF', fontSize: 14, fontWeight: '900' },
  personInfo: { flex: 1 },
  personName: { color: '#0F1E38', fontSize: 15, fontWeight: '900' },
  personMeta: { color: '#7A8399', fontSize: 12, fontWeight: '700', marginTop: 2 },
  personActivity: { color: '#1C5E52', fontSize: 12, fontWeight: '900', marginTop: 3 },
  nowButton: { minHeight: 48, borderRadius: 16, backgroundColor: '#E05C4B', alignItems: 'center', justifyContent: 'center', marginTop: 12 },
  nowButtonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '900' },
  emptyCard: { padding: 16, alignItems: 'center' },
  emptyTitle: { color: '#0F1E38', fontSize: 18, fontWeight: '900', textAlign: 'center' },
  emptyText: { color: '#5C6780', fontSize: 13, textAlign: 'center', marginTop: 5 },
  centerState: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: '#F8F7F4' },
  centerTitle: { color: '#0F1E38', fontSize: 22, fontWeight: '900', textAlign: 'center', marginTop: 10 },
  stateText: { color: '#5C6780', fontSize: 14, lineHeight: 22, textAlign: 'center', marginTop: 8 },
});
