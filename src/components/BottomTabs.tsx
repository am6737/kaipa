import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Easing, Platform } from 'react-native';
import { BlurView } from 'expo-blur';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { radius, space } from '../design-system';
import { Theme } from '../theme/theme';
import { Press } from './Press';
import { useNav, MainTab } from '../nav/NavContext';
import { countRender, markTabTap } from '../lib/tabSwitchProbe';
import { useI18n } from '../i18n';
import { useNotifCenter } from '../data/notifications';
import { AssistantMark } from './assistant/AssistantMark';

const TABS: MainTab[] = ['discover', 'journey', 'me'];

const IS_IOS = Platform.OS === 'ios';
// requireNativeModule throws in Expo Go; keep the BlurView fallback there.
const LIQUID_GLASS = (() => {
  if (!IS_IOS) return false;
  try {
    return isLiquidGlassAvailable();
  } catch {
    return false;
  }
})();

export function BottomTabs({ theme, hidden = false, onOpenAssistant }: { theme: Theme; hidden?: boolean; onOpenAssistant?: () => void }) {
  const nav = useNav();
  countRender('Tabs');
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

  // Glass/blur cannot render inside a partially transparent view, so on iOS
  // the bar only slides out (opacity stays 1) and fades on other platforms.
  const barOpacity = IS_IOS ? 1 : opacity;

  const barFrame = theme.dark
    ? {
        borderColor: 'rgba(255,255,255,0.10)',
        boxShadow: '0px 6px 16px rgba(0,0,0,0.30), 0px 1px 4px rgba(0,0,0,0.16)',
      }
    : {
        borderColor: 'rgba(255,255,255,0.98)',
        boxShadow: '0px 7px 18px rgba(34,34,28,0.08), 0px 1px 5px rgba(34,34,28,0.03)',
      };

  return (
    <Animated.View
      pointerEvents={hidden ? 'none' : 'box-none'}
      style={[
        styles.position,
        {
          bottom: Math.max(insets.bottom, space.sm),
          opacity: barOpacity,
          transform: [{ translateY }],
        },
      ]}
    >
      <View style={styles.row}>
        <View style={[styles.bar, barFrame, !IS_IOS && { backgroundColor: theme.dark ? '#242426' : '#FCFCFA' }]}>
          {IS_IOS ? (
            LIQUID_GLASS ? (
              <GlassView
                pointerEvents="none"
                glassEffectStyle="regular"
                colorScheme={theme.dark ? 'dark' : 'light'}
                style={[StyleSheet.absoluteFill, { borderRadius: radius.pill }]}
              />
            ) : (
              <View style={styles.blurClip}>
                <BlurView
                  pointerEvents="none"
                  intensity={80}
                  tint={theme.dark ? 'systemMaterialDark' : 'systemMaterialLight'}
                  style={StyleSheet.absoluteFill}
                />
              </View>
            )
          ) : null}
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
                onPress={() => {
                  if (nav.mainTab !== tab) markTabTap(nav.mainTab, tab);
                  nav.setMainTab(tab);
                }}
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
            <Text numberOfLines={1} style={styles.assistantLabel}>{t('agent.open')}</Text>
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
  blurClip: {
    position: 'absolute',
    left: 0,
    top: 0,
    right: 0,
    bottom: 0,
    borderRadius: radius.pill,
    overflow: 'hidden',
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
    right: space.xxxl,
    width: 88,
    height: 52,
    borderRadius: radius.pill,
    flexDirection: 'row',
    gap: space.xxs,
    alignItems: 'center',
    justifyContent: 'center',
  },
  assistantLabel: {
    color: '#FFFFFF',
    fontSize: 14,
    lineHeight: 19,
    fontWeight: '700',
    letterSpacing: 0,
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
