import { supabase } from './supabase';

export const PASSWORD_RESET_REDIRECT_URL = 'withu://reset-password';

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export async function signInWithEmail(email: string, password: string) {
  const normalizedEmail = normalizeEmail(email);
  const trimmedPassword = password.trim();

  if (!normalizedEmail) {
    throw new Error('Fyll i din e-postadress.');
  }

  if (!isValidEmail(normalizedEmail)) {
    throw new Error('Fyll i en giltig e-postadress.');
  }

  if (!trimmedPassword) {
    throw new Error('Fyll i ditt lösenord.');
  }

  const { data, error } = await supabase.auth.signInWithPassword({
    email: normalizedEmail,
    password: trimmedPassword,
  });

  if (error) {
    throw new Error('Fel e-post eller lösenord.');
  }

  if (!data.session || !data.user) {
    throw new Error('Kunde inte skapa en säker session. Försök igen.');
  }

  return data;
}

export async function signUpWithEmail(
  email: string,
  password: string,
  confirmPassword: string,
  phone?: string
) {
  const normalizedEmail = normalizeEmail(email);
  const trimmedPassword = password.trim();
  const trimmedConfirmPassword = confirmPassword.trim();
  const normalizedPhone = phone?.replace(/[^\d+]/g, '').trim() ?? '';

  if (!normalizedEmail) {
    throw new Error('Fyll i din e-postadress.');
  }

  if (!isValidEmail(normalizedEmail)) {
    throw new Error('Fyll i en giltig e-postadress.');
  }

  if (!trimmedPassword) {
    throw new Error('Fyll i ett lösenord.');
  }

  if (trimmedPassword.length < 8) {
    throw new Error('Lösenordet måste vara minst 8 tecken.');
  }

  if (!trimmedConfirmPassword) {
    throw new Error('Bekräfta ditt lösenord.');
  }

  if (trimmedPassword !== trimmedConfirmPassword) {
    throw new Error('Lösenorden matchar inte.');
  }

  const { data, error } = await supabase.auth.signUp({
    email: normalizedEmail,
    password: trimmedPassword,
    options: {
      data: normalizedPhone.length >= 7 ? { phone_number: normalizedPhone } : {},
    },
  });

  if (error) {
    if (
      error.message?.toLowerCase().includes('already') ||
      error.message?.toLowerCase().includes('registered')
    ) {
      throw new Error('Det finns redan ett konto med den e-postadressen.');
    }

    throw new Error(error.message || 'Kunde inte skapa konto.');
  }

  return {
    user: data.user,
    session: data.session,
    needsEmailConfirmation: !data.session,
  };
}

export async function sendPasswordResetEmail(email: string) {
  const normalizedEmail = normalizeEmail(email);

  if (!normalizedEmail) {
    throw new Error('Fyll i din e-postadress.');
  }

  if (!isValidEmail(normalizedEmail)) {
    throw new Error('Fyll i en giltig e-postadress.');
  }

  const { error } = await supabase.auth.resetPasswordForEmail(normalizedEmail, {
    redirectTo: PASSWORD_RESET_REDIRECT_URL,
  });

  if (error) {
    throw new Error(error.message || 'Kunde inte skicka återställningsmejl.');
  }

  return { redirectTo: PASSWORD_RESET_REDIRECT_URL };
}

export async function signOutCurrentSession() {
  const { error } = await supabase.auth.signOut({ scope: 'local' });

  if (error) {
    throw new Error('Kunde inte logga ut.');
  }
}
