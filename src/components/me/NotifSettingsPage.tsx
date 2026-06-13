// NotifSettingsPage.tsx — 通知 settings (push / 同行动态 / 系统消息 toggles).
// Mirrors the prototype NotifPage.
import React from 'react';
import { View, Text } from 'react-native';
import { Theme } from '../../theme/theme';
import { useI18n } from '../../i18n';
import { MePushPage } from './MePushPage';
import { MeCard, SwitchRow } from './parts';

export interface NotifSettings {
  push: boolean;
  social: boolean;
  system: boolean;
}

export function NotifSettingsPage({
  theme,
  notif,
  setNotif,
  onBack,
}: {
  theme: Theme;
  notif: NotifSettings;
  setNotif: (updater: (s: NotifSettings) => NotifSettings) => void;
  onBack: () => void;
}) {
  const { t } = useI18n();
  return (
    <MePushPage theme={theme} title={t('account.notif.pageTitle')} onBack={onBack}>
      <View style={{ paddingHorizontal: 16, paddingTop: 12 }}>
        <MeCard theme={theme}>
          <SwitchRow
            theme={theme}
            label={t('account.notif.push')}
            sub={t('account.notif.pushSub')}
            value={notif.push}
            onChange={(v) => setNotif((s) => ({ ...s, push: v }))}
          />
          <SwitchRow
            theme={theme}
            label={t('account.notif.social')}
            sub={t('account.notif.socialSub')}
            value={notif.social}
            onChange={(v) => setNotif((s) => ({ ...s, social: v }))}
          />
          <SwitchRow
            theme={theme}
            label={t('account.notif.system')}
            sub={t('account.notif.systemSub')}
            value={notif.system}
            onChange={(v) => setNotif((s) => ({ ...s, system: v }))}
            last
          />
        </MeCard>
        <Text style={{ fontSize: 12, color: theme.text3, paddingHorizontal: 6, paddingTop: 12, lineHeight: 18 }}>
          {t('account.notif.helper')}
        </Text>
      </View>
    </MePushPage>
  );
}
