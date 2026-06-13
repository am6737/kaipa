// GearCatEditor.tsx — 新建 / 编辑分类. A compact bottom sheet (reusing
// NJBottomSheet) that names a category and picks its colour from the Apple-Health
// GX_PALETTE swatch grid. Mirrors the prototype's GxAddSheet: live duplicate-name
// check, a 取消 / 标题 / 保存 header, and a selected-swatch check mark. Hands back
// (name, color) to GearScreen, which creates or updates the category.
import React, { useState } from 'react';
import { View, Text, TextInput, StyleSheet } from 'react-native';
import { Theme } from '../../theme/theme';
import { Icon } from '../Icon';
import { Press } from '../Press';
import { NJBottomSheet } from '../overlays/NewJourneySheet';
import { useI18n } from '../../i18n';
import { GearCat, GX_PALETTE } from '../../data/gear';

const fieldBg = (t: Theme) => (t.dark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.045)');

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
  const trimmed = name.trim();
  // The category's own current name shouldn't count as a duplicate when editing.
  const dup = existing.includes(trimmed) && !(initial && trimmed === initial.name);
  const valid = !!trimmed && !dup;

  const save = () => {
    if (!valid) return;
    onSave(trimmed, color);
  };

  return (
    <NJBottomSheet theme={theme} onClose={onCancel} full>
      <View style={{ paddingHorizontal: 18, paddingBottom: 8 }}>
        {/* header */}
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 14 }}>
          <Press onPress={onCancel} hitSlop={8} style={{ padding: 4 }}>
            <Text style={{ fontSize: 14.5, color: theme.text2, fontWeight: '500' }}>{t('common.cancel')}</Text>
          </Press>
          <Text style={{ flex: 1, textAlign: 'center', fontSize: 16, fontWeight: '700', color: theme.text }}>{mode === 'edit' ? t('gear.catEditor.titleEdit') : t('gear.catEditor.titleNew')}</Text>
          <Press onPress={save} disabled={!valid} hitSlop={8} style={{ padding: 4 }}>
            <Text style={{ fontSize: 14.5, fontWeight: '700', color: valid ? theme.accent : theme.text3 }}>{t('common.save')}</Text>
          </Press>
        </View>

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
              <Press key={c} onPress={() => setColor(c)} style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}>
                <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: c, alignItems: 'center', justifyContent: 'center' }}>
                  {on ? <Icon name="check" color="#fff" size={16} strokeWidth={3} /> : null}
                </View>
                {on ? <View pointerEvents="none" style={{ position: 'absolute', top: 1, left: 1, width: 38, height: 38, borderRadius: 19, borderWidth: 2, borderColor: c }} /> : null}
              </Press>
            );
          })}
        </View>
      </View>
    </NJBottomSheet>
  );
}
