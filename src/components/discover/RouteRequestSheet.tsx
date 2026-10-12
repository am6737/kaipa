import React, { useEffect, useRef, useState } from "react";
import { Modal, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { File as FSFile } from "expo-file-system";
import { Image as ExpoImage } from "expo-image";
import { Paperclip, Trash2 } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Theme } from "../../theme/theme";
import { useI18n } from "../../i18n";
import { useData } from "../../data/DataContext";
import { DetailPage, radius, space, type } from "../../design-system";
import { Press } from "../Press";
import {
  buildTrackDraft,
  parseTrackFile,
  type TrackFile,
} from "../../lib/trackImport";
import { trackFormatFromName, type Track } from "../../data/tracks";
import { reverseJourneyLocation } from "../../lib/amapGeocoding";
import { uploadAgentAttachment, removeMedia } from "../../lib/storage";
import type { RouteRequestAttachment } from "../../hooks/useRouteRequests";

const TEXT_MAX = 200;
const IMAGE_MAX = 6;
const IMAGE_MAX_BYTES = 15 * 1024 * 1024;
const TRACK_MAX_BYTES = 20 * 1024 * 1024;
const IMAGE_EXTENSIONS = ["jpg", "jpeg", "png", "webp", "gif", "heic"];
const IMAGE_MIME: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  heic: "image/heic",
};

function extOf(name: string) {
  return (name.match(/\.([a-z0-9]+)$/i)?.[1] || "").toLowerCase();
}

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
  const insets = useSafeAreaInsets();
  const [text, setText] = useState((prefill || "").slice(0, TEXT_MAX));
  const [track, setTrack] = useState<Track | null>(null);
  const [images, setImages] = useState<RouteRequestAttachment[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submittedRef = useRef(false);
  const imagesRef = useRef<RouteRequestAttachment[]>([]);
  imagesRef.current = images;

  // Picking uploads immediately, so a sheet closed without submitting would
  // otherwise strand its images in the private bucket.
  useEffect(() => {
    return () => {
      if (submittedRef.current) return;
      const urls = imagesRef.current.map((x) => x.url);
      if (urls.length) void removeMedia(urls).catch(() => {});
    };
  }, []);

  const pickFile = async () => {
    if (busy) return;
    let file: TrackFile | undefined;
    try {
      const result = await FSFile.pickFileAsync({ mimeTypes: "*/*" });
      if (!result || result.canceled || !result.result) return;
      file = result.result;
    } catch {
      return;
    }
    const ext = extOf(file.name || "");
    setBusy(true);
    setError(null);
    try {
      if (trackFormatFromName(file.name || "")) {
        if ((file.size ?? 0) > TRACK_MAX_BYTES) {
          setError(t("routeRequest.trackTooLarge"));
          return;
        }
        const parsed = await parseTrackFile(file, t);
        const draft = await buildTrackDraft(parsed, {
          userId: data.userId,
          sourceUri: file.uri,
          fileSize: file.size,
        });
        const created = await data.createTrack(draft);
        if (!created) throw new Error("TRACK_INSERT_FAILED");
        setTrack(created);
      } else if (IMAGE_EXTENSIONS.includes(ext)) {
        if (images.length >= IMAGE_MAX) {
          setError(t("routeRequest.imageLimit", { count: IMAGE_MAX }));
          return;
        }
        if ((file.size ?? 0) > IMAGE_MAX_BYTES) {
          setError(t("routeRequest.imageTooLarge"));
          return;
        }
        const mime = IMAGE_MIME[ext] || "image/jpeg";
        const url = await uploadAgentAttachment(file.uri, data.userId, file.name || `image.${ext}`, mime);
        setImages((v) => [...v, { url, name: file.name || `image.${ext}`, mime }]);
      } else {
        setError(t("routeRequest.fileUnsupported"));
      }
    } catch {
      setError(t("routeRequest.fileFailed"));
    } finally {
      setBusy(false);
    }
  };

  const removeImage = (url: string) => {
    setImages((v) => v.filter((x) => x.url !== url));
    // The signed URL is one-shot for us, so drop the object instead of stranding it.
    void removeMedia([url]).catch(() => {});
  };

  const submit = async () => {
    const name = text.trim();
    if (!name || busy) return;
    setBusy(true);
    setError(null);
    try {
      // A track gives the request a real position; a plain ask ships without one.
      let lng: number | null = null;
      let lat: number | null = null;
      let region = "";
      if (track?.coords?.[0]) {
        [lng, lat] = track.coords[0];
        try {
          const resolved = await reverseJourneyLocation(lng, lat, "zh");
          region = resolved.region;
        } catch {
          region = "";
        }
      }
      await data.createRouteRequest({ name, region, note: "", lng, lat, track, attachments: images });
      submittedRef.current = true;
      onDone?.(t("routeRequest.submitted"));
      onClose();
    } catch {
      setBusy(false);
      setError(t("routeRequest.submitFailed"));
    }
  };

  const canSubmit = Boolean(text.trim()) && !busy;
  const tiles = (track ? 1 : 0) + images.length;

  // Same full-screen Modal shell as 发布实况 (RouteGuidePage). The search screen
  // that opens us is unmounted before we present, so nothing is mid-transition.
  return (
    <Modal visible presentationStyle="fullScreen" animationType="slide" onRequestClose={onClose}>
      <DetailPage
        scrollable={false}
        flatChrome
        entryVariant="continuationX"
        theme={theme}
        title={t("routeRequest.title")}
        onBack={onClose}
        backgroundColor={theme.groupedBg}
      >
        <ScrollView
          style={{ flex: 1 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: insets.bottom + 120 }}
        >
          <View style={styles.content}>
            <TextInput
              autoFocus
              value={text}
              onChangeText={(value) => setText(value.slice(0, TEXT_MAX))}
              placeholder={t("routeRequest.textPlaceholder")}
              placeholderTextColor={theme.text3}
              multiline
              maxLength={TEXT_MAX}
              style={[styles.composerInput, { color: theme.text, backgroundColor: theme.surfaceTop, borderColor: theme.hairline }]}
            />
            <Text style={[styles.counter, { color: theme.text3 }]}>{text.length}/{TEXT_MAX}</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={[styles.mediaGrid, { height: tiles ? 84 : 0 }]}
              contentContainerStyle={styles.mediaGridContent}
            >
              {track ? (
                <View style={styles.mediaTile}>
                  <Text style={styles.trackTileText}>{track.name}</Text>
                  <View style={styles.mediaBadge}>
                    <Text style={styles.mediaBadgeText}>{t("routeRequest.trackBadge")}</Text>
                  </View>
                  <Press onPress={() => setTrack(null)} style={styles.mediaRemove}>
                    <Trash2 color="#fff" size={13} />
                  </Press>
                </View>
              ) : null}
              {images.map((item) => (
                <View key={item.url} style={styles.mediaTile}>
                  <ExpoImage source={{ uri: item.url }} contentFit="cover" style={StyleSheet.absoluteFill} />
                  <View style={styles.mediaBadge}>
                    <Text style={styles.mediaBadgeText}>{t("routeRequest.imageBadge")}</Text>
                  </View>
                  <Press onPress={() => removeImage(item.url)} style={styles.mediaRemove}>
                    <Trash2 color="#fff" size={13} />
                  </Press>
                </View>
              ))}
            </ScrollView>
            <View style={styles.composerActions}>
              <View style={styles.addMediaGroup}>
                <Press
                  accessibilityRole="button"
                  accessibilityLabel={t("routeRequest.pickFile")}
                  accessibilityState={{ disabled: busy }}
                  disabled={busy}
                  onPress={() => void pickFile()}
                  style={styles.addMediaAction}
                >
                  <Paperclip color={busy ? theme.text3 : theme.text2} size={18} />
                  <Text style={[type.small, { color: busy ? theme.text3 : theme.text2 }]}>
                    {t("routeRequest.pickFile")}
                  </Text>
                </Press>
                <Text style={[styles.mediaHintInline, { color: theme.text3 }]}>{t("routeRequest.fileHint")}</Text>
              </View>
              <Press
                accessibilityRole="button"
                disabled={!canSubmit}
                onPress={() => void submit()}
                style={[styles.publishButton, { backgroundColor: canSubmit ? theme.accent : theme.fieldSurface }]}
              >
                <Text style={[type.labelStrong, { color: canSubmit ? "#fff" : theme.text3 }]}>
                  {busy ? t("routeRequest.submitting") : t("routeRequest.submit")}
                </Text>
              </Press>
              {error ? <Text style={[styles.publishError, { color: theme.danger }]}>{error}</Text> : null}
            </View>
          </View>
        </ScrollView>
      </DetailPage>
    </Modal>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: space.xl, paddingTop: space.md },
  composerInput: {
    marginTop: space.xl,
    minHeight: 180,
    padding: space.md,
    borderRadius: radius.card,
    borderWidth: StyleSheet.hairlineWidth,
    ...type.textInput,
    textAlignVertical: "top",
  },
  counter: { textAlign: "right", marginTop: space.xs, ...type.micro },
  mediaGrid: { width: "100%", alignSelf: "stretch", marginTop: space.md },
  mediaGridContent: { flexDirection: "row", gap: space.sm },
  mediaTile: {
    width: 76,
    height: 76,
    borderRadius: radius.control,
    overflow: "hidden",
    backgroundColor: "#222",
    padding: space.xs,
    justifyContent: "center",
  },
  trackTileText: { color: "#fff", fontSize: 11, lineHeight: 14 },
  mediaBadge: {
    position: "absolute",
    left: 4,
    bottom: 4,
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: "rgba(0,0,0,0.65)",
  },
  mediaBadgeText: { color: "#fff", ...type.tiny },
  mediaRemove: {
    position: "absolute",
    right: 3,
    top: 3,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "rgba(0,0,0,0.65)",
    alignItems: "center",
    justifyContent: "center",
  },
  composerActions: {
    width: "100%",
    minHeight: 48,
    marginTop: space.xs,
    paddingTop: space.xs,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.md,
    position: "relative",
    zIndex: 2,
    flexWrap: "wrap",
  },
  addMediaGroup: { flexDirection: "row", alignItems: "center", gap: space.sm, flexShrink: 1 },
  addMediaAction: { minHeight: 40, paddingHorizontal: space.xs, flexDirection: "row", alignItems: "center", gap: space.xs },
  mediaHintInline: { flexShrink: 1, ...type.tiny },
  publishButton: { minHeight: 40, borderRadius: radius.pill, paddingHorizontal: space.md, alignItems: "center", justifyContent: "center" },
  publishError: { marginTop: space.xs, maxWidth: 240, textAlign: "right", ...type.microNote },
});
