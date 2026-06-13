// FeedbackPage.tsx — 帮助与反馈: category chips + free-text + 提交 in the nav bar.
// Mirrors the prototype FeedbackPage.
import React, { useState } from 'react';
import { View, Text, TextInput, StyleSheet } from 'react-native';
import { Theme } from '../../theme/theme';
import { useI18n, TKey } from '../../i18n';
import { MePushPage } from './MePushPage';
import { Press } from '../Press';

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
}: {
  theme: Theme;
  onBack: () => void;
  onSubmit: () => void;
}) {
  const { t } = useI18n();
  const [cat, setCat] = useState(0);
  const [val, setVal] = useState('');
  const canSubmit = val.trim().length > 0;

  const submit = (
    <Press onPress={() => canSubmit && onSubmit()} style={{ paddingHorizontal: 8, paddingVertical: 8 }}>
      <Text style={{ fontSize: 16, fontWeight: '600', color: canSubmit ? theme.accent : theme.text3 }}>{t('account.feedback.submit')}</Text>
    </Press>
  );

  return (
    <MePushPage theme={theme} title={t('account.feedback.pageTitle')} onBack={onBack} right={submit}>
      <View style={{ paddingHorizontal: 16, paddingTop: 12 }}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
          {CAT_KEYS.map((ck, i) => {
            const on = cat === i;
            return (
              <Press
                key={ck}
                onPress={() => setCat(i)}
                style={{
                  paddingHorizontal: 14,
                  paddingVertical: 7,
                  borderRadius: 999,
                  backgroundColor: on ? theme.accent : theme.dark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.05)',
                }}
              >
                <Text style={{ fontSize: 13, fontWeight: '500', color: on ? '#fff' : theme.text2 }}>{t(ck)}</Text>
              </Press>
            );
          })}
        </View>
        <TextInput
          value={val}
          onChangeText={setVal}
          placeholder={t('account.feedback.placeholder')}
          placeholderTextColor={theme.text3}
          multiline
          style={{
            backgroundColor: theme.surfaceTop,
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: theme.hairline,
            borderRadius: 12,
            paddingHorizontal: 14,
            paddingVertical: 13,
            fontSize: 15,
            color: theme.text,
            minHeight: 140,
            textAlignVertical: 'top',
          }}
        />
        <Text style={{ fontSize: 12, color: theme.text3, paddingHorizontal: 6, paddingTop: 11, lineHeight: 18 }}>
          {t('account.feedback.helper', { email: 'hi@kaipa.app' })}
        </Text>
      </View>
    </MePushPage>
  );
}
