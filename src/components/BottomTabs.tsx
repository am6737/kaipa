import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Easing } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { radius, space } from '../design-system';
import { Theme } from '../theme/theme';
import { Press } from './Press';
import { Icon, IconName } from './Icon';
import { useNav, MainTab } from '../nav/NavContext';
import { countRender, markTabTap } from '../lib/tabSwitchProbe';
import { useI18n } from '../i18n';
import { useNotifCenter } from '../data/notifications';
import { useTrail, useTrailSnapshot } from '../trail/TrailContext';

// 记录 is an action rather than a screen: it opens the 徒步导航 page over
// whichever tab is showing, ready for a free walk or the running recording.
type TabEntry = MainTab | 'record';
const TABS: TabEntry[] = ['discover', 'journey', 'record', 'me'];
const TAB_ICONS: Record<TabEntry, IconName> = {
  discover: 'compass',
  journey: 'journey',
  record: 'record',
  gear: 'bag',
  me: 'user',
};

/** Height of the floating tab bar; screens that dock content above it read this. */
export const BOTTOM_TABS_HEIGHT = 62;

export function BottomTabs({ theme, hidden = false }: { theme: Theme; hidden?: boolean }) {
  const nav = useNav();
  const trail = useTrail();
  const { session } = useTrailSnapshot();
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

  const barSurface = theme.dark
    ? {
        backgroundColor: '#242426',
        borderColor: 'rgba(255,255,255,0.10)',
        boxShadow: '0px 6px 16px rgba(0,0,0,0.30), 0px 1px 4px rgba(0,0,0,0.16)',
        activeFill: 'rgba(255,255,255,0.10)',
      }
    : {
        backgroundColor: '#FCFCFA',
        borderColor: 'rgba(255,255,255,0.98)',
        boxShadow: '0px 7px 18px rgba(34,34,28,0.08), 0px 1px 5px rgba(34,34,28,0.03)',
        activeFill: 'rgba(34,34,28,0.06)',
      };

  const { activeFill, ...barStyle } = barSurface;

  // Icon over label, the selected tab sitting on a soft pill.
  const renderContent = (tab: TabEntry, active: boolean, badgeColor?: string) => {
    const color = active ? theme.text : theme.text3;
    return (
      <View style={[styles.tabInner, active && { backgroundColor: activeFill }]}>
        <View>
          <Icon name={TAB_ICONS[tab]} size={23} color={color} strokeWidth={active ? 2.1 : 1.8} />
          {badgeColor ? <View style={[styles.badge, { backgroundColor: badgeColor, borderColor: theme.controlSurface }]} /> : null}
        </View>
        <Text
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.82}
          style={[styles.label, { color, fontWeight: active ? '700' : '600' }]}
        >
          {t(`tabs.${tab}`)}
        </Text>
      </View>
    );
  };

  return (
    <Animated.View
      pointerEvents={hidden ? 'none' : 'box-none'}
      style={[
        styles.position,
        {
          bottom: Math.max(insets.bottom, space.sm),
          opacity,
          transform: [{ translateY }],
        },
      ]}
    >
      <View style={styles.row}>
        <View style={[styles.bar, barStyle]}>
          {TABS.map((tab) => {
            if (tab === 'record') {
              return (
                <Press
                  key={tab}
                  accessibilityRole="button"
                  accessibilityLabel={t('tabs.record')}
                  onPress={() => trail.openTrail()}
                  style={styles.tab}
                >
                  {renderContent(tab, false, session ? (session.status === 'recording' ? theme.trailMine : theme.text3) : undefined)}
                </Press>
              );
            }
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
                {renderContent(tab, active, tab === 'me' && unread > 0 ? theme.danger : undefined)}
              </Press>
            );
          })}
        </View>
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
    flexBasis: 340,
    height: BOTTOM_TABS_HEIGHT,
    flexDirection: 'row',
    padding: space.xxs,
    borderRadius: radius.pill,
    borderWidth: 1.5,
  },
  row: {
    width: '100%',
    paddingHorizontal: space.xl,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tab: {
    flex: 1,
  },
  tabInner: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    paddingHorizontal: space.xxs,
    borderRadius: radius.pill,
  },
  label: {
    maxWidth: '100%',
    fontSize: 11.5,
    lineHeight: 14,
    letterSpacing: 0,
  },
  badge: {
    position: 'absolute',
    right: -3,
    top: -1,
    width: 7,
    height: 7,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
});
