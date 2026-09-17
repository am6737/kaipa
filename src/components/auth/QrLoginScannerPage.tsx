import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Easing, Platform, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { CameraView, PermissionStatus, useCameraPermissions, type PermissionResponse } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import Svg, { Path } from 'react-native-svg';
import { Theme } from '../../theme/theme';
import { Press } from '../Press';
import { DetailPage, radius, space, type } from '../../design-system';
import { approveQrLoginRequest, markQrLoginScanned, parseQrLoginPayload, QrLoginPayload } from '../../lib/qrLogin';
import { parseJourneyInviteUrl, type JourneyInvite } from '../../lib/journeyInvite';
import { useI18n } from '../../i18n';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Flashlight, X } from 'lucide-react-native';

// The camera permission lookup is async, so without this every visit renders at least one
// frame before the permission is known — which flashed the permission panel before the
// camera took over. Keeping the last response lets a repeat visit mount the camera on the
// first frame instead.
let cachedCameraPermission: PermissionResponse | null = null;

// Startup choreography, both are cushions around native work that JS cannot observe.
// ARM_DELAY_MS lets the prop-driven session edits (barcode outputs, capture preset) land
// before the session is started; SETTLE_MS covers the start itself plus the dark frames the
// sensor emits while auto-exposure converges. ARM_FALLBACK_MS arms the session even if the
// readiness callback never arrives.
const ARM_DELAY_MS = 250;
const SETTLE_MS = 700;
const ARM_FALLBACK_MS = 1200;

const CheckGlyph = ({ color = '#fff', size = 34 }: { color?: string; size?: number }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="m5 12.5 4.2 4.2L19 7" stroke={color} strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

function ScannerCorners({ color, pulse }: { color: string; pulse: Animated.Value }) {
  const scale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.07] });
  return (
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { transform: [{ scale }] }]}>
      <Svg width="100%" height="100%" viewBox="0 0 100 100">
        <Path d="M 20 4 H 13 Q 4 4 4 13 V 20" fill="none" stroke={color} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
        <Path d="M 80 4 H 87 Q 96 4 96 13 V 20" fill="none" stroke={color} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
        <Path d="M 4 80 V 87 Q 4 96 13 96 H 20" fill="none" stroke={color} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
        <Path d="M 96 80 V 87 Q 96 96 87 96 H 80" fill="none" stroke={color} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
      </Svg>
    </Animated.View>
  );
}

export function QrLoginScannerPage({ theme, journeyOnly = false, onBack, onApproved, onJourneyInvite }: { theme: Theme; journeyOnly?: boolean; onBack: () => void; onApproved: () => void; onJourneyInvite: (invite: JourneyInvite) => Promise<void> }) {
  const { t } = useI18n();
  const [permission, requestPermission] = useCameraPermissions();
  const effectivePermission = permission ?? cachedCameraPermission;
  const [payload, setPayload] = useState<QrLoginPayload | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [joiningJourney, setJoiningJourney] = useState(false);
  const [approved, setApproved] = useState(false);
  const [torch, setTorch] = useState(false);
  const [configured, setConfigured] = useState(false);
  const [sessionActive, setSessionActive] = useState(false);
  const [veilVisible, setVeilVisible] = useState(true);
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const scanLocked = useRef(false);
  const invalidTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const confirmProgress = useRef(new Animated.Value(0)).current;
  const successProgress = useRef(new Animated.Value(0)).current;
  const cornerPulse = useRef(new Animated.Value(0)).current;
  const veilOpacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (permission) cachedCameraPermission = permission;
  }, [permission]);

  // Backstop for devices that never commit the capture graph at all (expo-camera returns early
  // from the iOS session start when there is no camera device, e.g. the simulator). Worst
  // case the veil lifts onto the plain black preview, which is the previous behaviour.
  useEffect(() => {
    if (configured) return;
    const timer = setTimeout(() => setConfigured(true), 3000);
    return () => clearTimeout(timer);
  }, [configured]);

  // `onCameraReady` only means the capture graph has been committed. expo-camera attaches the
  // barcode scanner's outputs off the `onBarcodeScanned` / `barcodeScannerSettings` props, and
  // those props reach the native view after that callback has already been emitted — it then
  // runs beginConfiguration / addOutput / commitConfiguration against the *running* session,
  // and rebuilding a live session's capture pipeline blanks the preview. (expo/expo#47173
  // describes the same failure for the capture preset: reconfiguring after start made the
  // camera "show dark frames".) That blank is the dark second this page used to show *after*
  // the loading had gone. Mounting stopped and starting once keeps the graph built a single
  // time, while nothing is being previewed.
  useEffect(() => {
    if (!configured) return;
    const timer = setTimeout(() => setSessionActive(true), ARM_DELAY_MS);
    return () => clearTimeout(timer);
  }, [configured]);

  // `onCameraReady` is emitted from the native session queue, which is already running by the
  // time the JS props are attached — if that race ever lands the other way the callback is
  // lost, so arm on a timer as well instead of leaving the session stopped. By now the props
  // have long been applied, so the session still starts fully configured.
  useEffect(() => {
    const timer = setTimeout(() => setSessionActive(true), ARM_FALLBACK_MS);
    return () => clearTimeout(timer);
  }, []);

  // There is no JS signal for "the first frame has been painted", and the frames a sensor
  // produces right after a start are dark until auto-exposure settles. So the veil covers the
  // whole startup window — including anything that lands later than expected — and then gets
  // out of the way quickly.
  useEffect(() => {
    if (!sessionActive) return;
    let fade: ReturnType<typeof Animated.timing> | null = null;
    const timer = setTimeout(() => {
      fade = Animated.timing(veilOpacity, {
        toValue: 0,
        duration: 180,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      });
      fade.start(({ finished }) => {
        if (finished) setVeilVisible(false);
      });
    }, SETTLE_MS);
    return () => {
      clearTimeout(timer);
      fade?.stop();
    };
  }, [sessionActive, veilOpacity]);

  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(cornerPulse, { toValue: 1, duration: 1250, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      Animated.timing(cornerPulse, { toValue: 0, duration: 1250, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
    ]));
    if (effectivePermission?.granted && !payload) loop.start();
    return () => loop.stop();
  }, [cornerPulse, payload, effectivePermission?.granted]);

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

  const permissionDenied = effectivePermission?.granted === false;
  const confirmTranslate = confirmProgress.interpolate({ inputRange: [0, 1], outputRange: [24, 0] });
  const successScale = successProgress.interpolate({ inputRange: [0, 1], outputRange: [0.72, 1] });

  const frameSize = Math.min(width * 0.6, 280);
  const frameTop = Math.max(insets.top + 110, height * 0.34);

  return (
    <DetailPage
      theme={theme}
      onBack={onBack}
      left={(
        <Press accessibilityRole="button" accessibilityLabel="Close" onPress={onBack} style={styles.closeButton}>
          <X color="#fff" size={28} strokeWidth={2} />
        </Press>
      )}
      backgroundColor="#050505"
      flatChrome
      scrollable={false}
      hero={effectivePermission?.granted ? (
        <CameraView
          style={StyleSheet.absoluteFill}
          facing="back"
          // iOS only, and the reason this page has no black flash: the session is mounted
          // stopped so the prop-driven outputs are attached to a session that is not running,
          // then started once by the arming effect above.
          active={sessionActive}
          enableTorch={torch}
          // This page never captures a photo, and expo-camera's iOS default preset is `high`
          // (the device's largest format). With the barcode scanner's uncapped 32BGRA video
          // output attached, that allocates a full-sensor buffer (~48 MB on a 12 MP camera)
          // per frame. 720p is plenty for QR decoding, and it is now applied while the session
          // is stopped, so it costs no reconfiguration.
          pictureSize="1280x720"
          barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
          onCameraReady={() => setConfigured(true)}
          onMountError={() => {
            // Never strand the starting veil when the camera cannot open at all.
            setConfigured(true);
            setError(t('qrLogin.errorGeneric'));
          }}
          onBarcodeScanned={approved || payload || joiningJourney ? undefined : ({ data }) => void handleScan(data)}
        />
      ) : undefined}
    >
      <View style={[styles.immersivePage, !effectivePermission?.granted && styles.permissionBackground]}>
        {effectivePermission?.granted ? (
          <>
            <View pointerEvents="none" style={[styles.frame, { width: frameSize, height: frameSize, top: frameTop, left: (width - frameSize) / 2 }]}>
              <ScannerCorners color="#fff" pulse={cornerPulse} />
            </View>
            <View style={[styles.bottomChrome, { bottom: insets.bottom + (payload ? 136 : 26) }]}>
              {error ? <Text style={[styles.error, { color: '#ffb4ab' }]}>{error}</Text> : null}
              {!payload && sessionActive ? (
                <Press accessibilityRole="button" accessibilityLabel={t('qrLogin.allowCamera')} onPress={() => setTorch((value) => !value)} style={styles.torchButton}>
                  <Flashlight color="#fff" size={22} strokeWidth={1.8} />
                </Press>
              ) : null}
            </View>
          </>
        ) : permissionDenied ? (
          <View style={styles.permissionPanel}>
            <Text style={[type.body, { color: '#fff', textAlign: 'center', lineHeight: 21 }]}>{effectivePermission?.status === PermissionStatus.UNDETERMINED ? t('qrLogin.permissionHint') : t('qrLogin.permissionDenied')}</Text>
            <Press onPress={() => void requestPermission()} style={styles.allowButton}><Text style={styles.allowLabel}>{t('qrLogin.allowCamera')}</Text></Press>
            {Platform.OS === 'web' ? <Text style={[type.caption, { color: 'rgba(255,255,255,0.65)', textAlign: 'center', marginTop: space.md }]}>{t('qrLogin.webPermissionHint')}</Text> : null}
          </View>
        ) : null}

        {!permissionDenied && veilVisible ? (
          <Animated.View pointerEvents="none" style={[styles.startingVeil, { opacity: veilOpacity }]}>
            <ActivityIndicator size="large" color="#fff" />
            <Text style={styles.stateLabel}>{t('qrLogin.cameraStarting')}</Text>
          </Animated.View>
        ) : null}

        {approved ? (
          <View style={styles.stateOverlay}><Animated.View style={{ alignItems: 'center', opacity: successProgress, transform: [{ scale: successScale }] }}><View style={[styles.successCircle, { backgroundColor: theme.accent }]}><CheckGlyph /></View><Text style={styles.stateLabel}>{t('qrLogin.approved')}</Text></Animated.View></View>
        ) : null}
        {joiningJourney ? <View style={styles.stateOverlay}><ActivityIndicator size="large" color="#fff" /><Text style={styles.stateLabel}>{t('qrLogin.joiningJourney')}</Text></View> : null}

        {payload && !approved ? (
          <Animated.View style={[styles.confirmPanel, { opacity: confirmProgress, transform: [{ translateY: confirmTranslate }] }]}>
            <Press disabled={busy} onPress={() => void approve()} style={[styles.confirmButton, { backgroundColor: theme.accent }]}>{busy ? <ActivityIndicator size="small" color="#fff" /> : null}<Text style={styles.confirmLabel}>{busy ? t('qrLogin.approving') : t('qrLogin.confirm')}</Text></Press>
            <Press disabled={busy} onPress={resetScan} style={styles.rescanButton}><Text style={styles.rescanLabel}>{t('qrLogin.rescan')}</Text></Press>
          </Animated.View>
        ) : null}
      </View>
    </DetailPage>
  );
}

const styles = StyleSheet.create({
  immersivePage: { flex: 1 },
  permissionBackground: { backgroundColor: '#050505' },
  frame: { position: 'absolute' },
  closeButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  bottomChrome: { position: 'absolute', left: 24, right: 24, alignItems: 'center' },
  error: { fontSize: 12, marginTop: 6, textAlign: 'center' },
  torchButton: { marginTop: 22, width: 46, height: 46, borderRadius: 23, backgroundColor: 'rgba(78,78,78,0.78)', alignItems: 'center', justifyContent: 'center' },
  permissionPanel: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.xxl },
  startingVeil: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: '#050505' },
  allowButton: { marginTop: space.lg, minHeight: 48, paddingHorizontal: space.xl, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
  allowLabel: { color: '#111', fontSize: 15, fontWeight: '700' },
  stateOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.62)' },
  successCircle: { width: 76, height: 76, borderRadius: 38, alignItems: 'center', justifyContent: 'center' },
  stateLabel: { color: '#fff', fontSize: 17, fontWeight: '800', marginTop: space.md },
  confirmPanel: { position: 'absolute', left: 24, right: 24, bottom: 20, gap: space.xs },
  confirmButton: { height: 54, borderRadius: radius.pill, flexDirection: 'row', gap: space.xs, alignItems: 'center', justifyContent: 'center' },
  confirmLabel: { color: '#fff', fontSize: 16, fontWeight: '800' },
  rescanButton: { height: 44, alignItems: 'center', justifyContent: 'center' },
  rescanLabel: { color: '#fff', fontSize: 14, fontWeight: '600' },
});
