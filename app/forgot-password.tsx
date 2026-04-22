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
import { useRouter } from 'expo-router';
import { sendPasswordResetEmail } from '../src/lib/auth';

export default function ForgotPasswordScreen() {
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);

  const canSubmit = useMemo(() => {
    return email.trim().length > 0 && !loading;
  }, [email, loading]);

  const handleSend = async () => {
    if (!canSubmit) return;

    try {
      setLoading(true);

      await sendPasswordResetEmail(email);

      Alert.alert(
        'Kolla din e-post',
        'Vi har skickat en återställningslänk. Öppna länken på samma mobil för att välja nytt lösenord.',
        [
          {
            text: 'OK',
            onPress: () => router.replace('/login'),
          },
        ]
      );
    } catch (error: any) {
      Alert.alert(
        'Kunde inte skicka återställning',
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
            <Text style={styles.logo}>WithU</Text>
            <Text style={styles.heroSubtitle}>Glömt lösenord</Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.title}>Återställ ditt lösenord</Text>
            <Text style={styles.description}>
              Skriv din e-postadress så skickar vi en länk där du kan välja ett nytt lösenord.
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
              returnKeyType="done"
              onSubmitEditing={handleSend}
            />

            <Pressable
              style={[
                styles.primaryButton,
                (!canSubmit || loading) && styles.buttonDisabled,
              ]}
              onPress={handleSend}
              disabled={!canSubmit || loading}
            >
              {loading ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.primaryButtonText}>Skicka återställningslänk</Text>
              )}
            </Pressable>

            <Pressable
              style={styles.secondaryButton}
              onPress={() => router.replace('/login')}
              disabled={loading}
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

  label: {
    fontSize: 14,
    fontWeight: '700',
    color: '#20325E',
    marginBottom: 8,
  },

  input: {
    minHeight: 58,
    borderRadius: 16,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 16,
    fontSize: 16,
    color: '#0F172A',
    marginBottom: 14,
  },

  primaryButton: {
    minHeight: 56,
    borderRadius: 16,
    backgroundColor: '#1C5E52',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
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