// AccountPage.tsx — 账户与登录: tappable avatar, 个人资料, 账号安全, 第三方登录,
// 注销账号, and a UID/join-date footer. Mirrors the prototype AccountScreen.
import React from 'react';
import { View, Text } from 'react-native';
import { Theme } from '../../theme/theme';
import { MONO } from '../../theme/fonts';
import { Icon } from '../Icon';
import { Press } from '../Press';
import { useI18n } from '../../i18n';
import { useNav } from '../../nav/NavContext';
import { MePushPage } from './MePushPage';
import { MeSection, MeCard, MeRow, SwitchRow } from './parts';
import { MeEditField } from './EditFieldPage';

export interface MeProfile {
  nick: string;
  username: string;
  bio: string;
  phone: string;
  email: string;
}

export function AccountPage({
  theme,
  profile,
  onBack,
  onEdit,
  onDevices,
  twoFA,
  onToggleTwoFA,
  showToast,
}: {
  theme: Theme;
  profile: MeProfile;
  onBack: () => void;
  onEdit: (field: MeEditField) => void;
  onDevices: () => void;
  twoFA: boolean;
  onToggleTwoFA: (v: boolean) => void;
  showToast: (m: string) => void;
}) {
  const nav = useNav();
  const { t } = useI18n();

  const avatarSheet = () =>
    nav.openActionSheet({
      title: t('account.profile.avatarTitle'),
      items: [
        { label: t('account.profile.avatarCamera'), icon: 'camera', onPress: () => showToast(t('account.profile.toastCameraOpened')) },
        { label: t('account.profile.avatarLibrary'), icon: 'photo', onPress: () => showToast(t('account.profile.toastAvatarUpdated')) },
        { label: t('account.profile.avatarRemove'), icon: 'trash', destructive: true, onPress: () => showToast(t('account.profile.toastAvatarRemoved')) },
      ],
    });
  const unbindSheet = (name: string) =>
    nav.openActionSheet({
      title: t('account.security.unbindTitle', { name }),
      message: t('account.security.unbindMessage', { name }),
      items: [{ label: t('account.security.unbindAction'), destructive: true, onPress: () => showToast(t('account.security.toastUnbound', { name })) }],
    });
  const deleteSheet = () =>
    nav.openActionSheet({
      title: t('account.delete.title'),
      message: t('account.delete.message'),
      items: [{ label: t('account.delete.action'), icon: 'trash', destructive: true, onPress: () => showToast(t('account.delete.toastSubmitted')) }],
    });

  return (
    <MePushPage theme={theme} title={t('account.profile.pageTitle')} onBack={onBack}>
      {/* avatar — tap directly to change */}
      <View style={{ alignItems: 'center', paddingTop: 4 }}>
        <Press onPress={avatarSheet}>
          <View
            style={{
              width: 84,
              height: 84,
              borderRadius: 42,
              backgroundColor: theme.dark ? '#1C1C1E' : '#F2F2F4',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text style={{ fontSize: 32, fontWeight: '600', color: theme.text }}>{profile.nick.slice(0, 1)}</Text>
            <View
              style={{
                position: 'absolute',
                right: -2,
                bottom: -2,
                width: 28,
                height: 28,
                borderRadius: 14,
                backgroundColor: theme.accent,
                borderWidth: 2.5,
                borderColor: theme.bg,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Icon name="camera" color="#fff" size={14} />
            </View>
          </View>
        </Press>
        <Text style={{ fontSize: 17, fontWeight: '600', color: theme.text, marginTop: 14 }}>{profile.nick}</Text>
        <Text style={{ fontFamily: MONO, fontSize: 12, color: theme.text2, marginTop: 3 }}>{profile.username}</Text>
      </View>

      <MeSection theme={theme} title={t('account.profile.sectionProfile')}>
        <MeCard theme={theme}>
          <MeRow
            theme={theme}
            label={t('account.profile.nick')}
            detail={profile.nick}
            onPress={() => onEdit({ label: t('account.profile.nick'), key: 'nick', value: profile.nick, placeholder: t('account.profile.nickPlaceholder') })}
          />
          <MeRow
            theme={theme}
            label={t('account.profile.username')}
            detail={profile.username}
            onPress={() =>
              onEdit({ label: t('account.profile.username'), key: 'username', value: profile.username, placeholder: t('account.profile.usernamePlaceholder') })
            }
          />
          <MeRow
            theme={theme}
            label={t('account.profile.bio')}
            detail={profile.bio}
            onPress={() =>
              onEdit({ label: t('account.profile.bio'), key: 'bio', value: profile.bio, multiline: true, placeholder: t('account.profile.bioPlaceholder') })
            }
            last
          />
        </MeCard>
      </MeSection>

      <MeSection theme={theme} title={t('account.security.section')}>
        <MeCard theme={theme}>
          <MeRow
            theme={theme}
            label={t('account.security.phone')}
            detail={profile.phone}
            onPress={() =>
              onEdit({ label: t('account.security.phone'), key: 'phone', value: profile.phone, type: 'tel', placeholder: t('account.security.phonePlaceholder') })
            }
          />
          <MeRow
            theme={theme}
            label={t('account.security.email')}
            detail={profile.email}
            onPress={() =>
              onEdit({ label: t('account.security.email'), key: 'email', value: profile.email, type: 'email', placeholder: t('account.security.emailPlaceholder') })
            }
          />
          <MeRow
            theme={theme}
            label={t('account.security.password')}
            detail={t('account.security.passwordChangedAgo')}
            onPress={() =>
              onEdit({
                label: t('account.security.password'),
                key: null,
                value: '',
                type: 'password',
                placeholder: t('account.security.passwordPlaceholder'),
                toast: t('account.security.toastPasswordUpdated'),
              })
            }
          />
          <MeRow theme={theme} label={t('account.security.devices')} detail={t('account.security.devicesCount', { count: 2 })} onPress={onDevices} />
          <SwitchRow
            theme={theme}
            label={t('account.security.twoFA')}
            sub={twoFA ? t('account.security.twoFAOnSub') : t('account.security.twoFAOffSub')}
            value={twoFA}
            onChange={onToggleTwoFA}
            last
          />
        </MeCard>
      </MeSection>

      <MeSection theme={theme} title={t('account.security.sectionThirdParty')}>
        <MeCard theme={theme}>
          <MeRow theme={theme} label="微信" detail="chen****88" onPress={() => unbindSheet('微信')} />
          <MeRow theme={theme} label="Apple ID" detail="c***@icloud.com" onPress={() => unbindSheet('Apple ID')} last />
        </MeCard>
      </MeSection>

      <View style={{ paddingHorizontal: 16, marginTop: 28 }}>
        <MeCard theme={theme}>
          <MeRow theme={theme} label={t('account.delete.row')} danger onPress={deleteSheet} last />
        </MeCard>
      </View>

      <Text
        style={{
          fontFamily: MONO,
          fontSize: 10.5,
          color: theme.text3,
          textAlign: 'center',
          letterSpacing: 0.3,
          lineHeight: 18,
          marginTop: 32,
        }}
      >
        UID 8472301{'\n'}{t('account.profile.joinedAt', { date: '2024 · 09 · 22' })}
      </Text>
    </MePushPage>
  );
}
