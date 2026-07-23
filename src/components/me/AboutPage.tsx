// AboutPage.tsx — 关于: app icon + version + legal rows. Mirrors the prototype AboutPage.
import React from 'react';
import { View, Text } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Theme } from '../../theme/theme';
import { MONO } from '../../theme/fonts';
import { rgba } from '../../theme/theme';
import { useI18n } from '../../i18n';
import { MePushPage } from './MePushPage';
import { MeCard, MeRow } from './parts';
import { radius, space, type } from '../../design-system';

export function AboutPage({
  theme,
  onBack,
  showToast,
}: {
  theme: Theme;
  onBack: () => void;
  showToast: (m: string) => void;
}) {
  const { t } = useI18n();
  return (
    <MePushPage theme={theme} title={t('account.about.pageTitle')} onBack={onBack}>
      <View style={{ paddingHorizontal: space.xl, paddingTop: space.md }}>
        <View style={{ alignItems: 'center', marginBottom: space.xxl }}>
          <LinearGradient
            colors={[theme.accent, rgba(theme.accent, 0.67)]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{
              width: 76,
              height: 76,
              borderRadius: radius.card,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text style={{ fontSize: 38, fontWeight: '700', color: '#fff' }}>开</Text>
          </LinearGradient>
          <Text style={[type.sectionTitle, { color: theme.text, marginTop: space.md }]}>kaipa</Text>
          <Text style={{ fontFamily: MONO, fontSize: 12, color: theme.text2, marginTop: space.xxs }}>v1.0.2 (220)</Text>
        </View>
        <MeCard theme={theme}>
          <MeRow theme={theme} label={t('account.about.terms')} onPress={() => showToast(t('account.about.toastTermsOpened'))} />
          <MeRow theme={theme} label={t('account.about.privacy')} onPress={() => showToast(t('account.about.toastPrivacyOpened'))} />
          <MeRow theme={theme} label={t('account.about.checkUpdate')} detail={t('account.about.upToDate')} onPress={() => showToast(t('account.about.toastUpToDate'))} last />
        </MeCard>
        <Text
          style={{
            fontFamily: MONO,
            fontSize: 10.5,
            color: theme.text3,
            textAlign: 'center',
            letterSpacing: 0.3,
            marginTop: space.xl,
          }}
        >
          {t('account.about.copyright', { year: '2026' })}
        </Text>
      </View>
    </MePushPage>
  );
}
