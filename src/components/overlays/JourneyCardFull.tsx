// JourneyCardFull.tsx — full-screen journey/route detail (slide-up) used when a
// card is opened outside the discover sheet.
import React, { useEffect, useRef } from 'react';
import { View, Animated, StyleSheet, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Theme } from '../../theme/theme';
import { Poi } from '../../data/pois';
import { Icon } from '../Icon';
import { Press } from '../Press';
import { SelectedPoiCard } from '../../screens/JourneyCard';

export function JourneyCardFull({ theme, poi, onClose }: { theme: Theme; poi: Poi; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const slide = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.spring(slide, { toValue: 1, useNativeDriver: true, bounciness: 2, speed: 14 }).start();
  }, [slide]);
  const translateY = slide.interpolate({ inputRange: [0, 1], outputRange: [700, 0] });

  return (
    <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: theme.bg, transform: [{ translateY }], zIndex: 140 }]}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 10, paddingTop: 0, paddingBottom: insets.bottom + 30 }}>
        <SelectedPoiCard theme={theme} poi={poi} fullBleed />
      </ScrollView>
      <Press
        onPress={onClose}
        style={{
          position: 'absolute',
          top: insets.top + 6,
          left: 14,
          width: 40,
          height: 40,
          borderRadius: 20,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: theme.dark ? '#2C2C2E' : '#fff',
        }}
      >
        <Icon name="chevronL" color={theme.text} size={20} />
      </Press>
    </Animated.View>
  );
}
