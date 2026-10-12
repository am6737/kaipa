// MyRouteRequestsPage.tsx — 我的路线请求: grouped by outcome (审核中 first, with
// 未通过 merging rejected + duplicate). Cards and swipe-to-delete mirror the
// 我的攻略 list. See DESIGN.md.
import React, { useEffect, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { Theme } from "../../theme/theme";
import { useI18n } from "../../i18n";
import {
  AppActionDialog,
  AppCard,
  AppSectionHeader,
  layout,
  radius,
  space,
  type,
} from "../../design-system";
import { Icon } from "../Icon";
import { Press } from "../Press";
import { KPSpinner, KPState } from "../State";
import { TwoStageSwipeable } from "../TwoStageSwipeable";
import { MePushPage } from "./MePushPage";
import { JOURNEY_SWIPE_SPRING, JourneySwipeDeleteAction } from "./JourneySwipeDelete";
import type { RouteRequest } from "../../hooks/useRouteRequests";

// The four server statuses collapse into three user-facing sections;
// rejected and duplicate read the same to the requester — the reason lives in
// reviewNote either way.
type Section = "pending" | "accepted" | "closed";

const sectionOf = (status: RouteRequest["status"]): Section =>
  status === "rejected" || status === "duplicate" ? "closed" : status;

const day = (iso: string) => iso.slice(0, 10).replace(/-/g, ".");

type Props = {
  theme: Theme;
  requests: RouteRequest[];
  loading: boolean;
  onBack: () => void;
  onDelete: (request: RouteRequest) => Promise<void>;
  onOpen: (request: RouteRequest) => void;
  onRefresh: () => void;
};

export function MyRouteRequestsPage({
  theme,
  requests,
  loading,
  onBack,
  onDelete,
  onOpen,
  onRefresh,
}: Props) {
  const { t } = useI18n();
  const [deleteCandidate, setDeleteCandidate] = useState<RouteRequest | null>(null);
  const [deletingId, setDeletingId] = useState<string>();
  const pendingSwipeCloseRef = useRef<(() => void) | null>(null);

  // Review happens server-side, so reload whenever the page opens instead of
  // offering a manual refresh button.
  const refreshRef = useRef(onRefresh);
  refreshRef.current = onRefresh;
  useEffect(() => {
    refreshRef.current();
  }, []);

  const sections: { id: Section; label: string; items: RouteRequest[] }[] = [
    ["pending", t("routeRequest.pending")],
    ["accepted", t("routeRequest.accepted")],
    ["closed", t("routeRequest.rejected")],
  ]
    .map(([id, label]) => ({
      id: id as Section,
      label,
      items: requests.filter((request) => sectionOf(request.status) === id),
    }))
    .filter((section) => section.items.length > 0);

  const confirmDelete = () => {
    if (!deleteCandidate || deletingId) return;
    const candidate = deleteCandidate;
    pendingSwipeCloseRef.current = null;
    setDeletingId(candidate.id);
    void onDelete(candidate).finally(() => {
      setDeletingId(undefined);
      setDeleteCandidate(null);
    });
  };

  return (
    <>
      <MePushPage theme={theme} title={t("routeRequest.pageTitle")} onBack={onBack}>
        <View style={styles.content}>
          {loading && requests.length === 0 ? (
            <View style={{ paddingVertical: 120, alignItems: "center" }}>
              <KPSpinner theme={theme} label={t("routeRequest.loading")} />
            </View>
          ) : requests.length === 0 ? (
            <KPState
              theme={theme}
              icon="compass"
              title={t("routeRequest.empty")}
              body={t("routeRequest.emptyBody")}
              style={{ marginTop: space.xxxl }}
            />
          ) : (
            sections.map((section, index) => (
              <View key={section.id} style={{ gap: space.md }}>
                <AppSectionHeader
                  theme={theme}
                  text={section.label}
                  marginTop={index === 0 ? space.xs : layout.sectionGap}
                  variant="title"
                  trailing={
                    <Text
                      style={[type.caption, { color: theme.text2, fontVariant: ["tabular-nums"] }]}
                    >
                      {t("routeRequest.sectionCount", { count: section.items.length })}
                    </Text>
                  }
                />
                {section.items.map((request) => {
                  const card = (
                    <RequestCard
                      theme={theme}
                      request={request}
                      onPress={() => section.id === "accepted" && onOpen(request)}
                    />
                  );
                  if (section.id !== "pending") return <View key={request.id}>{card}</View>;
                  return (
                    <TwoStageSwipeable
                      key={request.id}
                      friction={1}
                      rightThreshold={56}
                      dragOffsetFromRightEdge={6}
                      animationOptions={JOURNEY_SWIPE_SPRING}
                      onSecondLeftSwipe={(methods) => {
                        pendingSwipeCloseRef.current = methods.close;
                        setDeleteCandidate(request);
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
                          label={t("routeRequest.delete")}
                          onPress={() => {
                            methods.close();
                            setDeleteCandidate(request);
                          }}
                        />
                      )}
                    >
                      {card}
                    </TwoStageSwipeable>
                  );
                })}
              </View>
            ))
          )}
        </View>
      </MePushPage>

      <AppActionDialog
        theme={theme}
        visible={Boolean(deleteCandidate)}
        title={t("routeRequest.delete")}
        message={t("routeRequest.deleteMessage")}
        confirmLabel={t("routeRequest.delete")}
        cancelLabel={t("common.cancel")}
        destructive
        confirmIcon="trash"
        confirming={Boolean(deletingId) && deletingId === deleteCandidate?.id}
        onCancel={() => {
          pendingSwipeCloseRef.current?.();
          pendingSwipeCloseRef.current = null;
          setDeleteCandidate(null);
        }}
        onConfirm={confirmDelete}
      />
    </>
  );
}

function RequestCard({
  theme,
  request,
  onPress,
}: {
  theme: Theme;
  request: RouteRequest;
  onPress: () => void;
}) {
  const { t } = useI18n();
  const closed = request.status === "rejected" || request.status === "duplicate";
  const color =
    request.status === "pending" ? theme.accent : closed ? theme.danger : theme.text2;
  const statusIcon = request.status === "pending" ? "clock" : closed ? "flag" : "check";
  const statusLabel = t(`routeRequest.${request.status}`);
  const photo = request.attachments?.find((a) => a.mime.startsWith("image/"))?.url;
  const hasTrack = Boolean(request.trackSnapshot);
  const openable = request.status === "accepted";
  return (
    <Press
      onPress={onPress}
      disabled={!openable}
      accessibilityRole="button"
      style={{ borderRadius: radius.feature }}
    >
      <AppCard
        theme={theme}
        radius={radius.feature}
        style={[styles.card, { backgroundColor: theme.fieldSurface }]}
      >
        <View style={{ minHeight: 86, flexDirection: "row", alignItems: "stretch", gap: space.md }}>
          <View style={{ flex: 1, minWidth: 0, paddingVertical: 2 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: space.xxs }}>
              <Icon name={statusIcon} color={color} size={12} strokeWidth={2.2} />
              <Text style={[type.caption, { color, fontWeight: "600" }]}>{statusLabel}</Text>
            </View>
            <Text
              numberOfLines={2}
              style={[type.cardTitle, { color: theme.text, marginTop: space.xxs }]}
            >
              {request.name}
            </Text>
            <View style={{ marginTop: space.xs, gap: 5 }}>
              {request.region ? (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 5, minWidth: 0 }}>
                  <Icon name="pin" color={theme.text3} size={12} />
                  <Text numberOfLines={1} style={[type.caption, { flex: 1, color: theme.text2 }]}>
                    {request.region}
                  </Text>
                </View>
              ) : null}
              {request.attachments?.length ? (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 5, minWidth: 0 }}>
                  <Icon name={hasTrack && !photo ? "route" : "photo"} color={theme.text3} size={12} />
                  <Text numberOfLines={1} style={[type.caption, { flex: 1, color: theme.text2 }]}>
                    {t("routeRequest.attachmentCount", { count: request.attachments.length })}
                  </Text>
                </View>
              ) : null}
              <View style={{ flexDirection: "row", alignItems: "center", gap: 5, minWidth: 0 }}>
                <Icon name="calendar" color={theme.text3} size={12} />
                <Text
                  numberOfLines={1}
                  style={[
                    type.caption,
                    { flex: 1, color: theme.text2, fontVariant: ["tabular-nums"] },
                  ]}
                >
                  {day(request.createdAt)}
                </Text>
              </View>
              {openable ? (
                <View
                  style={{ flexDirection: "row", alignItems: "center", gap: 5, marginTop: "auto", paddingTop: space.sm }}
                >
                  <Icon name="route" color={theme.text2} size={13} />
                  <Text style={[type.caption, { color: theme.text2 }]}>
                    {t("routeRequest.viewRoute")}
                  </Text>
                </View>
              ) : null}
            </View>
          </View>
          <View
            style={[
              styles.photo,
              { backgroundColor: theme.surfaceTop, borderColor: theme.fieldBorder },
            ]}
          >
            {photo ? (
              <Image
                source={{ uri: photo }}
                contentFit="cover"
                cachePolicy="memory-disk"
                transition={0}
                style={StyleSheet.absoluteFill}
              />
            ) : (
              <Icon name={hasTrack ? "route" : "compass"} color={theme.text3} size={24} />
            )}
          </View>
        </View>
        {closed && request.reviewNote ? (
          <View style={[styles.reason, { backgroundColor: theme.dangerSoft }]}>
            <Text numberOfLines={3} style={[type.hint, { color: theme.text }]}>
              <Text style={{ color: theme.danger, fontWeight: "600" }}>
                {t("routeRequest.reasonLabel")}
                {"　"}
              </Text>
              {request.reviewNote}
            </Text>
          </View>
        ) : null}
      </AppCard>
    </Press>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: layout.pagePadding, paddingBottom: space.xxxl },
  card: { boxShadow: "none", padding: space.md, borderWidth: 0, overflow: "hidden" },
  photo: {
    width: 82,
    height: 86,
    borderRadius: radius.card,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth,
  },
  reason: { marginTop: space.sm, paddingHorizontal: space.sm, paddingVertical: space.xs, borderRadius: radius.card },
});
