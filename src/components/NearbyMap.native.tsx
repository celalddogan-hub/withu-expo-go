import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import MapView, { Circle, MapStyleElement, Marker } from 'react-native-maps';

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

const MAP_STYLE: MapStyleElement[] = [
  { elementType: 'geometry', stylers: [{ color: '#E8F0E4' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#F5F1EA' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#6B6055' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#A8C4E0' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#FFFFFF' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#E5DDD0' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#C8DDB8' }] },
  { featureType: 'poi', elementType: 'labels', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', elementType: 'labels', stylers: [{ visibility: 'simplified' }] },
];

export function NearbyMap({
  region,
  myPosition,
  radiusKm,
  people,
  formatDistance,
  onOpenProfile,
  onSelectPerson,
  selectedPersonId,
}: NearbyMapProps) {
  return (
    <MapView
      style={styles.map}
      initialRegion={region}
      region={region}
      customMapStyle={MAP_STYLE}
      showsCompass={false}
      showsPointsOfInterest={false}
      mapPadding={{ top: 190, right: 24, bottom: 205, left: 24 }}
    >
      <Circle
        center={myPosition}
        radius={radiusKm * 1000}
        strokeColor="rgba(223,90,71,0.34)"
        fillColor="rgba(223,90,71,0.08)"
      />

      <Marker coordinate={myPosition} title="Din ungefärliga plats">
        <View style={styles.meRadius}>
          <View style={styles.meMarker} />
        </View>
      </Marker>

      {people.map((person) => {
        const pinColor = person.pinColor || '#DF5A47';
        const selected = selectedPersonId === person.id;

        return (
          <Marker
            key={person.id}
            coordinate={{ latitude: person.latitude!, longitude: person.longitude! }}
            title={person.name || 'Medlem'}
            description={`${person.activityLabel || 'Bara prata'} · ${formatDistance(person.distanceKm)} bort`}
            onPress={() => onSelectPerson?.(person.id)}
            onCalloutPress={() => onOpenProfile(person.id)}
          >
            <View style={styles.pinWrap}>
              <View
                style={[
                  styles.personMarker,
                  { backgroundColor: pinColor },
                  selected && styles.personMarkerSelected,
                ]}
              >
                <Text style={styles.personMarkerText}>{person.initials || person.avatar_emoji || 'WU'}</Text>
                <View style={styles.onlineDot} />
              </View>
              <View style={[styles.pinTail, { backgroundColor: pinColor }]} />
              <View style={styles.activityBubble}>
                <Text numberOfLines={1} style={styles.activityBubbleText}>
                  {person.activityLabel || 'Bara prata'}
                </Text>
              </View>
            </View>
          </Marker>
        );
      })}
    </MapView>
  );
}

const styles = StyleSheet.create({
  map: {
    flex: 1,
  },
  meRadius: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(223,90,71,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(223,90,71,0.28)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  meMarker: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#DF5A47',
    borderWidth: 4,
    borderColor: '#FFFFFF',
    shadowColor: '#DF5A47',
    shadowOpacity: 0.38,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  pinWrap: {
    alignItems: 'center',
  },
  personMarker: {
    minWidth: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 3,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
    shadowColor: '#000',
    shadowOpacity: 0.20,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 5,
  },
  personMarkerSelected: {
    borderWidth: 4,
    shadowOpacity: 0.30,
  },
  personMarkerText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '900',
  },
  onlineDot: {
    position: 'absolute',
    right: -2,
    bottom: 4,
    width: 11,
    height: 11,
    borderRadius: 6,
    backgroundColor: '#38A87A',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  pinTail: {
    width: 4,
    height: 8,
    borderRadius: 2,
    marginTop: -1,
  },
  activityBubble: {
    maxWidth: 112,
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginTop: 4,
    shadowColor: '#000',
    shadowOpacity: 0.10,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  activityBubbleText: {
    color: '#111118',
    fontSize: 10,
    fontWeight: '900',
  },
});
