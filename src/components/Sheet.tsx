// Sheet.tsx — draggable bottom sheet with snap detents (TrailSheet equivalent).
// Built on Animated + PanResponder (no extra gesture deps). The grabber/header
// drags the sheet; the body scrolls only when fully expanded.
import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Animated,
  PanResponder,
  StyleSheet,
  ScrollView,
  ViewStyle,
  StyleProp,
} from 'react-native';
import { BlurView } from 'expo-blur';
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
}

export function TrailSheet({
  theme,
  snapHeights,
  initialIndex = 0,
  onIndexChange,
  header,
  children,
  containerStyle,
  bottomOffset = 0,
}: Props) {
  const maxH = snapHeights[snapHeights.length - 1];
  // translateY measured from fully-open (translateY = maxH - currentHeight)
  const yFor = (h: number) => maxH - h;
  const [index, setIndex] = useState(initialIndex);
  const translateY = useRef(new Animated.Value(yFor(snapHeights[initialIndex]))).current;
  const startY = useRef(yFor(snapHeights[initialIndex]));
  const currentY = useRef(yFor(snapHeights[initialIndex]));

  useEffect(() => {
    const id = translateY.addListener(({ value }) => {
      currentY.current = value;
    });
    return () => translateY.removeListener(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dy) > 4,
      onPanResponderGrant: () => {
        startY.current = currentY.current;
      },
      onPanResponderMove: (_e, g) => {
        let next = startY.current + g.dy;
        next = Math.max(-30, Math.min(maxH, next));
        translateY.setValue(next);
      },
      onPanResponderRelease: (_e, g) => {
        const projected = currentY.current + g.vy * 90;
        let i = nearestIndex(projected);
        // velocity boost: a firm flick jumps a detent
        if (g.vy < -0.6) i = nearestIndex(currentY.current) + 1;
        else if (g.vy > 0.6) i = nearestIndex(currentY.current) - 1;
        snapTo(i, g.vy);
      },
    })
  ).current;

  const expanded = index >= snapHeights.length - 1;

  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          left: 8,
          right: 8,
          bottom: bottomOffset,
          height: maxH,
          transform: [{ translateY }],
        },
        containerStyle,
      ]}
    >
      <View style={[StyleSheet.absoluteFill, { borderTopLeftRadius: 26, borderTopRightRadius: 26, overflow: 'hidden' }]}>
        <BlurView intensity={50} tint={theme.dark ? 'dark' : 'light'} style={StyleSheet.absoluteFill} />
        <View
          style={[
            StyleSheet.absoluteFill,
            {
              backgroundColor: theme.dark ? 'rgba(28,28,30,0.72)' : 'rgba(255,255,255,0.78)',
              borderTopLeftRadius: 26,
              borderTopRightRadius: 26,
              borderWidth: StyleSheet.hairlineWidth,
              borderColor: theme.border,
            },
          ]}
        />
      </View>

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
      <ScrollView
        scrollEnabled={expanded}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 24 }}
        style={{ flex: 1 }}
      >
        {children}
      </ScrollView>
    </Animated.View>
  );
}
