import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import {
  withuColors,
  withuRadius,
  withuShadows,
  withuSpacing,
} from '../../src/theme/withuTheme';
import {
  WithUAvatar,
  WithUCard,
  WithUPage,
  WithUPrimaryButton,
  WithUSectionLabel,
  WithUScreen,
  WithUSubtitle,
  WithUTitle,
  WithUTopBar,
} from '../../src/components/withu/WithUPrimitives';

export default function AdminHomeScreen() {
  const router = useRouter();

  return (
    <WithUScreen>
      <WithUTopBar title="Admin" subtitle="Översikt" right={<WithUAvatar emoji="🛡️" size={34} />} />

      <WithUPage style={styles.page}>
        <View style={styles.heroBlock}>
          <Text style={styles.heroTitle}>Admincenter</Text>
          <Text style={styles.heroSubtitle}>
            Härifrån kan du öppna användare, rapporter, statistik och volontäransökningar.
          </Text>
        </View>

        <WithUCard style={styles.mainCard}>
          <WithUSectionLabel>Support</WithUSectionLabel>
          <WithUTitle style={styles.cardTitle}>Användare</WithUTitle>
          <WithUSubtitle>
            Sök profiler, se vilka som är dolda från Upptäck och öppna rätt supportväg.
          </WithUSubtitle>

          <View style={styles.iconRow}>
            <View style={[styles.bigIconWrap, styles.blueIconWrap]}>
              <Text style={styles.bigIcon}>👥</Text>
            </View>
            <View style={styles.textCol}>
              <Text style={styles.blockTitle}>Öppna användaröversikt</Text>
              <Text style={styles.blockText}>
                Adminprofiler syns inte i Upptäck, men admin kan hjälpa användare här.
              </Text>
            </View>
          </View>

          <WithUPrimaryButton
            title="Öppna användare"
            onPress={() => router.push('/admin/users')}
            style={styles.actionButton}
          />
        </WithUCard>

        <WithUCard style={styles.mainCard}>
          <WithUSectionLabel>Kommun & effekt</WithUSectionLabel>
          <WithUTitle style={styles.cardTitle}>Statistikdashboard</WithUTitle>
          <WithUSubtitle>
            Se anonymiserade siffror för användare, aktivitet, rapporter, blockeringar och volontärer.
          </WithUSubtitle>

          <View style={styles.iconRow}>
            <View style={[styles.bigIconWrap, styles.blueIconWrap]}>
              <Text style={styles.bigIcon}>📊</Text>
            </View>
            <View style={styles.textCol}>
              <Text style={styles.blockTitle}>Öppna statistik</Text>
              <Text style={styles.blockText}>
                Underlag för kommunpilot och intern trygghetsuppföljning.
              </Text>
            </View>
          </View>

          <WithUPrimaryButton
            title="Öppna statistik"
            onPress={() => router.push('/admin/stats')}
            style={styles.actionButton}
          />
        </WithUCard>

        <WithUCard style={styles.mainCard}>
          <WithUSectionLabel>Säkerhet</WithUSectionLabel>
          <WithUTitle style={styles.cardTitle}>Supabase-kontroll</WithUTitle>
          <WithUSubtitle>
            Kontrollera att viktiga tabeller har RLS och policies innan fler användare släpps in.
          </WithUSubtitle>

          <View style={styles.iconRow}>
            <View style={[styles.bigIconWrap, styles.greenIconWrap]}>
              <Text style={styles.bigIcon}>🛡️</Text>
            </View>
            <View style={styles.textCol}>
              <Text style={styles.blockTitle}>Öppna säkerhetskontroll</Text>
              <Text style={styles.blockText}>
                Visar grönt, gult eller rött för tabellerna som bär appens trygghet.
              </Text>
            </View>
          </View>

          <WithUPrimaryButton
            title="Öppna säkerhet"
            onPress={() => router.push('/admin/security')}
            style={styles.actionButton}
          />
        </WithUCard>

        <WithUCard style={styles.mainCard}>
          <WithUSectionLabel>Moderering</WithUSectionLabel>
          <WithUTitle style={styles.cardTitle}>Rapporter</WithUTitle>
          <WithUSubtitle>
            Granska inkomna rapporter, uppdatera status och lägg adminnoteringar.
          </WithUSubtitle>

          <View style={styles.iconRow}>
            <View style={[styles.bigIconWrap, styles.alertIconWrap]}>
              <Text style={styles.bigIcon}>🚨</Text>
            </View>
            <View style={styles.textCol}>
              <Text style={styles.blockTitle}>Öppna rapportcenter</Text>
              <Text style={styles.blockText}>
                Se öppna, pågående, lösta och avfärdade rapporter.
              </Text>
            </View>
          </View>

          <WithUPrimaryButton
            title="Öppna rapporter"
            onPress={() => router.push('/admin/reports')}
            style={styles.actionButton}
          />
        </WithUCard>

        <WithUCard style={styles.mainCard}>
          <WithUSectionLabel>Bildgranskning</WithUSectionLabel>
          <WithUTitle style={styles.cardTitle}>Flodesbilder</WithUTitle>
          <WithUSubtitle>
            Godkann eller avvisa bilder innan de visas for andra i flodet.
          </WithUSubtitle>

          <View style={styles.iconRow}>
            <View style={[styles.bigIconWrap, styles.greenIconWrap]}>
              <Text style={styles.bigIcon}>🖼️</Text>
            </View>
            <View style={styles.textCol}>
              <Text style={styles.blockTitle}>Oppna bildgranskning</Text>
              <Text style={styles.blockText}>
                Nya bilder hamnar i vantelista och blir publika forst efter adminbeslut.
              </Text>
            </View>
          </View>

          <WithUPrimaryButton
            title="Oppna bildgranskning"
            onPress={() => router.push('/admin/images')}
            style={styles.actionButton}
          />
        </WithUCard>

        <WithUCard style={styles.mainCard}>
          <WithUSectionLabel>Volontärer</WithUSectionLabel>
          <WithUTitle style={styles.cardTitle}>Volontäransökningar</WithUTitle>
          <WithUSubtitle>
            Se ansökningar, bio, taggar, dokument och sätt status till väntar, godkänd eller nekad.
          </WithUSubtitle>

          <View style={styles.iconRow}>
            <View style={[styles.bigIconWrap, styles.greenIconWrap]}>
              <Text style={styles.bigIcon}>🤝</Text>
            </View>
            <View style={styles.textCol}>
              <Text style={styles.blockTitle}>Öppna volontäransökningar</Text>
              <Text style={styles.blockText}>
                Här ser du alla inkomna ansökningar från databasen.
              </Text>
            </View>
          </View>

          <WithUPrimaryButton
            title="Öppna volontäransökningar"
            onPress={() => router.push('/admin/volunteers')}
            style={styles.actionButton}
          />
        </WithUCard>

        <WithUCard>
          <WithUSectionLabel>Snabböppna</WithUSectionLabel>
          <WithUTitle style={styles.cardTitle}>Direktlänkar</WithUTitle>

          <Pressable style={styles.inlineLink} onPress={() => router.push('/admin/users')}>
            <Text style={styles.inlineLinkText}>Gå till användare</Text>
          </Pressable>

          <Pressable style={styles.inlineLink} onPress={() => router.push('/admin/reports')}>
            <Text style={styles.inlineLinkText}>Gå till rapporter</Text>
          </Pressable>

          <Pressable style={styles.inlineLink} onPress={() => router.push('/admin/images')}>
            <Text style={styles.inlineLinkText}>Ga till bildgranskning</Text>
          </Pressable>

          <Pressable style={styles.inlineLink} onPress={() => router.push('/admin/stats')}>
            <Text style={styles.inlineLinkText}>Gå till statistik</Text>
          </Pressable>

          <Pressable style={styles.inlineLink} onPress={() => router.push('/admin/security')}>
            <Text style={styles.inlineLinkText}>Gå till säkerhet</Text>
          </Pressable>

          <Pressable style={styles.inlineLink} onPress={() => router.push('/admin/volunteers')}>
            <Text style={styles.inlineLinkText}>Gå till volontäransökningar</Text>
          </Pressable>
        </WithUCard>
      </WithUPage>
    </WithUScreen>
  );
}

const styles = StyleSheet.create({
  page: {
    paddingTop: withuSpacing.lg,
    paddingBottom: 36,
  },
  heroBlock: {
    marginBottom: 18,
  },
  heroTitle: {
    fontSize: 34,
    fontWeight: '900',
    color: withuColors.navy,
    marginBottom: 8,
  },
  heroSubtitle: {
    fontSize: 15,
    lineHeight: 24,
    color: withuColors.muted,
  },
  mainCard: {
    marginBottom: 18,
  },
  cardTitle: {
    marginBottom: 8,
  },
  iconRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 16,
    marginBottom: 18,
  },
  bigIconWrap: {
    width: 58,
    height: 58,
    borderRadius: 29,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
    borderWidth: 1,
  },
  alertIconWrap: {
    backgroundColor: '#FCEAEA',
    borderColor: '#F2C8C8',
  },
  greenIconWrap: {
    backgroundColor: '#EAF5F1',
    borderColor: '#B8DDD5',
  },
  blueIconWrap: {
    backgroundColor: '#EEF4FF',
    borderColor: '#D8E4FA',
  },
  bigIcon: {
    fontSize: 26,
  },
  textCol: {
    flex: 1,
  },
  blockTitle: {
    fontSize: 17,
    fontWeight: '900',
    color: withuColors.navy,
    marginBottom: 4,
  },
  blockText: {
    fontSize: 13,
    lineHeight: 21,
    color: withuColors.muted,
  },
  actionButton: {
    marginTop: 2,
  },
  inlineLink: {
    marginTop: 12,
    minHeight: 48,
    borderRadius: withuRadius.lg,
    borderWidth: 1,
    borderColor: '#D8E4FA',
    backgroundColor: '#EEF4FF',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    ...withuShadows.card,
  },
  inlineLinkText: {
    color: withuColors.navy,
    fontSize: 14,
    fontWeight: '900',
  },
});
