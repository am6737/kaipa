import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import { Camera, Dices } from 'lucide-react-native';
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Avatar } from '../components/Avatar';
import { Press } from '../components/Press';
import { useData } from '../data/DataContext';
import { layout, radius, space, type } from '../design-system';
import { useI18n } from '../i18n';
import { MePushPage } from '../components/me/MePushPage';
import type { Theme } from '../theme/theme';

const STORAGE_PREFIX = 'kaipa_onboarding_v1:';
const ZH_ADJECTIVES = ['山野', '清风', '星河', '云端', '松林', '晨雾', '远峰', '溪谷'];
const ZH_NOUNS = ['旅人', '行者', '向导', '背包客', '探路者'];
const EN_ADJECTIVES = ['Wild', 'Alpine', 'Quiet', 'Summit', 'Forest', 'Dawn', 'Cloud', 'River'];
const EN_NOUNS = ['Hiker', 'Walker', 'Guide', 'Trekker', 'Explorer'];

type NumericKey = 'heightCm' | 'weightKg' | 'ageYears';
type Draft = Record<NumericKey, string>;
type Errors = Partial<Record<NumericKey, string>>;
type DietaryOption = 'vegetarian' | 'noBeef' | 'noPork' | 'seafoodAllergy' | 'peanutAllergy' | 'lactoseIntolerant' | 'glutenFree' | 'halal' | 'lowSalt';
const DIETARY_OPTIONS: DietaryOption[] = ['vegetarian', 'noBeef', 'noPork', 'seafoodAllergy', 'peanutAllergy', 'lactoseIntolerant', 'glutenFree', 'halal', 'lowSalt'];

function randomItem(values: readonly string[]) {
  return values[Math.floor(Math.random() * values.length)];
}

function OptionalField({
  theme,
  label,
  value,
  unit,
  error,
  decimal,
  onChange,
}: {
  theme: Theme;
  label: string;
  value: string;
  unit: string;
  error?: string;
  decimal?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <View style={{ gap: space.xs }}>
      <Text style={[type.eyebrow, { color: theme.text2 }]}>{label}</Text>
      <View style={[styles.field, { backgroundColor: theme.surfaceTop, borderColor: error ? theme.danger : theme.fieldBorder }]}>
        <TextInput
          value={value}
          onChangeText={(text) => onChange(decimal ? text.replace(/[^\d.]/g, '').replace(/(\..*)\./g, '$1') : text.replace(/\D/g, ''))}
          keyboardType={decimal ? 'decimal-pad' : 'number-pad'}
          maxLength={decimal ? 6 : 3}
          placeholder="--"
          placeholderTextColor={theme.text3}
          accessibilityLabel={label}
          style={[styles.fieldInput, { color: theme.text }]}
        />
        <Text style={[type.caption, { color: theme.text2 }]}>{unit}</Text>
      </View>
      {error ? <Text style={[type.caption, { color: theme.danger }]}>{error}</Text> : null}
    </View>
  );
}

export function OnboardingGate({ theme, children }: { theme: Theme; children: React.ReactNode }) {
  const data = useData();
  const [checking, setChecking] = useState(true);
  const [complete, setComplete] = useState(false);

  useEffect(() => {
    let active = true;
    setChecking(true);
    AsyncStorage.getItem(`${STORAGE_PREFIX}${data.userId}`)
      .then((value) => {
        if (active) setComplete(value === 'complete');
      })
      .catch(() => {
        if (active) setComplete(false);
      })
      .finally(() => {
        if (active) setChecking(false);
      });
    return () => { active = false; };
  }, [data.userId]);

  if (checking || data.profileLoading || data.planningProfileLoading) {
    return <View style={[styles.loading, { backgroundColor: theme.bg }]}><ActivityIndicator color={theme.accent} /></View>;
  }
  if (complete) return <>{children}</>;

  const finish = async () => {
    await AsyncStorage.setItem(`${STORAGE_PREFIX}${data.userId}`, 'complete');
    setComplete(true);
  };
  return <OnboardingFlow theme={theme} onFinish={finish} />;
}

function OnboardingFlow({ theme, onFinish }: { theme: Theme; onFinish: () => Promise<void> }) {
  const { t, resolved } = useI18n();
  const data = useData();
  const [step, setStep] = useState<1 | 2>(1);
  const [nick, setNick] = useState(data.profile.nick);
  const [avatarUri, setAvatarUri] = useState('');
  const [draft, setDraft] = useState<Draft>({
    heightCm: data.planningProfile.heightCm == null ? '' : String(data.planningProfile.heightCm),
    weightKg: data.planningProfile.weightKg == null ? '' : String(data.planningProfile.weightKg),
    ageYears: data.planningProfile.ageYears == null ? '' : String(data.planningProfile.ageYears),
  });
  const [dietary, setDietary] = useState<DietaryOption[]>([]);
  const [dietaryCustom, setDietaryCustom] = useState(data.planningProfile.dietaryRestrictions);
  const [errors, setErrors] = useState<Errors>({});
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const trimmedNick = nick.trim();
  const hasPlanningValues = useMemo(() => Object.values(draft).some((value) => value.trim()), [draft]);

  const randomizeNick = () => {
    const adjective = randomItem(resolved === 'zh' ? ZH_ADJECTIVES : EN_ADJECTIVES);
    const noun = randomItem(resolved === 'zh' ? ZH_NOUNS : EN_NOUNS);
    const suffix = String(Math.floor(Math.random() * 100)).padStart(2, '0');
    setNick(`${adjective}${resolved === 'zh' ? '' : ' '}${noun}${suffix}`);
    setMessage('');
  };

  const pickAvatar = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setMessage(t('onboarding.avatarPermission'));
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.9 });
    if (!result.canceled && result.assets[0]) {
      setAvatarUri(result.assets[0].uri);
      setMessage('');
    }
  };

  const updateNumeric = (key: NumericKey, value: string) => {
    setDraft((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
    setMessage('');
  };

  const toggleDietary = (option: DietaryOption) => {
    setDietary((current) => {
      if (current.includes(option)) return current.filter((item) => item !== option);
      return [...current, option];
    });
  };

  const saveIdentity = async () => {
    setSaving(true);
    setMessage('');
    try {
      if (trimmedNick && trimmedNick !== data.profile.nick) await data.updateProfile('nick', trimmedNick);
      if (avatarUri) await data.updateAvatar(avatarUri);
      setStep(2);
    } catch {
      setMessage(t('onboarding.identitySaveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const finish = async (save: boolean) => {
    const heightCm = draft.heightCm.trim() ? Number(draft.heightCm) : null;
    const weightKg = draft.weightKg.trim() ? Number(draft.weightKg) : null;
    const ageYears = draft.ageYears.trim() ? Number(draft.ageYears) : null;
    if (save) {
      const nextErrors: Errors = {};
      if (heightCm != null && (!Number.isFinite(heightCm) || heightCm < 80 || heightCm > 250)) nextErrors.heightCm = t('planningProfile.heightError');
      if (weightKg != null && (!Number.isFinite(weightKg) || weightKg < 25 || weightKg > 300)) nextErrors.weightKg = t('planningProfile.weightError');
      if (ageYears != null && (!Number.isInteger(ageYears) || ageYears < 10 || ageYears > 100)) nextErrors.ageYears = t('planningProfile.ageError');
      if (Object.keys(nextErrors).length) {
        setErrors(nextErrors);
        return;
      }
    }
    setSaving(true);
    setMessage('');
    try {
      if (save && (hasPlanningValues || dietary.length > 0 || dietaryCustom.trim())) {
        const dietaryLabels = dietary.map((option) => t(`onboarding.dietary.${option}` as any));
        const dietaryText = [...dietaryLabels, dietaryCustom.trim()].filter(Boolean).join('、').slice(0, 200);
        await data.savePlanningProfile({
          heightCm,
          weightKg,
          ageYears,
          dietaryRestrictions: dietaryText,
        });
      }
      await onFinish();
    } catch {
      setMessage(t('onboarding.profileSaveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const advance = saving ? undefined : step === 1 ? () => void saveIdentity() : () => void finish(true);
  const goBack = () => { if (!saving) { setMessage(''); setStep(1); } };
  const action = (
    <Press onPress={advance} accessibilityRole="button" style={[styles.footerAction, { backgroundColor: theme.accent, opacity: saving ? 0.65 : 1 }]}>
      {saving ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Text style={styles.footerActionLabel}>{step === 1 ? t('onboarding.next') : t('onboarding.finish')}</Text>}
    </Press>
  );
  const skip = (
    <Press
      onPress={saving ? undefined : step === 1 ? () => setStep(2) : () => void finish(false)}
      accessibilityRole="button"
      style={[styles.footerSkip, { backgroundColor: theme.surfaceTop, borderColor: theme.fieldBorder }]}
    >
      <Text style={[type.body, { color: theme.text2, fontWeight: '600' }]}>{step === 1 ? t('onboarding.skip') : t('onboarding.skipProfile')}</Text>
    </Press>
  );

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.screen}>
      <MePushPage theme={theme} title="" onBack={goBack} showBack={step === 2} showTitle={false} footer={<><View>{skip}</View><View>{action}</View></>}>
        <View style={styles.content}>
        {step === 1 ? (
          <>
            <View style={styles.formCard}>
              <View style={styles.avatarWrap}>
                <Press onPress={() => void pickAvatar()} accessibilityRole="button" accessibilityLabel={t('onboarding.chooseAvatar')} style={styles.avatarButton}>
                  <Avatar uri={avatarUri || data.profile.avatarUrl} size={96} style={{ backgroundColor: theme.fieldSurface }} />
                  <View style={[styles.cameraBadge, { backgroundColor: theme.surfaceTop, borderColor: theme.groupedBg }]}>
                    <Camera size={15} color={theme.text2} strokeWidth={2.2} />
                  </View>
                </Press>
              </View>

              <View style={styles.nicknameBlock}>
                <Text style={[type.eyebrow, { color: theme.text2 }]}>{t('onboarding.nickname')}</Text>
                <View style={[styles.nickField, { backgroundColor: theme.surfaceTop, borderColor: theme.fieldBorder }]}>
                  <TextInput
                    value={nick}
                    onChangeText={(value) => { setNick(value.slice(0, 24)); setMessage(''); }}
                    placeholder={t('onboarding.nicknamePlaceholder')}
                    placeholderTextColor={theme.text3}
                    returnKeyType="done"
                    maxLength={24}
                    style={[styles.nickInput, { color: theme.text }]}
                  />
                  <Press onPress={randomizeNick} accessibilityRole="button" accessibilityLabel={t('onboarding.random')} style={styles.randomButton}>
                    <Dices size={18} color={theme.text2} strokeWidth={2} />
                  </Press>
                </View>
              </View>

            </View>
          </>
        ) : (
          <View style={styles.outdoorFields}>
            <OptionalField theme={theme} label={t('planningProfile.height')} value={draft.heightCm} unit="cm" error={errors.heightCm} decimal onChange={(value) => updateNumeric('heightCm', value)} />
            <OptionalField theme={theme} label={t('planningProfile.weight')} value={draft.weightKg} unit="kg" error={errors.weightKg} decimal onChange={(value) => updateNumeric('weightKg', value)} />
            <OptionalField theme={theme} label={t('planningProfile.age')} value={draft.ageYears} unit={t('planningProfile.years')} error={errors.ageYears} onChange={(value) => updateNumeric('ageYears', value)} />
            <View style={styles.dietarySection}>
              <Text style={[type.eyebrow, { color: theme.text2 }]}>{t('onboarding.dietaryLabel')}</Text>
              <View style={styles.dietaryOptions}>
                {DIETARY_OPTIONS.map((option) => {
                  const selected = dietary.includes(option);
                  return (
                    <Press
                      key={option}
                      onPress={() => toggleDietary(option)}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: selected }}
                      style={[styles.dietaryChip, { backgroundColor: selected ? theme.accent : theme.surfaceTop, borderColor: selected ? theme.accent : theme.fieldBorder }]}
                    >
                      <Text style={[type.body, { color: selected ? '#FFFFFF' : theme.text2, fontWeight: selected ? '700' : '500' }]}>{t(`onboarding.dietary.${option}` as any)}</Text>
                    </Press>
                  );
                })}
              </View>
              <TextInput
                value={dietaryCustom}
                onChangeText={(value) => setDietaryCustom(value.slice(0, 200))}
                placeholder={t('onboarding.dietaryPlaceholder')}
                placeholderTextColor={theme.text3}
                maxLength={200}
                multiline
                textAlignVertical="top"
                style={[styles.dietaryInput, { backgroundColor: theme.surfaceTop, borderColor: theme.fieldBorder, color: theme.text }]}
              />
            </View>
          </View>
        )}
        {message ? <Text accessibilityRole="alert" style={[type.caption, styles.message, { color: theme.danger }]}>{message}</Text> : null}
        </View>
      </MePushPage>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  screen: { flex: 1 },
  content: { paddingHorizontal: layout.pagePadding, gap: space.md },
  formCard: { gap: space.xl },
  outdoorFields: { gap: space.xxl, paddingTop: space.md },
  dietarySection: { gap: space.sm, paddingTop: space.xs },
  dietaryOptions: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  dietaryChip: { minHeight: 40, paddingHorizontal: space.md, borderRadius: radius.pill, borderWidth: StyleSheet.hairlineWidth, alignItems: 'center', justifyContent: 'center' },
  dietaryInput: { minHeight: 96, paddingHorizontal: space.md, paddingVertical: space.sm, borderRadius: radius.card, borderWidth: StyleSheet.hairlineWidth, fontSize: 16 },
  avatarWrap: { alignItems: 'center', paddingVertical: space.md },
  avatarButton: { width: 104, height: 104, alignItems: 'center', justifyContent: 'center' },
  cameraBadge: { position: 'absolute', right: 0, bottom: 2, width: 27, height: 27, borderRadius: 14, borderWidth: 2.5, alignItems: 'center', justifyContent: 'center' },
  nicknameBlock: { gap: space.xs },
  nickField: { minHeight: 58, borderRadius: radius.card, borderWidth: StyleSheet.hairlineWidth, flexDirection: 'row', alignItems: 'center', paddingLeft: space.md, paddingRight: space.xs, gap: space.xs },
  nickInput: { flex: 1, minWidth: 0, minHeight: 56, paddingVertical: 0, fontSize: 17 },
  randomButton: { width: 42, height: 42, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  field: { minHeight: 58, paddingHorizontal: space.md, borderRadius: radius.card, borderWidth: StyleSheet.hairlineWidth, flexDirection: 'row', alignItems: 'center' },
  fieldInput: { flex: 1, minWidth: 0, minHeight: 56, paddingVertical: 0, fontSize: 17 },
  message: { textAlign: 'center', lineHeight: 18 },
  footerSkip: { minHeight: 44, minWidth: 92, paddingHorizontal: space.lg, borderRadius: radius.pill, borderWidth: StyleSheet.hairlineWidth, alignItems: 'center', justifyContent: 'center' },
  footerAction: { minWidth: 104, minHeight: 44, paddingHorizontal: space.lg, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  footerActionLabel: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
});
