// AccountPage.tsx — 个人资料 and 账号与安全 pushed pages. 账号与安全 lists the sign-in
// methods (Apple / 邮箱 / 手机号) bound to this one account, plus 密码 when email is bound.
// 注销账号 and 退出登录 sit below; 个人资料 ends with a UID/join-date card.
import React, { useEffect, useState } from 'react';
import * as Clipboard from 'expo-clipboard';
import * as ImagePicker from 'expo-image-picker';
import { ActivityIndicator, AppState, InteractionManager, Platform, View, Text, StyleSheet, TextInput } from 'react-native';
import { Theme } from '../../theme/theme';
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
import { layout, radius, space, type } from '../../design-system';
import { isAppleSignInAvailable, isAppleSignInCanceled, linkApple, unlinkLoginMethod } from '../../lib/auth';
import { loginMethodErrorKey, maskPhone, useLoginMethods } from '../../hooks/useLoginMethods';
import { usePublicRuntimeFlags } from '../../hooks/usePublicRuntimeFlags';

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
  section = 'profile',
  onBack,
  onEdit,
  onDeleteAccount,
  onOpenLoginMethod,
  showToast,
}: {
  theme: Theme;
  profile: MeProfile;
  section?: 'profile' | 'security';
  onBack: () => void;
  onEdit: (field: MeEditField) => void;
  onDeleteAccount?: () => void;
  onOpenLoginMethod?: (kind: 'email' | 'phone') => void;
  showToast: (m: string) => void;
}) {
  const nav = useNav();
  const { t } = useI18n();
  const data = useData();
  const uid = data.profile.uid;
  const displayedUid = uid.length > 13 ? `${uid.slice(0, 8)}…${uid.slice(-4)}` : uid;
  const createdAt = data.profile.createdAt;
  const [avatarSaving, setAvatarSaving] = useState(false);
  const [profileDraft, setProfileDraft] = useState({ nick: profile.nick, bio: profile.bio });
  const [profileSaving, setProfileSaving] = useState(false);
  const [signOutDialogOpen, setSignOutDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const { methods, usableCount } = useLoginMethods();
  const { flags } = usePublicRuntimeFlags();
  const [appleAvailable, setAppleAvailable] = useState(false);
  const [linkingApple, setLinkingApple] = useState(false);
  const [appleUnbindOpen, setAppleUnbindOpen] = useState(false);
  const [unbindingApple, setUnbindingApple] = useState(false);
  // Apple 只能在 iPhone 上绑定；其它平台只在已绑定时露出这一行，方便解绑。
  const showAppleRow = appleAvailable || !!methods.apple;

  useEffect(() => {
    if (section !== 'security') return;
    let active = true;
    void isAppleSignInAvailable().then((available) => { if (active) setAppleAvailable(available); });
    return () => { active = false; };
  }, [section]);

  const onApplePress = async () => {
    if (methods.apple) {
      if (usableCount > 1) setAppleUnbindOpen(true);
      else showToast(t('account.security.lastMethod'));
      return;
    }
    if (!appleAvailable) {
      showToast(t('account.security.appleIosOnly'));
      return;
    }
    const { error } = await linkApple(() => setLinkingApple(true));
    setLinkingApple(false);
    if (error) {
      if (!isAppleSignInCanceled(error)) showToast(t(loginMethodErrorKey(error, 'apple', 'link')));
      return;
    }
    showToast(t('account.security.toastBound', { name: t('account.security.apple') }));
  };

  const unbindApple = async () => {
    if (!methods.apple || unbindingApple) return;
    setUnbindingApple(true);
    const { error } = await unlinkLoginMethod(methods.apple.identity);
    setUnbindingApple(false);
    setAppleUnbindOpen(false);
    showToast(error
      ? t(loginMethodErrorKey(error, 'apple', 'unbind'))
      : t('account.security.toastUnbound', { name: t('account.security.apple') }));
  };

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
      // Loading the native cropper eagerly crashes both the Web app and guest
      // pages before they render. Web uses the selected image directly.
      const image = Platform.OS === 'web' ? { path: asset.uri } : await (require('react-native-image-crop-picker') as typeof import('react-native-image-crop-picker')).default.openCropper({
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

  const saveProfile = async () => {
    if (profileSaving) return;
    setProfileSaving(true);
    try {
      if (profileDraft.nick !== profile.nick) await data.updateProfile('nick', profileDraft.nick.trim());
      if (profileDraft.bio !== profile.bio) await data.updateProfile('bio', profileDraft.bio.trim());
      showToast(t('common.saved'));
      onBack();
    } catch {
      showToast(t('account.security.toastSaveFailed'));
    } finally {
      setProfileSaving(false);
    }
  };

  return (
    <MePushPage
      theme={theme}
      title={section === 'security' ? t('account.security.pageTitle') : t('account.profile.editTitle')}
      onBack={onBack}
      right={section === 'profile' ? (
        <Press onPress={() => void saveProfile()} disabled={profileSaving} accessibilityRole="button" scaleTo={0.96} opacityTo={0.75}>
          <Text style={{ color: theme.text, fontSize: 16, fontWeight: '700', opacity: profileSaving ? 0.45 : 1 }}>{t('common.done')}</Text>
        </Press>
      ) : undefined}
    >
      {section === 'profile' ? <>
      <View style={{ paddingHorizontal: layout.pagePadding, paddingTop: space.sm, paddingBottom: space.xl, alignItems: 'center' }}>
        <Press
          onPress={avatarSaving ? undefined : () => void pickAvatar()}
          accessibilityRole="button"
          accessibilityLabel={t('account.profile.avatarLibrary')}
          scaleTo={0.97}
          opacityTo={0.82}
          style={{ width: 112, height: 112, borderRadius: 56 }}
        >
          <Avatar uri={data.profile.avatarUrl} size={112} style={{ borderWidth: StyleSheet.hairlineWidth, borderColor: theme.fieldBorder }} />
          {avatarSaving ? <View pointerEvents="none" style={{ position: 'absolute', inset: 0, borderRadius: 56, backgroundColor: 'rgba(0,0,0,0.36)', alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color="#FFFFFF" /></View> : null}
          <View pointerEvents="none" style={{ position: 'absolute', right: 0, bottom: 0, width: 30, height: 30, borderRadius: radius.pill, backgroundColor: theme.text, borderWidth: 2.5, borderColor: theme.groupedBg, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="camera" color={theme.groupedBg} size={15} />
          </View>
        </Press>
      </View>

      <View style={{ paddingHorizontal: layout.pagePadding, gap: space.xl }}>
        <View>
          <Text style={{ color: theme.text2, fontSize: 16, marginBottom: space.sm }}>{t('account.profile.nick')}</Text>
          <TextInput
            value={profileDraft.nick}
            onChangeText={(nick) => setProfileDraft((current) => ({ ...current, nick }))}
            placeholder={t('account.profile.nickPlaceholder')}
            placeholderTextColor={theme.text3}
            selectionColor={theme.accent}
            numberOfLines={1}
            style={{ minHeight: 60, borderRadius: radius.card, borderWidth: StyleSheet.hairlineWidth, borderColor: theme.fieldBorder, backgroundColor: theme.surfaceTop, paddingHorizontal: space.lg, color: theme.text, fontSize: 18, fontWeight: '600' }}
          />
        </View>

        <View>
          <Text style={{ color: theme.text2, fontSize: 16, marginBottom: space.sm }}>{t('account.profile.bio')}</Text>
          <TextInput
            value={profileDraft.bio}
            onChangeText={(bio) => setProfileDraft((current) => ({ ...current, bio }))}
            placeholder={t('account.profile.bioPlaceholder')}
            placeholderTextColor={theme.text3}
            selectionColor={theme.accent}
            multiline
            textAlignVertical="top"
            style={{ minHeight: 132, borderRadius: radius.card, borderWidth: StyleSheet.hairlineWidth, borderColor: theme.fieldBorder, backgroundColor: theme.surfaceTop, paddingHorizontal: space.lg, paddingTop: space.lg, color: theme.text, fontSize: 17, lineHeight: 25 }}
          />
        </View>

        <MeCard theme={theme}>
          <MeRow theme={theme} label={t('account.profile.uid')} detail={displayedUid} trailing={<Icon name="copy" color={theme.text3} size={14} />} onPress={() => void copyUid()} showChevron={false} />
          <MeRow theme={theme} label={t('account.profile.joinedDate')} detail={createdAt ? new Date(createdAt).toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' }).replace(/\//g, ' · ') : '—'} last />
        </MeCard>
      </View>
      </> : null}

      {section === 'security' ? <MeSection theme={theme} title={t('account.security.loginSection')} first horizontalPadding={layout.pagePadding}>
        <MeCard theme={theme}>
          {showAppleRow ? (
            <MeRow
              theme={theme}
              label={t('account.security.apple')}
              detail={methods.apple ? t('account.security.bound') : t('account.security.notBound')}
              trailing={linkingApple ? <ActivityIndicator color={theme.text3} /> : undefined}
              onPress={linkingApple ? undefined : () => void onApplePress()}
            />
          ) : null}
          <MeRow
            theme={theme}
            label={t('account.security.email')}
            detail={methods.email?.value || t('account.security.notBound')}
            detailMaxWidth="56%"
            onPress={() => onOpenLoginMethod?.('email')}
          />
          <MeRow
            theme={theme}
            label={t('account.security.phone')}
            detail={methods.phone ? maskPhone(methods.phone.value) : t('account.security.notBound')}
            onPress={() => {
              if (!methods.phone && flags.phoneLogin === 'disabled') showToast(t('account.security.phoneUnavailable'));
              else onOpenLoginMethod?.('phone');
            }}
            last
          />
        </MeCard>
        <Text style={[type.caption, { color: theme.text3, paddingHorizontal: space.xs, paddingTop: space.sm, lineHeight: 18 }]}>
          {t('account.security.loginHint')}
        </Text>
      </MeSection> : null}

      {section === 'security' && methods.email ? <MeSection theme={theme} title={t('account.security.section')} horizontalPadding={layout.pagePadding}>
        <MeCard theme={theme}>
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
      </MeSection> : null}

      {section === 'security' ? <View style={{ paddingHorizontal: layout.pagePadding, marginTop: space.xxl, gap: space.md }}>
        <Press
          onPress={onDeleteAccount}
          accessibilityRole="button"
          scaleTo={1}
          opacityTo={1}
          style={{ height: 52, borderRadius: radius.feature, backgroundColor: theme.surfaceTop, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.xs }}
        >
          <Text style={{ fontSize: 15, fontWeight: '700', color: theme.danger }}>{t('account.delete.row')}</Text>
        </Press>

        <Press
          onPress={() => setSignOutDialogOpen(true)}
          accessibilityRole="button"
          scaleTo={1}
          opacityTo={1}
          style={{ height: 52, borderRadius: radius.feature, backgroundColor: theme.danger, alignItems: 'center', justifyContent: 'center' }}
        >
          <Text style={{ fontSize: 15, fontWeight: '700', color: '#FFFFFF' }}>{t('me.signOut')}</Text>
        </Press>
      </View> : null}

      {section === 'security' ? <AccountActionDialog
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
      /> : null}

      {section === 'security' ? <AccountActionDialog
        theme={theme}
        visible={deleteDialogOpen}
        title={t('account.delete.title')}
        message={t('account.delete.message')}
        confirmPhrase={t('account.delete.confirmPhrase')}
        confirmPlaceholder={t('account.delete.confirmPlaceholder')}
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
      /> : null}

      {section === 'security' ? <AccountActionDialog
        theme={theme}
        visible={appleUnbindOpen}
        title={t('account.security.unbindTitle', { name: t('account.security.apple') })}
        message={t('account.security.unbindMessage', { name: t('account.security.apple') })}
        confirmLabel={t('account.security.unbind')}
        cancelLabel={t('common.cancel')}
        confirming={unbindingApple}
        onCancel={() => { if (!unbindingApple) setAppleUnbindOpen(false); }}
        onConfirm={() => void unbindApple()}
      /> : null}
    </MePushPage>
  );
}
