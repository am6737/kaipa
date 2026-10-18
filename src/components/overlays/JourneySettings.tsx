import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { Image } from "expo-image";
import Svg, { Circle, Path } from "react-native-svg";
import * as ImagePicker from "expo-image-picker";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Theme } from "../../theme/theme";
import { Poi } from "../../data/pois";
import { Icon } from "../Icon";
import { Press } from "../Press";
import { useI18n } from "../../i18n";
import { useNav } from "../../nav/NavContext";
import { uploadCover } from "../../lib/storage";
import {
  AppActionDialog,
  AppMetricStrip,
  DetailPage,
  layout,
  radius,
  space,
  type,
  type AppMetric,
} from "../../design-system";
import { MeCard, MeSection, SwitchRow } from "../me/parts";
import { MePushPage } from "../me/MePushPage";
import { MediaViewer } from "./JourneyTimeline";
import { JourneyLocationPicker } from "./JourneyLocationPicker";
import type { RouteGuidePlan } from "../../data/routeGuides";
import { submitRouteGuide, useMyRouteGuideStatus } from "../../hooks/useRouteGuides";
import { RouteGuideEquipment, RouteGuideItinerary } from "../discover/RouteGuideContent";
import { useData } from "../../data/DataContext";
import { Avatar, AvatarStack } from "../Avatar";
import { useTimeline } from "../../hooks/useTimeline";
import { useJourneyPacking } from "../../hooks/useJourneyPacking";
import {
  JourneyLocationValue,
  locationFromPoi,
} from "../../lib/amapGeocoding";

function RowDivider({ theme }: { theme: Theme }) {
  return (
    <View
      style={{
        height: StyleSheet.hairlineWidth,
        backgroundColor: theme.hairline,
        marginLeft: space.md,
      }}
    />
  );
}

const TRACK_PREVIEW_WIDTH = 160;
const TRACK_PREVIEW_HEIGHT = 96;
const TRACK_PREVIEW_PADDING = 14;

function buildTrackPreview(trackCoords?: [number, number][]) {
  const validCoords = (trackCoords ?? []).filter(
    ([lng, lat]) => Number.isFinite(lng) && Number.isFinite(lat),
  );
  if (validCoords.length < 2) return null;

  const stride = Math.max(1, Math.ceil(validCoords.length / 120));
  const sampled = validCoords.filter(
    (_, index) => index % stride === 0 || index === validCoords.length - 1,
  );
  const averageLat =
    sampled.reduce((sum, [, lat]) => sum + lat, 0) / sampled.length;
  const longitudeScale = Math.max(0.15, Math.cos((averageLat * Math.PI) / 180));
  const projected = sampled.map(([lng, lat]) => ({
    x: lng * longitudeScale,
    y: lat,
  }));
  const xs = projected.map(({ x }) => x);
  const ys = projected.map(({ y }) => y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const rangeX = Math.max(maxX - minX, 1e-7);
  const rangeY = Math.max(maxY - minY, 1e-7);
  const drawableWidth = TRACK_PREVIEW_WIDTH - TRACK_PREVIEW_PADDING * 2;
  const drawableHeight = TRACK_PREVIEW_HEIGHT - TRACK_PREVIEW_PADDING * 2;
  const scale = Math.min(drawableWidth / rangeX, drawableHeight / rangeY);
  const renderedWidth = rangeX * scale;
  const renderedHeight = rangeY * scale;
  const offsetX = (TRACK_PREVIEW_WIDTH - renderedWidth) / 2;
  const offsetY = (TRACK_PREVIEW_HEIGHT - renderedHeight) / 2;
  const points = projected.map(({ x, y }) => ({
    x: offsetX + (x - minX) * scale,
    y: TRACK_PREVIEW_HEIGHT - (offsetY + (y - minY) * scale),
  }));

  return {
    path: points
      .map(({ x, y }, index) => `${index === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`)
      .join(' '),
    start: points[0],
    end: points[points.length - 1],
  };
}

function JourneyPreviewCard({
  theme,
  heroMode,
  hasTrack,
  trackCoords,
  coverUri,
  labels,
  onSelectMode,
  onPickCover,
  onPreviewCover,
}: {
  theme: Theme;
  heroMode: "track" | "cover";
  hasTrack: boolean;
  trackCoords?: [number, number][];
  coverUri: string | null;
  labels: { track: string; cover: string; coverSub: string };
  onSelectMode: (mode: "track" | "cover") => void;
  onPickCover: () => void;
  onPreviewCover: () => void;
}) {
  const trackPreview = useMemo(
    () => (heroMode === "track" ? buildTrackPreview(trackCoords) : null),
    [heroMode, trackCoords],
  );
  const segment = (selected: boolean) => ({
    backgroundColor: selected ? theme.accentSofter : "transparent",
    color: selected ? theme.accent : theme.text2,
  });
  return (
    <MeCard theme={theme}>
      <View style={{ height: 200, backgroundColor: theme.surfaceTop }}>
        {heroMode === "cover" && coverUri ? (
          <Press
            accessibilityRole="button"
            accessibilityLabel={labels.cover}
            onPress={onPreviewCover}
            style={StyleSheet.absoluteFill}
          >
            <Image
              source={{ uri: coverUri }}
              contentFit="cover"
              style={StyleSheet.absoluteFill}
              transition={200}
            />
          </Press>
        ) : trackPreview ? (
          <View
            pointerEvents="none"
            style={{ position: "absolute", top: 16, left: space.xl, right: space.xl, bottom: 16 }}
          >
            <Svg width="100%" height="100%" viewBox="0 0 160 96" preserveAspectRatio="xMidYMid meet">
              <Path
                d={trackPreview.path}
                fill="none"
                stroke={theme.progressTrack}
                strokeWidth="6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <Path
                d={trackPreview.path}
                fill="none"
                stroke={theme.accent}
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <Circle cx={trackPreview.start.x} cy={trackPreview.start.y} r="3" fill={theme.surfaceTop} stroke={theme.accent} strokeWidth="1.5" />
              <Circle cx={trackPreview.end.x} cy={trackPreview.end.y} r="3" fill={theme.text} stroke={theme.surfaceTop} strokeWidth="1.5" />
            </Svg>
          </View>
        ) : (
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
            <Icon name={heroMode === "cover" ? "camera" : "route"} color={theme.text3} size={30} />
          </View>
        )}
      </View>
      <RowDivider theme={theme} />
      <View
        accessibilityRole="radiogroup"
        style={{ flexDirection: "row", justifyContent: "center", paddingVertical: space.sm }}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            height: 34,
            borderRadius: radius.pill,
            padding: 3,
            backgroundColor: theme.fieldSurface,
          }}
        >
          <Press
            accessibilityRole="radio"
            accessibilityState={{ selected: heroMode === "track", disabled: !hasTrack }}
            disabled={!hasTrack}
            onPress={() => onSelectMode("track")}
            scaleTo={1}
            opacityTo={1}
            style={{
              paddingHorizontal: space.md,
              height: 28,
              borderRadius: radius.pill,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: segment(heroMode === "track").backgroundColor,
              opacity: hasTrack ? 1 : 0.45,
            }}
          >
            <Text style={[type.small, { fontWeight: "700", color: segment(heroMode === "track").color }]}>
              {labels.track}
            </Text>
          </Press>
          <Press
            accessibilityRole="radio"
            accessibilityState={{ selected: heroMode === "cover" }}
            onPress={() => onSelectMode("cover")}
            scaleTo={1}
            opacityTo={1}
            style={{
              paddingHorizontal: space.md,
              height: 28,
              borderRadius: radius.pill,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: segment(heroMode === "cover").backgroundColor,
            }}
          >
            <Text style={[type.small, { fontWeight: "700", color: segment(heroMode === "cover").color }]}>
              {labels.cover}
            </Text>
          </Press>
        </View>
      </View>
      <RowDivider theme={theme} />
      <Press
        accessibilityRole="button"
        onPress={onPickCover}
        scaleTo={1}
        opacityTo={1}
      >
        <View
          style={{
            minHeight: layout.listRowMinHeight,
            paddingHorizontal: space.md,
            paddingVertical: space.md,
            flexDirection: "row",
            alignItems: "center",
            gap: space.md,
          }}
        >
          <Icon name="camera" color={theme.accent} size={20} />
          <View style={{ flex: 1 }}>
            <Text style={[type.cardTitle, { color: theme.text }]}>{labels.cover}</Text>
            <Text style={[type.caption, { color: theme.text2, marginTop: space.xxs }]}>
              {labels.coverSub}
            </Text>
          </View>
          <Icon name="chevronR" color={theme.text3} size={15} />
        </View>
      </Press>
    </MeCard>
  );
}

export function JourneySettings({
  theme,
  poi,
  onClose,
  onToast,
}: {
  theme: Theme;
  poi: Poi;
  onClose: () => void;
  onToast: (message: string) => void;
}) {
  const { t } = useI18n();
  const { userId } = useData();
  const nav = useNav();
  const insets = useSafeAreaInsets();
  const companionCount = poi.companionList?.length || poi.companions || 0;
  const journeyStats = useMemo(() => {
    const stats: AppMetric[] = [];
    const bare = (value: string) => value.replace(/\s+/g, "").replace(/(km|m)$/i, "");
    if (poi.dist?.trim()) stats.push({ label: "距离 km", value: bare(poi.dist) });
    if (poi.asc?.trim()) stats.push({ label: "爬升 m", value: bare(poi.asc) });
    if (poi.days?.trim()) stats.push({ label: "天数", value: poi.days.trim() });
    return stats;
  }, [
    poi.asc,
    poi.days,
    poi.dist,
  ]);
  const originalPhotos = useMemo(() => poi.photoUris ?? [], [poi.photoUris]);
  const [selectedCover, setSelectedCover] = useState<string | null>(
    originalPhotos[0] ?? null,
  );
  const hasTrack = (poi.trackCoords?.length ?? 0) >= 2;
  const initialHeroMode =
    poi.heroMode ??
    (hasTrack ? "track" : originalPhotos[0] ? "cover" : "track");
  const [heroMode, setHeroMode] = useState<"track" | "cover">(initialHeroMode);
  const [name, setName] = useState(poi.name);
  const originalLocation = useMemo(
    () => locationFromPoi(poi.region, poi.lng, poi.lat, poi.coord),
    [poi.coord, poi.lat, poi.lng, poi.region],
  );
  const [location, setLocation] = useState(originalLocation);
  const [desc, setDesc] = useState(poi.desc ?? "");
  const [trackPublic, setTrackPublic] = useState(poi.trackPublic ?? false);
  const [routeShowPhotos, setRouteShowPhotos] = useState(
    poi.routeShowPhotos ?? true,
  );
  const [routeShowTimeline, setRouteShowTimeline] = useState(
    poi.routeShowTimeline ?? true,
  );
  const [saving, setSaving] = useState(false);
  const [coverViewerOpen, setCoverViewerOpen] = useState(false);
  const [locationPickerOpen, setLocationPickerOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [guidePublishOpen, setGuidePublishOpen] = useState(false);
  const { status: guideStatus, refresh: refreshGuideStatus } = useMyRouteGuideStatus(poi.routeId, userId);
  const hasChanges = useMemo(
    () =>
      selectedCover !== (originalPhotos[0] ?? null) ||
      heroMode !== initialHeroMode ||
      name !== poi.name ||
      location.region !== originalLocation.region ||
      location.lng !== originalLocation.lng ||
      location.lat !== originalLocation.lat ||
      location.coord !== originalLocation.coord ||
      desc !== (poi.desc ?? "") ||
      trackPublic !== (poi.trackPublic ?? false) ||
      routeShowPhotos !== (poi.routeShowPhotos ?? true) ||
      routeShowTimeline !== (poi.routeShowTimeline ?? true),
    [
      desc,
      heroMode,
      initialHeroMode,
      name,
      originalPhotos,
      poi.desc,
      poi.name,
      originalLocation,
      poi.routeShowPhotos,
      poi.routeShowTimeline,
      poi.trackPublic,
      location,
      routeShowPhotos,
      routeShowTimeline,
      selectedCover,
      trackPublic,
    ],
  );

  const pickCover = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(t("journey.photoWall.needLibraryPerm"));
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.82,
    });
    const uri = !result.canceled ? result.assets?.[0]?.uri : undefined;
    if (!uri) return;
    setSelectedCover(uri);
    setHeroMode("cover");
  };

  const save = async () => {
    if (poi.mine !== true) return;
    const trimmedName = name.trim();
    if (!trimmedName) {
      onToast(t("record.hero.nameRequired"));
      return;
    }

    setSaving(true);
    try {
      let resolvedCover = selectedCover;
      if (resolvedCover && !originalPhotos.includes(resolvedCover)) {
        resolvedCover = await uploadCover(resolvedCover, poi.id);
      }
      const remainingPhotos = originalPhotos.filter(
        (uri) => uri !== selectedCover && uri !== resolvedCover,
      );
      nav.patchCurrent({
        name: trimmedName,
        region: location.region.trim(),
        lng: location.lng,
        lat: location.lat,
        coord: location.coord,
        desc: desc.trim(),
        heroMode,
        trackPublic,
        routeShowPhotos,
        routeShowTimeline,
        photoUris: resolvedCover
          ? [resolvedCover, ...remainingPhotos]
          : originalPhotos.slice(1),
      });
      onToast(t("appShell.toastJourneyUpdated"));
      onClose();
    } catch (error) {
      console.warn("[JourneySettings] save failed:", error);
      onToast(t("journey.timeline.uploadFailedMessage"));
    } finally {
      setSaving(false);
    }
  };

  const openParticipants = () => {
    nav.openManageCompanions(poi);
  };

  const confirmDelete = () => {
    setDeleteDialogOpen(true);
  };

  const saveButton = (
    <Press
      accessibilityRole="button"
      accessibilityLabel={t("common.save")}
      accessibilityState={{ disabled: !hasChanges || saving }}
      onPress={() => void save()}
      disabled={!hasChanges || saving}
      scaleTo={1}
      opacityTo={1}
      style={{
        minWidth: 54,
        height: 34,
        paddingHorizontal: space.sm,
        borderRadius: radius.pill,
        backgroundColor: theme.accentSoft,
        alignItems: "center",
        justifyContent: "center",
        opacity: hasChanges && !saving ? 1 : 0.45,
      }}
    >
      {saving ? (
        <ActivityIndicator size="small" color={theme.accent} />
      ) : (
        <Text style={{ fontSize: 13, fontWeight: "700", color: theme.accent }}>
          {t("common.save")}
        </Text>
      )}
    </Press>
  );

  return (
    <View
      style={[
        StyleSheet.absoluteFill,
        { zIndex: 190, backgroundColor: theme.groupedBg },
      ]}
    >
      <MePushPage
        theme={theme}
        title={t("journey.settings.title")}
        onBack={onClose}
        right={saveButton}
      >
        <View style={{ paddingHorizontal: space.xl, paddingTop: space.xs }}>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder={t("record.hero.namePlaceholder")}
            placeholderTextColor={theme.text3}
            maxLength={48}
            style={{ padding: 0, height: 42, ...type.pageTitle, lineHeight: 36, color: theme.text }}
          />
          {[location.region, location.coord].filter(Boolean).length ? (
            <Text
              numberOfLines={1}
              style={[
                type.caption,
                { color: theme.text2, marginTop: space.xs, fontVariant: ["tabular-nums"] },
              ]}
            >
              {[location.region, location.coord].filter(Boolean).join("  ")}
            </Text>
          ) : null}
        </View>

        <MeSection theme={theme} title={t("journey.settings.heroSection")} first>
          <JourneyPreviewCard
            theme={theme}
            heroMode={heroMode}
            hasTrack={hasTrack}
            trackCoords={poi.trackCoords}
            coverUri={selectedCover}
            labels={{
              track: t("journey.settings.heroTrack"),
              cover: t("journey.settings.heroCover"),
              coverSub: t("journey.settings.heroCoverSub"),
            }}
            onSelectMode={(mode) =>
              mode === "cover" && !selectedCover ? void pickCover() : setHeroMode(mode)
            }
            onPickCover={() => void pickCover()}
            onPreviewCover={() => setCoverViewerOpen(true)}
          />
        </MeSection>

        <MeSection theme={theme} title={t("journey.settings.locationSection")}>
          <MeCard theme={theme}>
            <Press
              accessibilityRole="button"
              accessibilityLabel={t("journey.settings.locationOpen")}
              onPress={() => setLocationPickerOpen(true)}
              scaleTo={1}
              opacityTo={1}
            >
              <View
                style={{
                  minHeight: layout.listRowMinHeight,
                  paddingHorizontal: space.md,
                  paddingVertical: space.md,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: space.md,
                }}
              >
                <Icon name="pin" color={theme.accent} size={20} />
                <View style={{ flex: 1 }}>
                  <Text
                    numberOfLines={1}
                    style={[type.cardTitle, { color: theme.text }]}
                  >
                    {location.region || t("journey.settings.locationOpen")}
                  </Text>
                  {location.coord ? (
                    <Text
                      numberOfLines={1}
                      style={[
                        type.caption,
                        {
                          color: theme.text2,
                          marginTop: space.xxs,
                          fontVariant: ["tabular-nums"],
                        },
                      ]}
                    >
                      {location.coord}
                    </Text>
                  ) : null}
                </View>
                <Icon name="chevronR" color={theme.text3} size={15} />
              </View>
            </Press>
            {journeyStats.length ? (
              <>
                <RowDivider theme={theme} />
                <View style={{ paddingHorizontal: space.md, paddingVertical: space.sm }}>
                  <AppMetricStrip theme={theme} stats={journeyStats} />
                </View>
              </>
            ) : null}
          </MeCard>
        </MeSection>

        <MeSection theme={theme} title={t("journeyEdit.sectionDesc")}>
          <MeCard theme={theme}>
            <TextInput
              value={desc}
              onChangeText={setDesc}
              placeholder={t("journeyEdit.descFooter")}
              placeholderTextColor={theme.text3}
              multiline
              textAlignVertical="top"
              maxLength={280}
              style={{
                minHeight: 84,
                paddingHorizontal: space.md,
                paddingVertical: space.md,
                fontSize: 15,
                lineHeight: 23,
                color: theme.text,
              }}
            />
          </MeCard>
        </MeSection>

        <MeSection theme={theme} title={t("journey.settings.participantsSection")}>
          <MeCard theme={theme}>
            <Press
              accessibilityRole="button"
              onPress={openParticipants}
              scaleTo={1}
              opacityTo={1}
            >
              <View
                style={{
                  minHeight: layout.listRowMinHeight,
                  paddingHorizontal: space.md,
                  paddingVertical: space.md,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: space.sm,
                }}
              >
                <AvatarStack
                  people={poi.companionList ?? []}
                  size={28}
                  ringColor={theme.surfaceTop}
                />
                <Text style={[type.cardTitle, { flex: 1, color: theme.text }]}>
                  {t("journey.manage.pageTitle")}
                </Text>
                <Text style={[type.caption, { color: theme.text2 }]}>
                  {t("journey.manage.totalCount", { count: companionCount })}
                </Text>
                <Icon name="chevronR" color={theme.text3} size={15} />
              </View>
            </Press>
          </MeCard>
        </MeSection>

        {hasTrack ? (
          <MeSection theme={theme} title={t("journey.settings.exploreSection")}>
            <MeCard theme={theme}>
              <SwitchRow
                theme={theme}
                label={t("journey.settings.trackPublic")}
                sub={t("journey.settings.trackPublicSub")}
                value={trackPublic}
                onChange={setTrackPublic}
              />
              {trackPublic ? (
                <>
                  <RowDivider theme={theme} />
                  <SwitchRow
                    theme={theme}
                    label={t("journey.settings.routeShowPhotos")}
                    sub={t("journey.settings.routeShowPhotosSub")}
                    value={routeShowPhotos}
                    onChange={setRouteShowPhotos}
                  />
                  <RowDivider theme={theme} />
                  <SwitchRow
                    theme={theme}
                    label={t("journey.settings.routeShowTimeline")}
                    sub={t("journey.settings.routeShowTimelineSub")}
                    value={routeShowTimeline}
                    onChange={setRouteShowTimeline}
                  />
                </>
              ) : null}
            </MeCard>
          </MeSection>
        ) : null}

        {poi.routeId ? (
          <MeSection theme={theme} title="路线攻略">
            <MeCard theme={theme}>
              <Press
                accessibilityRole="button"
                accessibilityLabel="发布为路线攻略"
                onPress={() => setGuidePublishOpen(true)}
                scaleTo={1}
                opacityTo={1}
              >
                <View
                  style={{
                    minHeight: layout.listRowMinHeight,
                    paddingHorizontal: space.md,
                    paddingVertical: space.md,
                    flexDirection: "row",
                    alignItems: "center",
                    gap: space.sm,
                  }}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={[type.cardTitle, { color: theme.text }]}>
                      {guideStatus?.status === "approved" ? "路线攻略已通过" : guideStatus?.status === "pending" ? "路线攻略审核中" : guideStatus?.status === "rejected" ? "攻略审核未通过，可重新提交" : "发布为路线攻略"}
                    </Text>
                    <Text
                      style={[
                        type.caption,
                        { color: theme.text2, lineHeight: 18, marginTop: space.xxs },
                      ]}
                    >
                      {guideStatus?.status === "approved" ? "已展示在路线卡片的大家的攻略中" : guideStatus?.status === "pending" ? "审核通过后会展示给其他人，请勿重复提交" : guideStatus?.status === "rejected" ? ("驳回原因：" + (guideStatus.rejectionReason || "请修改后重新提交")) : "整理旅程、装备与复盘，提交审核后展示给其他人"}
                    </Text>
                  </View>
                  {guideStatus ? (
                    <View
                      style={{
                        paddingHorizontal: space.sm,
                        paddingVertical: space.xxs,
                        borderRadius: radius.pill,
                        backgroundColor:
                          guideStatus.status === "approved"
                            ? theme.accentSofter
                            : theme.fieldSurface,
                      }}
                    >
                      <Text
                        style={[
                          type.eyebrow,
                          {
                            color:
                              guideStatus.status === "approved"
                                ? theme.accent
                                : theme.text2,
                          },
                        ]}
                      >
                        {guideStatus.status === "approved" ? "已发布" : guideStatus.status === "pending" ? "审核中" : "未通过"}
                      </Text>
                    </View>
                  ) : null}
                  {guideStatus?.status === "rejected" || !guideStatus ? (
                    <Icon name="chevronR" color={theme.text3} size={15} />
                  ) : null}
                </View>
              </Press>
            </MeCard>
          </MeSection>
        ) : null}

        {poi.mine ? (
          <View style={{ paddingHorizontal: space.xl, marginTop: layout.sectionGap, marginBottom: space.xl }}>
            <Press
              accessibilityRole="button"
              onPress={confirmDelete}
              scaleTo={1}
              opacityTo={1}
              style={{
                height: 48,
                alignItems: "center",
                justifyContent: "center",
                gap: space.xs,
                flexDirection: "row",
              }}
            >
              <Icon name="trash" color={theme.text3} size={16} />
              <Text style={[type.small, { color: theme.text3 }]}>
                {t("journey.settings.deleteJourney")}
              </Text>
            </Press>
          </View>
        ) : null}
      </MePushPage>
      {locationPickerOpen ? (
        <JourneyLocationPicker
          theme={theme}
          initialLocation={location}
          trackStart={poi.trackCoords?.[0]}
          trackEnd={
            poi.trackCoords?.length
              ? poi.trackCoords[poi.trackCoords.length - 1]
              : undefined
          }
          trackCoords={poi.trackCoords}
          onCancel={() => setLocationPickerOpen(false)}
          onConfirm={(nextLocation) => {
            setLocation(nextLocation);
            setLocationPickerOpen(false);
          }}
          onToast={onToast}
        />
      ) : null}
      {guidePublishOpen ? (
        <GuidePublishSheet
          theme={theme}
          poi={poi}
          existing={guideStatus}
          readOnly={guideStatus?.status === "pending" || guideStatus?.status === "approved"}
          onClose={() => setGuidePublishOpen(false)}
          onSubmit={async (payload) => {
            setGuidePublishOpen(false);
            try { await submitRouteGuide(payload); await refreshGuideStatus(); onToast("攻略已提交审核"); } catch (error) { onToast(error instanceof Error ? error.message : "提交失败，请重试"); }
          }}
        />
      ) : null}

      {coverViewerOpen && selectedCover ? (
        <MediaViewer
          theme={theme}
          media={[{ tone: poi.tone, uri: selectedCover }]}
          index={0}
          onClose={() => setCoverViewerOpen(false)}
          onDelete={() => {
            setSelectedCover(null);
            if (hasTrack) setHeroMode("track");
            setCoverViewerOpen(false);
          }}
        />
      ) : null}

      <AppActionDialog
        theme={theme}
        visible={deleteDialogOpen}
        title={t("journey.settings.deleteConfirmTitle")}
        message={t("journey.remove.confirmMessage")}
        confirmLabel={t("journey.settings.deleteJourney")}
        cancelLabel={t("common.cancel")}
        destructive
        confirmIcon="trash"
        onCancel={() => setDeleteDialogOpen(false)}
        onConfirm={() => {
          setDeleteDialogOpen(false);
          nav.removeJourney();
        }}
      />
    </View>
  );
}

function GuidePublishSheet({
  theme,
  poi,
  existing,
  readOnly,
  onClose,
  onSubmit,
}: {
  theme: Theme;
  poi: Poi;
  existing: ReturnType<typeof useMyRouteGuideStatus>["status"];
  readOnly: boolean;
  onClose: () => void;
  onSubmit: (payload: { routeId: string; authorId: string; title: string; intro: string; reflection: string; plan: RouteGuidePlan }) => Promise<void>;
}) {
  const { profile, userId } = useData();
  const timeline = useTimeline(poi.id, userId);
  const packing = useJourneyPacking({ journey: poi, userId, realtime: false });
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState<"edit" | "preview">("preview");
  const [title, setTitle] = useState(existing?.title || poi.name);
  const [intro, setIntro] = useState(existing?.intro || "");
  const [reflection, setReflection] = useState(existing?.reflection || "");
  const author = profile.nick.trim() || "我";
  const publishedDate = new Date().toISOString().slice(0, 10);
  const plan = useMemo<RouteGuidePlan>(() => {
    const pair = (value: string) => ({ zh: value, en: value });
    const timelineDays = timeline.knownGroups.map((group) => ({
      title: pair(group),
      summary: pair(group),
      detail: pair(''),
      items: timeline.rows.filter((row) => row.day === group).map((row) => pair(row.title)),
    }));
    const days = timelineDays;
    const gear = packing.items.map((item) => ({
      name: pair(item.name),
      category: pair(item.categoryName || '装备'),
      note: pair(item.note || ''),
      quantity: Math.max(1, item.quantity || 1),
      weightKg: item.weightKg,
      carryStatus: item.carryStatus,
    }));
    return existing?.plan || {
      id: `journey-${poi.id}`,
      routeId: poi.routeId ?? poi.id,
      title: pair(poi.name),
      shortTitle: pair(poi.name),
      description: pair(''),
      stay: 'day',
      days,
      gear,
      draft: true,
    };
  }, [existing?.plan, packing.items, poi.id, poi.name, poi.routeId, timeline.knownGroups, timeline.rows]);
  // Match the journey creation form's text field card: one shared white
  // surface, 14px corner radius, and the same horizontal/vertical insets.
  const guideTextCard = { minHeight: 96, paddingHorizontal: space.md, paddingVertical: space.sm, borderRadius: radius.feature, backgroundColor: theme.surfaceTop } as const;
  return (
    <Modal visible animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      <DetailPage
        theme={theme}
        title="攻略详情"
        onBack={onClose}
        backgroundColor={readOnly ? '#fff' : theme.groupedBg}
        flatChrome
        entryVariant="continuationX"
        scrollable={false}
        overlay={<View pointerEvents="box-none" style={{ position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: space.xl, paddingTop: space.sm, paddingBottom: Math.max(insets.bottom, space.md) }}>
          <View style={{ flexDirection: "row", gap: space.sm }}>
            {readOnly ? null : step === "edit" ? <Press onPress={() => setStep("preview")} style={{ flex: 1, minHeight: 44, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", backgroundColor: theme.controlSurface, borderWidth: StyleSheet.hairlineWidth, borderColor: theme.hairline, shadowColor: "#000", shadowOpacity: 0.08, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 2 }}><Text style={{ color: theme.text, fontSize: 13, fontWeight: "700" }}>完成编辑</Text></Press> : <Press onPress={() => setStep("edit")} style={{ flex: 1, minHeight: 44, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", backgroundColor: theme.controlSurface, borderWidth: StyleSheet.hairlineWidth, borderColor: theme.hairline, shadowColor: "#000", shadowOpacity: 0.08, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 2 }}><Text style={{ color: theme.text, fontSize: 13, fontWeight: "700" }}>编辑攻略</Text></Press>}
            {readOnly ? <Press onPress={onClose} style={{ flex: 1, minHeight: 44, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", backgroundColor: theme.controlSurface }}><Text style={{ color: theme.text, fontSize: 13, fontWeight: "700" }}>关闭</Text></Press> : <Press onPress={() => step === "edit" ? setStep("preview") : void onSubmit({ routeId: poi.routeId ?? poi.id, authorId: userId, title, intro, reflection, plan })} style={{ flex: 1.45, borderWidth: StyleSheet.hairlineWidth, borderColor: theme.hairline, minHeight: 44, paddingHorizontal: space.md, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", backgroundColor: theme.accent }}><Text style={{ color: "#FFFFFF", fontSize: 13, fontWeight: "700" }}>提交审核</Text></Press>}
          </View>
        </View>}
      >
        <KeyboardAwareScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" bottomOffset={insets.bottom + 24} extraKeyboardSpace={insets.bottom} contentContainerStyle={{ paddingHorizontal: space.xl, paddingTop: space.xl, paddingBottom: 130 }}>
          <>
            {step === "edit" && !readOnly ? <View style={[guideTextCard, { marginTop: space.sm }]}><TextInput value={title} onChangeText={setTitle} maxLength={60} placeholder="输入攻略标题" placeholderTextColor={theme.text3} style={{ width: "100%", minHeight: 48, padding: 0, color: theme.text, fontSize: 17, lineHeight: 24, fontWeight: "600" }} /></View> : <Text style={[type.pageTitle, { color: theme.text, lineHeight: 32, marginTop: space.sm }]}>{title || "未命名攻略"}</Text>}
            <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm, marginTop: space.sm }}><Avatar size={28} uri={profile.avatarUrl} /><Text style={[type.caption, { color: theme.text2 }]}>{author}</Text></View>
            <Text style={[type.caption, { color: theme.text2, marginTop: space.sm }]}>发布于 {publishedDate}</Text>
            {step === "edit" && !readOnly ? <View style={[guideTextCard, { marginTop: space.xl }]}><TextInput value={intro} onChangeText={setIntro} maxLength={180} multiline placeholder="这次旅程最值得分享的经验" placeholderTextColor={theme.text3} style={{ width: "100%", minHeight: 48, padding: 0, color: theme.text, fontSize: 16, lineHeight: 24, textAlignVertical: "top" }} /></View> : intro.trim() ? <Text style={{ color: theme.text2, fontSize: 14, lineHeight: 25, marginTop: space.xl }}>{intro}</Text> : null}
            <View style={{ marginTop: space.xl }}><Text style={[type.sectionTitle, { color: theme.text, marginBottom: space.md }]}>旅程</Text>
            <RouteGuideItinerary theme={theme} plan={plan} />
            <View style={{ marginTop: space.xxl }}><RouteGuideEquipment theme={theme} plan={plan} /></View></View>
            {step === "edit" && !readOnly ? <><Text style={[type.sectionTitle, { color: theme.text, marginTop: space.xxl, marginBottom: space.md }]}>如果再走一次</Text><View style={guideTextCard}><TextInput value={reflection} onChangeText={setReflection} maxLength={280} multiline placeholder="记录给后来者的建议" placeholderTextColor={theme.text3} style={{ width: "100%", minHeight: 48, padding: 0, color: theme.text, fontSize: 16, lineHeight: 24, textAlignVertical: "top" }} /></View></> : <><Text style={[type.sectionTitle, { color: theme.text, marginTop: space.xxl, marginBottom: space.md }]}>如果再走一次</Text>{reflection.trim() ? <Text style={{ color: theme.text2, fontSize: 14, lineHeight: 25 }}>{reflection}</Text> : null}</>}
          </>
        </KeyboardAwareScrollView>
      </DetailPage>
    </Modal>
  );
}
