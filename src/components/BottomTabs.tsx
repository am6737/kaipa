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

const TABS: MainTab[] = ['discover', 'journey', 'me'];

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
        boxShadow: '0px 6px 16px rgba(0,0,0,0.30), 0px 1px 4px rgba(0,0,0,0.16)',
      }
    : {
        backgroundColor: '#FCFCFA',
        borderColor: 'rgba(255,255,255,0.98)',
        boxShadow: '0px 7px 18px rgba(34,34,28,0.08), 0px 1px 5px rgba(34,34,28,0.03)',
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
            // Gear is reached from the Me shortcuts now, so keep Me as the
            // selected section while its list/detail surface is open.
            const active = nav.mainTab === tab || (tab === 'me' && nav.mainTab === 'gear');

            return (
              <Press
                key={tab}
                accessibilityRole="tab"
                accessibilityLabel={t(`tabs.${tab}`)}
                accessibilityState={{ selected: active }}
                onPress={() => nav.setMainTab(tab)}
                style={styles.tab}
              >
                <Text
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.82}
                  style={[styles.label, { color: active ? theme.text : theme.text3, fontWeight: active ? '700' : '600' }]}
                >
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
    flexGrow: 0,
    flexShrink: 1,
    flexBasis: 210,
    height: 52,
    flexDirection: 'row',
    paddingVertical: space.xxs,
    paddingHorizontal: space.sm,
    borderRadius: radius.pill,
    borderWidth: 1.5,
  },
  row: {
    width: '100%',
    paddingHorizontal: space.xxxl,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  assistant: {
    position: 'absolute',
    right: space.md,
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
    maxWidth: '100%',
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
