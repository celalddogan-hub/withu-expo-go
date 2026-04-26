import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export type NearbyMapRegion = {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
};

type NearbyMapPerson = {
  id: string;
  name: string | null;
  avatar_emoji?: string | null;
  activityLabel?: string;
  initials?: string;
  pinColor?: string;
  latitude: number | null;
  longitude: number | null;
  distanceKm: number;
};

type NearbyMapProps = {
  region: NearbyMapRegion;
  myPosition: { latitude: number; longitude: number };
  radiusKm: number;
  people: NearbyMapPerson[];
  formatDistance: (value: number) => string;
  onOpenProfile: (userId: string) => void;
  onSelectPerson?: (userId: string) => void;
  selectedPersonId?: string | null;
};

export function NearbyMap({ radiusKm, people }: NearbyMapProps) {
  return (
    <View style={styles.fallback}>
      <Ionicons name="map-outline" size={34} color="#1C5E52" />
      <Text style={styles.title}>Kartan visas i appen</Text>
      <Text style={styles.text}>
        Webbläget visar listan med {people.length} personer inom {radiusKm} km.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  fallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  title: {
    marginTop: 10,
    color: '#1C5E52',
    fontSize: 16,
    fontWeight: '900',
    textAlign: 'center',
  },
  text: {
    marginTop: 6,
    color: '#5C6780',
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 20,
    textAlign: 'center',
  },
});
