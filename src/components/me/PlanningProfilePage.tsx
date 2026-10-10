import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Keyboard, StyleSheet, Text, TextInput, View } from 'react-native';
import { Check, ChevronRight } from 'lucide-react-native';
import type { Theme } from '../../theme/theme';
import { useI18n } from '../../i18n';
import { useData } from '../../data/DataContext';
import { useNav } from '../../nav/NavContext';
import type { UserPlanningProfile } from '../../hooks/usePlanningProfile';
import { layout, radius, space } from '../../design-system';
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

function PlanningField({
  theme,
  label,
  value,
  description,
  unit,
  error,
  decimal,
  onChange,
  onOpen,
}: {
  theme: Theme;
  label: string;
  value: string;
  description: string;
  unit: string;
  error?: string;
  decimal?: boolean;
  onChange: (value: string) => void;
  onOpen?: () => void;
}) {
  const input = useRef<TextInput>(null);
  const [focused, setFocused] = useState(false);
  return (
    <Press accessible={!!onOpen} accessibilityRole={onOpen ? 'button' : undefined} accessibilityLabel={onOpen ? `${label} ${value || '--'} ${unit}` : undefined} onPress={onOpen ?? (() => input.current?.focus())} style={[styles.card, {
      backgroundColor: theme.surfaceTop,
      borderColor: error ? theme.danger : focused ? theme.accent : 'transparent',
    }]}>
      <View style={styles.fieldRow}>
        <Text style={[styles.label, { color: theme.text, flex: 1 }]}>{label}</Text>
        <View style={styles.valueRow}>
          {onOpen ? <Text style={[styles.displayValue, { color: value ? theme.text : theme.text3 }]}>{value || '--'}</Text> : <TextInput
            ref={input}
            value={value}
            onChangeText={(text) => onChange(decimal ? text.replace(/[^\d.]/g, '').replace(/(\..*)\./g, '$1') : text.replace(/\D/g, ''))}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            keyboardType={decimal ? 'decimal-pad' : 'number-pad'}
            maxLength={decimal ? 6 : 3}
            placeholder="--"
            placeholderTextColor={theme.text3}
            accessibilityLabel={`${label} (${unit})`}
            selectionColor={theme.accent}
            style={[styles.valueInput, { color: theme.text }]}
          />}
          <Text style={[styles.unit, { color: theme.text }]}>{unit}</Text>
          <ChevronRight size={18} color={theme.text3} />
        </View>
      </View>
      <Text style={[styles.description, { color: theme.text2 }]}>{description}</Text>
      {error ? <Text accessibilityRole="alert" style={[styles.description, { color: theme.danger }]}>{error}</Text> : null}
    </Press>
  );
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
          <PlanningField theme={theme} label={t('planningProfile.height')} description={t('planningProfile.heightHint')} value={draft.heightCm} unit="cm" error={errors.heightCm} decimal onChange={(value) => setNumeric('heightCm', value)} onOpen={() => { Keyboard.dismiss(); setEditingMetric('heightCm'); }} />
          <PlanningField theme={theme} label={t('planningProfile.weight')} description={t('planningProfile.weightHint')} value={draft.weightKg} unit="kg" error={errors.weightKg} decimal onChange={(value) => setNumeric('weightKg', value)} onOpen={() => { Keyboard.dismiss(); setEditingMetric('weightKg'); }} />
          <PlanningField theme={theme} label={t('planningProfile.age')} description={t('planningProfile.ageHint')} value={draft.ageYears} unit={t('planningProfile.years')} error={errors.ageYears} onChange={(value) => setNumeric('ageYears', value)} onOpen={() => { Keyboard.dismiss(); setEditingMetric('ageYears'); }} />
          <View style={[styles.card, { backgroundColor: theme.surfaceTop, borderColor: 'transparent', gap: space.md }]}>
            <Text style={[styles.label, { color: theme.text }]}>{t('planningProfile.dietaryRestrictions')}</Text>
            <View style={styles.options}>
              {DIETARY_OPTIONS.map((option) => {
                const selected = dietarySelected.includes(option);
                return (
                  <Press key={option} onPress={() => toggleDietary(option)} accessibilityRole="checkbox" accessibilityState={{ checked: selected }} style={[styles.option, { backgroundColor: selected ? theme.accent : theme.fieldSurface, borderColor: selected ? theme.accent : 'transparent' }]}>
                    <Text style={[styles.optionText, { color: selected ? '#FFFFFF' : theme.text2 }]}>{t(`onboarding.dietary.${option}` as any)}</Text>
                  </Press>
                );
              })}
            </View>
            <TextInput
              value={draft.dietaryRestrictions}
              onChangeText={(dietaryRestrictions) => setDraft((current) => ({ ...current, dietaryRestrictions: dietaryRestrictions.slice(0, 200) }))}
              placeholder={t('planningProfile.dietaryPlaceholder')}
              placeholderTextColor={theme.text2}
              accessibilityLabel={t('planningProfile.dietaryRestrictions')}
              selectionColor={theme.accent}
              maxLength={200}
              multiline
              textAlignVertical="top"
              style={[styles.dietaryInput, { backgroundColor: theme.fieldSurface, color: theme.text }]}
            />
          </View>
          <Text style={[styles.description, styles.hint, { color: theme.text2 }]}>{t('planningProfile.emptyHint')}</Text>
        </View>
      </MePushPage>
      {editingMetric === 'weightKg' ? <PlanningWeightPage theme={theme} value={draft.weightKg} onBack={(value) => { setNumeric('weightKg', value); setEditingMetric(null); }} /> : editingMetric ? <PlanningMetricPage key={editingMetric} theme={theme} metric={editingMetric} value={draft[editingMetric]} onBack={(value) => { setNumeric(editingMetric, value); setEditingMetric(null); }} /> : null}
    </>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: layout.pagePadding, paddingTop: space.xl, gap: space.sm },
  card: { borderRadius: radius.showcase, paddingHorizontal: space.lg, paddingVertical: space.md, borderWidth: 1 },
  fieldRow: { minHeight: layout.fieldHeight, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.xs },
  label: { fontSize: 17, fontWeight: '600' },
  valueRow: { flexDirection: 'row', alignItems: 'center', gap: space.xs, flexShrink: 1, transform: [{ translateY: 6 }] },
  valueInput: { width: 78, minHeight: layout.fieldHeight, paddingVertical: 0, fontSize: 21, fontWeight: '600', textAlign: 'right', fontVariant: ['tabular-nums'] },
  displayValue: { minHeight: layout.fieldHeight, lineHeight: layout.fieldHeight, fontSize: 21, fontWeight: '600', fontVariant: ['tabular-nums'] },
  unit: { fontSize: 17, fontWeight: '600' },
  description: { fontSize: 12, lineHeight: 19 },
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  option: { borderWidth: 1, minHeight: layout.fieldHeight, paddingHorizontal: space.md, paddingVertical: space.sm, borderRadius: radius.card, alignItems: 'center', justifyContent: 'center', flexGrow: 1 },
  optionText: { fontSize: 14, fontWeight: '600' },
  dietaryInput: { minHeight: 92, paddingHorizontal: space.md, paddingVertical: space.sm, borderRadius: radius.card, fontSize: 14, lineHeight: 22 },
  hint: { paddingHorizontal: space.lg, paddingTop: space.xs },
});
