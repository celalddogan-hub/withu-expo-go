import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as Linking from 'expo-linking';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { supabase } from '../src/lib/supabase';

type RecoveryState = 'loading' | 'ready' | 'error';

function parseParamsFromUrl(url: string) {
  const result: Record<string, string> = {};

  const queryIndex = url.indexOf('?');
  const hashIndex = url.indexOf('#');

  const queryPart =
    queryIndex >= 0
      ? url.slice(queryIndex + 1, hashIndex >= 0 ? hashIndex : undefined)
      : '';

  const hashPart = hashIndex >= 0 ? url.slice(hashIndex + 1) : '';

  const addParams = (input: string) => {
    if (!input) return;

    input.split('&').forEach((pair) => {
      const [rawKey, rawValue = ''] = pair.split('=');
      if (!rawKey) return;

      const key = decodeURIComponent(rawKey);
      const value = decodeURIComponent(rawValue);
      result[key] = value;
    });
  };

  addParams(queryPart);
  addParams(hashPart);

  return result;
}

export default function ResetPasswordScreen() {
  const router = useRouter();

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [saving, setSaving] = useState(false);

  const [recoveryState, setRecoveryState] = useState<RecoveryState>('loading');
  const [recoveryMessage, setRecoveryMessage] = useState(
    'Kontrollerar återställningslänken...'
  );

  const isValid = useMemo(() => {
    return password.trim().length >= 8 && password === confirmPassword;
  }, [password, confirmPassword]);

  useEffect(() => {
    let isMounted = true;

    const handleRecoveryUrl = async (incomingUrl: string | null) => {
      if (!incomingUrl) {
        if (isMounted) {
          setRecoveryState('error');
          setRecoveryMessage(
            'Ingen återställningslänk hittades. Öppna sidan från mejlet igen.'
          );
        }
        return;
      }

      try {
        const params = parseParamsFromUrl(incomingUrl);

        if (params.error_description || params.error) {
          if (isMounted) {
            setRecoveryState('error');
            setRecoveryMessage(
              params.error_description ||
                params.error ||
                'Återställningslänken gav ett fel.'
            );
          }
          return;
        }

        if (params.code) {
          const { error } = await supabase.auth.exchangeCodeForSession(params.code);

          if (error) throw error;

          if (isMounted) {
            setRecoveryState('ready');
            setRecoveryMessage('Länken är godkänd. Du kan nu välja nytt lösenord.');
          }
          return;
        }

        if (params.access_token && params.refresh_token) {
          const { error } = await supabase.auth.setSession({
            access_token: params.access_token,
            refresh_token: params.refresh_token,
          });

          if (error) throw error;

          if (isMounted) {
            setRecoveryState('ready');
            setRecoveryMessage('Länken är godkänd. Du kan nu välja nytt lösenord.');
          }
          return;
        }

        const { data, error } = await supabase.auth.getSession();
        if (error) throw error;

        if (data.session) {
          if (isMounted) {
            setRecoveryState('ready');
            setRecoveryMessage('Session hittad. Du kan nu välja nytt lösenord.');
          }
          return;
        }

        if (isMounted) {
          setRecoveryState('error');
          setRecoveryMessage(
            'Återställningslänken innehöll ingen giltig session. Öppna länken från mejlet igen på samma mobil där du startade återställningen.'
          );
        }
      } catch (error: any) {
        if (isMounted) {
          setRecoveryState('error');
          setRecoveryMessage(
            error?.message || 'Kunde inte läsa återställningslänken.'
          );
        }
      }
    };

    Linking.getInitialURL().then(handleRecoveryUrl);

    const subscription = Linking.addEventListener('url', ({ url }) => {
      handleRecoveryUrl(url);
    });

    return () => {
      isMounted = false;
      subscription.remove();
    };
  }, []);

  const handleSave = async () => {
    if (saving) return;

    if (recoveryState !== 'ready') {
      Alert.alert(
        'Länken är inte redo',
        'Öppna återställningslänken från mejlet igen innan du sparar nytt lösenord.'
      );
      return;
    }

    if (!password.trim()) {
      Alert.alert('Lösenord saknas', 'Skriv ditt nya lösenord.');
      return;
    }

    if (password.trim().length < 8) {
      Alert.alert('För kort lösenord', 'Lösenordet måste vara minst 8 tecken.');
      return;
    }

    if (password !== confirmPassword) {
      Alert.alert('Lösenorden matchar inte', 'Skriv samma lösenord i båda fälten.');
      return;
    }

    try {
      setSaving(true);

      const { error } = await supabase.auth.updateUser({
        password: password.trim(),
      });

      if (error) throw error;

      Alert.alert('Klart', 'Ditt lösenord är uppdaterat.', [
        {
          text: 'OK',
          onPress: async () => {
            await supabase.auth.signOut({ scope: 'local' });
            router.replace('/login');
          },
        },
      ]);
    } catch (error: any) {
      Alert.alert(
        'Kunde inte byta lösenord',
        error?.message || 'Något gick fel.'
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.inner}>
          <View style={styles.hero}>
            <Image
              source={require('../assets/images/withu-brand-logo.png')}
              style={styles.brandLogo}
              resizeMode="contain"
            />
            <Text style={styles.heroSubtitle}>Återställ lösenord</Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.title}>Välj nytt lösenord</Text>
            <Text style={styles.description}>
              Öppna först länken från mejlet på samma mobil. När länken har godkänts
              kan du spara ett nytt lösenord här.
            </Text>

            <View
              style={[
                styles.statusBox,
                recoveryState === 'ready'
                  ? styles.statusReady
                  : recoveryState === 'error'
                  ? styles.statusError
                  : styles.statusLoading,
              ]}
            >
              <Text
                style={[
                  styles.statusText,
                  recoveryState === 'ready'
                    ? styles.statusTextReady
                    : recoveryState === 'error'
                    ? styles.statusTextError
                    : styles.statusTextLoading,
                ]}
              >
                {recoveryState === 'loading'
                  ? '⏳ '
                  : recoveryState === 'ready'
                  ? '✅ '
                  : '⚠️ '}
                {recoveryMessage}
              </Text>
            </View>

            <Text style={styles.label}>Nytt lösenord</Text>
            <View style={styles.passwordWrap}>
              <TextInput
                value={password}
                onChangeText={setPassword}
                placeholder="Minst 8 tecken"
                placeholderTextColor="#7B8794"
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="password-new"
                textContentType="newPassword"
                style={styles.passwordInput}
                editable={!saving}
                maxLength={128}
              />

              <Pressable
                style={styles.eyeButton}
                onPress={() => setShowPassword((prev) => !prev)}
                disabled={saving}
              >
                <Ionicons
                  name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                  size={20}
                  color="#5B6785"
                />
              </Pressable>
            </View>

            <Text style={styles.label}>Bekräfta lösenord</Text>
            <View style={styles.passwordWrap}>
              <TextInput
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                placeholder="Skriv samma lösenord igen"
                placeholderTextColor="#7B8794"
                secureTextEntry={!showConfirmPassword}
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="password-new"
                textContentType="newPassword"
                style={styles.passwordInput}
                editable={!saving}
                maxLength={128}
                onSubmitEditing={handleSave}
              />

              <Pressable
                style={styles.eyeButton}
                onPress={() => setShowConfirmPassword((prev) => !prev)}
                disabled={saving}
              >
                <Ionicons
                  name={showConfirmPassword ? 'eye-off-outline' : 'eye-outline'}
                  size={20}
                  color="#5B6785"
                />
              </Pressable>
            </View>

            <Pressable
              style={[
                styles.primaryButton,
                (recoveryState !== 'ready' || !isValid || saving) && styles.buttonDisabled,
              ]}
              onPress={handleSave}
              disabled={recoveryState !== 'ready' || !isValid || saving}
            >
              {saving ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.primaryButtonText}>Spara nytt lösenord</Text>
              )}
            </Pressable>

            <Pressable
              style={styles.secondaryButton}
              onPress={() => router.replace('/login')}
              disabled={saving}
            >
              <Text style={styles.secondaryButtonText}>Till inloggning</Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F4F6FB',
  },

  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 24,
  },

  inner: {
    width: '100%',
    maxWidth: 520,
    alignSelf: 'center',
  },

  hero: {
    alignItems: 'center',
    marginBottom: 28,
  },

  brandLogo: {
    width: 112,
    height: 112,
    borderRadius: 28,
    marginBottom: 10,
  },

  logo: {
    fontSize: 48,
    fontWeight: '900',
    color: '#1B2B4B',
    marginBottom: 6,
  },

  heroSubtitle: {
    textAlign: 'center',
    color: '#6B7280',
    fontSize: 16,
    fontStyle: 'italic',
  },

  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 24,
    borderWidth: 1,
    borderColor: '#E6EAF4',
    shadowColor: '#20325E',
    shadowOpacity: 0.06,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 3,
  },

  title: {
    fontSize: 28,
    lineHeight: 34,
    fontWeight: '800',
    color: '#1B2B4B',
    marginBottom: 10,
  },

  description: {
    fontSize: 15,
    lineHeight: 24,
    color: '#64748B',
    marginBottom: 18,
  },

  statusBox: {
    borderRadius: 16,
    padding: 14,
    marginBottom: 18,
    borderWidth: 1,
  },

  statusLoading: {
    backgroundColor: '#FFF7E8',
    borderColor: '#F1DEC2',
  },

  statusReady: {
    backgroundColor: '#EAF5F1',
    borderColor: '#B8DDD5',
  },

  statusError: {
    backgroundColor: '#FCEAEA',
    borderColor: '#F2C8C8',
  },

  statusText: {
    fontSize: 14,
    lineHeight: 22,
    fontWeight: '700',
  },

  statusTextLoading: {
    color: '#A16207',
  },

  statusTextReady: {
    color: '#166534',
  },

  statusTextError: {
    color: '#B42318',
  },

  label: {
    fontSize: 14,
    fontWeight: '700',
    color: '#20325E',
    marginBottom: 8,
    marginTop: 6,
  },

  passwordWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 16,
  },

  passwordInput: {
    flex: 1,
    minHeight: 58,
    paddingHorizontal: 16,
    fontSize: 16,
    color: '#0F172A',
  },

  eyeButton: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },

  primaryButton: {
    minHeight: 56,
    borderRadius: 16,
    backgroundColor: '#1C5E52',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
  },

  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '800',
  },

  secondaryButton: {
    minHeight: 54,
    borderRadius: 16,
    backgroundColor: '#F4F6FB',
    borderWidth: 1,
    borderColor: '#D9E2F2',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
  },

  secondaryButtonText: {
    color: '#20325E',
    fontSize: 16,
    fontWeight: '700',
  },

  buttonDisabled: {
    opacity: 0.55,
  },
});
