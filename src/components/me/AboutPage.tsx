// AboutPage.tsx — 关于: app icon + version + legal rows. Mirrors the prototype AboutPage.
import React from 'react';
import { Alert, Linking, Platform, View, Text } from 'react-native';
import { Image } from 'expo-image';
import Constants from 'expo-constants';
import * as Updates from 'expo-updates';
import { isNewerRelease, lookupStoreRelease } from '../../updates/storeRelease';
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
  const [checking, setChecking] = React.useState(false);
  const checkingRef = React.useRef(false);
  const versionLabel = Constants.expoConfig?.version ? `v${Constants.expoConfig.version}` : null;

  const downloadUpdate = async () => {
    setChecking(true);
    try {
      const downloaded = await Updates.fetchUpdateAsync();
      if (!downloaded.isNew) {
        showToast(t('account.about.updateCheckFailed'));
        return;
      }
      Alert.alert(t('account.about.updateReadyTitle'), t('account.about.updateReadyMessage'), [
        { text: t('account.about.updateLater'), style: 'cancel' },
        { text: t('account.about.updateNow'), onPress: () => { void Updates.reloadAsync().catch(() => showToast(t('account.about.updateReloadFailed'))); } },
      ], { cancelable: false });
    } catch (error) {
      console.warn('[Updates] download failed:', error);
      showToast(t('account.about.updateCheckFailed'));
    } finally {
      setChecking(false);
      checkingRef.current = false;
    }
  };

  const checkForUpdate = async () => {
    if (checkingRef.current) return;
    checkingRef.current = true;
    setChecking(true);
    try {
      const installedVersion = Constants.expoConfig?.version || '0.0.0';
      const storeRelease = await lookupStoreRelease();
      if (storeRelease && isNewerRelease(storeRelease.version, installedVersion)) {
        Alert.alert(t('account.about.nativeUpdateTitle'), t('account.about.nativeUpdateMessage', { version: storeRelease.version }), [
          { text: t('account.about.updateLater'), style: 'cancel' },
          { text: t('account.about.openStore'), onPress: () => { void Linking.openURL(storeRelease.url).catch(() => showToast(t('account.about.storeOpenFailed'))); } },
        ]);
        return;
      }
      if (Platform.OS === 'web' || !Updates.isEnabled) {
        showToast(t('account.about.updateCheckUnavailable'));
        return;
      }
      const result = await Updates.checkForUpdateAsync();
      if (!result.isAvailable) {
        showToast(t('account.about.toastUpToDate'));
        return;
      }
      Alert.alert(t('account.about.updateAvailableTitle'), t('account.about.downloadingUpdate'), [
        { text: t('account.about.updateLater'), style: 'cancel', onPress: () => { checkingRef.current = false; setChecking(false); } },
        { text: t('account.about.downloadNow'), onPress: () => { void downloadUpdate(); } },
      ], { cancelable: false });
    } catch (error) {
      console.warn('[Updates] manual check failed:', error);
      showToast(t('account.about.updateCheckFailed'));
    } finally {
      checkingRef.current = false;
      setChecking(false);
    }
  };

  const updateDetail = checking ? t('account.about.checking') : undefined;

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
          {versionLabel ? (
            <Text style={{ fontFamily: MONO, fontSize: 12, color: theme.text2, marginTop: space.xxs }}>{versionLabel}</Text>
          ) : null}
        </View>
        <MeCard theme={theme}>
          <MeRow theme={theme} label={t('account.about.terms')} onPress={() => onOpenDocument('agreement')} />
          <MeRow theme={theme} label={t('account.about.privacy')} onPress={() => onOpenDocument('privacy')} />
          <MeRow
            theme={theme}
            label={t('account.about.checkUpdate')}
            detail={updateDetail}
            onPress={() => { void checkForUpdate(); }}
            last
          />
        </MeCard>
      </View>
    </MePushPage>
  );
}
