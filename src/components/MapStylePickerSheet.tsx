import React from 'react';
import { StyleSheet, Switch, Text, View } from 'react-native';
import { layout, radius, space, type } from '../design-system';
import { Theme } from '../theme/theme';
import { Icon } from './Icon';
import { Press } from './Press';
import { NJBottomSheet } from './overlays/NewJourneyParts';

export type MapPresentationStyle = 'standard' | 'satellite';

export interface MapDisplayOption {
  id: string;
  label: string;
  value: boolean;
  disabled?: boolean;
  onChange: (value: boolean) => void;
}

export function MapStylePickerSheet({
  theme,
  title,
  closeLabel,
  options,
  value,
  detailsTitle,
  details = [],
  bottomInset,
  onChange,
  onClose,
}: {
  theme: Theme;
  title: string;
  closeLabel: string;
  options: { id: MapPresentationStyle; label: string }[];
  value: MapPresentationStyle;
  detailsTitle?: string;
  details?: MapDisplayOption[];
  bottomInset: number;
  onChange: (value: MapPresentationStyle) => void;
  onClose: () => void;
}) {
  return (
    <View style={[StyleSheet.absoluteFill, { zIndex: 200 }]} pointerEvents="box-none">
      <Press
        onPress={onClose}
        accessible={false}
        style={StyleSheet.absoluteFill}
        scaleTo={1}
        opacityTo={1}
      >
        <View style={StyleSheet.absoluteFill} />
      </Press>
      <NJBottomSheet
        theme={theme}
        onClose={onClose}
        full
        bodyScrolls
        showBackdrop={false}
        showGrabber={false}
        borderless
        backgroundColor={theme.featureSurface}
        bottomPadding={Math.max(bottomInset, space.sm)}
      >
        <View
          accessibilityViewIsModal
          style={{
            paddingHorizontal: layout.pagePadding,
            paddingTop: space.xs,
          }}
        >
          <View style={{ minHeight: layout.iconButton, alignItems: 'center', justifyContent: 'center', marginBottom: space.lg }}>
            <Text style={[type.navTitle, { color: theme.text }]}>{title}</Text>
            <Press
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel={closeLabel}
              hitSlop={8}
              style={{
                position: 'absolute',
                right: 0,
                width: layout.iconButton,
                height: layout.iconButton,
                borderRadius: layout.iconButton / 2,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Icon name="close" size={22} color={theme.text} strokeWidth={2.1} />
            </Press>
          </View>

          <View style={{ flexDirection: 'row', gap: space.sm }}>
            {options.map((option) => {
              const selected = value === option.id;
              return (
                <Press
                  key={option.id}
                  onPress={() => onChange(option.id)}
                  scaleTo={1}
                  opacityTo={1}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  style={{
                    flex: 1,
                    minWidth: 0,
                    padding: space.xxs,
                    paddingBottom: space.xs,
                    borderRadius: radius.feature,
                    alignItems: 'center',
                  }}
                >
                  <MapStylePreview theme={theme} styleId={option.id} selected={selected} />
                  <Text
                    numberOfLines={1}
                    style={[type.cardTitle, { marginTop: space.xs, fontSize: 13, color: selected ? theme.accent : theme.text, fontWeight: '700' }]}
                  >
                    {option.label}
                  </Text>
                </Press>
              );
            })}
          </View>

          {details.length > 0 ? (
            <View style={{ marginTop: space.xxl }}>
              {detailsTitle ? (
                <Text style={[type.sectionTitle, { color: theme.text, marginBottom: space.sm }]}>
                  {detailsTitle}
                </Text>
              ) : null}
              <View>
                {details.map((detail, index) => (
                  <View
                    key={detail.id}
                    style={{
                      minHeight: 58,
                      paddingHorizontal: space.md,
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: space.sm,
                      opacity: detail.disabled ? 0.42 : 1,
                    }}
                  >
                    <Text style={[type.cardTitle, { flex: 1, lineHeight: 20, color: theme.text }]}>{detail.label}</Text>
                    <View style={{ width: 52, height: 32, alignItems: 'flex-end', justifyContent: 'center' }}>
                      <Switch
                        value={detail.value}
                        disabled={detail.disabled}
                        onValueChange={detail.onChange}
                        trackColor={{ false: theme.progressTrack, true: theme.accent }}
                        thumbColor="#FFFFFF"
                        ios_backgroundColor={theme.progressTrack}
                        style={{ alignSelf: 'center' }}
                      />
                    </View>
                  </View>
                ))}
              </View>
            </View>
          ) : null}
        </View>
      </NJBottomSheet>
    </View>
  );
}


function MapStylePreview({ theme, styleId, selected }: { theme: Theme; styleId: MapPresentationStyle; selected: boolean }) {
  const fallbackColor = styleId === 'satellite'
    ? (theme.dark ? '#263126' : '#6C785E')
    : (theme.dark ? '#2C2C2E' : '#EEF0ED');
  const fallbackIcon = styleId === 'satellite' ? 'photo' : 'globe';

  return (
    <View
      style={{
        width: '100%',
        aspectRatio: 1.12,
        overflow: 'hidden',
        borderRadius: radius.card,
        borderWidth: 2,
        borderColor: selected ? theme.accent : theme.fieldBorder,
        backgroundColor: fallbackColor,
      }}
    >
      <View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}>
        <Icon name={fallbackIcon} size={24} color={theme.dark ? theme.text2 : theme.text3} />
      </View>
    </View>
  );
}
