// AboutPage.tsx — 关于: app icon + version + legal rows. Mirrors the prototype AboutPage.
import React from 'react';
import { View, Text } from 'react-native';
import { Image } from 'expo-image';
import { Theme } from '../../theme/theme';
import { MONO } from '../../theme/fonts';
import { useI18n } from '../../i18n';
import { MePushPage } from './MePushPage';
import { MeCard, MeRow } from './parts';
import { radius, space, type } from '../../design-system';

export function AboutPage({
  theme,
  onBack,
  onOpenDocument,
  showToast,
}: {
  theme: Theme;
  onBack: () => void;
  onOpenDocument: (document: 'agreement' | 'privacy') => void;
  showToast: (m: string) => void;
}) {
  const { t } = useI18n();
  return (
    <MePushPage theme={theme} title={t('account.about.pageTitle')} onBack={onBack}>
      <View style={{ paddingHorizontal: space.xl, paddingTop: space.md }}>
        <View style={{ alignItems: 'center', marginBottom: space.xxl }}>
          <Image
            source={require('../../../assets/icon.png')}
            contentFit="cover"
            style={{
              width: 76,
              height: 76,
              borderRadius: radius.card,
            }}
          />
          <Text style={[type.sectionTitle, { color: theme.text, marginTop: space.md }]}>{t('app.name')}</Text>
          <Text style={{ fontFamily: MONO, fontSize: 12, color: theme.text2, marginTop: space.xxs }}>v1.0.2 (220)</Text>
        </View>
        <MeCard theme={theme}>
          <MeRow theme={theme} label={t('account.about.terms')} onPress={() => onOpenDocument('agreement')} />
          <MeRow theme={theme} label={t('account.about.privacy')} onPress={() => onOpenDocument('privacy')} />
          <MeRow theme={theme} label={t('account.about.checkUpdate')} detail={t('account.about.upToDate')} onPress={() => showToast(t('account.about.toastUpToDate'))} last />
        </MeCard>
      </View>
    </MePushPage>
  );
}
