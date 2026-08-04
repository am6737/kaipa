import React, { useMemo, useRef } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { GestureDetector, Gesture, ScrollView } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Theme } from '../../theme/theme';
import { Poi } from '../../data/pois';
import { buildElevation } from '../../data/elevation';
import { CircleBtn } from '../CircleBtn';
import { TrackDetailContent } from './TrackDetailContent';
import { useI18n } from '../../i18n';

export function ElevationFull({ theme, info, isMine, onClose }: { theme: Theme; info: Poi; isMine?: boolean; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const { t } = useI18n();
  const series = useMemo(() => buildElevation(info), [info.id, info.trackElevation]);
  const totalKm = series.totalKm;

  const translateY = useRef(new Animated.Value(600)).current;
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  React.useEffect(() => {
    Animated.spring(translateY, { toValue: 0, useNativeDriver: true, bounciness: 2, speed: 14 }).start();
  }, [translateY]);

  const scrollY = useRef(0);
  const scrollRef = useRef<any>(null);
  const dragging = useRef(false);
  const dragBase = useRef(0);
  const dragOffset = useRef(0);
  const currentY = useRef(0);
  React.useEffect(() => {
    const id = translateY.addListener(({ value }) => { currentY.current = value; });
    return () => translateY.removeListener(id);
  }, [translateY]);

  const onDragMove = (ty: number) => {
    if (!dragging.current) {
      if (ty > 0 && scrollY.current <= 0) {
        dragging.current = true;
        dragBase.current = currentY.current;
        dragOffset.current = ty;
      } else return;
    }
    let next = dragBase.current + (ty - dragOffset.current);
    next = Math.max(-30, next);
    translateY.setValue(next);
  };
  const onDragEnd = (vy: number) => {
    if (!dragging.current) return;
    dragging.current = false;
    if (currentY.current > 110 || vy > 0.6) {
      Animated.timing(translateY, { toValue: 700, duration: 200, useNativeDriver: true }).start(() => onCloseRef.current());
    } else {
      Animated.spring(translateY, { toValue: 0, useNativeDriver: true, bounciness: 4, speed: 16 }).start();
    }
  };
  const dragMoveRef = useRef(onDragMove);
  const dragEndRef = useRef(onDragEnd);
  dragMoveRef.current = onDragMove;
  dragEndRef.current = onDragEnd;

  const dismissGesture = useMemo(
    () => Gesture.Pan()
      .runOnJS(true)
      .activeOffsetY([-8, 8])
      .simultaneousWithExternalGesture(scrollRef)
      .onBegin(() => { dragging.current = false; })
      .onUpdate((e) => dragMoveRef.current(e.translationY))
      .onEnd((e) => dragEndRef.current(e.velocityY / 1000))
      .onFinalize(() => { if (dragging.current) dragEndRef.current(0); }),
    [],
  );

  return (
    <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: theme.bg, transform: [{ translateY }], zIndex: 130, borderTopLeftRadius: 26, borderTopRightRadius: 26, overflow: 'hidden' }]}>
      <GestureDetector gesture={dismissGesture}>
        <View style={{ flex: 1 }}>
          <View style={{ paddingTop: insets.top + 12, paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: theme.hairline }}>
            <View style={{ height: 40, justifyContent: 'center' }}>
              <View style={{ position: 'absolute', left: 0, top: 0 }}>
                <CircleBtn theme={theme} name="chevronL" onPress={onClose} noShadow />
              </View>
              <View pointerEvents="none" style={{ alignItems: 'center', paddingHorizontal: 72 }}>
                <Text style={{ fontSize: 17, fontWeight: '700', color: theme.text }} numberOfLines={1}>{t('journey.elevation.trackTitle')}</Text>
                <Text numberOfLines={1} style={{ fontSize: 12, color: theme.text2, marginTop: 1 }}>
                  {info.name} · {totalKm.toFixed(1)} km{info.region ? ` · ${info.region}` : ''}
                </Text>
              </View>
            </View>
          </View>

          <ScrollView
            ref={scrollRef}
            bounces={false}
            alwaysBounceVertical={false}
            overScrollMode="never"
            onScroll={(e: any) => { scrollY.current = e.nativeEvent.contentOffset.y; }}
            scrollEventThrottle={16}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: insets.bottom + 30 }}
          >
            <TrackDetailContent theme={theme} info={info} isMine={isMine} showMap showActions contentPaddingHorizontal={18} onClose={onClose} />
          </ScrollView>
        </View>
      </GestureDetector>
    </Animated.View>
  );
}
