// BottomTabs.tsx — floating frosted-glass tab bar (装备 · 发现 · 我).
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Theme } from '../theme/theme';
import { Icon, IconName } from './Icon';
import { Press } from './Press';
import { useNav, MainTab } from '../nav/NavContext';
import { useNotifCenter } from '../data/notifications';
import { elevFloat } from '../theme/shadow';

const TABS: { id: MainTab; label: string; icon: IconName }[] = [
  { id: 'gear', label: '装备', icon: 'bag' },
  { id: 'discover', label: '发现', icon: 'compass' },
  { id: 'me', label: '我', icon: 'user' },
];

export function BottomTabs({ theme }: { theme: Theme }) {
  const nav = useNav();
  const insets = useSafeAreaInsets();
  const { unread } = useNotifCenter();

  return (
    <View
      pointerEvents="box-none"
      style={{ position: 'absolute', left: 16, right: 16, bottom: Math.max(insets.bottom, 12) + 8 }}
    >
      <View style={[{ height: 60, borderRadius: 28, overflow: 'hidden' }, elevFloat(theme)]}>
        <BlurView intensity={40} tint={theme.dark ? 'dark' : 'light'} style={StyleSheet.absoluteFill} />
        <View
          style={[
            StyleSheet.absoluteFill,
            {
              borderRadius: 28,
              backgroundColor: theme.dark ? 'rgba(40,40,44,0.5)' : 'rgba(255,255,255,0.5)',
              borderWidth: StyleSheet.hairlineWidth,
              borderColor: theme.border,
            },
          ]}
        />
        <View style={{ flex: 1, flexDirection: 'row', padding: 5, gap: 4 }}>
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
                  gap: 3,
                  backgroundColor: active
                    ? theme.dark
                      ? 'rgba(255,255,255,0.14)'
                      : '#FFFFFF'
                    : 'transparent',
                }}
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
                  {tab.label}
                </Text>
              </Press>
            );
          })}
        </View>
      </View>
    </View>
  );
}
