import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { Image } from "expo-image";
import Svg, { Circle, Path } from "react-native-svg";
import * as ImagePicker from "expo-image-picker";
import { Theme } from "../../theme/theme";
import { Poi } from "../../data/pois";
import { Icon } from "../Icon";
import { Press } from "../Press";
import { useI18n } from "../../i18n";
import { useNav } from "../../nav/NavContext";
import { uploadCover } from "../../lib/storage";
import {
  AppActionDialog,
  DetailPage,
  radius,
  space,
  type,
} from "../../design-system";
import { MediaViewer } from "./JourneyTimeline";
import { JourneyLocationPicker } from "./JourneyLocationPicker";
import {
  JourneyLocationValue,
  locationFromPoi,
} from "../../lib/mapboxGeocoding";

function SectionLabel({
  theme,
  children,
}: {
  theme: Theme;
  children: React.ReactNode;
}) {
  return (
    <Text
      style={{
        fontSize: 16,
        lineHeight: 22,
        fontWeight: "700",
        color: theme.text3,
        marginBottom: space.sm,
      }}
    >
      {children}
    </Text>
  );
}

function FieldCard({
  theme,
  value,
  onChangeText,
  placeholder,
  multiline,
}: {
  theme: Theme;
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  multiline?: boolean;
}) {
  return (
    <View
      style={{
        minHeight: multiline ? 116 : 78,
        borderRadius: radius.feature,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: theme.hairline,
        backgroundColor: theme.surfaceTop,
        justifyContent: multiline ? "flex-start" : "center",
        paddingHorizontal: space.lg,
        paddingVertical: multiline ? space.md : 0,
      }}
    >
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={theme.text3}
        multiline={multiline}
        textAlignVertical={multiline ? "top" : "center"}
        maxLength={multiline ? 280 : 48}
        style={{
          minHeight: multiline ? 82 : undefined,
          fontSize: multiline ? 16 : 18,
          lineHeight: multiline ? 23 : undefined,
          fontWeight: multiline ? "400" : "700",
          color: theme.text,
          paddingVertical: 0,
        }}
      />
    </View>
  );
}

function LocationCard({
  theme,
  location,
  onPress,
  label,
}: {
  theme: Theme;
  location: JourneyLocationValue;
  onPress: () => void;
  label: string;
}) {
  return (
    <Press
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={{
        minHeight: 82,
        borderRadius: radius.feature,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: theme.hairline,
        backgroundColor: theme.surfaceTop,
        paddingHorizontal: space.lg,
        paddingVertical: space.md,
        flexDirection: "row",
        alignItems: "center",
      }}
    >
      <View style={{ flex: 1 }}>
        <Text
          numberOfLines={1}
          style={{ fontSize: 17, fontWeight: "700", color: theme.text }}
        >
          {location.region}
        </Text>
        <Text
          numberOfLines={1}
          style={[
            type.caption,
            {
              color: theme.text3,
              marginTop: space.xs,
              fontVariant: ["tabular-nums"],
            },
          ]}
        >
          {location.coord}
        </Text>
      </View>
      <Icon name="chevronR" color={theme.text3} size={18} />
    </Press>
  );
}

function ToggleCard({
  theme,
  label,
  sub,
  value,
  onChange,
}: {
  theme: Theme;
  label: string;
  sub?: string;
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <View
      style={{
        minHeight: 78,
        borderRadius: radius.feature,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: theme.hairline,
        backgroundColor: theme.surfaceTop,
        paddingHorizontal: space.lg,
        paddingVertical: space.md,
        flexDirection: "row",
        alignItems: "center",
      }}
    >
      <Press
        onPress={() => onChange(!value)}
        scaleTo={1}
        opacityTo={1}
        style={{ flex: 1, paddingRight: space.md }}
      >
        <Text style={{ fontSize: 17, fontWeight: "600", color: theme.text }}>
          {label}
        </Text>
        {sub ? (
          <Text
            style={[
              type.caption,
              { color: theme.text3, lineHeight: 18, marginTop: space.xxs },
            ]}
          >
            {sub}
          </Text>
        ) : null}
      </Press>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ false: theme.progressTrack, true: theme.accent }}
        thumbColor="#FFFFFF"
        ios_backgroundColor={theme.progressTrack}
      />
    </View>
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

function HeroModeTile({
  theme,
  mode,
  selected,
  disabled = false,
  coverUri,
  trackCoords,
  title,
  subtitle,
  onPress,
}: {
  theme: Theme;
  mode: "track" | "cover";
  selected: boolean;
  disabled?: boolean;
  coverUri?: string | null;
  trackCoords?: [number, number][];
  title: string;
  subtitle: string;
  onPress: () => void;
}) {
  const trackPreview = useMemo(() => buildTrackPreview(trackCoords), [trackCoords]);

  return (
    <Press
      accessibilityRole="radio"
      accessibilityState={{ selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={{
        flex: 1,
        minWidth: 0,
        padding: space.xs,
        borderRadius: radius.feature,
        borderWidth: selected ? 1.5 : StyleSheet.hairlineWidth,
        borderColor: selected ? theme.text : theme.hairline,
        backgroundColor: theme.surfaceTop,
        opacity: disabled ? 0.54 : 1,
      }}
    >
      <View
        style={{
          height: 96,
          borderRadius: radius.card,
          overflow: "hidden",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: theme.fieldSurface,
        }}
      >
        {mode === "cover" ? (
          coverUri ? (
            <Image
              source={{ uri: coverUri }}
              contentFit="cover"
              style={StyleSheet.absoluteFill}
            />
          ) : (
            <Icon name="plus" color={theme.text3} size={28} strokeWidth={1.5} />
          )
        ) : (
          <>
            <View
              style={[
                StyleSheet.absoluteFill,
                { backgroundColor: theme.fieldSurface },
              ]}
            />
            {trackPreview ? (
              <Svg width="100%" height="100%" viewBox="0 0 160 96">
                <Path
                  d={trackPreview.path}
                  fill="none"
                  stroke={theme.surfaceTop}
                  strokeWidth="8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <Path
                  d={trackPreview.path}
                  fill="none"
                  stroke={theme.accent}
                  strokeWidth="4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <Circle
                  cx={trackPreview.start.x}
                  cy={trackPreview.start.y}
                  r="4"
                  fill={theme.surfaceTop}
                  stroke={theme.accent}
                  strokeWidth="2"
                />
                <Circle
                  cx={trackPreview.end.x}
                  cy={trackPreview.end.y}
                  r="4"
                  fill={theme.text}
                  stroke={theme.surfaceTop}
                  strokeWidth="2"
                />
              </Svg>
            ) : (
              <Icon name="route" color={theme.text3} size={28} />
            )}
          </>
        )}
        {selected ? (
          <View
            style={{
              position: "absolute",
              right: space.xs,
              top: space.xs,
              width: 22,
              height: 22,
              borderRadius: radius.pill,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: theme.text,
              borderWidth: 2,
              borderColor: theme.surfaceTop,
            }}
          >
            <Icon name="check" color={theme.bg} size={12} strokeWidth={2.5} />
          </View>
        ) : null}
      </View>
      <Text
        numberOfLines={1}
        style={[
          type.cardTitle,
          {
            color: theme.text,
            marginTop: space.sm,
            marginHorizontal: space.xxs,
          },
        ]}
      >
        {title}
      </Text>
      <Text
        numberOfLines={2}
        style={[
          type.caption,
          {
            color: theme.text3,
            lineHeight: 16,
            marginTop: space.xxs,
            marginHorizontal: space.xxs,
            marginBottom: space.xxs,
          },
        ]}
      >
        {subtitle}
      </Text>
    </Press>
  );
}

function CoverTile({
  theme,
  uri,
  onPreview,
  onReplace,
}: {
  theme: Theme;
  uri: string;
  onPreview: () => void;
  onReplace: () => void;
}) {
  return (
    <View style={{ width: 112, height: 112, marginTop: space.sm }}>
      <Press onPress={onPreview} style={StyleSheet.absoluteFill}>
        <View
          style={{
            flex: 1,
            borderRadius: 22,
            overflow: 'hidden',
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: theme.hairline,
            backgroundColor: theme.fieldSurface,
          }}
        >
          <Image source={{ uri }} contentFit="cover" style={StyleSheet.absoluteFill} />
        </View>
      </Press>
      <Press
        accessibilityRole="button"
        onPress={onReplace}
        style={{
          position: 'absolute',
          right: space.xs,
          bottom: space.xs,
          width: 32,
          height: 32,
          borderRadius: radius.pill,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: 'rgba(0,0,0,0.52)',
        }}
      >
        <Icon name="camera" color="#FFFFFF" size={16} />
      </Press>
    </View>
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
  const nav = useNav();
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
      style={{
        width: 42,
        height: 42,
        borderRadius: 21,
        alignItems: "center",
        justifyContent: "center",
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: theme.fieldBorder,
        backgroundColor: theme.controlSurface,
      }}
    >
      {saving ? (
        <ActivityIndicator size="small" color={theme.text} />
      ) : (
        <Icon
          name="check"
          color={hasChanges ? theme.text : theme.text3}
          size={20}
          strokeWidth={2.2}
        />
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
      <DetailPage
        theme={theme}
        title={t("journey.settings.title")}
        onBack={onClose}
        right={saveButton}
        backgroundColor={theme.groupedBg}
        flatChrome
      >
        <View style={{ paddingHorizontal: space.xl, paddingTop: space.lg }}>
          <View style={{ marginBottom: space.xxl }}>
            <SectionLabel theme={theme}>
              {t("journey.settings.heroSection")}
            </SectionLabel>
            <View
              accessibilityRole="radiogroup"
              style={{ flexDirection: "row", gap: space.sm }}
            >
              <HeroModeTile
                theme={theme}
                mode="track"
                trackCoords={poi.trackCoords}
                selected={heroMode === "track"}
                disabled={!hasTrack}
                title={t("journey.settings.heroTrack")}
                subtitle={
                  hasTrack
                    ? t("journey.settings.heroTrackSub")
                    : t("journey.settings.heroTrackUnavailable")
                }
                onPress={() => setHeroMode("track")}
              />
              <HeroModeTile
                theme={theme}
                mode="cover"
                selected={heroMode === "cover"}
                coverUri={selectedCover}
                title={t("journey.settings.heroCover")}
                subtitle={t("journey.settings.heroCoverSub")}
                onPress={() =>
                  selectedCover ? setHeroMode("cover") : void pickCover()
                }
              />
            </View>
            {heroMode === "cover" && selectedCover ? (
              <CoverTile
                theme={theme}
                uri={selectedCover}
                onPreview={() => setCoverViewerOpen(true)}
                onReplace={() => void pickCover()}
              />
            ) : null}
          </View>

          <View style={{ marginBottom: space.xxl }}>
            <SectionLabel theme={theme}>
              {t("journeyEdit.fieldName")}
            </SectionLabel>
            <FieldCard
              theme={theme}
              value={name}
              onChangeText={setName}
              placeholder={t("record.hero.namePlaceholder")}
            />
          </View>

          <View style={{ marginBottom: space.xxl }}>
            <SectionLabel theme={theme}>
              {t("journey.settings.locationSection")}
            </SectionLabel>
            <LocationCard
              theme={theme}
              location={location}
              label={t("journey.settings.locationOpen")}
              onPress={() => setLocationPickerOpen(true)}
            />
          </View>

          <View style={{ marginBottom: space.xxl }}>
            <SectionLabel theme={theme}>
              {t("journeyEdit.sectionDesc")}
            </SectionLabel>
            <FieldCard
              theme={theme}
              value={desc}
              onChangeText={setDesc}
              placeholder={t("journeyEdit.descFooter")}
              multiline
            />
          </View>

          <View style={{ marginBottom: space.xxl }}>
            <SectionLabel theme={theme}>
              {t("journey.settings.participantsSection")}
            </SectionLabel>
            <Press
              onPress={openParticipants}
              accessibilityRole="button"
              style={{
                minHeight: 64,
                paddingHorizontal: space.md,
                paddingVertical: space.sm,
                borderRadius: radius.feature,
                borderWidth: StyleSheet.hairlineWidth,
                borderColor: theme.hairline,
                backgroundColor: theme.surfaceTop,
                flexDirection: "row",
                alignItems: "center",
              }}
            >
              <Icon name="people" color={theme.text2} size={20} />
              <Text
                style={{
                  flex: 1,
                  marginLeft: space.sm,
                  color: theme.text,
                  fontSize: 16,
                  fontWeight: "600",
                }}
              >
                {t("journey.manage.pageTitle")}
              </Text>
              <Text
                style={[
                  type.caption,
                  { color: theme.text3, marginRight: space.xs },
                ]}
              >
                {t("journey.manage.totalCount", {
                  count: poi.companionList?.length || poi.companions || 0,
                })}
              </Text>
              <Icon name="chevronR" color={theme.text3} size={16} />
            </Press>
          </View>

          {hasTrack ? (
            <View style={{ marginBottom: space.xxl }}>
              <SectionLabel theme={theme}>
                {t("journey.settings.exploreSection")}
              </SectionLabel>
              <View style={{ gap: space.sm }}>
                <ToggleCard
                  theme={theme}
                  label={t("journey.settings.trackPublic")}
                  sub={t("journey.settings.trackPublicSub")}
                  value={trackPublic}
                  onChange={setTrackPublic}
                />
                {trackPublic ? (
                  <>
                    <ToggleCard
                      theme={theme}
                      label={t("journey.settings.routeShowPhotos")}
                      sub={t("journey.settings.routeShowPhotosSub")}
                      value={routeShowPhotos}
                      onChange={setRouteShowPhotos}
                    />
                    <ToggleCard
                      theme={theme}
                      label={t("journey.settings.routeShowTimeline")}
                      sub={t("journey.settings.routeShowTimelineSub")}
                      value={routeShowTimeline}
                      onChange={setRouteShowTimeline}
                    />
                  </>
                ) : null}
              </View>
            </View>
          ) : null}

          <Press
            onPress={confirmDelete}
            style={{
              alignSelf: "stretch",
              height: 72,
              marginTop: space.xs,
              marginBottom: space.xxxl,
              paddingHorizontal: space.lg,
              borderRadius: radius.feature,
              borderWidth: StyleSheet.hairlineWidth,
              borderColor: theme.hairline,
              backgroundColor: theme.surfaceTop,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: space.sm,
            }}
          >
            <Icon name="trash" color={theme.danger} size={20} />
            <Text
              style={{ fontSize: 16, fontWeight: "700", color: theme.danger }}
            >
              {t("journey.settings.deleteJourney")}
            </Text>
          </Press>
        </View>
      </DetailPage>
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
