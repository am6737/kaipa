// UnderlineTabs.tsx — left-aligned text tabs: the active label is bold `text`
// over a short accent underline that slides to the chosen tab (no hairline).
import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleProp, Text, View, ViewStyle } from 'react-native';
import { Press } from './Press';
import { Theme } from '../theme/theme';
import { layout, motion, radius, space, type } from '../design-system';

export function UnderlineTabs<T extends string>({ theme, tabs, activeKey, onSelect, style }: {
  theme: Theme;
  tabs: { id: T; label: string }[];
  activeKey: T;
  onSelect: (key: T) => void;
  style?: StyleProp<ViewStyle>;
}) {
  const tabX = useRef(new Map<string, number>());
  const underlineX = useRef(new Animated.Value(0)).current;
  const underlineReady = useRef(false);
  const moveUnderline = (id: string, animated: boolean) => {
    const x = tabX.current.get(id);
    if (x === undefined) return;
    if (!underlineReady.current || !animated) {
      underlineX.setValue(x);
      underlineReady.current = true;
      return;
    }
    Animated.timing(underlineX, {
      toValue: x,
      duration: motion.emphasized,
      easing: Easing.bezier(0.22, 1, 0.36, 1),
      useNativeDriver: true,
    }).start();
  };
  useEffect(() => {
    moveUnderline(activeKey, true);
  }, [activeKey]);
  return (
    <View
      accessibilityRole="tablist"
      style={[{ height: layout.fieldHeight, flexDirection: 'row', alignItems: 'center', gap: space.lg + 2 }, style]}
    >
      {tabs.map((tab) => {
        const active = tab.id === activeKey;
        return (
          <Press
            key={tab.id}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            onPress={() => onSelect(tab.id)}
            onLayout={(event) => {
              tabX.current.set(tab.id, event.nativeEvent.layout.x);
              if (tab.id === activeKey) moveUnderline(tab.id, underlineReady.current);
            }}
            style={{ height: layout.fieldHeight, justifyContent: 'center' }}
          >
            <Text numberOfLines={1} style={[type.cardTitle, { fontWeight: active ? '800' : '600', color: active ? theme.text : theme.text2 }]}>{tab.label}</Text>
          </Press>
        );
      })}
      <Animated.View
        pointerEvents="none"
        style={{ position: 'absolute', left: 0, bottom: space.xxs, width: space.md, height: 3, borderRadius: radius.pill, backgroundColor: theme.accent, transform: [{ translateX: underlineX }] }}
      />
    </View>
  );
}
