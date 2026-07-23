// FeedbackPage.tsx — 帮助与反馈: category chips + free-text + 提交 in the nav bar.
// Mirrors the prototype FeedbackPage.
import React, { useState } from 'react';
import { View, Text, TextInput } from 'react-native';
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
    <Press onPress={() => canSubmit && onSubmit()} scaleTo={1} opacityTo={1} style={{ minWidth: 54, height: 34, paddingHorizontal: space.sm, borderRadius: radius.pill, backgroundColor: canSubmit ? theme.accentSoft : theme.fieldSurface, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ fontSize: 13, fontWeight: '700', color: canSubmit ? theme.accent : theme.text3 }}>{t('account.feedback.submit')}</Text>
    </Press>
  );

  return (
    <MePushPage theme={theme} title={t('account.feedback.pageTitle')} onBack={onBack} right={submit}>
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
                  backgroundColor: on ? theme.accentSoft : theme.fieldSurface,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Text style={{ fontSize: 13, fontWeight: on ? '700' : '500', color: on ? theme.accent : theme.text2 }}>{t(ck)}</Text>
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
            borderWidth: 0,
            borderRadius: radius.feature,
            paddingHorizontal: space.md,
            paddingVertical: space.md,
            fontSize: 15,
            color: theme.text,
            minHeight: 180,
            textAlignVertical: 'top',
          }}
        />
        <Text style={[type.caption, { color: theme.text3, paddingHorizontal: space.xs, paddingTop: space.sm, lineHeight: 18 }]}>
          {t('account.feedback.helper', { email: 'hi@kaipa.app' })}
        </Text>
      </View>
    </MePushPage>
  );
}
