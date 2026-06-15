// JourneyTimeline.tsx — the unified 行程 surface. A checkable, user-grouped list
// of rich records (each row can carry photo/video media). Groups are user-defined
// strings — users decide how to organize entries. Exposes the inline digest
// (JourneyTimelineCard) and the full-screen timeline (JourneyTimelineFull).
import React, { useRef, useState } from 'react';
import { View, Text, TextInput, Image, ScrollView, StyleSheet, Pressable, Platform, KeyboardAvoidingView, useWindowDimensions, Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as VideoThumbnails from 'expo-video-thumbnails';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Theme } from '../../theme/theme';
import { MONO } from '../../theme/fonts';
import { Poi } from '../../data/pois';
import { TLRow, TLMedia, TLGroup } from '../../data/timeline';
import { useTimeline } from '../../hooks/useTimeline';
import { useData } from '../../data/DataContext';
import { Icon } from '../Icon';
import { Press } from '../Press';
import { PhotoTile } from '../PhotoTile';
import { FullOverlay } from './FullOverlay';
import { useNav } from '../../nav/NavContext';
import { useI18n } from '../../i18n';

// ── Check control: 'done' (filled tick) | 'current' (calm ring) | 'todo' ──────
function Check({ theme, state, onPress }: { theme: Theme; state: 'done' | 'current' | 'todo'; onPress?: () => void }) {
  if (state === 'done') {
    return (
      <Press onPress={onPress} hitSlop={6} style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: theme.accent, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name="check" color="#fff" size={14} strokeWidth={2.6} />
      </Press>
    );
  }
  if (state === 'current') {
    return (
      <Press onPress={onPress} hitSlop={6} style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 4, borderColor: theme.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
        <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: theme.accent }} />
      </Press>
    );
  }
  return (
    <Press onPress={onPress} hitSlop={6} style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 1.8, borderColor: theme.text3 }}>
      <View />
    </Press>
  );
}

function DayPill({ theme, label }: { theme: Theme; label: string }) {
  return (
    <View style={{ backgroundColor: theme.dark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.045)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 }}>
      <Text style={{ fontFamily: MONO, fontSize: 9.5, fontWeight: '700', letterSpacing: 0.4, color: theme.text2 }}>{label}</Text>
    </View>
  );
}

function ProgressBar({ theme, done, total }: { theme: Theme; done: number; total: number }) {
  const { t } = useI18n();
  const pct = total ? Math.round((done / total) * 100) : 0;
  return (
    <View>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 8 }}>
        <Text style={{ fontSize: 13, color: theme.text2 }}>
          <Text style={{ fontWeight: '800', fontSize: 17, color: theme.text }}>{done}</Text>
          <Text style={{ fontWeight: '600' }}> {t('journey.timeline.ofDone', { total })}</Text>
        </Text>
        <Text style={{ fontFamily: MONO, fontSize: 11, color: theme.text3 }}>{pct}%</Text>
      </View>
      <View style={{ height: 6, borderRadius: 3, backgroundColor: theme.dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)', overflow: 'hidden' }}>
        <View style={{ width: `${pct}%`, height: 6, borderRadius: 3, backgroundColor: theme.accent }} />
      </View>
    </View>
  );
}

// A media attachment thumbnail — real image when uri exists, placeholder otherwise.
function MediaThumb({ theme, m, seed, size = 76, onPress }: { theme: Theme; m: TLMedia; seed: string; size?: number; onPress?: () => void }) {
  const displayUri = m.video ? m.thumb : m.uri;
  const inner = (
    <View style={{ width: size, height: size, borderRadius: 11, overflow: 'hidden' }}>
      {displayUri ? (
        <Image source={{ uri: displayUri }} resizeMode="cover" style={{ width: size, height: size }} />
      ) : (
        <PhotoTile tone={m.tone} seed={seed} radius={11} resWidth={240} style={{ width: size, height: size }} />
      )}
      {m.video ? (
        <View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.18)' }]}>
          <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="play" color="#fff" size={12} />
          </View>
        </View>
      ) : null}
    </View>
  );
  return onPress ? <Press onPress={onPress}>{inner}</Press> : inner;
}

// One timeline row: leading check + rich-text body (+ optional media), with a
// connector line linking consecutive rows. `compact` clamps text to 2 lines and
// hides media (used inside the inline digest card).
function SelectCircle({ theme, selected, onPress }: { theme: Theme; selected: boolean; onPress: () => void }) {
  return (
    <Press onPress={onPress} hitSlop={6} style={{ width: 22, height: 22, borderRadius: 11, borderWidth: selected ? 0 : 1.8, borderColor: theme.text3, backgroundColor: selected ? theme.accent : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
      {selected ? <Icon name="check" color="#fff" size={14} strokeWidth={2.6} /> : null}
    </Press>
  );
}

function Row({ theme, row, done, showDay, onToggle, connector, last, compact, onOpenMedia, onRemove, editing, selectable, isSelected }: {
  theme: Theme;
  row: TLRow;
  done: boolean;
  showDay?: boolean;
  onToggle: () => void;
  connector: boolean;
  last: boolean;
  compact?: boolean;
  onOpenMedia?: (media: TLMedia[], index: number, id: string) => void;
  onRemove?: () => void;
  editing?: boolean;
  selectable?: boolean;
  isSelected?: boolean;
}) {
  const media = row.media || [];
  return (
    <Pressable onLongPress={onRemove} delayLongPress={400} onPress={selectable ? onToggle : undefined} style={{ flexDirection: 'row', gap: 11, alignItems: 'stretch', opacity: editing && !selectable ? 0.35 : 1 }}>
      {/* gutter: check/select + connecting line */}
      <View style={{ width: 22, alignItems: 'center' }}>
        {connector ? <View style={{ position: 'absolute', top: 24, bottom: -2, width: 2, backgroundColor: theme.hairline }} /> : null}
        <View style={{ paddingTop: 1 }}>
          {selectable ? (
            <SelectCircle theme={theme} selected={!!isSelected} onPress={onToggle} />
          ) : (
            <Check theme={theme} state={done ? 'done' : 'todo'} onPress={editing ? undefined : onToggle} />
          )}
        </View>
      </View>
      {/* body */}
      <View style={{ flex: 1, minWidth: 0, paddingTop: 1, paddingBottom: last ? 2 : 14, opacity: !editing && done ? 0.5 : 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
          <Text
            style={{ flex: 1, fontSize: 14.5, lineHeight: 20.5, fontWeight: '500', color: done && !editing ? theme.text2 : theme.text }}
            numberOfLines={compact ? 2 : undefined}
          >
            {row.title}
          </Text>
          {showDay ? (
            <View style={{ marginTop: 1 }}>
              <DayPill theme={theme} label={row.day} />
            </View>
          ) : null}
        </View>
        {!compact && media.length > 0 ? (
          <View style={{ flexDirection: 'row', gap: 6, marginTop: 9 }}>
            {media.map((m, i) => (
              <MediaThumb key={i} theme={theme} m={m} seed={row.id + '-' + i} onPress={onOpenMedia ? () => onOpenMedia(media, i, row.id) : undefined} />
            ))}
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

// Fullscreen media viewer — tap a thumbnail to enlarge; arrows page through the
// entry's attachments. Placeholder art for now; video shows a play affordance.
function MediaViewer({ theme, media, index, seedBase, onClose }: { theme: Theme; media: TLMedia[]; index: number; seedBase: string; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const { t } = useI18n();
  const { width } = useWindowDimensions();
  const [i, setI] = useState(index || 0);
  const m = media[i] || media[0];
  const go = (d: number) => setI((x) => (x + d + media.length) % media.length);
  const tileW = width - 32;
  const navBtn = { position: 'absolute' as const, top: '50%' as const, marginTop: -18, width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center' as const, justifyContent: 'center' as const };
  return (
    <View style={[StyleSheet.absoluteFill, { zIndex: 210, backgroundColor: 'rgba(0,0,0,0.94)' }]}>
      <View style={{ paddingTop: insets.top + 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 8 }}>
        <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13, fontWeight: '600' }}>{media.length > 1 ? `${i + 1} / ${media.length}` : m.video ? t('journey.media.video') : t('journey.media.photo')}</Text>
        <Press onPress={onClose} style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(255,255,255,0.14)', alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="close" color="#fff" size={16} />
        </Press>
      </View>
      <Pressable onPress={onClose} style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16, paddingBottom: insets.bottom + 24 }}>
        <Pressable onPress={() => {}} style={{ width: tileW, borderRadius: 18, overflow: 'hidden' }}>
          <PhotoTile tone={m.tone} seed={seedBase + '-' + i} radius={18} resWidth={1000} style={{ width: tileW, height: tileW * 1.18 }} />
          {m.video ? (
            <View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}>
              <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="play" color="#fff" size={26} />
              </View>
            </View>
          ) : null}
          {media.length > 1 ? (
            <>
              <Press onPress={() => go(-1)} style={[navBtn, { left: 8 }]}>
                <Icon name="chevronL" color="#fff" size={16} />
              </Press>
              <Press onPress={() => go(1)} style={[navBtn, { right: 8 }]}>
                <Icon name="chevronR" color="#fff" size={16} />
              </Press>
            </>
          ) : null}
        </Pressable>
      </Pressable>
    </View>
  );
}

// ── Add page — full-screen notes-style editor for a timeline entry ───────────
function AddPage({ theme, groups, onAdd, onClose }: { theme: Theme; groups: TLGroup[]; onAdd: (it: Omit<TLRow, 'id'>) => void; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const { t } = useI18n();
  const [title, setTitle] = useState('');
  const [groupText, setGroupText] = useState(groups[0]?.key ?? '');
  const [groupFocused, setGroupFocused] = useState(false);
  const bodyRef = useRef<TextInput>(null);
  const [media, setMedia] = useState<TLMedia[]>([]);
  const dropMedia = (idx: number) => setMedia((mm) => mm.filter((_, x) => x !== idx));

  const assetToMedia = async (a: ImagePicker.ImagePickerAsset): Promise<TLMedia> => {
    const isVideo = a.type === 'video';
    let thumb: string | undefined;
    if (isVideo) {
      try {
        const t = await VideoThumbnails.getThumbnailAsync(a.uri, { time: 500 });
        thumb = t.uri;
      } catch {}
    }
    return { tone: 'forest', uri: a.uri, thumb, video: isVideo || undefined };
  };

  const pickFromLibrary = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return;
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images', 'videos'], allowsMultipleSelection: true, quality: 0.8 });
    if (res.canceled) return;
    const items = await Promise.all(res.assets.map(assetToMedia));
    setMedia((mm) => [...mm, ...items]);
  };

  const takePhoto = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) return;
    const res = await ImagePicker.launchCameraAsync({ mediaTypes: ['images', 'videos'], quality: 0.8 });
    if (res.canceled) return;
    const items = await Promise.all(res.assets.map(assetToMedia));
    setMedia((mm) => [...mm, ...items]);
  };

  const activeGroup = groupText.trim();
  const can = title.trim().length > 0 && activeGroup.length > 0;

  const submit = () => {
    if (!can) return;
    onAdd({ title: title.trim(), day: activeGroup, media });
  };

  const pickSuggestion = (key: string) => {
    setGroupText(key);
    setGroupFocused(false);
    bodyRef.current?.focus();
  };

  const existingKeys = groups.map((g) => g.key);
  const suggestions = activeGroup
    ? existingKeys.filter((k) => k !== activeGroup && k.includes(activeGroup))
    : existingKeys;

  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: theme.bg, zIndex: 200 }]}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        {/* Header */}
        <View style={{ paddingTop: insets.top + 8, paddingHorizontal: 16, paddingBottom: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Press onPress={onClose} style={{ paddingVertical: 4, paddingRight: 12 }}>
            <Text style={{ fontSize: 16, color: theme.text2, fontWeight: '500' }}>{t('common.cancel')}</Text>
          </Press>
          <Press
            onPress={can ? submit : undefined}
            style={{
              paddingVertical: 6,
              paddingHorizontal: 16,
              borderRadius: 18,
              backgroundColor: can ? theme.accent : theme.dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.04)',
            }}
          >
            <Text style={{ fontSize: 15, fontWeight: '700', color: can ? '#fff' : theme.text3 }}>{t('common.done')}</Text>
          </Press>
        </View>

        {/* Editor body */}
        <ScrollView
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 80, flexGrow: 1 }}
        >
          {/* Group input row */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 40, marginBottom: 4 }}>
            <Text style={{ fontSize: 14, color: theme.text3, fontWeight: '600' }}>#</Text>
            <TextInput
              value={groupText}
              onChangeText={setGroupText}
              onFocus={() => setGroupFocused(true)}
              onBlur={() => setTimeout(() => setGroupFocused(false), 150)}
              placeholder={t('journey.timeline.groupPlaceholder')}
              placeholderTextColor={theme.text3}
              maxLength={20}
              returnKeyType="next"
              onSubmitEditing={() => bodyRef.current?.focus()}
              blurOnSubmit={false}
              style={{ flex: 1, height: 40, fontSize: 14, fontWeight: '600', color: theme.accent }}
            />
          </View>

          {/* Suggestions */}
          {groupFocused && suggestions.length > 0 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingBottom: 12, paddingTop: 4 }} keyboardShouldPersistTaps="handled">
              {suggestions.map((k) => (
                <Press key={k} onPress={() => pickSuggestion(k)} style={{ height: 28, paddingHorizontal: 12, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)' }}>
                  <Text style={{ fontSize: 12.5, fontWeight: '500', color: theme.text2 }}>{k}</Text>
                </Press>
              ))}
            </ScrollView>
          ) : null}

          <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: theme.hairline, marginBottom: 16 }} />

          {/* Body */}
          <TextInput
            ref={bodyRef}
            value={title}
            onChangeText={setTitle}
            autoFocus={groups.length > 0}
            multiline
            textAlignVertical="top"
            scrollEnabled={false}
            placeholder={t('journey.timeline.addPlaceholder')}
            placeholderTextColor={theme.text3}
            style={{
              fontSize: 17,
              lineHeight: 28,
              color: theme.text,
              fontWeight: '400',
              padding: 0,
            }}
          />

          {media.map((mm, i) => {
            const displayUri = mm.video ? mm.thumb : mm.uri;
            return (
              <View key={i} style={{ marginTop: 14, borderRadius: 14, overflow: 'hidden' }}>
                {displayUri ? (
                  <Image source={{ uri: displayUri }} resizeMode="cover" style={{ width: '100%', aspectRatio: 4 / 3, borderRadius: 14 }} />
                ) : (
                  <PhotoTile tone={mm.tone} seed={'new-' + i} radius={14} resWidth={600} style={{ width: '100%', aspectRatio: 4 / 3 }} />
                )}
                {mm.video ? (
                  <View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}>
                    <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' }}>
                      <Icon name="play" color="#fff" size={20} />
                    </View>
                  </View>
                ) : null}
                <Press
                  onPress={() => dropMedia(i)}
                  style={{
                    position: 'absolute',
                    top: 8,
                    right: 8,
                    width: 26,
                    height: 26,
                    borderRadius: 13,
                    backgroundColor: 'rgba(0,0,0,0.45)',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Icon name="close" color="#fff" size={12} />
                </Press>
              </View>
            );
          })}
        </ScrollView>

        {/* Bottom toolbar */}
        <View style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 16,
          paddingHorizontal: 20,
          paddingTop: 10,
          paddingBottom: Math.max(insets.bottom, 16) + 4,
          borderTopWidth: StyleSheet.hairlineWidth,
          borderColor: theme.hairline,
        }}>
          <Press onPress={pickFromLibrary} style={{ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="photo" color={theme.text2} size={24} />
          </Press>
          <Press onPress={takePhoto} style={{ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="camera" color={theme.text2} size={24} />
          </Press>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

// Card section header (mirrors JourneyCard's SectionHeader styling).
function CardHeader({ theme, title, action, onAction }: { theme: Theme; title: string; action?: string; onAction?: () => void }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
      <Text style={{ fontSize: 16.5, fontWeight: '700', color: theme.text }}>{title}</Text>
      {action ? (
        <Press onPress={onAction}>
          <Text style={{ fontSize: 13.5, fontWeight: '600', color: theme.accent }}>{action}</Text>
        </Press>
      ) : null}
    </View>
  );
}

// ── Group rows by their user-defined `day` string, preserving first-seen order ─
function groupRows(rows: TLRow[]): TLGroup[] {
  const map = new Map<string, TLRow[]>();
  for (const r of rows) {
    const key = r.day || '';
    const arr = map.get(key);
    if (arr) arr.push(r);
    else map.set(key, [r]);
  }
  return [...map.entries()].map(([key, items]) => ({ key, label: key, rows: items }));
}

export function JourneyTimelineCard({ theme, info }: { theme: Theme; info: Poi }) {
  const nav = useNav();
  const { t } = useI18n();
  const { userId } = useData();
  const tl = useTimeline(info.id, userId);

  const doneCount = tl.rows.filter((r) => tl.isDone(r.id)).length;
  const pending = tl.rows.filter((r) => !tl.isDone(r.id));
  const allDone = pending.length === 0;

  const upNext = tl.rows.filter((r) => !tl.isDone(r.id)).slice(0, 3);

  if (tl.rows.length === 0) {
    return (
      <View style={{ paddingBottom: 18 }}>
        <CardHeader theme={theme} title={t('journey.timeline.title')} action={t('common.all')} onAction={() => nav.openTimeline(info)} />
        <Press onPress={() => nav.openTimeline(info)}>
          <View style={{ alignItems: 'center', paddingVertical: 24, borderRadius: 16, backgroundColor: theme.dark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.018)', borderWidth: StyleSheet.hairlineWidth, borderColor: theme.hairline }}>
            <Icon name="calendar" color={theme.text3} size={24} />
            <Text style={{ fontSize: 13, color: theme.text3, marginTop: 8 }}>{t('journey.empty.timeline')}</Text>
            <Text style={{ fontSize: 11.5, color: theme.text3, marginTop: 2 }}>{t('journey.empty.timelineHint')}</Text>
          </View>
        </Press>
      </View>
    );
  }

  return (
    <View style={{ paddingBottom: 18 }}>
      <CardHeader theme={theme} title={t('journey.timeline.title')} action={t('common.all')} onAction={() => nav.openTimeline(info)} />
      <View style={{ borderRadius: 16, backgroundColor: theme.dark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.022)', borderWidth: StyleSheet.hairlineWidth, borderColor: theme.hairline, overflow: 'hidden' }}>
        <View style={{ padding: 14, borderBottomWidth: allDone ? 0 : StyleSheet.hairlineWidth, borderColor: theme.hairline }}>
          <ProgressBar theme={theme} done={doneCount} total={tl.rows.length} />
        </View>
        {!allDone ? (
          <View style={{ paddingHorizontal: 14, paddingTop: 12, paddingBottom: 6 }}>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 12 }}>
              <Text style={{ fontSize: 12, fontWeight: '700', color: theme.text2, letterSpacing: 0.6 }}>{t('journey.timeline.upNext')}</Text>
              <Text style={{ fontSize: 11.5, color: theme.text3 }}>{t('journey.timeline.remaining', { count: pending.length })}</Text>
            </View>
            {upNext.map((r, i, arr) => (
              <Row key={r.id} theme={theme} row={r} done={tl.isDone(r.id)} showDay compact onToggle={() => tl.toggle(r.id)} connector={i < arr.length - 1} last={i === arr.length - 1} />
            ))}
          </View>
        ) : null}
      </View>
    </View>
  );
}

// ── FULL-SCREEN — complete day-grouped checkable timeline ────────────────────
export function JourneyTimelineFull({ theme, info, onClose }: { theme: Theme; info: Poi; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const { t } = useI18n();
  const { userId } = useData();
  const tl = useTimeline(info.id, userId);
  const groups = groupRows(tl.rows);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [viewer, setViewer] = useState<{ media: TLMedia[]; index: number; seedBase: string } | null>(null);

  const doneCount = tl.rows.filter((r) => tl.isDone(r.id)).length;

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const enterEditWith = (id: string) => {
    setSelected(new Set([id]));
    setEditing(true);
  };
  const exitEdit = () => { setSelected(new Set()); setEditing(false); };

  const confirmBatchRemove = () => {
    const count = selected.size;
    if (!count) return;
    Alert.alert(t('journey.timeline.batchDeleteConfirmTitle', { count }), t('journey.timeline.deleteConfirmMessage'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('common.delete'), style: 'destructive', onPress: () => {
        selected.forEach((id) => tl.remove(id));
        setSelected(new Set());
        setEditing(false);
      }},
    ]);
  };

  const rightAction = editing ? (
    <Press onPress={exitEdit}>
      <Text style={{ fontSize: 15, fontWeight: '600', color: theme.accent }}>{t('common.done')}</Text>
    </Press>
  ) : (
    <Press onPress={() => setAdding(true)} style={{ flexDirection: 'row', alignItems: 'center', gap: 5, height: 32, paddingLeft: 10, paddingRight: 13, borderRadius: 16, backgroundColor: theme.accent }}>
      <Icon name="plus" color="#fff" size={15} strokeWidth={2.6} />
      <Text style={{ color: '#fff', fontSize: 13.5, fontWeight: '700' }}>{t('common.add')}</Text>
    </Press>
  );

  return (
    <>
      <FullOverlay theme={theme} title={t('journey.timeline.title')} onClose={onClose} zIndex={150} rightAction={rightAction}>
        <View style={{ paddingHorizontal: 18, paddingTop: 14 }}>
          <ProgressBar theme={theme} done={doneCount} total={tl.rows.length} />
        </View>
        <View style={{ paddingHorizontal: 18, paddingTop: 6, paddingBottom: editing ? 80 : 0 }}>
          {groups.map((g) => (
            <View key={g.key} style={{ marginBottom: 6 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10, marginBottom: 10 }}>
                <Text style={{ fontSize: 13, fontWeight: '800', color: theme.text, letterSpacing: 0.2 }}>{g.label}</Text>
                <View style={{ flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: theme.hairline }} />
                <Text style={{ fontFamily: MONO, fontSize: 10, color: theme.text3 }}>{t('journey.timeline.itemCount', { count: g.rows.length })}</Text>
              </View>
              {g.rows.map((r, i) => (
                <Row
                  key={r.id}
                  theme={theme}
                  row={r}
                  done={tl.isDone(r.id)}
                  onToggle={editing && r.custom ? () => toggleSelect(r.id) : () => tl.toggle(r.id)}
                  connector={i < g.rows.length - 1}
                  last={i === g.rows.length - 1}
                  onOpenMedia={editing ? undefined : (media, idx, id) => setViewer({ media, index: idx, seedBase: id })}
                  onRemove={!editing && r.custom ? () => enterEditWith(r.id) : undefined}
                  editing={editing}
                  selectable={editing && !!r.custom}
                  isSelected={selected.has(r.id)}
                />
              ))}
            </View>
          ))}
        </View>
      </FullOverlay>
      {editing && selected.size > 0 ? (
        <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 160, paddingHorizontal: 18, paddingTop: 12, paddingBottom: insets.bottom + 14, backgroundColor: theme.bg, borderTopWidth: StyleSheet.hairlineWidth, borderColor: theme.hairline }}>
          <Press onPress={confirmBatchRemove} style={{ height: 50, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FF3B30' }}>
            <Text style={{ fontSize: 16, fontWeight: '700', color: '#fff' }}>{t('journey.timeline.deleteSelected', { count: selected.size })}</Text>
          </Press>
        </View>
      ) : null}
      {adding ? <AddPage theme={theme} groups={groups} onClose={() => setAdding(false)} onAdd={(it) => { tl.add(it); setAdding(false); }} /> : null}
      {viewer ? <MediaViewer theme={theme} media={viewer.media} index={viewer.index} seedBase={viewer.seedBase} onClose={() => setViewer(null)} /> : null}
    </>
  );
}
