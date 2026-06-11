// AppearanceContext — owns theme mode + accent for the whole app, persists them,
// resolves 'system' against the OS color scheme, and exposes the built Theme.
// The 我 (Me) screen reads/writes through useAppearance().
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { makeTheme, Theme } from './theme';

type AppearanceMode = 'system' | 'light' | 'dark';

interface AppearanceValue {
  mode: AppearanceMode;
  accent: string;
  resolved: 'light' | 'dark';
  theme: Theme;
  setMode: (m: AppearanceMode) => void;
  setAccent: (c: string) => void;
}

const AppearanceContext = createContext<AppearanceValue | null>(null);

const K_MODE = 'kaipa_appearance_mode_v1';
const K_ACCENT = 'kaipa_accent_v1';

export function AppearanceProvider({ children }: { children: React.ReactNode }) {
  const system = useColorScheme();
  const [mode, setModeRaw] = useState<AppearanceMode>('system');
  const [accent, setAccentRaw] = useState<string>('#0A84FF');

  useEffect(() => {
    (async () => {
      try {
        const [m, a] = await Promise.all([
          AsyncStorage.getItem(K_MODE),
          AsyncStorage.getItem(K_ACCENT),
        ]);
        if (m === 'system' || m === 'light' || m === 'dark') setModeRaw(m);
        if (a) setAccentRaw(a);
      } catch {}
    })();
  }, []);

  const setMode = (m: AppearanceMode) => {
    setModeRaw(m);
    AsyncStorage.setItem(K_MODE, m).catch(() => {});
  };
  const setAccent = (c: string) => {
    setAccentRaw(c);
    AsyncStorage.setItem(K_ACCENT, c).catch(() => {});
  };

  const resolved: 'light' | 'dark' =
    mode === 'system' ? (system === 'dark' ? 'dark' : 'light') : mode;

  const theme = useMemo(() => makeTheme(resolved, accent), [resolved, accent]);

  const value = useMemo<AppearanceValue>(
    () => ({ mode, accent, resolved, theme, setMode, setAccent }),
    [mode, accent, resolved, theme]
  );

  return <AppearanceContext.Provider value={value}>{children}</AppearanceContext.Provider>;
}

export function useAppearance(): AppearanceValue {
  const v = useContext(AppearanceContext);
  if (!v) throw new Error('useAppearance must be used within AppearanceProvider');
  return v;
}

export function useTheme(): Theme {
  return useAppearance().theme;
}
