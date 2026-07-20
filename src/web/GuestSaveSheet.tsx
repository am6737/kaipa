import React, { useState, useCallback } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { Theme } from '../theme/theme';
import { Press } from '../components/Press';
import { useI18n } from '../i18n';

export interface SavablePhoto {
  id: string;
  uri: string;
}

interface Props {
  theme: Theme;
  photos: SavablePhoto[];
  onClose: () => void;
  onSaved: (count: number) => void;
}

function filenameFor(uri: string, id: string): string {
  const base = (uri.split('?')[0].split('/').pop() || '').trim();
  if (base && /\.[a-z0-9]{2,5}$/i.test(base)) return base;
  return `kaipa-${id}.jpg`;
}

// Web download: fetch as a blob so the `download` attribute works (also for
// cross-origin storage URLs); fall back to opening the image in a new tab.
async function downloadOne(uri: string, filename: string): Promise<void> {
  try {
    const res = await fetch(uri, { mode: 'cors' });
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch {
    window.open(uri, '_blank');
  }
}

export function GuestSaveSheet({ theme, photos, onClose, onSaved }: Props) {
  const { t } = useI18n();
  const { width: winW, height: winH } = useWindowDimensions();
  // Match the native PhotoWall save grid: 2 columns sized off the sheet's
  // padding (18) and the 7px grid gap.
  const colW = Math.floor((Math.min(winW, 560) - 18 * 2 - 7) / 2);
  const [selected, setSelected] = useState<Set<string>>(() => new Set(photos.map((p) => p.id)));
  const [saving, setSaving] = useState(false);

  const allOn = selected.size === photos.length && photos.length > 0;

  const toggle = (id: string) =>
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const toggleAll = () => setSelected(allOn ? new Set() : new Set(photos.map((p) => p.id)));

  const handleSave = useCallback(async () => {
    if (saving || selected.size === 0) return;
    setSaving(true);
    const items = photos.filter((p) => selected.has(p.id));
    for (const it of items) {
      await downloadOne(it.uri, filenameFor(it.uri, it.id));
      await new Promise((r) => setTimeout(r, 280)); // stagger so the browser allows the batch
    }
    setSaving(false);
    onSaved(items.length);
    onClose();
  }, [photos, selected, saving, onSaved, onClose]);

  return (
    <View style={StyleSheet.absoluteFill}>
      <Pressable style={s.backdrop} onPress={onClose} />
      <View style={s.sheetWrap}>
        <View style={[s.sheet, { backgroundColor: theme.dark ? '#1c1c1e' : theme.bg, maxHeight: Math.round(winH * 0.85) }]}>
          <View style={s.handle} />

          <View style={s.headerRow}>
            <View style={s.headerTitleWrap} pointerEvents="none">
              <Text style={[s.headerTitle, { color: theme.text }]}>{t('guest.wall.saveTitle')}</Text>
            </View>
            <Press onPress={onClose} style={s.headerBtn}>
              <Text style={[s.headerBtnText, { color: theme.text2 }]}>{t('guest.wall.cancel')}</Text>
            </Press>
            <Press onPress={toggleAll} style={s.headerBtn}>
              <Text style={[s.headerBtnText, { color: theme.accent }]}>
                {allOn ? t('guest.wall.deselectAll') : t('guest.wall.selectAll')}
              </Text>
            </Press>
          </View>

          <ScrollView style={s.scrollBody} showsVerticalScrollIndicator={false}>
            <View style={s.grid}>
              {photos.map((p) => {
                const on = selected.has(p.id);
                return (
                  <Press key={p.id} onPress={() => toggle(p.id)} style={[s.thumb, { width: colW }]}>
                    <Image source={{ uri: p.uri }} contentFit="cover" style={StyleSheet.absoluteFill} />
                    {!on && <View style={s.dim} />}
                    <View
                      style={[
                        s.check,
                        {
                          borderColor: on ? theme.accent : 'rgba(255,255,255,0.85)',
                          backgroundColor: on ? theme.accent : 'rgba(0,0,0,0.25)',
                        },
                      ]}
                    >
                      {on && <Text style={s.checkMark}>✓</Text>}
                    </View>
                  </Press>
                );
              })}
            </View>
          </ScrollView>

          <Press
            onPress={selected.size > 0 && !saving ? handleSave : undefined}
            style={[
              s.saveBtn,
              { backgroundColor: selected.size > 0 ? theme.accent : theme.dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)' },
            ]}
          >
            <Text style={[s.saveBtnText, { color: selected.size > 0 ? '#fff' : theme.text3 }]}>
              {saving ? t('guest.wall.saving') : t('guest.wall.saveCount', { count: String(selected.size) })}
            </Text>
          </Press>
        </View>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  sheetWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
  },
  sheet: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 18,
    paddingTop: 12,
    paddingBottom: 24,
  },
  handle: {
    width: 38,
    height: 5,
    borderRadius: 3,
    backgroundColor: 'rgba(128,128,128,0.3)',
    alignSelf: 'center',
    marginBottom: 14,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  headerBtn: {
    padding: 4,
  },
  headerBtnText: {
    fontSize: 14.5,
  },
  headerTitleWrap: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 16.5,
    fontWeight: '800',
  },
  scrollBody: {
    flexShrink: 1,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
    paddingBottom: 14,
  },
  thumb: {
    aspectRatio: 0.85,
    borderRadius: 14,
    overflow: 'hidden',
  },
  dim: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  check: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkMark: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '800',
  },
  saveBtn: {
    height: 50,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
  },
  saveBtnText: {
    fontSize: 15.5,
    fontWeight: '700',
  },
});
