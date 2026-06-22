// ManageCompanions.tsx — 同行管理: full-screen roster CRUD for one journey,
// opened from the journey detail's 同行 card 「管理」. Faithful RN port of the
// prototype's companions-screen.jsx:
//   • the 发起人 (host / self) is pinned at the top, non-editable
//   • tap a companion row to edit (name + 分工), long-press to multi-select
//   • add via 邀请伙伴 (reuses the QR/链接 share panel) or 手动添加
//   • single delete (in the editor) + batch 移出所选 (select mode)
// Mutations flow back through onChange so the journey card's stat strip, avatar
// stack and 「X 人同行」 all update live (session-local, no backend).
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  ScrollView,
  Animated,
  StyleSheet,
  Pressable,
  PanResponder,
  Platform,
  KeyboardAvoidingView,
  Keyboard,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Theme } from '../../theme/theme';
import { MONO } from '../../theme/fonts';
import { Poi, Companion } from '../../data/pois';
import { Avatar } from '../Avatar';
import { Icon } from '../Icon';
import { Press } from '../Press';
import { CircleBtn } from '../CircleBtn';
import { KPState } from '../State';
import { NJBottomSheet, NJSharePanel } from './NewJourneySheet';
import { useI18n, TKey } from '../../i18n';

// New companions cycle through this palette; 分工 quick-fills + the two roles
// that get the accent-coloured badge mirror the prototype.
const PALETTE = ['#FF5C3A', '#0A84FF', '#34C759', '#FF9F0A', '#BF5AF2', '#FF375F', '#64D2FF', '#5E5CE6'];
const PRESET_ROLES = ['领队', '向导', '医疗', '后勤', '摄影'];
const KEY_ROLES: Record<string, boolean> = { 领队: true, 向导: true };

// 2 letters for a latin name, 1 glyph for CJK; '友' as a last resort.
function iniOf(name: string): string {
  const n = (name || '').trim();
  if (!n) return '友';
  return n.slice(0, /[a-zA-Z]/.test(n[0]) ? 2 : 1);
}

// ── Add / edit bottom sheet ──────────────────────────────────────
function CompanionEditor({
  theme,
  draft,
  isNew,
  onSave,
  onDelete,
  onClose,
}: {
  theme: Theme;
  draft: Companion;
  isNew: boolean;
  onSave: (c: Companion) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const [name, setName] = useState(draft.name || '');
  const [role, setRole] = useState(draft.role || '');
  const valid = name.trim().length > 0;
  const color = draft.color || PALETTE[0];

  // Scale + fade entrance. The interpolation node is created ONCE (useRef) — a
  // fresh Animated node on every render would tear down the TextInput's native
  // view and blur it on each keystroke, dismissing the IME.
  const anim = useRef(new Animated.Value(0)).current;
  const scale = useRef(anim.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1] })).current;
  useEffect(() => {
    Animated.spring(anim, { toValue: 1, useNativeDriver: true, bounciness: 6, speed: 14 }).start();
  }, [anim]);

  const save = () => {
    if (!valid) return;
    onSave({ ...draft, name: name.trim(), role: role.trim(), ini: iniOf(name), color });
  };

  const inputStyle = {
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: theme.dark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.025)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.hairline,
    fontSize: 15.5,
    color: theme.text,
  } as const;

  return (
    <View style={[StyleSheet.absoluteFill, { zIndex: 80 }]}>
      <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.5)' }]} onPress={onClose} />
      {/* full-bleed centering layer — lifts the dialog to stay centered above the
          keyboard; box-none lets taps on the empty area fall through to the scrim */}
      <KeyboardAvoidingView
        style={[StyleSheet.absoluteFill, { justifyContent: 'center', alignItems: 'center', paddingHorizontal: 26 }]}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        pointerEvents="box-none"
      >
        <Animated.View
          style={{
            width: '100%',
            maxWidth: 360,
            opacity: anim,
            transform: [{ scale }],
            backgroundColor: theme.dark ? '#1c1c1e' : theme.bg,
            borderRadius: 26,
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: theme.border,
            boxShadow: theme.dark ? '0px 12px 30px rgba(0,0,0,0.5)' : '0px 12px 30px rgba(0,0,0,0.18)',
          }}
        >
          {/* tapping anywhere that isn't a field / button resigns focus */}
          <Pressable onPress={() => Keyboard.dismiss()} style={{ padding: 18 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
              <Press onPress={onClose} hitSlop={8} style={{ padding: 4 }}>
                <Text style={{ fontSize: 14.5, color: theme.text2, fontWeight: '500' }}>{t('common.cancel')}</Text>
              </Press>
              <Text style={{ flex: 1, textAlign: 'center', fontSize: 16, fontWeight: '700', color: theme.text }}>{isNew ? t('journey.manage.addCompanion') : t('journey.manage.editCompanion')}</Text>
              <Press onPress={save} disabled={!valid} hitSlop={8} style={{ padding: 4 }}>
                <Text style={{ fontSize: 14.5, fontWeight: '700', color: valid ? theme.accent : theme.text3 }}>{t('common.done')}</Text>
              </Press>
            </View>

            {/* Avatar preview — initials track the name live */}
            <View style={{ alignItems: 'center', marginVertical: 14 }}>
              <Avatar ini={iniOf(name)} color={color} size={60} />
            </View>

            <TextInput
              value={name}
              onChangeText={setName}
              placeholder={t('journey.manage.namePlaceholder')}
              placeholderTextColor={theme.text3}
              maxLength={16}
              returnKeyType="done"
              onSubmitEditing={save}
              style={[inputStyle, { textAlign: 'center', fontWeight: '600', fontSize: 16 }]}
            />

            <Text style={{ fontSize: 12, color: theme.text2, fontWeight: '600', marginTop: 16, marginBottom: 8, marginLeft: 2 }}>{t('journey.manage.roleLabel')}</Text>
            <TextInput
              value={role}
              onChangeText={setRole}
              placeholder={t('journey.manage.rolePlaceholder')}
              placeholderTextColor={theme.text3}
              maxLength={6}
              returnKeyType="done"
              onSubmitEditing={save}
              style={inputStyle}
            />
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
              {PRESET_ROLES.map((r) => {
                const on = r === role.trim();
                return (
                  <Press
                    key={r}
                    onPress={() => setRole(on ? '' : r)}
                    style={{
                      paddingHorizontal: 13,
                      paddingVertical: 7,
                      borderRadius: 999,
                      backgroundColor: on ? theme.accent : theme.dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
                      borderWidth: StyleSheet.hairlineWidth,
                      borderColor: on ? theme.accent : theme.hairline,
                    }}
                  >
                    <Text style={{ fontSize: 12.5, fontWeight: '700', color: on ? '#fff' : theme.text2 }}>{t(`journey.roles.${r}` as TKey)}</Text>
                  </Press>
                );
              })}
            </View>

            {!isNew && (
              <Press onPress={onDelete} style={{ marginTop: 18, paddingVertical: 12, borderRadius: 14, alignItems: 'center', backgroundColor: theme.dangerSoft }}>
                <Text style={{ fontSize: 14.5, fontWeight: '700', color: theme.danger }}>{t('journey.manage.removeCompanion')}</Text>
              </Press>
            )}
          </Pressable>
        </Animated.View>
      </KeyboardAvoidingView>
    </View>
  );
}

// ── Add chooser: 邀请 vs 手动 ────────────────────────────────────
function AddChooser({ theme, onInvite, onManual, onClose }: { theme: Theme; onInvite: () => void; onManual: () => void; onClose: () => void }) {
  const { t } = useI18n();
  const Row = ({ icon, title, sub, onPress, last }: { icon: React.ReactNode; title: string; sub: string; onPress: () => void; last?: boolean }) => (
    <>
      <Press onPress={onPress} style={{ flexDirection: 'row', alignItems: 'center', gap: 13, paddingHorizontal: 14, paddingVertical: 14 }}>
        <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: theme.accentSoft, alignItems: 'center', justifyContent: 'center' }}>{icon}</View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ fontSize: 15, fontWeight: '700', color: theme.text }}>{title}</Text>
          <Text style={{ fontSize: 11.5, color: theme.text2, marginTop: 2, lineHeight: 16 }}>{sub}</Text>
        </View>
        <Icon name="chevronR" color={theme.text3} size={15} />
      </Press>
      {!last ? <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: theme.hairline, marginLeft: 67 }} /> : null}
    </>
  );
  return (
    <NJBottomSheet theme={theme} onClose={onClose} full>
      <View style={{ paddingHorizontal: 14, paddingBottom: 8 }}>
        <Text style={{ textAlign: 'center', fontSize: 16, fontWeight: '700', color: theme.text, paddingVertical: 8 }}>{t('journey.manage.addCompanion')}</Text>
        <View style={{ borderRadius: 14, overflow: 'hidden', backgroundColor: theme.dark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.02)', borderWidth: StyleSheet.hairlineWidth, borderColor: theme.hairline }}>
          <Row icon={<Icon name="share" color={theme.accent} size={20} />} title={t('journey.manage.inviteTitle')} sub={t('journey.manage.inviteSub')} onPress={onInvite} />
          <Row icon={<Icon name="user" color={theme.accent} size={20} />} title={t('journey.manage.manualTitle')} sub={t('journey.manage.manualSub')} onPress={onManual} last />
        </View>
        <Press onPress={onClose} style={{ marginTop: 10, paddingVertical: 13, borderRadius: 14, alignItems: 'center', backgroundColor: theme.dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)' }}>
          <Text style={{ fontSize: 14.5, fontWeight: '700', color: theme.text2 }}>{t('common.cancel')}</Text>
        </Press>
      </View>
    </NJBottomSheet>
  );
}

// ── Main full-screen roster ──────────────────────────────────────
export function ManageCompanions({
  theme,
  poi,
  onChange,
  onClose,
  onToast,
}: {
  theme: Theme;
  poi: Poi;
  onChange: (list: Companion[]) => void;
  onClose: () => void;
  onToast: (m: string) => void;
}) {
  const { t } = useI18n();
  const insets = useSafeAreaInsets();

  // Split the roster: the 发起人 (self, else host) anchors the top and can't be
  // edited or removed; everyone else is the editable list.
  const { anchor, initialOthers } = useMemo(() => {
    const cl = poi.companionList || [];
    let ai = cl.findIndex((c) => c.self);
    if (ai < 0) ai = cl.findIndex((c) => c.host);
    if (ai < 0) return { anchor: null as Companion | null, initialOthers: cl };
    return { anchor: cl[ai], initialOthers: cl.filter((_, i) => i !== ai) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [poi.id]);

  const [others, setOthers] = useState<Companion[]>(initialOthers);
  const [editor, setEditor] = useState<{ index: number; isNew: boolean; draft: Companion } | null>(null);
  const [addMode, setAddMode] = useState<null | 'choose' | 'invite'>(null);
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(() => new Set());

  const total = others.length + (anchor ? 1 : 0);

  const persist = (next: Companion[]) => {
    setOthers(next);
    onChange(anchor ? [anchor, ...next] : next);
  };

  // entrance + swipe-down-to-dismiss (mirrors FullOverlay; off in select mode)
  const translateY = useRef(new Animated.Value(600)).current;
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const selectRef = useRef(selectMode);
  selectRef.current = selectMode;
  useEffect(() => {
    Animated.spring(translateY, { toValue: 0, useNativeDriver: true, bounciness: 2, speed: 14 }).start();
  }, [translateY]);
  const pan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_e, g) => !selectRef.current && g.dy > 4 && Math.abs(g.dy) > Math.abs(g.dx),
      onPanResponderMove: (_e, g) => {
        if (g.dy > 0) translateY.setValue(g.dy);
      },
      onPanResponderRelease: (_e, g) => {
        if (g.dy > 110 || g.vy > 0.6) {
          Animated.timing(translateY, { toValue: 700, duration: 200, useNativeDriver: true }).start(() => onCloseRef.current());
        } else {
          Animated.spring(translateY, { toValue: 0, useNativeDriver: true, bounciness: 4, speed: 16 }).start();
        }
      },
    })
  ).current;

  // CRUD
  const openAdd = () => setEditor({ index: -1, isNew: true, draft: { ini: '友', name: '', role: '', color: PALETTE[others.length % PALETTE.length], trips: 0 } });
  const openEdit = (i: number) => setEditor({ index: i, isNew: false, draft: { ...others[i] } });
  const saveFrom = (next: Companion) => {
    if (!editor) return;
    persist(editor.isNew ? [...others, next] : others.map((c, i) => (i === editor.index ? next : c)));
    setEditor(null);
  };
  const deleteFrom = () => {
    if (!editor) return;
    persist(others.filter((_, i) => i !== editor.index));
    setEditor(null);
  };

  // multi-select
  const enterSelect = (i: number) => {
    setSelectMode(true);
    setSelected(new Set([i]));
  };
  const exitSelect = () => {
    setSelectMode(false);
    setSelected(new Set());
  };
  const toggle = (i: number) =>
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(i)) n.delete(i);
      else n.add(i);
      return n;
    });
  const allSelected = others.length > 0 && selected.size === others.length;
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(others.map((_, i) => i)));
  const deleteSelected = () => {
    persist(others.filter((_, i) => !selected.has(i)));
    exitSelect();
  };

  const Badge = ({ label, accent }: { label: string; accent?: boolean }) => (
    <View style={{ paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, backgroundColor: accent ? theme.accentSoft : theme.dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)' }}>
      <Text style={{ fontSize: 9.5, fontWeight: '700', letterSpacing: 0.3, color: accent ? theme.accent : theme.text2 }}>{label}</Text>
    </View>
  );

  const dividerInset = 13 + (selectMode ? 34 : 0) + 42 + 12; // padding + checkbox + avatar + gap → align under name
  const anchorSub = anchor
    ? anchor.self && anchor.host
      ? t('journey.manage.subSelfHost')
      : anchor.host
      ? t('journey.manage.subHost')
      : anchor.self
      ? t('journey.manage.subSelf')
      : anchor.trips
      ? t('journey.manage.tripsCount', { count: anchor.trips })
      : t('journey.manage.subCompanion')
    : '';

  const rightActions = selectMode ? (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
      <Press onPress={toggleAll}>
        <Text style={{ fontSize: 14.5, fontWeight: '600', color: theme.text2 }}>{allSelected ? t('journey.manage.deselectAll') : t('journey.manage.selectAll')}</Text>
      </Press>
      <Press onPress={exitSelect}>
        <Text style={{ fontSize: 14.5, fontWeight: '700', color: theme.accent }}>{t('common.done')}</Text>
      </Press>
    </View>
  ) : others.length > 0 ? (
    <Press onPress={() => { setSelectMode(true); setSelected(new Set()); }}>
      <Text style={{ fontSize: 14.5, fontWeight: '600', color: theme.text2 }}>{t('journey.manage.select')}</Text>
    </Press>
  ) : null;

  return (
    <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: theme.bg, zIndex: 155, transform: [{ translateY }] }]}>
      <View style={{ flex: 1 }}>
        {/* Header */}
        <View {...pan.panHandlers} style={{ paddingTop: insets.top + 12, paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: theme.hairline }}>
          <View style={{ height: 40, justifyContent: 'center' }}>
            <View style={{ position: 'absolute', left: 0, top: 0 }}>
              <CircleBtn theme={theme} name="arrowL" onPress={onClose} />
            </View>
            <View pointerEvents="none" style={{ alignItems: 'center', paddingHorizontal: 72 }}>
              <Text style={{ fontSize: 17, fontWeight: '700', color: theme.text }} numberOfLines={1}>
                {selectMode ? t('journey.manage.selectedCount', { count: selected.size }) : t('journey.section.companions')}
              </Text>
              {!selectMode ? <Text style={{ fontSize: 12, color: theme.text2, marginTop: 1 }}>{t('journey.manage.totalCount', { count: total })}</Text> : null}
            </View>
            {rightActions ? <View style={{ position: 'absolute', right: 0, top: 0, height: 40, justifyContent: 'center' }}>{rightActions}</View> : null}
          </View>
        </View>

        {/* Roster */}
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 40 }}>
          <View style={{ borderRadius: 16, overflow: 'hidden', backgroundColor: theme.dark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.02)', borderWidth: StyleSheet.hairlineWidth, borderColor: theme.hairline }}>
            {/* anchor — pinned, non-editable */}
            {anchor ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 13, paddingVertical: 11 }}>
                {selectMode ? <View style={{ width: 22 }} /> : null}
                <Avatar ini={anchor.ini} color={anchor.color} size={42} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
                    <Text style={{ fontSize: 15, fontWeight: '600', color: theme.text, flexShrink: 1 }} numberOfLines={1}>
                      {anchor.name}
                    </Text>
                    {anchor.self ? <Badge label={t('journey.companions.meBadge')} /> : null}
                    {anchor.host ? <Badge label={t('journey.companions.host')} accent /> : null}
                  </View>
                  <Text style={{ fontSize: 11.5, color: theme.text2, marginTop: 2 }}>{anchorSub}</Text>
                </View>
              </View>
            ) : null}
            {anchor && others.length > 0 ? <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: theme.hairline, marginLeft: dividerInset }} /> : null}

            {/* editable companions */}
            {others.map((c, i) => {
              const sel = selected.has(i);
              const key = c.role ? KEY_ROLES[c.role] : false;
              return (
                <React.Fragment key={i}>
                  <Press
                    onPress={() => (selectMode ? toggle(i) : openEdit(i))}
                    onLongPress={() => {
                      if (!selectMode) enterSelect(i);
                    }}
                    delayLongPress={380}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 13, paddingVertical: 11, backgroundColor: sel ? theme.accentSofter : 'transparent' }}
                  >
                    {selectMode ? (
                      <View
                        style={{
                          width: 22,
                          height: 22,
                          borderRadius: 11,
                          borderWidth: 2,
                          borderColor: sel ? theme.accent : theme.text3,
                          backgroundColor: sel ? theme.accent : 'transparent',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        {sel ? <Icon name="check" color="#fff" size={13} strokeWidth={3} /> : null}
                      </View>
                    ) : null}
                    <Avatar ini={c.ini} color={c.color} size={42} />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
                        <Text style={{ fontSize: 15, fontWeight: '600', color: theme.text, flexShrink: 1 }} numberOfLines={1}>
                          {c.name}
                        </Text>
                        {c.role ? <Badge label={c.role} accent={!!key} /> : null}
                      </View>
                      <Text style={{ fontSize: 11.5, color: theme.text2, marginTop: 2 }}>
                        {c.trips ? (
                          <Text>
                            <Text style={{ fontFamily: MONO, fontWeight: '700' }}>{c.trips}</Text> {t('journey.manage.tripsUnit')}
                          </Text>
                        ) : (
                          t('journey.manage.firstTrip')
                        )}
                      </Text>
                    </View>
                    {!selectMode ? <Icon name="chevronR" color={theme.text3} size={15} /> : null}
                  </Press>
                  {i < others.length - 1 ? <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: theme.hairline, marginLeft: dividerInset }} /> : null}
                </React.Fragment>
              );
            })}
          </View>

          {others.length === 0 ? (
            <KPState theme={theme} icon="people" title={t('journey.manage.emptyTitle')} body={t('journey.manage.emptyBody')} style={{ paddingVertical: 32 }} />
          ) : null}

          {!selectMode ? (
            <Press onPress={() => setAddMode('choose')} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 14, paddingVertical: 14, borderRadius: 14, backgroundColor: theme.accentSoft }}>
              <Icon name="plus" color={theme.accent} size={18} strokeWidth={2.4} />
              <Text style={{ fontSize: 14.5, fontWeight: '700', color: theme.accent }}>{t('journey.manage.addCompanion')}</Text>
            </Press>
          ) : null}

          {!selectMode && others.length > 0 ? (
            <Text style={{ fontSize: 11.5, color: theme.text3, textAlign: 'center', marginTop: 14, lineHeight: 18 }}>{t('journey.manage.hint')}</Text>
          ) : null}
        </ScrollView>

        {/* Batch delete bar */}
        {selectMode ? (
          <View style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: Math.max(insets.bottom, 16) + 6, borderTopWidth: StyleSheet.hairlineWidth, borderColor: theme.hairline, backgroundColor: theme.bg }}>
            <Press
              onPress={selected.size ? deleteSelected : undefined}
              style={{ paddingVertical: 15, borderRadius: 14, alignItems: 'center', backgroundColor: selected.size ? theme.danger : theme.dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)' }}
            >
              <Text style={{ fontSize: 15, fontWeight: '700', color: selected.size ? '#fff' : theme.text3 }}>{selected.size ? t('journey.manage.removeSelected', { count: selected.size }) : t('journey.manage.removeSelectPrompt')}</Text>
            </Press>
          </View>
        ) : null}
      </View>

      {/* Layered sheets */}
      {editor && <CompanionEditor theme={theme} draft={editor.draft} isNew={editor.isNew} onSave={saveFrom} onDelete={deleteFrom} onClose={() => setEditor(null)} />}
      {addMode === 'choose' && (
        <AddChooser
          theme={theme}
          onInvite={() => setAddMode('invite')}
          onManual={() => {
            setAddMode(null);
            openAdd();
          }}
          onClose={() => setAddMode(null)}
        />
      )}
      {addMode === 'invite' && <NJSharePanel theme={theme} tripName={poi.name} journeyId={poi.id} onClose={() => setAddMode(null)} onToast={onToast} />}
    </Animated.View>
  );
}
