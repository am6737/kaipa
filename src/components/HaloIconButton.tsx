import React from 'react';
import { Platform } from 'react-native';
import { layout } from '../design-system';
import type { Theme } from '../theme/theme';
import { Icon, type IconName } from './Icon';
import { Press } from './Press';

// The back and ⋯ controls over a map: a bare icon with no disc behind it, kept
// legible over any tiles by a light halo rather than a plate.
export function HaloIconButton({ theme, icon, onPress, accessibilityLabel }: { theme: Theme; icon: IconName; onPress: () => void; accessibilityLabel: string }) {
  return (
    <Press
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={{
        width: layout.iconButton,
        height: layout.iconButton,
        alignItems: 'center',
        justifyContent: 'center',
        // The glyph is an SVG, so the halo is a shadow on the subtree. iOS draws
        // a layer shadow from the content's alpha when the view itself is
        // transparent; Android needs the drop-shadow filter for the same.
        ...Platform.select({
          ios: { shadowColor: theme.dark ? '#000000' : '#FFFFFF', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.95, shadowRadius: 3 },
          default: { filter: theme.dark ? 'drop-shadow(0px 1px 3px rgba(0,0,0,0.9))' : 'drop-shadow(0px 1px 3px rgba(255,255,255,0.95))' },
        }),
      }}
    >
      <Icon name={icon} size={26} color={theme.text} strokeWidth={2.4} />
    </Press>
  );
}
