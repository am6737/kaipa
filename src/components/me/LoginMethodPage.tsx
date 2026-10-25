// LoginMethodPage.tsx — 账号与安全里绑定 / 更换 / 解绑邮箱或手机号。
// 先填新邮箱（和登录密码）或手机号拿验证码，再填验证码确认；已绑定时页底多一个解绑。
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TextInput, View } from 'react-native';
import { Theme } from '../../theme/theme';
import { Press } from '../Press';
import { useI18n } from '../../i18n';
import { MePushPage } from './MePushPage';
import { AccountActionDialog } from './AccountActionDialog';
import { layout, radius, space, type } from '../../design-system';
import { sendBindEmailCode, sendBindPhoneCode, unlinkLoginMethod, verifyBindEmail, verifyBindPhone } from '../../lib/auth';
import { loginMethodErrorKey, maskPhone, useLoginMethods } from '../../hooks/useLoginMethods';
import { usePublicRuntimeFlags } from '../../hooks/usePublicRuntimeFlags';

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const PHONE_RE = /^1\d{10}$/;
const RESEND_SECONDS = 60;

export function LoginMethodPage({
  theme,
  kind,
  onBack,
  onDone,
  showToast,
}: {
  theme: Theme;
  kind: 'email' | 'phone';
  onBack: () => void;
  /** 绑定或解绑成功：返回上一页并提示。 */
  onDone: (message: string) => void;
  showToast: (message: string) => void;
}) {
  const { t } = useI18n();
  const { methods, usableCount } = useLoginMethods();
  const { flags } = usePublicRuntimeFlags();
  const bound = methods[kind];
  const name = kind === 'email' ? t('account.security.email') : t('account.security.phone');
  const currentLabel = bound ? (kind === 'phone' ? maskPhone(bound.value) : bound.value) : '';
  // 手机号登录关着时发不了码；已绑定的手机号仍然可以解绑。
  const canBind = kind === 'email' || flags.phoneLogin !== 'disabled';

  const [target, setTarget] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [sentTo, setSentTo] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [resendIn, setResendIn] = useState(0);
  const [unbindOpen, setUnbindOpen] = useState(false);
  const [unbinding, setUnbinding] = useState(false);
  const codeRef = useRef<TextInput>(null);

  useEffect(() => {
    if (resendIn <= 0) return;
    const id = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(id);
  }, [resendIn]);

  const normalizedTarget = kind === 'email' ? target.trim().toLowerCase() : target.replace(/\D/g, '');
  const targetValid = kind === 'email' ? EMAIL_RE.test(normalizedTarget) : PHONE_RE.test(normalizedTarget);
  const passwordValid = kind === 'phone' || password.length >= 6;
  const sendEnabled = canBind && targetValid && passwordValid && !busy;
  const verifyEnabled = /^\d{6}$/.test(code) && !busy;
  const e164 = `+86${normalizedTarget}`;

  const sendCode = async () => {
    if (!sendEnabled) return;
    setBusy(true);
    setError('');
    const { error: sendError } = kind === 'email' ? await sendBindEmailCode(normalizedTarget) : await sendBindPhoneCode(e164);
    setBusy(false);
    if (sendError) {
      setError(t(loginMethodErrorKey(sendError, kind, 'send')));
      return;
    }
    setSentTo(kind === 'email' ? normalizedTarget : `+86 ${normalizedTarget}`);
    setCode('');
    setResendIn(RESEND_SECONDS);
    setTimeout(() => codeRef.current?.focus(), 120);
  };

  const verify = async () => {
    if (!verifyEnabled) return;
    setBusy(true);
    setError('');
    const { error: verifyError } = kind === 'email'
      ? await verifyBindEmail(normalizedTarget, code, password)
      : await verifyBindPhone(e164, code);
    setBusy(false);
    if (verifyError) {
      setError(t(loginMethodErrorKey(verifyError, kind, 'verify')));
      return;
    }
    onDone(t('account.security.toastBound', { name }));
  };

  const unbind = async () => {
    if (!bound || unbinding) return;
    setUnbinding(true);
    const { error: unbindError } = await unlinkLoginMethod(bound.identity);
    setUnbinding(false);
    setUnbindOpen(false);
    if (unbindError) {
      showToast(t(loginMethodErrorKey(unbindError, kind, 'unbind')));
      return;
    }
    onDone(t('account.security.toastUnbound', { name }));
  };

  const fieldStyle = {
    minHeight: 56,
    borderRadius: radius.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.fieldBorder,
    backgroundColor: theme.surfaceTop,
    paddingHorizontal: space.lg,
    color: theme.text,
    fontSize: 17,
  } as const;

  const primary = (label: string, enabled: boolean, onPress: () => void) => (
    <Press
      onPress={enabled ? onPress : undefined}
      disabled={!enabled}
      accessibilityRole="button"
      accessibilityState={{ disabled: !enabled, busy }}
      scaleTo={0.98}
      opacityTo={0.85}
      style={{ height: 52, borderRadius: radius.card, backgroundColor: enabled ? theme.accent : theme.fieldSurface, alignItems: 'center', justifyContent: 'center' }}
    >
      {busy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={{ fontSize: 16, fontWeight: '700', color: enabled ? '#FFFFFF' : theme.text3 }}>{label}</Text>}
    </Press>
  );

  const title = bound
    ? name
    : kind === 'email' ? t('account.security.bindEmailTitle') : t('account.security.bindPhoneTitle');
  const sub = bound
    ? kind === 'email' ? t('account.security.changeEmailSub') : t('account.security.changePhoneSub')
    : kind === 'email' ? t('account.security.bindEmailSub') : t('account.security.bindPhoneSub');

  return (
    <MePushPage theme={theme} title={title} onBack={onBack}>
      <View style={{ paddingHorizontal: layout.pagePadding, gap: space.lg }}>
        {bound ? (
          <Text style={[type.cardTitle, { color: theme.text }]} numberOfLines={1} ellipsizeMode="middle">
            {t('account.security.current', { value: currentLabel })}
          </Text>
        ) : null}
        <Text style={[type.caption, { color: theme.text2, lineHeight: 20 }]}>{sub}</Text>

        {canBind ? <>
          {!sentTo ? <>
            <View style={{ flexDirection: 'row', alignItems: 'center', ...fieldStyle, paddingHorizontal: 0 }}>
              {kind === 'phone' ? <Text style={{ paddingLeft: space.lg, fontSize: 17, color: theme.text2 }}>+86</Text> : null}
              <TextInput
                value={target}
                onChangeText={(value) => { setTarget(value); setError(''); }}
                placeholder={kind === 'email' ? t('account.security.newEmailPlaceholder') : t('account.security.phonePlaceholder')}
                placeholderTextColor={theme.text3}
                selectionColor={theme.accent}
                keyboardType={kind === 'email' ? 'email-address' : 'phone-pad'}
                textContentType={kind === 'email' ? 'emailAddress' : 'telephoneNumber'}
                autoComplete={kind === 'email' ? 'email' : 'tel'}
                autoCapitalize="none"
                autoCorrect={false}
                maxLength={kind === 'phone' ? 13 : undefined}
                style={{ flex: 1, paddingHorizontal: space.lg, paddingVertical: space.md, color: theme.text, fontSize: 17 }}
              />
            </View>
            {kind === 'email' ? (
              <View style={{ gap: space.xs }}>
                <Text style={[type.caption, { color: theme.text2 }]}>{t('account.security.loginPassword')}</Text>
                <TextInput
                  value={password}
                  onChangeText={(value) => { setPassword(value); setError(''); }}
                  placeholder={t('account.security.loginPasswordPlaceholder')}
                  placeholderTextColor={theme.text3}
                  selectionColor={theme.accent}
                  secureTextEntry
                  textContentType="newPassword"
                  autoComplete="new-password"
                  autoCapitalize="none"
                  style={fieldStyle}
                />
              </View>
            ) : null}
            {primary(t('account.security.getCode'), sendEnabled, () => void sendCode())}
          </> : <>
            <Text style={[type.caption, { color: theme.text2 }]}>{t('account.security.sentTo', { target: sentTo })}</Text>
            <TextInput
              ref={codeRef}
              value={code}
              onChangeText={(value) => { setCode(value.replace(/\D/g, '').slice(0, 6)); setError(''); }}
              placeholder={t('account.security.codePlaceholder')}
              placeholderTextColor={theme.text3}
              selectionColor={theme.accent}
              keyboardType="number-pad"
              textContentType="oneTimeCode"
              autoComplete="one-time-code"
              maxLength={6}
              style={[fieldStyle, { letterSpacing: 4 }]}
            />
            {primary(t('account.security.confirmBind'), verifyEnabled, () => void verify())}
            <Press
              onPress={resendIn > 0 || busy ? undefined : () => void sendCode()}
              disabled={resendIn > 0 || busy}
              accessibilityRole="button"
              scaleTo={1}
              opacityTo={0.7}
              style={{ alignSelf: 'center', paddingVertical: space.xs }}
            >
              <Text style={[type.caption, { color: resendIn > 0 ? theme.text3 : theme.accent, fontWeight: '600' }]}>
                {resendIn > 0 ? t('account.security.resendIn', { seconds: resendIn }) : t('account.security.resend')}
              </Text>
            </Press>
          </>}
          {error ? <Text style={[type.caption, { color: theme.danger }]}>{error}</Text> : null}
        </> : (
          <Text style={[type.caption, { color: theme.text3 }]}>{t('account.security.phoneUnavailable')}</Text>
        )}

        {bound ? (
          <Press
            onPress={() => (usableCount > 1 ? setUnbindOpen(true) : showToast(t('account.security.lastMethod')))}
            accessibilityRole="button"
            scaleTo={1}
            opacityTo={1}
            style={{ marginTop: space.xl, height: 52, borderRadius: radius.feature, backgroundColor: theme.surfaceTop, alignItems: 'center', justifyContent: 'center' }}
          >
            <Text style={{ fontSize: 15, fontWeight: '700', color: theme.danger }}>
              {kind === 'email' ? t('account.security.unbindEmail') : t('account.security.unbindPhone')}
            </Text>
          </Press>
        ) : null}
      </View>

      <AccountActionDialog
        theme={theme}
        visible={unbindOpen}
        title={t('account.security.unbindTitle', { name })}
        message={t('account.security.unbindMessage', { name })}
        confirmLabel={t('account.security.unbind')}
        cancelLabel={t('common.cancel')}
        confirming={unbinding}
        onCancel={() => { if (!unbinding) setUnbindOpen(false); }}
        onConfirm={() => void unbind()}
      />
    </MePushPage>
  );
}
