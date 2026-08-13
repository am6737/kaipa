import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Easing } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { radius, space } from '../design-system';
import { rgba, Theme } from '../theme/theme';
import { Icon, IconName } from './Icon';
import { Press } from './Press';
import { useNav, MainTab } from '../nav/NavContext';
import { useI18n } from '../i18n';
import { useNotifCenter } from '../data/notifications';

const TABS: { id: MainTab; icon: IconName }[] = [
  { id: 'gear', icon: 'bag' },
  { id: 'discover', icon: 'compass' },
  { id: 'me', icon: 'user' },
];

export function BottomTabs({ theme, hidden = false }: { theme: Theme; hidden?: boolean }) {
  const nav = useNav();
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const { unread } = useNotifCenter();

  const anim = useRef(new Animated.Value(hidden ? 1 : 0)).current;
  useEffect(() => {
    Animated.timing(anim, {
      toValue: hidden ? 1 : 0,
      duration: 280,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [hidden, anim]);
  const translateY = anim.interpolate({ inputRange: [0, 1], outputRange: [0, 120] });
  const opacity = anim.interpolate({ inputRange: [0, 1], outputRange: [1, 0] });

  const barSurface = theme.dark
    ? {
        backgroundColor: '#242426',
        borderColor: 'rgba(255,255,255,0.10)',
        boxShadow: '0px 10px 24px rgba(0,0,0,0.42), 0px 2px 7px rgba(0,0,0,0.24)',
      }
    : {
        backgroundColor: '#FCFCFA',
        borderColor: 'rgba(255,255,255,0.98)',
        boxShadow: '0px 12px 30px rgba(34,34,28,0.12), 0px 2px 8px rgba(34,34,28,0.04)',
      };

  return (
    <Animated.View
      pointerEvents={hidden ? 'none' : 'box-none'}
      style={[
        styles.position,
        {
          bottom: Math.max(insets.bottom, space.sm) + space.xs,
          opacity,
          transform: [{ translateY }],
        },
      ]}
    >
      <View
        style={[
          styles.bar,
          barSurface,
        ]}
      >
        {TABS.map((tab) => {
          const active = nav.mainTab === tab.id;
          const color = active ? rgba(theme.accent, theme.dark ? 0.86 : 0.66) : theme.text2;
          const itemSurface = active
            ? theme.dark
              ? '#363638'
              : '#F1F1F1'
            : 'transparent';

          return (
            <Press
              key={tab.id}
              accessibilityRole="tab"
              accessibilityLabel={t(`tabs.${tab.id}`)}
              accessibilityState={{ selected: active }}
              onPress={() => nav.setMainTab(tab.id)}
              style={[styles.tab, { backgroundColor: itemSurface }]}
            >
              <View>
                <Icon name={tab.icon} color={color} size={20} strokeWidth={active ? 2.1 : 1.8} />
                {tab.id === 'me' && unread > 0 && (
                  <View
                    style={[
                      styles.unread,
                      {
                        backgroundColor: theme.danger,
                        borderColor: active ? itemSurface : theme.controlSurface,
                      },
                    ]}
                  />
                )}
              </View>
              <Text style={[styles.label, { color, fontWeight: active ? '600' : '500' }]}>
                {t(`tabs.${tab.id}`)}
              </Text>
            </Press>
          );
        })}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  position: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  bar: {
    width: 252,
    height: 52,
    flexDirection: 'row',
    padding: space.xxs,
    borderRadius: radius.pill,
    borderWidth: 1.5,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 1,
    borderRadius: radius.pill,
  },
  label: {
    fontSize: 9,
    lineHeight: 10,
    letterSpacing: 0.1,
  },
  unread: {
    position: 'absolute',
    right: -5,
    top: -3,
    width: 8,
    height: 8,
    borderRadius: radius.pill,
    borderWidth: 1.5,
  },
});
