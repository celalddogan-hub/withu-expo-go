import React, { useEffect, useState } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { View, ActivityIndicator } from 'react-native';
import { supabase } from '../src/lib/supabase';
import { startPushRegistration } from '../src/lib/push';
import type { Session } from '@supabase/supabase-js';

export const unstable_settings = {
  initialRouteName: '(tabs)',
};

function AuthGuard({
  session,
  loading,
}: {
  session: Session | null;
  loading: boolean;
}) {
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!segments.length) return;

    const inAuthScreen =
      segments[0] === 'login' ||
      segments[0] === 'register' ||
      segments[0] === 'forgot-password' ||
      segments[0] === 'reset-password' ||
      segments[0] === 'verify';
    const shouldLeaveAuthScreen =
      segments[0] === 'login' ||
      segments[0] === 'register' ||
      segments[0] === 'forgot-password' ||
      segments[0] === 'verify';

    if (!session && !inAuthScreen) {
      router.replace('/login');
    } else if (session && shouldLeaveAuthScreen) {
      router.replace('/(tabs)');
    }
  }, [session, loading, segments, router]);

  return null;
}

export default function RootLayout() {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session);
      setLoading(false);

      if (event === 'PASSWORD_RECOVERY') {
        router.replace('/reset-password');
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [router]);

  useEffect(() => {
    let cleanup: void | (() => void);
    let timer: ReturnType<typeof setTimeout> | undefined;

    if (session) {
      timer = setTimeout(() => {
        cleanup = startPushRegistration();
      }, 2500);
    }

    return () => {
      if (timer) clearTimeout(timer);
      if (typeof cleanup === 'function') cleanup();
    };
  }, [session]);

  if (loading) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: '#020f3a',
          justifyContent: 'center',
          alignItems: 'center',
        }}
      >
        <ActivityIndicator size="large" color="#1C5E52" />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <AuthGuard session={session} loading={loading} />
      <Stack screenOptions={{ headerShown: false }} />
    </SafeAreaProvider>
  );
}
