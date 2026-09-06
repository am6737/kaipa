import React from 'react';
import { StyleSheet, Switch, Text, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
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
                    style={[type.cardTitle, { marginTop: space.xs, fontSize: 13, color: theme.text, fontWeight: '700' }]}
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
  return (
    <View
      style={{
        width: '100%',
        aspectRatio: 1,
        borderRadius: radius.card,
        shadowColor: '#000000',
        shadowOpacity: theme.dark ? 0.28 : 0.12,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 3 },
        elevation: 3,
      }}
    >
      <View
        style={{
          flex: 1,
          overflow: 'hidden',
          borderRadius: radius.card,
          borderWidth: selected ? 3 : StyleSheet.hairlineWidth,
          borderColor: selected ? theme.accent : theme.fieldBorder,
          backgroundColor: styleId === 'satellite' ? '#48513B' : theme.dark ? '#25272A' : '#E9ECE7',
        }}
      >
        <MapStylePreviewArtwork dark={theme.dark} styleId={styleId} />
      </View>
    </View>
  );
}

function MapStylePreviewArtwork({ dark, styleId }: { dark: boolean; styleId: MapPresentationStyle }) {
  if (styleId === 'satellite') {
    return (
      <Svg width="100%" height="100%" viewBox="0 0 320 220" preserveAspectRatio="xMidYMid slice">
        <Path d="M0 0H320V220H0Z" fill="#394431" />
        <Path d="M0 0H146L125 47L45 68L0 55Z" fill="#667054" />
        <Path d="M143 0H320V61L252 52L217 78L158 54Z" fill="#566148" />
        <Path d="M0 61L52 74L82 124L48 165L0 151Z" fill="#4E5D42" />
        <Path d="M87 67L151 58L194 92L180 142L111 151L73 116Z" fill="#71805E" />
        <Path d="M204 74L262 58L320 72V153L286 164L239 138L183 145L188 101Z" fill="#46553A" />
        <Path d="M0 158L52 170L104 151L157 163L146 220H0Z" fill="#606C4F" />
        <Path d="M150 151L207 144L247 152L320 165V220H145Z" fill="#73745A" />
        <Path d="M-12 192C46 166 71 136 112 109C157 79 212 70 332 37" fill="none" stroke="#C8C1A8" strokeWidth="12" opacity="0.82" />
        <Path d="M-12 192C46 166 71 136 112 109C157 79 212 70 332 37" fill="none" stroke="#E8E1C7" strokeWidth="5" opacity="0.88" />
        <Path d="M44 -8C60 47 97 68 139 92C185 119 230 135 330 142" fill="none" stroke="#B7B39C" strokeWidth="7" opacity="0.72" />
        <Path d="M49 -8C65 44 100 65 142 88C188 113 231 127 330 135" fill="none" stroke="#E3DBC2" strokeWidth="2.5" opacity="0.86" />
        <Path d="M230 -12C208 43 220 81 247 109C268 131 279 166 271 230" fill="none" stroke="#306D78" strokeWidth="9" opacity="0.9" />
        <Path d="M230 -12C208 43 220 81 247 109C268 131 279 166 271 230" fill="none" stroke="#72A5A6" strokeWidth="3" opacity="0.8" />
      </Svg>
    );
  }

  const land = dark ? '#282B2E' : '#EEF0EB';
  const park = dark ? '#334438' : '#CFE3C7';
  const water = dark ? '#263D48' : '#B8DDEC';
  const roadEdge = dark ? '#1C1E20' : '#D7D8D3';
  const road = dark ? '#686A6D' : '#FFFFFF';
  const route = dark ? '#9D8055' : '#E3B252';
  return (
    <Svg width="100%" height="100%" viewBox="0 0 320 220" preserveAspectRatio="xMidYMid slice">
      <Path d="M0 0H320V220H0Z" fill={land} />
      <Path d="M0 0H111L92 45L22 65L0 52Z" fill={park} />
      <Path d="M224 0H320V88L289 79L268 49L218 38Z" fill={park} />
      <Path d="M0 154L47 145L86 170L74 220H0Z" fill={park} />
      <Path d="M233 -10C210 42 216 78 245 107C273 135 281 169 270 230" fill="none" stroke={water} strokeWidth="25" />
      <Path d="M-12 193C47 167 71 136 112 109C158 79 211 70 332 37" fill="none" stroke={roadEdge} strokeWidth="15" />
      <Path d="M-12 193C47 167 71 136 112 109C158 79 211 70 332 37" fill="none" stroke={road} strokeWidth="10" />
      <Path d="M43 -8C59 45 95 67 140 92C188 119 231 136 330 142" fill="none" stroke={roadEdge} strokeWidth="10" />
      <Path d="M43 -8C59 45 95 67 140 92C188 119 231 136 330 142" fill="none" stroke={road} strokeWidth="6" />
      <Path d="M118 -8C119 47 126 88 165 127C190 153 206 182 213 229" fill="none" stroke={roadEdge} strokeWidth="8" />
      <Path d="M118 -8C119 47 126 88 165 127C190 153 206 182 213 229" fill="none" stroke={road} strokeWidth="4" />
      <Path d="M62 184C97 145 125 121 160 101C193 82 219 61 254 27" fill="none" stroke={route} strokeWidth="5" strokeLinecap="round" />
      <Circle cx="62" cy="184" r="7" fill={route} stroke={road} strokeWidth="3" />
      <Circle cx="254" cy="27" r="7" fill={route} stroke={road} strokeWidth="3" />
    </Svg>
  );
}
