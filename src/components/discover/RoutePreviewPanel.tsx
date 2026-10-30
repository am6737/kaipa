import React from 'react';
import { ActivityIndicator, Animated, LayoutChangeEvent, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { Theme } from '../../theme/theme';
import { Poi } from '../../data/pois';
import { useRouteGuides } from '../../hooks/useRouteGuides';
import { useOfficialItineraries } from '../../hooks/useOfficialItineraries';
import { mergeGuideList } from '../../data/guideList';
import { layout, radius, space, type } from '../../design-system';
import { useI18n } from '../../i18n';
import { useNav } from '../../nav/NavContext';
import { Icon, IconName } from '../Icon';
import { Press } from '../Press';
import { useSlidingIndicator } from '../useSlidingIndicator';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { OfflineMapRow } from '../maps/OfflineMapRow';
import { RoutePhotoStrip } from './RoutePhotoStrip';
import { RouteGuideRow, RouteGuideSectionHeader, RouteWeatherCard } from './RouteGuideContent';
import { routeGuideCopy } from './routeGuideCopy';
import { RouteCommentPreviewRow } from './RouteCommentItem';
import { useRouteComments } from '../../hooks/useRouteComments';
import { directedClimb } from '../../data/elevation';
import { regionLabel } from '../../lib/regionLabel';
import { haversine } from '../../lib/trackParser';
import { EndpointBadge, ROUTE_START_COLOR } from './routeEndpointMarkers';
import { climbValueMeters, directedWaypoints, durationParts, elevationAtKm, estimateDurationMinutes, featuredWaypoints, hasMeasuredElevation, routeDistanceParts, routeGallery, type DirectedWaypoint } from '../../lib/routePreview';
import { buildElevation } from '../../data/elevation';
import { ElevationProfile, type ElevationMark } from '../tracks/ElevationProfile';
import { ElevationStats } from '../tracks/ElevationStats';
import { bestSeasonLabel, difficultyLabel } from './routePreviewLabels';

const SPACED_JOINER = ' ';

function durationSegments(minutes: number | null, units: { hours: string; minutes: string }): StatSegment[] | null {
  if (minutes == null) return null;
  const parts = durationParts(minutes, units);
  const segments: StatSegment[] = [];
  if (parts.hours) segments.push({ kind: 'value', text: parts.hours }, { kind: 'unit', text: units.hours });
  if (parts.minutes) segments.push({ kind: 'value', text: (parts.hours ? SPACED_JOINER : '') + parts.minutes }, { kind: 'unit', text: units.minutes });
  return segments;
}

function climbSegments(meters: number | undefined): StatSegment[] | null {
  const value = climbValueMeters(meters);
  return value == null ? null : [{ kind: 'value', text: value }, { kind: 'unit', text: ' m' }];
}

/**
 * The title block a route card opens with: one meta line (difficulty badge,
 * region, and a small close disc only where the caller passes `onClose`), then
 * the title on its own, up to three lines. On the map the card closes from the
 * back chevron in the top-left corner instead.
 * The panel body and the sheet's pinned overlay render the same component, so
 * the two never drift apart while the sheet slides under it. The share action
 * is not here — it sits in the map's top-right corner instead.
 */
export function RoutePreviewIdentity({ theme, route, onClose, inset = true }: { theme: Theme; route: Poi; onClose?: () => void; /** The sheet overlay pads itself; the panel body is already inside the sheet's padding. */ inset?: boolean }) {
  const { t, resolved } = useI18n();
  const difficulty = difficultyLabel(t, route.diff);
  const region = regionLabel(route.region);
  return (
    <View style={{ paddingTop: space.xs, paddingHorizontal: inset ? layout.pagePadding : 0, backgroundColor: theme.featureSurface }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
        {difficulty ? (
          <View style={{ height: 24, paddingHorizontal: space.xs + 2, borderRadius: radius.control, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.accent }}>
            <Text style={{ fontSize: 12, fontWeight: '700', color: '#FFFFFF' }}>{difficulty}</Text>
          </View>
        ) : null}
        {region ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.xxs, flexShrink: 1 }}>
            <Icon name="pin" color={theme.text2} size={13} />
            <Text numberOfLines={1} style={{ flexShrink: 1, ...type.small, color: theme.text2 }}>{region}</Text>
          </View>
        ) : null}
        {onClose ? (
          <View style={{ flex: 1, alignItems: 'flex-end' }}>
            <Press
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel={t('common.close')}
              hitSlop={7}
              style={{ minWidth: layout.iconButton, minHeight: layout.iconButton, alignItems: 'center', justifyContent: 'center' }}
            >
              <View style={{ width: 30, height: 30, borderRadius: radius.pill, backgroundColor: theme.fieldSurface, alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="close" color={theme.text2} size={14} strokeWidth={2} />
              </View>
            </Press>
          </View>
        ) : null}
      </View>
      <Text numberOfLines={3} style={[type.pageTitle, { marginTop: space.sm, color: theme.text, fontSize: 28, lineHeight: 34 }]}>{route.name}</Text>
    </View>
  );
}

/** The sections the pinned tabs can jump to. The panel reports the tops of
 *  whichever ones it actually renders. */
export type RoutePreviewSectionKey = 'overview' | 'photos' | 'about' | 'elevation' | 'waypoints' | 'weather' | 'comments' | 'guides';
export type RoutePreviewSection = { key: RoutePreviewSectionKey; y: number };

const SECTION_LABEL = {
  overview: 'route.preview.sectionOverview',
  photos: 'route.preview.sectionPhotos',
  about: 'route.preview.sectionAbout',
  elevation: 'route.preview.sectionElevation',
  waypoints: 'route.preview.sectionWaypoints',
  weather: 'route.preview.sectionWeather',
  comments: 'route.preview.sectionComments',
  guides: 'route.preview.sectionGuides',
} as const;

/**
 * The fullscreen title: one compact line and the row of section tabs, pinned
 * over the sheet body by its overlay. The sheet stops under the map's top
 * chrome, so closing stays with the back chevron there. When this is up the panel drops its own
 * title block and starts its content under the header, so the two never stack
 * into a ghost.
 */
export function RoutePreviewStickyHeader({ theme, route, sections, activeKey, onSelectSection, onHeightChange }: {
  theme: Theme;
  route: Poi;
  sections: RoutePreviewSectionKey[];
  activeKey: RoutePreviewSectionKey;
  onSelectSection: (key: RoutePreviewSectionKey) => void;
  onHeightChange?: (height: number) => void;
}) {
  const { t } = useI18n();
  const tabsRef = React.useRef<ScrollView>(null);
  const tabXRef = React.useRef<Partial<Record<RoutePreviewSectionKey, number>>>({});
  const indicator = useSlidingIndicator(activeKey);
  React.useEffect(() => {
    const x = tabXRef.current[activeKey];
    if (x == null) return;
    tabsRef.current?.scrollTo({ x: Math.max(0, x - layout.pagePadding), animated: true });
  }, [activeKey]);
  return (
    <View
      style={{ paddingTop: space.xs, backgroundColor: theme.featureSurface }}
      onLayout={(event) => onHeightChange?.(Math.round(event.nativeEvent.layout.height))}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: layout.pagePadding }}>
        <Text numberOfLines={1} style={{ flex: 1, ...type.navTitle, color: theme.text }}>{route.name}</Text>
      </View>
      {sections.length ? (
        <ScrollView horizontal ref={tabsRef} showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: layout.pagePadding, gap: space.lg }}>
          {sections.map((key) => {
            const selected = key === activeKey;
            return (
              <Press
                key={key}
                onPress={() => onSelectSection(key)}
                accessibilityRole="tab"
                accessibilityState={{ selected }}
                onLayout={(event) => {
                  tabXRef.current[key] = event.nativeEvent.layout.x;
                  indicator.onTabLayout(key, event.nativeEvent.layout);
                }}
                style={{ paddingVertical: space.xs }}
              >
                <Text style={[type.body, { color: selected ? theme.text : theme.text2, fontWeight: selected ? '600' : '400' }]}>{t(SECTION_LABEL[key])}</Text>
                <View style={{ height: 2, marginTop: 6 }} />
              </Press>
            );
          })}
          <Animated.View pointerEvents="none" style={[{ position: 'absolute', bottom: space.xs, height: 2, borderRadius: 1, backgroundColor: theme.text }, indicator.style]} />
        </ScrollView>
      ) : null}
    </View>
  );
}

/** Icon plus a short fact, in the quiet colour the property rows use. A
 *  `label` names the fact first ("最佳季节 5–10 月"), so a bare value such as a
 *  month range doesn't leave the reader guessing what it means. */
function RouteProperty({ theme, icon, label, text }: { theme: Theme; icon: IconName; label?: string; text: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.xxs }}>
      <Icon name={icon} color={theme.text2} size={15} />
      <Text numberOfLines={1} style={{ ...type.small, color: theme.text2 }}>{label ? `${label} ${text}` : text}</Text>
    </View>
  );
}

/** One piece of a headline figure: a number gets the big role, its unit the
 *  quiet one, so "4 小时 15 分" can be styled piece by piece. */
type StatSegment = { kind: 'value' | 'unit'; text: string };

/** One of the four headline figures: quiet label over large tabular numbers,
 *  and `--` in text3 when the route has no such value. */
function RouteStat({ theme, label, segments }: { theme: Theme; label: string; segments: StatSegment[] | null }) {
  const empty = !segments || segments.length === 0;
  return (
    <View style={{ gap: 2 }}>
      <Text style={[type.statLabel, { color: theme.text2 }]} numberOfLines={1}>{label}</Text>
      <Text numberOfLines={1} style={[type.statValue, { color: empty ? theme.text3 : theme.text }]}>
        {empty ? '--' : segments.map((segment) => (
          <Text key={`${segment.kind}-${segment.text}`} style={segment.kind === 'unit' ? { color: theme.text2, ...type.liveUnit, lineHeight: 28 } : undefined}>{segment.text}</Text>
        ))}
      </Text>
    </View>
  );
}

/** A section title, with its count quieter on the same line, and a trailing ›
 *  where the section has a page of its own. The › is only an affordance: the
 *  section itself is the tap target, so the header never holds a button. */
function RouteSectionHeader({ theme, title, count, chevron }: { theme: Theme; title: string; count?: number; chevron?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: chevron ? 'center' : 'baseline', gap: space.xs }}>
      <Text style={[type.sectionTitle, { color: theme.text }]}>{title}</Text>
      {count != null ? <Text style={[type.sectionTitle, { color: theme.text3, fontWeight: '600' }]}>{count}</Text> : null}
      {chevron ? (
        <View style={{ flex: 1, alignItems: 'flex-end' }}>
          <Icon name="chevronR" color={theme.text3} size={18} strokeWidth={2.2} />
        </View>
      ) : null}
    </View>
  );
}

/** The trailhead or the finish, bracketing the waypoint cards the way the
 *  map's 起/终 pins bracket the track, and drawn as those same pins: what it
 *  is, one quiet fact, and an optional action on the right. */
function RouteEndpointRow({ glyph, color, theme, title, detail, action }: { theme: Theme; glyph: string; color: string; title: string; detail?: string | null; action?: React.ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: layout.fieldHeight }}>
      <EndpointBadge color={color} label={glyph} size={ENDPOINT_BADGE} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={[type.cardTitle, { color: theme.text }]}>{title}</Text>
        {detail ? <Text numberOfLines={1} style={[type.small, { color: theme.text2, marginTop: 2 }]}>{detail}</Text> : null}
      </View>
      {action}
    </View>
  );
}

/** 前往 beside the 起点 row. Idle it is the accent call to action; while the
 *  road is being planned it holds a spinner; once the way is on the map it
 *  turns into a quiet 取消 that clears it, in the bar pills' neutral fill. */
function DirectionsButton({ theme, state, onPress }: { theme: Theme; state: 'idle' | 'loading' | 'shown'; onPress: () => void }) {
  const { t } = useI18n();
  const idle = state === 'idle';
  return (
    <Press
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={idle ? t('route.preview.waypointDirections') : t('common.cancel')}
      accessibilityState={{ busy: state === 'loading', selected: state === 'shown' }}
      hitSlop={6}
      style={{
        height: DIRECTIONS_HEIGHT,
        minWidth: 72,
        paddingHorizontal: space.md,
        borderRadius: radius.pill,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: space.xxs,
        backgroundColor: idle ? theme.accent : theme.fieldSurface,
      }}
    >
      {state === 'loading' ? <ActivityIndicator size="small" color={theme.text2} /> : idle ? (
        // White on the accent fill.
        <Text style={[type.labelStrong, { color: '#FFFFFF' }]}>{t('route.preview.waypointDirections')}</Text>
      ) : (
        <>
          <Icon name="close" color={theme.text} size={13} strokeWidth={2.2} />
          <Text style={[type.labelStrong, { color: theme.text }]}>{t('common.cancel')}</Text>
        </>
      )}
    </Press>
  );
}

const DIRECTIONS_HEIGHT = 36;

/** One waypoint as a compact card in the swipeable row: one fixed height, the
 *  walking-order number worn in the same accent disc the map shows, then the
 *  name, the mileage and the height there. A real photo adds a square
 *  thumbnail on the right and a wider card; a waypoint without one is just the
 *  narrower text card — no photo placeholder of any kind. */
function RouteWaypointCard({ theme, waypoint, meters, photo, onPress }: { theme: Theme; waypoint: DirectedWaypoint; meters: string | null; photo?: string; onPress?: () => void }) {
  const { t } = useI18n();
  const km = t('route.preview.waypointKm', { km: waypoint.alongKm.toFixed(1) });
  return (
    <Press
      onPress={onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={`${waypoint.name} ${km}`}
      style={{
        width: photo ? WAYPOINT_PHOTO_CARD_WIDTH : WAYPOINT_CARD_WIDTH,
        height: WAYPOINT_CARD_HEIGHT,
        paddingHorizontal: space.sm,
        borderRadius: radius.card,
        backgroundColor: theme.fieldSurface,
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.xs,
      }}
    >
      <View style={{ flex: 1, minWidth: 0, gap: space.xs }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.xs }}>
          <View style={{ width: WAYPOINT_DISC, height: WAYPOINT_DISC, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.accent }}>
            {/* White on the accent disc. */}
            <Text style={[type.labelStrong, { color: '#FFFFFF' }]}>{waypoint.order}</Text>
          </View>
          <Text numberOfLines={1} style={{ flexShrink: 1, ...type.cardTitle, color: theme.text }}>{waypoint.name}</Text>
        </View>
        <Text numberOfLines={1} style={[type.small, { color: theme.text2 }]}>{meters ? `${km}  ${meters} m` : km}</Text>
      </View>
      {photo ? (
        <Image source={{ uri: photo }} recyclingKey={photo} cachePolicy="memory-disk" contentFit="cover" transition={120} style={{ width: WAYPOINT_THUMB, height: WAYPOINT_THUMB, borderRadius: radius.control }} />
      ) : null}
    </Press>
  );
}

const ENDPOINT_BADGE = 32;
const WAYPOINT_CARD_HEIGHT = 84;
const WAYPOINT_DISC = 24;
const WAYPOINT_THUMB = 64;
const WAYPOINT_CARD_WIDTH = 156;
// The thumbnail widens the card rather than squeezing the text, so the
// mileage line has the same room on both kinds of card.
const WAYPOINT_PHOTO_CARD_WIDTH = WAYPOINT_CARD_WIDTH + space.xs + WAYPOINT_THUMB;

/** The photo a waypoint carries, when it carries one. */
const waypointPhoto = (photo: string | undefined) => (photo?.trim() ? photo : undefined);

export function RoutePreviewPanel({ theme, poi, reversed = false, hideIdentity = false, stickyInset = 0, onSectionsChange, onOpenWaypoint, onOpenElevation, userLocation, onNavigate, navigation }: {
  theme: Theme;
  poi: Poi;
  /** Walking the route from its recorded finish. */
  reversed?: boolean;
  /** Fullscreen: the sheet's pinned header carries the title, so the body drops its own copy. */
  hideIdentity?: boolean;
  /** Height of that pinned header; the body starts below it so nothing hides under it. */
  stickyInset?: number;
  /** Each rendered section's top, measured within the sheet body's scroll content. */
  onSectionsChange?: (sections: RoutePreviewSection[]) => void;
  /** A waypoint row was tapped: open that spot on the map, by its index in the
   *  route's stored waypoint list. */
  onOpenWaypoint?: (index: number) => void;
  /** The 海拔 card was tapped: open the full page for this route's
   *  elevation, the way a library track shows its own. The card is a picture
   *  without it. */
  onOpenElevation?: () => void;
  /** Where the user last was, for how far away the trailhead is. */
  userLocation?: { lng: number; lat: number } | null;
  /** 前往: directions to the trailhead, beside the start row; tapping again clears them. */
  onNavigate?: () => void;
  /** The trailhead directions on the map: planning (`loading`), or drawn with
   *  the road distance and time when the planner returned them. */
  navigation?: { loading: boolean; distanceMeters?: number; durationSeconds?: number } | null;
}) {
  const nav = useNav();
  const insets = useSafeAreaInsets();
  const { t, resolved } = useI18n();
  const c = routeGuideCopy[resolved];
  const route = nav.merged(poi);
  const { guides, loading: guidesLoading } = useRouteGuides(route.id);
  const { plans: officialPlans, loading: officialLoading } = useOfficialItineraries(route.id);
  const guideEntries = mergeGuideList(officialPlans, guides);
  const { comments, total: commentTotal, loading: commentsLoading } = useRouteComments(route.id, { preview: true, pageSize: 2 });
  const openComments = (compose = false) => nav.openRouteGuide({ route, view: 'comments', compose });
  const climb = directedClimb(route, reversed);
  const season = bestSeasonLabel(t, resolved, route.bestMonths);
  const distance = routeDistanceParts(route.dist);
  const durationMinutes = estimateDurationMinutes(route, climb.ascent);
  // Only a measured profile is worth a section; `buildElevation` would otherwise
  // invent a curve from distance and ascent.
  const profile = React.useMemo(() => buildElevation(route, { synthesize: false }), [route.id, route.trackElevation, route.dist, route.asc]);
  // Walked backwards, the route starts at its recorded finish, not at its pin.
  const trailhead = (reversed ? route.trackCoords?.[route.trackCoords.length - 1] : undefined) ?? [route.lng, route.lat];
  const startAwayMeters = userLocation ? haversine({ lat: userLocation.lat, lon: userLocation.lng }, { lat: trailhead[1], lon: trailhead[0] }) : null;
  const driveDetail = React.useMemo(() => {
    if (!navigation || navigation.loading) return null;
    const parts: string[] = [];
    if (navigation.durationSeconds) {
      const d = durationParts(navigation.durationSeconds / 60, { hours: t('route.preview.unitHours'), minutes: t('route.preview.unitMinutes') });
      parts.push([d.hours && `${d.hours} ${d.hoursUnit}`, d.minutes && `${d.minutes} ${d.minutesUnit}`].filter(Boolean).join(' '));
    }
    if (navigation.distanceMeters) parts.push(`${(navigation.distanceMeters / 1000).toFixed(navigation.distanceMeters < 10000 ? 1 : 0)} km`);
    return parts.length ? t('route.preview.waypointDrive', { detail: parts.join('  ') }) : null;
  }, [navigation, t]);
  const startAwayKm = startAwayMeters == null ? null : startAwayMeters < 10000 ? (startAwayMeters / 1000).toFixed(1) : Math.round(startAwayMeters / 1000).toLocaleString('en-US');
  const measured = hasMeasuredElevation(route.trackElevation);
  const waypoints = React.useMemo(
    () => directedWaypoints(route.trackWaypoints, profile.totalKm, reversed),
    [route.trackWaypoints, profile.totalKm, reversed],
  );
  // The shots worth looking at: the ones taken along the trail first, then the
  // route's own pictures. The gallery numbers its photos the way the list does,
  // so a spot carries the same mileage everywhere.
  const gallery = React.useMemo(
    () => routeGallery(route, reversed, profile.totalKm),
    [route.photoUris, route.trackWaypoints, route.dist, reversed, profile.totalKm],
  );
  // The spots worth pulling out of a long list — all of them when nobody
  // marked any — numbered as the map numbers them, so a highlight keeps its
  // own number on the curve, in the list and on the map.
  const markers = React.useMemo(() => featuredWaypoints(waypoints), [waypoints]);
  const hasHighlights = markers.length !== waypoints.length;
  // Mileage already counted from the end being walked, so the badges line up
  // with a mirrored curve without the chart flipping them a second time.
  const profileMarks = React.useMemo<ElevationMark[]>(
    () => markers.map((waypoint) => ({ km: waypoint.alongKm, label: String(waypoint.order), index: waypoint.index })),
    [markers],
  );
  // The curve read in the direction being walked: mileage from the trailhead
  // the walk starts at, so the climb rises the way the walker sees it.
  const walkedProfile = React.useMemo(() => {
    if (!reversed) return profile;
    const pts = profile.pts
      .map((pt) => ({ ...pt, km: Math.max(0, profile.totalKm - pt.km), grade: -pt.grade }))
      .reverse();
    return { ...profile, pts };
  }, [profile, reversed]);
  // The chart measures its own plot, which is as wide as the sheet's body.
  const [profileWidth, setProfileWidth] = React.useState(0);

  const [waypointsExpanded, setWaypointsExpanded] = React.useState(false);
  React.useEffect(() => setWaypointsExpanded(false), [route.id, reversed]);
  const listedWaypoints = waypointsExpanded || !hasHighlights ? waypoints : markers;
  const moreWaypoints = waypoints.length - listedWaypoints.length;

  const sectionTopsRef = React.useRef<Partial<Record<RoutePreviewSectionKey, number>>>({});
  const rootTopRef = React.useRef(0);
  const reportSections = React.useCallback(() => {
    if (!onSectionsChange) return;
    const present: RoutePreviewSectionKey[] = [
      'overview',
      ...(gallery.length ? (['photos'] as const) : []),
      ...(route.desc ? (['about'] as const) : []),
      ...(measured ? (['elevation'] as const) : []),
      ...(waypoints.length ? (['waypoints'] as const) : []),
      'weather',
      'comments',
      'guides',
    ];
    const sections = present
      .filter((key) => key === 'overview' || sectionTopsRef.current[key] !== undefined)
      .map((key) => ({ key, y: rootTopRef.current + (key === 'overview' ? 0 : sectionTopsRef.current[key] ?? 0) }));
    onSectionsChange(sections.sort((a, b) => a.y - b.y));
  }, [onSectionsChange, gallery.length, route.desc, measured, waypoints.length]);
  const measureSection = (key: RoutePreviewSectionKey) => (event: LayoutChangeEvent) => {
    sectionTopsRef.current[key] = event.nativeEvent.layout.y;
    reportSections();
  };

  // The 海拔 card, told rather than drawn twice: it is read-only here, because
  // the place to look along a route's curve is its track page, where a picked
  // point gets a marker on the map. So the whole card — heading, curve, heights
  // — is the one tap that opens it, and the › is only the hint that it does.
  const elevationCard = measured ? (
    <>
      <RouteSectionHeader theme={theme} title={t('route.preview.sectionElevation')} chevron={!!onOpenElevation} />
      <View
        style={{ marginTop: space.sm }}
        onLayout={(event) => setProfileWidth(event.nativeEvent.layout.width)}
      >
        <ElevationProfile
          theme={theme}
          series={walkedProfile}
          width={profileWidth}
          marks={profileMarks}
          interactive={false}
        />
      </View>
      <View style={{ marginTop: space.lg }}>
        <ElevationStats theme={theme} elevation={route.trackElevation} />
      </View>
    </>
  ) : null;

  return (
    <View
      style={{ paddingTop: hideIdentity ? space.xxs + stickyInset : space.xxs, paddingBottom: insets.bottom + 160 }}
      onLayout={(event) => { rootTopRef.current = event.nativeEvent.layout.y; reportSections(); }}
    >
      {hideIdentity ? null : <RoutePreviewIdentity theme={theme} route={route} inset={false} />}

      {season ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: space.md }}>
          <RouteProperty theme={theme} icon="calendar" label={t('route.seasonTitle')} text={season} />
        </View>
      ) : null}

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: space.lg, marginTop: space.xl }}>
        <View style={{ width: '50%', paddingRight: space.md }}>
          <RouteStat theme={theme} label={t('route.preview.statEstimated')} segments={durationSegments(durationMinutes, { hours: t('route.preview.unitHours'), minutes: t('route.preview.unitMinutes') })} />
        </View>
        <View style={{ width: '50%', paddingRight: space.md }}>
          <RouteStat theme={theme} label={t('route.preview.statDistance')} segments={distance ? [{ kind: 'value', text: distance.value }, ...(distance.unit ? [{ kind: 'unit' as const, text: ` ${distance.unit}` }] : [])] : null} />
        </View>
        <View style={{ width: '50%', paddingRight: space.md }}>
          <RouteStat theme={theme} label={t('route.preview.statAscent')} segments={climbSegments(climb.ascent)} />
        </View>
        <View style={{ width: '50%', paddingRight: space.md }}>
          <RouteStat theme={theme} label={t('route.preview.statDescent')} segments={climbSegments(climb.descent)} />
        </View>
      </View>

      {gallery.length ? (
        <View style={{ marginTop: space.xl }} onLayout={measureSection('photos')}>
          <RoutePhotoStrip theme={theme} photos={gallery} onOpenWaypoint={onOpenWaypoint} />
        </View>
      ) : null}

      {route.desc ? (
        <View style={{ marginTop: space.xl }} onLayout={measureSection('about')}>
          <Text style={[type.sectionTitle, { color: theme.text }]}>{t('journey.section.routeAbout')}</Text>
          <Text style={[type.body, { color: theme.text2, lineHeight: 23, marginTop: space.sm }]}>{route.desc}</Text>
          {route.seasonNote ? <Text style={[type.note, { color: theme.text3, marginTop: space.sm }]}>{route.seasonNote}</Text> : null}
        </View>
      ) : null}

      {measured ? (
        <View style={{ marginTop: space.xxxl }} onLayout={measureSection('elevation')}>
          {onOpenElevation ? (
            <Press
              onPress={onOpenElevation}
              accessibilityRole="button"
              accessibilityLabel={t('route.preview.openElevation')}
            >
              {elevationCard}
            </Press>
          ) : elevationCard}
        </View>
      ) : null}

      {/* 起点 and 终点 show on every route, since the start row carries 前往
          to the trailhead; the 途经点 heading and cards only when there are any. */}
      <View style={{ marginTop: space.xxxl }} onLayout={measureSection('waypoints')}>
        {waypoints.length ? <RouteSectionHeader theme={theme} title={t('route.preview.sectionWaypoints')} count={waypoints.length} /> : null}
        <View style={{ marginTop: waypoints.length ? space.md : 0 }}>
          <RouteEndpointRow
            theme={theme}
            glyph={t('route.direction.start')}
            color={ROUTE_START_COLOR}
            title={t('route.preview.waypointStart')}
            detail={driveDetail ?? (startAwayKm != null ? t('route.preview.waypointAway', { km: startAwayKm }) : null)}
            action={onNavigate ? (
              <DirectionsButton theme={theme} state={navigation ? (navigation.loading ? 'loading' : 'shown') : 'idle'} onPress={onNavigate} />
            ) : null}
          />
        </View>
        {/* Bleeds to the screen edge so the next card peeks past the bezel. */}
        {waypoints.length ? <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ marginHorizontal: -space.md, marginTop: space.xl }}
          contentContainerStyle={{ paddingHorizontal: space.md, gap: space.sm }}
        >
          {listedWaypoints.map((waypoint) => (
            <RouteWaypointCard
              key={`${waypoint.index}-${waypoint.name}`}
              theme={theme}
              waypoint={waypoint}
              meters={climbValueMeters(elevationAtKm(route.trackElevation, waypoint.km) ?? undefined)}
              photo={waypointPhoto(waypoint.photo)}
              onPress={onOpenWaypoint ? () => onOpenWaypoint(waypoint.index) : undefined}
            />
          ))}
        </ScrollView> : null}
        {moreWaypoints > 0 ? (
          <Press onPress={() => setWaypointsExpanded(true)} accessibilityRole="button" style={{ marginTop: space.md }}>
            <Text style={[type.small, { color: theme.accent, fontWeight: '600' }]}>{t('route.preview.waypointsAll', { n: waypoints.length })}</Text>
          </Press>
        ) : null}
        <View style={{ marginTop: waypoints.length ? space.xl : space.md }}>
          <RouteEndpointRow
            theme={theme}
            glyph={t('route.direction.finish')}
            color={theme.danger}
            title={t('route.preview.waypointFinish')}
            detail={profile.totalKm > 0 ? t('route.preview.waypointTotal', { km: profile.totalKm.toFixed(1) }) : null}
          />
        </View>
      </View>

      <View style={{ marginTop: space.xxxl }} onLayout={measureSection('weather')}>
        <RouteWeatherCard
          theme={theme}
          lng={route.lng}
          lat={route.lat}
          header={<RouteSectionHeader theme={theme} title={c.weatherDetail} chevron />}
          onPress={() => nav.openRouteGuide({ route, view: 'weather' })}
        />
      </View>
      <View style={{ marginTop: space.xxxl }} onLayout={measureSection('comments')}>
        <RouteGuideSectionHeader theme={theme} title={commentTotal ? `${c.comments} ${commentTotal}` : c.comments} tight action={c.allComments} onAction={() => openComments()} />
        {commentsLoading ? <Text style={{ color: theme.text2 }}>…</Text> : comments.length ? comments.map((comment, index) => <View key={comment.id} style={{ borderTopWidth: index ? StyleSheet.hairlineWidth : 0, borderTopColor: theme.hairline }}><RouteCommentPreviewRow theme={theme} comment={comment} onPress={() => openComments()} /></View>) : <Press accessibilityRole="button" onPress={() => openComments(true)} style={{ minHeight: 110, alignItems: 'center', justifyContent: 'center', gap: space.xs, paddingHorizontal: space.md }}><Text style={{ color: theme.text2, textAlign: 'center' }}>{c.noComments}</Text><Text style={[type.note, { color: theme.text3, textAlign: 'center' }]}>{c.noCommentsHint}</Text></Press>}
      </View>
      <View style={{ marginTop: space.xxxl }} onLayout={measureSection('guides')}>
        <RouteGuideSectionHeader theme={theme} title={c.guides} tight action={c.allGuides} onAction={() => nav.openRouteGuide({ route, view: 'guides', reversed })} />
        {guidesLoading || officialLoading ? <View style={{ minHeight: 110, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: theme.text2 }}>…</Text></View> : guideEntries.length ? guideEntries.slice(0, 2).map((entry) => <RouteGuideRow key={entry.id} theme={theme} guide={entry.kind === 'community' ? entry.guide : undefined} officialTitle={entry.kind === 'official' ? entry.plan.payload.name : undefined} compact onPress={() => nav.openRouteGuide({ route, view: 'guide', reversed, ...(entry.kind === 'official' ? { planId: entry.plan.id } : { guideId: entry.guide.id }) })} />) : <View style={{ minHeight: 110, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space.md }}><Text style={{ color: theme.text2, textAlign: 'center' }}>{c.noGuides}</Text></View>}
      </View>
      {/* Downloaded while planning, with signal; the trail page doesn't ask at the trailhead. */}
      <View style={{ marginTop: space.xl }}>
        <OfflineMapRow theme={theme} region={route.region} />
      </View>
    </View>
  );
}
