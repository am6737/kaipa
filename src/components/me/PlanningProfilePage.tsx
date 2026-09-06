import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Text, TextInput, View } from 'react-native';
import type { Theme } from '../../theme/theme';
import { useI18n } from '../../i18n';
import { useData } from '../../data/DataContext';
import { useNav } from '../../nav/NavContext';
import type { UserPlanningProfile } from '../../hooks/usePlanningProfile';
import { AppCard, layout, radius, space, type } from '../../design-system';
import { Press } from '../Press';
import { MePushPage } from './MePushPage';

type NumericKey = 'heightCm' | 'weightKg' | 'ageYears';
type Draft = Record<NumericKey, string> & { dietaryRestrictions: string };
type Errors = Partial<Record<NumericKey, string>>;

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
      <View style={{ minHeight: 56, paddingHorizontal: space.md, borderRadius: radius.control, backgroundColor: theme.fieldSurface, borderWidth: error ? 1 : 0, borderColor: error ? theme.danger : 'transparent', flexDirection: 'row', alignItems: 'center' }}>
        <TextInput
          value={value}
          onChangeText={(text) => onChange(decimal ? text.replace(/[^\d.]/g, '').replace(/(\..*)\./g, '$1') : text.replace(/\D/g, ''))}
          keyboardType={decimal ? 'decimal-pad' : 'number-pad'}
          maxLength={decimal ? 6 : 3}
          placeholder="--"
          placeholderTextColor={theme.text3}
          accessibilityLabel={label}
          style={{ flex: 1, minWidth: 0, paddingVertical: space.md, fontSize: 17, color: theme.text }}
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

  useEffect(() => {
    if (!data.planningProfileLoading) setDraft(toDraft(data.planningProfile));
  }, [data.planningProfile, data.planningProfileLoading]);

  const setNumeric = (key: NumericKey, value: string) => {
    setDraft((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
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
      await data.savePlanningProfile({ heightCm, weightKg, ageYears, dietaryRestrictions: draft.dietaryRestrictions });
      nav.showToast(t('common.saved'));
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
      disabled={saving || data.planningProfileLoading}
      scaleTo={1}
      opacityTo={1}
      style={{ minWidth: 54, height: 34, paddingHorizontal: space.sm, borderRadius: radius.pill, backgroundColor: theme.accentSoft, alignItems: 'center', justifyContent: 'center', opacity: saving || data.planningProfileLoading ? 0.6 : 1 }}
    >
      {saving ? <ActivityIndicator size="small" color={theme.accent} /> : <Text style={{ fontSize: 13, fontWeight: '700', color: theme.accent }}>{t('common.done')}</Text>}
    </Press>
  );

  return (
    <MePushPage theme={theme} title={t('planningProfile.title')} onBack={onBack} right={done}>
      <View style={{ paddingHorizontal: layout.pagePadding, gap: space.xl }}>
        <Text style={[type.body, { color: theme.text2, lineHeight: 22 }]}>{t('planningProfile.description')}</Text>
        <AppCard theme={theme} radius={radius.feature} style={{ padding: space.md, gap: space.lg, borderWidth: 0 }}>
          <PlanningField theme={theme} label={t('planningProfile.height')} value={draft.heightCm} unit="cm" error={errors.heightCm} decimal onChange={(value) => setNumeric('heightCm', value)} />
          <PlanningField theme={theme} label={t('planningProfile.weight')} value={draft.weightKg} unit="kg" error={errors.weightKg} decimal onChange={(value) => setNumeric('weightKg', value)} />
          <PlanningField theme={theme} label={t('planningProfile.age')} value={draft.ageYears} unit={t('planningProfile.years')} error={errors.ageYears} onChange={(value) => setNumeric('ageYears', value)} />
          <View style={{ gap: space.xs }}>
            <Text style={[type.eyebrow, { color: theme.text3 }]}>{t('planningProfile.dietaryRestrictions')}</Text>
            <TextInput
              value={draft.dietaryRestrictions}
              onChangeText={(dietaryRestrictions) => setDraft((current) => ({ ...current, dietaryRestrictions: dietaryRestrictions.slice(0, 200) }))}
              placeholder={t('planningProfile.dietaryPlaceholder')}
              placeholderTextColor={theme.text3}
              multiline
              maxLength={200}
              textAlignVertical="top"
              style={{ minHeight: 116, padding: space.md, borderRadius: radius.control, backgroundColor: theme.fieldSurface, fontSize: 16, lineHeight: 22, color: theme.text }}
            />
          </View>
        </AppCard>
      </View>
    </MePushPage>
  );
}
