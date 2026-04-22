import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import { supabase } from '../../src/lib/supabase';
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

type OwnProfileRow = {
  id: string;
  name: string | null;
  age: number | null;
  city: string | null;
  is_bankid_verified: boolean | null;
};

type VolunteerApplicationRow = {
  id: string;
  user_id: string;
  status: 'pending' | 'approved' | 'rejected';
  role_sv: string;
  role_en: string;
  role_ru: string;
  bio_sv: string;
  bio_en: string;
  bio_ru: string;
  tags: string[] | null;
  age_groups: string[] | null;
  weekly_hours: number;
  guidelines_accepted: boolean;
  admin_note: string | null;
  rejection_reason: string | null;
  submitted_at: string;
};

type VolunteerDocumentRow = {
  id: string;
  application_id: string;
  user_id: string;
  doc_type:
    | 'criminal_record_extract'
    | 'education_certificate'
    | 'work_certificate'
    | 'volunteer_certificate'
    | 'other';
  file_name: string;
  storage_path: string;
  mime_type: string;
  file_size_bytes: number;
  created_at: string;
};

type LocalDocument = {
  localId: string;
  name: string;
  uri: string;
  mimeType: string;
  size: number;
  docType:
    | 'criminal_record_extract'
    | 'education_certificate'
    | 'work_certificate'
    | 'volunteer_certificate'
    | 'other';
};

const TAG_OPTIONS = [
  'Ångest',
  'Ensamhet',
  'Stress',
  'Sorg',
  'Studentliv',
  'Seniorer',
  'Motion',
  'Familj',
  'Integration',
  'Ungdomar',
  'Samtalsstöd',
  'Promenad',
];

const AGE_GROUP_OPTIONS = ['15-17', '18-25', '25-40', '40-60', '60-90+'] as const;

const DOCUMENT_TYPE_OPTIONS: Array<{
  value: LocalDocument['docType'];
  label: string;
}> = [
  { value: 'criminal_record_extract', label: 'Belastningsregister' },
  { value: 'education_certificate', label: 'Utbildningsintyg' },
  { value: 'work_certificate', label: 'Arbetsintyg' },
  { value: 'volunteer_certificate', label: 'Volontärintyg' },
  { value: 'other', label: 'Annat' },
];

const ROLE_PRESETS = [
  'Samtalsstöd',
  'Promenadkompis',
  'Trygg chattvolontär',
  'Seniorstöd',
];

function createLocalId() {
  return `local_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function sanitizeFileName(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]/g, '_');
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function VolunteerApplyScreen() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [pickingDocs, setPickingDocs] = useState(false);
  const [removingDocId, setRemovingDocId] = useState('');

  const [currentUserId, setCurrentUserId] = useState('');
  const [ownProfile, setOwnProfile] = useState<OwnProfileRow | null>(null);
  const [pendingApplicationId, setPendingApplicationId] = useState<string | null>(null);
  const [existingStatus, setExistingStatus] = useState<'pending' | 'rejected' | 'approved' | null>(
    null
  );
  const [existingDocuments, setExistingDocuments] = useState<VolunteerDocumentRow[]>([]);

  const [roleSv, setRoleSv] = useState('');
  const [bioSv, setBioSv] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [selectedAgeGroups, setSelectedAgeGroups] = useState<string[]>([]);
  const [weeklyHours, setWeeklyHours] = useState('2');
  const [guidelinesAccepted, setGuidelinesAccepted] = useState(false);

  const [localDocuments, setLocalDocuments] = useState<LocalDocument[]>([]);
  const [errorText, setErrorText] = useState('');

  const loadData = useCallback(async () => {
    try {
      setErrorText('');

      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError) throw authError;

      if (!user) {
        setErrorText('Du måste logga in för att ansöka.');
        return;
      }

      setCurrentUserId(user.id);

      const [
        { data: ownProfileRow, error: ownProfileError },
        { data: applicationRows, error: applicationError },
        { data: volunteerProfileRow, error: volunteerProfileError },
      ] = await Promise.all([
        supabase
          .from('profiles')
          .select('id, name, age, city, is_bankid_verified')
          .eq('id', user.id)
          .maybeSingle(),
        supabase
          .from('volunteer_applications')
          .select(
            'id, user_id, status, role_sv, role_en, role_ru, bio_sv, bio_en, bio_ru, tags, age_groups, weekly_hours, guidelines_accepted, admin_note, rejection_reason, submitted_at'
          )
          .eq('user_id', user.id)
          .order('submitted_at', { ascending: false })
          .limit(1),
        supabase.from('volunteer_profiles').select('user_id').eq('user_id', user.id).maybeSingle(),
      ]);

      if (ownProfileError) throw ownProfileError;
      if (applicationError) throw applicationError;
      if (volunteerProfileError) throw volunteerProfileError;

      const latestApplication = (((applicationRows ?? []) as VolunteerApplicationRow[])[0] ??
        null) as VolunteerApplicationRow | null;

      setOwnProfile((ownProfileRow as OwnProfileRow | null) ?? null);

      if (volunteerProfileRow) {
        setExistingStatus('approved');
      } else {
        setExistingStatus(latestApplication?.status ?? null);
      }

      if (latestApplication) {
        setRoleSv(
          latestApplication.role_sv ||
            latestApplication.role_en ||
            latestApplication.role_ru ||
            ''
        );

        setBioSv(
          latestApplication.bio_sv ||
            latestApplication.bio_en ||
            latestApplication.bio_ru ||
            ''
        );

        setSelectedTags(latestApplication.tags ?? []);
        setSelectedAgeGroups(latestApplication.age_groups ?? []);
        setWeeklyHours(String(latestApplication.weekly_hours || 2));
        setGuidelinesAccepted(!!latestApplication.guidelines_accepted);

        if (latestApplication.status === 'pending') {
          setPendingApplicationId(latestApplication.id);

          const { data: documentsRows, error: documentsError } = await supabase
            .from('volunteer_application_documents')
            .select(
              'id, application_id, user_id, doc_type, file_name, storage_path, mime_type, file_size_bytes, created_at'
            )
            .eq('application_id', latestApplication.id)
            .order('created_at', { ascending: true });

          if (documentsError) throw documentsError;

          setExistingDocuments((documentsRows ?? []) as VolunteerDocumentRow[]);
        } else {
          setPendingApplicationId(null);
          setExistingDocuments([]);
        }
      } else {
        setPendingApplicationId(null);
        setExistingDocuments([]);
      }
    } catch (error: any) {
      setErrorText(error?.message || 'Kunde inte ladda ansökan.');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      loadData();
    }, [loadData])
  );

  const totalDocumentCount = existingDocuments.length + localDocuments.length;
  const isEligible =
    !!ownProfile &&
    (ownProfile.age ?? 0) >= 18 &&
    !!ownProfile.is_bankid_verified &&
    existingStatus !== 'approved';

  const toggleTag = (tag: string) => {
    setSelectedTags((prev) => {
      if (prev.includes(tag)) {
        return prev.filter((item) => item !== tag);
      }

      if (prev.length >= 5) {
        Alert.alert('Max 5 taggar', 'Du kan välja mellan 1 och 5 taggar.');
        return prev;
      }

      return [...prev, tag];
    });
  };

  const toggleAgeGroup = (value: string) => {
    setSelectedAgeGroups((prev) => {
      if (prev.includes(value)) {
        return prev.filter((item) => item !== value);
      }
      return [...prev, value];
    });
  };

  const pickDocuments = async () => {
    if (pickingDocs) return;

    try {
      setPickingDocs(true);

      if (totalDocumentCount >= 5) {
        Alert.alert('Max 5 dokument', 'Du har redan nått maxgränsen för dokument.');
        return;
      }

      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'image/jpeg', 'image/png'],
        multiple: true,
        copyToCacheDirectory: true,
      });

      if (result.canceled) return;

      const pickedAssets = result.assets ?? [];
      const remainingSlots = 5 - totalDocumentCount;
      const slicedAssets = pickedAssets.slice(0, remainingSlots);

      const preparedDocs: LocalDocument[] = [];

      for (const asset of slicedAssets) {
        const size = asset.size ?? 0;
        const mimeType = asset.mimeType ?? '';

        if (!mimeType || !['application/pdf', 'image/jpeg', 'image/png'].includes(mimeType)) {
          Alert.alert('Fel filtyp', `${asset.name} stöds inte. Välj PDF, JPG eller PNG.`);
          continue;
        }

        if (size > 10 * 1024 * 1024) {
          Alert.alert('För stor fil', `${asset.name} är större än 10 MB.`);
          continue;
        }

        preparedDocs.push({
          localId: createLocalId(),
          name: asset.name,
          uri: asset.uri,
          mimeType,
          size,
          docType: 'other',
        });
      }

      setLocalDocuments((prev) => [...prev, ...preparedDocs]);
    } catch (error: any) {
      Alert.alert('Kunde inte välja dokument', error?.message || 'Något gick fel.');
    } finally {
      setPickingDocs(false);
    }
  };

  const removeLocalDocument = (localId: string) => {
    setLocalDocuments((prev) => prev.filter((item) => item.localId !== localId));
  };

  const updateLocalDocumentType = (localId: string, docType: LocalDocument['docType']) => {
    setLocalDocuments((prev) =>
      prev.map((item) => (item.localId === localId ? { ...item, docType } : item))
    );
  };

  const deleteExistingDocument = async (doc: VolunteerDocumentRow) => {
    if (!pendingApplicationId || removingDocId) return;

    try {
      setRemovingDocId(doc.id);

      const { error: storageError } = await supabase.storage
        .from('volunteer-documents')
        .remove([doc.storage_path]);

      if (storageError) throw storageError;

      const { error: deleteError } = await supabase
        .from('volunteer_application_documents')
        .delete()
        .eq('id', doc.id);

      if (deleteError) throw deleteError;

      setExistingDocuments((prev) => prev.filter((item) => item.id !== doc.id));
    } catch (error: any) {
      Alert.alert('Kunde inte ta bort dokument', error?.message || 'Något gick fel.');
    } finally {
      setRemovingDocId('');
    }
  };

  const validateBeforeSave = () => {
    if (!isEligible) {
      Alert.alert('Kan inte ansöka', 'Du måste vara 18+ och BankID-verifierad.');
      return false;
    }

    if (!roleSv.trim()) {
      Alert.alert('Roll saknas', 'Fyll i eller välj en roll.');
      return false;
    }

    if (!bioSv.trim()) {
      Alert.alert('Bio saknas', 'Skriv en kort bio.');
      return false;
    }

    if (bioSv.trim().length > 300) {
      Alert.alert('För lång bio', 'Bio får vara max 300 tecken.');
      return false;
    }

    if (selectedTags.length < 1 || selectedTags.length > 5) {
      Alert.alert('Taggar saknas', 'Välj mellan 1 och 5 taggar.');
      return false;
    }

    if (selectedAgeGroups.length < 1) {
      Alert.alert('Åldersgrupper saknas', 'Välj minst en åldersgrupp.');
      return false;
    }

    const hours = Number(weeklyHours);
    if (!hours || hours < 1 || hours > 40) {
      Alert.alert('Ogiltiga timmar', 'Skriv ett värde mellan 1 och 40 timmar per vecka.');
      return false;
    }

    if (!guidelinesAccepted) {
      Alert.alert('Godkänn riktlinjer', 'Du måste godkänna riktlinjerna för volontärer.');
      return false;
    }

    if (totalDocumentCount > 5) {
      Alert.alert('För många dokument', 'Du kan ha max 5 dokument.');
      return false;
    }

    return true;
  };

  const saveApplication = async () => {
    if (!currentUserId || saving) return;
    if (!validateBeforeSave()) return;

    try {
      setSaving(true);

      const cleanRole = roleSv.trim();
      const cleanBio = bioSv.trim();

      const payload = {
        user_id: currentUserId,
        status: 'pending' as const,
        role_sv: cleanRole,
        role_en: cleanRole,
        role_ru: cleanRole,
        bio_sv: cleanBio,
        bio_en: cleanBio,
        bio_ru: cleanBio,
        tags: selectedTags,
        age_groups: selectedAgeGroups,
        weekly_hours: Number(weeklyHours),
        guidelines_accepted: true,
        updated_at: new Date().toISOString(),
      };

      let applicationId = pendingApplicationId;

      if (pendingApplicationId) {
        const { error: updateError } = await supabase
          .from('volunteer_applications')
          .update(payload)
          .eq('id', pendingApplicationId)
          .eq('user_id', currentUserId);

        if (updateError) throw updateError;
      } else {
        const { data, error: insertError } = await supabase
          .from('volunteer_applications')
          .insert(payload)
          .select('id')
          .single();

        if (insertError) throw insertError;
        applicationId = data.id;
        setPendingApplicationId(data.id);
      }

      if (!applicationId) {
        throw new Error('Kunde inte hitta ansökans id.');
      }

      for (let index = 0; index < localDocuments.length; index += 1) {
        const doc = localDocuments[index];
        const safeName = sanitizeFileName(doc.name);
        const storagePath = `${currentUserId}/${applicationId}/${Date.now()}_${index}_${safeName}`;

        const response = await fetch(doc.uri);
        const arrayBuffer = await response.arrayBuffer();

        const { error: storageError } = await supabase.storage
          .from('volunteer-documents')
          .upload(storagePath, arrayBuffer, {
            contentType: doc.mimeType,
            upsert: false,
          });

        if (storageError) throw storageError;

        const { error: documentInsertError } = await supabase
          .from('volunteer_application_documents')
          .insert({
            application_id: applicationId,
            user_id: currentUserId,
            doc_type: doc.docType,
            file_name: doc.name,
            storage_path: storagePath,
            mime_type: doc.mimeType,
            file_size_bytes: doc.size,
          });

        if (documentInsertError) throw documentInsertError;
      }

      Alert.alert(
        'Ansökan sparad',
        pendingApplicationId
          ? 'Din volontäransökan har uppdaterats.'
          : 'Din volontäransökan har skickats.'
      );

      setLocalDocuments([]);
      router.replace('/volunteers');
    } catch (error: any) {
      Alert.alert('Kunde inte spara ansökan', error?.message || 'Något gick fel.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <WithUScreen>
        <WithUTopBar
          title="WithU"
          subtitle="Du är aldrig ensam."
          right={<WithUAvatar emoji="😊" size={34} />}
        />
        <WithUPage style={styles.pageOnly}>
          <View style={styles.stateCard}>
            <ActivityIndicator size="large" color={withuColors.teal} />
            <Text style={styles.stateTitle}>Laddar ansökan...</Text>
            <Text style={styles.stateText}>Vi hämtar dina uppgifter och volontärstatus.</Text>
          </View>
        </WithUPage>
      </WithUScreen>
    );
  }

  if (errorText) {
    return (
      <WithUScreen>
        <WithUTopBar
          title="WithU"
          subtitle="Du är aldrig ensam."
          right={<WithUAvatar emoji="😊" size={34} />}
        />
        <WithUPage style={styles.pageOnly}>
          <View style={styles.stateCard}>
            <Text style={styles.stateTitle}>Kunde inte öppna ansökan</Text>
            <Text style={styles.stateText}>{errorText}</Text>
            <WithUPrimaryButton title="Tillbaka" onPress={() => router.back()} />
          </View>
        </WithUPage>
      </WithUScreen>
    );
  }

  if (existingStatus === 'approved') {
    return (
      <WithUScreen>
        <WithUTopBar
          title="WithU"
          subtitle="Du är aldrig ensam."
          right={<WithUAvatar emoji="😊" size={34} />}
        />
        <WithUPage style={styles.pageOnly}>
          <View style={styles.stateCard}>
            <Text style={styles.stateTitle}>Du är redan volontär</Text>
            <Text style={styles.stateText}>
              Din ansökan är redan godkänd. Gå tillbaka till volontärsidan för att hantera din
              tillgänglighet.
            </Text>
            <WithUPrimaryButton
              title="Till volontärer"
              onPress={() => router.replace('/volunteers')}
            />
          </View>
        </WithUPage>
      </WithUScreen>
    );
  }

  return (
    <WithUScreen>
      <WithUTopBar
        title="WithU"
        subtitle="Du är aldrig ensam."
        right={<WithUAvatar emoji="😊" size={34} />}
      />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <WithUPage style={styles.page}>
          <Pressable style={styles.backRow} onPress={() => router.back()}>
            <Text style={styles.backText}>← Tillbaka</Text>
          </Pressable>

          <View style={styles.heroBlock}>
            <Text style={styles.heroTitle}>Bli volontär</Text>
            <Text style={styles.heroSubtitle}>
              Nu behöver du bara fylla i svenska. Engelska och ryska sparas automatiskt med samma
              text.
            </Text>
          </View>

          {!isEligible && (
            <WithUCard style={styles.infoCard}>
              <WithUSectionLabel>Info</WithUSectionLabel>
              <WithUTitle style={styles.smallTitle}>Du kan inte ansöka ännu</WithUTitle>
              <WithUSubtitle>
                Du måste vara minst 18 år och BankID-verifierad i din profil för att kunna skicka
                en volontäransökan.
              </WithUSubtitle>
            </WithUCard>
          )}

          {existingStatus === 'pending' && (
            <WithUCard style={styles.infoCard}>
              <WithUSectionLabel>Status</WithUSectionLabel>
              <WithUTitle style={styles.smallTitle}>Du har redan en väntande ansökan</WithUTitle>
              <WithUSubtitle>
                Du kan fortfarande uppdatera innehållet och lägga till eller ta bort dokument innan
                admin granskar den.
              </WithUSubtitle>
              <View style={styles.pendingBadge}>
                <Text style={styles.pendingBadgeText}>⏳ Väntar på granskning</Text>
              </View>
            </WithUCard>
          )}

          {existingStatus === 'rejected' && (
            <WithUCard style={styles.infoCard}>
              <WithUSectionLabel>Status</WithUSectionLabel>
              <WithUTitle style={styles.smallTitle}>Senaste ansökan blev nekad</WithUTitle>
              <WithUSubtitle>
                Du kan fylla i formuläret igen och skicka på nytt.
              </WithUSubtitle>
            </WithUCard>
          )}

          <WithUCard style={styles.mainCard}>
            <WithUSectionLabel>Roll</WithUSectionLabel>
            <WithUTitle style={styles.smallTitle}>Välj eller skriv roll</WithUTitle>
            <WithUSubtitle>Det räcker att fylla i svenska här.</WithUSubtitle>

            <View style={styles.choiceWrap}>
              {ROLE_PRESETS.map((roleOption) => {
                const active = roleSv.trim() === roleOption;

                return (
                  <Pressable
                    key={roleOption}
                    style={[styles.choiceChip, active && styles.choiceChipActive]}
                    onPress={() => setRoleSv(roleOption)}
                  >
                    <Text style={[styles.choiceChipText, active && styles.choiceChipTextActive]}>
                      {roleOption}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <Text style={styles.fieldLabel}>Eller skriv egen roll</Text>
            <TextInput
              value={roleSv}
              onChangeText={setRoleSv}
              placeholder="Till exempel: Samtalsstöd eller Promenadkompis"
              placeholderTextColor={withuColors.muted}
              style={styles.input}
            />

            <Text style={styles.fieldLabel}>Kort bio (max 300 tecken)</Text>
            <TextInput
              value={bioSv}
              onChangeText={setBioSv}
              placeholder="Skriv kort om varför du vill hjälpa andra..."
              placeholderTextColor={withuColors.muted}
              multiline
              textAlignVertical="top"
              maxLength={300}
              style={[styles.input, styles.textArea]}
            />

            <Text style={styles.counterText}>{bioSv.trim().length}/300</Text>
          </WithUCard>

          <WithUCard style={styles.mainCard}>
            <WithUSectionLabel>Taggar</WithUSectionLabel>
            <WithUTitle style={styles.smallTitle}>Välj 1 till 5 taggar</WithUTitle>

            <View style={styles.choiceWrap}>
              {TAG_OPTIONS.map((tag) => {
                const active = selectedTags.includes(tag);

                return (
                  <Pressable
                    key={tag}
                    style={[styles.choiceChip, active && styles.choiceChipActive]}
                    onPress={() => toggleTag(tag)}
                  >
                    <Text style={[styles.choiceChipText, active && styles.choiceChipTextActive]}>
                      {tag}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <Text style={styles.helperText}>{selectedTags.length}/5 valda</Text>
          </WithUCard>

          <WithUCard style={styles.mainCard}>
            <WithUSectionLabel>Åldersgrupper</WithUSectionLabel>
            <WithUTitle style={styles.smallTitle}>Välj vilka du vill stötta</WithUTitle>

            <View style={styles.choiceWrap}>
              {AGE_GROUP_OPTIONS.map((group) => {
                const active = selectedAgeGroups.includes(group);

                return (
                  <Pressable
                    key={group}
                    style={[styles.choiceChip, active && styles.choiceChipActive]}
                    onPress={() => toggleAgeGroup(group)}
                  >
                    <Text style={[styles.choiceChipText, active && styles.choiceChipTextActive]}>
                      {group}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {selectedAgeGroups.includes('15-17') && (
              <View style={styles.noticeBox}>
                <Text style={styles.noticeText}>
                  För åldersgruppen 15–17 bör du ladda upp belastningsregister, annars kan admin
                  inte godkänna ansökan.
                </Text>
              </View>
            )}
          </WithUCard>

          <WithUCard style={styles.mainCard}>
            <WithUSectionLabel>Tillgänglighet</WithUSectionLabel>
            <WithUTitle style={styles.smallTitle}>Timmar per vecka</WithUTitle>
            <TextInput
              value={weeklyHours}
              onChangeText={setWeeklyHours}
              placeholder="1 till 40"
              placeholderTextColor={withuColors.muted}
              keyboardType="number-pad"
              style={styles.input}
            />
          </WithUCard>

          <WithUCard style={styles.mainCard}>
            <WithUSectionLabel>Dokument</WithUSectionLabel>
            <WithUTitle style={styles.smallTitle}>Ladda upp upp till 5 dokument</WithUTitle>
            <WithUSubtitle>Tillåtna format: PDF, JPG, PNG. Max 10 MB per fil.</WithUSubtitle>

            <Pressable
              style={[styles.uploadButton, pickingDocs && styles.buttonDisabled]}
              onPress={pickDocuments}
              disabled={pickingDocs}
            >
              <Text style={styles.uploadButtonText}>
                {pickingDocs ? 'Öppnar...' : 'Lägg till dokument'}
              </Text>
            </Pressable>

            <Text style={styles.helperText}>{totalDocumentCount}/5 dokument</Text>

            {existingDocuments.length > 0 && (
              <View style={styles.documentsGroup}>
                <Text style={styles.groupTitle}>Redan uppladdade dokument</Text>

                {existingDocuments.map((doc) => (
                  <View key={doc.id} style={styles.documentCard}>
                    <View style={styles.documentInfo}>
                      <Text style={styles.documentName}>{doc.file_name}</Text>
                      <Text style={styles.documentMeta}>
                        {DOCUMENT_TYPE_OPTIONS.find((item) => item.value === doc.doc_type)?.label ||
                          'Dokument'}{' '}
                        · {formatBytes(doc.file_size_bytes)}
                      </Text>
                    </View>

                    <Pressable
                      style={[
                        styles.deleteDocButton,
                        removingDocId === doc.id && styles.buttonDisabled,
                      ]}
                      onPress={() => deleteExistingDocument(doc)}
                      disabled={removingDocId === doc.id}
                    >
                      <Text style={styles.deleteDocButtonText}>
                        {removingDocId === doc.id ? '...' : 'Ta bort'}
                      </Text>
                    </Pressable>
                  </View>
                ))}
              </View>
            )}

            {localDocuments.length > 0 && (
              <View style={styles.documentsGroup}>
                <Text style={styles.groupTitle}>Nya dokument att ladda upp</Text>

                {localDocuments.map((doc) => (
                  <View key={doc.localId} style={styles.localDocumentCard}>
                    <View style={styles.documentInfo}>
                      <Text style={styles.documentName}>{doc.name}</Text>
                      <Text style={styles.documentMeta}>{formatBytes(doc.size)}</Text>
                    </View>

                    <Pressable
                      style={styles.deleteDocButton}
                      onPress={() => removeLocalDocument(doc.localId)}
                    >
                      <Text style={styles.deleteDocButtonText}>Ta bort</Text>
                    </Pressable>

                    <View style={styles.docTypeWrap}>
                      {DOCUMENT_TYPE_OPTIONS.map((option) => {
                        const active = doc.docType === option.value;

                        return (
                          <Pressable
                            key={`${doc.localId}-${option.value}`}
                            style={[
                              styles.choiceChipSmall,
                              active && styles.choiceChipSmallActive,
                            ]}
                            onPress={() => updateLocalDocumentType(doc.localId, option.value)}
                          >
                            <Text
                              style={[
                                styles.choiceChipSmallText,
                                active && styles.choiceChipSmallTextActive,
                              ]}
                            >
                              {option.label}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>
                ))}
              </View>
            )}
          </WithUCard>

          <WithUCard style={styles.mainCard}>
            <WithUSectionLabel>Godkännande</WithUSectionLabel>
            <WithUTitle style={styles.smallTitle}>Riktlinjer</WithUTitle>

            <Pressable
              style={[
                styles.guidelinesBox,
                guidelinesAccepted && styles.guidelinesBoxActive,
              ]}
              onPress={() => setGuidelinesAccepted((prev) => !prev)}
            >
              <View
                style={[
                  styles.checkbox,
                  guidelinesAccepted && styles.checkboxActive,
                ]}
              >
                <Text style={styles.checkboxText}>{guidelinesAccepted ? '✓' : ''}</Text>
              </View>

              <Text
                style={[
                  styles.guidelinesText,
                  guidelinesAccepted && styles.guidelinesTextActive,
                ]}
              >
                Jag har läst och godkänner WithU:s riktlinjer för volontärer.
              </Text>
            </Pressable>

            <WithUPrimaryButton
              title={
                saving
                  ? 'Sparar...'
                  : pendingApplicationId
                  ? 'Uppdatera ansökan'
                  : 'Skicka ansökan'
              }
              onPress={saveApplication}
              disabled={!isEligible || saving}
              style={styles.submitButton}
            />
          </WithUCard>
        </WithUPage>
      </ScrollView>
    </WithUScreen>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
    backgroundColor: withuColors.cream,
  },
  content: {
    paddingBottom: 36,
  },
  page: {
    paddingTop: withuSpacing.lg,
  },
  pageOnly: {
    paddingTop: withuSpacing.xl,
  },
  backRow: {
    marginBottom: 12,
  },
  backText: {
    color: withuColors.teal,
    fontSize: 14,
    fontWeight: '800',
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
  infoCard: {
    marginBottom: 18,
  },
  mainCard: {
    marginBottom: 18,
  },
  smallTitle: {
    marginBottom: 8,
  },
  fieldLabel: {
    color: withuColors.navy,
    fontSize: 13,
    fontWeight: '900',
    marginBottom: 8,
    marginTop: 14,
  },
  input: {
    minHeight: 52,
    borderRadius: withuRadius.lg,
    backgroundColor: withuColors.soft,
    borderWidth: 1,
    borderColor: withuColors.line,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: withuColors.navy,
    fontSize: 15,
  },
  textArea: {
    minHeight: 120,
    textAlignVertical: 'top',
  },
  counterText: {
    marginTop: 6,
    textAlign: 'right',
    color: withuColors.muted,
    fontSize: 11,
    fontWeight: '700',
  },
  choiceWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
  },
  choiceChip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderColor: '#D6DCE8',
  },
  choiceChipActive: {
    backgroundColor: '#143E35',
    borderColor: '#143E35',
  },
  choiceChipText: {
    color: '#1D3158',
    fontSize: 13,
    fontWeight: '900',
  },
  choiceChipTextActive: {
    color: '#FFFFFF',
  },
  choiceChipSmall: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderColor: '#D6DCE8',
  },
  choiceChipSmallActive: {
    backgroundColor: '#8F2D0A',
    borderColor: '#8F2D0A',
  },
  choiceChipSmallText: {
    color: '#1D3158',
    fontSize: 11,
    fontWeight: '800',
  },
  choiceChipSmallTextActive: {
    color: '#FFFFFF',
  },
  helperText: {
    marginTop: 10,
    color: withuColors.muted,
    fontSize: 12,
    fontWeight: '700',
  },
  noticeBox: {
    marginTop: 12,
    backgroundColor: '#FFF7E8',
    borderRadius: withuRadius.lg,
    borderWidth: 1,
    borderColor: '#F1DEC2',
    padding: 12,
  },
  noticeText: {
    color: '#A16207',
    fontSize: 12,
    lineHeight: 19,
    fontWeight: '700',
  },
  uploadButton: {
    minHeight: 48,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: '#111111',
    borderStyle: 'dashed',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 14,
  },
  uploadButtonText: {
    color: '#111111',
    fontSize: 14,
    fontWeight: '900',
  },
  documentsGroup: {
    marginTop: 16,
    gap: 10,
  },
  groupTitle: {
    fontSize: 13,
    fontWeight: '900',
    color: withuColors.navy,
  },
  documentCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: withuRadius.lg,
    borderWidth: 1,
    borderColor: withuColors.line,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    ...withuShadows.card,
  },
  localDocumentCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: withuRadius.lg,
    borderWidth: 1,
    borderColor: withuColors.line,
    padding: 12,
    ...withuShadows.card,
  },
  documentInfo: {
    flex: 1,
    paddingRight: 10,
  },
  documentName: {
    color: withuColors.navy,
    fontSize: 13,
    fontWeight: '900',
    marginBottom: 3,
  },
  documentMeta: {
    color: withuColors.muted,
    fontSize: 11,
    fontWeight: '700',
  },
  deleteDocButton: {
    minHeight: 34,
    borderRadius: 999,
    backgroundColor: '#FCEAEA',
    borderWidth: 1,
    borderColor: '#F2C8C8',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  deleteDocButtonText: {
    color: '#C2412D',
    fontSize: 11,
    fontWeight: '900',
  },
  docTypeWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
  },
  guidelinesBox: {
    marginTop: 12,
    borderRadius: withuRadius.lg,
    backgroundColor: '#F4F6FA',
    borderWidth: 1,
    borderColor: withuColors.line,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  guidelinesBoxActive: {
    backgroundColor: '#E7F3EF',
    borderColor: '#143E35',
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: withuColors.line,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
    marginTop: 1,
  },
  checkboxActive: {
    backgroundColor: '#143E35',
    borderColor: '#143E35',
  },
  checkboxText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '900',
  },
  guidelinesText: {
    flex: 1,
    color: withuColors.navy,
    fontSize: 13,
    lineHeight: 20,
    fontWeight: '700',
  },
  guidelinesTextActive: {
    color: '#143E35',
  },
  submitButton: {
    marginTop: 16,
  },
  pendingBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#FFF7E8',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#F1DEC2',
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginTop: 12,
  },
  pendingBadgeText: {
    color: '#C07020',
    fontSize: 12,
    fontWeight: '900',
  },
  stateCard: {
    backgroundColor: withuColors.white,
    borderRadius: withuRadius.xl,
    borderWidth: 1,
    borderColor: withuColors.line,
    padding: withuSpacing.xxl,
    alignItems: 'center',
    ...withuShadows.card,
  },
  stateTitle: {
    color: withuColors.navy,
    fontSize: 24,
    fontWeight: '900',
    marginTop: 14,
    marginBottom: 10,
    textAlign: 'center',
  },
  stateText: {
    color: '#555555',
    fontSize: 15,
    lineHeight: 24,
    textAlign: 'center',
    marginBottom: 20,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
});