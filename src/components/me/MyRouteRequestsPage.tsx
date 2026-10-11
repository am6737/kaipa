import React from "react";
import { Text, View } from "react-native";
import { Theme } from "../../theme/theme";
import { useI18n } from "../../i18n";
import {
  AppCard,
  AppSectionHeader,
  radius,
  space,
  type,
} from "../../design-system";
import { Press } from "../Press";
import { MePushPage } from "./MePushPage";
import type { RouteRequest } from "../../hooks/useRouteRequests";

type Props = {
  theme: Theme;
  requests: RouteRequest[];
  onBack: () => void;
  onDelete: (request: RouteRequest) => void;
  onOpen: (request: RouteRequest) => void;
};

export function MyRouteRequestsPage({
  theme,
  requests,
  onBack,
  onDelete,
  onOpen,
}: Props) {
  const { t } = useI18n();
  const groups: Array<[RouteRequest["status"], string]> = [
    ["pending", t("routeRequest.pending")],
    ["accepted", t("routeRequest.accepted")],
    ["rejected", t("routeRequest.rejected")],
    ["duplicate", t("routeRequest.duplicate")],
  ];
  return (
    <MePushPage theme={theme} title={t("routeRequest.pageTitle")} onBack={onBack}>
      <View style={{ paddingHorizontal: space.lg, paddingBottom: space.xxxl }}>
        {requests.length === 0 ? (
          <Text
            style={[
              type.body,
              {
                color: theme.text2,
                textAlign: "center",
                marginTop: space.xxxl,
              },
            ]}
          >
            {t("routeRequest.empty")}
          </Text>
        ) : null}
        {groups.map(([status, label]) => {
          const rows = requests.filter((request) => request.status === status);
          if (!rows.length) return null;
          return (
            <View key={status} style={{ marginBottom: space.lg }}>
              <AppSectionHeader theme={theme} text={label} />
              {rows.map((request) => (
                <AppCard
                  key={request.id}
                  theme={theme}
                  radius={radius.feature}
                  style={{ padding: space.md, marginTop: space.sm }}
                >
                  <Press
                    onPress={() => status === "accepted" && onOpen(request)}
                    disabled={status !== "accepted"}
                  >
                    <Text style={[type.cardTitle, { color: theme.text }]}>
                      {request.name}
                    </Text>
                    <Text
                      style={[
                        type.caption,
                        { color: theme.text2, marginTop: space.xs },
                      ]}
                    >
                      {request.region}
                    </Text>
                    {request.reviewNote ? (
                      <Text
                        style={[
                          type.hint,
                          { color: theme.text2, marginTop: space.xs },
                        ]}
                      >
                        {request.reviewNote}
                      </Text>
                    ) : null}
                  </Press>
                  {status === "pending" ? (
                    <Press
                      onPress={() => onDelete(request)}
                      style={{ marginTop: space.sm }}
                    >
                      <Text style={[type.caption, { color: theme.danger }]}>
                        {t("routeRequest.delete")}
                      </Text>
                    </Press>
                  ) : null}
                </AppCard>
              ))}
            </View>
          );
        })}
      </View>
    </MePushPage>
  );
}
