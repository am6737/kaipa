import React, { useMemo, useState } from "react";
import { ActivityIndicator, Modal, Text, View } from "react-native";
import * as Location from "expo-location";
import { File as FSFile } from "expo-file-system";
import { Theme } from "../../theme/theme";
import { useI18n } from "../../i18n";
import { useData } from "../../data/DataContext";
import {
  DetailPage,
  AppCard,
  AppFieldCard,
  AppTextArea,
  radius,
  space,
  type,
} from "../../design-system";
import { Press } from "../Press";
import { JourneyLocationPicker } from "../overlays/JourneyLocationPicker";
import {
  locationFromPoi,
  reverseJourneyLocation,
  type JourneyLocationValue,
} from "../../lib/amapGeocoding";
import { buildTrackDraft, parseTrackFile } from "../../lib/trackImport";
import type { Track } from "../../data/tracks";

const NAME_MAX = 60;
const REGION_MAX = 60;
const NOTE_MAX = 500;

export function RouteRequestSheet({
  theme,
  prefill,
  onClose,
  onDone,
}: {
  theme: Theme;
  prefill?: string;
  onClose: () => void;
  onDone?: (message: string) => void;
}) {
  const { t } = useI18n();
  const data = useData();
  const [name, setName] = useState((prefill || "").slice(0, NAME_MAX));
  const [region, setRegion] = useState("");
  const [note, setNote] = useState("");
  const [track, setTrack] = useState<Track | null>(null);
  const fallbackLocation = useMemo(() => {
    const route = data.routes[0];
    return route
      ? locationFromPoi(
          route.region || t("routeRequest.locationUnnamed"),
          route.lng || 0,
          route.lat || 0,
        )
      : null;
  }, [data.routes, t]);
  const [location, setLocation] = useState<JourneyLocationValue | null>(null);
  const [pickerInitial, setPickerInitial] =
    useState<JourneyLocationValue | null>(null);
  const [hasManualLocation, setHasManualLocation] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const uploadTrack = async () => {
    const result = await FSFile.pickFileAsync({ mimeTypes: "*/*" });
    if (result.canceled || !result.result) return;
    setBusy(true);
    try {
      const file = result.result;
      const parsed = await parseTrackFile(file, t);
      const draft = await buildTrackDraft(parsed, {
        userId: data.userId,
        sourceUri: file.uri,
        fileSize: file.size,
      });
      const created = await data.createTrack(draft);
      if (created) {
        setTrack(created);
        if (!hasManualLocation && created.coords?.[0]) {
          const [lng, lat] = created.coords[0];
          try {
            const resolved = await reverseJourneyLocation(lng, lat, "zh");
            setLocation(resolved);
            if (!region) setRegion(resolved.region.slice(0, REGION_MAX));
          } catch {
            setLocation(
              locationFromPoi(t("routeRequest.locationUnnamed"), lng, lat),
            );
          }
        }
      }
    } catch {
      onDone?.(t("routeRequest.trackUploadFailed"));
    } finally {
      setBusy(false);
    }
  };

  const submit = async () => {
    if (!name.trim() || !location || busy) return;
    setBusy(true);
    try {
      await data.createRouteRequest({
        name,
        region,
        note,
        lng: location.lng,
        lat: location.lat,
        address: location.address,
        track,
      });
      onDone?.(t("routeRequest.submitted"));
      onClose();
    } catch {
      onDone?.(t("routeRequest.submitFailed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <DetailPage
        theme={theme}
        title={t("routeRequest.title")}
        onBack={onClose}
        backgroundColor={theme.groupedBg}
      >
        <View style={{ padding: space.xl, gap: space.md }}>
          <Text style={[type.lead, { color: theme.text2 }]}>
            {t("routeRequest.description")}
          </Text>
          <AppFieldCard
            theme={theme}
            label={t("routeRequest.location")}
            value={location?.address || location?.name || ""}
            unit=""
            description={location?.region || t("routeRequest.locationRequired")}
            onOpen={async () => {
              if (!location) {
                try {
                  const permission =
                    await Location.requestForegroundPermissionsAsync();
                  if (permission.granted) {
                    const current = await Location.getCurrentPositionAsync({
                      accuracy: Location.Accuracy.Balanced,
                    });
                    setLocation(
                      locationFromPoi(
                        t("routeRequest.locationUnnamed"),
                        current.coords.longitude,
                        current.coords.latitude,
                      ),
                    );
                  } else if (fallbackLocation)
                    setPickerInitial(fallbackLocation);
                } catch {
                  if (fallbackLocation) setPickerInitial(fallbackLocation);
                }
              }
              setPickerInitial(location || pickerInitial || fallbackLocation);
              setPickerOpen(true);
            }}
          />
          <AppFieldCard
            theme={theme}
            label={t("routeRequest.name")}
            value={name}
            unit={`${name.length}/${NAME_MAX}`}
            onChange={(value) => setName(value.slice(0, NAME_MAX))}
          />
          <AppFieldCard
            theme={theme}
            label={t("routeRequest.region")}
            value={region}
            unit={`${region.length}/${REGION_MAX}`}
            onChange={(value) => setRegion(value.slice(0, REGION_MAX))}
          />
          <AppCard
            theme={theme}
            radius={radius.feature}
            style={{ padding: space.sm }}
          >
            <AppTextArea
              theme={theme}
              value={note}
              onChangeText={(value) => setNote(value.slice(0, NOTE_MAX))}
              placeholder={t("routeRequest.notePlaceholder")}
            />
            <Text
              style={[type.hint, { color: theme.text3, textAlign: "right" }]}
            >
              {note.length}/{NOTE_MAX}
            </Text>
          </AppCard>
          <AppCard
            theme={theme}
            radius={radius.feature}
            style={{ padding: space.md, gap: space.sm }}
          >
            <Text style={[type.cardTitle, { color: theme.text }]}>
              {t("routeRequest.track")}
            </Text>
            {data.tracks.map((item) => (
              <Press
                key={item.id}
                onPress={async () => {
                  const next = track?.id === item.id ? null : item;
                  setTrack(next);
                  if (next?.coords?.[0] && !hasManualLocation) {
                    const [lng, lat] = next.coords[0];
                    try {
                      const resolved = await reverseJourneyLocation(
                        lng,
                        lat,
                        "zh",
                      );
                      setLocation(resolved);
                      if (!region)
                        setRegion(resolved.region.slice(0, REGION_MAX));
                    } catch {
                      setLocation(
                        locationFromPoi(
                          t("routeRequest.locationUnnamed"),
                          lng,
                          lat,
                        ),
                      );
                    }
                  }
                }}
              >
                <Text
                  style={[
                    type.body,
                    {
                      color: track?.id === item.id ? theme.accent : theme.text,
                    },
                  ]}
                >
                  {item.name}
                </Text>
              </Press>
            ))}
            <Press onPress={() => void uploadTrack()}>
              <Text style={[type.body, { color: theme.accent }]}>
                {t("routeRequest.uploadTrack")}
              </Text>
            </Press>
            <Text style={[type.caption, { color: theme.text2 }]}>
              {track
                ? t("routeRequest.trackSelected", { name: track.name })
                : t("routeRequest.trackOptional")}
            </Text>
          </AppCard>
          <Press
            onPress={() => void submit()}
            disabled={busy || !name.trim() || !location}
            style={{
              minHeight: 48,
              borderRadius: radius.pill,
              backgroundColor: theme.accent,
              alignItems: "center",
              justifyContent: "center",
              opacity: busy || !name.trim() || !location ? 0.5 : 1,
            }}
          >
            {busy ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={[type.chip, { color: "#FFFFFF" }]}>
                {t("routeRequest.submit")}
              </Text>
            )}
          </Press>
        </View>
      </DetailPage>
      <Modal
        visible={pickerOpen}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => setPickerOpen(false)}
      >
        <JourneyLocationPicker
          theme={theme}
          initialLocation={
            pickerInitial ||
            location ||
            fallbackLocation ||
            locationFromPoi(t("routeRequest.locationUnnamed"), 0, 0)
          }
          trackCoords={track?.coords}
          trackStart={track?.coords?.[0]}
          onCancel={() => setPickerOpen(false)}
          onConfirm={(next) => {
            setHasManualLocation(true);
            setLocation(next);
            setRegion(next.region.slice(0, REGION_MAX));
            setPickerOpen(false);
          }}
          onToast={(message) => onDone?.(message)}
        />
      </Modal>
    </>
  );
}
