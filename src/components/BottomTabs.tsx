import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Easing, Platform } from 'react-native';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Theme } from '../theme/theme';
import { Icon, IconName } from './Icon';
import { Press } from './Press';
import { useNav, MainTab } from '../nav/NavContext';
import { useI18n } from '../i18n';
import { useNotifCenter } from '../data/notifications';
import { shadow } from '../theme/shadow';

const IS_IOS = Platform.OS === 'ios';

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

  return (
    <Animated.View
      pointerEvents={hidden ? 'none' : 'box-none'}
      style={{
        position: 'absolute',
        left: 48,
        right: 48,
        bottom: Math.max(insets.bottom, 12) + 8,
        opacity,
        transform: [{ translateY }],
      }}
    >
      <View
        style={[
          {
            height: 52,
            borderRadius: 26,
            overflow: 'hidden',
          },
          shadow(theme.dark ? 0.4 : 0.1, 16, 6),
        ]}
      >
        <BlurView
          intensity={50}
          tint={IS_IOS
            ? (theme.dark ? 'systemChromeMaterialDark' : 'systemChromeMaterialLight')
            : (theme.dark ? 'dark' : 'light')}
          style={StyleSheet.absoluteFill}
        />
        {!IS_IOS && (
          <View
            style={[
              StyleSheet.absoluteFill,
              {
                borderRadius: 26,
                backgroundColor: theme.dark ? 'rgba(40,40,44,0.92)' : 'rgba(255,255,255,0.86)',
                borderWidth: StyleSheet.hairlineWidth,
                borderColor: theme.border,
              },
            ]}
          />
        )}
        <View style={{ flex: 1, flexDirection: 'row', padding: 4 }}>
          {TABS.map((tab) => {
            const active = nav.mainTab === tab.id;
            const color = active ? theme.text : theme.text2;
            return (
              <Press
                key={tab.id}
                onPress={() => nav.setMainTab(tab.id)}
                style={{
                  flex: 1,
                  borderRadius: 22,
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 2,
                  backgroundColor: active
                    ? theme.dark
                      ? 'rgba(255,255,255,0.12)'
                      : 'rgba(0,0,0,0.05)'
                    : 'transparent',
                }}
              >
                <View>
                  <Icon name={tab.icon} color={color} size={20} strokeWidth={active ? 2 : 1.7} />
                  {tab.id === 'me' && unread > 0 && (
                    <View
                      style={{
                        position: 'absolute',
                        right: -4,
                        top: -2,
                        width: 7,
                        height: 7,
                        borderRadius: 3.5,
                        backgroundColor: theme.danger,
                        borderWidth: 1.5,
                        borderColor: theme.dark ? 'rgba(40,40,44,0.6)' : 'rgba(255,255,255,0.8)',
                      }}
                    />
                  )}
                </View>
                <Text style={{ fontSize: 10, fontWeight: active ? '600' : '400', color }}>
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
