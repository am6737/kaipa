import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo-modules-core';

export interface ClipboardProbe {
  /** Pasteboard write counter; the cheapest way to ask "did anything change since last time?". */
  changeCount(): number | null;
  /** Whether the pasteboard text contains a link, answered without reading it and without the iOS paste banner. */
  detectLink(): Promise<boolean>;
}

function loadProbe(): ClipboardProbe | null {
  if (Platform.OS !== 'ios') return null;
  // Expo Go, or an installed binary that predates the module.
  const native = requireOptionalNativeModule<{
    changeCount?: () => number | null;
    detectLink?: () => Promise<boolean>;
  }>('ClipboardProbe');
  if (!native?.changeCount || !native.detectLink) return null;
  return {
    changeCount: () => native.changeCount?.() ?? null,
    detectLink: () => native.detectLink?.() ?? Promise.resolve(false),
  };
}

/** The iOS pasteboard probe, or null wherever iOS cannot gate a read — the caller must then not auto-detect. */
export const clipboardProbe = loadProbe();
