// NearbyJoinSheet.tsx — v1.5 App-guest side of 现场分享: discover nearby live
// shares and join one. Symmetric to HostShareSheet. The immersive preview/joined
// states follow the prototype's invite-join design language (full-bleed cover →
// gradient → bottom-pinned host line / title / glass stats / accent CTA).
//
// UI ONLY. The nearby list + join steps are DEMO-simulated so the whole flow is
// visible without a backend. Replace useDemo* with the real BLE discovery +
// handshake → NEHotspotConfiguration → HTTP handoff (docs/offline-live-share.md
// §3.2). No new native modules are used here.
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Animated, Easing } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Theme } from '../../theme/theme';
import { MONO } from '../../theme/fonts';
import { Press } from '../Press';
import { Icon } from '../Icon';
import { PhotoTile } from '../PhotoTile';
import { Glass, GlassIconBtn } from '../Glass';
import { ToneAvatar } from '../ToneAvatar';
import { useI18n } from '../../i18n';

type View_ = 'list' | 'preview' | 'joining' | 'joined' | 'failed';
type NearbyShare = { id: string; journey: string; region: string; host: string; hostTone: string; tone: string; joined: number };

// DEMO ONLY: the live shares that "appear" over BLE.
const DEMO_NEARBY: NearbyShare[] = [
  { id: 's1', journey: '漓江精华段＋老寨山', region: '广西 · 桂林', host: '老张', hostTone: 'river', tone: 'river', joined: 3 },
  { id: 's2', journey: '武功山金顶穿越', region: '江西 · 萍乡', host: 'Mia', hostTone: 'forest', tone: 'ridge', joined: 1 },
];

const COVER_GRADIENT = ['rgba(0,0,0,0.42)', 'rgba(0,0,0,0.02)', 'rgba(0,0,0,0.40)', 'rgba(0,0,0,0.92)'] as const;
const COVER_LOCS = [0, 0.24, 0.6, 1] as const;

export function NearbyJoinSheet({ theme, onClose, onToast }: { theme: Theme; onClose: () => void; onToast: (msg: string) => void }) {
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const [view, setView] = useState<View_>('list');
  const [nearby, setNearby] = useState<NearbyShare[]>([]);
  const [selected, setSelected] = useState<NearbyShare | null>(null);
  const [step, setStep] = useState(0);

  // entrance slide-up
  const ty = useRef(new Animated.Value(600)).current;
  useEffect(() => {
    Animated.spring(ty, { toValue: 0, useNativeDriver: true, bounciness: 2, speed: 14 }).start();
  }, [ty]);

  // DEMO ONLY: shares trickle in as if discovered over BLE.
  useEffect(() => {
    if (view !== 'list') return;
    const timers = [
      setTimeout(() => setNearby([DEMO_NEARBY[0]]), 1100),
      setTimeout(() => setNearby(DEMO_NEARBY), 2600),
    ];
    return () => timers.forEach(clearTimeout);
  }, [view]);

  // DEMO ONLY: advance the join handshake steps, then land on "joined".
  useEffect(() => {
    if (view !== 'joining') return;
    setStep(0);
    const timers = [
      setTimeout(() => setStep(1), 900),
      setTimeout(() => setStep(2), 1900),
      setTimeout(() => setStep(3), 2900),
      setTimeout(() => setView('joined'), 3500),
    ];
    return () => timers.forEach(clearTimeout);
  }, [view]);

  const open = (s: NearbyShare) => { setSelected(s); setView('preview'); };
  const back = () => {
    if (view === 'preview') return setView('list');
    if (view === 'joining' || view === 'failed') return setView('preview');
    onClose();
  };

  const immersive = (view === 'preview' || view === 'joining') && selected;

  return (
    <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: theme.bg, zIndex: 160, transform: [{ translateY: ty }] }]}>
      {immersive && selected ? <Cover tone={selected.tone} seed={selected.journey} /> : null}

      {/* floating close */}
      <View style={{ position: 'absolute', top: insets.top + 10, right: 14, zIndex: 30 }}>
        {immersive ? (
          <GlassIconBtn theme={theme} size={38} onPress={back}>
            <Icon name="close" color="#fff" size={16} />
          </GlassIconBtn>
        ) : (
          <Press onPress={back} style={{ width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)' }}>
            <Icon name={view === 'list' ? 'close' : 'chevronL'} color={theme.text} size={view === 'list' ? 16 : 18} />
          </Press>
        )}
      </View>

      {view === 'list' ? <ListView theme={theme} t={t} insets={insets} nearby={nearby} onPick={open} onScanQr={() => onToast(t('journey.nearby.scanQr'))} /> : null}
      {view === 'preview' && selected ? <PreviewView theme={theme} t={t} insets={insets} share={selected} onJoin={() => setView('joining')} /> : null}
      {view === 'joining' && selected ? <JoiningView theme={theme} t={t} share={selected} step={step} /> : null}
      {view === 'joined' && selected ? <JoinedView theme={theme} t={t} insets={insets} share={selected} onEnter={() => { onToast(t('journey.nearby.enter')); onClose(); }} onDone={onClose} /> : null}
      {view === 'failed' ? <FailedView theme={theme} t={t} insets={insets} onRetry={() => setView('joining')} /> : null}
    </Animated.View>
  );
}

function Cover({ tone, seed }: { tone: string; seed: string }) {
  return (
    <View style={StyleSheet.absoluteFill}>
      <PhotoTile tone={tone} seed={seed + 'cover'} style={StyleSheet.absoluteFill} />
      <LinearGradient colors={COVER_GRADIENT} locations={COVER_LOCS} style={StyleSheet.absoluteFill} />
    </View>
  );
}

// ── list ─────────────────────────────────────────────────────────────────────

function ListView({ theme, t, insets, nearby, onPick, onScanQr }: { theme: Theme; t: ReturnType<typeof useI18n>['t']; insets: any; nearby: NearbyShare[]; onPick: (s: NearbyShare) => void; onScanQr: () => void }) {
  return (
    <View style={{ flex: 1, paddingTop: insets.top + 64, paddingHorizontal: 20 }}>
      <Text style={{ fontSize: 28, fontWeight: '800', color: theme.text, letterSpacing: -0.5 }}>{t('journey.nearby.title')}</Text>

      {nearby.length === 0 ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingBottom: 80 }}>
          <Radar theme={theme} />
          <Text style={{ fontSize: 16, fontWeight: '600', color: theme.text, marginTop: 28 }}>{t('journey.nearby.scanning')}</Text>
          <Text style={{ fontSize: 13, color: theme.text3, marginTop: 8, textAlign: 'center', lineHeight: 19, paddingHorizontal: 24 }}>{t('journey.nearby.scanHint')}</Text>
        </View>
      ) : (
        <>
          <Text style={{ fontSize: 13, color: theme.text2, marginTop: 6, marginBottom: 16 }}>{t('journey.nearby.foundCount', { n: nearby.length })}</Text>
          {nearby.map((s) => (
            <Press key={s.id} onPress={() => onPick(s)} style={{ flexDirection: 'row', alignItems: 'center', padding: 10, marginBottom: 10, borderRadius: 16, backgroundColor: theme.dark ? '#1c1c1e' : '#fff', borderWidth: StyleSheet.hairlineWidth, borderColor: theme.hairline }}>
              <PhotoTile tone={s.tone} seed={s.journey + 'cover'} radius={12} style={{ width: 56, height: 56 }} />
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={{ fontSize: 16, fontWeight: '700', color: theme.text }} numberOfLines={1}>{s.journey}</Text>
                <Text style={{ fontSize: 13, color: theme.text2, marginTop: 3 }} numberOfLines={1}>
                  {t('journey.nearby.sharingBy', { host: s.host })} · {t('journey.nearby.joinedCount', { n: s.joined })}
                </Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: theme.accentSofter, paddingHorizontal: 9, height: 24, borderRadius: 12, marginRight: 4 }}>
                <LiveDot color={theme.accent} />
                <Text style={{ fontSize: 11.5, fontWeight: '700', color: theme.accent, marginLeft: 5 }}>{t('journey.nearby.liveBadge')}</Text>
              </View>
            </Press>
          ))}
        </>
      )}

      <View style={{ position: 'absolute', left: 20, right: 20, bottom: insets.bottom + 16 }}>
        <Press onPress={onScanQr} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', height: 48, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, borderColor: theme.hairline }}>
          <Icon name="grid" color={theme.text2} size={16} />
          <Text style={{ fontSize: 14, fontWeight: '600', color: theme.text2, marginLeft: 8 }}>{t('journey.nearby.scanQr')}</Text>
        </Press>
      </View>
    </View>
  );
}

// ── preview (immersive) ────────────────────────────────────────────────────────

function PreviewView({ theme, t, insets, share, onJoin }: { theme: Theme; t: ReturnType<typeof useI18n>['t']; insets: any; share: NearbyShare; onJoin: () => void }) {
  const stats = [
    { n: String(share.joined), l: t('journey.nearby.statJoined') },
    { n: t('journey.nearby.statLiveVal'), l: t('journey.nearby.statLive') },
    { n: t('journey.nearby.statSaveVal'), l: t('journey.nearby.statSave') },
  ];
  return (
    <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 22, paddingBottom: insets.bottom + 20 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 13 }}>
        <ToneAvatar name={share.host} tone={share.hostTone} size={30} ring="rgba(0,0,0,0.4)" />
        <Text style={{ fontSize: 13.5, color: 'rgba(255,255,255,0.85)', marginLeft: 9 }}>
          <Text style={{ fontWeight: '700', color: '#fff' }}>{share.host}</Text> {t('journey.nearby.sharingSuffix')}
        </Text>
      </View>

      <Text style={{ fontSize: 34, fontWeight: '800', color: '#fff', letterSpacing: -0.6, lineHeight: 38, textShadowColor: 'rgba(0,0,0,0.45)', textShadowRadius: 16, textShadowOffset: { width: 0, height: 2 } }}>{share.journey}</Text>
      <Text style={{ fontFamily: MONO, fontSize: 12.5, color: 'rgba(255,255,255,0.78)', marginTop: 9, letterSpacing: 0.3 }}>{share.region}</Text>

      <Glass theme={theme} radius={16} intensity={30} style={{ marginTop: 18 }}>
        <View style={{ flexDirection: 'row' }}>
          {stats.map((s, i) => (
            <React.Fragment key={s.l}>
              <View style={{ flex: 1, alignItems: 'center', paddingVertical: 12 }}>
                <Text style={{ fontFamily: MONO, fontSize: 15.5, fontWeight: '700', color: '#fff' }}>{s.n}</Text>
                <Text style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.7)', marginTop: 3 }}>{s.l}</Text>
              </View>
              {i < stats.length - 1 ? <View style={{ width: StyleSheet.hairlineWidth, backgroundColor: 'rgba(255,255,255,0.18)' }} /> : null}
            </React.Fragment>
          ))}
        </View>
      </Glass>

      <Press onPress={onJoin} style={{ marginTop: 16, height: 54, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.accent }}>
        <Text style={{ fontSize: 16.5, fontWeight: '700', color: '#fff' }}>{t('journey.nearby.join')}</Text>
      </Press>
      <Text style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.6)', textAlign: 'center', marginTop: 12, lineHeight: 17 }}>{t('journey.nearby.previewDesc')}</Text>
    </View>
  );
}

// ── joining (immersive overlay card) ────────────────────────────────────────────

function JoiningView({ theme, t, share, step }: { theme: Theme; t: ReturnType<typeof useI18n>['t']; share: NearbyShare; step: number }) {
  const steps = [t('journey.nearby.step1'), t('journey.nearby.step2', { host: share.host }), t('journey.nearby.step3')];
  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28 }]}>
      <Glass theme={theme} radius={22} intensity={50} style={{ width: '100%' }}>
        <View style={{ padding: 24 }}>
          <Text style={{ fontSize: 17, fontWeight: '700', color: theme.text, textAlign: 'center', marginBottom: 22 }}>{t('journey.nearby.joiningTitle')}</Text>
          {steps.map((label, i) => {
            const done = step > i;
            const active = step === i;
            return (
              <View key={i} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 9 }}>
                <View style={{ width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: done ? theme.accent : active ? theme.accentSoft : (theme.dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)'), marginRight: 12 }}>
                  {done ? <Icon name="check" color="#fff" size={13} /> : <Text style={{ fontSize: 12, fontWeight: '700', color: active ? theme.accent : theme.text3 }}>{i + 1}</Text>}
                </View>
                <Text style={{ fontSize: 15, color: done || active ? theme.text : theme.text3, flex: 1 }}>{label}</Text>
              </View>
            );
          })}
        </View>
      </Glass>
    </View>
  );
}

// ── joined / failed (calm, on bg) ────────────────────────────────────────────────

function JoinedView({ theme, t, insets, share, onEnter, onDone }: { theme: Theme; t: ReturnType<typeof useI18n>['t']; insets: any; share: NearbyShare; onEnter: () => void; onDone: () => void }) {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, paddingBottom: insets.bottom }}>
      <SuccessRing theme={theme} />
      <Text style={{ fontSize: 21, fontWeight: '700', color: theme.text, marginTop: 22 }}>{t('journey.nearby.joinedTitle')}</Text>
      <Text style={{ fontSize: 13.5, color: theme.text2, marginTop: 10, textAlign: 'center', lineHeight: 21 }}>{t('journey.nearby.joinedBody', { journey: share.journey })}</Text>
      <Press onPress={onEnter} style={{ marginTop: 30, height: 50, paddingHorizontal: 40, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.accent }}>
        <Text style={{ fontSize: 15.5, fontWeight: '700', color: '#fff' }}>{t('journey.nearby.enter')}</Text>
      </Press>
      <Press onPress={onDone} style={{ marginTop: 10, height: 42, paddingHorizontal: 20, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ fontSize: 13.5, fontWeight: '500', color: theme.text2 }}>{t('journey.nearby.saveLater')}</Text>
      </Press>
    </View>
  );
}

function FailedView({ theme, t, insets, onRetry }: { theme: Theme; t: ReturnType<typeof useI18n>['t']; insets: any; onRetry: () => void }) {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, paddingBottom: insets.bottom }}>
      <Text style={{ fontSize: 20, fontWeight: '700', color: theme.text, marginBottom: 10 }}>{t('journey.nearby.failedTitle')}</Text>
      <Text style={{ fontSize: 14, color: theme.text2, textAlign: 'center', lineHeight: 20, marginBottom: 28 }}>{t('journey.nearby.failedBody')}</Text>
      <Press onPress={onRetry} style={{ height: 50, paddingHorizontal: 44, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.accent }}>
        <Text style={{ fontSize: 15.5, fontWeight: '700', color: '#fff' }}>{t('journey.nearby.retry')}</Text>
      </Press>
    </View>
  );
}

// ── animated bits ─────────────────────────────────────────────────────────────

function LiveDot({ color }: { color: string }) {
  const a = useRef(new Animated.Value(0.4)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(a, { toValue: 1, duration: 700, useNativeDriver: true }),
      Animated.timing(a, { toValue: 0.4, duration: 700, useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [a]);
  return <Animated.View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: color, opacity: a }} />;
}

function Radar({ theme }: { theme: Theme }) {
  const a = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.timing(a, { toValue: 1, duration: 2000, easing: Easing.out(Easing.ease), useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [a]);
  const scale = a.interpolate({ inputRange: [0, 1], outputRange: [0.5, 2.2] });
  const opacity = a.interpolate({ inputRange: [0, 1], outputRange: [0.5, 0] });
  return (
    <View style={{ width: 120, height: 120, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View style={{ position: 'absolute', width: 96, height: 96, borderRadius: 48, borderWidth: 2, borderColor: theme.accent, transform: [{ scale }], opacity }} />
      <View style={{ width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.accentSoft }}>
        <Icon name="compass" color={theme.accent} size={32} />
      </View>
    </View>
  );
}

function SuccessRing({ theme }: { theme: Theme }) {
  const a = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.spring(a, { toValue: 1, useNativeDriver: true, bounciness: 10, speed: 12 }).start();
  }, [a]);
  return (
    <Animated.View style={{ width: 84, height: 84, borderRadius: 42, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.accentSoft, transform: [{ scale: a }] }}>
      <Icon name="check" color={theme.accent} size={40} />
    </Animated.View>
  );
}
