import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '../../src/lib/supabase';

export default function AuthCallbackScreen() {
  const params = useLocalSearchParams<{ access_token?: string; refresh_token?: string; error?: string }>();
  const router = useRouter();
  const [message, setMessage] = useState('Bekräftar länken...');

  useEffect(() => {
    let mounted = true;

    async function confirm() {
      try {
        if (params.error) throw new Error(String(params.error));

        if (params.access_token && params.refresh_token) {
          const { error } = await supabase.auth.setSession({
            access_token: String(params.access_token),
            refresh_token: String(params.refresh_token),
          });
          if (error) throw error;
        }

        if (!mounted) return;
        setMessage('Klart. Öppnar appen...');
        router.replace('/(tabs)');
      } catch (error: any) {
        if (!mounted) return;
        setMessage(error?.message || 'Kunde inte bekräfta länken.');
        setTimeout(() => router.replace('/login'), 1600);
      }
    }

    confirm();
    return () => {
      mounted = false;
    };
  }, [params.access_token, params.error, params.refresh_token, router]);

  return (
    <View style={styles.screen}>
      <ActivityIndicator size="large" color="#1C5E52" />
      <Text style={styles.text}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: '#F8F7F4',
  },
  text: {
    marginTop: 14,
    color: '#0F1E38',
    fontSize: 16,
    fontWeight: '800',
    textAlign: 'center',
  },
});
