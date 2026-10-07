import React, { useLayoutEffect, useRef, useState } from 'react';
import { Animated, Easing, Modal, PanResponder, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Theme } from '../../theme/theme';
import type { JourneyGroupChoice } from '../../lib/journeyGroupChoices';
import { useI18n } from '../../i18n';
import { motion, radius, space, type } from '../../design-system';
import { Icon } from '../Icon';
import { Press } from '../Press';
import { JourneyGroupPicker } from './JourneyGroupPicker';

export function JourneyGroupMoveSheet({ theme, visible, count, data, busyValue, errorMessage, onSelect, onClose }: {
  theme: Theme;
  visible: boolean;
  count: number;
  data: JourneyGroupChoice[];
  busyValue?: string;
  errorMessage?: string;
  onSelect: (value: string) => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const maxHeight = Math.min(520, (height - insets.top) * 0.65);
  const bottomPad = Math.max(insets.bottom, space.md);
  const [headerHeight, setHeaderHeight] = useState(76);
  const [mounted, setMounted] = useState(visible);
  const progress = useRef(new Animated.Value(0)).current;
  const latest = useRef({ visible, busyValue, onClose, maxHeight });
  latest.current = { visible, busyValue, onClose, maxHeight };
  // Retain the last content while the parent clears its selection on success.
  const content = useRef({ count, data, busyValue, errorMessage });
  if (visible) content.current = { count, data, busyValue, errorMessage };

  useLayoutEffect(() => {
    progress.stopAnimation();
    if (visible) setMounted(true);
    const animation = Animated.timing(progress, {
      toValue: visible ? 1 : 0,
      duration: visible ? motion.standard : motion.quick,
      easing: visible ? Easing.bezier(0.16, 1, 0.3, 1) : Easing.bezier(0.4, 0, 0.2, 1),
      useNativeDriver: true,
    });
    animation.start(({ finished }) => { if (finished && !visible) setMounted(false); });
    return () => animation.stop();
  }, [visible, progress]);

  const requestClose = () => {
    if (latest.current.visible && latest.current.busyValue == null) latest.current.onClose();
  };
  const restore = () => Animated.timing(progress, { toValue: 1, duration: motion.quick, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  const pan = useRef(PanResponder.create({
    onMoveShouldSetPanResponder: (_event, gesture) => latest.current.visible && latest.current.busyValue == null && gesture.dy > 6 && Math.abs(gesture.dy) > Math.abs(gesture.dx),
    onPanResponderGrant: () => progress.stopAnimation(),
    onPanResponderMove: (_event, gesture) => progress.setValue(Math.max(0, 1 - Math.max(0, gesture.dy) / latest.current.maxHeight)),
    onPanResponderRelease: (_event, gesture) => {
      if (gesture.dy > 80 || gesture.vy > 0.5) requestClose();
      else restore();
    },
    onPanResponderTerminate: restore,
  })).current;

  if (!mounted && !visible) return null;
  const current = content.current;
  const busy = current.busyValue != null;
  return (
    <Modal visible transparent statusBarTranslucent animationType="none" onRequestClose={requestClose}>
      <View style={{ flex: 1, justifyContent: 'flex-end' }} pointerEvents={visible ? 'auto' : 'none'}>
        <Animated.View style={[StyleSheet.absoluteFill, { opacity: progress }]}>
          <Pressable accessibilityRole="button" accessibilityLabel={t('common.close')} disabled={busy} onPress={requestClose} style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.45)' }]} />
        </Animated.View>
        <Animated.View accessibilityViewIsModal style={{ maxHeight, paddingHorizontal: space.md, paddingBottom: bottomPad, borderTopLeftRadius: radius.feature, borderTopRightRadius: radius.feature, backgroundColor: theme.surfaceTop, transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [maxHeight, 0] }) }] }}>
          <View onLayout={(event) => setHeaderHeight(event.nativeEvent.layout.height)}>
            <View {...pan.panHandlers} style={{ paddingTop: space.sm, paddingBottom: space.md, alignItems: 'center' }}>
              <View style={{ width: 32, height: 4, borderRadius: 2, backgroundColor: theme.text3 }} />
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: space.sm, paddingHorizontal: space.xxs, paddingBottom: space.md }}>
              <View style={{ flex: 1 }}>
                <Text style={[type.sectionTitle, { color: theme.text }]}>{t('journey.timeline.moveCountTitle', { count: current.count })}</Text>
              </View>
              <Press onPress={requestClose} disabled={busy} hitSlop={8} accessibilityRole="button" accessibilityLabel={t('common.close')} accessibilityState={{ disabled: busy }} style={{ width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.fieldSurface }}>
                <Icon name="close" size={16} color={theme.text2} />
              </Press>
            </View>
          </View>
          <JourneyGroupPicker theme={theme} embedded title={t('journey.timeline.moveToTitle')} data={current.data} maxHeight={maxHeight - headerHeight - bottomPad} busyValue={current.busyValue} errorMessage={current.errorMessage} onChange={onSelect} />
        </Animated.View>
      </View>
    </Modal>
  );
}
