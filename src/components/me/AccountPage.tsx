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
import { AppCard, radius, space } from '../../design-system';

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
      <View style={{ paddingHorizontal: space.xl, paddingTop: space.xs }}>
        <AppCard theme={theme} radius={radius.feature} style={{ borderWidth: 0, overflow: 'hidden', backgroundColor: theme.featureSurface }}>
          <View pointerEvents="none" style={{ position: 'absolute', width: 142, height: 142, borderRadius: radius.pill, right: -54, top: -76, backgroundColor: theme.accentSofter }} />
          <Press onPress={avatarSheet} scaleTo={1} opacityTo={1} style={{ padding: space.lg }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text numberOfLines={1} style={{ fontSize: 23, fontWeight: '800', letterSpacing: -0.4, color: theme.text }}>{profile.nick || t('me.unnamed')}</Text>
                {profile.username || profile.email ? <Text numberOfLines={1} style={{ fontFamily: profile.username ? MONO : undefined, fontSize: 12, color: theme.text2, marginTop: space.xs }}>{profile.username || profile.email}</Text> : null}
              </View>
              <View style={{ width: 76, height: 76, borderRadius: radius.pill, backgroundColor: theme.accentSofter, alignItems: 'center', justifyContent: 'center' }}>
                {profile.nick ? <Text style={{ fontSize: 28, fontWeight: '800', color: theme.accent }}>{profile.nick.slice(0, 1)}</Text> : <Icon name="user" color={theme.accent} size={30} />}
                <View style={{ position: 'absolute', right: -1, bottom: -1, width: 28, height: 28, borderRadius: radius.pill, backgroundColor: theme.accent, borderWidth: 2.5, borderColor: theme.featureSurface, alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name="camera" color="#fff" size={14} />
                </View>
              </View>
            </View>
          </Press>
        </AppCard>
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
            detail={profile.username || undefined}
            onPress={() =>
              onEdit({ label: t('account.profile.username'), key: 'username', value: profile.username, placeholder: t('account.profile.usernamePlaceholder'), hint: t('account.profile.usernameHint') })
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

      <View style={{ paddingHorizontal: space.xl, marginTop: space.xxl }}>
        <MeCard theme={theme} style={{ backgroundColor: theme.dangerSoft }}>
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
          marginTop: space.xxl,
        }}
      >
        UID {uid.slice(0, 8)}{'\n'}{t('account.profile.joinedAt', { date: createdAt ? new Date(createdAt).toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' }).replace(/\//g, ' · ') : '—' })}
      </Text>
    </MePushPage>
  );
}
