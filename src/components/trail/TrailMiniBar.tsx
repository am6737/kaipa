// TrailMiniBar.tsx — the pill over the screens that hide the tab bar while a
// recording exists and its page is minimised (with the bar up, its 记录 tab
// shows the clock and leads back instead). One tap goes back to the map; a drag moves it out of
// the way. On release it snaps to the left edge, the middle or the right edge,
// and keeps that spot (and its height) across launches.
import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useEffect, useMemo, useState } from 'react';
import { Text, View, useWindowDimensions } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedReaction, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { layout, radius, space, type } from '../../design-system';
import { useI18n } from '../../i18n';
import { MONO } from '../../theme/fonts';
import type { Theme } from '../../theme/theme';
import { useTrail, useTrailSnapshot } from '../../trail/TrailContext';
import { formatClock, splitDistance } from '../../lib/trailGeo';
import { trailMovingMs } from '../../lib/trailRecorder';
import { BOTTOM_TABS_HEIGHT } from '../BottomTabs';

const POSITION_KEY = 'kaipa.trail.miniPosition.v1';
const PILL_HEIGHT = 36;
const SNAP = { damping: 22, stiffness: 260, mass: 0.8 };

/** 0 left edge, 1 middle, 2 right edge. */
type Anchor = 0 | 1 | 2;
/** `top` is the share of the free vertical room, so a rotated or resized window keeps the spot. */
type Position = { anchor: Anchor; top: number };

// Module level so reopening and minimising the page does not flash the pill back to the top first.
let savedPosition: Position = { anchor: 1, top: 0 };
let positionLoaded = false;

function loadPosition(): Promise<Position> {
  if (positionLoaded) return Promise.resolve(savedPosition);
  return AsyncStorage.getItem(POSITION_KEY)
    .then((raw) => {
      const value = raw ? (JSON.parse(raw) as Partial<Position>) : null;
      if (value && (value.anchor === 0 || value.anchor === 1 || value.anchor === 2) && typeof value.top === 'number') {
        savedPosition = { anchor: value.anchor, top: Math.min(1, Math.max(0, value.top)) };
      }
    })
    .catch(() => undefined)
    .then(() => {
      positionLoaded = true;
      return savedPosition;
    });
}

function storePosition(anchor: Anchor, top: number) {
  savedPosition = { anchor, top };
  positionLoaded = true;
  void AsyncStorage.setItem(POSITION_KEY, JSON.stringify(savedPosition)).catch(() => undefined);
}

export function TrailMiniBar({ theme, hidden }: { theme: Theme; hidden: boolean }) {
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const { width: screenW, height: screenH } = useWindowDimensions();
  const trail = useTrail();
  const { session } = useTrailSnapshot();
  const [, setTick] = useState(0);
  const recording = session?.status === 'recording' && !hidden;

  const minTop = insets.top + space.xs;
  // Above the tab bar, so the pill never covers a tab.
  const maxTop = Math.max(minTop, screenH - Math.max(insets.bottom, space.sm) - BOTTOM_TABS_HEIGHT - PILL_HEIGHT - space.sm);
  const edge = layout.pagePadding;

  const anchor = useSharedValue<number>(savedPosition.anchor);
  const pillW = useSharedValue(0);
  const x = useSharedValue(-1);
  const y = useSharedValue(minTop + savedPosition.top * (maxTop - minTop));
  const dragging = useSharedValue(false);
  const startX = useSharedValue(0);
  const startY = useSharedValue(0);
  const bounds = useSharedValue({ minTop, maxTop, screenW, edge });

  useEffect(() => {
    bounds.value = { minTop, maxTop, screenW, edge };
    if (!dragging.value) y.value = minTop + savedPosition.top * (maxTop - minTop);
  }, [bounds, dragging, edge, maxTop, minTop, screenW, y]);

  useEffect(() => {
    let live = true;
    void loadPosition().then((value) => {
      if (!live) return;
      anchor.value = value.anchor;
      y.value = bounds.value.minTop + value.top * (bounds.value.maxTop - bounds.value.minTop);
    });
    return () => {
      live = false;
    };
  }, [anchor, bounds, y]);

  // The pill's width changes with the clock and distance; keep it pinned to its edge.
  useAnimatedReaction(
    () => {
      const b = bounds.value;
      if (pillW.value === 0) return -1;
      if (anchor.value === 0) return b.edge;
      if (anchor.value === 2) return b.screenW - b.edge - pillW.value;
      return (b.screenW - pillW.value) / 2;
    },
    (target, previous) => {
      if (target < 0 || dragging.value) return;
      if (x.value < 0) x.value = target;
      else if (target !== previous) x.value = withSpring(target, SNAP);
    },
  );

  useEffect(() => {
    if (!recording) return;
    const timer = setInterval(() => setTick((value) => value + 1), 1000);
    return () => clearInterval(timer);
  }, [recording]);

  const openTrail = trail.openTrail;
  // Built once (per openTrail): the pill re-renders every second for the clock.
  const gesture = useMemo(() => {
    const pan = Gesture.Pan()
      .minDistance(6)
      .onStart(() => {
        dragging.value = true;
        startX.value = x.value;
        startY.value = y.value;
      })
      .onUpdate((event) => {
        const b = bounds.value;
        x.value = Math.min(b.screenW - pillW.value, Math.max(0, startX.value + event.translationX));
        y.value = Math.min(b.maxTop, Math.max(b.minTop, startY.value + event.translationY));
      })
      .onEnd((event) => {
        const b = bounds.value;
        // Where the pill would coast to, so a flick toward an edge lands there.
        const center = x.value + pillW.value / 2 + event.velocityX * 0.12;
        const next: Anchor = center < b.screenW / 3 ? 0 : center > (b.screenW * 2) / 3 ? 2 : 1;
        const targetX = next === 0 ? b.edge : next === 2 ? b.screenW - b.edge - pillW.value : (b.screenW - pillW.value) / 2;
        const targetY = Math.min(b.maxTop, Math.max(b.minTop, y.value + event.velocityY * 0.08));
        anchor.value = next;
        x.value = withSpring(targetX, SNAP);
        y.value = withSpring(targetY, SNAP);
        const share = b.maxTop > b.minTop ? (targetY - b.minTop) / (b.maxTop - b.minTop) : 0;
        runOnJS(storePosition)(next, share);
      })
      .onFinalize(() => {
        dragging.value = false;
      });
    const tap = Gesture.Tap()
      .maxDistance(6)
      .onEnd((_event, success) => {
        if (success) runOnJS(openTrail)();
      });
    return Gesture.Race(pan, tap);
  }, [anchor, bounds, dragging, openTrail, pillW, startX, startY, x, y]);

  const pillStyle = useAnimatedStyle(() => ({
    opacity: x.value < 0 ? 0 : 1,
    transform: [{ translateX: Math.max(0, x.value) }, { translateY: y.value }],
  }));

  if (!session || trail.open || hidden) return null;
  const distance = splitDistance(session.totals.distM);
  const dot = recording ? theme.trailMine : theme.text3;

  return (
    <View pointerEvents="box-none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 310 }}>
      <GestureDetector gesture={gesture}>
        <Animated.View
          accessible
          accessibilityRole="button"
          accessibilityLabel={t('trail.mini.open')}
          accessibilityHint={t('trail.mini.dragHint')}
          accessibilityActions={[{ name: 'activate' }]}
          onAccessibilityAction={(event) => {
            if (event.nativeEvent.actionName === 'activate') openTrail();
          }}
          onLayout={(event) => {
            pillW.value = event.nativeEvent.layout.width;
          }}
          style={[
            {
              position: 'absolute',
              top: 0,
              left: 0,
              height: PILL_HEIGHT,
              paddingHorizontal: space.md,
              borderRadius: radius.pill,
              flexDirection: 'row',
              alignItems: 'center',
              gap: space.sm,
              backgroundColor: theme.controlSurface,
              boxShadow: theme.dark ? '0px 2px 10px rgba(0,0,0,0.5)' : '0px 2px 10px rgba(0,0,0,0.14)',
            },
            pillStyle,
          ]}
        >
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: dot }} />
          <Text style={[type.labelStrong, { color: theme.text }]}>{t(`trail.status.${session.status}`)}</Text>
          <Text style={[type.small, { fontFamily: MONO, color: theme.text2 }]}>{formatClock(trailMovingMs(session))}</Text>
          <Text style={[type.small, { fontFamily: MONO, color: theme.text2 }]}>{`${distance.value} ${distance.unit}`}</Text>
        </Animated.View>
      </GestureDetector>
    </View>
  );
}
