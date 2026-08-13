import React, { useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Theme } from '../../theme/theme';
import { Press } from '../Press';
import { DetailPage, layout, radius, space, type } from '../../design-system';
import { approveQrLoginRequest, parseQrLoginPayload, QrLoginPayload } from '../../lib/qrLogin';
import { useI18n } from '../../i18n';

export function QrLoginScannerPage({ theme, onBack, onApproved }: { theme: Theme; onBack: () => void; onApproved: () => void }) {
  const { t } = useI18n();
  const [permission, requestPermission] = useCameraPermissions();
  const [payload, setPayload] = useState<QrLoginPayload | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const approve = async () => {
    if (!payload || busy) return;
    setBusy(true);
    setError('');
    try {
      const result = await approveQrLoginRequest(payload);
      if (result.status !== 'approved') throw new Error(t('qrLogin.errorExpired'));
      onApproved();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('qrLogin.errorGeneric'));
      setPayload(null);
    } finally {
      setBusy(false);
    }
  };

  const permissionDenied = permission && !permission.granted;

  return (
    <DetailPage theme={theme} title={t('qrLogin.scanTitle')} onBack={onBack} backgroundColor={theme.featureSurface} scrollable={false}>
      <View style={{ flex: 1, paddingHorizontal: layout.pagePadding, paddingBottom: space.xxl, justifyContent: 'center' }}>
        <View style={{ borderRadius: radius.feature, overflow: 'hidden', aspectRatio: 1, backgroundColor: theme.fieldSurface }}>
          {permission?.granted ? (
            <CameraView
              style={StyleSheet.absoluteFill}
              facing="back"
              barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
              onBarcodeScanned={payload ? undefined : ({ data }) => {
                const parsed = parseQrLoginPayload(data);
                if (!parsed) {
                  setError(t('qrLogin.errorInvalid'));
                  return;
                }
                setError('');
                setPayload(parsed);
              }}
            />
          ) : (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.xxl }}>
              <Text style={[type.body, { color: theme.text, textAlign: 'center' }]}>
                {permissionDenied ? t('qrLogin.permissionDenied') : t('qrLogin.permissionHint')}
              </Text>
              <Press
                onPress={() => void requestPermission()}
                style={{ marginTop: space.lg, minHeight: 48, paddingHorizontal: space.xl, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.accent }}
              >
                <Text style={{ color: '#fff', fontSize: 15, fontWeight: '700' }}>{t('qrLogin.allowCamera')}</Text>
              </Press>
              {permissionDenied && Platform.OS === 'web' ? (
                <Text style={[type.caption, { color: theme.text2, textAlign: 'center', marginTop: space.md }]}>{t('qrLogin.webPermissionHint')}</Text>
              ) : null}
            </View>
          )}
          {permission?.granted ? (
            <View pointerEvents="none" style={{ position: 'absolute', left: '15%', right: '15%', top: '15%', bottom: '15%', borderRadius: radius.card, borderWidth: 2, borderColor: '#fff' }} />
          ) : null}
        </View>

        <Text style={[type.body, { color: theme.text2, textAlign: 'center', marginTop: space.lg }]}>
          {payload ? t('qrLogin.confirmHint') : t('qrLogin.scanHint')}
        </Text>
        {error ? <Text style={[type.caption, { color: theme.danger, textAlign: 'center', marginTop: space.sm }]}>{error}</Text> : null}

        {payload ? (
          <View style={{ gap: space.sm, marginTop: space.xl }}>
            <Press
              disabled={busy}
              onPress={() => void approve()}
              style={{ height: 54, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.accent }}
            >
              <Text style={{ color: '#fff', fontSize: 16, fontWeight: '800' }}>{busy ? t('qrLogin.approving') : t('qrLogin.confirm')}</Text>
            </Press>
            <Press onPress={() => setPayload(null)} style={{ height: 46, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ color: theme.text2, fontSize: 14, fontWeight: '600' }}>{t('qrLogin.rescan')}</Text>
            </Press>
          </View>
        ) : null}
      </View>
    </DetailPage>
  );
}
