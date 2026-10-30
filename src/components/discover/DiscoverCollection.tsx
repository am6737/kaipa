import React, { memo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Svg, { Circle, Polyline } from 'react-native-svg';
import { Theme } from '../../theme/theme';
import { MONO } from '../../theme/fonts';
import { Poi } from '../../data/pois';
import { layout, radius, space, type } from '../../design-system';
import { Icon, IconName } from '../Icon';
import { PhotoTile } from '../PhotoTile';
import { RoutePhotoCarousel } from './RoutePhotoCarousel';
import { Press } from '../Press';
import { simplifyTrack } from '../maps/extent';
import { useI18n } from '../../i18n';
import { StaggerIn } from '../StaggerIn';

type Filter = { id: string; label: string };

export function DiscoverCollectionHeader({
  theme,
  eyebrow,
  title,
  summary,
  filters,
  activeFilter,
  onFilterChange,
  onFilter,
  onSecondary,
  secondaryIcon,
  onAdd,
  onBack,
  showActions = true,
}: {
  theme: Theme;
  eyebrow: string;
  title: string;
  summary: string;
  filters: readonly Filter[];
  activeFilter: number;
  onFilterChange: (index: number) => void;
  onFilter: () => void;
  onSecondary?: () => void;
  secondaryIcon?: IconName;
  onAdd: () => void;
  onBack?: () => void;
  showActions?: boolean;
}) {
  const compactTitle = !eyebrow && !summary && !onBack;
  return (
    <View style={{ paddingHorizontal: space.md, paddingBottom: space.sm }}>
      <View style={{ flexDirection: 'row', alignItems: compactTitle ? 'center' : 'flex-start', gap: space.sm }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          {onBack ? (
            <Press onPress={onBack} style={{ alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: space.xxs, marginBottom: space.xxs }}>
              <Icon name="chevronL" color={theme.accent} size={14} />
              <Text style={[type.eyebrow, { color: theme.accent }]}>{eyebrow}</Text>
            </Press>
          ) : eyebrow ? (
            <Text style={[type.eyebrow, { color: theme.text3, textTransform: 'uppercase', marginBottom: space.xxs }]}>{eyebrow}</Text>
          ) : null}
          <Text numberOfLines={1} style={[compactTitle ? type.pageTitle : type.sectionTitle, { color: theme.text }]}>{title}</Text>
          {summary ? <Text numberOfLines={1} style={[type.caption, { color: theme.text2, marginTop: space.xxs }]}>{summary}</Text> : null}
        </View>
        {showActions ? (
          <View style={{ flexDirection: 'row', gap: space.xs }}>
            <HeaderButton theme={theme} name="filter" onPress={onFilter} />
            {onSecondary && secondaryIcon ? <HeaderButton theme={theme} name={secondaryIcon} onPress={onSecondary} /> : null}
            <HeaderButton theme={theme} name="plus" onPress={onAdd} />
          </View>
        ) : null}
      </View>
      {filters.length ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 6, paddingTop: space.md, paddingRight: space.md }}
        >
          {filters.map((filter, index) => {
            const active = index === activeFilter;
            return (
              <Press
                key={filter.id}
                onPress={() => onFilterChange(index)}
                style={{
                  height: 36,
                  paddingHorizontal: 14,
                  borderRadius: radius.pill,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: active ? theme.accent : theme.surfaceTop,
                  borderWidth: StyleSheet.hairlineWidth,
                  borderColor: active ? theme.accent : theme.fieldBorder,
                }}
              >
                <Text style={{ fontSize: 12.5, fontWeight: active ? '700' : '600', color: active ? '#fff' : theme.text2 }}>{filter.label}</Text>
              </Press>
            );
          })}
        </ScrollView>
      ) : null}
    </View>
  );
}

function HeaderButton({ theme, name, onPress }: { theme: Theme; name: IconName; onPress: () => void }) {
  return (
    <Press
      onPress={onPress}
      accessibilityRole="button"
      style={{
        width: layout.iconButton,
        height: layout.iconButton,
        borderRadius: radius.pill,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: theme.controlSurface,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: theme.fieldBorder,
      }}
    >
      <Icon name={name} color={theme.text} size={19} />
    </Press>
  );
}

const DIFF_COLORS: Record<NonNullable<Poi['diff']>, string> = {
  易: '#5E8C3A',
  中: '#4A5A2A',
  中高: '#C26A1E',
  高: '#A8322A',
};

const fmtCount = (n: number) => n.toLocaleString('en-US');

// The catalog has no moving time, so a route without a recorded duration gets
// the DIN 33466 hiking-time estimate (4 km/h on the flat, 300 m/h of climb).
function routeDurationMinutes(poi: Poi): number | undefined {
  if (poi.trackDurationMs && poi.trackDurationMs > 0) return Math.round(poi.trackDurationMs / 60000);
  const km = parseFloat(poi.dist.replace(/,/g, '')) || 0;
  const climb = parseFloat(poi.asc.replace(/[+,]/g, '')) || 0;
  if (!km) return undefined;
  const flat = km / 4;
  const up = climb / 300;
  return Math.round((Math.max(flat, up) + Math.min(flat, up) / 2) * 60);
}

// Cards a list renders on its first frame; the next page mounts only when the
// reader scrolls near the end. Mounting the rest in the background meant 全国's
// 88 cards built four at a time for two seconds, 50-100ms of JS each, right over
// the camera's zoom-out - and InteractionManager no longer waits for anything.
const FIRST_BATCH = 4;
const NEXT_BATCH = 4;

/**
 * The Discover route list. `onOpen` may change identity on every parent render;
 * cards only re-render when their route or the theme changes. Each change of
 * `pageRequest` mounts the next batch.
 */
export function DiscoverRouteList({ theme, routes, onOpen, staggered, pageRequest }: { theme: Theme; routes: Poi[]; onOpen: (route: Poi) => void; staggered: boolean; pageRequest: number }) {
  const openRef = React.useRef(onOpen);
  openRef.current = onOpen;
  const open = React.useCallback((route: Poi) => openRef.current(route), []);
  const [count, setCount] = useState(FIRST_BATCH);
  const [batchedRoutes, setBatchedRoutes] = useState(routes);
  const [servedRequest, setServedRequest] = useState(pageRequest);
  if (batchedRoutes !== routes) {
    setBatchedRoutes(routes);
    setCount(FIRST_BATCH);
    setServedRequest(pageRequest);
  } else if (servedRequest !== pageRequest) {
    setServedRequest(pageRequest);
    if (count < routes.length) {
      setCount(count + NEXT_BATCH);
    }
  }
  return (
    <View style={{ gap: space.xl, paddingTop: space.xxs }}>
      {routes.slice(0, count).map((route, index) => (
        <StaggerIn key={route.id} index={index} staggered={staggered}>
          <DiscoverRouteCard theme={theme} poi={route} onOpen={open} />
        </StaggerIn>
      ))}
    </View>
  );
}

export const DiscoverRouteCard = memo(function DiscoverRouteCard({ theme, poi, onOpen }: { theme: Theme; poi: Poi; onOpen: (route: Poi) => void }) {
  const { t } = useI18n();
  // The list pads the sheet by space.md on both sides.
  const width = useWindowDimensions().width - space.md * 2;
  const photoHeight = Math.round(width * 0.62);
  const minutes = routeDurationMinutes(poi);
  const duration = minutes == null
    ? undefined
    : minutes < 60
      ? t('record.dur.minutes', { n: minutes })
      : minutes % 60
        ? t('record.dur.hoursMinutes', { h: Math.floor(minutes / 60), m: minutes % 60 })
        : t('record.dur.hours', { h: minutes / 60 });
  const ascent = poi.asc.replace('+', '');
  return (
    <View>
      <Press onPress={() => onOpen(poi)} style={{ borderRadius: radius.feature }}>
        <View>
          <RoutePhotoCarousel
            theme={theme}
            photos={poi.photoUris}
            width={width}
            height={photoHeight}
            radius={radius.feature}
            fallback={<PhotoTile tone={poi.tone} seed={poi.id} radius={radius.feature} resWidth={900} style={StyleSheet.absoluteFill} />}
          />
          {poi.diff ? (
            <View pointerEvents="none" style={{ position: 'absolute', left: space.sm, top: space.sm, height: 26, paddingHorizontal: 9, borderRadius: 8, justifyContent: 'center', backgroundColor: DIFF_COLORS[poi.diff] }}>
              <Text style={[type.labelStrong, { color: '#fff' }]}>{t(`discover.diffBadge.${poi.diff}`)}</Text>
            </View>
          ) : null}
          {poi.trackCoords && poi.trackCoords.length >= 2 ? (
            <View pointerEvents="none" style={{ position: 'absolute', right: space.sm, bottom: space.sm }}>
              <RouteShapeThumb theme={theme} coords={poi.trackCoords} />
            </View>
          ) : null}
        </View>
        <View style={{ paddingTop: space.sm, paddingHorizontal: space.xxs }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, minWidth: 0 }}>
            {poi.rating ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.xxs }}>
                <Icon name="starFill" color={theme.accent} size={15} />
                <Text style={[type.small, { fontWeight: '600', color: theme.text2, fontVariant: ['tabular-nums'] }]}>{poi.rating}</Text>
              </View>
            ) : null}
            {poi.reviews ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.xxs }}>
                <Icon name="people" color={theme.accent} size={15} />
                <Text style={[type.small, { fontWeight: '600', color: theme.text2, fontVariant: ['tabular-nums'] }]}>{fmtCount(poi.reviews)}</Text>
              </View>
            ) : null}
            {poi.mine ? (
              <>
                <View style={{ flex: 1 }} />
                <Icon name="user" color={theme.accent} size={14} />
              </>
            ) : null}
          </View>
          <Text numberOfLines={2} style={[type.threadCardTitle, { fontSize: 18, lineHeight: 24, fontWeight: '800', color: theme.text, marginTop: space.xs }]}>{poi.name}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', columnGap: space.md, rowGap: space.xxs, marginTop: space.xs }}>
            {duration ? <RouteStat theme={theme} icon="clock" text={duration} /> : null}
            {poi.dist ? <RouteStat theme={theme} icon="distance" text={poi.dist} /> : null}
            {ascent ? <RouteStat theme={theme} icon="arrowUp" text={ascent} /> : null}
          </View>
        </View>
      </Press>
    </View>
  );
});

function RouteStat({ theme, icon, text }: { theme: Theme; icon: IconName; text: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
      <Icon name={icon} color={theme.text2} size={16} />
      <Text numberOfLines={1} style={{ fontFamily: MONO, fontSize: 14, fontWeight: '600', color: theme.text2, fontVariant: ['tabular-nums'] }}>{text}</Text>
    </View>
  );
}

const THUMB = 64;
const THUMB_PAD = 10;

// Shapes keyed by the track array itself, so a card that remounts (filter
// switch, list re-batch) doesn't walk a thousands-of-points track again.
const shapeCache = new WeakMap<[number, number][], { points: string; start: number[] }>();

function routeShape(coords: [number, number][]) {
  const cached = shapeCache.get(coords);
  if (cached) return cached;
  // A 44 pt drawing needs a few hundred points at most; sample before simplifying.
  const stride = Math.max(1, Math.floor(coords.length / 400));
  const sampled = stride > 1 ? coords.filter((_, i) => i % stride === 0 || i === coords.length - 1) : coords;
  let minLng = Infinity, maxLng = -Infinity, minLat = Infinity, maxLat = -Infinity;
  for (const [lng, lat] of sampled) {
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
  }
  const xScale = Math.cos((((minLat + maxLat) / 2) * Math.PI) / 180) || 1;
  const spanX = (maxLng - minLng) * xScale;
  const spanY = maxLat - minLat;
  const span = Math.max(spanX, spanY) || 1;
  const inner = THUMB - THUMB_PAD * 2;
  const offsetX = THUMB_PAD + (inner - (spanX / span) * inner) / 2;
  const offsetY = THUMB_PAD + (inner - (spanY / span) * inner) / 2;
  const project = ([lng, lat]: [number, number]) => [
    offsetX + (((lng - minLng) * xScale) / span) * inner,
    offsetY + ((maxLat - lat) / span) * inner,
  ];
  const shape = {
    points: simplifyTrack(sampled, span / 150).map((c) => project(c).map((v) => v.toFixed(1)).join(',')).join(' '),
    start: project(coords[0]),
  };
  shapeCache.set(coords, shape);
  return shape;
}

/** The route's outline on a small tile, so its shape reads before the photo does. */
function RouteShapeThumb({ theme, coords }: { theme: Theme; coords: [number, number][] }) {
  const shape = routeShape(coords);
  return (
    <View style={{ width: THUMB, height: THUMB, borderRadius: radius.control + 2, borderWidth: 2, borderColor: '#fff', backgroundColor: theme.surfaceTop, overflow: 'hidden' }}>
      <Svg width={THUMB - 4} height={THUMB - 4} viewBox={`2 2 ${THUMB - 4} ${THUMB - 4}`}>
        <Polyline points={shape.points} fill="none" stroke={theme.accent} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
        <Circle cx={shape.start[0]} cy={shape.start[1]} r={4} fill={theme.text} stroke="#fff" strokeWidth={1.5} />
      </Svg>
    </View>
  );
}
