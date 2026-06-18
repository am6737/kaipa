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
import { useData } from '../../data/DataContext';
import { MePushPage } from './MePushPage';
import { MeSection, MeCard, MeRow } from './parts';
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
  showToast,
}: {
  theme: Theme;
  profile: MeProfile;
  onBack: () => void;
  onEdit: (field: MeEditField) => void;
  showToast: (m: string) => void;
}) {
  const nav = useNav();
  const { t } = useI18n();
  const data = useData();
  const uid = data.profile.uid;
  const createdAt = data.profile.createdAt;

  const avatarSheet = () =>
    nav.openActionSheet({
      title: t('account.profile.avatarTitle'),
      items: [
        { label: t('account.profile.avatarCamera'), icon: 'camera', onPress: () => showToast(t('account.profile.toastCameraOpened')) },
        { label: t('account.profile.avatarLibrary'), icon: 'photo', onPress: () => showToast(t('account.profile.toastAvatarUpdated')) },
        { label: t('account.profile.avatarRemove'), icon: 'trash', destructive: true, onPress: () => showToast(t('account.profile.toastAvatarRemoved')) },
      ],
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
            {profile.nick ? (
              <Text style={{ fontSize: 32, fontWeight: '600', color: theme.text }}>{profile.nick.slice(0, 1)}</Text>
            ) : (
              <Icon name="user" color={theme.text3} size={32} />
            )}
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
        <Text style={{ fontSize: 17, fontWeight: '600', color: theme.text, marginTop: 14 }}>{profile.nick || t('me.unnamed')}</Text>
        {profile.username ? <Text style={{ fontFamily: MONO, fontSize: 12, color: theme.text2, marginTop: 3 }}>{profile.username}</Text> : null}
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
            label={t('account.security.email')}
            detail={profile.email || t('account.security.notBound')}
            onPress={() =>
              onEdit({ label: t('account.security.email'), key: 'email', value: profile.email, type: 'email', placeholder: t('account.security.emailPlaceholder') })
            }
          />
          <MeRow
            theme={theme}
            label={t('account.security.password')}
            detail="••••••"
            onPress={() =>
              onEdit({
                label: t('account.security.password'),
                key: 'password',
                value: '',
                type: 'password',
                placeholder: t('account.security.passwordPlaceholder'),
                toast: t('account.security.toastPasswordUpdated'),
              })
            }
            last
          />
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
        UID {uid.slice(0, 8)}{'\n'}{t('account.profile.joinedAt', { date: createdAt ? new Date(createdAt).toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' }).replace(/\//g, ' · ') : '—' })}
      </Text>
    </MePushPage>
  );
}
