import React, { useMemo, useState } from 'react';
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
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { signInWithEmail } from '../src/lib/auth';

export default function LoginScreen() {
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const canSubmit = useMemo(() => {
    return email.trim().length > 0 && password.length > 0 && !loading;
  }, [email, password, loading]);

  const handleLogin = async () => {
    if (!canSubmit) return;

    try {
      setLoading(true);

      await signInWithEmail(email, password);

      router.replace('/(tabs)');
    } catch (error: any) {
      Alert.alert(
        'Kunde inte logga in',
        error?.message || 'Kontrollera din e-post och ditt lösenord.'
      );
    } finally {
      setLoading(false);
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

            <Text style={styles.tagline}>Du är aldrig ensam.</Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.title}>Välkommen tillbaka</Text>
            <Text style={styles.subtitle}>
              Logga in med din e-postadress och ditt lösenord.
            </Text>

            <Text style={styles.label}>E-post</Text>
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              placeholder="din@email.se"
              placeholderTextColor="#7B8794"
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="email"
              textContentType="username"
              returnKeyType="next"
              editable={!loading}
              maxLength={120}
            />

            <Text style={styles.label}>Lösenord</Text>
            <View style={styles.passwordWrap}>
              <TextInput
                style={styles.passwordInput}
                value={password}
                onChangeText={setPassword}
                placeholder="Ditt lösenord"
                placeholderTextColor="#7B8794"
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="password"
                textContentType="password"
                returnKeyType="done"
                editable={!loading}
                onSubmitEditing={handleLogin}
                maxLength={128}
              />

              <Pressable
                style={styles.eyeButton}
                onPress={() => setShowPassword((prev) => !prev)}
                disabled={loading}
              >
                <Ionicons
                  name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                  size={20}
                  color="#5B6785"
                />
              </Pressable>
            </View>

            <Pressable
              style={({ pressed }) => [
                styles.button,
                (!canSubmit || loading) && styles.buttonDisabled,
                pressed && canSubmit && !loading && styles.buttonPressed,
              ]}
              onPress={handleLogin}
              disabled={!canSubmit}
            >
              {loading ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.buttonText}>Logga in</Text>
              )}
            </Pressable>

            <Pressable style={styles.linkButton} onPress={() => router.replace('/register')} disabled={loading}>
              <Text style={styles.link}>Har du inget konto? Skapa konto</Text>
            </Pressable>

            <Pressable style={styles.linkButton} onPress={() => router.push('/forgot-password')} disabled={loading}>
              <Text style={styles.linkSecondary}>Glömt lösenord?</Text>
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

  logoRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'center',
    marginBottom: 6,
  },

  logoWith: {
    fontSize: 52,
    fontWeight: '900',
    color: '#1B2B4B',
    letterSpacing: -1,
  },

  logoU: {
    fontSize: 52,
    fontWeight: '900',
    color: '#E84E38',
    letterSpacing: -1,
  },

  tagline: {
    color: '#6B7280',
    fontSize: 16,
    fontStyle: 'italic',
    textAlign: 'center',
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
    color: '#1B2B4B',
    fontSize: 28,
    fontWeight: '800',
    marginBottom: 8,
  },

  subtitle: {
    color: '#64748B',
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 24,
  },

  label: {
    color: '#20325E',
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 8,
  },

  input: {
    backgroundColor: '#F8FAFC',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 16,
    fontSize: 16,
    color: '#0F172A',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },

  passwordWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 18,
  },

  passwordInput: {
    flex: 1,
    paddingHorizontal: 16,
    paddingVertical: 16,
    fontSize: 16,
    color: '#0F172A',
  },

  eyeButton: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },

  button: {
    backgroundColor: '#1C5E52',
    paddingVertical: 18,
    borderRadius: 16,
    alignItems: 'center',
    marginTop: 4,
    marginBottom: 16,
  },

  buttonDisabled: {
    opacity: 0.5,
  },

  buttonPressed: {
    opacity: 0.85,
  },

  buttonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '800',
  },

  link: {
    color: '#E84E38',
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 14,
  },

  linkButton: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },

  linkSecondary: {
    color: '#64748B',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
});
