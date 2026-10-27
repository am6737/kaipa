import type { ComponentType } from 'react';
import { Platform, type ViewProps } from 'react-native';
import { requireNativeViewManager, requireOptionalNativeModule } from 'expo-modules-core';

export type NativeMapScaleProps = ViewProps & { colorScheme?: 'light' | 'dark' };

function loadView(): ComponentType<NativeMapScaleProps> | null {
  if (Platform.OS !== 'ios') return null;
  // A binary older than the module, or Expo Go.
  if (!requireOptionalNativeModule('MapScale')) return null;
  try {
    return requireNativeViewManager<NativeMapScaleProps>('MapScale');
  } catch {
    return null;
  }
}

/** Apple's MKScaleView bound to the nearest map, or null where the binary lacks it. */
export const NativeMapScale = loadView();
