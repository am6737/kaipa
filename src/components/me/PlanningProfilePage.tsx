import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TextInput, View } from 'react-native';
import { Check } from 'lucide-react-native';
import type { Theme } from '../../theme/theme';
import { useI18n } from '../../i18n';
import { useData } from '../../data/DataContext';
import { useNav } from '../../nav/NavContext';
import type { UserPlanningProfile } from '../../hooks/usePlanningProfile';
import { layout, radius, space, type } from '../../design-system';
import { Press } from '../Press';
import { MePushPage } from './MePushPage';

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

function PlanningField({
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
      <Text style={[type.eyebrow, { color: theme.text3 }]}>{label}</Text>
      <View style={{ minHeight: 58, paddingHorizontal: space.md, borderRadius: radius.card, backgroundColor: theme.surfaceTop, borderWidth: StyleSheet.hairlineWidth, borderColor: error ? theme.danger : theme.fieldBorder, flexDirection: 'row', alignItems: 'center' }}>
        <TextInput
          value={value}
          onChangeText={(text) => onChange(decimal ? text.replace(/[^\d.]/g, '').replace(/(\..*)\./g, '$1') : text.replace(/\D/g, ''))}
          keyboardType={decimal ? 'decimal-pad' : 'number-pad'}
          maxLength={decimal ? 6 : 3}
          placeholder="--"
          placeholderTextColor={theme.text3}
          accessibilityLabel={label}
          style={{ flex: 1, minWidth: 0, minHeight: 56, paddingVertical: 0, fontSize: 17, color: theme.text }}
        />
        <Text style={[type.caption, { color: theme.text2 }]}>{unit}</Text>
      </View>
      {error ? <Text style={[type.caption, { color: theme.danger }]}>{error}</Text> : null}
    </View>
  );
}

export function PlanningProfilePage({ theme, onBack }: { theme: Theme; onBack: () => void }) {
  const { t } = useI18n();
  const data = useData();
  const nav = useNav();
  const [draft, setDraft] = useState<Draft>(() => toDraft(data.planningProfile));
  const [errors, setErrors] = useState<Errors>({});
  const [saving, setSaving] = useState(false);
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
      scaleTo={1}
      opacityTo={1}
      style={{ width: layout.iconButton, height: layout.iconButton, alignItems: 'center', justifyContent: 'center', opacity: saving || data.planningProfileLoading || !hasChanges ? 0.45 : 1 }}
    >
      {saving ? <ActivityIndicator size="small" color={theme.accent} /> : <Check color={hasChanges ? theme.accent : theme.text3} size={25} strokeWidth={2.5} />}
    </Press>
  );

  return (
    <MePushPage theme={theme} title={t('planningProfile.title')} onBack={onBack} right={done}>
      <View style={{ paddingHorizontal: layout.pagePadding, gap: space.xl }}>
        <View style={{ gap: space.xl }}>
          <PlanningField theme={theme} label={t('planningProfile.height')} value={draft.heightCm} unit="cm" error={errors.heightCm} decimal onChange={(value) => setNumeric('heightCm', value)} />
          <PlanningField theme={theme} label={t('planningProfile.weight')} value={draft.weightKg} unit="kg" error={errors.weightKg} decimal onChange={(value) => setNumeric('weightKg', value)} />
          <PlanningField theme={theme} label={t('planningProfile.age')} value={draft.ageYears} unit={t('planningProfile.years')} error={errors.ageYears} onChange={(value) => setNumeric('ageYears', value)} />
          <View style={{ gap: space.sm }}>
            <Text style={[type.eyebrow, { color: theme.text3 }]}>{t('planningProfile.dietaryRestrictions')}</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.xs }}>
              {DIETARY_OPTIONS.map((option) => {
                const selected = dietarySelected.includes(option);
                return (
                  <Press key={option} onPress={() => toggleDietary(option)} accessibilityRole="checkbox" accessibilityState={{ checked: selected }} style={{ minHeight: 40, paddingHorizontal: space.md, borderRadius: radius.pill, borderWidth: StyleSheet.hairlineWidth, borderColor: selected ? theme.accent : theme.fieldBorder, backgroundColor: selected ? theme.accent : theme.surfaceTop, alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ fontSize: 14, fontWeight: selected ? '700' : '500', color: selected ? '#FFFFFF' : theme.text2 }}>{t(`onboarding.dietary.${option}` as any)}</Text>
                  </Press>
                );
              })}
            </View>
            <TextInput
              value={draft.dietaryRestrictions}
              onChangeText={(dietaryRestrictions) => setDraft((current) => ({ ...current, dietaryRestrictions: dietaryRestrictions.slice(0, 200) }))}
              placeholder={t('planningProfile.dietaryPlaceholder')}
              placeholderTextColor={theme.text3}
              maxLength={200}
              multiline
              textAlignVertical="top"
              style={{ minHeight: 96, paddingHorizontal: space.md, paddingVertical: space.sm, borderRadius: radius.card, borderWidth: StyleSheet.hairlineWidth, borderColor: theme.fieldBorder, backgroundColor: theme.surfaceTop, fontSize: 16, color: theme.text }}
            />
          </View>
        </View>
      </View>
    </MePushPage>
  );
}
