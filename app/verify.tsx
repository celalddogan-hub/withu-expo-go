import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Pressable,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { supabase } from '../src/lib/supabase';

export default function VerifyScreen() {
  const router = useRouter();
  const { email } = useLocalSearchParams<{ email: string }>();

  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);

  const handleVerify = async () => {
    if (code.length !== 6) {
      Alert.alert('Felaktig kod', 'Koden måste vara 6 siffror.');
      return;
    }

    try {
      setLoading(true);

      const { error } = await supabase.auth.verifyOtp({
        email: email as string,
        token: code.trim(),
        type: 'email',
      });

      if (error) {
        Alert.alert(
          'Fel kod',
          'Koden är fel eller har gått ut. Tryck på "Skicka ny kod" och försök igen.'
        );
        setCode('');
        return;
      }

      router.replace('/(tabs)');
    } catch {
      Alert.alert('Fel', 'Något gick fel. Försök igen.');
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    try {
      setResendLoading(true);

      const { error } = await supabase.auth.signInWithOtp({
        email: email as string,
        options: { shouldCreateUser: true },
      });

      if (error) {
        Alert.alert('Fel', 'Kunde inte skicka ny kod. Försök igen.');
        return;
      }

      setCode('');
      Alert.alert('Klart! ✓', 'En ny kod har skickats till din e-post.');
    } catch {
      Alert.alert('Fel', 'Något gick fel. Försök igen.');
    } finally {
      setResendLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.inner}>
        <Image
          source={require('../assets/images/withu-brand-logo.png')}
          style={styles.brandLogo}
          resizeMode="contain"
        />

        <View style={styles.card}>
          <Text style={styles.title}>Ange din kod</Text>
          <Text style={styles.subtitle}>Vi skickade en 6-siffrig kod till</Text>
          <Text style={styles.emailText}>{email}</Text>

          <TextInput
            style={styles.codeInput}
            value={code}
            onChangeText={(text) =>
              setCode(text.replace(/[^0-9]/g, '').slice(0, 6))
            }
            placeholder="000000"
            placeholderTextColor="#1e3a5f"
            keyboardType="number-pad"
            maxLength={6}
            textAlign="center"
            autoFocus
            returnKeyType="done"
            onSubmitEditing={handleVerify}
          />

          <View style={styles.dotsRow}>
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <View
                key={i}
                style={[
                  styles.dot,
                  code.length > i ? styles.dotFilled : styles.dotEmpty,
                ]}
              />
            ))}
          </View>

          <Pressable
            style={({ pressed }) => [
              styles.button,
              (loading || code.length !== 6) && styles.buttonDisabled,
              pressed && code.length === 6 && !loading && styles.buttonPressed,
            ]}
            onPress={handleVerify}
            disabled={loading || code.length !== 6}
          >
            <Text style={styles.buttonText}>
              {loading ? 'Verifierar...' : 'Logga in'}
            </Text>
          </Pressable>

          <Pressable
            style={styles.resendButton}
            onPress={handleResend}
            disabled={resendLoading}
          >
            <Text style={styles.resendText}>
              {resendLoading ? 'Skickar...' : 'Skicka ny kod'}
            </Text>
          </Pressable>

          <Pressable onPress={() => router.back()}>
            <Text style={styles.backText}>← Ändra e-postadress</Text>
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#020f3a',
  },
  inner: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
  },
  brandLogo: {
    width: 118,
    height: 118,
    borderRadius: 30,
    marginBottom: 34,
    alignSelf: 'center',
  },
  logoRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'baseline',
    marginBottom: 36,
  },
  logoWith: {
    fontSize: 52,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: -1,
  },
  logoU: {
    fontSize: 52,
    fontWeight: '900',
    color: '#E84E38',
    letterSpacing: -1,
  },
  card: {
    backgroundColor: '#0f172a',
    borderRadius: 20,
    padding: 24,
    borderWidth: 1,
    borderColor: '#1e293b',
  },
  title: {
    color: '#ffffff',
    fontSize: 26,
    fontWeight: '800',
    marginBottom: 8,
  },
  subtitle: {
    color: '#64748b',
    fontSize: 15,
    lineHeight: 22,
  },
  emailText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
    marginTop: 6,
    marginBottom: 24,
  },
  codeInput: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    paddingVertical: 18,
    fontSize: 28,
    fontWeight: '800',
    color: '#0f172a',
    letterSpacing: 8,
    marginBottom: 18,
  },
  dotsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 10,
    marginBottom: 24,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 999,
  },
  dotFilled: {
    backgroundColor: '#1C5E52',
  },
  dotEmpty: {
    backgroundColor: '#334155',
  },
  button: {
    backgroundColor: '#1C5E52',
    paddingVertical: 18,
    borderRadius: 16,
    alignItems: 'center',
    marginBottom: 16,
  },
  buttonDisabled: {
    opacity: 0.45,
  },
  buttonPressed: {
    opacity: 0.85,
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 17,
    fontWeight: '800',
  },
  resendButton: {
    alignItems: 'center',
    marginBottom: 16,
  },
  resendText: {
    color: '#E84E38',
    fontSize: 15,
    fontWeight: '700',
  },
  backText: {
    color: '#94a3b8',
    textAlign: 'center',
    fontSize: 14,
    fontWeight: '600',
  },
});
