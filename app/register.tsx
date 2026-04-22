import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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
import { signUpWithEmail } from '../src/lib/auth';

export default function RegisterScreen() {
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const canSubmit = useMemo(() => {
    return (
      email.trim().length > 0 &&
      password.length > 0 &&
      confirmPassword.length > 0 &&
      !loading
    );
  }, [email, password, confirmPassword, loading]);

  const handleRegister = async () => {
    if (!canSubmit) return;

    try {
      setLoading(true);

      const result = await signUpWithEmail(email, password, confirmPassword);

      if (result.needsEmailConfirmation) {
        Alert.alert(
          'Kolla din e-post',
          'Vi har skickat en bekräftelselänk till din e-postadress. Bekräfta kontot och logga sedan in.'
        );
        router.replace('/login');
        return;
      }

      Alert.alert('Klart', 'Ditt konto är skapat.');
      router.replace('/(tabs)');
    } catch (error: any) {
      Alert.alert(
        'Kunde inte skapa konto',
        error?.message || 'Något gick fel.'
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
            <View style={styles.logoRow}>
              <Text style={styles.logoWith}>With</Text>
              <Text style={styles.logoU}>U</Text>
            </View>

            <Text style={styles.tagline}>Du är aldrig ensam.</Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.title}>Skapa konto</Text>
            <Text style={styles.subtitle}>
              Registrera dig med din e-postadress och ett starkt lösenord.
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
              textContentType="emailAddress"
              editable={!loading}
              maxLength={120}
            />

            <Text style={styles.label}>Lösenord</Text>
            <View style={styles.passwordWrap}>
              <TextInput
                style={styles.passwordInput}
                value={password}
                onChangeText={setPassword}
                placeholder="Minst 8 tecken"
                placeholderTextColor="#7B8794"
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="password-new"
                textContentType="newPassword"
                editable={!loading}
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

            <Text style={styles.label}>Bekräfta lösenord</Text>
            <View style={styles.passwordWrap}>
              <TextInput
                style={styles.passwordInput}
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                placeholder="Skriv lösenordet igen"
                placeholderTextColor="#7B8794"
                secureTextEntry={!showConfirmPassword}
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="password-new"
                textContentType="newPassword"
                editable={!loading}
                maxLength={128}
                onSubmitEditing={handleRegister}
              />

              <Pressable
                style={styles.eyeButton}
                onPress={() => setShowConfirmPassword((prev) => !prev)}
                disabled={loading}
              >
                <Ionicons
                  name={showConfirmPassword ? 'eye-off-outline' : 'eye-outline'}
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
              onPress={handleRegister}
              disabled={!canSubmit}
            >
              {loading ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.buttonText}>Skapa konto</Text>
              )}
            </Pressable>

            <Pressable onPress={() => router.replace('/login')} disabled={loading}>
              <Text style={styles.link}>Har du redan konto? Logga in</Text>
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
    marginBottom: 16,
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
  },
});