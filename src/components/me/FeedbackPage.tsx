// FeedbackPage.tsx — 帮助与反馈: category chips + free-text + 提交 in the nav bar.
// Mirrors the prototype FeedbackPage.
import React, { useState } from 'react';
import { View, Text, TextInput, StyleSheet } from 'react-native';
import { Theme } from '../../theme/theme';
import { useI18n, TKey } from '../../i18n';
import { MePushPage } from './MePushPage';
import { Press } from '../Press';
import { radius, space, type } from '../../design-system';

const CAT_KEYS: TKey[] = [
  'account.feedback.catFeature',
  'account.feedback.catBug',
  'account.feedback.catRoute',
  'account.feedback.catOther',
];

export function FeedbackPage({
  theme,
  onBack,
  onSubmit,
  initialCategory = 0,
}: {
  theme: Theme;
  onBack: () => void;
  onSubmit: () => void;
  initialCategory?: number;
}) {
  const { t } = useI18n();
  const [cat, setCat] = useState(initialCategory);
  const [val, setVal] = useState('');
  const canSubmit = val.trim().length > 0;
  const maxLength = 500;

  return (
    <MePushPage theme={theme} title={t('account.feedback.pageTitle')} onBack={onBack}>
      <View style={{ paddingHorizontal: space.xl, paddingTop: space.xs }}>
        <Text style={[type.eyebrow, { color: theme.text3, marginBottom: space.sm }]}>{t('account.feedback.pageTitle')}</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.xs, marginBottom: space.md }}>
          {CAT_KEYS.map((ck, i) => {
            const on = cat === i;
            return (
              <Press
                key={ck}
                onPress={() => setCat(i)}
                scaleTo={1}
                opacityTo={1}
                style={{
                  paddingHorizontal: space.md,
                  height: 38,
                  borderRadius: radius.pill,
                  backgroundColor: on ? theme.accent : '#FFFFFF',
                  borderWidth: StyleSheet.hairlineWidth,
                  borderColor: on ? theme.accent : theme.fieldBorder,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Text style={{ fontSize: 13, fontWeight: on ? '700' : '500', color: on ? '#FFFFFF' : theme.text2 }}>{t(ck)}</Text>
              </Press>
            );
          })}
        </View>
        <View style={{ backgroundColor: theme.surfaceTop, borderRadius: radius.feature, overflow: 'hidden' }}>
          <TextInput
            value={val}
            onChangeText={setVal}
            placeholder={t('account.feedback.placeholder')}
            placeholderTextColor={theme.text3}
            multiline
            maxLength={maxLength}
            style={{
              paddingHorizontal: space.md,
              paddingTop: space.md,
              paddingBottom: space.sm,
              fontSize: 15,
              color: theme.text,
              minHeight: 150,
              textAlignVertical: 'top',
            }}
          />
          <View style={{ minHeight: 48, paddingHorizontal: space.md, paddingBottom: space.sm, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' }}>
            <Text style={{ fontSize: 12, color: theme.text3 }}>{val.length}/{maxLength}</Text>
            <Press onPress={() => canSubmit && onSubmit()} scaleTo={1} opacityTo={1} style={{ minWidth: 58, height: 34, paddingHorizontal: space.sm, borderRadius: radius.pill, backgroundColor: canSubmit ? theme.accent : theme.fieldSurface, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: canSubmit ? '#FFFFFF' : theme.text3 }}>{t('account.feedback.submit')}</Text>
            </Press>
          </View>
        </View>
        <Text style={[type.caption, { color: theme.text3, paddingHorizontal: space.xs, paddingTop: space.sm, lineHeight: 18 }]}>
          {t('account.feedback.helper', { email: 'hi@kaipa.app' })}
        </Text>
      </View>
    </MePushPage>
  );
}
