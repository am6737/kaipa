import React from 'react';
import { Animated, Easing, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import WheelPicker from '@quidone/react-native-wheel-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Theme } from '../../theme/theme';

export function GearWheelSelectSheet({
  theme,
  title,
  data,
  value,
  onClose,
  onConfirm,
}: {
  theme: Theme;
  title: string;
  data: { value: string; label: string }[];
  value: string;
  onClose: () => void;
  onConfirm: (value: string) => void;
}) {
  const insets = useSafeAreaInsets();
  const [selected, setSelected] = React.useState(value);
  const progress = React.useRef(new Animated.Value(0)).current;
  const closingRef = React.useRef(false);

  React.useEffect(() => {
    setSelected(value);
  }, [value]);

  React.useLayoutEffect(() => {
    Animated.timing(progress, {
      toValue: 1,
      duration: 140,
      easing: Easing.bezier(0.16, 1, 0.3, 1),
      useNativeDriver: true,
    }).start();
    return () => progress.stopAnimation();
  }, [progress]);

  const requestClose = (afterClose?: () => void) => {
    if (closingRef.current) return;
    closingRef.current = true;
    Animated.timing(progress, {
      toValue: 0,
      duration: 90,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start(() => {
      onClose();
      afterClose?.();
    });
  };

  const finish = () => {
    const next = selected;
    requestClose(() => onConfirm(next));
  };

  return (
    <Modal visible transparent animationType="none" onRequestClose={() => requestClose()}>
      <View style={{ flex: 1, justifyContent: 'flex-end' }}>
        <Animated.View pointerEvents="box-none" style={[StyleSheet.absoluteFill, { opacity: progress }]}>
          <Pressable onPress={() => requestClose()} style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.42)' }]} />
        </Animated.View>
        <Animated.View
          renderToHardwareTextureAndroid
          shouldRasterizeIOS
          style={{
            minHeight: 280,
            backgroundColor: theme.dark ? theme.bg : '#FFFFFF',
            borderTopLeftRadius: 28,
            borderTopRightRadius: 28,
            paddingTop: 14,
            paddingHorizontal: 20,
            paddingBottom: Math.max(insets.bottom, 16) + 12,
            opacity: progress,
            transform: [
              { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) },
              { scale: progress.interpolate({ inputRange: [0, 1], outputRange: [0.99, 1] }) },
            ],
          }}
        >
          <View style={{ alignSelf: 'center', width: 38, height: 5, borderRadius: 3, backgroundColor: theme.text3, opacity: 0.45, marginBottom: 16 }} />
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 2, marginBottom: 4 }}>
            <Pressable onPress={() => requestClose()} style={{ padding: 4 }}>
              <Text style={{ fontSize: 14.5, color: theme.text2 }}>取消</Text>
            </Pressable>
            <Text style={{ fontSize: 16, fontWeight: '700', color: theme.text }}>{title}</Text>
            <Pressable onPress={finish} style={{ padding: 4 }}>
              <Text style={{ fontSize: 14.5, fontWeight: '700', color: theme.accent }}>完成</Text>
            </Pressable>
          </View>
          <View style={{ height: 200, overflow: 'hidden', alignItems: 'center', marginTop: 10, marginBottom: 8 }}>
            <WheelPicker
              data={data}
              value={selected}
              onValueChanging={() => { Haptics.selectionAsync(); }}
              onValueChanged={({ item }) => setSelected(String(item.value))}
              itemHeight={40}
              visibleItemCount={5}
              width={220}
              enableScrollByTapOnItem
              itemTextStyle={{ fontSize: 18, fontWeight: '500', color: theme.text }}
              overlayItemStyle={{ backgroundColor: theme.dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.045)', borderRadius: 10 }}
            />
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}
