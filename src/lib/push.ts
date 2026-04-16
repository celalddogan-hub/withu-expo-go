import { Platform } from 'react-native';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { supabase } from './supabase';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

async function savePushToken(expoPushToken: string) {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return;

  const now = new Date().toISOString();

  const { error } = await supabase.from('push_tokens').upsert(
    {
      user_id: user.id,
      expo_push_token: expoPushToken,
      platform: Platform.OS,
      device_name: Device.modelName ?? null,
      is_active: true,
      last_seen_at: now,
      updated_at: now,
    },
    {
      onConflict: 'expo_push_token',
    }
  );

  if (error) {
    throw error;
  }
}

export async function registerPushTokenForCurrentUser() {
  if (!Device.isDevice) {
    console.log('Push kräver fysisk enhet.');
    return null;
  }

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#FF6B57',
    });
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    console.log('Push permission nekad.');
    return null;
  }

  const projectId =
    Constants?.expoConfig?.extra?.eas?.projectId ??
    Constants?.easConfig?.projectId;

  if (!projectId) {
    throw new Error('EAS projectId saknas. Koppla projektet till EAS först.');
  }

  const token = (
    await Notifications.getExpoPushTokenAsync({
      projectId,
    })
  ).data;

  await savePushToken(token);
  return token;
}

export function startPushRegistration() {
  const tokenSubscription = Notifications.addPushTokenListener(async (token) => {
    try {
      await savePushToken(token.data);
    } catch (error) {
      console.log('Kunde inte uppdatera push-token', error);
    }
  });

  const { data: authSubscription } = supabase.auth.onAuthStateChange(
    async (_event, session) => {
      if (!session?.user) return;

      try {
        await registerPushTokenForCurrentUser();
      } catch (error) {
        console.log('Kunde inte registrera push-token efter auth-change', error);
      }
    }
  );

  registerPushTokenForCurrentUser().catch((error) => {
    console.log('Kunde inte registrera push-token', error);
  });

  return () => {
    tokenSubscription.remove();
    authSubscription.subscription.unsubscribe();
  };
}