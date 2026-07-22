// GearCatEditor.tsx — 新建 / 编辑分类. A compact bottom sheet (reusing
// NJBottomSheet) that names a category and picks its colour from the Apple-Health
// compact preset swatches plus a custom HEX colour field. Hands back (name,
// color) to GearScreen, which creates or updates the category.
import React, { useEffect, useMemo, useState } from 'react';
import { PanResponder, ScrollView, View, Text, TextInput, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Theme } from '../../theme/theme';
import { Icon } from '../Icon';
import { Press } from '../Press';
import { NJBottomSheet } from '../overlays/NewJourneySheet';
import { useI18n } from '../../i18n';
import { GearCat, GX_PALETTE } from '../../data/gear';

const fieldBg = (t: Theme) => (t.dark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.045)');

type HSV = { h: number; s: number; v: number };

function hsvToHex({ h, s, v }: HSV): string {
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  let r = 0, g = 0, b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const part = (n: number) => Math.round((n + m) * 255).toString(16).padStart(2, '0').toUpperCase();
  return `#${part(r)}${part(g)}${part(b)}`;
}

function hexToHsv(hex: string): HSV {
  const valid = /^#[0-9A-Fa-f]{6}$/.test(hex) ? hex.slice(1) : 'FF3B30';
  const r = parseInt(valid.slice(0, 2), 16) / 255;
  const g = parseInt(valid.slice(2, 4), 16) / 255;
  const b = parseInt(valid.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d) {
    if (max === r) h = 60 * (((g - b) / d) % 6);
    else if (max === g) h = 60 * ((b - r) / d + 2);
    else h = 60 * ((r - g) / d + 4);
  }
  if (h < 0) h += 360;
  return { h, s: max === 0 ? 0 : d / max, v: max };
}

function ColorSlider({ colors, value, onChange }: { colors: readonly [string, string, ...string[]]; value: number; onChange: (value: number) => void }) {
  const [width, setWidth] = useState(1);
  const update = (x: number) => onChange(Math.max(0, Math.min(1, x / width)));
  const responder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: (event) => update(event.nativeEvent.locationX),
    onPanResponderMove: (event) => update(event.nativeEvent.locationX),
  }), [width, onChange]);
  return (
    <View
      onLayout={(event) => setWidth(Math.max(1, event.nativeEvent.layout.width))}
      {...responder.panHandlers}
      style={{ flex: 1, height: 30, justifyContent: 'center' }}
    >
      <LinearGradient colors={colors} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={{ height: 12, borderRadius: 6 }} />
      <View pointerEvents="none" style={{ position: 'absolute', left: Math.max(0, Math.min(width - 20, value * width - 10)), width: 20, height: 20, borderRadius: 10, backgroundColor: '#FFFFFF', borderWidth: 2, borderColor: 'rgba(0,0,0,0.28)', boxShadow: '0px 1px 4px rgba(0,0,0,0.28)' }} />
    </View>
  );
}

function CustomColorPicker({ theme, value, onChange }: { theme: Theme; value: string; onChange: (hex: string) => void }) {
  const { t } = useI18n();
  const [hsv, setHsv] = useState<HSV>(() => hexToHsv(value));
  useEffect(() => setHsv(hexToHsv(value)), [value]);
  const update = (patch: Partial<HSV>) => {
    const next = { ...hsv, ...patch };
    setHsv(next);
    onChange(hsvToHex(next));
  };
  const hueColor = hsvToHex({ h: hsv.h, s: 1, v: 1 });
  const saturatedColor = hsvToHex({ h: hsv.h, s: hsv.s, v: 1 });
  return (
    <View style={{ paddingHorizontal: 13, paddingVertical: 11, borderRadius: 14, backgroundColor: fieldBg(theme), borderWidth: StyleSheet.hairlineWidth, borderColor: theme.hairline }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Text style={{ width: 36, fontSize: 11.5, color: theme.text2 }}>{t('gear.catEditor.hue')}</Text>
        <ColorSlider colors={['#FF0000', '#FFFF00', '#00FF00', '#00FFFF', '#0000FF', '#FF00FF', '#FF0000']} value={hsv.h / 360} onChange={(n) => update({ h: n * 360 })} />
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4 }}>
        <Text style={{ width: 36, fontSize: 11.5, color: theme.text2 }}>{t('gear.catEditor.saturation')}</Text>
        <ColorSlider colors={['#FFFFFF', hueColor]} value={hsv.s} onChange={(s) => update({ s })} />
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4 }}>
        <Text style={{ width: 36, fontSize: 11.5, color: theme.text2 }}>{t('gear.catEditor.brightness')}</Text>
        <ColorSlider colors={['#000000', saturatedColor]} value={hsv.v} onChange={(v) => update({ v })} />
      </View>
    </View>
  );
}

export function GearCatEditor({
  theme,
  mode,
  initial,
  existing,
  onCancel,
  onSave,
}: {
  theme: Theme;
  mode: 'new' | 'edit';
  initial?: GearCat | null;
  existing: string[];
  onCancel: () => void;
  onSave: (name: string, color: string) => void;
}) {
  const { t } = useI18n();
  const [name, setName] = useState(initial ? initial.name : '');
  const [color, setColor] = useState(initial ? initial.color : GX_PALETTE[0]);
  const [hex, setHex] = useState((initial ? initial.color : GX_PALETTE[0]).toUpperCase());
  const trimmed = name.trim();
  // The category's own current name shouldn't count as a duplicate when editing.
  const dup = existing.includes(trimmed) && !(initial && trimmed === initial.name);
  const normalizedHex = hex.trim().toUpperCase();
  const hexValid = /^#[0-9A-F]{6}$/.test(normalizedHex);
  const valid = !!trimmed && !dup && hexValid;

  const save = () => {
    if (!valid) return;
    onSave(trimmed, normalizedHex);
  };

  return (
    <NJBottomSheet theme={theme} onClose={onCancel} full bodyScrolls keyboardAvoiding bottomPadding={8} fillBehindKeyboard>
      <View style={{ paddingHorizontal: 20, paddingTop: 2, paddingBottom: 14 }}>
        <Text style={{ fontSize: 20, fontWeight: '800', letterSpacing: -0.35, color: theme.text }}>{mode === 'edit' ? t('gear.catEditor.titleEdit') : t('gear.catEditor.titleNew')}</Text>
      </View>
      <ScrollView
        style={{ flexShrink: 1 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: 12 }}
      >
        {/* name */}
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder={t('gear.catEditor.namePlaceholder')}
          placeholderTextColor={theme.text3}
          maxLength={8}
          autoFocus
          style={{
            paddingHorizontal: 14,
            height: 46,
            borderRadius: 12,
            backgroundColor: fieldBg(theme),
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: dup ? theme.danger : 'transparent',
            fontSize: 15.5,
            color: theme.text,
          }}
        />
        <Text style={{ height: 16, fontSize: 11, color: theme.danger, marginTop: 4, marginLeft: 2 }}>{dup ? t('gear.catEditor.dupName') : ''}</Text>

        {/* colour */}
        <Text style={{ fontSize: 12, fontWeight: '600', color: theme.text3, letterSpacing: 0.4, textTransform: 'uppercase', marginTop: 4, marginBottom: 12, marginLeft: 2 }}>{t('gear.catEditor.color')}</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {GX_PALETTE.map((c) => {
            const on = c.toLowerCase() === color.toLowerCase();
            return (
              <Press key={c} onPress={() => { setColor(c); setHex(c); }} style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}>
                <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: c, alignItems: 'center', justifyContent: 'center' }}>
                  {on ? <Icon name="check" color="#fff" size={16} strokeWidth={3} /> : null}
                </View>
                {on ? <View pointerEvents="none" style={{ position: 'absolute', top: 1, left: 1, width: 38, height: 38, borderRadius: 19, borderWidth: 2, borderColor: c }} /> : null}
              </Press>
            );
          })}
        </View>

        <Text style={{ fontSize: 12, fontWeight: '600', color: theme.text3, letterSpacing: 0.4, textTransform: 'uppercase', marginTop: 18, marginBottom: 9, marginLeft: 2 }}>{t('gear.catEditor.customColor')}</Text>
        <CustomColorPicker
          theme={theme}
          value={color}
          onChange={(next) => { setColor(next); setHex(next); }}
        />
        <View style={{ height: 46, marginTop: 10, paddingHorizontal: 13, borderRadius: 12, flexDirection: 'row', alignItems: 'center', backgroundColor: fieldBg(theme), borderWidth: StyleSheet.hairlineWidth, borderColor: hexValid ? 'transparent' : theme.danger }}>
          <View style={{ width: 24, height: 24, borderRadius: 8, marginRight: 11, backgroundColor: hexValid ? normalizedHex : theme.hairline, borderWidth: StyleSheet.hairlineWidth, borderColor: theme.hairline }} />
          <TextInput
            value={hex}
            onChangeText={(value) => {
              const digits = value.replace(/#/g, '').replace(/[^0-9a-fA-F]/g, '').slice(0, 6).toUpperCase();
              const next = `#${digits}`;
              setHex(next);
              if (/^#[0-9A-F]{6}$/.test(next)) setColor(next);
            }}
            placeholder="#34C759"
            placeholderTextColor={theme.text3}
            maxLength={7}
            autoCapitalize="characters"
            autoCorrect={false}
            spellCheck={false}
            style={{ flex: 1, padding: 0, fontSize: 15, fontWeight: '600', color: theme.text }}
          />
          {hexValid ? <Icon name="check" color={theme.accent} size={16} strokeWidth={2.4} /> : null}
        </View>
        <Text style={{ minHeight: 16, marginTop: 4, marginLeft: 2, fontSize: 11, color: theme.danger }}>{hexValid ? '' : t('gear.catEditor.invalidColor')}</Text>
      </ScrollView>
      <View style={{ paddingHorizontal: 18, paddingTop: 10, flexDirection: 'row', gap: 10 }}>
        <Press onPress={onCancel} style={{ flex: 1, height: 50, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.dark ? '#2C2C2E' : '#FFFFFF', borderWidth: StyleSheet.hairlineWidth, borderColor: theme.hairline }}>
          <Text style={{ fontSize: 15.5, fontWeight: '700', color: theme.text }}>{t('common.cancel')}</Text>
        </Press>
        <Press disabled={!valid} onPress={save} style={{ flex: 1.35, height: 50, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: valid ? theme.accent : fieldBg(theme) }}>
          <Text style={{ fontSize: 15.5, fontWeight: '800', color: valid ? '#FFFFFF' : theme.text3 }}>{t('common.save')}</Text>
        </Press>
      </View>
    </NJBottomSheet>
  );
}
