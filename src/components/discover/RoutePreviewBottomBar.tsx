// RoutePreviewBottomBar.tsx — the fixed action bar of the route detail sheet.
//
// The labelled pills the card always had (收藏, 导航 along the track, 规划旅程), now
// pinned to the bottom; Getting to the trailhead (前往) lives on the 起点 row instead.
// 规划旅程 comes last in the row, nearest the thumb and in the order the app's
// other primary actions follow, filled with the accent, at its natural width (not stretched over
// the space the others leave), so the next step reads at a glance without the
// verbs losing their names. The pills float on the sheet with no fade behind them.
// Where the labelled row doesn't fit (narrow phones, longer
// languages, larger text) the other verbs drop to round icon buttons and only
// 规划旅程 keeps its words; the fit is measured, not guessed from screen width.
import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Theme } from '../../theme/theme';
import { layout, radius, space, type } from '../../design-system';
import { useI18n } from '../../i18n';
import { useNav } from '../../nav/NavContext';
import { Icon, type IconName } from '../Icon';
import { Press } from '../Press';
import type { Poi } from '../../data/pois';

// A full touch target: the pills sit alone on a fixed bar, not inline in a card.
const PILL_HEIGHT = layout.fieldHeight;
// Room to lay the labelled row out at its natural width while measuring it.
const MEASURE_WIDTH = 2000;
const PILL_SHADOW = { light: '0px 4px 12px rgba(0,0,0,0.08)', dark: '0px 4px 12px rgba(0,0,0,0.38)' };

export function RoutePreviewBottomBar({ theme, poi, onPlanRoute, onFollow }: {
  theme: Theme;
  poi: Poi;
  onPlanRoute?: (route: Poi) => void;
  /** Opens 导航 along the route's track (the trail recorder's follow mode). */
  onFollow?: (route: Poi) => void;
}) {
  const nav = useNav();
  const insets = useSafeAreaInsets();
  const { t } = useI18n();
  const route = nav.merged(poi);
  const canFollow = !!onFollow && !!route.trackCoords && route.trackCoords.length >= 2;
  const [rowWidth, setRowWidth] = useState(0);
  const [labelledWidth, setLabelledWidth] = useState(0);
  // Icons until both widths are known, so a label is never shown clipped.
  const compact = !rowWidth || !labelledWidth || labelledWidth > rowWidth;
  const actions: BarAction[] = [
    { key: 'fav', icon: route.fav ? 'heartFill' : 'heart', label: t('journey.more.favorite'), color: route.fav ? theme.danger : theme.text, onPress: () => nav.toggleFav() },
    ...(canFollow ? [{ key: 'follow', icon: 'navigation' as const, label: t('discover.routeNavigate'), color: theme.text, onPress: () => onFollow!(route) }] : []),
  ];
  const planLabel = t('journey.cta.planRoute');
  const onPlan = () => (onPlanRoute ? onPlanRoute(route) : nav.openNewJourney(route));
  return (
    <View pointerEvents="box-none" style={{ position: 'absolute', left: 0, right: 0, bottom: 0 }}>
      {/* The labelled row at its natural width, invisible, only to measure whether it fits. */}
      <View pointerEvents="none" aria-hidden importantForAccessibility="no-hide-descendants" style={{ position: 'absolute', left: 0, top: 0, width: MEASURE_WIDTH, opacity: 0, flexDirection: 'row' }}>
        <View style={{ flexDirection: 'row', gap: space.xs }} onLayout={(event) => setLabelledWidth(Math.ceil(event.nativeEvent.layout.width))}>
          {actions.map((action) => <BarPill key={action.key} theme={theme} action={action} natural />)}
          <PlanPill theme={theme} label={planLabel} natural onPress={onPlan} />
        </View>
      </View>
      <View
        onLayout={(event) => setRowWidth(Math.floor(event.nativeEvent.layout.width) - space.md * 2)}
        style={{ flexDirection: 'row', alignItems: 'center', gap: space.xs, paddingHorizontal: space.md, paddingTop: space.md, paddingBottom: Math.max(insets.bottom, space.md) }}
      >
        {actions.map((action) => (compact
          ? <BarDisc key={action.key} theme={theme} action={action} />
          : <BarPill key={action.key} theme={theme} action={action} />))}
        <PlanPill theme={theme} label={planLabel} onPress={onPlan} />
      </View>
    </View>
  );
}

type BarAction = { key: string; icon: IconName; label: string; color: string; onPress: () => void };

const pillChrome = (theme: Theme) => ({
  height: PILL_HEIGHT,
  borderRadius: radius.pill,
  alignItems: 'center' as const,
  justifyContent: 'center' as const,
  backgroundColor: theme.controlSurface,
  borderWidth: StyleSheet.hairlineWidth,
  borderColor: theme.fieldBorder,
  boxShadow: theme.dark ? PILL_SHADOW.dark : PILL_SHADOW.light,
});

/** `natural`: laid out at full width for measuring, never shrunk. */
function BarPill({ theme, action, natural = false }: { theme: Theme; action: BarAction; natural?: boolean }) {
  return (
    <Press
      hitSlop={3}
      onPress={action.onPress}
      accessibilityRole="button"
      style={[pillChrome(theme), { flexShrink: natural ? 0 : 1, minWidth: 0, paddingHorizontal: space.sm, flexDirection: 'row', gap: space.xxs }]}
    >
      <Icon name={action.icon} color={action.color} size={17} />
      <Text numberOfLines={1} style={[type.labelStrong, { color: action.color }]}>{action.label}</Text>
    </Press>
  );
}

function BarDisc({ theme, action }: { theme: Theme; action: BarAction }) {
  return (
    <Press
      hitSlop={3}
      onPress={action.onPress}
      accessibilityRole="button"
      accessibilityLabel={action.label}
      style={[pillChrome(theme), { width: PILL_HEIGHT }]}
    >
      <Icon name={action.icon} color={action.color} size={19} />
    </Press>
  );
}

function PlanPill({ theme, label, natural = false, onPress }: { theme: Theme; label: string; natural?: boolean; onPress: () => void }) {
  return (
    <Press
      hitSlop={3}
      onPress={onPress}
      accessibilityRole="button"
      style={{ flexShrink: natural ? 0 : 1, minWidth: 0, height: PILL_HEIGHT, paddingHorizontal: space.md, borderRadius: radius.pill, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.xxs, backgroundColor: theme.accent, boxShadow: theme.dark ? PILL_SHADOW.dark : PILL_SHADOW.light }}
    >
      {/* White on the accent fill. */}
      <Icon name="calendar" color="#FFFFFF" size={17} />
      <Text numberOfLines={1} style={[type.labelStrong, { color: '#FFFFFF' }]}>{label}</Text>
    </Press>
  );
}
