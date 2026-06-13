// i18n — owns the app language (system | zh | en), persists it, resolves
// 'system' against the device locale, and exposes a type-safe t(). Mirrors the
// AppearanceContext pattern. The 我 (Me) screen reads/writes via useI18n().
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { zh } from './locales/zh';
import { en } from './locales/en';
import type { DictNode, LeafPath } from './types';

export type Lang = 'system' | 'zh' | 'en';
export type ResolvedLang = 'zh' | 'en';
export type TKey = LeafPath<typeof zh>;
export type TVars = Record<string, string | number>;

const K_LANG = 'kaipa_lang_v1';
const DICTS: Record<ResolvedLang, DictNode> = { zh, en };

// Best-effort device-language detection. Lazy-required so a dev client that
// hasn't been rebuilt with the native module still runs (falls back to zh).
function detectDeviceLang(): ResolvedLang {
  try {
    const { getLocales } = require('expo-localization');
    const code: string | undefined = getLocales?.()?.[0]?.languageCode;
    return code === 'zh' ? 'zh' : 'en';
  } catch {
    return 'zh';
  }
}

function resolveString(dict: DictNode, key: string): string | undefined {
  let cur: string | DictNode | undefined = dict;
  for (const part of key.split('.')) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = cur[part];
  }
  return typeof cur === 'string' ? cur : undefined;
}

export function translate(resolved: ResolvedLang, key: TKey, vars?: TVars): string {
  const str =
    resolveString(DICTS[resolved], key) ??
    resolveString(zh, key) ?? // fall back to the source language
    key; // last resort: surface the key so a gap is visible, never blank
  if (!vars) return str;
  return str.replace(/\{(\w+)\}/g, (_, name: string) =>
    name in vars ? String(vars[name]) : `{${name}}`
  );
}

interface I18nValue {
  lang: Lang;
  resolved: ResolvedLang;
  t: (key: TKey, vars?: TVars) => string;
  setLang: (l: Lang) => void;
}

const I18nContext = createContext<I18nValue | null>(null);

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangRaw] = useState<Lang>('system');
  const [deviceLang, setDeviceLang] = useState<ResolvedLang>('zh');

  useEffect(() => {
    setDeviceLang(detectDeviceLang());
    AsyncStorage.getItem(K_LANG)
      .then((v) => {
        if (v === 'system' || v === 'zh' || v === 'en') setLangRaw(v);
      })
      .catch(() => {});
  }, []);

  const setLang = (l: Lang) => {
    setLangRaw(l);
    AsyncStorage.setItem(K_LANG, l).catch(() => {});
  };

  const resolved: ResolvedLang = lang === 'system' ? deviceLang : lang;

  const t = useMemo(
    () => (key: TKey, vars?: TVars) => translate(resolved, key, vars),
    [resolved]
  );

  const value = useMemo<I18nValue>(
    () => ({ lang, resolved, t, setLang }),
    [lang, resolved, t]
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const v = useContext(I18nContext);
  if (!v) throw new Error('useI18n must be used within I18nProvider');
  return v;
}

// Convenience: pull just the translator when that's all a component needs.
export function useT(): (key: TKey, vars?: TVars) => string {
  return useI18n().t;
}
