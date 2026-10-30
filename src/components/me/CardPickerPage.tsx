// CardPickerPage — shared card-style single-choice page (语言 / 主题 / 重点色 /
// 重量单位). Each option is a standalone rounded card: optional leading tile,
// title plus optional per-option description, and a circular radio on the right.
// Text shared by every option goes in `subtitle` instead of repeating it.
// Selecting updates in place; the page stays open.
import React, { useState } from "react";
import { View, Text } from "react-native";
import { Theme } from "../../theme/theme";
import { MePushPage } from "./MePushPage";
import { Icon } from "../Icon";
import { Press } from "../Press";
import { radius, space, type } from "../../design-system";

export interface CardPickerOption {
  id: string;
  title: string;
  description?: string;
  leading?: React.ReactNode;
}

const RADIO_SIZE = 28;

export function CardPickerPage({
  theme,
  navTitle,
  pageTitle,
  subtitle,
  options,
  selectedId,
  onSelect,
  onBack,
}: {
  theme: Theme;
  navTitle: string;
  pageTitle?: string;
  subtitle?: string;
  options: CardPickerOption[];
  selectedId: string;
  onSelect: (id: string) => void;
  onBack: () => void;
}) {
  // onSelect rebuilds the app-wide theme/i18n context, which re-renders every
  // screen behind this page; paint the radio first and commit a frame later so
  // the tap response isn't stuck behind that render.
  const [pendingId, setPendingId] = useState<string | null>(null);
  const shownId = pendingId ?? selectedId;
  const commit = (id: string) => {
    setPendingId(id);
    requestAnimationFrame(() => requestAnimationFrame(() => onSelect(id)));
  };
  return (
    <MePushPage theme={theme} title={navTitle} onBack={onBack}>
      <View style={{ paddingHorizontal: space.xl, paddingTop: space.lg }}>
        {pageTitle ? (
          <Text style={[type.sectionTitle, { color: theme.text }]}>
            {pageTitle}
          </Text>
        ) : null}
        {subtitle ? (
          <Text
            style={[
              type.hint,
              {
                color: theme.text2,
                marginTop: space.xxs,
                marginBottom: space.lg,
              },
            ]}
          >
            {subtitle}
          </Text>
        ) : null}
        {options.map((option) => {
          const selected = option.id === shownId;
          return (
            <Press
              key={option.id}
              onPress={() => commit(option.id)}
              scaleTo={1}
              opacityTo={0.9}
            >
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: space.md,
                  paddingHorizontal: space.lg,
                  paddingVertical: space.lg,
                  borderRadius: radius.feature,
                  backgroundColor: theme.surfaceTop,
                  marginBottom: space.md,
                }}
              >
                {option.leading}
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text
                    style={{
                      fontSize: 19,
                      fontWeight: "700",
                      color: theme.text,
                      letterSpacing: 0,
                    }}
                  >
                    {option.title}
                  </Text>
                  {option.description ? (
                    <Text
                      style={[
                        type.body,
                        { color: theme.text2, marginTop: space.xs },
                      ]}
                    >
                      {option.description}
                    </Text>
                  ) : null}
                </View>
                {selected ? (
                  <View
                    style={{
                      width: RADIO_SIZE,
                      height: RADIO_SIZE,
                      borderRadius: RADIO_SIZE / 2,
                      backgroundColor: theme.accent,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Icon
                      name="check"
                      color="#FFFFFF"
                      size={16}
                      strokeWidth={2.6}
                    />
                  </View>
                ) : (
                  <View
                    style={{
                      width: RADIO_SIZE,
                      height: RADIO_SIZE,
                      borderRadius: RADIO_SIZE / 2,
                      borderWidth: 2,
                      borderColor: theme.progressTrack,
                    }}
                  />
                )}
              </View>
            </Press>
          );
        })}
      </View>
    </MePushPage>
  );
}
