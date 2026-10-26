// MapControls.tsx — the right-hand map control column, shared by the pages
// that float a map (自由记录 and 发现 list mode).
//
// The group is the surface: one rounded container with a hairline border, and
// each control inside is only an icon that turns accent while its state is on.
// Keeping the surface on the group rather than on every button is what stops a
// stack of buttons reading as several separate chips. A control that is not a
// state toggle — the compass, 开始记录 — stays a round button of its own.
import React, { type ReactNode } from 'react';
import { Animated, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { radius, space } from '../design-system';
import type { Theme } from '../theme/theme';
import { MapCompassGlyph } from './maps/MapCompass';
import { Icon, type IconName } from './Icon';
import { Press } from './Press';

export const MAP_CONTROL_SIZE = 40;

export function MapControlGroup({ theme, style, children }: {
  theme: Theme;
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
}) {
  return (
    <View
      style={[{
        borderRadius: radius.pill,
        backgroundColor: theme.controlSurface,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: theme.fieldBorder,
        overflow: 'hidden',
      }, style]}
    >
      {children}
    </View>
  );
}

export function MapControlButton({
  theme,
  icon,
  element,
  active,
  onPress,
  accessibilityLabel,
  children,
}: {
  theme: Theme;
  icon?: IconName;
  /** A glyph outside the shared icon set, tinted by the caller. */
  element?: ReactNode;
  active?: boolean;
  onPress: () => void;
  accessibilityLabel: string;
  /** Replaces the icon — for a control whose glyph is a spinner or a live heading. */
  children?: ReactNode;
}) {
  return (
    <Press
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={active != null ? { selected: active } : undefined}
      style={{
        width: MAP_CONTROL_SIZE,
        height: MAP_CONTROL_SIZE,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {children ?? element ?? (icon ? <Icon name={icon} color={active ? theme.accent : theme.text} size={18} /> : null)}
    </Press>
  );
}

// A lone round button, `space.sm` above whatever sits under it: the compass,
// which only appears while the map is turned off north, and 开始记录.
export function MapRoundButton({ theme, heading, icon, element, onPress, accessibilityLabel }: {
  theme: Theme;
  /** When set, the button shows the live compass needle instead of an icon. */
  heading?: Animated.Value;
  icon?: IconName;
  /** A glyph outside the shared icon set. */
  element?: ReactNode;
  onPress: () => void;
  accessibilityLabel: string;
}) {
  return (
    <Press
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={{
        width: MAP_CONTROL_SIZE,
        height: MAP_CONTROL_SIZE,
        borderRadius: MAP_CONTROL_SIZE / 2,
        marginBottom: space.sm,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: theme.controlSurface,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: theme.fieldBorder,
      }}
    >
      {heading ? <MapCompassGlyph heading={heading} color={theme.text} /> : null}
      {!heading && element}
      {!heading && !element && icon ? <Icon name={icon} color={theme.text} size={18} /> : null}
    </Press>
  );
}
