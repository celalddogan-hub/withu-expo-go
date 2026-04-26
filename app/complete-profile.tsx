import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

export default function CompleteProfileScreen() {
  const router = useRouter();

  return (
    <View style={styles.screen}>
      <Text style={styles.title}>Gör klart din profil</Text>
      <Text style={styles.text}>
        Fyll i namn, stad och aktiviteter i Profil så fungerar Hitta, Nu och Karta bättre.
      </Text>
      <Pressable style={styles.button} onPress={() => router.replace('/(tabs)/profile')}>
        <Text style={styles.buttonText}>Öppna profil</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F8F7F4',
    padding: 24,
  },
  title: {
    color: '#0F1E38',
    fontSize: 28,
    fontWeight: '900',
    textAlign: 'center',
    marginBottom: 10,
  },
  text: {
    color: '#5C6780',
    fontSize: 15,
    lineHeight: 23,
    textAlign: 'center',
    marginBottom: 18,
  },
  button: {
    minHeight: 50,
    borderRadius: 16,
    backgroundColor: '#1C5E52',
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '900',
  },
});
