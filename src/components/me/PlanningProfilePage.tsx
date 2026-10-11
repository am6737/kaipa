import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Keyboard, StyleSheet, Text, View } from 'react-native';
import { Check } from 'lucide-react-native';
import type { Theme } from '../../theme/theme';
import { useI18n } from '../../i18n';
import { useData } from '../../data/DataContext';
import { useNav } from '../../nav/NavContext';
import type { UserPlanningProfile } from '../../hooks/usePlanningProfile';
import { AppChoiceChip, AppFieldCard, AppTextArea, layout, radius, space, type } from '../../design-system';
import { Press } from '../Press';
import { MePushPage } from './MePushPage';
import { PlanningMetricPage } from './PlanningMetricPage';
import { PlanningWeightPage } from './PlanningWeightPage';

type NumericKey = 'heightCm' | 'weightKg' | 'ageYears';
type Draft = Record<NumericKey, string> & { dietaryRestrictions: string };
type Errors = Partial<Record<NumericKey, string>>;
type DietaryOption = 'vegetarian' | 'noBeef' | 'noPork' | 'seafoodAllergy' | 'peanutAllergy' | 'lactoseIntolerant' | 'glutenFree' | 'halal' | 'lowSalt';
const DIETARY_OPTIONS: DietaryOption[] = ['vegetarian', 'noBeef', 'noPork', 'seafoodAllergy', 'peanutAllergy', 'lactoseIntolerant', 'glutenFree', 'halal', 'lowSalt'];

function toDraft(profile: UserPlanningProfile): Draft {
  return {
    heightCm: profile.heightCm == null ? '' : String(profile.heightCm),
    weightKg: profile.weightKg == null ? '' : String(profile.weightKg),
    ageYears: profile.ageYears == null ? '' : String(profile.ageYears),
    dietaryRestrictions: profile.dietaryRestrictions,
  };
}

function optionalNumber(value: string) {
  return value.trim() ? Number(value) : null;
}

export function PlanningProfilePage({ theme, onBack }: { theme: Theme; onBack: () => void }) {
  const { t } = useI18n();
  const data = useData();
  const nav = useNav();
  const [draft, setDraft] = useState<Draft>(() => toDraft(data.planningProfile));
  const [errors, setErrors] = useState<Errors>({});
  const [saving, setSaving] = useState(false);
  const [editingMetric, setEditingMetric] = useState<NumericKey | null>(null);
  const [dietarySelected, setDietarySelected] = useState<DietaryOption[]>([]);
  const initialDraft = toDraft(data.planningProfile);
  const hasChanges = dietarySelected.length > 0 || (Object.keys(initialDraft) as (keyof Draft)[]).some((key) => draft[key] !== initialDraft[key]);

  useEffect(() => {
    if (!data.planningProfileLoading) setDraft(toDraft(data.planningProfile));
  }, [data.planningProfile, data.planningProfileLoading]);

  const setNumeric = (key: NumericKey, value: string) => {
    setDraft((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
  };

  const toggleDietary = (option: DietaryOption) => {
    setDietarySelected((current) => {
      if (current.includes(option)) return current.filter((item) => item !== option);
      return [...current, option];
    });
  };

  const save = async () => {
    const heightCm = optionalNumber(draft.heightCm);
    const weightKg = optionalNumber(draft.weightKg);
    const ageYears = optionalNumber(draft.ageYears);
    const nextErrors: Errors = {};
    if (heightCm != null && (!Number.isFinite(heightCm) || heightCm < 80 || heightCm > 250)) nextErrors.heightCm = t('planningProfile.heightError');
    if (weightKg != null && (!Number.isFinite(weightKg) || weightKg < 25 || weightKg > 300)) nextErrors.weightKg = t('planningProfile.weightError');
    if (ageYears != null && (!Number.isInteger(ageYears) || ageYears < 10 || ageYears > 100)) nextErrors.ageYears = t('planningProfile.ageError');
    if (Object.keys(nextErrors).length) {
      setErrors(nextErrors);
      return;
    }

    setSaving(true);
    try {
      const selectedLabels = dietarySelected.map((option) => t(`onboarding.dietary.${option}` as any));
      await data.savePlanningProfile({ heightCm, weightKg, ageYears, dietaryRestrictions: [...selectedLabels, draft.dietaryRestrictions.trim()].filter(Boolean).join('、').slice(0, 200) });
      onBack();
    } catch {
      nav.showToast(t('planningProfile.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const done = (
    <Press
      onPress={() => void save()}
      disabled={saving || data.planningProfileLoading || !hasChanges}
      accessibilityRole="button"
      accessibilityLabel={t('common.save')}
      style={{ width: layout.iconButton, height: layout.iconButton, alignItems: 'center', justifyContent: 'center', opacity: saving || data.planningProfileLoading || !hasChanges ? 0.45 : 1 }}
    >
      {saving ? <ActivityIndicator size="small" color={theme.accent} /> : <Check color={hasChanges ? theme.accent : theme.text3} size={25} strokeWidth={2.5} />}
    </Press>
  );

  return (
    <>
      <MePushPage theme={theme} title={t('planningProfile.title')} onBack={onBack} right={done}>
        <View style={styles.content}>
          <AppFieldCard theme={theme} label={t('planningProfile.height')} description={t('planningProfile.heightHint')} value={draft.heightCm} unit="cm" error={errors.heightCm} decimal onChange={(value) => setNumeric('heightCm', value)} onOpen={() => { Keyboard.dismiss(); setEditingMetric('heightCm'); }} />
          <AppFieldCard theme={theme} label={t('planningProfile.weight')} description={t('planningProfile.weightHint')} value={draft.weightKg} unit="kg" error={errors.weightKg} decimal onChange={(value) => setNumeric('weightKg', value)} onOpen={() => { Keyboard.dismiss(); setEditingMetric('weightKg'); }} />
          <AppFieldCard theme={theme} label={t('planningProfile.age')} description={t('planningProfile.ageHint')} value={draft.ageYears} unit={t('planningProfile.years')} error={errors.ageYears} onChange={(value) => setNumeric('ageYears', value)} onOpen={() => { Keyboard.dismiss(); setEditingMetric('ageYears'); }} />
          <View style={[styles.card, { backgroundColor: theme.surfaceTop, gap: space.md }]}>
            <Text style={[type.fieldLabel, { color: theme.text }]}>{t('planningProfile.dietaryRestrictions')}</Text>
            <View style={styles.options}>
              {DIETARY_OPTIONS.map((option) => (
                <AppChoiceChip key={option} theme={theme} label={t(`onboarding.dietary.${option}` as any)} selected={dietarySelected.includes(option)} onPress={() => toggleDietary(option)} />
              ))}
            </View>
            <AppTextArea
              theme={theme}
              value={draft.dietaryRestrictions}
              onChangeText={(dietaryRestrictions) => setDraft((current) => ({ ...current, dietaryRestrictions: dietaryRestrictions.slice(0, 200) }))}
              placeholder={t('planningProfile.dietaryPlaceholder')}
              accessibilityLabel={t('planningProfile.dietaryRestrictions')}
              maxLength={200}
            />
          </View>
          <Text style={[type.hint, styles.hint, { color: theme.text2 }]}>{t('planningProfile.emptyHint')}</Text>
        </View>
      </MePushPage>
      {editingMetric === 'weightKg' ? <PlanningWeightPage theme={theme} value={draft.weightKg} onBack={(value) => { setNumeric('weightKg', value); setEditingMetric(null); }} /> : editingMetric ? <PlanningMetricPage key={editingMetric} theme={theme} metric={editingMetric} value={draft[editingMetric]} onBack={(value) => { setNumeric(editingMetric, value); setEditingMetric(null); }} /> : null}
    </>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: layout.pagePadding, paddingTop: space.xl, gap: space.sm },
  // Same shell as AppFieldCard, for the card that groups several controls.
  card: { borderRadius: radius.showcase, paddingHorizontal: space.lg, paddingVertical: space.md, borderWidth: 1, borderColor: 'transparent' },
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  hint: { paddingHorizontal: space.lg, paddingTop: space.xs },
});
