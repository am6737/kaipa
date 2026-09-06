import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Easing, Platform, StyleSheet, Text, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import Svg, { Path } from 'react-native-svg';
import { Theme } from '../../theme/theme';
import { Press } from '../Press';
import { DetailPage, layout, motion, radius, space, type } from '../../design-system';
import { approveQrLoginRequest, markQrLoginScanned, parseQrLoginPayload, QrLoginPayload } from '../../lib/qrLogin';
import { parseJourneyInviteUrl, type JourneyInvite } from '../../lib/journeyInvite';
import { useI18n } from '../../i18n';

const CheckGlyph = ({ color = '#fff', size = 34 }: { color?: string; size?: number }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="m5 12.5 4.2 4.2L19 7" stroke={color} strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

function ScannerCorners({ color }: { color: string }) {
  const corner = { position: 'absolute' as const, width: 30, height: 30, borderColor: color };
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { margin: '14%' }]}>
      <View style={[corner, { left: 0, top: 0, borderLeftWidth: 3, borderTopWidth: 3, borderTopLeftRadius: radius.control }]} />
      <View style={[corner, { right: 0, top: 0, borderRightWidth: 3, borderTopWidth: 3, borderTopRightRadius: radius.control }]} />
      <View style={[corner, { left: 0, bottom: 0, borderLeftWidth: 3, borderBottomWidth: 3, borderBottomLeftRadius: radius.control }]} />
      <View style={[corner, { right: 0, bottom: 0, borderRightWidth: 3, borderBottomWidth: 3, borderBottomRightRadius: radius.control }]} />
    </View>
  );
}

export function QrLoginScannerPage({ theme, journeyOnly = false, onBack, onApproved, onJourneyInvite }: { theme: Theme; journeyOnly?: boolean; onBack: () => void; onApproved: () => void; onJourneyInvite: (invite: JourneyInvite) => Promise<void> }) {
  const { t } = useI18n();
  const [permission, requestPermission] = useCameraPermissions();
  const [payload, setPayload] = useState<QrLoginPayload | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [joiningJourney, setJoiningJourney] = useState(false);
  const [approved, setApproved] = useState(false);
  const scanLocked = useRef(false);
  const invalidTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scanLine = useRef(new Animated.Value(0)).current;
  const confirmProgress = useRef(new Animated.Value(0)).current;
  const successProgress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(scanLine, { toValue: 1, duration: 1900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(scanLine, { toValue: 0, duration: 1900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    );
    if (permission?.granted && !payload) loop.start();
    return () => loop.stop();
  }, [payload, permission?.granted, scanLine]);

  useEffect(() => {
    Animated.spring(confirmProgress, {
      toValue: payload ? 1 : 0,
      useNativeDriver: true,
      speed: 18,
      bounciness: 2,
    }).start();
  }, [confirmProgress, payload]);

  useEffect(() => () => {
    if (invalidTimer.current) clearTimeout(invalidTimer.current);
  }, []);

  const resetScan = () => {
    scanLocked.current = false;
    setPayload(null);
    setError('');
  };

  const handleScan = async (data: string) => {
    if (scanLocked.current) return;
    const journeyInviteUrl = parseJourneyInviteUrl(data);
    if (journeyInviteUrl) {
      scanLocked.current = true;
      setError('');
      setJoiningJourney(true);
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
      try {
        await onJourneyInvite(journeyInviteUrl);
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : '';
        setError(message.includes('JOURNEY_FULL') ? t('qrLogin.errorJourneyFull') : t('qrLogin.errorJoinJourney'));
        scanLocked.current = false;
      } finally {
        setJoiningJourney(false);
      }
      return;
    }
    const parsed = parseQrLoginPayload(data);
    if (journeyOnly) {
      scanLocked.current = true;
      setError(t('qrLogin.errorInvalidJourneyInvite'));
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
      if (invalidTimer.current) clearTimeout(invalidTimer.current);
      invalidTimer.current = setTimeout(() => {
        scanLocked.current = false;
        setError('');
      }, 1600);
      return;
    }
    if (!parsed) {
      scanLocked.current = true;
      setError(t('qrLogin.errorInvalid'));
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
      if (invalidTimer.current) clearTimeout(invalidTimer.current);
      invalidTimer.current = setTimeout(() => {
        scanLocked.current = false;
        setError('');
      }, 1600);
      return;
    }
    scanLocked.current = true;
    setError('');
    setPayload(parsed);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    try {
      const result = await markQrLoginScanned(parsed);
      if (result.status !== 'scanned' && result.status !== 'approved') throw new Error(t('qrLogin.errorExpired'));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('qrLogin.errorGeneric'));
      scanLocked.current = false;
      setPayload(null);
    }
  };

  const approve = async () => {
    if (!payload || busy) return;
    setBusy(true);
    setError('');
    try {
      const result = await approveQrLoginRequest(payload);
      if (result.status !== 'approved') throw new Error(t('qrLogin.errorExpired'));
      setApproved(true);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      Animated.spring(successProgress, { toValue: 1, useNativeDriver: true, speed: 16, bounciness: 5 }).start();
      setTimeout(onApproved, 720);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('qrLogin.errorGeneric'));
      scanLocked.current = false;
      setPayload(null);
    } finally {
      setBusy(false);
    }
  };

  const permissionDenied = permission && !permission.granted;
  const lineTranslate = scanLine.interpolate({ inputRange: [0, 1], outputRange: [-92, 92] });
  const confirmTranslate = confirmProgress.interpolate({ inputRange: [0, 1], outputRange: [24, 0] });
  const successScale = successProgress.interpolate({ inputRange: [0, 1], outputRange: [0.72, 1] });

  return (
    <DetailPage theme={theme} title={t(journeyOnly ? 'qrLogin.journeyScanTitle' : 'qrLogin.scanTitle')} onBack={onBack} backgroundColor={theme.featureSurface} scrollable={false}>
      <View style={{ flex: 1, paddingHorizontal: layout.pagePadding, paddingBottom: space.xxl, justifyContent: 'center' }}>
        <View style={{ borderRadius: radius.feature, overflow: 'hidden', aspectRatio: 1, backgroundColor: theme.fieldSurface }}>
          {permission?.granted ? (
            <CameraView
              style={StyleSheet.absoluteFill}
              facing="back"
              barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
              onBarcodeScanned={approved || payload || joiningJourney ? undefined : ({ data }) => void handleScan(data)}
            />
          ) : (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.xxl }}>
              <Text style={[type.body, { color: theme.text, textAlign: 'center', lineHeight: 21 }]}>
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
            <>
              <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: payload ? 'rgba(0,0,0,0.48)' : 'rgba(0,0,0,0.12)' }]} />
              {!payload ? (
                <>
                  <ScannerCorners color="#fff" />
                  <Animated.View
                    pointerEvents="none"
                    style={{
                      position: 'absolute',
                      left: '18%',
                      right: '18%',
                      top: '50%',
                      height: 2,
                      borderRadius: 1,
                      backgroundColor: theme.accent,
                      boxShadow: `0 0 10px ${theme.accent}`,
                      transform: [{ translateY: lineTranslate }],
                    }}
                  />
                </>
              ) : null}
            </>
          ) : null}

          {approved ? (
            <View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.58)' }]}>
              <Animated.View style={{ alignItems: 'center', opacity: successProgress, transform: [{ scale: successScale }] }}>
                <View style={{ width: 76, height: 76, borderRadius: 38, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.accent }}>
                  <CheckGlyph />
                </View>
                <Text style={{ color: '#fff', fontSize: 17, fontWeight: '800', marginTop: space.md }}>{t('qrLogin.approved')}</Text>
              </Animated.View>
            </View>
          ) : null}
          {joiningJourney ? (
            <View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.58)' }]}>
              <ActivityIndicator size="large" color="#fff" />
              <Text style={{ color: '#fff', fontSize: 15, fontWeight: '700', marginTop: space.md }}>{t('qrLogin.joiningJourney')}</Text>
            </View>
          ) : null}
        </View>

        <View style={{ minHeight: 66, justifyContent: 'center' }}>
          <Text style={[type.body, { color: payload ? theme.text : theme.text2, textAlign: 'center', marginTop: space.lg, lineHeight: 21, fontWeight: payload ? '600' : '400' }]}>
            {payload ? t('qrLogin.confirmHint') : t(journeyOnly ? 'qrLogin.journeyScanHint' : 'qrLogin.scanHint')}
          </Text>
          {error ? <Text style={[type.caption, { color: theme.danger, textAlign: 'center', marginTop: space.xs }]}>{error}</Text> : null}
        </View>

        {payload && !approved ? (
          <Animated.View style={{ gap: space.xs, marginTop: space.md, opacity: confirmProgress, transform: [{ translateY: confirmTranslate }] }}>
            <Press
              disabled={busy}
              onPress={() => void approve()}
              style={{ height: 54, borderRadius: radius.pill, flexDirection: 'row', gap: space.xs, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.accent }}
            >
              {busy ? <ActivityIndicator size="small" color="#fff" /> : null}
              <Text style={{ color: '#fff', fontSize: 16, fontWeight: '800' }}>{busy ? t('qrLogin.approving') : t('qrLogin.confirm')}</Text>
            </Press>
            <Press disabled={busy} onPress={resetScan} style={{ height: 44, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ color: theme.text2, fontSize: 14, fontWeight: '600' }}>{t('qrLogin.rescan')}</Text>
            </Press>
          </Animated.View>
        ) : null}
      </View>
    </DetailPage>
  );
}
