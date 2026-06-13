// EditJourneySheet.tsx — 编辑旅程信息: edit a journey's name / region / 行程 / 简介.
// Opened from the journey detail's 更多 menu; saves back through nav.patchCurrent
// so the open card, the discover sheet and the memory list all update live.
import React, { useState } from 'react';
import { View, Text, TextInput, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native';
import { Theme } from '../../theme/theme';
import { Poi } from '../../data/pois';
import { JourneyPatch } from '../../nav/NavContext';
import { Press } from '../Press';
import { FullOverlay } from './FullOverlay';
import { useI18n } from '../../i18n';

function Group({ theme, title, footer, children }: { theme: Theme; title?: string; footer?: string; children: React.ReactNode }) {
  return (
    <View>
      {title ? (
        <Text style={{ fontSize: 12, fontWeight: '700', color: theme.text3, letterSpacing: 0.6, marginBottom: 9, marginLeft: 4 }}>{title}</Text>
      ) : null}
      <View
        style={{
          borderRadius: 16,
          overflow: 'hidden',
          backgroundColor: theme.dark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.02)',
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: theme.hairline,
        }}
      >
        {children}
      </View>
      {footer ? <Text style={{ fontSize: 11.5, color: theme.text3, lineHeight: 17, marginTop: 9, marginLeft: 6 }}>{footer}</Text> : null}
    </View>
  );
}

function Field({
  theme,
  label,
  value,
  onChange,
  placeholder,
  multiline,
  last,
}: {
  theme: Theme;
  label?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  multiline?: boolean;
  last?: boolean;
}) {
  return (
    <>
      <View
        style={{
          flexDirection: multiline ? 'column' : 'row',
          alignItems: multiline ? 'stretch' : 'center',
          paddingHorizontal: 14,
          paddingVertical: multiline ? 13 : 0,
          minHeight: 52,
        }}
      >
        {label ? <Text style={{ width: multiline ? undefined : 72, fontSize: 14.5, color: theme.text2 }}>{label}</Text> : null}
        <TextInput
          value={value}
          onChangeText={onChange}
          placeholder={placeholder}
          placeholderTextColor={theme.text3}
          multiline={multiline}
          style={{
            flex: multiline ? undefined : 1,
            fontSize: 15.5,
            color: theme.text,
            padding: 0,
            minHeight: multiline ? 84 : undefined,
            lineHeight: multiline ? 22 : undefined,
            textAlignVertical: multiline ? 'top' : 'center',
          }}
        />
      </View>
      {!last ? <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: theme.hairline, marginLeft: 14 }} /> : null}
    </>
  );
}

export function EditJourneySheet({
  theme,
  poi,
  onClose,
  onSave,
}: {
  theme: Theme;
  poi: Poi;
  onClose: () => void;
  onSave: (patch: JourneyPatch) => void;
}) {
  const { t } = useI18n();
  const [name, setName] = useState(poi.name || '');
  const [region, setRegion] = useState(poi.region || '');
  const [days, setDays] = useState(poi.days || '');
  const [date, setDate] = useState(poi.date || '');
  const [planned, setPlanned] = useState(poi.plannedDate || '');
  const [desc, setDesc] = useState(poi.desc || '');
  const isPlanning = poi.status === 'planning';

  const dirty =
    name.trim() !== (poi.name || '') ||
    region.trim() !== (poi.region || '') ||
    days.trim() !== (poi.days || '') ||
    date.trim() !== (poi.date || '') ||
    planned.trim() !== (poi.plannedDate || '') ||
    desc.trim() !== (poi.desc || '');
  const canSave = name.trim().length > 0 && dirty;

  const save = () => {
    if (!canSave) {
      onClose();
      return;
    }
    const patch: JourneyPatch = {
      name: name.trim(),
      region: region.trim(),
      days: days.trim(),
      desc: desc.trim(),
    };
    if (isPlanning) patch.plannedDate = planned.trim();
    else patch.date = date.trim();
    onSave(patch);
  };

  const rightAction = (
    <Press onPress={save} disabled={!canSave} style={{ paddingHorizontal: 4 }}>
      <Text style={{ fontSize: 16, fontWeight: '700', color: canSave ? theme.accent : theme.text3 }}>{t('common.save')}</Text>
    </Press>
  );

  return (
    <FullOverlay theme={theme} title={t('journeyEdit.editTitle')} subtitle={poi.name} onClose={onClose} rightAction={rightAction} zIndex={160}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={{ padding: 16, gap: 22 }}>
          <Group theme={theme} title={t('journeyEdit.sectionBasic')}>
            <Field theme={theme} label={t('journeyEdit.fieldName')} value={name} onChange={setName} placeholder={t('journeyEdit.placeholderName')} />
            <Field theme={theme} label={t('journeyEdit.fieldRegion')} value={region} onChange={setRegion} placeholder={t('journeyEdit.placeholderRegion')} last />
          </Group>

          <Group theme={theme} title={t('journeyEdit.sectionItinerary')}>
            <Field theme={theme} label={t('journeyEdit.fieldDays')} value={days} onChange={setDays} placeholder={t('journeyEdit.placeholderDays')} />
            {isPlanning ? (
              <Field theme={theme} label={t('journeyEdit.fieldPlannedStart')} value={planned} onChange={setPlanned} placeholder={t('journeyEdit.placeholderPlannedStart')} last />
            ) : (
              <Field theme={theme} label={t('journeyEdit.fieldDate')} value={date} onChange={setDate} placeholder={t('journeyEdit.placeholderDate')} last />
            )}
          </Group>

          <Group theme={theme} title={t('journeyEdit.sectionDesc')} footer={t('journeyEdit.descFooter')}>
            <Field theme={theme} value={desc} onChange={setDesc} placeholder={t('journeyEdit.placeholderDesc')} multiline last />
          </Group>
        </View>
      </KeyboardAvoidingView>
    </FullOverlay>
  );
}
