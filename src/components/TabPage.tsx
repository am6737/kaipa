import React from 'react';
import { StyleSheet, View } from 'react-native';

type Props = {
  /** This page is the bottom-tab selection. */
  selected: boolean;
  /** A route/journey detail sits over the app: hide at once. */
  covered?: boolean;
  /** Shown whatever the selection — Discover carries the detail page. */
  forced?: boolean;
  /** How the page is put away while it is not shown. */
  whenHidden: 'transparent' | 'none' | 'keep';
  /** Whether the page is the one on screen. */
  children: (shown: boolean) => React.ReactNode;
};

/**
 * One bottom-tab page. A tab switch swaps pages at once, with no fade: every
 * page draws under the transparent status bar, so a crossfade made the strip
 * behind it flicker as if the status bar were redrawing.
 */
export function TabPage({ selected, covered = false, forced = false, whenHidden, children }: Props) {
  const shown = forced || (selected && !covered);
  const hiddenStyle = whenHidden === 'none' ? styles.none : whenHidden === 'transparent' ? styles.transparent : null;

  return (
    <View
      pointerEvents={shown ? 'auto' : 'none'}
      accessibilityElementsHidden={!shown}
      importantForAccessibility={shown ? 'auto' : 'no-hide-descendants'}
      style={[StyleSheet.absoluteFill, { zIndex: shown ? 1 : 0 }, !shown && hiddenStyle]}
    >
      {children(shown)}
    </View>
  );
}

const styles = StyleSheet.create({
  none: { display: 'none' },
  transparent: { opacity: 0 },
});
