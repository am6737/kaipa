// HostShareSheet.tsx — v1 "现场分享 (offline live share)" host control surface.
// Immersive design language matching the prototype invite/guest-cover: full-bleed
// journey cover → gradient → a white QR "pass" floating on the dark photo →
// frosted-glass info/roster strips → calm setup states on plain bg.
//
// UI ONLY. phases/peers/activity are DEMO-simulated (useDemo* below) so the flow
// is visible without a backend. Replace with the real local server's events
// (onServerReady / onPeerJoin / onPeerUpload / ...) per docs/offline-live-share.md.
// No new native modules are used here.
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Alert, Linking, ActivityIndicator, Animated, ScrollView, Pressable, TextInput } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Theme } from '../../theme/theme';
import { Poi } from '../../data/pois';
import { MONO } from '../../theme/fonts';
import { Press } from '../Press';
import { Icon } from '../Icon';
import { WifiQR } from '../WifiQR';
import { PhotoTile } from '../PhotoTile';
import { Glass, GlassIconBtn } from '../Glass';
import { ToneAvatar } from '../ToneAvatar';
import { useI18n } from '../../i18n';

type Phase = 'starting' | 'needsHotspot' | 'live' | 'error';
type Peer = { id: string; name: string; tone: string };
type Moment = { id: string; tone: string; seed: string; by: string };

// Placeholder connection details — the real server fills these in onServerReady.
const DEMO = { ssid: 'Kaipa-林间分享', password: 'kaipa888', ip: '172.20.10.1', port: 8080 };
// Clean solid-dark backdrop for the live view (no full-bleed journey photo).
const HOST_BG = ['#17191C', '#0B0C0E'] as const;
const MOMENT_TONES = ['river', 'forest', 'ridge', 'snow', 'dawn', 'dusk'];
const LIGHTBOX_GRADIENT = ['rgba(0,0,0,0.5)', 'transparent', 'rgba(0,0,0,0.7)'] as const;
const LIGHTBOX_LOCS = [0, 0.4, 1] as const;

export function HostShareSheet({ theme, poi, onClose, onToast }: { theme: Theme; poi: Poi; onClose: () => void; onToast: (msg: string) => void }) {
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const [phase, setPhase] = useState<Phase>('starting');
  const [peers, setPeers] = useState<Peer[]>([]);
  const [moments, setMoments] = useState<Moment[]>([]);
  const [viewing, setViewing] = useState<Moment | null>(null);
  // Host can edit the hotspot name + password so the QR/manual details match
  // their real personal hotspot. Real server seeds these in onServerReady.
  const [ssid, setSsid] = useState(DEMO.ssid);
  const [password, setPassword] = useState(DEMO.password);

  const ty = useRef(new Animated.Value(600)).current;
  useEffect(() => {
    Animated.spring(ty, { toValue: 0, useNativeDriver: true, bounciness: 2, speed: 14 }).start();
  }, [ty]);

  // ── DEMO ONLY ────────────────────────────────────────────────────────────
  useEffect(() => {
    const boot = setTimeout(() => setPhase('live'), 800);
    return () => clearTimeout(boot);
  }, []);

  useEffect(() => {
    if (phase !== 'live') return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const join = (delay: number, name: string, tone: string) =>
      timers.push(setTimeout(() => {
        setPeers((p) => (p.some((x) => x.name === name) ? p : [...p, { id: name, name, tone }]));
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      }, delay));
    const upload = (delay: number, name: string, n: number) =>
      timers.push(setTimeout(() => {
        setMoments((m) => [
          ...Array.from({ length: n }, (_, k) => ({ id: `${name}-${delay}-${k}`, tone: MOMENT_TONES[(m.length + k) % MOMENT_TONES.length], seed: `${name}-${delay}-${k}`, by: name })),
          ...m,
        ]);
      }, delay));
    join(1500, '小明', 'river');
    join(4200, '阿强', 'forest');
    upload(5600, '阿强', 4);
    join(8000, '路人甲', 'dawn');
    return () => timers.forEach(clearTimeout);
  }, [phase]);
  // ── /DEMO ──────────────────────────────────────────────────────────────────

  const copy = async (value: string) => { await Clipboard.setStringAsync(value); onToast(t('journey.liveShare.copied')); };

  const endShare = () => {
    if (peers.length === 0) return onClose();
    Alert.alert(t('journey.liveShare.confirmEndTitle'), t('journey.liveShare.confirmEndBody', { n: peers.length }), [
      { text: t('journey.liveShare.keepSharing'), style: 'cancel' },
      { text: t('journey.liveShare.endNow'), style: 'destructive', onPress: onClose },
    ]);
  };

  const addr = `${DEMO.ip}:${DEMO.port}`;
  const live = phase === 'live';

  return (
    <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: theme.bg, zIndex: 160, transform: [{ translateY: ty }] }]}>
      {live ? (
        <LinearGradient colors={HOST_BG} style={StyleSheet.absoluteFill} />
      ) : null}

      {/* close */}
      <View style={{ position: 'absolute', top: insets.top + 10, right: 14, zIndex: 30 }}>
        {live ? (
          <GlassIconBtn theme={theme} size={38} onPress={endShare}><Icon name="close" color="#fff" size={16} /></GlassIconBtn>
        ) : (
          <Press onPress={onClose} style={{ width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)' }}>
            <Icon name="close" color={theme.text} size={16} />
          </Press>
        )}
      </View>

      {phase === 'starting' ? <Starting theme={theme} t={t} /> : null}
      {phase === 'needsHotspot' ? <NeedsHotspot theme={theme} t={t} insets={insets} onReady={() => setPhase('starting')} /> : null}
      {phase === 'error' ? <ErrorView theme={theme} t={t} onRetry={() => setPhase('starting')} /> : null}

      {live ? (
        <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingTop: insets.top + 56, paddingHorizontal: 22, paddingBottom: insets.bottom + 20 }}>
          {/* title */}
          <Text style={{ fontSize: 26, fontWeight: '800', color: '#fff', letterSpacing: -0.5, textAlign: 'center', textShadowColor: 'rgba(0,0,0,0.4)', textShadowRadius: 14, textShadowOffset: { width: 0, height: 1 } }} numberOfLines={2}>{poi.name}</Text>
          {poi.region ? <Text style={{ fontFamily: MONO, fontSize: 12, color: 'rgba(255,255,255,0.72)', textAlign: 'center', marginTop: 8, letterSpacing: 0.3 }}>{poi.region}</Text> : null}

          {/* QR pass */}
          <View style={{ alignItems: 'center', marginTop: 26, marginBottom: 8 }}>
            <View style={{ borderRadius: 24, shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 24, shadowOffset: { width: 0, height: 12 }, elevation: 10 }}>
              <WifiQR ssid={ssid} password={password} size={peers.length > 0 ? 168 : 208} />
            </View>
          </View>

          {/* manual connect (glass) — hotspot name + password are editable */}
          <Glass solidOnAndroid theme={theme} radius={16} intensity={30} style={{ marginTop: 18 }}>
            <View>
              <GlassEditRow label={t('journey.liveShare.hotspotLabel')} value={ssid} onChange={setSsid} maxLength={32} copyLabel={t('journey.liveShare.copy')} onCopy={() => copy(ssid)} />
              <RowDivider />
              <GlassEditRow label={t('journey.liveShare.passwordLabel')} value={password} onChange={setPassword} maxLength={63} copyLabel={t('journey.liveShare.copy')} onCopy={() => copy(password)} />
              <RowDivider />
              <GlassCopyRow label={t('journey.liveShare.addrLabel')} value={addr} copyLabel={t('journey.liveShare.copy')} onCopy={() => copy(addr)} />
            </View>
          </Glass>

          {/* roster — who's here + how many they shared */}
          {peers.length > 0 ? (
            <Glass solidOnAndroid theme={theme} radius={16} intensity={30} style={{ marginTop: 18 }}>
              <View style={{ paddingHorizontal: 16, paddingBottom: 6 }}>
                <Text style={{ fontSize: 12.5, fontWeight: '600', color: 'rgba(255,255,255,0.6)', paddingTop: 14, paddingBottom: 4 }}>
                  {t('journey.liveShare.joinedCount', { n: peers.length })}
                </Text>
                {peers.map((p, i) => {
                  const n = moments.filter((m) => m.by === p.name).length;
                  return (
                    <View key={p.id}>
                      {i > 0 ? <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: 'rgba(255,255,255,0.14)' }} /> : null}
                      <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 10 }}>
                        <ToneAvatar name={p.name} tone={p.tone} size={30} />
                        <Text style={{ flex: 1, fontSize: 15, fontWeight: '500', color: '#fff', marginLeft: 12 }} numberOfLines={1}>{p.name}</Text>
                        {n > 0 ? <Text style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.6)', marginLeft: 10 }}>{t('journey.liveShare.uploadedShort', { n })}</Text> : null}
                      </View>
                    </View>
                  );
                })}
              </View>
            </Glass>
          ) : null}

          {/* moments — gallery of shared photos; tap to open the detail */}
          {moments.length > 0 ? (
            <View style={{ marginTop: 24 }}>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', marginBottom: 14 }}>
                <Text style={{ fontFamily: MONO, fontSize: 21, fontWeight: '700', color: '#fff', textShadowColor: 'rgba(0,0,0,0.4)', textShadowRadius: 10 }}>{moments.length}</Text>
                <Text style={{ fontSize: 13, color: 'rgba(255,255,255,0.78)', marginLeft: 8 }}>{t('journey.liveShare.momentsLabel')}</Text>
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                {moments.map((m) => (
                  <Press key={m.id} onPress={() => setViewing(m)}>
                    <PhotoTile tone={m.tone} seed={m.seed} radius={14} style={{ width: 80, height: 80 }} />
                  </Press>
                ))}
              </ScrollView>
            </View>
          ) : null}

          <Text style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.6)', textAlign: 'center', marginTop: 18, lineHeight: 17 }}>{t('journey.liveShare.foregroundWarn')}</Text>

          <Press onPress={endShare} style={{ marginTop: 14, height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.32)', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.18)' }}>
            <Text style={{ fontSize: 16, fontWeight: '700', color: '#FF6961' }}>{t('journey.liveShare.end')}</Text>
          </Press>

          {__DEV__ ? <DevSwitch phase={phase} setPhase={setPhase} /> : null}
        </ScrollView>
      ) : null}

      {viewing ? (
        <MomentLightbox theme={theme} t={t} insets={insets} moment={viewing} peerTone={peers.find((p) => p.name === viewing.by)?.tone} onClose={() => setViewing(null)} />
      ) : null}
    </Animated.View>
  );
}

// Tap a moment thumbnail → full-screen viewer. UI-only placeholder; when moments
// are real records this should route into the journey's 瞬间详情 (PhotoWall).
function MomentLightbox({ theme, t, insets, moment, peerTone, onClose }: { theme: Theme; t: ReturnType<typeof useI18n>['t']; insets: any; moment: Moment; peerTone?: string; onClose: () => void }) {
  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: '#000', zIndex: 40 }]}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose}>
        <PhotoTile tone={moment.tone} seed={moment.seed} style={StyleSheet.absoluteFill} />
      </Pressable>
      <LinearGradient colors={LIGHTBOX_GRADIENT} locations={LIGHTBOX_LOCS} style={StyleSheet.absoluteFill} pointerEvents="none" />
      <View style={{ position: 'absolute', top: insets.top + 10, right: 14 }}>
        <GlassIconBtn theme={theme} size={38} onPress={onClose}><Icon name="close" color="#fff" size={16} /></GlassIconBtn>
      </View>
      <View style={{ position: 'absolute', left: 20, right: 20, bottom: insets.bottom + 26, flexDirection: 'row', alignItems: 'center' }}>
        <ToneAvatar name={moment.by} tone={peerTone} size={32} ring="rgba(0,0,0,0.4)" />
        <Text style={{ fontSize: 14, color: '#fff', marginLeft: 10 }}>{t('journey.liveShare.sharedBy', { name: moment.by })}</Text>
      </View>
    </View>
  );
}

// ── setup states (calm, on bg) ───────────────────────────────────────────────

function Starting({ theme, t }: { theme: Theme; t: ReturnType<typeof useI18n>['t'] }) {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <ActivityIndicator color={theme.accent} />
      <Text style={{ fontSize: 16, fontWeight: '600', color: theme.text, marginTop: 18 }}>{t('journey.liveShare.starting')}</Text>
      <Text style={{ fontSize: 13, color: theme.text2, marginTop: 6 }}>{t('journey.liveShare.startingSub')}</Text>
    </View>
  );
}

function NeedsHotspot({ theme, t, insets, onReady }: { theme: Theme; t: ReturnType<typeof useI18n>['t']; insets: any; onReady: () => void }) {
  return (
    <View style={{ flex: 1, justifyContent: 'center', paddingHorizontal: 28, paddingBottom: insets.bottom }}>
      <View style={{ alignItems: 'center' }}>
        <View style={{ width: 76, height: 76, borderRadius: 38, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.accentSoft, marginBottom: 22 }}>
          <Icon name="compass" color={theme.accent} size={36} />
        </View>
        <Text style={{ fontSize: 20, fontWeight: '700', color: theme.text, letterSpacing: -0.3, marginBottom: 10, textAlign: 'center' }}>{t('journey.liveShare.needHotspotTitle')}</Text>
        <Text style={{ fontSize: 14, color: theme.text2, textAlign: 'center', lineHeight: 21, marginBottom: 26 }}>{t('journey.liveShare.needHotspotBody')}</Text>
      </View>
      <View style={{ marginBottom: 28 }}>
        <Step theme={theme} n={1} label={t('journey.liveShare.needHotspotStep1')} />
        <Step theme={theme} n={2} label={t('journey.liveShare.needHotspotStep2')} />
      </View>
      <Press onPress={() => Linking.openSettings()} style={{ height: 50, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)', marginBottom: 10 }}>
        <Text style={{ fontSize: 16, fontWeight: '600', color: theme.text }}>{t('journey.liveShare.openSettings')}</Text>
      </Press>
      <Press onPress={onReady} style={{ height: 50, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.accent }}>
        <Text style={{ fontSize: 16, fontWeight: '700', color: '#fff' }}>{t('journey.liveShare.hotspotReady')}</Text>
      </Press>
    </View>
  );
}

function ErrorView({ theme, t, onRetry }: { theme: Theme; t: ReturnType<typeof useI18n>['t']; onRetry: () => void }) {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 }}>
      <Text style={{ fontSize: 20, fontWeight: '700', color: theme.text, marginBottom: 10 }}>{t('journey.liveShare.errorTitle')}</Text>
      <Text style={{ fontSize: 14, color: theme.text2, textAlign: 'center', lineHeight: 20, marginBottom: 28 }}>{t('journey.liveShare.errorBody')}</Text>
      <Press onPress={onRetry} style={{ height: 50, paddingHorizontal: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.accent }}>
        <Text style={{ fontSize: 16, fontWeight: '700', color: '#fff' }}>{t('journey.liveShare.retry')}</Text>
      </Press>
    </View>
  );
}

// ── primitives ───────────────────────────────────────────────────────────────

function Step({ theme, n, label }: { theme: Theme; n: number; label: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 7 }}>
      <View style={{ width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)', marginRight: 12 }}>
        <Text style={{ fontSize: 12, fontWeight: '700', color: theme.text2 }}>{n}</Text>
      </View>
      <Text style={{ fontSize: 15, color: theme.text, flex: 1 }}>{label}</Text>
    </View>
  );
}

function GlassCopyRow({ label, value, copyLabel, onCopy }: { label: string; value: string; copyLabel: string; onCopy: () => void }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingLeft: 16, paddingRight: 10, minHeight: 50 }}>
      <Text style={{ fontSize: 14, color: 'rgba(255,255,255,0.7)', width: 48 }}>{label}</Text>
      <Text style={{ flex: 1, fontFamily: MONO, fontSize: 14, fontWeight: '600', color: '#fff' }} numberOfLines={1}>{value}</Text>
      <Press onPress={onCopy} style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 9, backgroundColor: 'rgba(255,255,255,0.18)' }}>
        <Text style={{ fontSize: 13, fontWeight: '600', color: '#fff' }}>{copyLabel}</Text>
      </Press>
    </View>
  );
}

// Like GlassCopyRow but the value is an inline-editable field (hotspot name / password).
function GlassEditRow({ label, value, onChange, copyLabel, onCopy, maxLength }: { label: string; value: string; onChange: (v: string) => void; copyLabel: string; onCopy: () => void; maxLength?: number }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingLeft: 16, paddingRight: 10, minHeight: 50 }}>
      <Text style={{ fontSize: 14, color: 'rgba(255,255,255,0.7)', width: 48 }}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        maxLength={maxLength}
        autoCorrect={false}
        autoCapitalize="none"
        spellCheck={false}
        selectTextOnFocus
        returnKeyType="done"
        style={{ flex: 1, fontFamily: MONO, fontSize: 14, fontWeight: '600', color: '#fff', padding: 0, marginRight: 8 }}
      />
      <Icon name="edit" color="rgba(255,255,255,0.45)" size={13} />
      <Press onPress={onCopy} style={{ marginLeft: 10, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 9, backgroundColor: 'rgba(255,255,255,0.18)' }}>
        <Text style={{ fontSize: 13, fontWeight: '600', color: '#fff' }}>{copyLabel}</Text>
      </Press>
    </View>
  );
}

function RowDivider() {
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: 'rgba(255,255,255,0.16)', marginLeft: 16 }} />;
}

// __DEV__-only phase preview (subtle, removable). Real server drives the phase.
function DevSwitch({ phase, setPhase }: { phase: Phase; setPhase: (p: Phase) => void }) {
  const phases: Phase[] = ['starting', 'needsHotspot', 'live', 'error'];
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 6, marginTop: 22, opacity: 0.45 }}>
      {phases.map((p) => (
        <Press key={p} onPress={() => setPhase(p)} style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 7, backgroundColor: phase === p ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.08)' }}>
          <Text style={{ fontFamily: MONO, fontSize: 9.5, color: '#fff' }}>{p}</Text>
        </Press>
      ))}
    </View>
  );
}
