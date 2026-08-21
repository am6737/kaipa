// AccountPage.tsx — 账户与登录: tappable avatar, 个人资料, 账号安全, 第三方登录,
// 注销账号, and a UID/join-date footer. Mirrors the prototype AccountScreen.
import React, { useState } from 'react';
import * as Clipboard from 'expo-clipboard';
import * as ImagePicker from 'expo-image-picker';
import ImageCropPicker from 'react-native-image-crop-picker';
import { ActivityIndicator, AppState, InteractionManager, View, Text, StyleSheet } from 'react-native';
import { Theme } from '../../theme/theme';
import { MONO } from '../../theme/fonts';
import { Icon } from '../Icon';
import { Avatar } from '../Avatar';
import { Press } from '../Press';
import { useI18n } from '../../i18n';
import { useNav } from '../../nav/NavContext';
import { useData } from '../../data/DataContext';
import { MePushPage } from './MePushPage';
import { MeSection, MeCard, MeRow } from './parts';
import { MeEditField } from './EditFieldPage';
import { AvatarUpdateError } from '../../hooks/useProfile';
import { AccountActionDialog } from './AccountActionDialog';
import { AppCard, layout, radius, space } from '../../design-system';

const waitForNativePhotoPickerDismissal = async () => {
  if (AppState.currentState !== 'active') {
    await new Promise<void>((resolve) => {
      const subscription = AppState.addEventListener('change', (state) => {
        if (state !== 'active') return;
        subscription.remove();
        resolve();
      });
    });
  }

  await new Promise<void>((resolve) => {
    InteractionManager.runAfterInteractions(() => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setTimeout(resolve, 700));
      });
    });
  });
};

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
  const displayedUid = uid.length > 13 ? `${uid.slice(0, 8)}…${uid.slice(-4)}` : uid;
  const createdAt = data.profile.createdAt;
  const [avatarSaving, setAvatarSaving] = useState(false);
  const [signOutDialogOpen, setSignOutDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);

  const copyUid = async () => {
    await Clipboard.setStringAsync(uid);
    showToast(t('account.profile.uidCopied'));
  };

  const pickAvatar = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      showToast(t('account.profile.avatarLibraryPermission'));
      return;
    }

    const selection = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: false,
      quality: 1,
    });
    const asset = selection.canceled ? undefined : selection.assets[0];
    if (!asset) return;

    // PHPicker can resolve before its native dismissal transition finishes.
    // Wait until the app is active and the native presentation slot is free.
    await waitForNativePhotoPickerDismissal();

    try {
      const image = await ImageCropPicker.openCropper({
        path: asset.uri,
        mediaType: 'photo',
        cropping: true,
        cropperCircleOverlay: true,
        width: 512,
        height: 512,
        compressImageQuality: 0.9,
        forceJpg: true,
        avoidEmptySpaceAroundImage: true,
        freeStyleCropEnabled: false,
        cropperToolbarTitle: t('account.profile.avatarCropTitle'),
        cropperCancelText: t('common.cancel'),
        cropperChooseText: t('common.done'),
        cropperToolbarColor: theme.dark ? '#111113' : '#FFFFFF',
        cropperToolbarWidgetColor: theme.dark ? '#FFFFFF' : '#111113',
        cropperActiveWidgetColor: theme.accent,
        cropperStatusBarLight: !theme.dark,
        cropperNavigationBarLight: !theme.dark,
        showCropGuidelines: false,
        showCropFrame: false,
      });
      setAvatarSaving(true);
      await data.updateAvatar(image.path);
      showToast(t('account.profile.toastAvatarUpdated'));
    } catch (error) {
      const code = typeof error === 'object' && error && 'code' in error ? String(error.code) : '';
      if (code === 'E_PICKER_CANCELLED') return;
      console.warn('[AccountPage] Avatar update failed', error);
      const cause = error instanceof AvatarUpdateError ? error.cause : error;
      const causeCode = typeof cause === 'object' && cause && 'code' in cause ? String(cause.code) : '';
      const message = error instanceof AvatarUpdateError && error.stage === 'profile' && causeCode === '42703'
        ? t('account.profile.avatarMigrationRequired')
        : error instanceof AvatarUpdateError && error.stage === 'upload'
          ? t('account.profile.avatarUploadFailed')
          : code === 'E_CROPPER_IMAGE_NOT_FOUND'
            ? t('account.profile.avatarCropImageFailed')
            : t('account.profile.avatarUpdateFailed');
      showToast(message);
    } finally {
      setAvatarSaving(false);
    }
  };

  return (
    <MePushPage theme={theme} title={t('account.profile.pageTitle')} onBack={onBack}>
      <View style={{ paddingHorizontal: layout.pagePadding }}>
        <AppCard theme={theme} radius={radius.feature} style={{ boxShadow: 'none', borderWidth: 0, overflow: 'hidden', backgroundColor: theme.featureSurface }}>
          <View pointerEvents="none" style={{ position: 'absolute', width: 142, height: 142, borderRadius: radius.pill, right: -54, top: -76, backgroundColor: theme.accentSofter }} />
          <View style={{ padding: space.lg }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text numberOfLines={1} style={{ fontSize: 23, fontWeight: '800', letterSpacing: -0.4, color: theme.text }}>{profile.nick || t('me.unnamed')}</Text>
              </View>
              <Press
                onPress={avatarSaving ? undefined : () => void pickAvatar()}
                accessibilityRole="button"
                accessibilityLabel={t('account.profile.avatarLibrary')}
                scaleTo={0.96}
                opacityTo={0.82}
                style={{ width: 68, height: 68, borderRadius: 34 }}
              >
                <Avatar uri={data.profile.avatarUrl} size={68} style={{ borderWidth: StyleSheet.hairlineWidth, borderColor: theme.fieldBorder }} />
                {avatarSaving ? <View pointerEvents="none" style={{ position: 'absolute', inset: 0, borderRadius: 34, backgroundColor: 'rgba(0,0,0,0.36)', alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color="#FFFFFF" /></View> : null}
                <View pointerEvents="none" style={{ position: 'absolute', right: -1, bottom: -1, width: 28, height: 28, borderRadius: radius.pill, backgroundColor: theme.accent, borderWidth: 2.5, borderColor: theme.featureSurface, alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name="camera" color="#fff" size={14} />
                </View>
              </Press>
            </View>
            {profile.bio ? <Text numberOfLines={2} style={{ fontSize: 14.5, color: theme.text2, lineHeight: 20, marginTop: space.md }}>{profile.bio}</Text> : null}
          </View>
        </AppCard>

      </View>

      <MeSection theme={theme} title={t('account.profile.sectionProfile')} horizontalPadding={layout.pagePadding}>
        <MeCard theme={theme}>
          <MeRow
            theme={theme}
            label={t('account.profile.nick')}
            detail={profile.nick}
            onPress={() => onEdit({ label: t('account.profile.nick'), key: 'nick', value: profile.nick, placeholder: t('account.profile.nickPlaceholder') })}
          />
          <MeRow
            theme={theme}
            label={t('account.profile.bio')}
            detail={profile.bio}
            onPress={() =>
              onEdit({ label: t('account.profile.bio'), key: 'bio', value: profile.bio, multiline: true, placeholder: t('account.profile.bioPlaceholder') })
            }
          />
          <MeRow
            theme={theme}
            label={t('account.profile.uid')}
            detail={displayedUid}
            trailing={<Icon name="copy" color={theme.text3} size={14} />}
            onPress={() => void copyUid()}
            showChevron={false}
          />
          <MeRow
            theme={theme}
            label={t('account.profile.joinedDate')}
            detail={createdAt ? new Date(createdAt).toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' }).replace(/\//g, ' · ') : '—'}
            last
          />
        </MeCard>
      </MeSection>

      <MeSection theme={theme} title={t('account.security.section')} horizontalPadding={layout.pagePadding}>
        <MeCard theme={theme}>
          <MeRow
            theme={theme}
            label={t('account.security.email')}
            detail={profile.email || t('account.security.notBound')}
            detailMaxWidth="46%"
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

      <View style={{ paddingHorizontal: layout.pagePadding, marginTop: space.xxl, gap: space.md }}>
        <Press
          onPress={() => setSignOutDialogOpen(true)}
          accessibilityRole="button"
          scaleTo={1}
          opacityTo={1}
          style={{ height: 52, borderRadius: radius.feature, backgroundColor: theme.surfaceTop, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.xs }}
        >
          <Text style={{ fontSize: 15, fontWeight: '700', color: theme.danger }}>{t('me.signOut')}</Text>
        </Press>

        <Press
          onPress={() => setDeleteDialogOpen(true)}
          accessibilityRole="button"
          scaleTo={1}
          opacityTo={1}
          style={{ height: 52, borderRadius: radius.feature, backgroundColor: theme.danger, alignItems: 'center', justifyContent: 'center' }}
        >
          <Text style={{ fontSize: 15, fontWeight: '700', color: '#FFFFFF' }}>{t('account.delete.row')}</Text>
        </Press>
      </View>

      <AccountActionDialog
        theme={theme}
        visible={signOutDialogOpen}
        title={t('me.signOut')}
        message={t('me.signOutMessage')}
        confirmLabel={t('me.signOut')}
        cancelLabel={t('common.cancel')}
        onCancel={() => setSignOutDialogOpen(false)}
        onConfirm={() => {
          setSignOutDialogOpen(false);
          void nav.auth.signOut();
        }}
      />

      <AccountActionDialog
        theme={theme}
        visible={deleteDialogOpen}
        title={t('account.delete.title')}
        message={t('account.delete.message')}
        confirmLabel={t('account.delete.action')}
        cancelLabel={t('common.cancel')}
        confirming={deletingAccount}
        onCancel={() => {
          if (!deletingAccount) setDeleteDialogOpen(false);
        }}
        onConfirm={() => {
          if (deletingAccount) return;
          setDeletingAccount(true);
          void nav.auth.deleteAccount().catch((error) => {
            console.warn('[AccountPage] Account deletion failed', error);
            setDeletingAccount(false);
            showToast(t('account.delete.toastFailed'));
          });
        }}
      />

    </MePushPage>
  );
}
