import React from 'react';
import { ScrollView, StyleSheet, Switch, Text, useWindowDimensions, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { layout, radius, space, type } from '../design-system';
import { Theme } from '../theme/theme';
import { Icon } from './Icon';
import { Press } from './Press';
import { NJBottomSheet } from './overlays/NewJourneyParts';

export type MapPresentationStyle = 'standard' | 'terrain' | 'satellite';

export interface MapDisplayOption {
  id: string;
  label: string;
  value: boolean;
  disabled?: boolean;
  onChange: (value: boolean) => void;
}

/** One recorded track, drawn as an on/off switch. */
export interface MapTrackOption {
  id: string;
  label: string;
  distance?: string;
  color: string;
  visible: boolean;
  onChange: (visible: boolean) => void;
}

/** A row that leads to another panel instead of switching something. */
export interface MapLinkOption {
  id: string;
  label: string;
  hint?: string;
  /** Draws a leading plus and tints the label: an "add / open" entry. */
  accent?: boolean;
  onPress: () => void;
}

export interface MapDisplaySection {
  id: string;
  title: string;
  options: (MapDisplayOption | MapTrackOption | MapLinkOption)[];
}

/** The share of the window the panel may take before its body starts scrolling. */
const SHEET_BODY_MAX = 0.6;

export function MapStylePickerSheet({
  theme,
  title,
  closeLabel,
  styleOptions,
  value,
  tracks,
  sections,
  bottomInset,
  onChange,
  onClose,
}: {
  theme: Theme;
  title: string;
  closeLabel: string;
  styleOptions: { id: MapPresentationStyle; label: string }[];
  value: MapPresentationStyle;
  /** The journey's recorded tracks, listed above the display groups. */
  tracks?: { title: string; options: MapTrackOption[] };
  sections: MapDisplaySection[];
  bottomInset: number;
  onChange: (value: MapPresentationStyle) => void;
  onClose: () => void;
}) {
  const windowHeight = useWindowDimensions().height;
  const sheetPaddingBottom = Math.max(bottomInset, space.sm);
  const header = (
    <View
      style={{
        minHeight: layout.iconButton,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: space.md,
      }}
    >
      <Text style={[type.navTitle, { color: theme.text }]}>{title}</Text>
      <Press
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel={closeLabel}
        hitSlop={8}
        style={{
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
  );
  const styleRow = (
    <View style={{ flexDirection: 'row', gap: space.sm }}>
      {styleOptions.map((option) => {
        const selected = value === option.id;
        return (
          <Press
            key={option.id}
            onPress={() => onChange(option.id)}
            scaleTo={1}
            opacityTo={1}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            style={{ flex: 1, minWidth: 0, alignItems: 'center', gap: space.xs }}
          >
            <MapStyleThumb theme={theme} styleId={option.id} selected={selected} />
            <Text
              numberOfLines={1}
              style={[type.labelStrong, { color: selected ? theme.accent : theme.text }]}
            >
              {option.label}
            </Text>
          </Press>
        );
      })}
    </View>
  );
  const body = (
    <>
      {tracks && tracks.options.length > 0 ? (
        <View style={{ marginTop: space.xl }}>
          <GroupLabel theme={theme} title={tracks.title} />
          {tracks.options.map((route) => (
            <TrackSwitchRow key={route.id} theme={theme} route={route} />
          ))}
        </View>
      ) : null}

      {sections.filter((section) => section.options.length > 0).map((section) => (
        <View key={section.id} style={{ marginTop: space.xl }}>
          <GroupLabel theme={theme} title={section.title} />
          {section.options.map((detail) => ('onPress' in detail ? (
            <Press
              key={detail.id}
              onPress={detail.onPress}
              accessibilityRole="button"
              accessibilityLabel={detail.hint ? `${detail.label} ${detail.hint}` : detail.label}
              style={{
                minHeight: 52,
                flexDirection: 'row',
                alignItems: 'center',
                gap: space.sm,
              }}
            >
              {detail.accent ? <Icon name="plus" color={theme.accent} size={20} strokeWidth={2.4} /> : null}
              <View style={{ flex: 1, minWidth: 0, paddingVertical: space.xs }}>
                <Text numberOfLines={1} style={[type.cardTitle, { lineHeight: 20, color: detail.accent ? theme.accent : theme.text }]}>{detail.label}</Text>
                {detail.hint ? <Text numberOfLines={1} style={[type.caption, { color: theme.text2, marginTop: space.xxs }]}>{detail.hint}</Text> : null}
              </View>
              <Icon name="chevronR" color={theme.text3} size={20} />
            </Press>
          ) : 'visible' in detail ? (
            <TrackSwitchRow key={detail.id} theme={theme} route={detail} />
          ) : (
            <View
              key={detail.id}
              style={{
                minHeight: 52,
                flexDirection: 'row',
                alignItems: 'center',
                gap: space.sm,
                opacity: detail.disabled ? 0.42 : 1,
              }}
            >
              <Text style={[type.cardTitle, { flex: 1, lineHeight: 20, color: theme.text }]}>{detail.label}</Text>
              <SwitchBox>
                <Switch
                  accessibilityLabel={detail.label}
                  value={detail.value}
                  disabled={detail.disabled}
                  onValueChange={detail.onChange}
                  trackColor={{
                    false: theme.progressTrack,
                    true: theme.accent,
                  }}
                  thumbColor="#FFFFFF"
                  ios_backgroundColor={theme.progressTrack}
                  style={{ alignSelf: 'center' }}
                />
              </SwitchBox>
            </View>
          )))}
        </View>
      ))}
    </>
  );
  return (
    <View style={[StyleSheet.absoluteFill, { zIndex: 200 }]} pointerEvents="box-none">
      <Press onPress={onClose} accessible={false} style={StyleSheet.absoluteFill} scaleTo={1} opacityTo={1}>
        <View style={StyleSheet.absoluteFill} />
      </Press>
      <NJBottomSheet theme={theme} onClose={onClose} full bodyScrolls showBackdrop={false} showGrabber={false} borderless backgroundColor={theme.featureSurface} bottomPadding={sheetPaddingBottom}>
        <View
          accessibilityViewIsModal
          style={{ paddingTop: space.xs }}
        >
          <View style={{ paddingHorizontal: layout.pagePadding }}>{header}</View>
          {/* The panel is as tall as its content; only a long journey track list
              reaches the cap and scrolls, so the map stays visible above it. */}
          <ScrollView
            style={{ maxHeight: Math.max(200, Math.round(windowHeight * SHEET_BODY_MAX) - sheetPaddingBottom) }}
            bounces={false}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: layout.pagePadding, paddingBottom: space.xxl }}
          >
            {styleRow}
            {body}
          </ScrollView>
        </View>
      </NJBottomSheet>
    </View>
  );
}

function GroupLabel({ theme, title }: { theme: Theme; title: string }) {
  return <Text style={[type.labelStrong, { color: theme.text2, marginBottom: space.xxs }]}>{title}</Text>;
}

function TrackSwitchRow({ theme, route }: { theme: Theme; route: MapTrackOption }) {
  return (
    <View
      style={{
        minHeight: 52,
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.sm,
      }}
    >
      <View
        style={{
          width: 10,
          height: 10,
          borderRadius: 5,
          backgroundColor: route.color,
        }}
      />
      <View style={{ flex: 1, minWidth: 0, paddingVertical: space.xs }}>
        <Text numberOfLines={1} style={[type.cardTitle, { lineHeight: 20, color: theme.text }]}>{route.label}</Text>
        {route.distance ? <Text style={[type.caption, { color: theme.text2, marginTop: space.xxs }]}>{route.distance}</Text> : null}
      </View>
      <SwitchBox>
        <Switch
          accessibilityLabel={route.label}
          value={route.visible}
          onValueChange={route.onChange}
          trackColor={{
            false: theme.progressTrack,
            true: theme.accent,
          }}
          thumbColor="#FFFFFF"
          ios_backgroundColor={theme.progressTrack}
          style={{ alignSelf: 'center' }}
        />
      </SwitchBox>
    </View>
  );
}

function SwitchBox({ children }: { children: React.ReactNode }) {
  return (
    <View
      style={{
        // No fixed width: native switches differ in size by platform and OS
        // version, and a box narrower than the switch clips its far edge.
        flexShrink: 0,
        minHeight: 32,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {children}
    </View>
  );
}

function MapStyleThumb({ theme, styleId, selected }: { theme: Theme; styleId: MapPresentationStyle; selected: boolean }) {
  return (
    <View
      style={{
        width: '100%',
        aspectRatio: 2,
        overflow: 'hidden',
        borderRadius: radius.card,
        borderWidth: 2,
        borderColor: selected ? theme.accent : 'transparent',
        backgroundColor: styleId === 'satellite' ? '#48513B' : theme.dark ? '#25272A' : '#E9ECE7',
      }}
    >
      <MapStylePreviewArtwork dark={theme.dark} styleId={styleId} />
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

  if (styleId === 'terrain') {
    return (
      <Svg width="100%" height="100%" viewBox="0 0 320 220" preserveAspectRatio="xMidYMid slice">
        <Path d="M0 0H320V220H0Z" fill={dark ? '#48513F' : '#DCE7C8'} />
        <Path d="M0 166C50 124 88 142 132 102C174 65 215 80 320 28V220H0Z" fill={dark ? '#5D6848' : '#C4D69F'} />
        <Path d="M-10 190C52 145 92 157 137 119C184 80 228 91 330 43" fill="none" stroke={dark ? '#9AA66D' : '#AABF7A'} strokeWidth="2" opacity="0.8" />
        <Path d="M-10 210C52 165 92 177 137 139C184 100 228 111 330 63" fill="none" stroke={dark ? '#9AA66D' : '#AABF7A'} strokeWidth="2" opacity="0.8" />
        <Path d="M-12 194C46 166 71 136 112 109C157 79 212 70 332 37" fill="none" stroke={dark ? '#D6C58E' : '#FFFFFF'} strokeWidth="5" opacity="0.9" />
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
