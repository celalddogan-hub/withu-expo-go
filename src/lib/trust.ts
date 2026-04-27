import { Alert } from 'react-native';
import { supabase } from './supabase';

export type TrustFeature = 'discover' | 'match' | 'feed_post' | 'feed_interact';

export type TrustProfile = {
  id: string;
  email_verified: boolean | null;
  phone_verified: boolean | null;
  bankid_verified: boolean | null;
  is_bankid_verified: boolean | null;
  verification_level: string | null;
  trust_score: number | null;
  is_limited: boolean | null;
  limited_until: string | null;
  accepted_rules_at: string | null;
  is_profile_complete: boolean | null;
};

export type TrustState = {
  profile: TrustProfile | null;
  emailVerified: boolean;
  profileComplete: boolean;
  rulesAccepted: boolean;
  limited: boolean;
  level: string;
};

export function isLimitActive(profile?: TrustProfile | null) {
  if (!profile?.is_limited) return false;
  if (!profile.limited_until) return true;

  const limitedUntil = new Date(profile.limited_until).getTime();
  if (!Number.isFinite(limitedUntil)) return true;
  return limitedUntil > Date.now();
}

export async function loadCurrentTrustState(): Promise<TrustState> {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) throw userError;
  if (!user) {
    return {
      profile: null,
      emailVerified: false,
      profileComplete: false,
      rulesAccepted: false,
      limited: true,
      level: 'new',
    };
  }

  const emailVerified = !!user.email_confirmed_at;

  const { data, error } = await supabase
    .from('profiles')
    .select(
      'id, email_verified, phone_verified, bankid_verified, is_bankid_verified, verification_level, trust_score, is_limited, limited_until, accepted_rules_at, is_profile_complete'
    )
    .eq('id', user.id)
    .maybeSingle();

  if (error) throw error;

  const profile = data as TrustProfile | null;

  if (profile && emailVerified && !profile.email_verified) {
    await supabase
      .from('profiles')
      .update({
        email_verified: true,
        verification_level: profile.verification_level === 'new' ? 'email' : profile.verification_level,
        updated_at: new Date().toISOString(),
      })
      .eq('id', user.id);
  }

  return {
    profile,
    emailVerified: emailVerified || !!profile?.email_verified,
    profileComplete: !!profile?.is_profile_complete,
    rulesAccepted: !!profile?.accepted_rules_at,
    limited: isLimitActive(profile),
    level: profile?.verification_level || 'new',
  };
}

export function getTrustBlockMessage(feature: TrustFeature, state: TrustState) {
  if (!state.emailVerified) {
    return {
      title: 'Verifiera din e-post',
      body: 'Bekräfta din e-post innan du använder WithU fullt. Det stoppar falska konton och gör appen tryggare.',
    };
  }

  if (!state.profileComplete) {
    return {
      title: 'Gör klart profilen',
      body: 'Fyll i namn, stad, ålder och aktiviteter i Profil innan du syns, matchar eller postar.',
    };
  }

  if (!state.rulesAccepted) {
    return {
      title: 'Godkänn trygghetsregler',
      body: 'Gå till Profil och godkänn WithU-reglerna innan du börjar kontakta andra.',
    };
  }

  return null;
}

export async function ensureTrustAllowed(feature: TrustFeature) {
  const state = await loadCurrentTrustState();
  const block = getTrustBlockMessage(feature, state);

  if (block) {
    Alert.alert(block.title, block.body);
    return false;
  }

  if (state.limited && (feature === 'match' || feature === 'feed_post')) {
    const fn = feature === 'match' ? 'can_user_start_match' : 'can_user_create_feed_post';
    const { data, error } = await supabase.rpc(fn);

    if (!error && data === false) {
      Alert.alert(
        'Dagens gräns är nådd',
        feature === 'match'
          ? 'Nya konton kan bara skicka några få kontaktförfrågningar per dag tills kontot byggt förtroende.'
          : 'Nya konton kan bara publicera några få inlägg per dag tills kontot byggt förtroende.'
      );
      return false;
    }
  }

  return true;
}
