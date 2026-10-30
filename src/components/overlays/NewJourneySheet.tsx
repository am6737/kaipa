// NewJourneySheet.tsx — unified journey creation flow:
// choose a route or blank journey → add core details → create and open it.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  ScrollView,
  ActivityIndicator,
  StyleSheet,
  Platform,
  Keyboard,
  KeyboardAvoidingView,
  useWindowDimensions,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { File as FSFile } from 'expo-file-system';
import { Theme } from '../../theme/theme';
import { Poi, Companion } from '../../data/pois';
import { useData } from '../../data/DataContext';
import { Press } from '../Press';
import { Icon } from '../Icon';
import { NJSection, NJRoundBtn, NJMiniCalendar, NJBottomSheet, NJSharePanel, SELF } from './NewJourneyParts';
import { useI18n, TKey, TVars } from '../../i18n';
import { layout, radius, space, type } from '../../design-system';
import { TrailSheet, type TrailSheetHandle } from '../Sheet';
import { JourneyDateRangePicker } from './JourneyDateRangePicker';
import { journeySchedulePatch } from '../../lib/journeySchedule';
import {
  locationFromPoi,
  reverseJourneyLocation,
  searchJourneyLocations,
  type JourneyLocationValue,
} from '../../lib/amapGeocoding';
import { buildTrackData } from '../../lib/trackParser';
import { createTrackFromFile, parseTrackFile, TrackFileError, type ParsedTrackFile } from '../../lib/trackImport';
import { AssistantMark } from '../assistant/AssistantMark';
import { regionLabel } from '../../lib/regionLabel';
import { useOfficialItineraries } from '../../hooks/useOfficialItineraries';
import { createJourneyFromGuide } from '../../lib/routeGuideImport';
import * as Crypto from 'expo-crypto';
import { NJ_PICKER_HEIGHT_RATIO, NJShortcutRow, ascentLabel, NJTrackRow, NewJourneyTrackChooser, trackMeta } from './NewJourneyTrackChooser';

export { NJSection, NJRoundBtn, NJMiniCalendar, NJBottomSheet, NJSharePanel, SELF };

type TFn = (key: TKey, vars?: TVars) => string;

// ──────────────────────────────────────────────────────────────
// Route shape used by the picker (real explore routes + synthetic custom)
// ──────────────────────────────────────────────────────────────
interface NJRoute {
  id: string;
  routeId?: string;
  name: string;
  region: string;
  dist: string;
  asc: string;
  diff?: string;
  tone?: string;
  lng?: number;
  lat?: number;
  coord?: string;
  trackCoords?: Poi['trackCoords'];
  trackElevation?: Poi['trackElevation'];
  trackDurationMs?: Poi['trackDurationMs'];
  trackWaypoints?: Poi['trackWaypoints'];
  trackFileName?: string;
  routeDays?: number[];
  bestMonths?: number[];
  custom?: boolean;
}

interface NJDestination extends JourneyLocationValue {
  route?: NJRoute;
}

// Keep seasonal shortcuts short so "什么时候出发" is visible without scrolling.
const NJ_SHORTCUT_LIMIT = 2;

// Name matches lead: exact, then prefix, then anywhere in the name; region-only matches last. 4 = no match.
function routeMatchRank(route: NJRoute, query: string) {
  if (route.name === query) return 0;
  if (route.name.startsWith(query)) return 1;
  if (route.name.includes(query)) return 2;
  if (route.region.includes(query)) return 3;
  return 4;
}

function formatRouteDays(days?: number[]) {
  if (!days?.length) return '--';
  const min = Math.min(...days);
  const max = Math.max(...days);
  return min === max ? String(min) : `${min}-${max}`;
}

function useRouteSuggestions(): NJRoute[] {
  const { routes } = useData();
  return useMemo(() => routes.map((p) => ({
    id: p.id,
    routeId: p.id,
    name: p.name,
    region: p.region,
    dist: p.dist,
    asc: p.asc,
    diff: p.diff,
    tone: p.tone,
    lng: p.lng,
    lat: p.lat,
    coord: p.coord,
    trackCoords: p.trackCoords,
    trackElevation: p.trackElevation,
    trackDurationMs: p.trackDurationMs,
    trackWaypoints: p.trackWaypoints,
    trackFileName: p.trackFileName,
    routeDays: p.routeDays,
    bestMonths: p.bestMonths,
  })), [routes]);
}

// ──────────────────────────────────────────────────────────────
// Time helpers (ported 1:1 from the prototype)
// ──────────────────────────────────────────────────────────────
function njRoundedNow(): Date {
  const d = new Date();
  const m = d.getMinutes();
  if (m < 15) d.setMinutes(0);
  else if (m < 45) d.setMinutes(30);
  else {
    d.setHours(d.getHours() + 1);
    d.setMinutes(0);
  }
  d.setSeconds(0);
  d.setMilliseconds(0);
  return d;
}
function njInitialPlannedStart(): Date {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(7, 30, 0, 0);
  return d;
}

// ──────────────────────────────────────────────────────────────
// Build the journey Poi created by the flow
// ──────────────────────────────────────────────────────────────
function buildJourney(route: NJRoute, tripName: string, startDt: Date, durationMins: number | undefined, flexibleDates: boolean, t: TFn, self: Companion): Poi {
  const totalDays = durationMins == null ? undefined : Math.max(1, Math.ceil(durationMins / (60 * 24)));
  const lng = route.lng ?? 104.0;
  const lat = route.lat ?? 35.0;
  const base: Poi = {
    id: `j-${Date.now()}`,
    kind: 'journey',
    name: tripName.trim() || route.name,
    region: route.region,
    coord: route.coord || `${lat.toFixed(2)} N  ${lng.toFixed(2)} E`,
    lng,
    lat,
    dist: route.dist,
    asc: route.asc,
    diff: route.diff as Poi['diff'],
    tone: (route.tone as Poi['tone']) || 'rock',
    ...journeySchedulePatch({ start: startDt, totalDays, flexible: flexibleDates }, totalDays == null ? '' : t('journeyEdit.meta.days', { count: totalDays })),
    companions: 0,
    companionList: [self],
    mine: true,
    fav: false,
    desc: '',
    routeId: route.routeId,
  };
  return base;
}

function routeStatNumber(value: string | undefined): number | undefined {
  const parsed = Number.parseFloat((value ?? '').replace(/[^0-9.]/g, ''));
  return Number.isFinite(parsed) ? parsed : undefined;
}

/** Combine all catalog routes selected as destinations into one journey track. */
function combineSelectedRoutes(base: NJRoute, destinations: NJDestination[]): NJRoute {
  const routes = destinations.map((destination) => destination.route).filter((item): item is NJRoute => Boolean(item?.trackCoords?.length));
  if (routes.length < 2) return base;

  const coordinates = routes.flatMap((item, index) => {
    const points = item.trackCoords ?? [];
    // Do not duplicate a shared endpoint, while retaining separate route legs.
    return index > 0 && points.length > 0 ? points.slice(1) : points;
  });
  const distances = routes.map((item) => routeStatNumber(item.dist)).filter((value): value is number => value != null);
  const ascents = routes.map((item) => routeStatNumber(item.asc)).filter((value): value is number => value != null);
  const elevation = routes.flatMap((item, index) => {
    const offset = routes.slice(0, index).reduce((sum, previous) => sum + (routeStatNumber(previous.dist) ?? 0), 0);
    return (item.trackElevation ?? []).map((point) => ({ km: point.km + offset, ele: point.ele }));
  });
  return {
    ...base,
    trackCoords: coordinates,
    trackElevation: elevation.length ? elevation : undefined,
    dist: distances.length === routes.length ? `${distances.reduce((sum, value) => sum + value, 0).toFixed(1)} km` : base.dist,
    asc: ascents.length === routes.length ? `+${Math.round(ascents.reduce((sum, value) => sum + value, 0))} m` : base.asc,
    trackFileName: `${routes.map((item) => item.name).join('-')}.kml`,
  };
}

// Seed the route picker from an existing journey/route (再次出发 / 开始旅程).
// We clone the route facts onto a fresh planned journey, so reuse the journey's
// original routeId when it has one, otherwise its own id.
function presetToRoute(p: Poi): NJRoute {
  return {
    id: p.routeId || p.id,
    routeId: p.routeId || (p.kind === 'route' ? p.id : undefined),
    name: p.name,
    region: p.region,
    dist: p.dist,
    asc: p.asc,
    diff: p.diff,
    tone: p.tone,
    lng: p.lng,
    lat: p.lat,
    coord: p.coord,
    trackCoords: p.trackCoords,
    trackElevation: p.trackElevation,
    trackDurationMs: p.trackDurationMs,
    trackWaypoints: p.trackWaypoints,
    trackFileName: p.trackFileName,
  };
}

// ──────────────────────────────────────────────────────────────
// Route-first planner — map entry with an already selected route
// ──────────────────────────────────────────────────────────────
function NJCreateBar({
  theme,
  nameValid,
  creatingMode,
  officialPlan,
  onManual,
  onSmart,
  onOfficial,
}: {
  theme: Theme;
  nameValid: boolean;
  creatingMode: 'manual' | 'smart' | 'official' | null;
  officialPlan: unknown;
  onManual: () => void;
  onSmart: () => void;
  onOfficial: () => void;
}) {
  const { t } = useI18n();
  const official = Boolean(officialPlan);
  const creating = Boolean(creatingMode);
  return (
    <View>
      <View style={{ flexDirection: 'row', gap: space.sm }}>
        <Press
          disabled={!nameValid || creating}
          onPress={onSmart}
          style={{
            flex: 1,
            minHeight: 52,
            borderRadius: radius.pill,
            alignItems: 'center',
            justifyContent: 'center',
            flexDirection: 'row',
            gap: space.xs,
            backgroundColor: theme.surfaceTop,
          }}
        >
          {creatingMode === 'smart' ? (
            <ActivityIndicator color={theme.text} />
          ) : (
            <AssistantMark
              color={theme.text}
              accentColor={theme.text}
              size={17}
            />
          )}
          <Text
            style={[
              type.cardTitle,
              { color: nameValid ? theme.text : theme.text3 },
            ]}
          >
            {t('journeyEdit.form.aiDraft')}
          </Text>
        </Press>
        <Press
          disabled={!nameValid || creating}
          onPress={official ? onOfficial : onManual}
          style={{
            flex: 1,
            minHeight: 52,
            borderRadius: radius.pill,
            alignItems: 'center',
            justifyContent: 'center',
            flexDirection: 'row',
            gap: space.xs,
            backgroundColor: nameValid ? theme.accent : theme.fieldSurface,
          }}
        >
          {creatingMode === 'manual' || creatingMode === 'official' ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : null}
          <Text
            style={[
              type.cardTitle,
              { color: nameValid ? '#FFFFFF' : theme.text3 },
            ]}
          >
            {t('journeyEdit.form.createJourney')}
          </Text>
        </Press>
      </View>
      <Text
        style={[
          type.caption,
          { color: theme.text2, textAlign: 'center', marginTop: space.xs },
        ]}
      >
        {t('journeyEdit.form.aiDraftHint')}
      </Text>
    </View>
  );
}

function NJRouteSummary({
  theme,
  route,
  onRemove,
}: {
  theme: Theme;
  route: NJRoute;
  onRemove: () => void;
}) {
  const { t } = useI18n();
  const value = (text: string | undefined) =>
    !text || text === '—' ? '--' : text.replace('+', '');
  const stats = [
    [
      value(route.dist).replace(/\s*km$/i, ''),
      t('journeyEdit.form.distance'),
      'km',
    ],
    [
      value(route.asc).replace(/\s*m$/i, ''),
      t('journeyEdit.form.totalAscent'),
      'm',
    ],
    [
      formatRouteDays(route.routeDays),
      t('journeyEdit.form.hikingDays'),
      t('journeyEdit.form.dayUnit'),
    ],
  ];
  return (
    <View
      style={{
        marginTop: space.sm,
        padding: space.md,
        borderRadius: radius.feature,
        backgroundColor: theme.surfaceTop,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Text
          numberOfLines={1}
          style={[type.cardTitle, { flex: 1, color: theme.text }]}
        >
          {route.name}
        </Text>
        <Press
          onPress={onRemove}
          style={{
            width: layout.iconButton,
            height: layout.iconButton,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon name="close" color={theme.text3} size={16} />
        </Press>
      </View>
      <Text
        style={[type.caption, { color: theme.text2, marginTop: space.xxs }]}
      >
        {regionLabel(route.region)}
      </Text>
      <View
        style={{ flexDirection: 'row', gap: space.lg, marginTop: space.md }}
      >
        {stats.map(([number, label, unit]) => (
          <View key={label}>
            <Text
              style={[
                type.statValue,
                { color: number === '--' ? theme.text3 : theme.text },
              ]}
            >
              {number}
              <Text style={[type.statLabel, { color: theme.text2 }]}>
                {' '}
                {unit}
              </Text>
            </Text>
            <Text
              style={[
                type.statLabel,
                { color: theme.text2, marginTop: space.xxs },
              ]}
            >
              {label}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function NJDestinationField({
  theme,
  selectedLocations,
  locationQuery,
  setLocationQuery,
  routeSearchResults,
  locationResults,
  locationSearching,
  addDestination,
  removeLocation,
}: {
  theme: Theme;
  selectedLocations: NJDestination[];
  locationQuery: string;
  setLocationQuery: (value: string) => void;
  routeSearchResults: NJRoute[];
  locationResults: JourneyLocationValue[];
  locationSearching: boolean;
  addDestination: (destination: NJDestination) => void;
  removeLocation: (index: number) => void;
}) {
  const { t } = useI18n();
  const firstRoute = selectedLocations[0]?.route;
  const chips = firstRoute ? selectedLocations.slice(1) : selectedLocations;
  // Once a route is picked, adding another place is rare, so the search
  // field collapses to a one-line entry until it is tapped.
  const [addingPlace, setAddingPlace] = useState(false);
  useEffect(() => {
    if (!firstRoute) setAddingPlace(false);
  }, [firstRoute]);
  const collapsed = Boolean(firstRoute) && !addingPlace && !locationQuery;
  const pickDestination = (destination: NJDestination) => {
    addDestination(destination);
    setAddingPlace(false);
  };
  const cancelAdding = () => {
    setLocationQuery('');
    setAddingPlace(false);
  };
  return (
    <View>
      {firstRoute ? (
        <NJRouteSummary
          theme={theme}
          route={firstRoute}
          onRemove={() => removeLocation(0)}
        />
      ) : null}
      {chips.length ? (
        <View
          style={{
            flexDirection: 'row',
            flexWrap: 'wrap',
            gap: space.xs,
            marginTop: firstRoute ? space.xs : 0,
            marginBottom: space.xs,
          }}
        >
          {chips.map((location, offset) => {
            const index = firstRoute ? offset + 1 : offset;
            return (
              <View
                key={`${location.lng}-${location.lat}-${index}`}
                style={{
                  minHeight: 36,
                  paddingLeft: space.sm,
                  paddingRight: space.xxs,
                  borderRadius: radius.pill,
                  backgroundColor: theme.fieldSurface,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: space.xxs,
                }}
              >
                <Text
                  numberOfLines={1}
                  style={[type.chip, { maxWidth: 190, color: theme.text }]}
                >
                  {location.name}
                </Text>
                <Press
                  onPress={() => removeLocation(index)}
                  style={{
                    width: 28,
                    height: 28,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Icon name="close" color={theme.text3} size={14} />
                </Press>
              </View>
            );
          })}
        </View>
      ) : null}
      {collapsed ? (
        <Press
          accessibilityRole="button"
          onPress={() => setAddingPlace(true)}
          style={{ flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: space.xxs, marginTop: chips.length ? 0 : space.xs, paddingVertical: space.xs }}
        >
          <Icon name="plus" color={theme.accent} size={16} />
          <Text style={[type.labelStrong, { color: theme.accent }]}>{t('journeyEdit.form.addAnotherPlace')}</Text>
        </Press>
      ) : (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: firstRoute && !chips.length ? space.xs : 0 }}>
          <View
            style={{
              flex: 1,
              minHeight: 52,
              paddingHorizontal: space.md,
              borderRadius: radius.feature,
              backgroundColor: theme.surfaceTop,
              flexDirection: 'row',
              alignItems: 'center',
              gap: space.xs,
            }}
          >
            <Icon name="search" color={theme.text2} size={18} />
            <TextInput
              value={locationQuery}
              onChangeText={setLocationQuery}
              maxLength={32}
              multiline={false}
              autoFocus={Boolean(firstRoute)}
              placeholder={t(
                firstRoute
                  ? 'journeyEdit.form.addAnotherPlace'
                  : 'journeyEdit.form.wherePlaceholder',
              )}
              placeholderTextColor={theme.text3}
              style={[type.body, { flex: 1, padding: 0, color: theme.text }]}
            />
            {locationSearching ? (
              <ActivityIndicator size="small" color={theme.text2} />
            ) : null}
          </View>
          {firstRoute ? (
            <Press accessibilityRole="button" onPress={cancelAdding} hitSlop={space.xs}>
              <Text style={[type.labelStrong, { color: theme.text2 }]}>{t('common.cancel')}</Text>
            </Press>
          ) : null}
        </View>
      )}
      {!collapsed && (routeSearchResults.length || locationResults.length) ? (
        <View
          style={{
            maxHeight: 280,
            marginTop: space.xs,
            borderRadius: radius.card,
            overflow: 'hidden',
            backgroundColor: theme.surfaceTop,
          }}
        >
          <ScrollView
            nestedScrollEnabled
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {routeSearchResults.map((suggestion) => {
              const destination = locationFromPoi(
                suggestion.region || suggestion.name,
                suggestion.lng ?? 104,
                suggestion.lat ?? 35,
                suggestion.coord,
              );
              return (
                <Press
                  key={`route-${suggestion.id}`}
                  onPress={() =>
                    pickDestination({
                      ...destination,
                      name: suggestion.name,
                      route: suggestion,
                    })
                  }
                  style={{
                    minHeight: 58,
                    paddingHorizontal: space.md,
                    paddingVertical: space.sm,
                    justifyContent: 'center',
                  }}
                >
                  <Text
                    numberOfLines={1}
                    style={[type.cardTitle, { color: theme.text }]}
                  >
                    {suggestion.name}
                  </Text>
                  <Text
                    style={[
                      type.caption,
                      { color: theme.text2, marginTop: space.xxs },
                    ]}
                  >
                    {[
                      regionLabel(suggestion.region),
                      suggestion.dist,
                      ascentLabel(suggestion.asc),
                    ]
                      .filter(Boolean)
                      .join('  ')}
                  </Text>
                </Press>
              );
            })}
            {locationResults.map((item, index) => (
              <Press
                key={`location-${item.lng}-${item.lat}-${index}`}
                onPress={() => pickDestination(item)}
                style={{
                  minHeight: 58,
                  paddingHorizontal: space.md,
                  paddingVertical: space.sm,
                  justifyContent: 'center',
                }}
              >
                <Text
                  numberOfLines={1}
                  style={[type.cardTitle, { color: theme.text }]}
                >
                  {item.name}
                </Text>
                <Text
                  style={[
                    type.caption,
                    { color: theme.text2, marginTop: space.xxs },
                  ]}
                >
                  {item.address || item.region}
                </Text>
              </Press>
            ))}
          </ScrollView>
        </View>
      ) : null}
    </View>
  );
}

function NJWhenField({
  theme,
  startDt,
  durationMins,
  flexibleDates,
  onOpen,
}: {
  theme: Theme;
  startDt: Date;
  durationMins: number | undefined;
  flexibleDates: boolean;
  onOpen: () => void;
}) {
  const { t, resolved } = useI18n();
  const totalDays =
    durationMins == null
      ? undefined
      : Math.max(1, Math.round(durationMins / (24 * 60)));
  return (
    <Press
      onPress={onOpen}
      style={{
        height: 52,
        marginTop: space.sm,
        paddingHorizontal: space.md,
        borderRadius: radius.feature,
        backgroundColor: theme.surfaceTop,
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.sm,
      }}
    >
      <Icon name="calendar" color={theme.text} size={18} />
      <View style={{ flex: 1 }}>
        <Text numberOfLines={1} style={[type.cardTitle, { color: theme.text }]}>
          {totalDays == null
            ? t('journeyEdit.time.decideLater')
            : flexibleDates
              ? t('journeyEdit.form.durationDays', { count: totalDays })
              : journeyDateSummary(startDt, durationMins, resolved)}
        </Text>
      </View>
      <Icon name="chevronR" color={theme.text3} size={15} />
    </Press>
  );
}

function NJPresetPlanner({
  theme,
  selectedLocations,
  locationQuery,
  setLocationQuery,
  routeSearchResults,
  locationResults,
  locationSearching,
  addDestination,
  removeLocation,
  startDt,
  durationMins,
  flexibleDates,
  onOpenTimePicker,
  onClose,
  nameValid,
  creatingMode,
  officialPlan,
  onManual,
  onSmart,
  onOfficial,
}: {
  theme: Theme;
  selectedLocations: NJDestination[];
  locationQuery: string;
  setLocationQuery: (value: string) => void;
  routeSearchResults: NJRoute[];
  locationResults: JourneyLocationValue[];
  locationSearching: boolean;
  addDestination: (destination: NJDestination) => void;
  removeLocation: (index: number) => void;
  startDt: Date;
  durationMins: number | undefined;
  flexibleDates: boolean;
  onOpenTimePicker: () => void;
  onClose: () => void;
  nameValid: boolean;
  creatingMode: 'manual' | 'smart' | 'official' | null;
  officialPlan: unknown;
  onManual: () => void;
  onSmart: () => void;
  onOfficial: () => void;
}) {
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const sheetRef = useRef<TrailSheetHandle>(null);
  const plannerHeight = Math.min(Math.max(height * 0.62, 480), 560);
  const closeSheet = useCallback(
    () => sheetRef.current?.hide(onClose),
    [onClose],
  );
  return (
    <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
      <TrailSheet
        ref={sheetRef}
        theme={theme}
        snapHeights={[Math.round(height * 0.15), plannerHeight]}
        initialIndex={1}
        dismissOnDrag={false}
        onIndexChange={(index) => {
          if (index === 0) Keyboard.dismiss();
        }}
        backgroundColor={theme.groupedBg}
        borderless
        header={<View />}
        containerStyle={{
          height: plannerHeight + insets.bottom,
          bottom: -insets.bottom,
        }}
      >
        <View style={{ flex: 1, paddingHorizontal: space.md }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Text style={[type.pageTitle, { flex: 1, color: theme.text }]}>
              {t('journeyEdit.form.whereTitle')}
            </Text>
            <Press
              onPress={closeSheet}
              style={{
                width: layout.iconButton,
                height: layout.iconButton,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Icon name="close" color={theme.text} size={22} />
            </Press>
          </View>
          <NJDestinationField
            theme={theme}
            selectedLocations={selectedLocations}
            locationQuery={locationQuery}
            setLocationQuery={setLocationQuery}
            routeSearchResults={routeSearchResults}
            locationResults={locationResults}
            locationSearching={locationSearching}
            addDestination={addDestination}
            removeLocation={removeLocation}
          />
          <View style={{ marginTop: layout.sectionGap }}>
            <Text style={[type.pageTitle, { color: theme.text }]}>
              {t('journeyEdit.form.whenTitle')}
            </Text>
            <NJWhenField
              theme={theme}
              startDt={startDt}
              durationMins={durationMins}
              flexibleDates={flexibleDates}
              onOpen={onOpenTimePicker}
            />
          </View>
          <View style={{ marginTop: 'auto', paddingBottom: space.sm }}>
            <NJCreateBar
              theme={theme}
              nameValid={nameValid}
              creatingMode={creatingMode}
              officialPlan={officialPlan}
              onManual={onManual}
              onSmart={onSmart}
              onOfficial={onOfficial}
            />
          </View>
        </View>
      </TrailSheet>
    </View>
  );
}

function journeyDateSummary(start: Date, durationMins: number | undefined, locale: 'zh' | 'en') {
  const totalDays = Math.max(1, Math.round((durationMins ?? 24 * 60) / (24 * 60)));
  const end = new Date(start);
  end.setDate(end.getDate() + totalDays - 1);
  const formatter = new Intl.DateTimeFormat(locale === 'zh' ? 'zh-CN' : 'en-US', {
    year: start.getFullYear() === end.getFullYear() ? undefined : 'numeric',
    month: 'short',
    day: 'numeric',
  });
  const startLabel = formatter.format(start);
  const endLabel = formatter.format(end);
  return totalDays === 1 ? startLabel : `${startLabel} - ${endLabel}`;
}

// ──────────────────────────────────────────────────────────────
// Main flow
// ──────────────────────────────────────────────────────────────
export function NewJourneySheet({ theme, onClose, onCreate, onSmartPlan, onToast, onCreatedFromPlan, preset }: { theme: Theme; onClose: () => void; onCreate: (poi: Poi) => Promise<boolean>; onSmartPlan: (poi: Poi, prompt: string) => Promise<boolean>; onToast: (m: string) => void; onCreatedFromPlan?: (id: string) => Promise<void> | void; preset?: Poi | null }) {
  const { t, resolved } = useI18n();
  const { userId, profile, createTrack, tracks } = useData();
  const selfCompanion = useMemo<Companion>(() => ({
    ...SELF,
    ini: profile.nick?.trim()?.slice(0, 1) || SELF.ini,
    name: profile.nick?.trim() || profile.username?.trim() || SELF.name,
    avatarUrl: profile.avatarUrl || undefined,
    userId,
  }), [profile.avatarUrl, profile.nick, profile.username, userId]);
  const routeSuggestions = useRouteSuggestions();
  const insets = useSafeAreaInsets();
  const presetRoute = useMemo(() => (preset ? presetToRoute(preset) : null), [preset]);
  const blankRoute = useMemo<NJRoute>(() => ({
    id: 'custom',
    custom: true,
    name: t('journeyEdit.route.customName'),
    region: t('journeyEdit.form.destinationUnset'),
    tone: 'rock',
    dist: '—',
    asc: '—',
    lng: 104,
    lat: 35,
  }), [t]);
  const [route, setRoute] = useState<NJRoute>(() => presetRoute || blankRoute);
  const [tripName, setTripName] = useState('');
  const [startDt, setStartDt] = useState<Date>(() => preset ? njInitialPlannedStart() : njRoundedNow());
  // The initial start is only a picker convenience. It is not a date the user
  // supplied, including for route presets, which currently carry route data
  // rather than an existing journey schedule.
  const [hasExplicitStart, setHasExplicitStart] = useState(false);
  const [durationMins, setDurationMins] = useState<number | undefined>();
  // Start with a concrete date range; users can switch to duration-only planning
  // from the "什么时候出发" picker when the trip dates are not decided yet.
  const [flexibleDates, setFlexibleDates] = useState(false);
  const [timeOpen, setTimeOpen] = useState(false);
  const openTimePicker = () => {
    Keyboard.dismiss();
    setTimeOpen(true);
  };
  const [creatingMode, setCreatingMode] = useState<'manual' | 'smart' | 'official' | null>(null);
  const [trackBusy, setTrackBusy] = useState(false);
  const [trackSource, setTrackSource] = useState<{ uri: string; fileName: string; fileSize?: number; parsed: ParsedTrackFile } | null>(null);
  const [boundTrackId, setBoundTrackId] = useState<string | null>(null);
  const [trackChooserOpen, setTrackChooserOpen] = useState(false);
  const [seasonalOpen, setSeasonalOpen] = useState(false);
  const { height: windowHeight } = useWindowDimensions();
  // While typing, the create bar would ride up on the keyboard and cover search results.
  const [keyboardShown, setKeyboardShown] = useState(false);
  useEffect(() => {
    const showSub = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', () => setKeyboardShown(true));
    const hideSub = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => setKeyboardShown(false));
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);
  const [locationResults, setLocationResults] = useState<JourneyLocationValue[]>([]);
  const [locationSearching, setLocationSearching] = useState(false);
  const [locationSearchFailed, setLocationSearchFailed] = useState(false);
  const [locationQuery, setLocationQuery] = useState('');
  const [selectedLocations, setSelectedLocations] = useState<NJDestination[]>(() => {
    if (!presetRoute) return [];
    const location = locationFromPoi(presetRoute.region || presetRoute.name, presetRoute.lng ?? 104, presetRoute.lat ?? 35, presetRoute.coord);
    return [{ ...location, name: presetRoute.name, route: presetRoute }];
  });
  const selectedLocation = selectedLocations[0] || null;
  const { plans: officialPlans } = useOfficialItineraries(selectedLocation?.route?.routeId || selectedLocation?.route?.id || null);
  const selectedRouteId = selectedLocation?.route?.routeId || selectedLocation?.route?.id || null;
  const officialPlan = officialPlans.find((plan) => plan.routeId === selectedRouteId) || null;
  const routeSearchResults = useMemo(() => {
    const query = locationQuery.trim();
    if (!query) return [];
    return routeSuggestions
      .map((item, index) => ({ item, index, rank: routeMatchRank(item, query) }))
      .filter((entry) => entry.rank < 4)
      .sort((a, b) => a.rank - b.rank || a.index - b.index)
      .map((entry) => entry.item);
  }, [locationQuery, presetRoute, routeSuggestions]);
  const currentMonth = new Date().getMonth() + 1;
  const seasonalRoutes = useMemo(
    () => routeSuggestions.filter((item) => item.bestMonths?.includes(currentMonth)),
    [currentMonth, routeSuggestions],
  );
  const renderSeasonalRow = (item: NJRoute, onPicked?: () => void) => (
    <NJShortcutRow
      key={item.id}
      theme={theme}
      name={item.name}
      meta={[
        regionLabel(item.region),
        item.dist,
        ascentLabel(item.asc),
        `${formatRouteDays(item.routeDays)} ${t('journeyEdit.form.dayUnit')}`,
      ]
        .filter(Boolean)
        .join('  ')}
      onPress={() => {
        addDestination({
          ...locationFromPoi(item.region, item.lng ?? 104, item.lat ?? 35, item.coord),
          name: item.name,
          route: item,
        });
        onPicked?.();
      }}
    />
  );
  const boundTrack = tracks.find((track) => track.id === boundTrackId) || null;
  const officialRequestId = useRef(Crypto.randomUUID());
  const officialSelectionKey = `${officialPlan?.id || ''}:${selectedLocations.map((item) => `${item.route?.id || ''}:${item.lng}:${item.lat}`).join('|')}`;
  const previousOfficialSelection = useRef(officialSelectionKey);
  useEffect(() => {
    if (previousOfficialSelection.current !== officialSelectionKey) {
      previousOfficialSelection.current = officialSelectionKey;
      officialRequestId.current = Crypto.randomUUID();
    }
  }, [officialSelectionKey]);

  const nameInit = useRef(false);
  useEffect(() => {
    if (!route.custom && !nameInit.current && !tripName) {
      setTripName(route.name);
      nameInit.current = true;
    }
  }, [route, startDt, t, tripName]);

  useEffect(() => {
    const query = locationQuery.trim();
    if (query.length < 2) {
      setLocationResults([]);
      setLocationSearching(false);
      setLocationSearchFailed(false);
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => {
      setLocationSearching(true);
      setLocationSearchFailed(false);
      const proximity: [number, number] | undefined = trackSource && route.lng != null && route.lat != null
        ? [route.lng, route.lat]
        : undefined;
      searchJourneyLocations(query, resolved === 'zh' ? 'zh' : 'en', proximity, controller.signal)
        .then((results) => {
          if (!controller.signal.aborted) {
            setLocationResults(results);
            setLocationSearchFailed(false);
          }
        })
        .catch((error) => {
          if (error instanceof Error && error.name === 'AbortError') return;
          if (!controller.signal.aborted) {
            setLocationResults([]);
            setLocationSearchFailed(true);
          }
        })
        .finally(() => {
          if (!controller.signal.aborted) setLocationSearching(false);
        });
    }, 300);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [locationQuery, presetRoute, resolved, route.lat, route.lng, selectedLocations, trackSource]);

  const nameValid = tripName.trim().length > 0;
  const totalDays = durationMins == null ? undefined : Math.max(1, Math.round(durationMins / (24 * 60)));
  // A route with an official plan still opens the planning chat; the agent
  // takes the day-by-day itinerary from that plan.
  const submit = async (mode: 'manual' | 'smart') => {
    if (!nameValid || creatingMode) return;
    setCreatingMode(mode);
    const destinationNames = selectedLocations.length
      ? selectedLocations.map((location) => location.name).join(t('journeyEdit.form.destinationSeparator'))
      : tripName.trim();
    const effectiveRoute = selectedLocations.length
      ? {
          ...combineSelectedRoutes(route, selectedLocations),
          name: destinationNames,
          region: selectedLocations.map((location) => location.region || location.name).join(' / '),
          lng: selectedLocations[0].lng,
          lat: selectedLocations[0].lat,
          coord: selectedLocations[0].coord,
        }
      : route.custom && !selectedLocation
      ? { ...route, region: tripName.trim() }
      : route;
    // Smart planning must preserve an undecided date in both the prompt and
    // the saved journey. Manual creation keeps the existing concrete default.
    const journeyFlexibleDates = flexibleDates || (mode === 'smart' && !hasExplicitStart);
    const poi = buildJourney(effectiveRoute, destinationNames, startDt, durationMins, journeyFlexibleDates, t, selfCompanion);
    if (boundTrackId) {
      poi.trackId = boundTrackId;
    } else if (trackSource && userId) {
      try {
        // The track row has to exist before the journey can point at it.
        const { track, archiveTrimmed } = await createTrackFromFile(trackSource.parsed, { userId, sourceUri: trackSource.uri, fileSize: trackSource.fileSize }, createTrack);
        poi.trackId = track.id;
        if (archiveTrimmed) onToast(t('record.track.archiveTrimmed'));
      } catch (error) {
        console.warn('[NewJourney] track import failed:', error);
        onToast(t('journeyEdit.form.trackUploadFailed'));
        setCreatingMode(null);
        return;
      }
    } else if (route.trackCoords && route.trackCoords.length > 1 && userId) {
      // Explore routes carry decimated geometry in the route catalog. Promote
      // it to the user's track library so the new journey and AI share the
      // same track contract as an uploaded GPX/KML file.
      const distanceKm = Number.parseFloat(route.dist.replace(/[^0-9.]/g, ''));
      const ascentM = Number.parseFloat(route.asc.replace(/[^0-9.]/g, ''));
      const track = await createTrack({
        name: route.name,
        fileName: route.trackFileName || `${route.name}.kml`,
        fileFormat: 'kml',
        coords: route.trackCoords,
        elevation: route.trackElevation,
        durationMs: route.trackDurationMs,
        waypoints: route.trackWaypoints,
        distM: Number.isFinite(distanceKm) ? Math.round(distanceKm * 1000) : undefined,
        ascM: Number.isFinite(ascentM) ? Math.round(ascentM) : undefined,
        pointCount: route.trackCoords.length,
      });
      if (!track) {
        onToast(t('journeyEdit.form.trackUploadFailed'));
        setCreatingMode(null);
        return;
      }
      poi.trackId = track.id;
    }
    // Catalog routes are promoted to the track library above, but they do not
    // populate `trackSource` (that field is only used for local uploads).
    // Keep the planning prompt aligned with the journey we are about to save.
    const hasRouteTrack = Boolean(route.trackCoords && route.trackCoords.length > 1);
    const trackLabel = boundTrack
      ? `${boundTrack.name} ${trackMeta(boundTrack)}`
      : trackSource
      ? `${trackSource.fileName} ${route.dist} ${route.asc}`
      : hasRouteTrack
      ? `${route.trackFileName || `${route.name}.kml`} ${route.dist} ${route.asc}`
      : t('journeyEdit.form.noTrack');
    const prompt = t('journeyEdit.form.smartPrompt', {
      name: destinationNames,
      dates: journeyFlexibleDates ? t('journeyHome.dateUnset') : journeyDateSummary(startDt, durationMins, resolved),
      duration: totalDays == null ? t('journeyEdit.form.durationUnknownPrompt') : t('journeyEdit.form.durationDays', { count: totalDays }),
      track: selectedLocations.length > 1
        ? `${selectedLocations.map((location, index) => `${index + 1}. ${location.name}`).join(t('journeyEdit.form.promptSeparator'))}${t('journeyEdit.form.promptSeparator')}${trackLabel}`
        : trackLabel,
    });
    const created = mode === 'smart' ? await onSmartPlan(poi, prompt) : await onCreate(poi);
    if (!created) setCreatingMode(null);
  };

  const createOfficial = async () => {
    if (!officialPlan || creatingMode || !nameValid) return;
    setCreatingMode('official');
    try {
      const localDate = `${startDt.getFullYear()}-${String(startDt.getMonth() + 1).padStart(2, '0')}-${String(startDt.getDate()).padStart(2, '0')}`;
      const id = await createJourneyFromGuide(
        {
          kind: 'official',
          plan: officialPlan,
          trekStartDate: hasExplicitStart && !flexibleDates ? localDate : null,
        },
        'form',
        officialRequestId.current,
      );
      officialRequestId.current = Crypto.randomUUID();
      await onCreatedFromPlan?.(id);
    } catch (error) {
      const message = String((error as { message?: string })?.message ?? error);
      if (message.includes('not_published'))
        Alert.alert(
          t('officialItinerary.updatedTitle'),
          t('officialItinerary.updatedMessage'),
        );
      else onToast(t('appShell.toastJourneyCreateFailed'));
      setCreatingMode(null);
    }
  };

  const applyTrackStart = async (
    name: string,
    coords: [number, number][],
    elevation?: Poi['trackElevation'],
    waypoints?: Poi['trackWaypoints'],
    dist?: string,
    asc?: string,
    fileName?: string,
    replaceFirst = false,
  ) => {
    const [lng, lat] = coords[0];
    let location = locationFromPoi(name, lng, lat);
    try {
      location = await reverseJourneyLocation(
        lng,
        lat,
        resolved === 'zh' ? 'zh' : 'en',
      );
    } catch {
      /* cached/local fallback */
    }
    const destination: NJDestination = { ...location, name };
    const hasDestination = selectedLocations.some(
      (item) =>
        Math.abs(item.lng - lng) < 0.001 && Math.abs(item.lat - lat) < 0.001,
    );
    if (replaceFirst) {
      setSelectedLocations((current) => [destination, ...current.slice(1)]);
      setTripName(name);
    } else {
      if (!hasDestination)
        setSelectedLocations((current) => [...current, destination]);
      if (!tripName.trim()) setTripName(name);
    }
    setRoute((current) => ({
      ...current,
      name,
      region: location.region || location.name,
      lng,
      lat,
      coord: location.coord,
      dist: dist || current.dist,
      asc: asc || current.asc,
      trackCoords: coords,
      trackElevation: elevation,
      trackWaypoints: waypoints,
      trackFileName: fileName || current.trackFileName,
    }));
  };

  const bindLibraryTrack = async (track: (typeof tracks)[number]) => {
    if (!track.coords?.length) return;
    setTrackSource(null);
    setBoundTrackId(track.id);
    await applyTrackStart(
      track.name || track.fileName || t('journey.settings.locationUnnamed'),
      track.coords,
      track.elevation,
      track.waypoints,
      track.distM == null ? undefined : `${(track.distM / 1000).toFixed(1)} km`,
      track.ascM == null ? undefined : `${Math.round(track.ascM)} m`,
      track.fileName,
      true,
    );
    setTrackChooserOpen(false);
  };

  const pickTrack = async () => {
    if (trackBusy) return;
    try {
      const result = await FSFile.pickFileAsync({ mimeTypes: '*/*' });
      if (result.canceled || !result.result) return;
      const file = result.result;
      const fileName = file.name || 'track.gpx';
      const extension = (fileName.split('.').pop() || '').toLowerCase();
      if (!['gpx', 'kml', 'kmz'].includes(extension)) {
        onToast(t('record.track.errFormat'));
        return;
      }
      setTrackBusy(true);
      const parsed = await parseTrackFile(file, t);
      const preview = buildTrackData(parsed.stats);
      await applyTrackStart(
        parsed.name || tripName.trim() || t('journey.settings.locationUnnamed'),
        preview.trackCoords,
        preview.trackElevation,
        parsed.waypoints,
        preview.dist,
        preview.asc,
        parsed.fileName,
      );
      setBoundTrackId(null);
      setTrackSource({
        uri: file.uri,
        fileName: parsed.fileName,
        fileSize: file.size,
        parsed,
      });
      setTrackChooserOpen(false);
    } catch (error) {
      console.warn('[NewJourney] track parse failed:', error);
      onToast(
        t(
          error instanceof TrackFileError
            ? error.messageKey
            : 'record.track.errParse',
        ),
      );
    } finally {
      setTrackBusy(false);
    }
  };

  const removeLocation = (index: number) => {
    const next = selectedLocations.filter((_, locationIndex) => locationIndex !== index);
    setSelectedLocations(next);
    setTripName(next.map((location) => location.name).join(t('journeyEdit.form.destinationSeparator')));
    setBoundTrackId(null);
    setTrackSource(null);
    if (!next.length) {
      setRoute(blankRoute);
      return;
    }
    if (index === 0) {
      const first = next[0];
      setRoute((current) => ({
        ...current,
        name: first.name,
        region: first.region || first.name,
        lng: first.lng,
        lat: first.lat,
        coord: first.coord,
        trackCoords: first.route?.trackCoords,
        trackElevation: first.route?.trackElevation,
        trackWaypoints: first.route?.trackWaypoints,
        trackFileName: first.route?.trackFileName,
      }));
    }
  };

  const addDestination = (destination: NJDestination) => {
    const alreadySelected = selectedLocations.some((location) => location.lng === destination.lng && location.lat === destination.lat);
    const next = alreadySelected ? selectedLocations : [...selectedLocations, destination];
    setSelectedLocations(next);
    setTripName(next.map((location) => location.name).join(t('journeyEdit.form.destinationSeparator')));
    setLocationQuery('');
    setLocationResults([]);
    setLocationSearchFailed(false);
    if (!selectedLocations.length) {
      if (destination.route) {
        setRoute(destination.route);
      } else {
        setRoute((current) => ({
          ...current,
          name: destination.name,
          region: destination.region || destination.name,
          lng: destination.lng,
          lat: destination.lat,
          coord: destination.coord,
        }));
      }
    }
    Keyboard.dismiss();
  };

  if (presetRoute) {
    return (
      <View
        pointerEvents="box-none"
        style={[StyleSheet.absoluteFill, { zIndex: 200 }]}
      >
        <NJPresetPlanner
          theme={theme}
          selectedLocations={selectedLocations}
          locationQuery={locationQuery}
          setLocationQuery={(value) => {
            setLocationQuery(value);
            setLocationResults([]);
            setLocationSearchFailed(false);
          }}
          routeSearchResults={routeSearchResults}
          locationResults={locationResults}
          locationSearching={locationSearching}
          addDestination={addDestination}
          removeLocation={removeLocation}
          startDt={startDt}
          durationMins={durationMins}
          flexibleDates={flexibleDates}
          onOpenTimePicker={openTimePicker}
          onClose={onClose}
          nameValid={nameValid}
          creatingMode={creatingMode}
          officialPlan={officialPlan}
          onManual={() => void submit('manual')}
          onSmart={() => void submit('smart')}
          onOfficial={() => void createOfficial()}
        />
        {timeOpen && (
          <JourneyDateRangePicker
            presentation="inline"
            theme={theme}
            initialStart={startDt}
            initialDurationDays={totalDays}
            initialFlexible={flexibleDates}
            onApply={({ start, totalDays, flexible }) => {
              setStartDt(start);
              setDurationMins(
                totalDays == null ? undefined : totalDays * 24 * 60,
              );
              setFlexibleDates(flexible);
              setHasExplicitStart(!flexible);
            }}
            onClose={() => setTimeOpen(false)}
          />
        )}
      </View>
    );
  }

  return (
    <View
      style={[
        StyleSheet.absoluteFill,
        { backgroundColor: theme.groupedBg, zIndex: 200 },
      ]}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <View
          style={{
            height: insets.top + layout.topBarHeight,
            paddingTop: insets.top,
            paddingHorizontal: layout.pagePadding,
            flexDirection: 'row',
            alignItems: 'center',
          }}
        >
          <Press
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel={t('common.close')}
            style={{
              width: layout.iconButton,
              height: layout.iconButton,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Icon name="close" color={theme.text} size={22} />
          </Press>
          <Text
            numberOfLines={1}
            style={[
              type.navTitle,
              {
                position: 'absolute',
                left: 68,
                right: 68,
                bottom: space.sm,
                textAlign: 'center',
                color: theme.text,
              },
            ]}
          >
            {t('journeyEdit.newTitle')}
          </Text>
        </View>
        <ScrollView
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{
            paddingHorizontal: layout.pagePadding,
            paddingTop: space.xxxl,
            paddingBottom: 150 + insets.bottom,
          }}
        >
          <Text style={[type.pageTitle, { color: theme.text }]}>
            {t('journeyEdit.form.whereTitle')}
          </Text>
          <View style={{ marginTop: space.sm }}>
            <NJDestinationField
              theme={theme}
              selectedLocations={selectedLocations}
              locationQuery={locationQuery}
              setLocationQuery={(value) => {
                setLocationQuery(value);
                if (!selectedLocations.length) setTripName(value);
              }}
              routeSearchResults={routeSearchResults}
              locationResults={locationResults}
              locationSearching={locationSearching}
              addDestination={addDestination}
              removeLocation={removeLocation}
            />
          </View>
          {!selectedLocations.length && !locationQuery ? (
            <View style={{ marginTop: space.lg }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <Text style={[type.labelStrong, { color: theme.text2 }]}>
                  {t('journeyEdit.form.seasonalRoutes', { month: currentMonth })}
                </Text>
                {seasonalRoutes.length > NJ_SHORTCUT_LIMIT ? (
                  <Press accessibilityRole="button" onPress={() => setSeasonalOpen(true)} hitSlop={space.sm}>
                    <Text style={[type.labelStrong, { color: theme.accent }]}>{t('journeyEdit.form.seasonalMore')}</Text>
                  </Press>
                ) : null}
              </View>
              {seasonalRoutes.slice(0, NJ_SHORTCUT_LIMIT).map((item) => renderSeasonalRow(item))}
            </View>
          ) : null}
          {locationSearchFailed ? (
            <Text
              style={[
                type.caption,
                { color: theme.text2, marginTop: space.xs },
              ]}
            >
              {t('journey.settings.locationSearchUnavailable')}
            </Text>
          ) : null}
          <View style={{ marginTop: layout.sectionGap }}>
            <Text style={[type.pageTitle, { color: theme.text }]}>
              {t('journeyEdit.form.whenTitle')}
            </Text>
            <NJWhenField
              theme={theme}
              startDt={startDt}
              durationMins={durationMins}
              flexibleDates={flexibleDates}
              onOpen={openTimePicker}
            />
          </View>
          <View style={{ marginTop: layout.sectionGap }}>
            <NJTrackRow
              theme={theme}
              attachedTrack={
                boundTrack
                  ? {
                      name:
                        boundTrack.name ||
                        boundTrack.fileName ||
                        t('journey.settings.locationUnnamed'),
                      meta: trackMeta(boundTrack),
                    }
                  : trackSource
                    ? {
                        name: trackSource.fileName,
                        meta: trackMeta({
                          distM:
                            routeStatNumber(route.dist) == null
                              ? undefined
                              : routeStatNumber(route.dist)! * 1000,
                          ascM: routeStatNumber(route.asc),
                        }),
                      }
                    : null
              }
              catalogTrack={
                Boolean(!boundTrack && !trackSource && route.trackCoords?.length)
              }
              busy={trackBusy}
              disabled={Boolean(creatingMode)}
              onOpen={() => setTrackChooserOpen(true)}
              onRemove={() => {
                setBoundTrackId(null);
                setTrackSource(null);
                setRoute(selectedLocation?.route || blankRoute);
              }}
            />
          </View>
        </ScrollView>
        {keyboardShown ? null : (
          <View
            style={{
              paddingHorizontal: layout.pagePadding,
              paddingTop: space.sm,
              paddingBottom: Math.max(insets.bottom, space.md),
              backgroundColor: theme.groupedBg,
            }}
          >
            <NJCreateBar
              theme={theme}
              nameValid={nameValid}
              creatingMode={creatingMode}
              officialPlan={officialPlan}
              onManual={() => void submit('manual')}
              onSmart={() => void submit('smart')}
              onOfficial={() => void createOfficial()}
            />
          </View>
        )}
      </KeyboardAvoidingView>
      {timeOpen ? (
        <JourneyDateRangePicker
          presentation="inline"
          theme={theme}
          initialStart={startDt}
          initialDurationDays={totalDays}
          initialFlexible={flexibleDates}
          onApply={({ start, totalDays: nextTotalDays, flexible }) => {
            setStartDt(start);
            setDurationMins(
              nextTotalDays == null ? undefined : nextTotalDays * 24 * 60,
            );
            setFlexibleDates(flexible);
            setHasExplicitStart(!flexible);
          }}
          onClose={() => setTimeOpen(false)}
        />
      ) : null}
      {seasonalOpen ? (
        <NJBottomSheet theme={theme} onClose={() => setSeasonalOpen(false)} bodyScrolls borderless>
          <ScrollView style={{ maxHeight: windowHeight * NJ_PICKER_HEIGHT_RATIO }} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: space.lg, paddingBottom: space.xl }}>
            <Text style={[type.pageTitle, { color: theme.text, marginBottom: space.sm }]}>
              {t('journeyEdit.form.seasonalRoutes', { month: currentMonth })}
            </Text>
            {seasonalRoutes.map((item) => renderSeasonalRow(item, () => setSeasonalOpen(false)))}
          </ScrollView>
        </NJBottomSheet>
      ) : null}
      {trackChooserOpen ? (
        <NewJourneyTrackChooser
          theme={theme}
          tracks={tracks}
          busy={trackBusy || Boolean(creatingMode)}
          onClose={() => setTrackChooserOpen(false)}
          onSelect={(track) => void bindLibraryTrack(track)}
          onUpload={() => void pickTrack()}
        />
      ) : null}
    </View>
  );
}
