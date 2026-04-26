import React from 'react';
import {
  Alert,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAppLanguage } from '../src/i18n/AppLanguage';

type Resource = {
  title: string;
  subtitle: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  color: string;
  actionLabel: string;
  url: string;
};

const RESOURCES: Resource[] = [
  {
    title: '112',
    subtitle: 'Akut fara, våld, självmordsrisk eller om någon är i omedelbar fara.',
    icon: 'call',
    color: '#C93C3C',
    actionLabel: 'Ring 112',
    url: 'tel:112',
  },
  {
    title: '1177',
    subtitle: 'Sjukvårdsrådgivning och vägledning när du behöver vård eller stöd.',
    icon: 'medical',
    color: '#1C5E52',
    actionLabel: 'Öppna 1177',
    url: 'https://www.1177.se/',
  },
  {
    title: 'Mind Självmordslinjen',
    subtitle: 'Stöd via chatt och telefon när livet känns för tungt.',
    icon: 'heart',
    color: '#5B4FD1',
    actionLabel: 'Öppna Mind',
    url: 'https://mind.se/hitta-hjalp/sjalvmordslinjen/',
  },
  {
    title: 'BRIS',
    subtitle: 'Stöd för barn och unga. Ring 116 111 eller chatta anonymt.',
    icon: 'shield-checkmark',
    color: '#2D6CDF',
    actionLabel: 'Öppna BRIS',
    url: 'https://www.bris.se/',
  },
];

const SAFETY_STEPS = {
  sv: [
    'Träffa nya personer på en offentlig plats första gången.',
    'Berätta för någon du litar på vart du ska och när du väntas vara tillbaka.',
    'Dela inte adress, personnummer eller känsliga uppgifter i chatten.',
    'Avsluta kontakten direkt om något känns fel. Du behöver inte förklara dig.',
    'Rapportera och blockera användare som bryter mot tryggheten i WithU.',
  ],
  en: [
    'Meet new people in a public place the first time.',
    'Tell someone you trust where you are going and when you expect to be back.',
    'Do not share your address, personal identity number, or sensitive details in chat.',
    'End the contact immediately if something feels wrong. You do not need to explain.',
    'Report and block users who break WithU safety rules.',
  ],
  uk: [
    'Першу зустріч проводьте у громадському місці.',
    'Скажіть людині, якій довіряєте, куди йдете і коли плануєте повернутися.',
    'Не діліться адресою, персональним номером або чутливою інформацією в чаті.',
    'Припиніть контакт одразу, якщо щось здається неправильним. Ви не зобов’язані пояснювати.',
    'Скаржтеся та блокуйте користувачів, які порушують безпеку WithU.',
  ],
  ar: [
    'قابل الأشخاص الجدد في مكان عام في المرة الأولى.',
    'أخبر شخصاً تثق به إلى أين تذهب ومتى تتوقع العودة.',
    'لا تشارك عنوانك أو رقمك الشخصي أو معلومات حساسة في المحادثة.',
    'أنه التواصل فوراً إذا شعرت أن شيئاً غير مريح. لست مضطراً للتفسير.',
    'أبلغ واحظر المستخدمين الذين يخرقون قواعد الأمان في WithU.',
  ],
};

async function openResource(resource: Resource, errorTitle: string, errorText: string) {
  const canOpen = await Linking.canOpenURL(resource.url);

  if (!canOpen) {
    Alert.alert(errorTitle, errorText);
    return;
  }

  await Linking.openURL(resource.url);
}

export default function SafetyScreen() {
  const router = useRouter();
  const { language, t } = useAppLanguage();

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.topBar}>
        <Pressable style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={22} color="#0F1E38" />
        </Pressable>
        <Text style={styles.topTitle}>{t('safety.title')}</Text>
        <View style={styles.backButtonPlaceholder} />
      </View>

      <View style={styles.hero}>
        <View style={styles.heroIcon}>
          <Ionicons name="shield-checkmark" size={30} color="#FFFFFF" />
        </View>
        <Text style={styles.heroTitle}>{t('safety.heroTitle')}</Text>
        <Text style={styles.heroText}>{t('safety.heroText')}</Text>
      </View>

      <View style={styles.emergencyCard}>
        <Text style={styles.emergencyLabel}>{t('safety.emergencyLabel')}</Text>
        <Text style={styles.emergencyTitle}>{t('safety.emergencyTitle')}</Text>
        <Text style={styles.emergencyText}>{t('safety.emergencyText')}</Text>
        <Pressable
          style={styles.emergencyButton}
          onPress={() =>
            openResource(RESOURCES[0], t('safety.openErrorTitle'), t('safety.openErrorText'))
          }
        >
          <Ionicons name="call" size={18} color="#FFFFFF" />
          <Text style={styles.emergencyButtonText}>{t('safety.call112')}</Text>
        </Pressable>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>{t('safety.resources')}</Text>
        {RESOURCES.slice(1).map((resource) => (
          <Pressable
            key={resource.title}
            style={styles.resourceCard}
            onPress={() =>
              openResource(resource, t('safety.openErrorTitle'), t('safety.openErrorText'))
            }
          >
            <View style={[styles.resourceIcon, { backgroundColor: resource.color }]}>
              <Ionicons name={resource.icon} size={20} color="#FFFFFF" />
            </View>
            <View style={styles.resourceTextWrap}>
              <Text style={styles.resourceTitle}>{resource.title}</Text>
              <Text style={styles.resourceSubtitle}>{resource.subtitle}</Text>
            </View>
            <Ionicons name="open-outline" size={18} color="#7A8399" />
          </Pressable>
        ))}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>{t('safety.meetings')}</Text>
        <View style={styles.checklistCard}>
          {SAFETY_STEPS[language].map((step) => (
            <View key={step} style={styles.checkRow}>
              <View style={styles.checkIcon}>
                <Ionicons name="checkmark" size={14} color="#1C5E52" />
              </View>
              <Text style={styles.checkText}>{step}</Text>
            </View>
          ))}
        </View>
      </View>

      <View style={styles.reportCard}>
        <Text style={styles.sectionLabel}>{t('safety.report')}</Text>
        <Text style={styles.reportTitle}>{t('safety.reportTitle')}</Text>
        <Text style={styles.reportText}>{t('safety.reportText')}</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#F8F7F4',
  },
  content: {
    padding: 16,
    paddingBottom: 40,
  },
  topBar: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  backButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#ECEEF4',
    alignItems: 'center',
    justifyContent: 'center',
  },
  backButtonPlaceholder: {
    width: 42,
  },
  topTitle: {
    color: '#0F1E38',
    fontSize: 17,
    fontWeight: '900',
  },
  hero: {
    backgroundColor: '#0F1E38',
    borderRadius: 24,
    padding: 20,
    marginBottom: 12,
  },
  heroIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#1C5E52',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  heroTitle: {
    color: '#FFFFFF',
    fontSize: 26,
    lineHeight: 32,
    fontWeight: '900',
    marginBottom: 8,
  },
  heroText: {
    color: 'rgba(255,255,255,0.76)',
    fontSize: 15,
    lineHeight: 24,
  },
  emergencyCard: {
    backgroundColor: '#FFF2F0',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#F1CBC5',
    padding: 18,
    marginBottom: 14,
  },
  emergencyLabel: {
    color: '#C93C3C',
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 8,
  },
  emergencyTitle: {
    color: '#0F1E38',
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '900',
    marginBottom: 8,
  },
  emergencyText: {
    color: '#5C6780',
    fontSize: 14,
    lineHeight: 22,
    marginBottom: 14,
  },
  emergencyButton: {
    minHeight: 52,
    borderRadius: 16,
    backgroundColor: '#C93C3C',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  emergencyButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '900',
  },
  section: {
    marginBottom: 14,
  },
  sectionLabel: {
    color: '#7A8399',
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    marginBottom: 8,
  },
  resourceCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#ECEEF4',
    padding: 14,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
  },
  resourceIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  resourceTextWrap: {
    flex: 1,
  },
  resourceTitle: {
    color: '#0F1E38',
    fontSize: 16,
    fontWeight: '900',
    marginBottom: 3,
  },
  resourceSubtitle: {
    color: '#5C6780',
    fontSize: 13,
    lineHeight: 19,
  },
  checklistCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#ECEEF4',
    padding: 16,
  },
  checkRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  checkIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#EAF5F1',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
    marginTop: 1,
  },
  checkText: {
    flex: 1,
    color: '#2E3950',
    fontSize: 14,
    lineHeight: 22,
  },
  reportCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#ECEEF4',
    padding: 18,
  },
  reportTitle: {
    color: '#0F1E38',
    fontSize: 20,
    fontWeight: '900',
    marginBottom: 8,
  },
  reportText: {
    color: '#5C6780',
    fontSize: 14,
    lineHeight: 22,
  },
});
