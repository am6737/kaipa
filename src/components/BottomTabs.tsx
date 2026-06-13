// BottomTabs.tsx — floating frosted-glass tab bar (装备 · 发现 · 我). Slides
// away (down + fade) whenever a screen raises a sheet over it — see `hidden`.
import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Easing } from 'react-native';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Theme } from '../theme/theme';
import { Icon, IconName } from './Icon';
import { Press } from './Press';
import { useNav, MainTab } from '../nav/NavContext';
import { useI18n } from '../i18n';
import { useNotifCenter } from '../data/notifications';
import { elevFloat, shadow } from '../theme/shadow';

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

  // slide down + fade out when a sheet is raised over the bar (prototype parity)
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

  return (
    <Animated.View
      pointerEvents={hidden ? 'none' : 'box-none'}
      style={{
        position: 'absolute',
        left: 16,
        right: 16,
        bottom: Math.max(insets.bottom, 12) + 8,
        opacity,
        transform: [{ translateY }],
      }}
    >
      <View style={[{ height: 60, borderRadius: 28, overflow: 'hidden' }, elevFloat(theme)]}>
        <BlurView intensity={40} tint={theme.dark ? 'dark' : 'light'} style={StyleSheet.absoluteFill} />
        <View
          style={[
            StyleSheet.absoluteFill,
            {
              borderRadius: 28,
              // surfaceTop (0.86 light / 0.92 dark) keeps the bar opaque enough
              // that content never bleeds through on Android, where expo-blur is
              // effectively a no-op. The BlurView above still frosts it on iOS.
              backgroundColor: theme.surfaceTop,
              borderWidth: StyleSheet.hairlineWidth,
              borderColor: theme.border,
            },
          ]}
        />
        <View style={{ flex: 1, flexDirection: 'row', padding: 5, gap: 4 }}>
          {TABS.map((tab) => {
            const active = nav.mainTab === tab.id;
            const color = active ? theme.text : theme.text2;
            // Active pill: the prototype gives it a faint drop shadow + 0.5px
            // stroke so it stays distinct against the (now opaque) bar.
            const activeElev = theme.dark
              ? {
                  borderWidth: StyleSheet.hairlineWidth,
                  borderColor: 'rgba(255,255,255,0.18)',
                  ...shadow(0.25, 4, 1, '#000', 3),
                }
              : {
                  borderWidth: StyleSheet.hairlineWidth,
                  borderColor: 'rgba(0,0,0,0.05)',
                  ...shadow(0.06, 2, 1, '#000', 2),
                };
            return (
              <Press
                key={tab.id}
                onPress={() => nav.setMainTab(tab.id)}
                style={[
                  {
                    flex: 1,
                    borderRadius: 22,
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 3,
                    backgroundColor: active
                      ? theme.dark
                        ? 'rgba(255,255,255,0.14)'
                        : '#FFFFFF'
                      : 'transparent',
                  },
                  active ? activeElev : null,
                ]}
              >
                <View>
                  <Icon name={tab.icon} color={color} size={23} strokeWidth={active ? 2 : 1.8} />
                  {tab.id === 'me' && unread > 0 && (
                    <View
                      style={{
                        position: 'absolute',
                        right: -5,
                        top: -2,
                        width: 8,
                        height: 8,
                        borderRadius: 4,
                        backgroundColor: theme.danger,
                        borderWidth: 1.5,
                        borderColor: theme.bg,
                      }}
                    />
                  )}
                </View>
                <Text style={{ fontSize: 11, fontWeight: active ? '700' : '500', color, letterSpacing: 0.2 }}>
                  {t(`tabs.${tab.id}`)}
                </Text>
              </Press>
            );
          })}
        </View>
      </View>
    </Animated.View>
  );
}
