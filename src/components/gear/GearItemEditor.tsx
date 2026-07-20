// GearItemEditor.tsx — 编辑装备. A full-screen slide-up form mirroring the
// prototype's ConfirmView: a live photo preview (derived from the name), an
// editable title, a 规格 card (分类 chips · 数量 stepper · 重量 · 价值), an
// add/remove 自定义属性 list, and a 备注 field, over a sticky 保存修改 bar.
// Returns the rebuilt GearItem to onSave; GearScreen handles renames + sync.
import React, { useEffect, useRef, useState } from 'react';
import { Animated, View, Text, TextInput, ScrollView, StyleSheet, Dimensions, KeyboardAvoidingView, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Theme } from '../../theme/theme';
import { MONO } from '../../theme/fonts';
import { Icon } from '../Icon';
import { Press } from '../Press';
import { PhotoTile } from '../PhotoTile';
import { useI18n } from '../../i18n';
import { GearItem, GearCat, GEAR_STATUS, GearCarryStatus } from '../../data/gear';
import { GearCard, SectionLabel, CircleBtn, toneFor } from './parts';

const fieldBg = (t: Theme) => (t.dark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.045)');
const numClean = (s: string) => s.replace(/[^0-9.]/g, '');

export function GearItemEditor({
  theme,
  item,
  cats,
  mode = 'edit',
  existingNames = [],
  onCancel,
  onSave,
}: {
  theme: Theme;
  item: GearItem;
  cats: GearCat[];
  mode?: 'new' | 'edit';
  existingNames?: string[];
  onCancel: () => void;
  onSave: (next: GearItem) => void;
}) {
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const screenH = Dimensions.get('window').height;
  const ty = useRef(new Animated.Value(screenH)).current;
  useEffect(() => {
    Animated.spring(ty, { toValue: 0, useNativeDriver: true, bounciness: 0, speed: 16 }).start();
  }, [ty]);

  const [name, setName] = useState(item.name);
  const [cat, setCat] = useState(item.cat);
  const [w, setW] = useState(item.w != null ? String(item.w) : '');
  const [p, setP] = useState(item.p != null ? String(item.p) : '');
  const [qty, setQty] = useState(item.qty || 1);
  const [status, setStatus] = useState<GearCarryStatus>(item.status || 'packed');
  const [attrs, setAttrs] = useState<[string, string][]>((item.attrs || []).map((a) => [a[0], a[1]] as [string, string]));
  const [note, setNote] = useState(item.note || '');
  const [editCat, setEditCat] = useState(false);

  const trimmed = name.trim();
  // The item's own current name shouldn't count as a duplicate when editing.
  const dup = existingNames.includes(trimmed) && trimmed !== item.name;
  const valid = trimmed.length > 0 && !dup;
  const curCat = cats.find((c) => c.id === cat);
  // New items have no stable name yet, so the preview tracks what's typed;
  // editing keeps the original photo (the app derives gear photos from the name).
  const heroSeed = mode === 'new' ? trimmed || 'gear' : item.name;

  const setAttr = (i: number, j: 0 | 1, val: string) => setAttrs((a) => a.map((x, k) => (k === i ? (j === 0 ? [val, x[1]] : [x[0], val]) : x)));
  const addAttr = () => setAttrs((a) => [...a, ['', '']]);
  const delAttr = (i: number) => setAttrs((a) => a.filter((_, k) => k !== i));

  const submit = () => {
    if (!valid) return;
    const cleanAttrs = attrs.map(([k, v]) => [k.trim(), v.trim()] as [string, string]).filter(([k, v]) => k && v);
    onSave({
      ...item,
      name: name.trim(),
      cat,
      w: Number(w) || 0,
      p: Number(p) || 0,
      qty: qty > 1 ? qty : undefined,
      status,
      attrs: cleanAttrs.length ? cleanAttrs : undefined,
      note: note.trim() || undefined,
    });
  };

  const inputBase = { fontSize: 14.5, color: theme.text, padding: 0 } as const;

  return (
    <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: theme.bg, transform: [{ translateY: ty }] }]}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive" contentContainerStyle={{ paddingBottom: 28 }}>
          {/* photo preview */}
          <PhotoTile tone={toneFor(heroSeed)} seed={heroSeed} radius={0} resWidth={1000} darken style={{ width: '100%', height: 220 }} />

          <View style={{ paddingHorizontal: 18 }}>
            {/* name */}
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder={t('gear.editor.namePlaceholder')}
              placeholderTextColor={theme.text3}
              style={{ marginTop: 16, fontSize: 23, fontWeight: '800', letterSpacing: -0.5, color: theme.text, padding: 0 }}
            />
            {dup ? <Text style={{ fontSize: 11.5, color: theme.danger, marginTop: 5 }}>{t('gear.editor.dupName')}</Text> : null}

            {/* 规格 */}
            <SectionLabel theme={theme} text={t('gear.section.spec')} />
            <GearCard theme={theme}>
              {/* category */}
              <Press onPress={() => setEditCat((v) => !v)} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 13 }}>
                <Text style={{ fontSize: 14.5, color: theme.text }}>{t('gear.spec.category')}</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
                  <View style={{ width: 9, height: 9, borderRadius: 3, backgroundColor: curCat ? curCat.color : theme.text3 }} />
                  <Text style={{ fontSize: 14.5, fontWeight: '600', color: theme.text2 }}>{curCat ? curCat.name : t('gear.uncategorized')}</Text>
                  <View style={{ transform: [{ rotate: editCat ? '90deg' : '0deg' }] }}>
                    <Icon name="chevronR" color={theme.text3} size={14} />
                  </View>
                </View>
              </Press>
              {editCat ? (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7, paddingHorizontal: 16, paddingBottom: 14 }}>
                  {cats.map((c) => {
                    const on = c.id === cat;
                    return (
                      <Press
                        key={c.id}
                        onPress={() => { setCat(c.id); setEditCat(false); }}
                        style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, backgroundColor: on ? theme.accentSoft : fieldBg(theme), borderWidth: 1, borderColor: on ? theme.accent : 'transparent' }}
                      >
                        <View style={{ width: 7, height: 7, borderRadius: 2, backgroundColor: c.color }} />
                        <Text style={{ fontSize: 12.5, fontWeight: '600', color: on ? theme.accent : theme.text2 }}>{c.name}</Text>
                      </Press>
                    );
                  })}
                </View>
              ) : null}

              {/* qty */}
              <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: theme.hairline, marginLeft: 16 }} />
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 9 }}>
                <Text style={{ fontSize: 14.5, color: theme.text }}>{t('gear.spec.qty')}</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
                  <Press onPress={() => setQty((n) => Math.max(1, n - 1))} style={{ width: 30, height: 30, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: fieldBg(theme) }}>
                    <Icon name="chevronL" color={qty > 1 ? theme.text : theme.text3} size={15} />
                  </Press>
                  <Text style={{ fontFamily: MONO, fontSize: 15, fontWeight: '700', color: theme.text, minWidth: 18, textAlign: 'center' }}>{qty}</Text>
                  <Press onPress={() => setQty((n) => n + 1)} style={{ width: 30, height: 30, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: fieldBg(theme) }}>
                    <Icon name="chevronR" color={theme.text} size={15} />
                  </Press>
                </View>
              </View>

              {/* status */}
              <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: theme.hairline, marginLeft: 16 }} />
              <View style={{ paddingHorizontal: 16, paddingVertical: 11 }}>
                <Text style={{ fontSize: 14.5, color: theme.text, marginBottom: 9 }}>{t('gear.spec.status')}</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7 }}>
                  {GEAR_STATUS.map((st) => {
                    const on = st.id === status;
                    return (
                      <Press key={st.id} onPress={() => setStatus(st.id)} style={{ paddingHorizontal: 10, paddingVertical: 7, borderRadius: 10, backgroundColor: on ? theme.accentSoft : fieldBg(theme), borderWidth: 1, borderColor: on ? theme.accent : 'transparent' }}>
                        <Text style={{ fontSize: 12.5, fontWeight: '700', color: on ? theme.accent : theme.text2 }}>{t(`gear.status.${st.id}` as any)}</Text>
                      </Press>
                    );
                  })}
                </View>
              </View>

              {/* weight */}
              <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: theme.hairline, marginLeft: 16 }} />
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 11 }}>
                <Text style={{ fontSize: 14.5, color: theme.text }}>{t('gear.spec.weight')}</Text>
                <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
                  <TextInput value={w} onChangeText={(t) => setW(numClean(t))} keyboardType="decimal-pad" placeholder="0.00" placeholderTextColor={theme.text3} style={{ minWidth: 56, textAlign: 'right', fontFamily: MONO, fontSize: 15, fontWeight: '700', color: theme.text, padding: 0 }} />
                  <Text style={{ fontSize: 12.5, color: theme.text3 }}>kg</Text>
                </View>
              </View>

              {/* price */}
              <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: theme.hairline, marginLeft: 16 }} />
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 11 }}>
                <Text style={{ fontSize: 14.5, color: theme.text }}>{t('gear.spec.value')}</Text>
                <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 2 }}>
                  <Text style={{ fontFamily: MONO, fontSize: 15, fontWeight: '700', color: p ? theme.text : theme.text3 }}>¥</Text>
                  <TextInput value={p} onChangeText={(t) => setP(numClean(t))} keyboardType="decimal-pad" placeholder="0" placeholderTextColor={theme.text3} style={{ minWidth: 56, textAlign: 'right', fontFamily: MONO, fontSize: 15, fontWeight: '700', color: theme.text, padding: 0 }} />
                </View>
              </View>
            </GearCard>

            {/* 自定义属性 */}
            <SectionLabel theme={theme} text={t('gear.section.customAttrs')} trailing={attrs.length ? <Text style={{ fontSize: 11.5, color: theme.text3 }}>{attrs.length} {t('gear.unit.attrs')}</Text> : undefined} />
            <GearCard theme={theme}>
              {attrs.map(([k, v], i) => (
                <React.Fragment key={i}>
                  {i > 0 && <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: theme.hairline, marginLeft: 16 }} />}
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 16, paddingRight: 12, paddingVertical: 9 }}>
                    <TextInput value={k} onChangeText={(s) => setAttr(i, 0, s)} placeholder={t('gear.editor.attrNamePlaceholder')} placeholderTextColor={theme.text3} style={[inputBase, { width: '34%' }]} />
                    <TextInput value={v} onChangeText={(s) => setAttr(i, 1, s)} placeholder={t('gear.editor.attrValuePlaceholder')} placeholderTextColor={theme.text3} style={[inputBase, { flex: 1, textAlign: 'right', fontWeight: '600', color: theme.text2 }]} />
                    <Press onPress={() => delAttr(i)} hitSlop={8} style={{ padding: 2, opacity: 0.6 }}>
                      <Icon name="close" color={theme.text3} size={15} />
                    </Press>
                  </View>
                </React.Fragment>
              ))}
              {attrs.length > 0 && <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: theme.hairline, marginLeft: 16 }} />}
              <Press onPress={addAttr} style={{ flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 16, paddingVertical: 13 }}>
                <Icon name="plus" color={theme.accent} size={16} strokeWidth={2.2} />
                <Text style={{ fontSize: 14, fontWeight: '600', color: theme.accent }}>{t('gear.editor.addAttr')}</Text>
              </Press>
            </GearCard>

            {/* 备注 */}
            <SectionLabel theme={theme} text={t('gear.section.note')} />
            <GearCard theme={theme} style={{ paddingHorizontal: 16, paddingVertical: 12 }}>
              <TextInput
                value={note}
                onChangeText={setNote}
                placeholder={t('gear.editor.notePlaceholder')}
                placeholderTextColor={theme.text3}
                multiline
                style={{ fontSize: 15, lineHeight: 22, color: theme.text, padding: 0, minHeight: 44, textAlignVertical: 'top' }}
              />
            </GearCard>
          </View>
        </ScrollView>

        {/* sticky save bar */}
        <View style={{ paddingHorizontal: 18, paddingTop: 12, paddingBottom: Math.max(insets.bottom, 14) + 2, borderTopWidth: StyleSheet.hairlineWidth, borderColor: theme.hairline, backgroundColor: theme.bg }}>
          <Press
            onPress={submit}
            disabled={!valid}
            style={{ paddingVertical: 15, borderRadius: 15, alignItems: 'center', backgroundColor: valid ? theme.accent : fieldBg(theme) }}
          >
            <Text style={{ fontSize: 16, fontWeight: '700', color: valid ? '#fff' : theme.text3 }}>{mode === 'new' ? t('gear.editor.saveToLibrary') : t('gear.editor.saveChanges')}</Text>
          </Press>
        </View>
      </KeyboardAvoidingView>

      {/* floating back */}
      <View style={{ position: 'absolute', left: 14, top: insets.top + 8 }}>
        <CircleBtn theme={theme} name="arrowL" onPress={onCancel} />
      </View>
    </Animated.View>
  );
}
