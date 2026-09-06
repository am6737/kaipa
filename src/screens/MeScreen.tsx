// MeScreen.tsx — the 我 tab, with personal content on the overview and
// account, appearance, preferences, and support grouped on a settings page.
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, Pressable, Modal, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Luggage, Trash2 } from 'lucide-react-native';
import ReAnimated, { Easing, Extrapolation, interpolate, useAnimatedStyle, useSharedValue, withTiming, type SharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Theme, ACCENT_PRESETS } from '../theme/theme';
import { Icon, IconName } from '../components/Icon';
import { Press } from '../components/Press';
import { Avatar } from '../components/Avatar';
import { Glass } from '../components/Glass';
import { PhotoTile } from '../components/PhotoTile';
import { TwoStageSwipeable } from '../components/TwoStageSwipeable';
import { Globe } from '../components/globe';
import { TrailSheet } from '../components/Sheet';
import { useAppearance } from '../theme/AppearanceContext';
import { useI18n, Lang, TKey } from '../i18n';
import { useNav } from '../nav/NavContext';
import { useData } from '../data/DataContext';
import { WEIGHT_UNITS, WeightUnit } from '../data/gear';
import { useNotifCenter } from '../data/notifications';
import { ColorDot } from '../components/me/parts';
import { AccountPage } from '../components/me/AccountPage';
import type { MeProfile } from '../components/me/AccountPage';
import { EditFieldPage, MeEditField } from '../components/me/EditFieldPage';
import { NotifSettingsPage, NotifSettings } from '../components/me/NotifSettingsPage';
import { NotifInboxPage } from '../components/me/NotifInboxPage';
import { FeedbackPage } from '../components/me/FeedbackPage';
import { AboutPage } from '../components/me/AboutPage';
import { PlanningProfilePage } from '../components/me/PlanningProfilePage';
import { JourneyTrashPage } from '../components/journey/JourneyTrashPage';
import { AppActionDialog, AppCard, AppSectionHeader, layout, motion, radius, space, type } from '../design-system';
import { QrLoginScannerPage } from '../components/auth/QrLoginScannerPage';
import { joinJourneyByInvite } from '../lib/journeyInvite';
import type { Poi } from '../data/pois';

type MePage =
  | { type: 'scanLogin' }
  | { type: 'settings' }
  | { type: 'journeys' }
  | { type: 'favorites' }
  | { type: 'trash' }
  | { type: 'account' }
  | { type: 'planningProfile' }
  | { type: 'edit'; field: MeEditField }
  | { type: 'notif' }
  | { type: 'inbox' }
  | { type: 'feedback' }
  | { type: 'about' };

type AppearancePopup = 'theme' | 'accent' | 'language' | 'weight';
type PopupAnchor = { x: number; y: number; width: number; height: number };
const SETTINGS_ROW_HEIGHT = 78;
const flatMeCardStyle = { boxShadow: 'none' as const };

function AppearanceChevron({ theme, open }: { theme: Theme; open: boolean }) {
  const progress = useSharedValue(open ? 1 : 0);

  useEffect(() => {
    progress.value = withTiming(open ? 1 : 0, {
      duration: motion.emphasized,
      easing: Easing.bezier(0.16, 1, 0.3, 1),
    });
  }, [open, progress]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${interpolate(progress.value, [0, 1], [90, -90])}deg` }],
  }));

  return (
    <ReAnimated.View style={animatedStyle}>
      <Icon name="chevronR" color={theme.text3} size={15} />
    </ReAnimated.View>
  );
}

const AppearanceRow = React.forwardRef<View, {
  theme: Theme;
  label: string;
  value: string;
  leading: React.ReactNode;
  open: boolean;
  onPress: () => void;
  last?: boolean;
}>(({ theme, label, value, leading, open, onPress }, ref) => (
  <View ref={ref} collapsable={false}>
    <Press onPress={onPress} accessibilityRole="button" accessibilityState={{ expanded: open }} scaleTo={1} opacityTo={1}>
      <View style={{ minHeight: SETTINGS_ROW_HEIGHT, paddingVertical: space.md, flexDirection: 'row', alignItems: 'center', gap: space.md }}>
        <View style={{ width: 32, height: 38, alignItems: 'center', justifyContent: 'center' }}>
          {leading}
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[type.cardTitle, { color: theme.text }]}>{label}</Text>
          <Text numberOfLines={1} style={[type.caption, { color: theme.text2, marginTop: 3 }]}>{value}</Text>
        </View>
        <AppearanceChevron theme={theme} open={open} />
      </View>
    </Press>
  </View>
));

function PopupOption({ theme, label, selected, onPress, leading }: { theme: Theme; label: string; selected: boolean; onPress: () => void; leading?: React.ReactNode; last?: boolean }) {
  return (
    <Press onPress={onPress} accessibilityRole="button" accessibilityState={{ selected }} scaleTo={1} opacityTo={1}>
      <View style={{ minHeight: 54, paddingHorizontal: space.md, flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
        {leading}
        <Text style={{ flex: 1, fontSize: 14, fontWeight: selected ? '700' : '500', color: selected ? theme.accent : theme.text }}>{label}</Text>
        {selected ? <Icon name="check" color={theme.accent} size={17} /> : null}
      </View>
    </Press>
  );
}

function SettingsRow({
  theme,
  icon,
  label,
  detail,
  onPress,
  last,
}: {
  theme: Theme;
  icon: IconName;
  label: string;
  detail?: string;
  onPress: () => void;
  last?: boolean;
}) {
  return (
    <Press onPress={onPress} accessibilityRole="button" scaleTo={1} opacityTo={1}>
      <View
        style={{
          minHeight: SETTINGS_ROW_HEIGHT,
          paddingVertical: space.md,
          flexDirection: 'row',
          alignItems: 'center',
          gap: space.md,
        }}
      >
        <View style={{ width: 32, height: 38, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name={icon} color={theme.text2} size={19} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[type.cardTitle, { color: theme.text }]}>{label}</Text>
          {detail ? <Text numberOfLines={1} style={[type.caption, { color: theme.text2, marginTop: 3 }]}>{detail}</Text> : null}
        </View>
        <Icon name="chevronR" color={theme.text3} size={15} />
      </View>
    </Press>
  );
}

function ProfileShortcut({
  theme,
  title,
  detail,
  items,
  emptyLabel,
  mapPreview,
  onPress,
}: {
  theme: Theme;
  title: string;
  detail: string;
  items: Poi[];
  emptyLabel: string;
  mapPreview?: boolean;
  onPress: () => void;
}) {
  const previews = items.slice(0, 3);
  const previewWidth = previews.length ? 72 + (previews.length - 1) * 36 : 144;

  if (mapPreview) {
    return (
      <AppCard theme={theme} radius={radius.feature} style={[flatMeCardStyle, { height: 176, borderWidth: 0, overflow: 'hidden' }]}>
        <Press onPress={onPress} accessibilityRole="button" scaleTo={0.98} style={{ flex: 1 }}>
          <CollectionMap theme={theme} points={items} compact />
          <LinearGradient
            pointerEvents="none"
            colors={theme.dark ? ['rgba(18,18,20,0.90)', 'rgba(18,18,20,0.58)', 'rgba(18,18,20,0)'] : ['rgba(255,255,255,0.96)', 'rgba(255,255,255,0.68)', 'rgba(255,255,255,0)']}
            locations={[0, 0.58, 1]}
            style={{ position: 'absolute', left: 0, top: 0, right: 0, height: 122 }}
          />
          <View style={{ position: 'absolute', left: 0, top: 0, right: 0, padding: space.lg }}>
            <Text style={[type.cardTitle, { color: theme.text }]}>{title}</Text>
            <Text style={[type.caption, { color: theme.text2, marginTop: space.xxs }]}>{detail}</Text>
          </View>
        </Press>
      </AppCard>
    );
  }

  return (
    <AppCard
      theme={theme}
      radius={radius.feature}
      style={[flatMeCardStyle, { height: 176, borderWidth: 0, overflow: 'hidden' }]}
    >
      <Press
        onPress={onPress}
        accessibilityRole="button"
        scaleTo={0.98}
        style={{ flex: 1, padding: space.lg, flexDirection: 'row', alignItems: 'center', gap: space.md }}
      >
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[type.cardTitle, { color: theme.text }]}>{title}</Text>
          <Text style={[type.caption, { color: theme.text2, marginTop: space.xxs }]}>{detail}</Text>
        </View>
        <View style={{ width: 156, height: 84, flexShrink: 0, alignItems: 'center', justifyContent: 'center' }}>
          {previews.length ? (
            <View style={{ width: previewWidth, height: 80 }}>
              {previews.map((item, index) => (
                <PhotoTile
                  key={item.id}
                  tone={item.tone}
                  seed={item.id}
                  radius={radius.control}
                  resWidth={180}
                  style={{
                    position: 'absolute',
                    left: index * 36,
                    top: index % 2 ? 4 : 0,
                    width: 72,
                    height: 80,
                    zIndex: index,
                    borderWidth: 2,
                    borderColor: theme.surfaceTop,
                  }}
                >
                  {item.photoUris?.[0] ? <Image source={{ uri: item.photoUris[0] }} contentFit="cover" style={StyleSheet.absoluteFill} /> : null}
                </PhotoTile>
              ))}
            </View>
          ) : (
            <View style={{ width: 144, minHeight: 72, paddingHorizontal: space.sm, borderRadius: radius.control, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.fieldSurface, borderWidth: StyleSheet.hairlineWidth, borderColor: theme.fieldBorder }}>
              <Text style={[type.caption, { color: theme.text3, lineHeight: 16, textAlign: 'center' }]}>{emptyLabel}</Text>
            </View>
          )}
        </View>
      </Press>
    </AppCard>
  );
}

function mapCoordinate(point: Poi): [number, number] {
  const start = point.trackCoords?.[0];
  return start && Number.isFinite(start[0]) && Number.isFinite(start[1]) ? start : [point.lng, point.lat];
}

function groupMapPoints(points: Poi[]) {
  const groups = new Map<string, Poi[]>();
  points.forEach((point) => {
    const [lng, lat] = mapCoordinate(point);
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return;
    const key = `${lng.toFixed(4)},${lat.toFixed(4)}`;
    groups.set(key, [...(groups.get(key) || []), point]);
  });
  return [...groups.values()];
}

function CollectionMap({ theme, points, compact = false, onPointPress }: { theme: Theme; points: Poi[]; compact?: boolean; onPointPress?: (point: Poi) => void }) {
  const { resolved } = useI18n();
  const { width } = useWindowDimensions();
  const groups = groupMapPoints(points);
  const coordinates = groups.map((group) => mapCoordinate(group[0]));
  const center = coordinates.length ? {
    lon: coordinates.reduce((sum, [lng]) => sum + lng, 0) / coordinates.length,
    lat: coordinates.reduce((sum, [, lat]) => sum + lat, 0) / coordinates.length,
  } : { lon: 104, lat: 35 };
  const pois = groups.map((group) => {
    const representative = group[0];
    const [lng, lat] = mapCoordinate(representative);
    return {
      id: representative.id,
      lng,
      lat,
      mine: representative.kind === 'journey',
      tone: representative.tone,
      count: group.length,
      coverUri: representative.photoUris?.[0],
      label: compact ? undefined : representative.name,
    };
  });

  return (
    <View pointerEvents={compact ? 'none' : 'auto'} style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center', backgroundColor: theme.bg }]}>
      <Globe
        theme={theme}
        size={compact ? Math.min(width * 0.52, 190) : Math.min(width * 0.86, 360)}
        pois={pois}
        center={center}
        mapStyle="standard"
        showMapLabels
        onPoiPress={onPointPress ? (id) => {
          const point = points.find((item) => item.id === id);
          if (point) onPointPress(point);
        } : undefined}
      />
    </View>
  );
}

function MapCollectionPage({
  theme,
  title,
  summary,
  points,
  onBack,
  onPointPress,
  primaryAction,
  children,
}: {
  theme: Theme;
  title: string;
  summary?: string;
  points: Poi[];
  onBack: () => void;
  onPointPress: (point: Poi) => void;
  primaryAction?: { label: string; onPress: () => void };
  children: React.ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const { t } = useI18n();
  const { height } = useWindowDimensions();
  const fullHeight = Math.max(360, height - insets.top - space.xs);
  const minimizedHeight = Math.min(156, fullHeight);
  const middleHeight = Math.max(minimizedHeight, Math.min(fullHeight - 1, Math.round(height * 0.58)));

  return (
    <View style={{ flex: 1, overflow: 'hidden', backgroundColor: theme.bg }}>
      <CollectionMap theme={theme} points={points} onPointPress={onPointPress} />
      <View style={{ position: 'absolute', left: 14, top: insets.top + 5 }}>
        <Press
          onPress={onBack}
          accessibilityRole="button"
          accessibilityLabel={t('common.back')}
          hitSlop={6}
          style={{ width: 52, height: 52, alignItems: 'center', justifyContent: 'center' }}
        >
          <Icon name="chevronL" color={theme.text} size={27} />
        </Press>
      </View>
      <TrailSheet
        theme={theme}
        snapHeights={[minimizedHeight, middleHeight, fullHeight]}
        initialIndex={1}
        dismissOnDrag={false}
        borderless
        backgroundColor={theme.featureSurface}
        topAccessoryHeight={64}
        topAccessory={primaryAction ? (
          <View style={{ flex: 1, paddingHorizontal: layout.pagePadding, paddingBottom: space.sm, alignItems: 'flex-end', justifyContent: 'flex-end' }}>
            <Press
              onPress={primaryAction.onPress}
              accessibilityRole="button"
              accessibilityLabel={primaryAction.label}
              hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
              scaleTo={0.96}
              style={{
                height: 36,
                paddingHorizontal: space.md,
                borderRadius: radius.pill,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: theme.text,
                boxShadow: theme.dark ? '0px 5px 16px rgba(0,0,0,0.42)' : '0px 5px 16px rgba(0,0,0,0.16)',
              }}
            >
              <Text numberOfLines={1} style={{ fontSize: 13, fontWeight: '700', color: theme.featureSurface }}>{primaryAction.label}</Text>
            </Press>
          </View>
        ) : undefined}
        header={
          <View style={{ paddingHorizontal: layout.pagePadding, paddingTop: space.xs, paddingBottom: space.md }}>
            <Text style={[type.pageTitle, { color: theme.text }]}>{title}</Text>
            {summary ? <Text style={[type.body, { color: theme.text2, marginTop: space.xs }]}>{summary}</Text> : null}
          </View>
        }
      >
        {children}
      </TrailSheet>
    </View>
  );
}

function JourneyOverviewTile({
  theme,
  icon,
  value,
  label,
  previewUris,
}: {
  theme: Theme;
  icon: IconName | 'luggage';
  value: string;
  label: string;
  previewUris?: string[];
}) {
  const previews = previewUris?.slice(0, 2) || [];

  return (
    <View
      style={{
        flexGrow: 1,
        flexBasis: '46%',
        minWidth: 132,
        height: 82,
        paddingHorizontal: space.md,
        paddingVertical: space.sm,
        borderRadius: radius.feature,
        backgroundColor: theme.fieldSurface,
        overflow: 'hidden',
      }}
    >
      <Text numberOfLines={1} adjustsFontSizeToFit style={[type.metric, { maxWidth: '72%', fontSize: 24, lineHeight: 28, color: theme.text }]}>
        {value}
      </Text>
      <Text numberOfLines={1} style={{ maxWidth: '72%', marginTop: space.xs, fontSize: 13, lineHeight: 18, fontWeight: '700', color: theme.text2 }}>
        {label}
      </Text>
      {previews.length ? (
        <View pointerEvents="none" style={{ position: 'absolute', right: -3, bottom: -8, width: 82, height: 78 }}>
          {previews.map((uri, index) => (
            <Image
              key={`${uri}-${index}`}
              source={{ uri }}
              contentFit="cover"
              style={{
                position: 'absolute',
                right: index === 0 ? 28 : 2,
                bottom: index === 0 ? 4 : 0,
                width: 48,
                height: 58,
                borderRadius: radius.control,
                borderWidth: 2,
                borderColor: theme.featureSurface,
                transform: [{ rotate: index === 0 ? '-8deg' : '7deg' }],
              }}
            />
          ))}
        </View>
      ) : (
        <View style={{ position: 'absolute', right: space.md, bottom: space.sm }}>
          {icon === 'luggage' ? (
            <Luggage color={theme.text} size={22} strokeWidth={1.9} />
          ) : (
            <Icon name={icon} color={theme.text} size={21} strokeWidth={1.9} />
          )}
        </View>
      )}
    </View>
  );
}

function JourneyRecordCard({
  theme,
  journey,
  onPress,
}: {
  theme: Theme;
  journey: Poi;
  onPress: () => void;
}) {
  const photos = journey.photoUris?.slice(0, 2) || [];
  const date = (journey.plannedDate || journey.date || journey.days || '—').replace(/\s*·\s*/g, ' ');
  const region = journey.region.replace(/\s*·\s*/g, ' ');

  return (
    <Press onPress={onPress} accessibilityRole="button" scaleTo={0.985} style={{ borderRadius: radius.feature }}>
      <AppCard
        theme={theme}
        radius={radius.feature}
        style={[flatMeCardStyle, { minHeight: 118, padding: space.md, borderWidth: 0, backgroundColor: theme.fieldSurface, overflow: 'hidden' }]}
      >
        <View style={{ minHeight: 86, flexDirection: 'row', alignItems: 'stretch', gap: space.md }}>
          <View style={{ flex: 1, minWidth: 0, paddingVertical: 2 }}>
            <Text numberOfLines={2} style={{ fontSize: 16.5, lineHeight: 21, fontWeight: '800', color: theme.text }}>
              {journey.name}
            </Text>

            <View style={{ marginTop: space.xs, gap: 5 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, minWidth: 0 }}>
                <Icon name="pin" color={theme.text3} size={12} />
                <Text numberOfLines={1} style={[type.caption, { flex: 1, color: theme.text2 }]}>{region}</Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, minWidth: 0 }}>
                <Icon name="calendar" color={theme.text3} size={12} />
                <Text numberOfLines={1} style={[type.caption, { flex: 1, color: theme.text2 }]}>{date}</Text>
              </View>
            </View>

            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, marginTop: 'auto', paddingTop: space.sm }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                <Icon name="distance" color={theme.text2} size={13} />
                <Text numberOfLines={1} style={[type.metric, { fontSize: 12, color: theme.text }]}>{journey.dist || '—'}</Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                <Icon name="arrowUp" color={theme.text2} size={13} />
                <Text numberOfLines={1} style={[type.metric, { fontSize: 12, color: theme.text }]}>{journey.asc?.replace(/[+,]/g, '') || '—'}</Text>
              </View>
            </View>
          </View>

          <View style={{ width: 94, minHeight: 86, flexShrink: 0, alignItems: 'flex-end', justifyContent: 'center' }}>
            {photos[1] ? (
              <View style={{ position: 'absolute', right: 8, width: 74, height: 78, borderRadius: radius.card, overflow: 'hidden', transform: [{ rotate: '7deg' }] }}>
                <Image source={{ uri: photos[1] }} contentFit="cover" style={StyleSheet.absoluteFill} />
              </View>
            ) : null}
            <PhotoTile
              tone={journey.tone}
              seed={journey.id}
              radius={radius.card}
              resWidth={260}
              style={{ width: 82, height: 86 }}
            >
              {photos[0] ? <Image source={{ uri: photos[0] }} contentFit="cover" style={StyleSheet.absoluteFill} /> : null}
              {(journey.photoUris?.length || 0) > 1 ? (
                <View style={{ position: 'absolute', right: space.xs, bottom: space.xs, minWidth: 24, height: 20, paddingHorizontal: 6, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.62)' }}>
                  <Text style={{ fontSize: 10, fontWeight: '700', color: '#fff' }}>{journey.photoUris?.length}</Text>
                </View>
              ) : null}
            </PhotoTile>
          </View>
        </View>
      </AppCard>
    </Press>
  );
}

const JOURNEY_SWIPE_SPRING = { mass: 0.7, damping: 22, stiffness: 240, overshootClamping: true } as const;

function JourneySwipeDeleteAction({
  progress,
  theme,
  label,
  onPress,
}: {
  progress: SharedValue<number>;
  theme: Theme;
  label: string;
  onPress: () => void;
}) {
  const animatedStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 0.18, 1], [0, 0.62, 1], Extrapolation.CLAMP),
    transform: [{ translateX: interpolate(progress.value, [0, 1], [32, 0], Extrapolation.CLAMP) }],
  }));

  return (
    <ReAnimated.View style={[{ width: 76, alignSelf: 'stretch', backgroundColor: theme.featureSurface }, animatedStyle]}>
      <Press
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={label}
        style={{ flex: 1, width: 76, alignItems: 'center', justifyContent: 'center' }}
      >
        <Trash2 size={28} color={theme.danger} strokeWidth={2.1} />
      </Press>
    </ReAnimated.View>
  );
}

function FavoritesPage({
  theme,
  routes,
  onBack,
  onOpenRoute,
}: {
  theme: Theme;
  routes: Poi[];
  onBack: () => void;
  onOpenRoute: (route: Poi) => void;
}) {
  const { t } = useI18n();
  const totalKm = routes.reduce((sum, route) => {
    const distance = Number.parseFloat(route.dist);
    return sum + (Number.isFinite(distance) ? distance : 0);
  }, 0);
  const regionCount = new Set(routes.map((route) => route.region).filter(Boolean)).size;
  const photoCount = routes.reduce((sum, route) => sum + (route.photoUris?.length || 0), 0);
  const photoPreviewUris = routes.flatMap((route) => route.photoUris || []).slice(0, 2);

  return (
    <MapCollectionPage
      theme={theme}
      title={t('me.myFavorites')}
      points={routes}
      onBack={onBack}
      onPointPress={onOpenRoute}
    >
      <View style={{ minHeight: 500, paddingHorizontal: layout.pagePadding, paddingBottom: space.xxxl }}>
        <View style={{ marginTop: space.lg, flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
          <JourneyOverviewTile theme={theme} icon="pin" value={String(routes.length)} label={t('me.metricRoutes')} />
          <JourneyOverviewTile theme={theme} icon="distance" value={totalKm.toFixed(1)} label={t('me.metricDistance')} />
          <JourneyOverviewTile theme={theme} icon="photo" value={String(photoCount)} label={t('me.metricRoutePhotos')} previewUris={photoPreviewUris} />
          <JourneyOverviewTile theme={theme} icon="globe" value={String(regionCount)} label={t('me.metricRegions')} />
        </View>

        {routes.length ? (
          <View style={{ gap: space.md }}>
            <AppSectionHeader theme={theme} text={t('me.savedRouteList')} marginTop={layout.sectionGap} variant="title" />
            {routes.map((route) => (
              <JourneyRecordCard key={route.id} theme={theme} journey={route} onPress={() => onOpenRoute(route)} />
            ))}
          </View>
        ) : (
          <View style={{ alignItems: 'center', paddingHorizontal: space.xl, paddingVertical: space.xxxl, marginTop: space.xl }}>
            <Text style={[type.sectionTitle, { color: theme.text, textAlign: 'center' }]}>{t('me.favoritesEmptyTitle')}</Text>
            <Text style={[type.body, { color: theme.text2, lineHeight: 20, textAlign: 'center', marginTop: space.xs }]}>{t('me.favoritesEmptyBody')}</Text>
          </View>
        )}
      </View>
    </MapCollectionPage>
  );
}

function JourneysPage({
  theme,
  journeys,
  onBack,
  onOpenJourney,
  onCreateJourney,
  onDeleteJourney,
}: {
  theme: Theme;
  journeys: Poi[];
  onBack: () => void;
  onOpenJourney: (journey: Poi) => void;
  onCreateJourney: () => void;
  onDeleteJourney: (journey: Poi) => Promise<void>;
}) {
  const { t } = useI18n();
  const [deleteCandidate, setDeleteCandidate] = useState<Poi | null>(null);
  const [deletingId, setDeletingId] = useState<string>();
  const pendingSwipeCloseRef = useRef<(() => void) | null>(null);
  const totalKm = journeys.reduce((sum, journey) => {
    const distance = Number.parseFloat(journey.dist);
    return sum + (Number.isFinite(distance) ? distance : 0);
  }, 0);
  const photoCount = journeys.reduce((sum, journey) => sum + (journey.photoUris?.length || 0), 0);
  const photoPreviewUris = journeys.flatMap((journey) => journey.photoUris || []).slice(0, 2);
  const regionCount = new Set(journeys.map((journey) => journey.region).filter(Boolean)).size;

  return (
    <>
      <MapCollectionPage
        theme={theme}
        title={t('me.myJourneys')}
        points={journeys}
        onBack={onBack}
        onPointPress={onOpenJourney}
        primaryAction={{ label: t('journeyEdit.planner.create'), onPress: onCreateJourney }}
      >
        <View style={{ minHeight: 500, paddingHorizontal: layout.pagePadding, paddingBottom: space.xxxl }}>
          <View style={{ marginTop: space.lg, flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
            <JourneyOverviewTile theme={theme} icon="luggage" value={String(journeys.length)} label={t('me.metricJourneys')} />
            <JourneyOverviewTile theme={theme} icon="distance" value={totalKm.toFixed(1)} label={t('me.metricDistance')} />
            <JourneyOverviewTile theme={theme} icon="photo" value={String(photoCount)} label={t('me.metricPhotos')} previewUris={photoPreviewUris} />
            <JourneyOverviewTile theme={theme} icon="globe" value={String(regionCount)} label={t('me.metricRegions')} />
          </View>

          {journeys.length ? (
            <View style={{ gap: space.md }}>
              <AppSectionHeader theme={theme} text={t('me.journeyList')} marginTop={layout.sectionGap} variant="title" />
              {journeys.map((journey) => (
                <TwoStageSwipeable
                  key={journey.id}
                  friction={1}
                  rightThreshold={56}
                  dragOffsetFromRightEdge={6}
                  animationOptions={JOURNEY_SWIPE_SPRING}
                  onSecondLeftSwipe={(methods) => {
                    pendingSwipeCloseRef.current = methods.close;
                    setDeleteCandidate(journey);
                  }}
                  containerStyle={{ borderRadius: radius.feature, overflow: 'hidden', backgroundColor: theme.featureSurface }}
                  renderRightActions={(progress, _translation, methods) => (
                    <JourneySwipeDeleteAction
                      progress={progress}
                      theme={theme}
                      label={t('journey.settings.deleteJourney')}
                      onPress={() => {
                        methods.close();
                        setDeleteCandidate(journey);
                      }}
                    />
                  )}
                >
                  <JourneyRecordCard theme={theme} journey={journey} onPress={() => onOpenJourney(journey)} />
                </TwoStageSwipeable>
              ))}
            </View>
          ) : (
            <View style={{ alignItems: 'center', paddingHorizontal: space.xl, paddingVertical: space.xxxl, marginTop: space.xl }}>
              <Text style={[type.sectionTitle, { color: theme.text, textAlign: 'center' }]}>{t('me.journeysEmptyTitle')}</Text>
              <Text style={[type.body, { color: theme.text2, lineHeight: 20, textAlign: 'center', marginTop: space.xs }]}>{t('me.journeysEmptyBody')}</Text>
            </View>
          )}
        </View>
      </MapCollectionPage>

      <AppActionDialog
        theme={theme}
        visible={Boolean(deleteCandidate)}
        title={t('journey.settings.deleteConfirmTitle')}
        message={t('journey.remove.confirmMessage')}
        confirmLabel={t('journey.settings.deleteJourney')}
        cancelLabel={t('common.cancel')}
        destructive
        confirming={deletingId === deleteCandidate?.id}
        confirmIcon="trash"
        onCancel={() => {
          pendingSwipeCloseRef.current?.();
          pendingSwipeCloseRef.current = null;
          setDeleteCandidate(null);
        }}
        onConfirm={() => {
          if (!deleteCandidate || deletingId) return;
          const candidate = deleteCandidate;
          pendingSwipeCloseRef.current = null;
          setDeletingId(candidate.id);
          void onDeleteJourney(candidate).finally(() => {
            setDeletingId(undefined);
            setDeleteCandidate(null);
          });
        }}
      />
    </>
  );
}

export function MeScreen({ theme }: { theme: Theme }) {
  const insets = useSafeAreaInsets();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const { mode, accent, setMode, setAccent } = useAppearance();
  const { t, lang, setLang } = useI18n();
  const nav = useNav();
  const data = useData();
  const { unread } = useNotifCenter();

  const profile: MeProfile = {
    nick: data.profile.nick,
    username: data.profile.username ? `@${data.profile.username}` : '',
    bio: data.profile.bio,
    phone: data.profile.phone,
    email: data.profile.email,
  };
  const [notif, setNotif] = useState<NotifSettings>({ push: true, social: true, system: false });

  const [stack, setStack] = useState<MePage[]>([]);
  const push = (pg: MePage) => setStack((s) => [...s, pg]);
  const pop = () => setStack((s) => s.slice(0, -1));
  const [appearancePopup, setAppearancePopup] = useState<AppearancePopup | null>(null);
  const [popupAnchor, setPopupAnchor] = useState<PopupAnchor | null>(null);
  const themeRowRef = useRef<View>(null);
  const accentRowRef = useRef<View>(null);
  const languageRowRef = useRef<View>(null);
  const weightRowRef = useRef<View>(null);
  const appearanceProgress = useSharedValue(0);

  // Hide the floating tab bar whenever a sub-page is pushed.
  const setTabBarHidden = nav.setTabBarHidden;
  useEffect(() => {
    setTabBarHidden('me', stack.length > 0);
  }, [setTabBarHidden, stack.length]);
  useEffect(() => () => setTabBarHidden('me', false), [setTabBarHidden]);

  const showToast = nav.showToast;
  const saveEdit = async (field: MeEditField, val: string) => {
    try {
      if (field.key) {
        const dbKey = field.key === 'username' ? 'username' : field.key;
        const dbVal = field.key === 'username' ? val.replace(/^@/, '') : val;
        await data.updateProfile(dbKey, dbVal);
      }
      pop();
      showToast(field.toast || t('common.saved'));
    } catch {
      showToast(t('account.security.toastSaveFailed'));
    }
  };

  const themeModes: { id: 'system' | 'light' | 'dark'; label: string }[] = [
    { id: 'system', label: t('me.themeSystem') },
    { id: 'light', label: t('me.themeLight') },
    { id: 'dark', label: t('me.themeDark') },
  ];
  const langs: { id: Lang; label: string }[] = [
    { id: 'system', label: t('me.langSystem') },
    { id: 'zh', label: t('me.langZh') },
    { id: 'en', label: t('me.langEn') },
  ];
  const modeLabel = themeModes.find((item) => item.id === mode)?.label || themeModes[0].label;
  const langLabel = langs.find((item) => item.id === lang)?.label || langs[0].label;
  // Accent preset display names are translated by their stable id (theme.ts
  // keeps the Chinese name only as a fallback label).
  const accentLabel = (id: string) => t(`accent.${id}` as TKey);
  const curAccent = accent || '#0A84FF';
  const curPreset = ACCENT_PRESETS.find((p) => p.color.toLowerCase() === curAccent.toLowerCase());
  const accentName = curPreset ? accentLabel(curPreset.id) : t('common.custom');
  const openAppearancePopup = (popup: AppearancePopup, ref: React.RefObject<View | null>) => {
    if (appearancePopup === popup) {
      setAppearancePopup(null);
      return;
    }
    ref.current?.measureInWindow((x, y, width, height) => {
      setPopupAnchor({ x, y, width, height });
      setAppearancePopup(popup);
    });
  };

  useEffect(() => {
    if (!appearancePopup) {
      appearanceProgress.value = 0;
      return;
    }
    appearanceProgress.value = 0;
    appearanceProgress.value = withTiming(1, {
      duration: 460,
      easing: Easing.bezier(0.16, 1, 0.3, 1),
    });
  }, [appearancePopup, appearanceProgress]);

  const setGearWeightUnit = (unit: WeightUnit) => {
    data.updateProfile('gearWeightUnit', unit);
    showToast(t('me.gearWeightUnitSaved', { unit }));
  };

  const favoriteRoutes = data.routes.filter((route) => route.fav).length;
  const savedRoutes = data.routes.filter((route) => route.fav);

  const renderPage = (pg: MePage) => {
    switch (pg.type) {
      case 'scanLogin':
        return (
          <QrLoginScannerPage
            theme={theme}
            onBack={pop}
            onApproved={() => {
              pop();
              showToast(t('qrLogin.approvedToast'));
            }}
            onJourneyInvite={async (invite) => {
              const journey = await joinJourneyByInvite(invite);
              await data.refetchJourneys();
              pop();
              nav.setSubTab('memory');
              nav.openPoint(journey);
              showToast(t('qrLogin.journeyJoined', { name: journey.name }));
            }}
          />
        );
      case 'settings':
        return (
          <View style={{ flex: 1, backgroundColor: theme.groupedBg }}>
            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: layout.pagePadding, paddingTop: insets.top + space.xs + layout.topBarHeight, paddingBottom: insets.bottom + space.xxl }}
            >
              <AppSectionHeader theme={theme} text={t('me.account')} marginTop={space.lg} />
              <AppCard theme={theme} radius={radius.feature} style={[flatMeCardStyle, { paddingHorizontal: space.md, borderWidth: 0 }]}>
                <SettingsRow theme={theme} icon="user" label={t('me.account')} detail={profile.nick || t('me.unnamed')} onPress={() => push({ type: 'account' })} />
                <SettingsRow theme={theme} icon="compass" label={t('planningProfile.title')} detail={t('planningProfile.summary')} onPress={() => push({ type: 'planningProfile' })} last />
              </AppCard>

              <AppSectionHeader theme={theme} text={t('me.appearance')} marginTop={layout.sectionGap} />
              <AppCard theme={theme} radius={radius.feature} style={[flatMeCardStyle, { paddingHorizontal: space.md, borderWidth: 0 }]}>
                <AppearanceRow ref={themeRowRef} theme={theme} label={t('me.theme')} value={modeLabel} leading={<Icon name={mode === 'dark' ? 'moon' : mode === 'light' ? 'sun' : 'system'} color={theme.text2} size={19} />} open={appearancePopup === 'theme'} onPress={() => openAppearancePopup('theme', themeRowRef)} />
                <AppearanceRow ref={accentRowRef} theme={theme} label={t('me.accent')} value={accentName} leading={<ColorDot theme={theme} color={curAccent} size={20} dashed={!curPreset} />} open={appearancePopup === 'accent'} onPress={() => openAppearancePopup('accent', accentRowRef)} />
                <AppearanceRow ref={languageRowRef} theme={theme} label={t('me.language')} value={langLabel} leading={<Icon name="globe" color={theme.text2} size={19} />} open={appearancePopup === 'language'} onPress={() => openAppearancePopup('language', languageRowRef)} last />
              </AppCard>

              <AppSectionHeader theme={theme} text={t('me.preferences')} marginTop={layout.sectionGap} />
              <AppCard theme={theme} radius={radius.feature} style={[flatMeCardStyle, { paddingHorizontal: space.md, borderWidth: 0 }]}>
                <SettingsRow theme={theme} icon="bell" label={t('me.notifications')} detail={notif.push ? t('common.on') : t('common.off')} onPress={() => push({ type: 'notif' })} />
                <AppearanceRow ref={weightRowRef} theme={theme} label={t('me.gearWeightUnit')} value={data.profile.gearWeightUnit} leading={<Icon name="gearSettings" color={theme.text2} size={19} />} open={appearancePopup === 'weight'} onPress={() => openAppearancePopup('weight', weightRowRef)} last />
              </AppCard>

              <AppSectionHeader theme={theme} text={t('me.support')} marginTop={layout.sectionGap} />
              <AppCard theme={theme} radius={radius.feature} style={[flatMeCardStyle, { paddingHorizontal: space.md, borderWidth: 0 }]}>
                <SettingsRow theme={theme} icon="send" label={t('me.helpFeedback')} onPress={() => push({ type: 'feedback' })} />
                <SettingsRow theme={theme} icon="compass" label={t('me.about')} detail="v1.0.2" onPress={() => push({ type: 'about' })} last />
              </AppCard>
            </ScrollView>

            <View
              pointerEvents="box-none"
              style={{ position: 'absolute', top: insets.top, left: layout.pagePadding, right: layout.pagePadding, height: layout.topBarHeight, justifyContent: 'center' }}
            >
              <Press
                onPress={pop}
                accessibilityRole="button"
                accessibilityLabel={t('common.back')}
                scaleTo={0.96}
                style={{ width: layout.iconButton, height: layout.iconButton, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.controlSurface }}
              >
                <Icon name="chevronL" color={theme.text} size={20} />
              </Press>
              <Text
                pointerEvents="none"
                numberOfLines={1}
                style={[type.navTitle, { position: 'absolute', left: layout.iconButton + space.sm, right: layout.iconButton + space.sm, textAlign: 'center', color: theme.text }]}
              >
                {t('me.settingsPageTitle')}
              </Text>
            </View>
          </View>
        );
      case 'journeys':
        return (
          <JourneysPage
            theme={theme}
            journeys={data.journeys}
            onBack={pop}
            onCreateJourney={() => nav.openNewJourney()}
            onDeleteJourney={(journey) => data.deleteJourney(journey.id)}
            onOpenJourney={(journey) => {
              nav.setSubTab('memory');
              nav.openPoint(journey);
            }}
          />
        );
      case 'favorites':
        return (
          <FavoritesPage
            theme={theme}
            routes={savedRoutes}
            onBack={pop}
            onOpenRoute={(route) => {
              nav.setSubTab('explore');
              nav.openPoint(route);
            }}
          />
        );
      case 'trash':
        return <JourneyTrashPage theme={theme} onBack={pop} />;
      case 'account':
        return (
          <AccountPage
            theme={theme}
            profile={profile}
            onBack={pop}
            onEdit={(f) => push({ type: 'edit', field: f })}
            showToast={showToast}
          />
        );
      case 'planningProfile':
        return <PlanningProfilePage theme={theme} onBack={pop} />;
      case 'edit':
        return <EditFieldPage theme={theme} field={pg.field} onBack={pop} onSave={(v) => saveEdit(pg.field, v)} />;
      case 'notif':
        return <NotifSettingsPage theme={theme} notif={notif} setNotif={setNotif} onBack={pop} />;
      case 'inbox':
        return <NotifInboxPage theme={theme} onBack={pop} showToast={showToast} />;
      case 'feedback':
        return (
          <FeedbackPage
            theme={theme}
            onBack={pop}
            onSubmit={() => {
              pop();
              showToast(t('me.feedbackThanks'));
            }}
          />
        );
      case 'about':
        return <AboutPage theme={theme} onBack={pop} showToast={showToast} />;
    }
  };
  const popupWidth = Math.min(260, windowWidth - space.xl * 2);
  const popupHeight = appearancePopup === 'accent' ? 340 : appearancePopup === 'weight' ? 232 : 178;
  const popupCollapsedHeight = 16;
  const popupLeft = popupAnchor ? Math.max(space.xl, Math.min(popupAnchor.x + popupAnchor.width - popupWidth, windowWidth - popupWidth - space.xl)) : space.xl;
  const popupTop = popupAnchor
    ? Math.max(insets.top + space.xs, Math.min(popupAnchor.y + popupAnchor.height + space.xs, windowHeight - insets.bottom - popupHeight - space.md))
    : insets.top + space.xl;
  const popupMenuStyle = useAnimatedStyle(() => ({
    height: interpolate(appearanceProgress.value, [0, 1], [popupCollapsedHeight, popupHeight]),
  }));
  const popupContentStyle = useAnimatedStyle(() => ({
    opacity: appearanceProgress.value,
    transform: [{ translateY: interpolate(appearanceProgress.value, [0, 1], [-8, 0]) }],
  }));

  return (
    <View style={{ flex: 1, backgroundColor: theme.groupedBg }}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: layout.pagePadding, paddingTop: insets.top + 3, paddingBottom: 140 }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: space.lg }}>
          <Press
            onPress={() => push({ type: 'scanLogin' })}
            accessibilityRole="button"
            accessibilityLabel={t('me.scan')}
            scaleTo={1}
            opacityTo={1}
            style={{ width: layout.iconButton, height: layout.iconButton, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.controlSurface }}
          >
            <Icon name="scan" color={theme.text} size={21} />
          </Press>
          <View style={{ flex: 1 }} />
          <Press
            onPress={() => push({ type: 'inbox' })}
            accessibilityRole="button"
            accessibilityLabel={t('me.inbox')}
            scaleTo={1}
            opacityTo={1}
            style={{
              width: layout.iconButton,
              height: layout.iconButton,
              borderRadius: radius.pill,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: theme.controlSurface,
            }}
          >
            <Icon name="bell" color={theme.text} size={20} />
            {unread > 0 ? (
              <View style={{ position: 'absolute', top: 1, right: 1, minWidth: 17, height: 17, borderRadius: 9, paddingHorizontal: 4, backgroundColor: theme.danger, borderWidth: 2, borderColor: theme.groupedBg, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: 9.5, fontWeight: '800', color: '#fff' }}>{unread}</Text>
              </View>
            ) : null}
          </Press>
          <Press
            onPress={() => push({ type: 'settings' })}
            accessibilityRole="button"
            accessibilityLabel={t('me.settingsPageTitle')}
            scaleTo={1}
            opacityTo={1}
            style={{ width: layout.iconButton, height: layout.iconButton, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.controlSurface, marginLeft: space.xs }}
          >
            <Icon name="gearSettings" color={theme.text} size={20} />
          </Press>
        </View>

        <Press
          onPress={() => push({ type: 'account' })}
          accessibilityRole="button"
          scaleTo={0.98}
          opacityTo={1}
          style={{ alignItems: 'center', paddingTop: space.lg, paddingBottom: space.xl }}
        >
          <Avatar uri={data.profile.avatarUrl} size={104} />
          <Text numberOfLines={1} style={{ marginTop: space.lg, maxWidth: '86%', fontSize: 26, fontWeight: '800', color: theme.text }}>
            {profile.nick || t('me.unnamed')}
          </Text>
          {profile.username ? <Text numberOfLines={1} style={[type.caption, { color: theme.text2, marginTop: space.xs }]}>{profile.username}</Text> : null}
          {profile.bio ? <Text numberOfLines={2} style={[type.body, { maxWidth: '86%', color: theme.text2, lineHeight: 20, marginTop: space.sm, textAlign: 'center' }]}>{profile.bio}</Text> : null}
        </Press>

        <AppSectionHeader theme={theme} text={t('me.myContent')} marginTop={layout.sectionGap} />
        <View style={{ gap: space.md }}>
          <ProfileShortcut theme={theme} title={t('me.myJourneys')} detail={t('me.journeySummary', { count: data.journeys.length })} items={data.journeys} emptyLabel={t('me.journeyPreviewEmpty')} mapPreview onPress={() => push({ type: 'journeys' })} />
          <ProfileShortcut theme={theme} title={t('me.myFavorites')} detail={t('me.savedSummary', { count: favoriteRoutes })} items={savedRoutes} emptyLabel={t('me.savedPreviewEmpty')} mapPreview onPress={() => push({ type: 'favorites' })} />
          <AppCard theme={theme} radius={radius.feature} style={[flatMeCardStyle, { paddingHorizontal: space.md, borderWidth: 0 }]}>
            <SettingsRow
              theme={theme}
              icon="trash"
              label={t('journeyHome.trash.title')}
              detail={t('me.trashSummary', { count: data.trashedJourneys.length })}
              onPress={() => push({ type: 'trash' })}
              last
            />
          </AppCard>
        </View>

      </ScrollView>

      {appearancePopup && popupAnchor ? (
        <Modal visible transparent statusBarTranslucent animationType="none" onRequestClose={() => setAppearancePopup(null)}>
          <View style={StyleSheet.absoluteFill}>
            <Pressable
              style={[StyleSheet.absoluteFill, { backgroundColor: theme.dark ? 'rgba(0,0,0,0.20)' : 'rgba(0,0,0,0.055)' }]}
              onPress={() => setAppearancePopup(null)}
            />
            <ReAnimated.View
              style={[
                {
                  position: 'absolute',
                  top: popupTop,
                  left: popupLeft,
                  width: popupWidth,
                  borderRadius: 26,
                  overflow: 'hidden',
                  boxShadow: theme.dark ? '0px 18px 46px rgba(0,0,0,0.52)' : '0px 18px 46px rgba(0,0,0,0.18)',
                },
                popupMenuStyle,
              ]}
            >
              <Glass solidOnAndroid theme={theme} radius={26} intensity={76}>
                <View style={{ paddingVertical: space.xs, backgroundColor: theme.dark ? 'rgba(32,32,35,0.58)' : 'rgba(255,255,255,0.64)' }}>
                  <ReAnimated.View style={popupContentStyle}>
                    {appearancePopup === 'theme'
                      ? themeModes.map((item, index) => (
                          <PopupOption
                            key={item.id}
                            theme={theme}
                            label={item.id === 'system' ? t('me.themeSystemDefault') : item.label}
                            selected={mode === item.id}
                            onPress={() => {
                              setMode(item.id);
                              setAppearancePopup(null);
                            }}
                            last={index === themeModes.length - 1}
                          />
                        ))
                      : appearancePopup === 'language'
                        ? langs.map((item, index) => (
                            <PopupOption
                              key={item.id}
                              theme={theme}
                              label={item.label}
                              selected={lang === item.id}
                              onPress={() => {
                                setLang(item.id);
                                setAppearancePopup(null);
                              }}
                              last={index === langs.length - 1}
                            />
                          ))
                        : appearancePopup === 'weight'
                          ? WEIGHT_UNITS.map((unit, index) => (
                              <PopupOption
                                key={unit}
                                theme={theme}
                                label={unit}
                                selected={data.profile.gearWeightUnit === unit}
                                onPress={() => {
                                  setGearWeightUnit(unit);
                                  setAppearancePopup(null);
                                }}
                                last={index === WEIGHT_UNITS.length - 1}
                              />
                            ))
                        : ACCENT_PRESETS.map((preset) => {
                            const selected = curAccent.toLowerCase() === preset.color.toLowerCase();
                            return (
                              <PopupOption
                                key={preset.id}
                                theme={theme}
                                label={accentLabel(preset.id)}
                                leading={<ColorDot theme={theme} color={preset.color} size={20} />}
                                selected={selected}
                                onPress={() => {
                                  setAccent(preset.color);
                                  setAppearancePopup(null);
                                }}
                              />
                            );
                          })}
                  </ReAnimated.View>
                </View>
              </Glass>
            </ReAnimated.View>
          </View>
        </Modal>
      ) : null}

      {/* pushed full-screen pages */}
      {stack.map((pg, i) => (
        <View key={i + '-' + pg.type} style={[StyleSheet.absoluteFill, { zIndex: 60 + i }]}>
          {renderPage(pg)}
        </View>
      ))}
    </View>
  );
}
