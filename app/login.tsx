import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Pressable,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '../src/lib/supabase';

export default function LoginScreen() {
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSignUp = async () => {
    if (!email || !password) {
      Alert.alert('Fel', 'Fyll i e-post och lösenord.');
      return;
    }

    try {
      setLoading(true);

      const { error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
      });

      if (error) {
        Alert.alert('Kunde inte skapa konto', error.message);
        return;
      }

      Alert.alert(
        'Klart',
        'Kontot skapades. Om e-postbekräftelse krävs, kolla din mejl först.'
      );
    } finally {
      setLoading(false);
    }
  };

  const handleSignIn = async () => {
    if (!email || !password) {
      Alert.alert('Fel', 'Fyll i e-post och lösenord.');
      return;
    }

    try {
      setLoading(true);

      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error) {
        Alert.alert('Login misslyckades', error.message);
        return;
      }

      Alert.alert('Klart', 'Du är nu inloggad.');
      router.back();
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.card}>
        <Text style={styles.title}>Logga in</Text>
        <Text style={styles.subtitle}>WithU riktig login</Text>

        <Text style={styles.label}>E-post</Text>
        <TextInput
          style={styles.input}
          value={email}
          onChangeText={setEmail}
          placeholder="dinmail@example.com"
          placeholderTextColor="#94a3b8"
          keyboardType="email-address"
          autoCapitalize="none"
        />

        <Text style={styles.label}>Lösenord</Text>
        <TextInput
          style={styles.input}
          value={password}
          onChangeText={setPassword}
          placeholder="Lösenord"
          placeholderTextColor="#94a3b8"
          secureTextEntry
        />

        <Pressable
          style={[styles.button, styles.loginButton, loading && styles.disabledButton]}
          onPress={handleSignIn}
          disabled={loading}
        >
          <Text style={styles.buttonText}>
            {loading ? 'Vänta...' : 'Logga in'}
          </Text>
        </Pressable>

        <Pressable
          style={[styles.button, styles.signupButton, loading && styles.disabledButton]}
          onPress={handleSignUp}
          disabled={loading}
        >
          <Text style={styles.buttonText}>
            {loading ? 'Vänta...' : 'Skapa konto'}
          </Text>
        </Pressable>

        <Pressable onPress={() => router.back()}>
          <Text style={styles.backText}>Tillbaka</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#020f3a',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    backgroundColor: '#1e293b',
    borderRadius: 18,
    padding: 20,
  },
  title: {
    color: '#ffffff',
    fontSize: 34,
    fontWeight: '800',
    marginBottom: 8,
  },
  subtitle: {
    color: '#cbd5e1',
    fontSize: 18,
    marginBottom: 24,
  },
  label: {
    color: '#ffffff',
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 8,
    marginTop: 10,
  },
  input: {
    backgroundColor: '#0f172a',
    color: '#ffffff',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: 16,
  },
  button: {
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 16,
  },
  loginButton: {
    backgroundColor: '#22c55e',
  },
  signupButton: {
    backgroundColor: '#2563eb',
  },
  disabledButton: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 17,
    fontWeight: '700',
  },
  backText: {
    color: '#cbd5e1',
    textAlign: 'center',
    marginTop: 18,
    fontSize: 16,
  },
});