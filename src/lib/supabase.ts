import { AppState, Platform } from 'react-native'
import 'react-native-url-polyfill/auto'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { createClient, processLock } from '@supabase/supabase-js'

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim()
const supabaseKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim()

if (!supabaseUrl) {
  throw new Error('EXPO_PUBLIC_SUPABASE_URL saknas')
}

if (!supabaseKey) {
  throw new Error('EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY saknas')
}

if (!supabaseUrl.startsWith('https://')) {
  throw new Error(`Ogiltig Supabase URL: ${supabaseUrl}`)
}

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    ...(Platform.OS !== 'web' ? { storage: AsyncStorage } : {}),
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
    lock: processLock,
  },
  global: {
    headers: {
      'X-Client-Info': 'withu-expo',
    },
  },
})

if (Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') {
      supabase.auth.startAutoRefresh()
    } else {
      supabase.auth.stopAutoRefresh()
    }
  })
}