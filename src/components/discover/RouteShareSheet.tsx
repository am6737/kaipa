import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, PanResponder, Pressable, Share, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Poi } from '../../data/pois';
import { motion, radius, space, type } from '../../design-system';
import { useI18n } from '../../i18n';
import { exportRouteTrack, routeAsTrack } from '../../lib/trackExport';
import { Theme } from '../../theme/theme';
import { Icon, IconName } from '../Icon';
import { Press } from '../Press';

type Action = 'text' | 'gpx' | 'original';

function ShareRow({ theme, icon, title, subtitle, busy, disabled, divider, onPress }: { theme: Theme; icon: IconName; title: string; subtitle: string; busy: boolean; disabled: boolean; divider: boolean; onPress: () => void }) {
  return (
    <Press
      onPress={disabled ? undefined : onPress}
      accessibilityRole="button"
      accessibilityState={{ disabled, busy }}
      accessibilityLabel={`${title}，${subtitle}`}
      style={[styles.row, divider && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.hairline }, { opacity: disabled && !busy ? 0.48 : 1 }]}
    >
      <View style={[styles.rowIcon, { backgroundColor: theme.groupedBg }]}>
        {busy ? <ActivityIndicator size="small" color={theme.text2} /> : <Icon name={icon} color={theme.text} size={20} strokeWidth={1.9} />}
      </View>
      <View style={styles.rowCopy}>
        <Text numberOfLines={1} style={[type.cardTitle, { color: theme.text }]}>{title}</Text>
        <Text numberOfLines={2} style={[type.note, styles.rowSubtitle, { color: theme.text2 }]}>{subtitle}</Text>
      </View>
    </Press>
  );
}

export function RouteShareSheet({ theme, route, onClose, onToast }: { theme: Theme; route: Poi; onClose: () => void; onToast: (message: string) => void }) {
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const translateY = useRef(new Animated.Value(600)).current;
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const [busy, setBusy] = useState<Action | null>(null);

  const track = routeAsTrack(route);
  const hasTrack = (track.coords?.length ?? 0) >= 2 || Boolean(track.fileUrl);
  // A GPX original is what the GPX row already hands over, so only KML/KMZ get a row of their own.
  const originalFormat = track.fileUrl && track.fileFormat && track.fileFormat !== 'gpx' ? track.fileFormat.toUpperCase() : null;

  useEffect(() => {
    Animated.spring(translateY, { toValue: 0, useNativeDriver: true, ...motion.pageSpring }).start();
  }, [translateY]);

  const pan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_event, gesture) => gesture.dy > 4 && Math.abs(gesture.dy) > Math.abs(gesture.dx),
      onPanResponderMove: (_event, gesture) => {
        if (gesture.dy > 0) translateY.setValue(gesture.dy);
      },
      onPanResponderRelease: (_event, gesture) => {
        if (gesture.dy > 100 || gesture.vy > 0.6) {
          Animated.timing(translateY, { toValue: 700, duration: motion.quick, useNativeDriver: true }).start(() => onCloseRef.current());
        } else {
          Animated.spring(translateY, { toValue: 0, useNativeDriver: true, ...motion.pageSpring }).start();
        }
      },
    }),
  ).current;

  const run = async (action: Action) => {
    if (busy) return;
    setBusy(action);
    try {
      if (action === 'text') {
        const message = `${route.name}\n${[route.region.replace(/\s*·\s*/g, ' '), route.dist, route.asc].filter(Boolean).join(' ')}`;
        await Share.share({ title: route.name, message });
      } else {
        await exportRouteTrack(route, action);
      }
      onCloseRef.current();
    } catch (error: any) {
      if (error?.message === 'User did not share') return;
      console.warn('[RouteShareSheet] share failed:', error);
      if (action !== 'text') onToast(t('discover.routeExportFailed'));
    } finally {
      setBusy(null);
    }
  };

  const rows: { action: Action; icon: IconName; title: string; subtitle: string }[] = [
    { action: 'text', icon: 'share', title: t('discover.routeShareText'), subtitle: t('discover.routeShareTextHint') },
    ...(hasTrack ? [{ action: 'gpx' as const, icon: 'route' as const, title: t('discover.routeExportGpx'), subtitle: t('discover.routeExportGpxHint') }] : []),
    ...(originalFormat ? [{ action: 'original' as const, icon: 'download' as const, title: t('discover.routeExportOriginal'), subtitle: t('discover.routeExportOriginalHint', { format: originalFormat }) }] : []),
  ];

  return (
    <View style={[StyleSheet.absoluteFill, { justifyContent: 'flex-end', zIndex: 260 }]}>
      <Pressable accessibilityRole="button" accessibilityLabel={t('common.cancel')} style={[StyleSheet.absoluteFill, styles.backdrop]} onPress={onClose} />
      <Animated.View
        style={[
          styles.sheet,
          {
            transform: [{ translateY }],
            backgroundColor: theme.groupedBg,
            borderColor: theme.border,
            paddingBottom: Math.max(insets.bottom, space.md),
          },
        ]}
      >
        <View {...pan.panHandlers} style={styles.grabberArea}>
          <View style={[styles.grabber, { backgroundColor: theme.dark ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.12)' }]} />
        </View>
        <Text numberOfLines={1} style={[type.sectionTitle, styles.title, { color: theme.text }]}>{t('discover.routeShare')}</Text>
        <View style={[styles.card, { backgroundColor: theme.surfaceTop }]}>
          {rows.map((row, index) => (
            <ShareRow
              key={row.action}
              theme={theme}
              icon={row.icon}
              title={row.title}
              subtitle={row.subtitle}
              busy={busy === row.action}
              disabled={busy != null}
              divider={index > 0}
              onPress={() => void run(row.action)}
            />
          ))}
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    backgroundColor: 'rgba(0,0,0,0.48)',
  },
  sheet: {
    maxHeight: '92%',
    overflow: 'hidden',
    borderTopLeftRadius: radius.feature,
    borderTopRightRadius: radius.feature,
    borderWidth: StyleSheet.hairlineWidth,
  },
  grabberArea: {
    paddingTop: space.sm,
    paddingBottom: space.xs,
    alignItems: 'center',
  },
  grabber: {
    width: 36,
    height: 5,
    borderRadius: radius.pill,
  },
  title: {
    marginTop: space.xs,
    paddingHorizontal: space.lg,
  },
  card: {
    marginTop: space.md,
    marginHorizontal: space.lg,
    marginBottom: space.sm,
    borderRadius: radius.feature,
    overflow: 'hidden',
  },
  row: {
    minHeight: 72,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  rowIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowCopy: {
    flex: 1,
    minWidth: 0,
  },
  rowSubtitle: {
    marginTop: 2,
  },
});
