import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { Camera, Dices, MapPin } from 'lucide-react-native';
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
import { AppChoiceChip, AppFieldCard, AppQuestionHeader, AppTextArea, layout, radius, space, type } from '../design-system';
import { useI18n } from '../i18n';
import { MePushPage } from '../components/me/MePushPage';
import type { Theme } from '../theme/theme';
import { PlanningMetricPage } from '../components/me/PlanningMetricPage';
import { PlanningWeightPage } from '../components/me/PlanningWeightPage';

const STORAGE_PREFIX = 'kaipa_onboarding_v1:';
const ZH_ADJECTIVES = ['清风', '星河', '云端', '松林', '晨雾', '远峰', '溪谷'];
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

export function OnboardingGate({ theme, children }: { theme: Theme; children: React.ReactNode }) {
  const data = useData();
  const [checking, setChecking] = useState(true);

  // 完成标记以服务端 profiles.onboarded_at 为准，跟随账号而不是设备。旧版把
  // 标记存在本机 AsyncStorage 里，这里只做一次回填（读到旧标记就写库），
  // 回填失败不影响本次登录：最多再走一遍引导。
  useEffect(() => {
    let active = true;
    if (data.profileLoading) return;
    if (data.profile.onboardedAt) {
      setChecking(false);
      return;
    }
    AsyncStorage.getItem(`${STORAGE_PREFIX}${data.userId}`)
      .then(async (value) => {
        if (active && value === 'complete') await data.completeOnboarding();
      })
      .catch(() => {})
      .finally(() => {
        if (active) setChecking(false);
      });
    return () => { active = false; };
  }, [data.userId, data.profileLoading, data.profile.onboardedAt, data.completeOnboarding]);

  if (checking || data.profileLoading || data.planningProfileLoading) {
    return <View style={[styles.loading, { backgroundColor: theme.bg }]}><ActivityIndicator color={theme.accent} /></View>;
  }
  // Offline with nothing cached we cannot tell a new account from an old one;
  // let them in rather than replay onboarding, which needs the network anyway.
  if (data.profile.onboardedAt || data.profileStale) return <>{children}</>;

  const finish = async () => {
    await data.completeOnboarding();
  };
  return <OnboardingFlow theme={theme} onFinish={finish} />;
}

type OnboardingStep = 1 | 2 | 3 | 'location';
const STEP_COUNT = 3;

function OnboardingFlow({ theme, onFinish }: { theme: Theme; onFinish: () => Promise<void> }) {
  const { t, resolved } = useI18n();
  const data = useData();
  const [step, setStep] = useState<OnboardingStep>(1);
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
  const [editingMetric, setEditingMetric] = useState<NumericKey | null>(null);
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

  // 「稍后再说」也会保存已经输入的昵称和头像，免得用户填了一半跳过就丢掉。
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

  const parsed = () => ({
    heightCm: draft.heightCm.trim() ? Number(draft.heightCm) : null,
    weightKg: draft.weightKg.trim() ? Number(draft.weightKg) : null,
    ageYears: draft.ageYears.trim() ? Number(draft.ageYears) : null,
  });

  const validateBody = () => {
    const { heightCm, weightKg, ageYears } = parsed();
    const nextErrors: Errors = {};
    if (heightCm != null && (!Number.isFinite(heightCm) || heightCm < 80 || heightCm > 250)) nextErrors.heightCm = t('planningProfile.heightError');
    if (weightKg != null && (!Number.isFinite(weightKg) || weightKg < 25 || weightKg > 300)) nextErrors.weightKg = t('planningProfile.weightError');
    if (ageYears != null && (!Number.isInteger(ageYears) || ageYears < 10 || ageYears > 100)) nextErrors.ageYears = t('planningProfile.ageError');
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  // 定位已授权（或被系统永久拒绝、不能再弹窗）时不必再出说明页。
  const needsLocationPrimer = async () => {
    try {
      const permission = await Location.getForegroundPermissionsAsync();
      return !permission.granted && permission.canAskAgain;
    } catch {
      return false;
    }
  };

  const finishProfile = async (withDietary: boolean) => {
    const { heightCm, weightKg, ageYears } = parsed();
    setSaving(true);
    setMessage('');
    try {
      const dietaryLabels = withDietary ? dietary.map((option) => t(`onboarding.dietary.${option}` as any)) : [];
      const dietaryText = [...dietaryLabels, withDietary ? dietaryCustom.trim() : ''].filter(Boolean).join('、').slice(0, 200);
      if (hasPlanningValues || dietaryText) {
        await data.savePlanningProfile({ heightCm, weightKg, ageYears, dietaryRestrictions: dietaryText });
      }
      if (await needsLocationPrimer()) setStep('location');
      else await onFinish();
    } catch {
      setMessage(t('onboarding.profileSaveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const finishLocation = async (ask: boolean) => {
    setSaving(true);
    try {
      if (ask) await Location.requestForegroundPermissionsAsync().catch(() => null);
      await onFinish();
    } finally {
      setSaving(false);
    }
  };

  const goBack = () => {
    if (saving) return;
    setMessage('');
    if (step === 2) setStep(1);
    else if (step === 3) setStep(2);
  };

  const run = (fn: () => void) => (saving ? undefined : fn);
  let actionLabel: string;
  let onAction: (() => void) | undefined;
  let skipLabel: string;
  let onSkip: (() => void) | undefined;
  if (step === 1) {
    actionLabel = t('onboarding.next');
    onAction = run(() => void saveIdentity());
    skipLabel = t('onboarding.later');
    onSkip = onAction;
  } else if (step === 2) {
    actionLabel = t('onboarding.next');
    onAction = run(() => { if (validateBody()) setStep(3); });
    skipLabel = t('onboarding.later');
    onSkip = run(() => { setErrors({}); setStep(3); });
  } else if (step === 3) {
    actionLabel = t('onboarding.finish');
    onAction = run(() => void finishProfile(true));
    skipLabel = t('onboarding.noDietary');
    onSkip = run(() => void finishProfile(false));
  } else {
    actionLabel = t('onboarding.locationAllow');
    onAction = run(() => void finishLocation(true));
    skipLabel = t('onboarding.locationLater');
    onSkip = run(() => void finishLocation(false));
  }

  const action = (
    <Press onPress={onAction} accessibilityRole="button" style={[styles.footerAction, { backgroundColor: theme.accent, opacity: saving ? 0.65 : 1 }]}>
      {saving ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Text style={styles.footerActionLabel}>{actionLabel}</Text>}
    </Press>
  );
  const skip = (
    <Press onPress={onSkip} accessibilityRole="button" style={[styles.footerSkip, { backgroundColor: theme.surfaceTop, borderColor: theme.fieldBorder }]}>
      <Text style={[type.body, { color: theme.text2, fontWeight: '600' }]}>{skipLabel}</Text>
    </Press>
  );

  const header = step === 1
    ? { title: t('onboarding.identityTitle'), sub: t('onboarding.identitySub') }
    : step === 2
      ? { title: t('onboarding.bodyTitle'), sub: t('onboarding.bodySub') }
      : step === 3
        ? { title: t('onboarding.dietaryTitle'), sub: t('onboarding.dietarySub') }
        : { title: t('onboarding.locationTitle'), sub: t('onboarding.locationSub') };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.screen}>
      <MePushPage theme={theme} title="" onBack={goBack} showBack={step === 2 || step === 3} showTitle={false} center={step !== 'location' ? (
        <View style={styles.progress} accessible accessibilityLabel={`${step} / ${STEP_COUNT}`}>
          {Array.from({ length: STEP_COUNT }, (_, index) => (
            <View key={index} style={[styles.progressSegment, { backgroundColor: index < step ? theme.accent : theme.fieldBorder }]} />
          ))}
        </View>
      ) : undefined} footer={<><View>{skip}</View><View>{action}</View></>}>
        <View style={styles.content}>
          <AppQuestionHeader theme={theme} question={header.title} description={header.sub} />

          {step === 1 ? (
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
          ) : step === 2 ? (
            <View style={styles.outdoorFields}>
              <AppFieldCard theme={theme} label={t('planningProfile.height')} description={t('planningProfile.heightHint')} value={draft.heightCm} unit="cm" error={errors.heightCm} decimal onChange={(value) => updateNumeric('heightCm', value)} onOpen={() => setEditingMetric('heightCm')} />
              <AppFieldCard theme={theme} label={t('planningProfile.weight')} description={t('planningProfile.weightHint')} value={draft.weightKg} unit="kg" error={errors.weightKg} decimal onChange={(value) => updateNumeric('weightKg', value)} onOpen={() => setEditingMetric('weightKg')} />
              <AppFieldCard theme={theme} label={t('planningProfile.age')} description={t('planningProfile.ageHint')} value={draft.ageYears} unit={t('planningProfile.years')} error={errors.ageYears} onChange={(value) => updateNumeric('ageYears', value)} onOpen={() => setEditingMetric('ageYears')} />
            </View>
          ) : step === 3 ? (
            <View style={styles.dietarySection}>
              <View style={styles.dietaryOptions}>
                {DIETARY_OPTIONS.map((option) => (
                  <AppChoiceChip key={option} theme={theme} label={t(`onboarding.dietary.${option}` as any)} selected={dietary.includes(option)} onPress={() => toggleDietary(option)} />
                ))}
              </View>
              <AppTextArea
                theme={theme}
                value={dietaryCustom}
                onChangeText={(value) => setDietaryCustom(value.slice(0, 200))}
                placeholder={t('onboarding.dietaryPlaceholder')}
                maxLength={200}
              />
            </View>
          ) : (
            <View style={styles.permissionRow}>
              <View style={[styles.permissionIcon, { backgroundColor: theme.accentSoft }]}>
                <MapPin size={20} color={theme.accent} strokeWidth={2.2} />
              </View>
              <View style={{ flex: 1, minWidth: 0, gap: space.xxs }}>
                <Text style={[type.body, { color: theme.text, fontWeight: '700' }]}>{t('onboarding.locationItem')}</Text>
                <Text style={[type.caption, { color: theme.text2 }]}>{t('onboarding.locationDetail')}</Text>
              </View>
            </View>
          )}
          {message ? <Text accessibilityRole="alert" style={[type.caption, styles.message, { color: theme.danger }]}>{message}</Text> : null}
        </View>
      </MePushPage>
      {editingMetric === 'weightKg' ? <PlanningWeightPage theme={theme} value={draft.weightKg} onBack={(value) => { updateNumeric('weightKg', value); setEditingMetric(null); }} /> : editingMetric ? <PlanningMetricPage key={editingMetric} theme={theme} metric={editingMetric} value={draft[editingMetric]} onBack={(value) => { updateNumeric(editingMetric, value); setEditingMetric(null); }} /> : null}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  screen: { flex: 1 },
  content: { paddingHorizontal: layout.pagePadding, gap: space.xxl },
  progress: { flexDirection: 'row', gap: 5 },
  progressSegment: { width: 18, height: 4, borderRadius: radius.pill },
  permissionRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  permissionIcon: { width: 44, height: 44, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  formCard: { gap: space.xl },
  outdoorFields: { gap: space.md },
  dietarySection: { gap: space.lg },
  dietaryOptions: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  avatarWrap: { alignItems: 'center', paddingVertical: space.md },
  avatarButton: { width: 104, height: 104, alignItems: 'center', justifyContent: 'center' },
  cameraBadge: { position: 'absolute', right: 0, bottom: 2, width: 27, height: 27, borderRadius: 14, borderWidth: 2.5, alignItems: 'center', justifyContent: 'center' },
  nicknameBlock: { gap: space.xs },
  nickField: { minHeight: 58, borderRadius: radius.card, borderWidth: StyleSheet.hairlineWidth, flexDirection: 'row', alignItems: 'center', paddingLeft: space.md, paddingRight: space.xs, gap: space.xs },
  nickInput: { flex: 1, minWidth: 0, minHeight: 56, paddingVertical: 0, fontSize: 17 },
  randomButton: { width: 42, height: 42, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  message: { textAlign: 'center', lineHeight: 18 },
  footerSkip: { minHeight: 44, minWidth: 92, paddingHorizontal: space.lg, borderRadius: radius.pill, borderWidth: StyleSheet.hairlineWidth, alignItems: 'center', justifyContent: 'center' },
  footerAction: { minWidth: 104, minHeight: 44, paddingHorizontal: space.lg, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  footerActionLabel: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
});
