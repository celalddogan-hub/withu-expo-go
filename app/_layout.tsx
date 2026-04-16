import React, { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { startPushRegistration } from '../src/lib/push';

export default function RootLayout() {
  useEffect(() => {
    const cleanup = startPushRegistration();
    return cleanup;
  }, []);

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerShown: false,
          animation: 'fade',
        }}
      >
        <Stack.Screen name="index" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen
          name="chat/[matchId]"
          options={{
            presentation: 'card',
          }}
        />
      </Stack>
    </SafeAreaProvider>
  );
}