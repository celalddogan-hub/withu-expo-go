import React, { ReactNode } from 'react';
import {
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  withuColors,
  withuRadius,
  withuShadows,
  withuSpacing,
  withuText,
} from '../../theme/withuTheme';

type ButtonProps = {
  title: string;
  onPress?: () => void;
  disabled?: boolean;
  style?: ViewStyle | ViewStyle[];
};

type PillProps = {
  title: string;
  selected?: boolean;
  onPress?: () => void;
  style?: ViewStyle | ViewStyle[];
};

type BadgeProps = {
  title: string;
  variant?: 'default' | 'verified' | 'coral';
  style?: ViewStyle | ViewStyle[];
};

type AvatarProps = {
  emoji?: string;
  imageUrl?: string | null;
  size?: number;
  online?: boolean;
  style?: ViewStyle | ViewStyle[];
};

type TextBlockProps = {
  children: ReactNode;
  style?: TextStyle | TextStyle[];
};

type ContainerProps = {
  children: ReactNode;
  style?: ViewStyle | ViewStyle[];
};

type TopBarProps = {
  title: string;
  subtitle?: string;
  right?: ReactNode;
};

export function WithUScreen({ children, style }: ContainerProps) {
  return (
    <SafeAreaView style={[styles.screen, style]} edges={['top']}>
      {children}
    </SafeAreaView>
  );
}

export function WithUPage({ children, style }: ContainerProps) {
  return <View style={[styles.page, style]}>{children}</View>;
}

export function WithULogo() {
  return (
    <Image
      source={require('../../../assets/images/withu-brand-logo.png')}
      style={styles.logoImage}
      resizeMode="contain"
    />
  );
}

export function WithUTopBar({ title, subtitle, right }: TopBarProps) {
  return (
    <View style={styles.topBar}>
      <View style={styles.topBarCenter}>
        <Text style={styles.topBarTitle}>{title}</Text>
        {!!subtitle && <Text style={styles.topBarSubtitle}>{subtitle}</Text>}
      </View>

      <View style={styles.topBarRight}>{right}</View>
    </View>
  );
}

export function WithUCard({ children, style }: ContainerProps) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function WithUTitle({ children, style }: TextBlockProps) {
  return <Text style={[styles.title, style]}>{children}</Text>;
}

export function WithUSubtitle({ children, style }: TextBlockProps) {
  return <Text style={[styles.subtitle, style]}>{children}</Text>;
}

export function WithUBody({ children, style }: TextBlockProps) {
  return <Text style={[styles.body, style]}>{children}</Text>;
}

export function WithUSectionLabel({ children, style }: TextBlockProps) {
  return <Text style={[styles.sectionLabel, style]}>{children}</Text>;
}

export function WithUPrimaryButton({
  title,
  onPress,
  disabled = false,
  style,
}: ButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.primaryButton,
        disabled && styles.buttonDisabled,
        pressed && !disabled && styles.buttonPressed,
        style,
      ]}
    >
      <Text style={styles.primaryButtonText}>{title}</Text>
    </Pressable>
  );
}

export function WithUSecondaryButton({
  title,
  onPress,
  disabled = false,
  style,
}: ButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.secondaryButton,
        disabled && styles.buttonDisabled,
        pressed && !disabled && styles.buttonPressed,
        style,
      ]}
    >
      <Text style={styles.secondaryButtonText}>{title}</Text>
    </Pressable>
  );
}

export function WithUPill({
  title,
  selected = false,
  onPress,
  style,
}: PillProps) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.pill,
        selected && styles.pillSelected,
        pressed && styles.pillPressed,
        style,
      ]}
    >
      <Text style={[styles.pillText, selected && styles.pillTextSelected]}>
        {title}
      </Text>
    </Pressable>
  );
}

export function WithUBadge({
  title,
  variant = 'default',
  style,
}: BadgeProps) {
  const badgeStyle =
    variant === 'verified'
      ? styles.badgeVerified
      : variant === 'coral'
      ? styles.badgeCoral
      : styles.badgeDefault;

  const textStyle =
    variant === 'verified'
      ? styles.badgeVerifiedText
      : variant === 'coral'
      ? styles.badgeCoralText
      : styles.badgeDefaultText;

  return (
    <View style={[styles.badgeBase, badgeStyle, style]}>
      <Text style={[styles.badgeTextBase, textStyle]}>{title}</Text>
    </View>
  );
}

export function WithUAvatar({
  emoji = '🙂',
  imageUrl,
  size = 56,
  online = false,
  style,
}: AvatarProps) {
  return (
    <View
      style={[
        styles.avatar,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
        },
        style,
      ]}
    >
      {imageUrl ? (
        <Image source={{ uri: imageUrl }} style={{ width: size, height: size, borderRadius: size / 2 }} />
      ) : (
        <Text style={{ fontSize: size * 0.46 }}>{emoji}</Text>
      )}

      {online ? (
        <View
          style={[
            styles.avatarOnlineDot,
            {
              right: size * 0.02,
              bottom: size * 0.02,
            },
          ]}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: withuColors.cream,
  },

  page: {
    paddingHorizontal: withuSpacing.xl,
  },

  logoText: {
    fontSize: 56,
    fontWeight: '900',
    color: withuColors.white,
    letterSpacing: -2,
  },
  logoAccent: {
    color: withuColors.coral,
  },
  logoImage: {
    width: 72,
    height: 72,
    borderRadius: 18,
  },

  topBar: {
    backgroundColor: withuColors.white,
    borderBottomWidth: 1,
    borderBottomColor: withuColors.line,
    paddingHorizontal: withuSpacing.xl,
    paddingTop: 18,
    paddingBottom: 16,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  topBarCenter: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  topBarTitle: {
    ...withuText.h1,
    textAlign: 'center',
  },
  topBarSubtitle: {
    fontSize: 16,
    lineHeight: 22,
    color: withuColors.muted,
    textAlign: 'center',
    marginTop: 4,
  },
  topBarRight: {
    position: 'absolute',
    right: withuSpacing.xl,
    top: 18,
    bottom: 16,
    justifyContent: 'center',
  },

  card: {
    backgroundColor: withuColors.white,
    borderRadius: withuRadius.xl,
    borderWidth: 1,
    borderColor: withuColors.line,
    padding: withuSpacing.xl,
    ...withuShadows.card,
  },

  title: {
    ...withuText.h2,
    color: withuColors.navy,
  },
  subtitle: {
    fontSize: 15,
    lineHeight: 24,
    color: withuColors.muted,
  },
  body: {
    fontSize: 15,
    lineHeight: 24,
    color: '#444444',
  },
  sectionLabel: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '800',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: withuColors.muted,
    marginBottom: 8,
  },

  primaryButton: {
    minHeight: 56,
    borderRadius: 999,
    backgroundColor: withuColors.coral,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 22,
  },
  primaryButtonText: {
    color: withuColors.white,
    fontSize: 16,
    fontWeight: '800',
  },

  secondaryButton: {
    minHeight: 52,
    borderRadius: 999,
    backgroundColor: withuColors.white,
    borderWidth: 1.5,
    borderColor: withuColors.line,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  secondaryButtonText: {
    color: withuColors.navy,
    fontSize: 15,
    fontWeight: '700',
  },

  buttonDisabled: {
    opacity: 0.55,
  },
  buttonPressed: {
    opacity: 0.85,
  },

  pill: {
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 999,
    borderWidth: 2,
    borderColor: withuColors.line,
    backgroundColor: withuColors.white,
  },
  pillSelected: {
    borderColor: withuColors.coral,
    backgroundColor: withuColors.coralBg,
  },
  pillPressed: {
    opacity: 0.85,
  },
  pillText: {
    color: withuColors.navy,
    fontSize: 15,
    fontWeight: '800',
  },
  pillTextSelected: {
    color: withuColors.coral,
  },

  badgeBase: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
  },
  badgeDefault: {
    backgroundColor: withuColors.soft,
  },
  badgeVerified: {
    backgroundColor: withuColors.successBg,
  },
  badgeCoral: {
    backgroundColor: withuColors.coralBg,
  },
  badgeTextBase: {
    fontSize: 12,
    fontWeight: '800',
  },
  badgeDefaultText: {
    color: withuColors.navy,
  },
  badgeVerifiedText: {
    color: withuColors.success,
  },
  badgeCoralText: {
    color: withuColors.coral,
  },

  avatar: {
    backgroundColor: withuColors.coralBg,
    borderWidth: 1,
    borderColor: '#F0D9D4',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  avatarOnlineDot: {
    position: 'absolute',
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: withuColors.success,
    borderWidth: 2,
    borderColor: withuColors.white,
  },
});
