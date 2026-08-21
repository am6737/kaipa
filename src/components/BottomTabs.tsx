import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Easing } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { radius, space } from '../design-system';
import { Theme } from '../theme/theme';
import { Press } from './Press';
import { useNav, MainTab } from '../nav/NavContext';
import { useI18n } from '../i18n';
import { useNotifCenter } from '../data/notifications';
import { AssistantMark } from './assistant/AssistantMark';

const TABS: MainTab[] = ['gear', 'discover', 'me'];

export function BottomTabs({ theme, hidden = false, onOpenAssistant }: { theme: Theme; hidden?: boolean; onOpenAssistant?: () => void }) {
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
      <View style={styles.row}>
        <View style={[styles.bar, barSurface]}>
          {TABS.map((tab) => {
            const active = nav.mainTab === tab;

            return (
              <Press
                key={tab}
                accessibilityRole="tab"
                accessibilityLabel={t(`tabs.${tab}`)}
                accessibilityState={{ selected: active }}
                onPress={() => nav.setMainTab(tab)}
                style={styles.tab}
              >
                <Text style={[styles.label, { color: active ? theme.text : theme.text3, fontWeight: active ? '700' : '600' }]}>
                  {t(`tabs.${tab}`)}
                </Text>
                {tab === 'me' && unread > 0 ? <View style={[styles.unread, { backgroundColor: theme.danger, borderColor: theme.controlSurface }]} /> : null}
              </Press>
            );
          })}
        </View>
        {onOpenAssistant ? (
          <Press
            accessibilityRole="button"
            accessibilityLabel={t('agent.open')}
            onPress={onOpenAssistant}
            style={[styles.assistant, { backgroundColor: theme.accent }]}
          >
            <AssistantMark color="#FFFFFF" size={27} />
          </Press>
        ) : null}
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
    zIndex: 400,
    elevation: 30,
  },
  bar: {
    width: 208,
    height: 52,
    flexDirection: 'row',
    padding: space.xxs,
    borderRadius: radius.pill,
    borderWidth: 1.5,
  },
  row: {
    width: 336,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 76,
  },
  assistant: {
    width: 52,
    height: 52,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
  },
  label: {
    fontSize: 14,
    lineHeight: 19,
    letterSpacing: 0,
  },
  unread: {
    position: 'absolute',
    right: 8,
    top: 9,
    width: 7,
    height: 7,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
});
