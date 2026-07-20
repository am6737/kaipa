import React, { useEffect, useRef } from 'react';
import { View, Text, Pressable, StyleSheet, Platform, Animated, PanResponder, Easing, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Theme } from '../theme/theme';
import { Press } from '../components/Press';
import { PhotoTile } from '../components/PhotoTile';
import { useI18n } from '../i18n';
import type { GuestMoment } from './useGuestData';
import { paletteFor } from '../data/tones';
import { formatDuration } from '../lib/time';

// react-native-web has no native animation driver; using it there logs a warning
// and falls back to JS anyway, so opt in only on real native.
const USE_NATIVE_DRIVER = Platform.OS !== 'web';

interface Props {
  theme: Theme;
  moments: GuestMoment[];
  index: number;
  onIndexChange: (i: number) => void;
  onClose: () => void;
  onDelete?: (m: GuestMoment) => void;
  canDelete?: (m: GuestMoment) => boolean;
  durationMs?: number;
}

export function GuestLightbox({ theme, moments, index, onIndexChange, onClose, onDelete, canDelete, durationMs }: Props) {
  const { t } = useI18n();
  const { width: W } = useWindowDimensions();
  const photo = moments[index];

  const go = (d: number) => {
    const n = index + d;
    if (n >= 0 && n < moments.length) onIndexChange(n);
  };

  // ── horizontal paging: one continuous Animated.Value drives the strip,
  //    so committing a swipe never flickers back to the previous slide ──
  const pos = useRef(new Animated.Value(-index * W)).current;
  const widthRef = useRef(W); widthRef.current = W;
  const indexRef = useRef(index); indexRef.current = index;
  const lenRef = useRef(moments.length); lenRef.current = moments.length;
  const onIdxRef = useRef(onIndexChange); onIdxRef.current = onIndexChange;
  const animatingRef = useRef(false);

  // Keep the strip aligned to the active index (keyboard / tap-zone navigation, resize).
  useEffect(() => {
    Animated.timing(pos, { toValue: -index * W, duration: 220, easing: Easing.out(Easing.cubic), useNativeDriver: USE_NATIVE_DRIVER }).start();
  }, [index, W]); // eslint-disable-line react-hooks/exhaustive-deps

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      // single finger, clearly horizontal → swipe; ignore two-finger pinches so they
      // don't get misread as a left/right page change.
      onMoveShouldSetPanResponder: (_e, g) =>
        g.numberActiveTouches < 2 && Math.abs(g.dx) > 6 && Math.abs(g.dx) > Math.abs(g.dy) * 1.2,
      onPanResponderTerminationRequest: () => false,
      onPanResponderMove: (_e, g) => {
        if (animatingRef.current || g.numberActiveTouches >= 2) return;
        const i = indexRef.current;
        let dx = g.dx;
        // rubber-band at the ends
        if ((i <= 0 && dx > 0) || (i >= lenRef.current - 1 && dx < 0)) dx *= 0.3;
        pos.setValue(-i * widthRef.current + dx);
      },
      onPanResponderRelease: (_e, g) => {
        if (animatingRef.current) return;
        const i = indexRef.current;
        const w = widthRef.current;
        const threshold = Math.min(80, w * 0.2);
        // commit on a long-enough drag OR a quick flick
        const next = i < lenRef.current - 1 && (g.dx < -threshold || (g.dx < -10 && g.vx < -0.3));
        const prev = i > 0 && (g.dx > threshold || (g.dx > 10 && g.vx > 0.3));
        const settle = (toValue: number, after?: () => void) =>
          Animated.timing(pos, { toValue, duration: 220, easing: Easing.out(Easing.cubic), useNativeDriver: USE_NATIVE_DRIVER }).start(() => after?.());
        if (next || prev) {
          const target = i + (next ? 1 : -1);
          animatingRef.current = true;
          settle(-target * w, () => { animatingRef.current = false; onIdxRef.current(target); });
        } else {
          settle(-i * w);
        }
      },
    })
  ).current;

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') go(1);
      else if (e.key === 'ArrowLeft') go(-1);
      else if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [index]);

  if (!photo) return null;

  const p = paletteFor(photo.guest_tone);
  const deletable = canDelete?.(photo);

  const renderSlide = (m: GuestMoment) => {
    if (m.is_text) {
      const pp = paletteFor(m.guest_tone);
      return (
        <LinearGradient colors={[pp[0], '#0e1116']} start={{ x: 0.1, y: 0 }} end={{ x: 0.6, y: 1 }} style={StyleSheet.absoluteFill}>
          <View style={s.textCenter}>
            <Text style={s.textContent}>{m.caption || '记录了一个瞬间'}</Text>
          </View>
        </LinearGradient>
      );
    }
    if (m.uri) return <Image source={{ uri: m.uri }} contentFit="contain" style={StyleSheet.absoluteFill} />;
    return <PhotoTile tone={m.guest_tone} seed={m.id} style={StyleSheet.absoluteFill} />;
  };

  return (
    <View style={[StyleSheet.absoluteFill, s.root]} {...pan.panHandlers}>
      {/* swipeable image strip (only neighbours mounted) */}
      <Animated.View style={[StyleSheet.absoluteFill, { transform: [{ translateX: pos }] }]}>
        {moments.map((m, i) =>
          Math.abs(i - index) <= 1 ? (
            <View key={m.id} style={[s.slide, { left: i * W, width: W }]}>
              {renderSlide(m)}
            </View>
          ) : null
        )}
      </Animated.View>

      {/* tap zones for navigation (desktop click) */}
      {index > 0 && <Pressable onPress={() => go(-1)} style={s.tapLeft} />}
      {index < moments.length - 1 && <Pressable onPress={() => go(1)} style={s.tapRight} />}

      {/* top bar */}
      <LinearGradient colors={['rgba(0,0,0,0.55)', 'rgba(0,0,0,0)']} style={s.topBar}>
        <Press onPress={onClose} style={s.closeBtn}>
          <Text style={s.closeX}>✕</Text>
        </Press>
        <Text style={s.counter}>{index + 1} / {moments.length}</Text>
        <View style={{ width: 36 }} />
      </LinearGradient>

      {/* bottom info */}
      <LinearGradient colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.72)', 'rgba(0,0,0,0.88)']} locations={[0, 0.55, 1]} style={s.bottomBar}>
        {photo.caption && !photo.is_text && (
          <Text style={s.caption}>{photo.caption}</Text>
        )}
        <Text style={s.dayTime}>{[photo.day ? `Day ${photo.day}` : '', durationMs ? formatDuration(durationMs, t) : ''].filter(Boolean).join(' · ')}</Text>

        {deletable && onDelete && (
          <View style={s.actionRow}>
            <Press onPress={() => onDelete(photo)} style={s.deleteBtn}>
              <Text style={s.deleteText}>{t('guest.wall.deleteMoment')}</Text>
            </Press>
          </View>
        )}
      </LinearGradient>
    </View>
  );
}

const s = StyleSheet.create({
  root: {
    zIndex: 90,
    backgroundColor: '#000',
    overflow: 'hidden',
  },
  slide: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
  },
  textContent: {
    fontSize: 25,
    fontWeight: '700',
    color: '#fff',
    lineHeight: 36,
    textAlign: 'center',
    letterSpacing: -0.4,
  },
  tapLeft: {
    position: 'absolute',
    left: 0,
    top: 90,
    bottom: 160,
    width: '34%',
    zIndex: 5,
  },
  tapRight: {
    position: 'absolute',
    right: 0,
    top: 90,
    bottom: 160,
    width: '34%',
    zIndex: 5,
  },
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 60,
    paddingHorizontal: 16,
    paddingBottom: 26,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeX: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  counter: {
    fontFamily: 'monospace',
    fontSize: 12.5,
    fontWeight: '600',
    color: '#fff',
    letterSpacing: 0.5,
  },
  bottomBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 10,
    paddingHorizontal: 18,
    paddingTop: 40,
    paddingBottom: 30,
  },
  caption: {
    fontSize: 16.5,
    fontWeight: '600',
    color: '#fff',
    lineHeight: 22,
  },
  dayTime: {
    fontFamily: 'monospace',
    fontSize: 11,
    color: 'rgba(255,255,255,0.6)',
    marginTop: 7,
    letterSpacing: 0.4,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginTop: 16,
  },
  deleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
    backgroundColor: 'rgba(255,69,58,0.22)',
  },
  deleteText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#FF6961',
  },
});
