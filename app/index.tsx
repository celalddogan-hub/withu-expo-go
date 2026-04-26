import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '../src/lib/supabase';

export default function IndexScreen() {
  const router = useRouter();
  const [message, setMessage] = useState('Startar WithU...');

  useEffect(() => {
    let mounted = true;
    const fallbackTimer = setTimeout(() => {
      if (!mounted) return;
      setMessage('Öppnar inloggning...');
      router.replace('/login');
    }, 8000);

    async function routeFromSession() {
      try {
        const {
          data: { session },
          error,
        } = await supabase.auth.getSession();

        if (error) throw error;
        if (!mounted) return;

        clearTimeout(fallbackTimer);
        router.replace(session?.user ? '/(tabs)' : '/login');
      } catch {
        if (!mounted) return;
        clearTimeout(fallbackTimer);
        setMessage('Öppnar inloggning...');
        router.replace('/login');
      }
    }

    routeFromSession();

    return () => {
      mounted = false;
      clearTimeout(fallbackTimer);
    };
  }, [router]);

  return (
    <View style={styles.screen}>
      <ActivityIndicator size="large" color="#1C5E52" />
      <Text style={styles.title}>WithU</Text>
      <Text style={styles.message}>{message}</Text>
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
    marginTop: 16,
    color: '#0F1E38',
    fontSize: 30,
    fontWeight: '900',
  },
  message: {
    marginTop: 8,
    color: '#5C6780',
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'center',
  },
});
