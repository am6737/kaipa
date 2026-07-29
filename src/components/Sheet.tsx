// Sheet.tsx — draggable bottom sheet with snap detents (TrailSheet equivalent).
// Built on Animated + PanResponder (no extra gesture deps). The grabber/header
// drags the sheet; the body scrolls only when fully expanded.
import React, { useEffect, useMemo, useRef, useState, forwardRef, useImperativeHandle } from 'react';
import {
  View,
  Animated,
  PanResponder,
  StyleSheet,
  ViewStyle,
  StyleProp,
} from 'react-native';
import { GestureDetector, Gesture, ScrollView as GHScrollView } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Theme } from '../theme/theme';

interface Props {
  theme: Theme;
  /** visible sheet heights (ascending), e.g. [collapsed, mid, full] */
  snapHeights: number[];
  initialIndex?: number;
  onIndexChange?: (index: number) => void;
  header: React.ReactNode;
  children: React.ReactNode;
  containerStyle?: StyleProp<ViewStyle>;
  /** lift the whole sheet up by this many px (e.g. to clear a floating tab bar) */
  bottomOffset?: number;
  /** dragging/flicking below the lowest detent dismisses the sheet via this */
  onDismiss?: () => void;
  /** compact (POI-card) mode: hide the header, let the body bleed to the top,
      and reduce the drag affordance to a floating grab handle over the hero */
  compact?: boolean;
  /** semantic surface override for grouped collection sheets */
  backgroundColor?: string;
  /** remove the translucent-looking edge on fully opaque detail sheets */
  borderless?: boolean;
}

/** imperative handle so a parent can trigger the animated dismiss (e.g. a tap on
    the map outside the card), reusing the same slide-down as the drag gesture */
export interface TrailSheetHandle {
  dismiss: () => void;
  snapTo: (index: number) => void;
}

export const TrailSheet = forwardRef<TrailSheetHandle, Props>(function TrailSheet(
  {
    theme,
    snapHeights,
    initialIndex = 0,
    onIndexChange,
    header,
    children,
    containerStyle,
    bottomOffset = 0,
    onDismiss,
    compact = false,
    backgroundColor,
    borderless = false,
  },
  ref
) {
  const insets = useSafeAreaInsets();
  const bottomPad = 24 + insets.bottom; // clear the home indicator (sheet reaches bottom)
  const maxH = snapHeights[snapHeights.length - 1];
  // translateY measured from fully-open (translateY = maxH - currentHeight)
  const yFor = (h: number) => maxH - h;
  // fully off-screen (below the visible area) — the closed / dismissed position
  const hiddenY = maxH + bottomOffset + 20;
  const openY = yFor(snapHeights[initialIndex]);
  const [index, setIndex] = useState(initialIndex);
  const translateY = useRef(new Animated.Value(hiddenY)).current;
  const startY = useRef(hiddenY);
  const currentY = useRef(hiddenY);
  // live state read by the (created-once) pan responder callbacks
  const scrollY = useRef(0);
  const compactRef = useRef(compact);
  const expandedRef = useRef(false);

  useEffect(() => {
    const id = translateY.addListener(({ value }) => {
      currentY.current = value;
    });
    // entrance: slide up from off-screen to the initial detent
    Animated.spring(translateY, {
      toValue: openY,
      useNativeDriver: true,
      bounciness: 2,
      speed: 16,
    }).start();
    return () => translateY.removeListener(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const dismiss = () => {
    Animated.timing(translateY, { toValue: hiddenY, duration: 220, useNativeDriver: true }).start(() => {
      onDismiss?.();
    });
  };
  // let the parent dismiss the sheet imperatively (tap-outside) with the same anim
  useImperativeHandle(ref, () => ({ dismiss, snapTo }));

  const snapTo = (i: number, vy = 0) => {
    const clamped = Math.max(0, Math.min(snapHeights.length - 1, i));
    setIndex(clamped);
    onIndexChange?.(clamped);
    Animated.spring(translateY, {
      toValue: yFor(snapHeights[clamped]),
      useNativeDriver: true,
      velocity: vy,
      bounciness: 2,
      speed: 16,
    }).start();
  };

  const nearestIndex = (y: number) => {
    let best = 0;
    let bestD = Infinity;
    snapHeights.forEach((h, i) => {
      const d = Math.abs(yFor(h) - y);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    return best;
  };

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_e, g) => {
        // compact mode decides in the capture phase (it wraps the scroll view)
        if (compactRef.current) return false;
        return Math.abs(g.dy) > 4;
      },
      // compact (POI card): the whole card is draggable. Capture the gesture
      // before the inner ScrollView so a swipe-down anywhere dismisses — but
      // once expanded, only a downward pull from the top dismisses, otherwise
      // the body is left free to scroll.
      onMoveShouldSetPanResponderCapture: (_e, g) => {
        if (!compactRef.current) return false;
        if (Math.abs(g.dy) <= 4) return false;
        if (!expandedRef.current) return true;
        return g.dy > 0 && scrollY.current <= 0;
      },
      onPanResponderGrant: () => {
        startY.current = currentY.current;
      },
      onPanResponderMove: (_e, g) => {
        let next = startY.current + g.dy;
        // allow dragging down past the lowest detent toward the dismissed state
        next = Math.max(-30, Math.min(onDismiss ? hiddenY : maxH, next));
        translateY.setValue(next);
      },
      onPanResponderRelease: (_e, g) => {
        const projected = currentY.current + g.vy * 90;
        const lowestY = yFor(snapHeights[0]);
        // dismiss when dragged/flicked below the lowest detent
        if (onDismiss && (projected > lowestY + 80 || (g.vy > 0.6 && nearestIndex(currentY.current) === 0))) {
          dismiss();
          return;
        }
        let i = nearestIndex(projected);
        // velocity boost: a firm flick jumps a detent
        if (g.vy < -0.6) i = nearestIndex(currentY.current) + 1;
        else if (g.vy > 0.6) i = nearestIndex(currentY.current) - 1;
        snapTo(i, g.vy);
      },
    })
  ).current;

  // ── sheet-body drag coordination (react-native-gesture-handler) ──────────
  // The list and compact POI card can scroll when expanded, but a downward pull
  // at scroll position zero belongs to the sheet. Gesture Handler runs the pan
  // simultaneously with the scroll view so that gesture collapses or dismisses
  // the sheet consistently on both iOS and Android.
  const scrollRef = useRef<any>(null);
  const dragging = useRef(false);
  const dragBase = useRef(0);
  const dragOffset = useRef(0);
  const onDragMove = (translationY: number) => {
    if (!dragging.current) {
      // start dragging the card only when it can't scroll there: any drag while
      // not fully expanded, or a downward pull once the body is scrolled to top.
      const canStart = !expandedRef.current || (translationY > 0 && scrollY.current <= 0);
      if (!canStart) return;
      dragging.current = true;
      dragBase.current = currentY.current;
      dragOffset.current = translationY; // so motion starts from the finger, no jump
    }
    let next = dragBase.current + (translationY - dragOffset.current);
    next = Math.max(-30, Math.min(onDismiss ? hiddenY : maxH, next));
    translateY.setValue(next);
  };
  const onDragEnd = (vy: number) => {
    if (!dragging.current) return;
    dragging.current = false;
    const projected = currentY.current + vy * 90;
    const lowestY = yFor(snapHeights[0]);
    if (onDismiss && (projected > lowestY + 80 || (vy > 0.6 && nearestIndex(currentY.current) === 0))) {
      dismiss();
      return;
    }
    let i = nearestIndex(projected);
    if (vy < -0.6) i = nearestIndex(currentY.current) + 1;
    else if (vy > 0.6) i = nearestIndex(currentY.current) - 1;
    snapTo(i, vy);
  };
  // the gesture is created once; reach the latest closures through refs
  const dragMoveRef = useRef(onDragMove);
  const dragEndRef = useRef(onDragEnd);
  dragMoveRef.current = onDragMove;
  dragEndRef.current = onDragEnd;
  const sheetBodyGesture = useMemo(
    () =>
      Gesture.Pan()
        .runOnJS(true)
        .activeOffsetY([-8, 8]) // only engage on a vertical drag; let taps/horizontal pass
        .simultaneousWithExternalGesture(scrollRef)
        .onBegin(() => {
          dragging.current = false;
        })
        .onUpdate((e) => dragMoveRef.current(e.translationY))
        // RNGH velocity is px/s; the snap thresholds below are tuned for px/ms.
        .onEnd((e) => dragEndRef.current(e.velocityY / 1000))
        .onFinalize(() => {
          if (dragging.current) dragEndRef.current(0);
        }),
    []
  );

  const expanded = index >= snapHeights.length - 1;
  const compactCanScroll = compact && snapHeights.length > 1 && expanded;
  // keep the refs the pan responder reads in sync with the latest render
  compactRef.current = compact;
  expandedRef.current = expanded;

  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: bottomOffset,
          height: maxH,
          transform: [{ translateY }],
        },
        containerStyle,
      ]}
    >
      <View
        style={[
          StyleSheet.absoluteFill,
          {
            backgroundColor: compact ? 'transparent' : backgroundColor || theme.surfaceTop,
            borderTopLeftRadius: compact ? 0 : 26,
            borderTopRightRadius: compact ? 0 : 26,
            borderWidth: compact || borderless ? 0 : StyleSheet.hairlineWidth,
            borderColor: theme.hairline,
          },
        ]}
      />

      {compact ? (
        // full-bleed card — the whole thing is draggable (swipe down anywhere to
        // dismiss). The hero fills the very top; rounded corners clip it. The
        // body scrolls only once expanded; before then a swipe dismisses. The
        // drag is driven by Gesture Handler so it cooperates with the scroll view
        // on Android too (see sheetBodyGesture above).
        <GestureDetector gesture={sheetBodyGesture}>
          <View style={[StyleSheet.absoluteFill, { borderTopLeftRadius: 26, borderTopRightRadius: 26, overflow: 'hidden' }]}>
            <GHScrollView
              ref={scrollRef}
              scrollEnabled={compactCanScroll}
              // the drag-to-dismiss is driven by sheetBodyGesture, so kill the
              // scroll view's own overscroll — its rubber-band would otherwise
              // expose a blank strip above the hero while pulling the card down.
              bounces={false}
              alwaysBounceVertical={false}
              overScrollMode="never"
              onScroll={(e) => {
                scrollY.current = e.nativeEvent.contentOffset.y;
              }}
              scrollEventThrottle={16}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ flexGrow: 1, paddingBottom: 0 }}
              style={{ flex: 1 }}
            >
              {children}
            </GHScrollView>
            {/* visual grab handle only — the whole card handles the drag */}
            <View pointerEvents="none" style={{ position: 'absolute', top: 8, left: 0, right: 0, alignItems: 'center' }}>
              <View
                style={{
                  width: 36,
                  height: 5,
                  borderRadius: 3,
                  backgroundColor: 'rgba(255,255,255,0.7)',
                  boxShadow: '0px 1px 3px rgba(0,0,0,0.25)',
                }}
              />
            </View>
          </View>
        </GestureDetector>
      ) : (
        <>
          {/* draggable header */}
          <View {...panResponder.panHandlers} style={{ paddingTop: 8 }}>
            <View
              style={{
                alignSelf: 'center',
                width: 36,
                height: 5,
                borderRadius: 3,
                backgroundColor: theme.text3,
                marginBottom: 6,
              }}
            />
            {header}
          </View>

          {/* body */}
          <View style={{ flex: 1 }}>
            <GestureDetector gesture={sheetBodyGesture}>
              <GHScrollView
                ref={scrollRef}
                scrollEnabled={expanded}
                bounces={false}
                alwaysBounceVertical={false}
                overScrollMode="never"
                onScroll={(e) => {
                  scrollY.current = e.nativeEvent.contentOffset.y;
                }}
                scrollEventThrottle={16}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ paddingBottom: bottomPad }}
                style={{ flex: 1 }}
              >
                {children}
              </GHScrollView>
            </GestureDetector>
          </View>
        </>
      )}
    </Animated.View>
  );
});
