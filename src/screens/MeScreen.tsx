// MeScreen.tsx — the 我 tab, with personal content on the overview and
// account, appearance, preferences, and support grouped on a settings page.
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Pressable,
  Modal,
  BackHandler,
  useWindowDimensions,
} from "react-native";
import { Image } from "expo-image";
import Constants from "expo-constants";
import {
  Bell,
  ChevronLeft,
  Luggage,
  Mountain,
  ScanLine,
  Settings,
} from "lucide-react-native";
import ReAnimated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Theme, ACCENT_PRESETS } from "../theme/theme";
import { Icon, IconName } from "../components/Icon";
import { Press } from "../components/Press";
import { ProfileHero, ProfileTabs } from "../components/me/profile/ProfileHero";
import { ProfileOverview, type OverviewTile } from "../components/me/profile/ProfileOverview";
import { OutingCard } from "../components/me/profile/OutingCard";
import { ProfilePhotos } from "../components/me/profile/ProfilePhotos";
import { TimelineEmpty } from "../components/me/profile/TimelineEmpty";
import { OutingImportSheet } from "../components/me/profile/OutingImportSheet";
import { pickTrackFiles, type TrackFile } from "../lib/trackImport";
import { useProfileOutings, useProfileSummary, setAccountPrivate, type Outing, type Visibility } from "../hooks/useSocial";
import { useMyRouteComments } from "../hooks/useRouteComments";
import { ContributionsPage } from "../components/me/ContributionsPage";
import { openVisibilityPicker } from "../components/social/VisibilityPicker";
import { Glass } from "../components/Glass";
import { TwoStageSwipeable } from "../components/TwoStageSwipeable";
import { Globe } from "../components/globe";
import { STAGGER_MAX_DELAY_MS } from "../components/StaggerIn";
import { TrailSheet } from "../components/Sheet";
import { useAppearance } from "../theme/AppearanceContext";
import { useI18n, Lang, TKey } from "../i18n";
import { useNav } from "../nav/NavContext";
import { countRender } from "../lib/tabSwitchProbe";
import { useData } from "../data/DataContext";
import {
  itemPrice,
  itemWeight,
  fmtWeight,
  WEIGHT_UNITS,
  type WeightUnit,
} from "../data/gear";
import { useNotifCenter, Notif } from "../data/notifications";
import { yuanWithGap } from "../components/gear/parts";
import { ColorDot } from "../components/me/parts";
import { makeMeTheme } from "../components/me/appearance";
import { AccountPage } from "../components/me/AccountPage";
import type { MeProfile } from "../components/me/AccountPage";
import { EditFieldPage, MeEditField } from "../components/me/EditFieldPage";
import {
  NotifSettingsPage,
  NotifSettings,
} from "../components/me/NotifSettingsPage";
import { NotifInboxPage } from "../components/me/NotifInboxPage";
import { openNotificationTargetById } from "../lib/notificationRouting";
import { FeedbackPage } from "../components/me/FeedbackPage";
import { AboutPage } from "../components/me/AboutPage";
import { LegalDocumentPage } from "../components/me/LegalDocumentPage";
import { PlanningProfilePage } from "../components/me/PlanningProfilePage";
import { MembershipPage } from "../components/me/MembershipPage";
import type { UserPlanningProfile } from "../hooks/usePlanningProfile";
import { JourneyTrashPage } from "../components/journey/JourneyTrashPage";
import { TracksPage } from "../components/tracks/TracksPage";
import { TrackDetailPage } from "../components/tracks/TrackDetailPage";
import { KPState } from "../components/State";
import {
  AppActionDialog,
  AppCard,
  AppMetricStrip,
  AppSectionHeader,
  DetailPage,
  layout,
  motion,
  radius,
  space,
  type,
  type AppMetric,
} from "../design-system";
import { QrLoginScannerPage } from "../components/auth/QrLoginScannerPage";
import { fetchJourneyPoiById } from "../lib/journeyInvite";
import { joinJourneyByCode } from "../lib/journeyShare";
import { orderCompanionsForDisplay, type Poi } from "../data/pois";
import { buildRouteFootprints, type RouteFootprints } from "../data/footprints";
import { ParticipantAvatar } from "../components/overlays/ParticipantAvatar";
import { DeleteAccountReasonsPage } from "../components/me/DeleteAccountReasonsPage";
import { MyRouteGuidesPage } from "../components/me/MyRouteGuidesPage";
import {
  JOURNEY_SWIPE_SPRING,
  JourneySwipeDeleteAction,
} from "../components/me/JourneySwipeDelete";
import {
  deleteRouteGuide,
  updateRouteGuide,
  useMyRouteGuides,
} from "../hooks/useRouteGuides";
import { MyRouteRequestsPage } from "../components/me/MyRouteRequestsPage";
import { CardPickerPage, type CardPickerOption } from "../components/me/CardPickerPage";
import { LanguagePickerPage } from "../components/me/LanguagePickerPage";
import { LoginMethodPage } from "../components/me/LoginMethodPage";
import { removeMedia } from "../lib/storage";
import { regionLabel } from "../lib/regionLabel";

const appVersionLabel = Constants.expoConfig?.version
  ? `v${Constants.expoConfig.version}`
  : undefined;

type MePage =
  | { type: "scanLogin" }
  | { type: "journeys" }
  | { type: "footprints" }
  | { type: "favorites" }
  | { type: "contributions" }
  | { type: "routeGuides" }
  | { type: "routeRequests" }
  | { type: "tracks"; underDetail?: boolean }
  | { type: "trackDetail"; trackId: string }
  | { type: "trash" }
  | { type: "profile" }
  | { type: "accountSecurity" }
  | { type: "loginMethod"; kind: "email" | "phone" }
  | { type: "deleteAccountReasons" }
  | { type: "planningProfile" }
  | { type: "membership"; view?: "usage" }
  | { type: "edit"; field: MeEditField }
  | { type: "notif" }
  | { type: "inbox" }
  | { type: "feedback" }
  | { type: "about" }
  | { type: "picker"; picker: AppearancePopup }
  | { type: "legalDocument"; document: "agreement" | "privacy" };

type AppearancePopup = "theme" | "accent" | "language" | "weight";
type PopupAnchor = { x: number; y: number; width: number; height: number };
const SETTINGS_ROW_HEIGHT = layout.listRowMinHeight;
const flatMeCardStyle = { boxShadow: "none" as const };
const headerButtonStyle = {
  width: layout.iconButton,
  height: layout.iconButton,
  alignItems: "center" as const,
  justifyContent: "center" as const,
};

function AppearanceChevron({ theme, open }: { theme: Theme; open: boolean }) {
  const progress = useSharedValue(open ? 1 : 0);

  useEffect(() => {
    progress.value = withTiming(open ? 1 : 0, {
      duration: motion.emphasized,
      easing: Easing.bezier(0.16, 1, 0.3, 1),
    });
  }, [open, progress]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { rotate: `${interpolate(progress.value, [0, 1], [90, -90])}deg` },
    ],
  }));

  return (
    <ReAnimated.View style={animatedStyle}>
      <Icon name="chevronR" color={theme.text3} size={15} />
    </ReAnimated.View>
  );
}

const AppearanceRow = React.forwardRef<
  View,
  {
    theme: Theme;
    label: string;
    value: string;
    leading: React.ReactNode;
    open: boolean;
    onPress: () => void;
    last?: boolean;
  }
>(({ theme, label, value, leading, open, onPress }, ref) => (
  <View ref={ref} collapsable={false}>
    <Press
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ expanded: open }}
      scaleTo={1}
      opacityTo={1}
    >
      <View
        style={{
          minHeight: SETTINGS_ROW_HEIGHT,
          paddingVertical: space.md,
          flexDirection: "row",
          alignItems: "center",
          gap: space.md,
        }}
      >
        <View
          style={{
            width: 32,
            height: 38,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {leading}
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[type.cardTitle, { color: theme.text }]}>{label}</Text>
          <Text
            numberOfLines={1}
            style={[type.caption, { color: theme.text2, marginTop: 3 }]}
          >
            {value}
          </Text>
        </View>
        <AppearanceChevron theme={theme} open={open} />
      </View>
    </Press>
  </View>
));

function PopupOption({
  theme,
  label,
  selected,
  onPress,
  leading,
}: {
  theme: Theme;
  label: string;
  selected: boolean;
  onPress: () => void;
  leading?: React.ReactNode;
  last?: boolean;
}) {
  return (
    <Press
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      scaleTo={1}
      opacityTo={1}
    >
      <View
        style={{
          minHeight: layout.menuRowHeight,
          paddingHorizontal: space.md,
          flexDirection: "row",
          alignItems: "center",
          gap: space.sm,
        }}
      >
        {leading}
        <Text
          style={{
            flex: 1,
            fontSize: 14,
            fontWeight: selected ? "700" : "500",
            color: selected ? theme.accent : theme.text,
          }}
        >
          {label}
        </Text>
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
    <Press
      onPress={onPress}
      accessibilityRole="button"
      scaleTo={1}
      opacityTo={1}
    >
      <View
        style={{
          minHeight: SETTINGS_ROW_HEIGHT,
          paddingVertical: space.md,
          flexDirection: "row",
          alignItems: "center",
          gap: space.md,
        }}
      >
        <View
          style={{
            width: 32,
            height: 38,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Icon name={icon} color={theme.text2} size={19} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[type.cardTitle, { color: theme.text }]}>{label}</Text>
          {detail ? (
            <Text
              numberOfLines={1}
              style={[type.caption, { color: theme.text2, marginTop: 3 }]}
            >
              {detail}
            </Text>
          ) : null}
        </View>
        <Icon name="chevronR" color={theme.text3} size={15} />
      </View>
    </Press>
  );
}

function mapCoordinate(point: Poi): [number, number] {
  const start = point.trackCoords?.[0];
  return start && Number.isFinite(start[0]) && Number.isFinite(start[1])
    ? start
    : [point.lng, point.lat];
}

function groupMapPoints(points: Poi[]) {
  const groups = new Map<string, Poi[]>();
  points.forEach((point) => {
    const [lng, lat] = mapCoordinate(point);
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return;
    // Routes created without coordinates store the (0,0) placeholder, which is
    // null island in the Gulf of Guinea, not a place anyone walked.
    if (lng === 0 && lat === 0) return;
    const key = `${lng.toFixed(4)},${lat.toFixed(4)}`;
    groups.set(key, [...(groups.get(key) || []), point]);
  });
  return [...groups.values()];
}

function CollectionMap({
  theme,
  points,
  onPointPress,
  mutedIds,
  frameCoords,
  coverUriById,
  focusBottomPadding,
  staggerPins = false,
}: {
  theme: Theme;
  points: Poi[];
  onPointPress?: (point: Poi) => void;
  mutedIds?: Set<string>;
  frameCoords?: [number, number][];
  coverUriById?: Record<string, string | undefined>;
  focusBottomPadding?: number;
  staggerPins?: boolean;
}) {
  const { resolved } = useI18n();
  const { width } = useWindowDimensions();
  // The caller asks for a one-shot entrance; the timer lives here rather than
  // in the page so flipping it only re-renders this wrapper. The page holds the
  // sheet's header/accessory/list as inline JSX, and rebuilding that subtree
  // mid-drag lands in the same frames as the snap spring.
  const [entrancePending, setEntrancePending] = useState(staggerPins);
  useEffect(() => {
    if (!staggerPins || !entrancePending || !points.length) return;
    const timer = setTimeout(
      () => setEntrancePending(false),
      STAGGER_MAX_DELAY_MS + 400,
    );
    return () => clearTimeout(timer);
  }, [staggerPins, entrancePending, points.length]);
  // Some native map implementations retain removed custom markers when their
  // marker collection is updated in place. Remount only when the point set
  // changes so a deleted journey cannot remain visible, while camera state is
  // preserved for ordinary renders (theme, layout, or label updates).
  const pointSetKey = points
    .map((point) => `${point.id}:${mutedIds?.has(point.id) ? "muted" : "lit"}`)
    .sort()
    .join("|");
  // Memoised so unrelated re-renders don't rebuild every native marker.
  const { center, pois } = useMemo(() => {
    const groups = groupMapPoints(points);
    const coordinates = groups.map((group) => mapCoordinate(group[0]));
    return {
      center: coordinates.length
        ? {
            lon:
              coordinates.reduce((sum, [lng]) => sum + lng, 0) /
              coordinates.length,
            lat:
              coordinates.reduce((sum, [, lat]) => sum + lat, 0) /
              coordinates.length,
          }
        : { lon: 104, lat: 35 },
      pois: groups.map((group) => {
        const representative = group[0];
        const [lng, lat] = mapCoordinate(representative);
        return {
          id: representative.id,
          lng,
          lat,
          mine: representative.kind === "journey",
          tone: representative.tone,
          count: group.length,
          coverUri:
            coverUriById?.[representative.id] ??
            representative.photoUris?.[0],
          label: representative.name,
          muted: mutedIds?.has(representative.id),
        };
      }),
    };
  }, [points, mutedIds, coverUriById]);

  return (
    <View
      style={[
        StyleSheet.absoluteFill,
        {
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: theme.bg,
        },
      ]}
    >
      <Globe
        key={pointSetKey}
        theme={theme}
        size={Math.min(width * 0.86, 360)}
        pois={pois}
        center={center}
        mapStyle="standard"
        frameCoords={frameCoords}
        focusBottomPadding={focusBottomPadding}
        staggerPins={staggerPins && entrancePending}
        showMapLabels
        onPoiPress={
          onPointPress
            ? (id) => {
                const point = points.find((item) => item.id === id);
                if (point) onPointPress(point);
              }
            : undefined
        }
      />
    </View>
  );
}

function FootprintShortcut({
  theme,
  points,
  title,
  detail,
  onPress,
}: {
  theme: Theme;
  points: Poi[];
  title: string;
  detail: string;
  onPress: () => void;
}) {
  const previews = points.slice(0, 3);

  return (
    <AppCard
      theme={theme}
      radius={radius.showcase}
      style={{
        aspectRatio: 1,
        borderCurve: "continuous",
        borderWidth: 0,
        overflow: "hidden",
        backgroundColor: theme.fieldSurface,
        boxShadow: "none",
      }}
    >
      <Press
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`${title}, ${detail}`}
        scaleTo={0.985}
        style={{
          flex: 1,
          padding: space.lg,
          flexDirection: "column",
          justifyContent: "space-between",
          gap: space.sm,
        }}
      >
        <View style={{ minWidth: 0, alignItems: "flex-start", gap: space.xs }}>
          <Text
            numberOfLines={2}
            style={[type.cardTitle, { color: theme.text, textAlign: "left" }]}
          >
            {title}
          </Text>
          <Text
            numberOfLines={2}
            style={[type.caption, { color: theme.text2, textAlign: "left" }]}
          >
            {detail}
          </Text>
        </View>
        <View
          pointerEvents="none"
          style={{ height: 70, alignItems: "center", justifyContent: "center" }}
        >
          <View style={{ width: 88, height: 64 }}>
            {Array.from({ length: 3 }, (_, index) => previews[index]).map(
              (journey, index) =>
                journey?.photoUris?.[0] ? (
                  <View
                    key={journey.id}
                    style={{
                      position: "absolute",
                      right: index * 18,
                      top: index === 0 ? 6 : 0,
                      width: 48,
                      height: 58,
                      borderRadius: space.xxs,
                      borderWidth: 3,
                      borderColor: theme.surfaceTop,
                      overflow: "hidden",
                      backgroundColor: theme.surfaceTop,
                      transform: [{ rotate: `${index === 0 ? 9 : -9}deg` }],
                    }}
                  >
                    {journey.photoUris?.[0] ? (
                      <Image
                        source={{ uri: journey.photoUris[0] }}
                        contentFit="cover"
                        cachePolicy="memory-disk"
                        transition={0}
                        style={StyleSheet.absoluteFill}
                      />
                    ) : null}
                  </View>
                ) : (
                  <View
                    key={`placeholder-${index}`}
                    style={{
                      position: "absolute",
                      right: index * 18,
                      top: index === 0 ? 6 : 0,
                      width: 48,
                      height: 58,
                      borderRadius: space.xxs,
                      borderWidth: 2,
                      borderColor: theme.fieldBorder,
                      backgroundColor: theme.surfaceTop,
                      alignItems: "center",
                      justifyContent: "center",
                      transform: [{ rotate: `${index === 0 ? 9 : -9}deg` }],
                    }}
                  >
                    <Icon name="photo" color={theme.text2} size={18} />
                  </View>
                ),
            )}
          </View>
        </View>
      </Press>
    </AppCard>
  );
}

function PlanningProfileCard({
  theme,
  profile,
  onPress,
}: {
  theme: Theme;
  profile: UserPlanningProfile;
  loading: boolean;
  onPress: () => void;
}) {
  const { t } = useI18n();
  const facts: AppMetric[] = [
    {
      label: `${t("planningProfile.height")} cm`,
      value: profile.heightCm == null ? "--" : String(profile.heightCm),
      muted: profile.heightCm == null,
    },
    {
      label: `${t("planningProfile.weight")} kg`,
      value: profile.weightKg == null ? "--" : String(profile.weightKg),
      muted: profile.weightKg == null,
    },
    {
      label: `${t("planningProfile.age")} ${t("planningProfile.years")}`,
      value: profile.ageYears == null ? "--" : String(profile.ageYears),
      muted: profile.ageYears == null,
    },
  ];
  // The profile stores dietary needs as one 、-joined string, and the editor is a
  // multiline field, so the card splits on both separators and line breaks.
  const dietary = profile.dietaryRestrictions
    .split(/[、,，;；\r\n]+/)
    .map((item) => item.trim())
    .filter(Boolean);
  const tags = dietary.slice(0, 3);

  return (
    <AppCard
      theme={theme}
      radius={radius.showcase}
      style={[
        flatMeCardStyle,
        {
          aspectRatio: 1,
          minWidth: 0,
          borderWidth: 0,
          backgroundColor: theme.fieldSurface,
          overflow: "hidden",
        },
      ]}
    >
      <Press
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`${t("planningProfile.title")}, ${t("planningProfile.cardSummary")}`}
        scaleTo={0.985}
        style={{
          flex: 1,
          padding: space.lg,
          justifyContent: "space-between",
          gap: space.sm,
        }}
      >
        <View style={{ gap: space.xs }}>
          <Text style={[type.cardTitle, { color: theme.text }]}>
            {t("planningProfile.title")}
          </Text>
          <Text
            numberOfLines={1}
            style={[type.caption, { color: theme.text2 }]}
          >
            {t("planningProfile.cardSummary")}
          </Text>
        </View>

        <View style={{ gap: space.sm }}>
          <AppMetricStrip theme={theme} stats={facts} />

          {tags.length ? (
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: space.xs,
                minWidth: 0,
              }}
            >
              <Text
                numberOfLines={1}
                style={[type.caption, { color: theme.text3, flexShrink: 1 }]}
              >
                {t("planningProfile.dietaryRestrictions")}
              </Text>
              <Text
                numberOfLines={1}
                style={[type.caption, { color: theme.text2, flex: 1 }]}
              >
                {tags.join("、")}
                {dietary.length > tags.length
                  ? ` +${dietary.length - tags.length}`
                  : ""}
              </Text>
            </View>
          ) : null}
        </View>
      </Press>
    </AppCard>
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
  mutedIds,
  frameCoords,
  coverUriById,
  staggerPins = false,
  children,
}: {
  theme: Theme;
  title: string;
  summary?: string;
  points: Poi[];
  onBack: () => void;
  onPointPress: (point: Poi) => void;
  primaryAction?: { label: string; onPress: () => void };
  mutedIds?: Set<string>;
  frameCoords?: [number, number][];
  coverUriById?: Record<string, string | undefined>;
  staggerPins?: boolean;
  children: React.ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const { t } = useI18n();
  const { height } = useWindowDimensions();
  const fullHeight = Math.max(360, height - insets.top - space.xs);
  const minimizedHeight = Math.min(156, fullHeight);
  const middleHeight = Math.max(
    minimizedHeight,
    Math.min(fullHeight - 1, Math.round(height * 0.58)),
  );

  return (
    <View style={{ flex: 1, overflow: "hidden", backgroundColor: theme.bg }}>
      <CollectionMap
        theme={theme}
        points={points}
        onPointPress={onPointPress}
        mutedIds={mutedIds}
        frameCoords={frameCoords}
        focusBottomPadding={middleHeight}
        coverUriById={coverUriById}
        staggerPins={staggerPins}
      />
      <View style={{ position: "absolute", left: 14, top: insets.top + 5 }}>
        <Press
          onPress={onBack}
          accessibilityRole="button"
          accessibilityLabel={t("common.back")}
          hitSlop={6}
          style={{
            width: 52,
            height: 52,
            alignItems: "center",
            justifyContent: "center",
          }}
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
        topAccessory={
          primaryAction ? (
            <View
              style={{
                flex: 1,
                paddingHorizontal: layout.pagePadding,
                paddingBottom: space.sm,
                alignItems: "flex-end",
                justifyContent: "flex-end",
              }}
            >
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
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: theme.text,
                  boxShadow: theme.dark
                    ? "0px 5px 16px rgba(0,0,0,0.42)"
                    : "0px 5px 16px rgba(0,0,0,0.16)",
                }}
              >
                <Text
                  numberOfLines={1}
                  style={{
                    fontSize: 13,
                    fontWeight: "700",
                    color: theme.featureSurface,
                  }}
                >
                  {primaryAction.label}
                </Text>
              </Press>
            </View>
          ) : undefined
        }
        header={
          <View
            style={{
              paddingHorizontal: layout.pagePadding,
              paddingTop: space.xs,
              paddingBottom: space.md,
            }}
          >
            <Text style={[type.pageTitle, { color: theme.text }]}>{title}</Text>
            {summary ? (
              <Text
                style={[type.body, { color: theme.text2, marginTop: space.xs }]}
              >
                {summary}
              </Text>
            ) : null}
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
  icon: IconName | "luggage" | "mountain";
  value: string;
  label: string;
  previewUris?: string[];
}) {
  const previews = previewUris?.slice(0, 2) || [];

  return (
    <View
      style={{
        flexGrow: 1,
        flexBasis: "46%",
        minWidth: 132,
        height: 82,
        paddingHorizontal: space.md,
        paddingVertical: space.sm,
        borderRadius: radius.feature,
        backgroundColor: theme.fieldSurface,
        overflow: "hidden",
      }}
    >
      <Text
        numberOfLines={1}
        adjustsFontSizeToFit
        style={[
          type.metric,
          { maxWidth: "72%", fontSize: 24, lineHeight: 28, color: theme.text },
        ]}
      >
        {value}
      </Text>
      <Text
        numberOfLines={1}
        style={{
          maxWidth: "72%",
          marginTop: space.xs,
          fontSize: 13,
          lineHeight: 18,
          fontWeight: "700",
          color: theme.text2,
        }}
      >
        {label}
      </Text>
      {previews.length ? (
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            right: -3,
            bottom: -8,
            width: 82,
            height: 78,
          }}
        >
          {previews.map((uri, index) => (
            <Image
              key={`${uri}-${index}`}
              source={{ uri }}
              contentFit="cover"
              cachePolicy="memory-disk"
              transition={0}
              style={{
                position: "absolute",
                right: index === 0 ? 28 : 2,
                bottom: index === 0 ? 4 : 0,
                width: 48,
                height: 58,
                borderRadius: radius.control,
                borderWidth: 2,
                borderColor: theme.featureSurface,
                transform: [{ rotate: index === 0 ? "-8deg" : "7deg" }],
              }}
            />
          ))}
        </View>
      ) : (
        <View
          style={{ position: "absolute", right: space.md, bottom: space.sm }}
        >
          {icon === "luggage" ? (
            <Luggage color={theme.text} size={22} strokeWidth={1.9} />
          ) : icon === "mountain" ? (
            <Mountain color={theme.text} size={22} strokeWidth={1.9} />
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
  onInvite,
  inviteAccessibilityLabel,
}: {
  theme: Theme;
  journey: Poi;
  onPress: () => void;
  onInvite?: () => void;
  inviteAccessibilityLabel?: string;
}) {
  const photos = journey.photoUris?.slice(0, 2) || [];
  const date = (
    journey.plannedDate ||
    journey.date ||
    journey.days ||
    "—"
  ).replace(/\s*·\s*/g, " ");
  const region = regionLabel(journey.region);

  return (
    <Press
      onPress={onPress}
      accessibilityRole="button"
      scaleTo={0.985}
      style={{ borderRadius: radius.feature }}
    >
      <AppCard
        theme={theme}
        radius={radius.feature}
        style={[
          flatMeCardStyle,
          {
            minHeight: 118,
            padding: space.md,
            borderWidth: 0,
            backgroundColor: theme.fieldSurface,
            overflow: "hidden",
          },
        ]}
      >
        <View
          style={{
            minHeight: 86,
            flexDirection: "row",
            alignItems: "stretch",
            gap: space.md,
          }}
        >
          <View style={{ flex: 1, minWidth: 0, paddingVertical: 2 }}>
            <Text
              numberOfLines={2}
              style={{
                fontSize: 16.5,
                lineHeight: 21,
                fontWeight: "800",
                color: theme.text,
              }}
            >
              {journey.name}
            </Text>
            <JourneyParticipants
              theme={theme}
              journey={journey}
              onInvite={onInvite}
              inviteAccessibilityLabel={inviteAccessibilityLabel}
            />

            <View style={{ marginTop: space.xs, gap: 5 }}>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 5,
                  minWidth: 0,
                }}
              >
                <Icon name="pin" color={theme.text3} size={12} />
                <Text
                  numberOfLines={1}
                  style={[type.caption, { flex: 1, color: theme.text2 }]}
                >
                  {region}
                </Text>
              </View>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 5,
                  minWidth: 0,
                }}
              >
                <Icon name="calendar" color={theme.text3} size={12} />
                <Text
                  numberOfLines={1}
                  style={[type.caption, { flex: 1, color: theme.text2 }]}
                >
                  {date}
                </Text>
              </View>
            </View>

            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: space.md,
                marginTop: "auto",
                paddingTop: space.sm,
              }}
            >
              <View
                style={{ flexDirection: "row", alignItems: "center", gap: 5 }}
              >
                <Icon name="distance" color={theme.text2} size={13} />
                <Text
                  numberOfLines={1}
                  style={[type.metric, { fontSize: 12, color: theme.text }]}
                >
                  {journey.dist || "—"}
                </Text>
              </View>
              <View
                style={{ flexDirection: "row", alignItems: "center", gap: 5 }}
              >
                <Icon name="arrowUp" color={theme.text2} size={13} />
                <Text
                  numberOfLines={1}
                  style={[type.metric, { fontSize: 12, color: theme.text }]}
                >
                  {journey.asc?.replace(/[+,]/g, "") || "—"}
                </Text>
              </View>
            </View>
          </View>

          <View
            style={{
              width: 94,
              minHeight: 86,
              flexShrink: 0,
              alignItems: "flex-end",
              justifyContent: "center",
            }}
          >
            {photos[1] ? (
              <View
                style={{
                  position: "absolute",
                  right: 8,
                  width: 74,
                  height: 78,
                  borderRadius: radius.card,
                  overflow: "hidden",
                  transform: [{ rotate: "7deg" }],
                }}
              >
                <Image
                  source={{ uri: photos[1] }}
                  contentFit="cover"
                  cachePolicy="memory-disk"
                  transition={0}
                  style={StyleSheet.absoluteFill}
                />
              </View>
            ) : null}
            <View
              style={{
                width: 82,
                height: 86,
                borderRadius: radius.card,
                overflow: "hidden",
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: theme.surfaceTop,
                borderWidth: StyleSheet.hairlineWidth,
                borderColor: theme.fieldBorder,
              }}
            >
              {photos[0] ? (
                <Image
                  source={{ uri: photos[0] }}
                  contentFit="cover"
                  cachePolicy="memory-disk"
                  transition={0}
                  style={StyleSheet.absoluteFill}
                />
              ) : (
                <Icon name="photo" color={theme.text3} size={24} />
              )}
              {(journey.photoUris?.length || 0) > 1 ? (
                <View
                  style={{
                    position: "absolute",
                    right: space.xs,
                    bottom: space.xs,
                    minWidth: 24,
                    height: 20,
                    paddingHorizontal: 6,
                    borderRadius: radius.pill,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: "rgba(0,0,0,0.62)",
                  }}
                >
                  <Text
                    style={{ fontSize: 10, fontWeight: "700", color: "#fff" }}
                  >
                    {journey.photoUris?.length}
                  </Text>
                </View>
              ) : null}
            </View>
          </View>
        </View>
      </AppCard>
    </Press>
  );
}

function JourneyParticipants({
  theme,
  journey,
  onInvite,
  inviteAccessibilityLabel = "Invite companions",
}: {
  theme: Theme;
  journey: Poi;
  onInvite?: () => void;
  inviteAccessibilityLabel?: string;
}) {
  const people = orderCompanionsForDisplay(journey.companionList || []).slice(0, 2);
  const size = 24;
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        height: 28,
        marginTop: space.xs,
      }}
    >
      {people.map((person, index) => (
        <View
          key={`${person.id || person.ini}-${index}`}
          style={{ marginLeft: index ? -7 : 0, zIndex: people.length - index }}
        >
          <ParticipantAvatar
            theme={theme}
            uri={person.avatarUrl}
            size={size}
            backgroundColor={theme.groupedBg}
            ring
            ringColor={theme.fieldSurface}
            ringWidth={2}
          />
        </View>
      ))}
      {onInvite ? (
        <Press
          onPress={(event) => {
            event.stopPropagation();
            onInvite();
          }}
          accessibilityRole="button"
          accessibilityLabel={inviteAccessibilityLabel}
          hitSlop={6}
          style={{
            width: size,
            height: size,
            marginLeft: people.length ? -7 : 0,
            borderRadius: size / 2,
            borderWidth: 1.5,
            borderColor: theme.fieldBorder,
            backgroundColor: theme.controlSurface,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Icon name="plus" color={theme.text2} size={14} strokeWidth={2.1} />
        </Press>
      ) : null}
    </View>
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
  const regionCount = new Set(
    routes.map((route) => route.region).filter(Boolean),
  ).size;
  const photoCount = routes.reduce(
    (sum, route) => sum + (route.photoUris?.length || 0),
    0,
  );
  const photoPreviewUris = routes
    .flatMap((route) => route.photoUris || [])
    .slice(0, 2);

  return (
    <MapCollectionPage
      theme={theme}
      title={t("me.myFavorites")}
      points={routes}
      onBack={onBack}
      onPointPress={onOpenRoute}
    >
      <View
        style={{
          minHeight: 500,
          paddingHorizontal: layout.pagePadding,
          paddingBottom: space.xxxl,
        }}
      >
        <View
          style={{
            marginTop: space.lg,
            flexDirection: "row",
            flexWrap: "wrap",
            gap: space.sm,
          }}
        >
          <JourneyOverviewTile
            theme={theme}
            icon="pin"
            value={String(routes.length)}
            label={t("me.metricRoutes")}
          />
          <JourneyOverviewTile
            theme={theme}
            icon="distance"
            value={totalKm.toFixed(1)}
            label={t("me.metricDistance")}
          />
          <JourneyOverviewTile
            theme={theme}
            icon="photo"
            value={String(photoCount)}
            label={t("me.metricRoutePhotos")}
            previewUris={photoPreviewUris}
          />
          <JourneyOverviewTile
            theme={theme}
            icon="globe"
            value={String(regionCount)}
            label={t("me.metricRegions")}
          />
        </View>

        {routes.length ? (
          <View style={{ gap: space.md }}>
            <AppSectionHeader
              theme={theme}
              text={t("me.savedRouteList")}
              marginTop={layout.sectionGap}
              variant="title"
            />
            {routes.map((route) => (
              <JourneyRecordCard
                key={route.id}
                theme={theme}
                journey={route}
                onPress={() => onOpenRoute(route)}
              />
            ))}
          </View>
        ) : (
          <View
            style={{
              alignItems: "center",
              paddingHorizontal: space.xl,
              paddingVertical: space.xxxl,
              marginTop: space.xl,
            }}
          >
            <Text
              style={[
                type.sectionTitle,
                { color: theme.text, textAlign: "center" },
              ]}
            >
              {t("me.favoritesEmptyTitle")}
            </Text>
            <Text
              style={[
                type.body,
                {
                  color: theme.text2,
                  lineHeight: 20,
                  textAlign: "center",
                  marginTop: space.xs,
                },
              ]}
            >
              {t("me.favoritesEmptyBody")}
            </Text>
          </View>
        )}
      </View>
    </MapCollectionPage>
  );
}

function FootprintsPage({
  theme,
  footprints,
  journeys,
  onBack,
  onOpenJourney,
  onOpenRoute,
  onAllJourneys,
}: {
  theme: Theme;
  footprints: RouteFootprints;
  journeys: Poi[];
  onBack: () => void;
  onOpenJourney: (journey: Poi) => void;
  onOpenRoute: (route: Poi) => void;
  onAllJourneys: () => void;
}) {
  const { t } = useI18n();
  const { items, litItems, litCount } = footprints;
  // Every catalog route is a map pin, so these must keep their identity across
  // renders: a new array rebuilds every marker and refits the camera.
  const map = useMemo(
    () => ({
      points: items.map((item) => item.route),
      mutedIds: new Set(
        items.filter((item) => !item.lit).map((item) => item.route.id),
      ),
      // Frame what the user has walked; with nothing lit yet, the whole catalog.
      // Same coordinate source as the markers, minus the (0,0) placeholders: a
      // single zero point would stretch the fit box to the Gulf of Guinea and
      // drop the camera on Africa.
      frameCoords: (litItems.length ? litItems : items)
        .map((item) => mapCoordinate(item.route))
        .filter(
          ([lng, lat]) =>
            Number.isFinite(lng) && Number.isFinite(lat) && (lng !== 0 || lat !== 0),
        ),
      coverUriById: Object.fromEntries(
        litItems.map((item) => [item.route.id, item.journey?.photoUris?.[0]]),
      ),
    }),
    [items, litItems],
  );
  // Distance and photos still sum every journey, as this entry always did.
  const totalKm = journeys.reduce((sum, journey) => {
    const distance = Number.parseFloat(journey.dist);
    return sum + (Number.isFinite(distance) ? distance : 0);
  }, 0);
  const photoCount = journeys.reduce(
    (sum, journey) => sum + (journey.photoUris?.length || 0),
    0,
  );
  const photoPreviewUris = journeys
    .flatMap((journey) => journey.photoUris || [])
    .slice(0, 2);

  return (
    <MapCollectionPage
      theme={theme}
      title={t("me.myFootprints")}
      summary={
        litCount
          ? t("me.footprintSummary", { count: litCount })
          : t("me.footprintSummaryEmpty")
      }
      points={map.points}
      mutedIds={map.mutedIds}
      frameCoords={map.frameCoords}
      coverUriById={map.coverUriById}
      staggerPins
      onBack={onBack}
      onPointPress={(route) => {
        const item = items.find((entry) => entry.route.id === route.id);
        if (item?.journey) onOpenJourney(item.journey);
        else onOpenRoute(route);
      }}
      primaryAction={{ label: t("me.allJourneys"), onPress: onAllJourneys }}
    >
      <View
        style={{
          minHeight: 500,
          paddingHorizontal: layout.pagePadding,
          paddingBottom: space.xxxl,
        }}
      >
        <View
          style={{
            marginTop: space.lg,
            flexDirection: "row",
            flexWrap: "wrap",
            gap: space.sm,
          }}
        >
          <JourneyOverviewTile
            theme={theme}
            icon="mountain"
            value={String(litCount)}
            label={t("me.metricRoutes")}
          />
          <JourneyOverviewTile
            theme={theme}
            icon="distance"
            value={totalKm.toFixed(1)}
            label={t("me.metricDistance")}
          />
          <JourneyOverviewTile
            theme={theme}
            icon="photo"
            value={String(photoCount)}
            label={t("me.metricPhotos")}
            previewUris={photoPreviewUris}
          />
          <JourneyOverviewTile
            theme={theme}
            icon="globe"
            value={String(footprints.provinces.length)}
            label={t("me.metricRegions")}
          />
        </View>

        <AppSectionHeader
          theme={theme}
          text={t("me.footprintLitList")}
          marginTop={layout.sectionGap}
          variant="title"
        />
        {litItems.length ? (
          <View style={{ gap: space.md }}>
            {litItems.map(({ journey }) =>
              journey ? (
                <JourneyRecordCard
                  key={journey.id}
                  theme={theme}
                  journey={journey}
                  onPress={() => onOpenJourney(journey)}
                />
              ) : null,
            )}
          </View>
        ) : (
          <View style={{ alignItems: "center", paddingVertical: space.xxxl }}>
            <Text
              style={[
                type.sectionTitle,
                { color: theme.text, textAlign: "center" },
              ]}
            >
              {t("me.footprintEmptyTitle")}
            </Text>
            <Text
              style={[
                type.body,
                { color: theme.text2, textAlign: "center", marginTop: space.xs },
              ]}
            >
              {t("me.footprintEmptyBody")}
            </Text>
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
  onInviteJourney,
  onCreateJourney,
  onDeleteJourney,
  onLeaveJourney,
}: {
  theme: Theme;
  journeys: Poi[];
  onBack: () => void;
  onOpenJourney: (journey: Poi) => void;
  onInviteJourney: (journey: Poi) => void;
  onCreateJourney: () => void;
  onDeleteJourney: (journey: Poi) => Promise<void>;
  onLeaveJourney: (journey: Poi) => Promise<void>;
}) {
  const { t } = useI18n();
  const [deleteCandidate, setDeleteCandidate] = useState<Poi | null>(null);
  const [deletingId, setDeletingId] = useState<string>();
  const pendingSwipeCloseRef = useRef<(() => void) | null>(null);
  const totalKm = journeys.reduce((sum, journey) => {
    const distance = Number.parseFloat(journey.dist);
    return sum + (Number.isFinite(distance) ? distance : 0);
  }, 0);
  const photoCount = journeys.reduce(
    (sum, journey) => sum + (journey.photoUris?.length || 0),
    0,
  );
  const photoPreviewUris = journeys
    .flatMap((journey) => journey.photoUris || [])
    .slice(0, 2);
  const regionCount = new Set(
    journeys.map((journey) => journey.region).filter(Boolean),
  ).size;

  return (
    <>
      <MapCollectionPage
        theme={theme}
        title={t("me.myJourneys")}
        points={journeys}
        onBack={onBack}
        onPointPress={onOpenJourney}
        primaryAction={{
          label: t("journeyEdit.planner.create"),
          onPress: onCreateJourney,
        }}
      >
        <View
          style={{
            minHeight: 500,
            paddingHorizontal: layout.pagePadding,
            paddingBottom: space.xxxl,
          }}
        >
          <View
            style={{
              marginTop: space.lg,
              flexDirection: "row",
              flexWrap: "wrap",
              gap: space.sm,
            }}
          >
            <JourneyOverviewTile
              theme={theme}
              icon="luggage"
              value={String(journeys.length)}
              label={t("me.metricJourneys")}
            />
            <JourneyOverviewTile
              theme={theme}
              icon="distance"
              value={totalKm.toFixed(1)}
              label={t("me.metricDistance")}
            />
            <JourneyOverviewTile
              theme={theme}
              icon="photo"
              value={String(photoCount)}
              label={t("me.metricPhotos")}
              previewUris={photoPreviewUris}
            />
            <JourneyOverviewTile
              theme={theme}
              icon="globe"
              value={String(regionCount)}
              label={t("me.metricRegions")}
            />
          </View>

          {journeys.length ? (
            <View style={{ gap: space.md }}>
              <AppSectionHeader
                theme={theme}
                text={t("me.journeyList")}
                marginTop={layout.sectionGap}
                variant="title"
              />
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
                  containerStyle={{
                    borderRadius: radius.feature,
                    overflow: "hidden",
                    backgroundColor: theme.featureSurface,
                  }}
                  renderRightActions={(progress, _translation, methods) => (
                    <JourneySwipeDeleteAction
                      progress={progress}
                      theme={theme}
                      variant={journey.mine === false ? "leave" : "delete"}
                      label={t(
                        journey.mine === false
                          ? "journey.manage.leaveAction"
                          : "journey.settings.deleteJourney",
                      )}
                      onPress={() => {
                        methods.close();
                        setDeleteCandidate(journey);
                      }}
                    />
                  )}
                >
                  <JourneyRecordCard
                    theme={theme}
                    journey={journey}
                    onPress={() => onOpenJourney(journey)}
                    onInvite={() => onInviteJourney(journey)}
                    inviteAccessibilityLabel={t(
                      "journey.manage.inviteParticipant",
                    )}
                  />
                </TwoStageSwipeable>
              ))}
            </View>
          ) : (
            <View
              style={{
                alignItems: "center",
                paddingHorizontal: space.xl,
                paddingVertical: space.xxxl,
                marginTop: space.xl,
              }}
            >
              <Text
                style={[
                  type.sectionTitle,
                  { color: theme.text, textAlign: "center" },
                ]}
              >
                {t("me.journeysEmptyTitle")}
              </Text>
              <Text
                style={[
                  type.body,
                  {
                    color: theme.text2,
                    lineHeight: 20,
                    textAlign: "center",
                    marginTop: space.xs,
                  },
                ]}
              >
                {t("me.journeysEmptyBody")}
              </Text>
            </View>
          )}
        </View>
      </MapCollectionPage>

      <AppActionDialog
        theme={theme}
        visible={Boolean(deleteCandidate)}
        title={t(
          deleteCandidate?.mine === false
            ? "journey.manage.leaveTitle"
            : "journey.settings.deleteConfirmTitle",
        )}
        message={t(
          deleteCandidate?.mine === false
            ? "journey.manage.leaveBody"
            : "journey.remove.confirmMessage",
        )}
        confirmLabel={t(
          deleteCandidate?.mine === false
            ? "journey.manage.leaveAction"
            : "journey.settings.deleteJourney",
        )}
        cancelLabel={t("common.cancel")}
        destructive
        confirming={deletingId === deleteCandidate?.id}
        confirmIcon={deleteCandidate?.mine === false ? undefined : "trash"}
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
          void (candidate.mine === false ? onLeaveJourney(candidate) : onDeleteJourney(candidate)).finally(() => {
            setDeletingId(undefined);
            setDeleteCandidate(null);
          });
        }}
      />
    </>
  );
}

function MeScreenView({ theme: baseTheme }: { theme: Theme }) {
  countRender("Me");
  const theme = makeMeTheme(baseTheme);
  const insets = useSafeAreaInsets();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const { mode, accent, setMode, setAccent } = useAppearance();
  const { t, lang, setLang } = useI18n();
  const nav = useNav();
  const data = useData();
  const footprints = useMemo(
    () => buildRouteFootprints(data.routes, data.journeys),
    [data.routes, data.journeys],
  );
  const myRouteGuides = useMyRouteGuides(data.userId);
  const myComments = useMyRouteComments(data.userId);
  // 自己发过顶层评论的路线，时间线上就不再提示写评论。
  const commentedRoutes = useMemo(() => new Set(myComments.comments.map((comment) => comment.routeId)), [myComments.comments]);
  const { unread } = useNotifCenter();

  const profile: MeProfile = {
    nick: data.profile.nick,
    username: data.profile.username ? `@${data.profile.username}` : "",
    bio: data.profile.bio,
    phone: data.profile.phone,
    email: data.profile.email,
  };
  const [notif, setNotif] = useState<NotifSettings>({
    push: true,
    social: true,
    system: false,
  });

  const [stack, setStack] = useState<MePage[]>([]);
  const push = (pg: MePage) => setStack((s) => [...s, pg]);
  const pop = () => setStack((s) => s.slice(0, -1));
  useEffect(() => {
    if (!nav.membershipPageRequest) return;
    setStack([{ type: "membership" }]);
    nav.clearMembershipPageRequest();
  }, [nav.membershipPageRequest]);
  useEffect(() => {
    if (!nav.trackPageRequest) return;
    // Under the library, so 返回 lands on 我的轨迹 rather than the root. It
    // mounts already in place: a slide-in started under the detail could stop
    // off-screen, leaving an invisible page that kept the tab bar hidden.
    setStack([{ type: "tracks", underDetail: true }, { type: "trackDetail", trackId: nav.trackPageRequest }]);
    nav.clearTrackPageRequest();
  }, [nav.trackPageRequest]);
  const [appearancePopup, setAppearancePopup] =
    useState<AppearancePopup | null>(null);
  const [settingsDrawerOpen, setSettingsDrawerOpen] = useState(false);
  const profileSummary = useProfileSummary(data.userId, data.userId);
  const profileOutings = useProfileOutings(data.userId, data.userId);
  const [outingImportFiles, setOutingImportFiles] = useState<TrackFile[] | null>(null);
  const startOutingImport = async () => {
    try {
      const files = await pickTrackFiles();
      if (!files) return;
      if (!files.length) {
        nav.showToast(t("record.track.errFormat"));
        return;
      }
      setOutingImportFiles(files);
    } catch (error) {
      console.warn("[MeScreen] track picker failed:", error);
      nav.showToast(t("record.track.errParse"));
    }
  };
  const [profileTab, setProfileTab] = useState<"overview" | "timeline" | "photos">("overview");
  // 从粉丝、关注、别人主页回来时，关注数可能变了。
  const socialOpen = nav.socialStack.length > 0;
  const refreshSummary = profileSummary.refresh;
  // 私密账号：本地先按下开关，服务端没写成功再退回原值。
  const [privateDraft, setPrivateDraft] = useState<boolean | null>(null);
  const isPrivateAccount = privateDraft ?? Boolean(profileSummary.summary?.isPrivate);
  const togglePrivateAccount = async (next: boolean) => {
    if (privateDraft !== null) return;
    setPrivateDraft(next);
    try {
      await setAccountPrivate(next);
      await refreshSummary();
      setPrivateDraft(null);
    } catch {
      setPrivateDraft(null);
      nav.showToast(t("profile.actionFailed"));
    }
  };
  const socialWasOpen = useRef(false);
  useEffect(() => {
    if (socialWasOpen.current && !socialOpen) void refreshSummary();
    socialWasOpen.current = socialOpen;
  }, [socialOpen, refreshSummary]);
  const [highlightedOuting, setHighlightedOuting] = useState<string | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const panelY = useRef(0);
  const entryY = useRef<Record<string, number>>({});
  const jumpTarget = useRef<string | null>(null);
  // 照片标签点组标题：切到时间线，等那一条排好版再滚过去并闪一下。
  const tryJump = () => {
    const id = jumpTarget.current;
    if (!id || entryY.current[id] == null) return;
    jumpTarget.current = null;
    scrollRef.current?.scrollTo({ y: Math.max(0, panelY.current + entryY.current[id] - 52), animated: true });
    setHighlightedOuting(id);
  };
  useEffect(() => {
    if (!highlightedOuting) return;
    const timer = setTimeout(() => setHighlightedOuting(null), 1600);
    return () => clearTimeout(timer);
  }, [highlightedOuting]);
  // 旅程或轨迹有变化（完成旅程、录完轨迹、删除）时重取时间线；首次挂载由 hook 自己取。
  const outingsSeeded = useRef(false);
  const refreshOutings = profileOutings.refresh;
  useEffect(() => {
    if (!outingsSeeded.current) {
      outingsSeeded.current = true;
      return;
    }
    void refreshOutings();
  }, [data.journeys, data.tracks, refreshOutings]);
  const reviewPromptFor = (outing: Outing) => {
    if (!outing.routeId || myComments.loading || commentedRoutes.has(outing.routeId)) return undefined;
    const route = data.routes.find((candidate) => candidate.id === outing.routeId);
    if (!route) return undefined;
    return {
      route: outing.routeName ?? route.name,
      onWrite: () => nav.openRouteGuide({ route, view: "comments", compose: true }),
    };
  };
  const changeOutingVisibility = (outing: Outing) => {
    openVisibilityPicker(nav, t, outing.visibility, async (visibility: Visibility) => {
      try {
        // 走 DataContext 同步本地旅程或轨迹；上面的 effect 随之重取时间线。
        if (outing.journeyId) await data.setJourneyVisibility(outing.journeyId, visibility);
        else if (outing.trackId) await data.setTrackVisibility(outing.trackId, visibility);
        nav.showToast(t("profile.visibilitySaved"));
      } catch {
        nav.showToast(t("profile.actionFailed"));
      }
    });
  };
  const yearDistance = useMemo(() => {
    const year = new Date().getFullYear();
    const months = Array.from({ length: 12 }, () => 0);
    for (const track of data.tracks) {
      const date = track.startedAt ? new Date(track.startedAt) : null;
      if (date && date.getFullYear() === year) months[date.getMonth()] += track.distM ?? 0;
    }
    return { year, months };
  }, [data.tracks]);
  const drawerProgress = useSharedValue(0);
  useEffect(() => {
    drawerProgress.value = withTiming(settingsDrawerOpen ? 1 : 0, {
      duration: motion.emphasized,
      easing: Easing.bezier(0.16, 1, 0.3, 1),
    });
  }, [settingsDrawerOpen, drawerProgress]);
  const drawerFadeStyle = useAnimatedStyle(() => ({
    opacity: drawerProgress.value,
  }));
  const drawerPanelStyle = useAnimatedStyle(() => ({
    transform: [
      {
        translateX: interpolate(
          drawerProgress.value,
          [0, 1],
          [windowWidth * 0.8, 0],
        ),
      },
    ],
  }));
  // Keep the drawer mounted under the pushed pages so returning from a page
  // shows it still open, without a close/re-open flash. Android back closes it
  // only when no sub-page is on top.
  useEffect(() => {
    if (!settingsDrawerOpen) return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (stack.length > 0) return false;
      setSettingsDrawerOpen(false);
      return true;
    });
    return () => sub.remove();
  }, [settingsDrawerOpen, stack.length]);
  const [popupAnchor, setPopupAnchor] = useState<PopupAnchor | null>(null);
  const themeRowRef = useRef<View>(null);
  const accentRowRef = useRef<View>(null);
  const languageRowRef = useRef<View>(null);
  const appearanceProgress = useSharedValue(0);

  // Hide the floating tab bar whenever a sub-page is pushed or the settings
  // drawer is open (the drawer is an in-tree overlay, below the tab bar layer).
  const setTabBarHidden = nav.setTabBarHidden;
  useEffect(() => {
    setTabBarHidden("me", stack.length > 0 || settingsDrawerOpen);
  }, [setTabBarHidden, stack.length, settingsDrawerOpen]);
  useEffect(() => () => setTabBarHidden("me", false), [setTabBarHidden]);

  const showToast = nav.showToast;
  const saveEdit = async (field: MeEditField, val: string) => {
    try {
      if (field.key) {
        const dbKey = field.key === "username" ? "username" : field.key;
        const dbVal = field.key === "username" ? val.replace(/^@/, "") : val;
        await data.updateProfile(dbKey, dbVal);
      }
      pop();
      showToast(field.toast || t("common.saved"));
    } catch {
      showToast(t("account.security.toastSaveFailed"));
    }
  };

  const openNotificationTarget = (item: Notif) => {
    void openNotificationTargetById(item.targetId, {
      nav,
      journeys: data.journeys,
      routes: data.routes,
      kind: item.kind,
    }).then((ok) => {
      if (!ok) showToast(t("account.inbox.toastTargetUnavailable"));
    });
  };

  const themeModes: { id: "system" | "light" | "dark"; label: string }[] = [
    { id: "system", label: t("me.themeSystem") },
    { id: "light", label: t("me.themeLight") },
    { id: "dark", label: t("me.themeDark") },
  ];
  const langs: { id: Lang; label: string }[] = [
    { id: "system", label: t("me.langSystem") },
    { id: "zh", label: t("me.langZh") },
    { id: "en", label: t("me.langEn") },
  ];
  const modeLabel =
    themeModes.find((item) => item.id === mode)?.label || themeModes[0].label;
  const langLabel =
    langs.find((item) => item.id === lang)?.label || langs[0].label;
  // Accent preset display names are translated by their stable id (theme.ts
  // keeps the Chinese name only as a fallback label).
  const accentLabel = (id: string) => t(`accent.${id}` as TKey);
  const curAccent = accent || "#0A84FF";
  const curPreset = ACCENT_PRESETS.find(
    (p) => p.color.toLowerCase() === curAccent.toLowerCase(),
  );
  const accentName = curPreset ? accentLabel(curPreset.id) : t("common.custom");
  const openAppearancePopup = (
    popup: AppearancePopup,
    ref: React.RefObject<View | null>,
  ) => {
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

  const favoriteRoutes = data.routes.filter((route) => route.fav).length;
  const savedRoutes = data.routes.filter((route) => route.fav);
  const gearWeight = data.items.reduce((sum, item) => sum + itemWeight(item), 0);
  const gearValue = data.items.reduce((sum, item) => sum + itemPrice(item), 0);
  const gearSets = data.sets.map((set) => {
    let weight = 0;
    let price = 0;
    for (const itemName of set.items) {
      const item = data.items.find((candidate) => candidate.name === itemName);
      if (!item) continue;
      const override = item.id != null ? (set.overrides?.[String(item.id)] ?? set.overrides?.[itemName]) : set.overrides?.[itemName];
      const qty = override?.qty ?? item.qty ?? 1;
      weight += item.w * qty;
      price += (item.p || 0) * qty;
    }
    const weightLabel = fmtWeight(weight, data.profile.gearWeightUnit || "kg", true);
    return {
      id: set.id,
      name: set.name,
      detail: price > 0 ? `${weightLabel}　${yuanWithGap(price)}` : `${t("profile.gearSetItems", { count: set.items.length })}　${weightLabel}`,
    };
  });
  const overviewTiles: OverviewTile[] = [
    { key: "tracks", icon: "tracks", label: t("me.myTracks"), count: data.tracks.length, onPress: () => push({ type: "tracks" }) },
    { key: "footprints", icon: "footprints", label: t("me.myFootprints"), count: footprints.litCount, onPress: () => push({ type: "footprints" }) },
    { key: "favorites", icon: "favorites", label: t("me.myFavorites"), count: favoriteRoutes, onPress: () => push({ type: "favorites" }) },
    { key: "contributions", icon: "contributions", label: t("profile.myContributions"), count: myRouteGuides.guides.length + myComments.comments.length + data.routeRequests.length, onPress: () => push({ type: "contributions" }) },
  ];
  const openOuting = (outing: Outing) => {
    const journey = outing.journeyId ? data.journeys.find((item) => item.id === outing.journeyId) : undefined;
    if (journey) nav.openPoint(journey);
    else if (outing.trackId) push({ type: "trackDetail", trackId: outing.trackId });
  };
  const jumpToOuting = (outingId: string) => {
    jumpTarget.current = outingId;
    setProfileTab("timeline");
    tryJump();
  };
  const renderPage = (pg: MePage) => {
    const theme =
      pg.type === "membership"
        ? makeMeTheme(baseTheme)
        : baseTheme;
    switch (pg.type) {
      case "membership":
        return (
          <MembershipPage
            theme={theme}
            onBack={pop}
            view={pg.view}
          />
        );
      case "scanLogin":
        return (
          <QrLoginScannerPage
            theme={theme}
            onBack={pop}
            onApproved={() => {
              pop();
              showToast(t("qrLogin.approvedToast"));
            }}
            onJourneyInvite={async (invite) => {
              const result = await joinJourneyByCode(invite.code);
              if (!result.journeyId || (result.status !== 'joined' && result.status !== 'already_joined')) throw new Error(result.status);
              const journey = await fetchJourneyPoiById(result.journeyId);
              await data.refetchJourneys();
              pop();
              nav.openPoint(journey);
              showToast(t("qrLogin.journeyJoined", { name: journey.name }));
            }}
          />
        );
      case "journeys":
        return (
          <JourneysPage
            theme={theme}
            journeys={data.journeys}
            onBack={pop}
            onCreateJourney={() => nav.openNewJourney()}
            onDeleteJourney={(journey) => data.deleteJourney(journey.id)}
            onLeaveJourney={async (journey) => {
              await data.leaveJourney(journey.id);
              await data.refetchJourneys();
            }}
            onInviteJourney={(journey) =>
              nav.openManageCompanions(journey, "invite")
            }
            onOpenJourney={(journey) => {
              nav.openPoint(journey);
            }}
          />
        );
      case "footprints":
        return (
          <FootprintsPage
            theme={theme}
            footprints={footprints}
            journeys={data.journeys}
            onBack={pop}
            onOpenJourney={(journey) => {
              nav.openPoint(journey);
            }}
            onOpenRoute={(route) => {
              nav.openPoint(route);
            }}
            onAllJourneys={() => push({ type: "journeys" })}
          />
        );
      case "favorites":
        return (
          <FavoritesPage
            theme={theme}
            routes={savedRoutes}
            onBack={pop}
            onOpenRoute={(route) => {
              nav.openPoint(route);
            }}
          />
        );
      case "contributions":
        return (
          <ContributionsPage
            theme={theme}
            guides={myRouteGuides.guides}
            comments={myComments.comments}
            requests={data.routeRequests}
            routes={data.routes}
            loading={myRouteGuides.loading || myComments.loading || data.routeRequestsLoading}
            onBack={pop}
            onOpenGuides={() => push({ type: "routeGuides" })}
            onOpenRequests={() => push({ type: "routeRequests" })}
            onOpenComment={(comment) => {
              const route = data.routes.find((candidate) => candidate.id === comment.routeId);
              if (route) nav.openRouteGuide({ route, view: "comments" });
              else showToast(t("profile.contribRouteGone"));
            }}
          />
        );
      case "routeGuides":
        return (
          <MyRouteGuidesPage
            theme={theme}
            showToast={showToast}
            guides={myRouteGuides.guides}
            loading={myRouteGuides.loading}
            onBack={pop}
            onRefresh={() => void myRouteGuides.refresh()}
            routes={new Map(data.routes.map((route) => [route.id, route]))}
            onOpen={(guide) => {
              if (guide.status !== "approved") {
                showToast(
                  guide.status === "rejected"
                    ? "请从原旅程修改后重新提交攻略"
                    : "攻略正在审核中",
                );
                return;
              }
              const route = data.routes.find(
                (candidate) => candidate.id === guide.routeId,
              );
              if (route) {
                pop();
                nav.openRouteGuide({ route, view: "guide", guideId: guide.id });
              } else showToast("关联路线暂不可用");
            }}
            onUpdate={async (guide, values) => {
              await updateRouteGuide({ id: guide.id, ...values });
              await myRouteGuides.refresh();
              showToast("攻略已保存，等待重新审核");
            }}
            onDelete={async (guide) => {
              await deleteRouteGuide(guide.id);
              await myRouteGuides.refresh();
              showToast("攻略已删除");
            }}
          />
        );
      case "routeRequests":
        return (
          <MyRouteRequestsPage
            theme={theme}
            requests={data.routeRequests}
            loading={data.routeRequestsLoading}
            onBack={pop}
            onRefresh={() => void data.refetchRouteRequests()}
            onDelete={async (request) => {
              try {
                await data.deleteRouteRequest(request.id);
                const urls = (request.attachments || []).map((a) => a.url);
                if (urls.length) void removeMedia(urls).catch(() => {});
                showToast(t("routeRequest.delete"));
              } catch {
                showToast(t("routeRequest.deleteFailed"));
              }
            }}
            onOpen={(request) => {
              const route = data.routes.find(
                (item) => item.id === request.routeId,
              );
              if (route) {
                pop();
                nav.openPoint(route);
              } else showToast(t("routeRequest.routeUnavailable"));
            }}
          />
        );
      case "tracks":
        return (
          <TracksPage
            theme={theme}
            entryVariant={pg.underDetail ? "none" : undefined}
            onBack={pop}
            onOpenTrack={(track) =>
              push({ type: "trackDetail", trackId: track.id })
            }
          />
        );
      case "trackDetail": {
        const track = data.tracks.find((item) => item.id === pg.trackId);
        // A track can disappear (deleted on another device) between the list and
        // here, and a blank layer would trap the user, so say so with a way back.
        if (!track) {
          return (
            <DetailPage
              theme={theme}
              onBack={pop}
              backgroundColor={theme.groupedBg}
              flatChrome
            >
              <KPState
                theme={theme}
                icon="route"
                title={t("tracks.empty.title")}
                body={t("tracks.empty.body")}
                style={{ marginTop: 60 }}
              />
            </DetailPage>
          );
        }
        return <TrackDetailPage theme={theme} track={track} onBack={pop} />;
      }
      case "trash":
        return <JourneyTrashPage theme={theme} onBack={pop} />;
      case "profile":
        return (
          <AccountPage
            theme={theme}
            profile={profile}
            section="profile"
            onBack={pop}
            onEdit={(f) => push({ type: "edit", field: f })}
            onDeleteAccount={() => push({ type: "deleteAccountReasons" })}
            showToast={showToast}
          />
        );
      case "accountSecurity":
        return (
          <AccountPage
            theme={theme}
            profile={profile}
            section="security"
            onBack={pop}
            onEdit={(f) => push({ type: "edit", field: f })}
            onDeleteAccount={() => push({ type: "deleteAccountReasons" })}
            onOpenLoginMethod={(kind) => push({ type: "loginMethod", kind })}
            isPrivateAccount={isPrivateAccount}
            onTogglePrivateAccount={(next) => { void togglePrivateAccount(next); }}
            showToast={showToast}
          />
        );
      case "loginMethod":
        return (
          <LoginMethodPage
            theme={theme}
            kind={pg.kind}
            onBack={pop}
            onDone={(message) => {
              pop();
              showToast(message);
            }}
            showToast={showToast}
          />
        );
      case "deleteAccountReasons":
        return <DeleteAccountReasonsPage theme={theme} onBack={pop} />;
      case "planningProfile":
        return <PlanningProfilePage theme={theme} onBack={pop} />;
      case "edit":
        return (
          <EditFieldPage
            theme={theme}
            field={pg.field}
            onBack={pop}
            onSave={(v) => saveEdit(pg.field, v)}
          />
        );
      case "notif":
        return (
          <NotifSettingsPage
            theme={theme}
            notif={notif}
            setNotif={setNotif}
            onBack={pop}
          />
        );
      case "inbox":
        return (
          <NotifInboxPage
            theme={theme}
            onBack={pop}
            showToast={showToast}
            onOpenTarget={openNotificationTarget}
          />
        );
      case "feedback":
        return (
          <FeedbackPage
            theme={theme}
            onBack={pop}
            onSubmit={() => {
              pop();
              showToast(t("me.feedbackThanks"));
            }}
          />
        );
      case "about":
        return (
          <AboutPage
            theme={theme}
            onBack={pop}
            onOpenDocument={(document) =>
              push({ type: "legalDocument", document })
            }
            showToast={showToast}
          />
        );
      case "picker": {
        const picker = pg.picker;
        if (picker === "language") {
          return (
            <LanguagePickerPage
              theme={theme}
              lang={lang}
              t={t}
              onSelect={(next) => setLang(next)}
              onBack={pop}
            />
          );
        }
        if (picker === "weight") {
          const currentUnit = data.profile.gearWeightUnit || "kg";
          return (
            <CardPickerPage
              theme={theme}
              navTitle={t("me.gearWeightUnit")}
              options={WEIGHT_UNITS.map((unit) => ({
                id: unit,
                title: unit,
                description: t("me.gearWeightUnitDesc", { unit }),
              }))}
              selectedId={currentUnit}
              onSelect={(key) => {
                const unit = key as WeightUnit;
                if (unit === currentUnit) return;
                void data.updateProfileOffline("gearWeightUnit", unit);
              }}
              onBack={pop}
            />
          );
        }
        const navTitle =
          picker === "theme" ? t("me.theme") : t("me.accent");
        const options: CardPickerOption[] =
          picker === "theme"
            ? themeModes.map((item) => ({
                id: item.id,
                title:
                  item.id === "system"
                    ? t("me.themeSystemDefault")
                    : item.label,
                description: t(
                  item.id === "system"
                    ? "me.themeSystemDesc"
                    : item.id === "light"
                      ? "me.themeLightDesc"
                      : "me.themeDarkDesc"
                ),
              }))
            : ACCENT_PRESETS.map((preset) => ({
                id: preset.id,
                title: accentLabel(preset.id),
                description: t("me.accentDesc"),
                leading: (
                  <ColorDot theme={theme} color={preset.color} size={26} />
                ),
              }));
        const selectedId =
          picker === "theme"
            ? mode
            : ACCENT_PRESETS.find(
                (p) => p.color.toLowerCase() === curAccent.toLowerCase(),
              )?.id ?? "";
        return (
          <CardPickerPage
            theme={theme}
            navTitle={navTitle}
            options={options}
            selectedId={selectedId}
            onSelect={(key) => {
              if (picker === "theme") {
                setMode(key as "system" | "light" | "dark");
              } else {
                const preset = ACCENT_PRESETS.find((p) => p.id === key);
                if (preset) setAccent(preset.color);
              }
            }}
            onBack={pop}
          />
        );
      }
      case "legalDocument":
        return (
          <LegalDocumentPage
            theme={theme}
            document={pg.document}
            onBack={pop}
          />
        );
    }
  };
  const popupWidth = Math.min(260, windowWidth - space.xl * 2);
  const popupHeight =
    appearancePopup === "accent"
      ? ACCENT_PRESETS.length * layout.menuRowHeight + space.xs * 2
      : 3 * layout.menuRowHeight + space.xs * 2;
  const popupCollapsedHeight = 16;
  const popupLeft = popupAnchor
    ? Math.max(
        space.xl,
        Math.min(
          popupAnchor.x + popupAnchor.width - popupWidth,
          windowWidth - popupWidth - space.xl,
        ),
      )
    : space.xl;
  const popupTop = popupAnchor
    ? Math.max(
        insets.top + space.xs,
        Math.min(
          popupAnchor.y + popupAnchor.height + space.xs,
          windowHeight - insets.bottom - popupHeight - space.md,
        ),
      )
    : insets.top + space.xl;
  const popupMenuStyle = useAnimatedStyle(() => ({
    height: interpolate(
      appearanceProgress.value,
      [0, 1],
      [popupCollapsedHeight, popupHeight],
    ),
  }));
  const popupContentStyle = useAnimatedStyle(() => ({
    opacity: appearanceProgress.value,
    transform: [
      { translateY: interpolate(appearanceProgress.value, [0, 1], [-8, 0]) },
    ],
  }));

  type MeDrawerItem = {
    key: string;
    icon?: IconName;
    dot?: boolean;
    label: string;
    value?: string;
    go?: () => void;
  };
  const drawerItems: MeDrawerItem[] = [
    { key: "account", icon: "userCircle", label: t("account.security.pageTitle"), go: () => push({ type: "accountSecurity" }) },
    { key: "planning", icon: "user", label: t("planningProfile.title"), go: () => push({ type: "planningProfile" }) },
    { key: "requests", icon: "route", label: t("routeRequest.drawerTitle"), go: () => push({ type: "routeRequests" }) },
    { key: "trash", icon: "trash", label: t("journeyHome.trash.title"), go: () => push({ type: "trash" }) },
    { key: "notif", icon: "bell", label: t("me.notifications"), value: notif.push ? t("common.on") : t("common.off"), go: () => push({ type: "notif" }) },
    { key: "theme", icon: mode === "dark" ? "moon" : mode === "light" ? "sun" : "system", label: t("me.theme"), value: modeLabel, go: () => push({ type: "picker", picker: "theme" }) },
    { key: "accent", dot: true, label: t("me.accent"), value: accentName, go: () => push({ type: "picker", picker: "accent" }) },
    { key: "language", icon: "globe", label: t("me.language"), value: langLabel, go: () => push({ type: "picker", picker: "language" }) },
    { key: "weight", icon: "gearSettings", label: t("me.gearWeightUnit"), value: data.profile.gearWeightUnit || "kg", go: () => push({ type: "picker", picker: "weight" }) },
    { key: "feedback", icon: "send", label: t("me.helpFeedback"), go: () => push({ type: "feedback" }) },
    { key: "about", icon: "info", label: t("me.about"), value: appVersionLabel, go: () => push({ type: "about" }) },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: theme.featureSurface }}>
      <View style={{ backgroundColor: theme.featureSurface, zIndex: 2 }}>
        <View
          pointerEvents="box-none"
          style={{
            flexDirection: "row",
            alignItems: "center",
            width: "100%",
            maxWidth: 600,
            alignSelf: "center",
            paddingTop: insets.top + space.xs,
            paddingBottom: space.xs,
            paddingHorizontal: layout.pagePadding,
          }}
        >
          <Press
            onPress={() => push({ type: "scanLogin" })}
            accessibilityRole="button"
            accessibilityLabel={t("me.scan")}
            style={headerButtonStyle}
          >
            <ScanLine color={theme.text} size={25} strokeWidth={2.2} />
          </Press>
          <View style={{ flex: 1 }} />
          <View style={{ width: layout.iconButton, height: layout.iconButton }}>
            <Press
              onPress={() => push({ type: "inbox" })}
              accessibilityRole="button"
              accessibilityLabel={t("me.inbox")}
              style={headerButtonStyle}
            >
              <Bell color={theme.text} size={25} strokeWidth={2.2} />
            </Press>
            {unread > 0 ? (
              <View
                pointerEvents="none"
                style={{
                  position: "absolute",
                  top: 1,
                  right: 1,
                  minWidth: 17,
                  height: 17,
                  borderRadius: 9,
                  paddingHorizontal: 4,
                  backgroundColor: theme.danger,
                  borderWidth: 2,
                  borderColor: theme.groupedBg,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Text
                  style={{ fontSize: 9.5, fontWeight: "800", color: "#fff" }}
                >
                  {unread}
                </Text>
              </View>
            ) : null}
          </View>
          <View style={{ marginLeft: space.xs }}>
            <Press
              onPress={() => setSettingsDrawerOpen(true)}
              accessibilityRole="button"
              accessibilityLabel={t("me.settingsPageTitle")}
              style={headerButtonStyle}
            >
              <Settings color={theme.text} size={25} strokeWidth={2.2} />
            </Press>
          </View>
        </View>
      </View>

      <ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        scrollEnabled={!settingsDrawerOpen}
        stickyHeaderIndices={[1]}
        contentContainerStyle={{
          paddingBottom: insets.bottom + 120,
          width: "100%",
          maxWidth: 600,
          alignSelf: "center",
        }}
      >
        <View>
          <ProfileHero
            theme={theme}
            avatarUri={data.profile.avatarUrl}
            nick={profile.nick || t("me.unnamed")}
            username={profile.username}
            bio={profile.bio}
            followers={profileSummary.summary?.followers ?? 0}
            following={profileSummary.summary?.following ?? 0}
            identityLabel={t("account.profile.pageTitle")}
            onPressIdentity={() => push({ type: "profile" })}
            onPressFollowers={() => nav.openPeople(data.userId, "followers")}
            onPressFollowing={() => nav.openPeople(data.userId, "following")}
            onFindPeople={() => nav.openPeople(data.userId, "find")}
          />
        </View>

        <View style={{ marginTop: space.lg, backgroundColor: theme.featureSurface }}>
          <ProfileTabs
            theme={theme}
            active={profileTab}
            onChange={setProfileTab}
            tabs={[
              { key: "overview", label: t("profile.tabOverview") },
              { key: "timeline", label: t("profile.tabTimeline") },
              { key: "photos", label: t("profile.tabPhotos") },
            ]}
          />
        </View>

        <View
          onLayout={(event) => { panelY.current = event.nativeEvent.layout.y; tryJump(); }}
          style={{ paddingHorizontal: layout.pagePadding, paddingTop: space.lg }}
        >
          {profileTab === "overview" ? (
            <ProfileOverview
              theme={theme}
              tiles={overviewTiles}
              gear={{
                itemCount: data.items.length,
                weightLabel: fmtWeight(gearWeight, data.profile.gearWeightUnit || "kg"),
                valueLabel: yuanWithGap(gearValue),
                sets: gearSets,
                onOpenItems: () => nav.openGearPage("items"),
                onOpenSets: () => nav.openGearPage("sets"),
                onOpenSet: (setId: string) => nav.openGearSet(setId),
              }}
              yearDistance={yearDistance}
            />
          ) : profileTab === "timeline" ? (
            profileOutings.outings.length ? (
              <>
                {profileOutings.outings.map((outing, index) => (
                  <View
                    key={outing.id}
                    onLayout={(event) => { entryY.current[outing.id] = event.nativeEvent.layout.y; tryJump(); }}
                    style={{ marginTop: index ? 24 : 0 }}
                  >
                    <OutingCard
                      theme={theme}
                      outing={outing}
                      subject={profile.nick || t("me.unnamed")}
                      avatarUri={data.profile.avatarUrl}
                      showVisibility
                      onChangeVisibility={() => changeOutingVisibility(outing)}
                      reviewPrompt={reviewPromptFor(outing)}
                      highlighted={highlightedOuting === outing.id}
                      onOpen={() => openOuting(outing)}
                    />
                  </View>
                ))}
                {profileOutings.hasMore ? (
                  <Press
                    onPress={() => { void profileOutings.loadMore(); }}
                    accessibilityRole="button"
                    style={{ alignSelf: "center", marginTop: space.xl, paddingVertical: space.xs, paddingHorizontal: space.lg, borderRadius: radius.pill, backgroundColor: theme.fieldSurface }}
                  >
                    <Text style={[type.chip, { color: theme.text }]}>{t("profile.loadMore")}</Text>
                  </Press>
                ) : (
                  // 翻到最早的一条，正是想起「更早的在别的 App 里」的时候。
                  <View style={{ alignItems: "center", marginTop: space.xl, paddingBottom: space.xs }}>
                    <Text style={[type.meta, { color: theme.text3 }]}>{t("profile.importPastHint")}</Text>
                    <Press
                      onPress={() => { void startOutingImport(); }}
                      accessibilityRole="button"
                      style={{ marginTop: space.xs, paddingVertical: space.xs, paddingHorizontal: space.lg, borderRadius: radius.pill, backgroundColor: theme.accentSofter }}
                    >
                      <Text style={[type.chip, { color: theme.accent }]}>{t("profile.importPast")}</Text>
                    </Press>
                  </View>
                )}
              </>
            ) : (
              <TimelineEmpty
                theme={theme}
                title={t("profile.timelineEmptyTitle")}
                body={t("profile.timelineEmptyBody")}
                action={{ label: t("profile.importPast"), onPress: () => { void startOutingImport(); } }}
                secondaryAction={{ label: t("profile.timelineEmptyAction"), onPress: () => nav.setMainTab("discover") }}
              />
            )
          ) : (
            <ProfilePhotos theme={theme} outings={profileOutings.outings} onJump={jumpToOuting} />
          )}
        </View>
      </ScrollView>
      {outingImportFiles ? (
        <OutingImportSheet
          theme={theme}
          files={outingImportFiles}
          onClose={() => setOutingImportFiles(null)}
          onImported={() => { void profileOutings.refresh(); }}
        />
      ) : null}

      <View
        pointerEvents={settingsDrawerOpen ? "auto" : "none"}
        accessibilityViewIsModal={settingsDrawerOpen}
        style={[StyleSheet.absoluteFill, { zIndex: 55 }]}
      >
        <ReAnimated.View style={[StyleSheet.absoluteFill, drawerFadeStyle]}>
          <View
            style={{
              flex: 1,
              flexDirection: "row",
              backgroundColor: "rgba(30,32,31,0.32)",
            }}
          >
            <Press
              accessibilityLabel={t("common.close")}
              onPress={() => setSettingsDrawerOpen(false)}
              style={{ flex: 1 }}
            >
              <View />
            </Press>
            {/* The slide transform lives on an outer wrapper: on Android a
                transform on the same view as borderRadius + overflow:hidden
                makes the rounded corners disappear. */}
            <ReAnimated.View style={[drawerPanelStyle, { width: "80%", height: "100%" }]}>
              <View
                style={{
                  flex: 1,
                  backgroundColor: theme.featureSurface,
                  borderTopLeftRadius: radius.showcase,
                  borderBottomLeftRadius: radius.showcase,
                  paddingTop: insets.top + space.xl,
                  overflow: "hidden",
                }}
              >
              <ScrollView
                contentContainerStyle={{
                  paddingBottom: insets.bottom + space.xl,
                }}
              >
                {drawerItems.map((item, index) => (
                  <Press
                    key={item.key}
                    onPress={() => item.go?.()}
                    accessibilityRole="button"
                    style={{
                      minHeight: layout.listRowMinHeight,
                      paddingVertical: space.lg,
                      paddingHorizontal: space.lg,
                      flexDirection: "row",
                      alignItems: "center",
                      gap: space.md,
                      borderBottomWidth:
                        index === drawerItems.length - 1
                          ? 0
                          : StyleSheet.hairlineWidth,
                      borderBottomColor: theme.fieldBorder,
                    }}
                  >
                    <View
                      style={{
                        width: 44,
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      {item.dot ? (
                        <ColorDot theme={theme} color={curAccent} size={22} dashed={!curPreset} />
                      ) : (
                        <Icon
                          name={item.icon as IconName}
                          color={theme.text}
                          size={24}
                          strokeWidth={1.7}
                        />
                      )}
                    </View>
                    <Text style={[type.navTitle, { flex: 1, color: theme.text }]}>
                      {item.label}
                    </Text>
                    {item.value ? (
                      <Text style={[type.body, { color: theme.text3 }]}>
                        {item.value}
                      </Text>
                    ) : null}
                    <Icon
                      name="chevronR"
                      color={theme.text3}
                      size={20}
                      strokeWidth={1.7}
                    />
                  </Press>
                ))}
              </ScrollView>
              </View>
            </ReAnimated.View>
          </View>
        </ReAnimated.View>
      </View>

      {appearancePopup && popupAnchor ? (
        <Modal
          visible
          transparent
          statusBarTranslucent
          animationType="none"
          onRequestClose={() => setAppearancePopup(null)}
        >
          <View style={StyleSheet.absoluteFill}>
            <Pressable
              style={[
                StyleSheet.absoluteFill,
                {
                  backgroundColor: theme.dark
                    ? "rgba(0,0,0,0.20)"
                    : "rgba(0,0,0,0.055)",
                },
              ]}
              onPress={() => setAppearancePopup(null)}
            />
            <ReAnimated.View
              style={[
                {
                  position: "absolute",
                  top: popupTop,
                  left: popupLeft,
                  width: popupWidth,
                  borderRadius: radius.feature,
                  overflow: "hidden",
                  boxShadow: theme.dark
                    ? "0px 18px 46px rgba(0,0,0,0.52)"
                    : "0px 18px 46px rgba(0,0,0,0.18)",
                },
                popupMenuStyle,
              ]}
            >
              <Glass solidOnAndroid theme={theme} radius={radius.feature} intensity={76}>
                <View
                  style={{
                    paddingVertical: space.xs,
                    backgroundColor: theme.dark
                      ? "rgba(32,32,35,0.58)"
                      : "rgba(255,255,255,0.64)",
                  }}
                >
                  <ReAnimated.View style={popupContentStyle}>
                    {appearancePopup === "theme"
                      ? themeModes.map((item, index) => (
                          <PopupOption
                            key={item.id}
                            theme={theme}
                            label={
                              item.id === "system"
                                ? t("me.themeSystemDefault")
                                : item.label
                            }
                            selected={mode === item.id}
                            onPress={() => {
                              setMode(item.id);
                              setAppearancePopup(null);
                            }}
                            last={index === themeModes.length - 1}
                          />
                        ))
                      : appearancePopup === "language"
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
                        : ACCENT_PRESETS.map((preset) => {
                              const selected =
                                curAccent.toLowerCase() ===
                                preset.color.toLowerCase();
                              return (
                                <PopupOption
                                  key={preset.id}
                                  theme={theme}
                                  label={accentLabel(preset.id)}
                                  leading={
                                    <ColorDot
                                      theme={theme}
                                      color={preset.color}
                                      size={20}
                                    />
                                  }
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
        <View
          key={i + "-" + pg.type}
          style={[StyleSheet.absoluteFill, { zIndex: 60 + i }]}
        >
          {renderPage(pg)}
        </View>
      ))}
    </View>
  );
}

// Kept mounted under AppShell for every tab; skip re-renders the shell makes
// for its own state. Context changes (useNav/useData) still reach it.
export const MeScreen = React.memo(MeScreenView);
