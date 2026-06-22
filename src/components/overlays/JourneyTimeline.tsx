// JourneyTimeline.tsx — the unified 行程 surface. A checkable, user-grouped list
// of rich records (each row can carry photo/video media). Groups are user-defined
// strings — users decide how to organize entries. Exposes the inline digest
// (JourneyTimelineCard) and the full-screen timeline (JourneyTimelineFull).
import React, { useRef, useState } from 'react';
import { View, Text, TextInput, ScrollView, StyleSheet, Pressable, Platform, KeyboardAvoidingView, useWindowDimensions, Alert } from 'react-native';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import * as VideoThumbnails from 'expo-video-thumbnails';
import { useVideoPlayer, VideoView } from 'expo-video';
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
  const [failed, setFailed] = useState(false);
  const inner = (
    <View style={{ width: size, height: size, borderRadius: 11, overflow: 'hidden', backgroundColor: theme.dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)', borderWidth: 1, borderColor: theme.hairline }}>
      {displayUri && !failed ? (
        <Image source={{ uri: displayUri }} contentFit="cover" style={{ width: size, height: size }} onError={() => setFailed(true)} />
      ) : (
        <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="camera" color={theme.text3} size={18} />
        </View>
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

function Row({ theme, row, done, showDay, onToggle, connector, last, compact, onOpenMedia, onRemove, onTap, editing, selectable, isSelected, readOnly }: {
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
  onTap?: () => void;
  editing?: boolean;
  selectable?: boolean;
  isSelected?: boolean;
  readOnly?: boolean;
}) {
  const media = row.media || [];
  return (
    <Pressable onLongPress={onRemove} delayLongPress={400} onPress={selectable ? onToggle : onTap} style={{ flexDirection: 'row', gap: readOnly ? 0 : 11, alignItems: 'stretch', opacity: editing && !selectable ? 0.35 : 1 }}>
      {/* gutter: check/select + connecting line */}
      {readOnly ? null : (
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
      )}
      {/* body */}
      <View style={{ flex: 1, minWidth: 0, paddingTop: 1, paddingBottom: last ? 2 : 14, opacity: readOnly ? 1 : (!editing && done ? 0.5 : 1) }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
          <Text
            style={{ flex: 1, fontSize: 14.5, lineHeight: 20.5, fontWeight: '500', color: (!readOnly && done && !editing) ? theme.text2 : theme.text }}
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

// Inline video player for the fullscreen viewer.
function ViewerVideo({ uri, width, height }: { uri: string; width: number; height: number }) {
  const player = useVideoPlayer(uri, (p) => { p.loop = true; p.play(); });
  return <VideoView player={player} style={{ width, height }} nativeControls />;
}

// Fullscreen media viewer — swipe to page, video plays inline.
function MediaViewer({ theme, media, index, seedBase, onClose }: { theme: Theme; media: TLMedia[]; index: number; seedBase: string; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const { t } = useI18n();
  const { width, height } = useWindowDimensions();
  const scrollRef = useRef<ScrollView>(null);
  const [i, setI] = useState(index || 0);
  const m = media[i] || media[0];
  const viewH = height - insets.top - insets.bottom - 80;

  React.useEffect(() => {
    if (index > 0) setTimeout(() => scrollRef.current?.scrollTo({ x: index * width, animated: false }), 10);
  }, []);

  const renderItem = (mm: TLMedia, idx: number) => {
    const isActive = idx === i;
    if (mm.video && mm.uri && isActive) {
      return (
        <View key={idx} style={{ width, alignItems: 'center', justifyContent: 'center' }}>
          <ViewerVideo uri={mm.uri} width={width - 32} height={viewH} />
        </View>
      );
    }
    const displayUri = mm.video ? mm.thumb : mm.uri;
    return (
      <View key={idx} style={{ width, alignItems: 'center', justifyContent: 'center' }}>
        {displayUri ? (
          <Image source={{ uri: displayUri }} contentFit="contain" style={{ width: width - 32, height: viewH, borderRadius: 18 }} />
        ) : (
          <PhotoTile tone={mm.tone} seed={seedBase + '-' + idx} radius={18} resWidth={1000} style={{ width: width - 32, height: viewH }} />
        )}
      </View>
    );
  };

  return (
    <View style={[StyleSheet.absoluteFill, { zIndex: 210, backgroundColor: 'rgba(0,0,0,0.94)' }]}>
      <View style={{ paddingTop: insets.top + 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 8 }}>
        <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13, fontWeight: '600' }}>{media.length > 1 ? `${i + 1} / ${media.length}` : m.video ? t('journey.media.video') : t('journey.media.photo')}</Text>
        <Press onPress={onClose} style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(255,255,255,0.14)', alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="close" color="#fff" size={16} />
        </Press>
      </View>
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={(e) => setI(Math.round(e.nativeEvent.contentOffset.x / width))}
        style={{ flex: 1 }}
        contentContainerStyle={{ alignItems: 'center' }}
      >
        {media.map(renderItem)}
      </ScrollView>
    </View>
  );
}

// ── Block-based content model for the editor ─────────────────────────────────
type ContentBlock = { type: 'text'; value: string } | { type: 'media'; media: TLMedia };

function rowToBlocks(row: TLRow): ContentBlock[] {
  const out: ContentBlock[] = [{ type: 'text', value: row.title }];
  if (row.media?.length) {
    for (const m of row.media) out.push({ type: 'media', media: m });
    out.push({ type: 'text', value: '' });
  }
  return out;
}

// ── Editor page — create or edit a timeline entry ────────────────────────────
function EditorPage({ theme, groups, editRow, onSave, onDeleteGroup, onClose }: {
  theme: Theme;
  groups: TLGroup[];
  editRow?: TLRow;
  onSave: (it: Omit<TLRow, 'id'>) => void;
  onDeleteGroup?: (day: string) => void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { t } = useI18n();
  const [blocks, setBlocks] = useState<ContentBlock[]>(editRow ? rowToBlocks(editRow) : [{ type: 'text', value: '' }]);
  const [focusIdx, setFocusIdx] = useState(0);
  const [activeGroup, setActiveGroup] = useState(editRow?.day ?? groups[0]?.key ?? '');
  const [groupFocused, setGroupFocused] = useState(false);
  const inputRefs = useRef<Map<number, TextInput>>(new Map());

  const existingKeys = groups.map((g) => g.key);

  const setTextAt = (idx: number, value: string) => {
    setBlocks((prev) => prev.map((b, i) => (i === idx && b.type === 'text' ? { ...b, value } : b)));
  };

  const removeMediaAt = (idx: number) => {
    setBlocks((prev) => {
      const next = [...prev];
      next.splice(idx, 1);
      const merged: ContentBlock[] = [];
      for (const b of next) {
        const last = merged[merged.length - 1];
        if (b.type === 'text' && last?.type === 'text') {
          merged[merged.length - 1] = { type: 'text', value: last.value + b.value };
        } else {
          merged.push(b);
        }
      }
      return merged.length ? merged : [{ type: 'text', value: '' }];
    });
  };

  const insertMedia = (items: TLMedia[]) => {
    setBlocks((prev) => {
      const next = [...prev];
      let insertAt = prev.length;
      if (prev[focusIdx]?.type === 'text') insertAt = focusIdx + 1;
      const toInsert: ContentBlock[] = [];
      for (const m of items) toInsert.push({ type: 'media', media: m });
      toInsert.push({ type: 'text', value: '' });
      next.splice(insertAt, 0, ...toInsert);
      return next;
    });
    setTimeout(() => {
      const newIdx = focusIdx + 1 + items.length;
      setFocusIdx(newIdx);
      inputRefs.current.get(newIdx)?.focus();
    }, 100);
  };

  const assetToMedia = async (a: ImagePicker.ImagePickerAsset): Promise<TLMedia> => {
    const isVideo = a.type === 'video';
    let thumb: string | undefined;
    if (isVideo) {
      try { const r = await VideoThumbnails.getThumbnailAsync(a.uri, { time: 500 }); thumb = r.uri; } catch {}
    }
    return { tone: 'forest', uri: a.uri, thumb, video: isVideo || undefined };
  };

  const pickFromLibrary = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return;
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images', 'videos'], allowsMultipleSelection: true, quality: 0.8 });
    if (res.canceled) return;
    insertMedia(await Promise.all(res.assets.map(assetToMedia)));
  };

  const takePhoto = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) return;
    const res = await ImagePicker.launchCameraAsync({ mediaTypes: ['images', 'videos'], quality: 0.8 });
    if (res.canceled) return;
    insertMedia(await Promise.all(res.assets.map(assetToMedia)));
  };


  const allText = blocks.filter((b): b is ContentBlock & { type: 'text' } => b.type === 'text').map((b) => b.value.trim()).filter(Boolean).join('\n');
  const allMedia = blocks.filter((b): b is ContentBlock & { type: 'media' } => b.type === 'media').map((b) => b.media);
  const can = allText.length > 0 && activeGroup.length > 0;

  const submit = () => {
    if (!can) return;
    onSave({ title: allText, day: activeGroup, media: allMedia.length ? allMedia : undefined });
  };

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
            <Text style={{ fontSize: 15, fontWeight: '700', color: can ? '#fff' : theme.text3 }}>{editRow ? t('common.save') : t('common.done')}</Text>
          </Press>
        </View>

        {/* Editor body */}
        <ScrollView
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ flexGrow: 1 }}
        >
          <Pressable
            style={{ flex: 1, paddingHorizontal: 20, paddingBottom: 80 }}
            onPress={() => {
              const lastTextIdx = blocks.reduce((acc, b, i) => b.type === 'text' ? i : acc, 0);
              inputRefs.current.get(lastTextIdx)?.focus();
            }}
          >
          {/* Group input */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 40, marginBottom: 4 }}>
            <Text style={{ fontSize: 14, color: theme.text3, fontWeight: '600' }}>#</Text>
            <TextInput
              value={activeGroup}
              onChangeText={setActiveGroup}
              onFocus={() => setGroupFocused(true)}
              onBlur={() => setTimeout(() => setGroupFocused(false), 150)}
              maxLength={20}
              returnKeyType="next"
              onSubmitEditing={() => inputRefs.current.get(0)?.focus()}
              blurOnSubmit={false}
              style={{ flex: 1, height: 40, fontSize: 14, fontWeight: '600', color: theme.accent }}
            />
          </View>
          {groupFocused && existingKeys.length > 0 ? (
            <View style={{ marginBottom: 4 }}>
              {existingKeys.map((k) => {
                const count = groups.find((g) => g.key === k)?.rows.length ?? 0;
                return (
                  <Pressable
                    key={k}
                    onPress={() => { setActiveGroup(k); setGroupFocused(false); inputRefs.current.get(0)?.focus(); }}
                    onLongPress={() => {
                      Alert.alert(
                        t('journey.timeline.deleteGroupTitle', { name: k }),
                        t('journey.timeline.deleteGroupMessage', { count }),
                        [
                          { text: t('common.cancel'), style: 'cancel' },
                          { text: t('common.delete'), style: 'destructive', onPress: () => { onDeleteGroup?.(k); if (activeGroup === k) setActiveGroup(''); } },
                        ],
                      );
                    }}
                    delayLongPress={500}
                    style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', height: 40, paddingHorizontal: 4 }}
                  >
                    <Text style={{ fontSize: 15, color: activeGroup === k ? theme.accent : theme.text }}>{k}</Text>
                    {activeGroup === k ? <Icon name="check" color={theme.accent} size={15} strokeWidth={2.4} /> : null}
                  </Pressable>
                );
              })}
            </View>
          ) : null}
          <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: theme.hairline, marginBottom: 16 }} />

          {/* Content blocks */}
          {blocks.map((block, i) => {
            if (block.type === 'text') {
              return (
                <TextInput
                  key={`t-${i}`}
                  ref={(r) => { if (r) inputRefs.current.set(i, r); else inputRefs.current.delete(i); }}
                  value={block.value}
                  onChangeText={(v) => setTextAt(i, v)}
                  onFocus={() => setFocusIdx(i)}
                  autoFocus={i === 0}
                  multiline
                  textAlignVertical="top"
                  scrollEnabled={false}
                  placeholder={i === 0 ? t('journey.timeline.addPlaceholder') : ''}
                  placeholderTextColor={theme.text3}
                  style={{ fontSize: 17, lineHeight: 28, color: theme.text, fontWeight: '400', padding: 0 }}
                />
              );
            }
            const mm = block.media;
            const displayUri = mm.video ? mm.thumb : mm.uri;
            return (
              <View key={`m-${i}`} style={{ marginVertical: 10, borderRadius: 14, overflow: 'hidden' }}>
                {displayUri ? (
                  <Image source={{ uri: displayUri }} contentFit="cover" style={{ width: '100%', aspectRatio: 4 / 3, borderRadius: 14 }} />
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
                <Press onPress={() => removeMediaAt(i)} style={{ position: 'absolute', top: 8, right: 8, width: 26, height: 26, borderRadius: 13, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name="close" color="#fff" size={12} />
                </Press>
              </View>
            );
          })}
          </Pressable>
        </ScrollView>

        {/* Bottom toolbar */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16, paddingHorizontal: 20, paddingTop: 10, paddingBottom: Math.max(insets.bottom, 16) + 4, borderTopWidth: StyleSheet.hairlineWidth, borderColor: theme.hairline }}>
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
function groupRows(rows: TLRow[], knownGroups: string[]): TLGroup[] {
  const map = new Map<string, TLRow[]>();
  for (const g of knownGroups) map.set(g, []);
  for (const r of rows) {
    const key = r.day || '';
    const arr = map.get(key);
    if (arr) arr.push(r);
    else map.set(key, [r]);
  }
  return [...map.entries()].map(([key, items]) => ({ key, label: key, rows: items }));
}

export function JourneyTimelineCard({ theme, info, readOnly }: { theme: Theme; info: Poi; readOnly?: boolean }) {
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
        <CardHeader theme={theme} title={t('journey.timeline.title')} action={readOnly ? undefined : t('common.all')} onAction={readOnly ? undefined : () => nav.openTimeline(info)} />
        {readOnly ? null : (
          <Press onPress={() => nav.openTimeline(info)}>
            <View style={{ alignItems: 'center', paddingVertical: 24, borderRadius: 16, backgroundColor: theme.dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.03)', borderWidth: StyleSheet.hairlineWidth, borderColor: theme.hairline }}>
              <Icon name="calendar" color={theme.text3} size={24} />
              <Text style={{ fontSize: 13, color: theme.text3, marginTop: 8 }}>{t('journey.empty.timeline')}</Text>
              <Text style={{ fontSize: 11.5, color: theme.text3, marginTop: 2 }}>{t('journey.empty.timelineHint')}</Text>
            </View>
          </Press>
        )}
      </View>
    );
  }

  return (
    <View style={{ paddingBottom: 18 }}>
      <CardHeader theme={theme} title={t('journey.timeline.title')} action={readOnly ? undefined : t('common.all')} onAction={readOnly ? undefined : () => nav.openTimeline(info)} />
      {readOnly ? (
        <View style={{ borderRadius: 16, backgroundColor: theme.dark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.035)', borderWidth: StyleSheet.hairlineWidth, borderColor: theme.hairline, overflow: 'hidden' }}>
          {tl.rows.length > 0 ? (
            <View style={{ paddingHorizontal: 14, paddingTop: 10, paddingBottom: 6 }}>
              {tl.rows.map((r, i, arr) => (
                <View key={r.id} style={{ marginBottom: i < arr.length - 1 ? 6 : 0 }}>
                  <Row theme={theme} row={r} done={false} showDay onToggle={() => {}} connector={false} last={i === arr.length - 1} readOnly />
                </View>
              ))}
            </View>
          ) : null}
        </View>
      ) : (
      <Press onPress={() => nav.openTimeline(info)}>
        <View style={{ borderRadius: 16, backgroundColor: theme.dark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.035)', borderWidth: StyleSheet.hairlineWidth, borderColor: theme.hairline, overflow: 'hidden' }}>
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
      </Press>
      )}
    </View>
  );
}

// ── FULL-SCREEN — complete day-grouped checkable timeline ────────────────────
export function JourneyTimelineFull({ theme, info, onClose }: { theme: Theme; info: Poi; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const { t } = useI18n();
  const { userId } = useData();
  const tl = useTimeline(info.id, userId);
  const groups = groupRows(tl.rows, tl.knownGroups);
  const [editorRow, setEditorRow] = useState<TLRow | null | undefined>(undefined);
  const editorOpen = editorRow !== undefined;
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
    <Press onPress={() => setEditorRow(null)} style={{ flexDirection: 'row', alignItems: 'center', gap: 5, height: 32, paddingLeft: 10, paddingRight: 13, borderRadius: 16, backgroundColor: theme.accent }}>
      <Icon name="plus" color="#fff" size={15} strokeWidth={2.6} />
      <Text style={{ color: '#fff', fontSize: 13.5, fontWeight: '700' }}>{t('common.add')}</Text>
    </Press>
  );

  return (
    <>
      <FullOverlay theme={theme} title={t('journey.timeline.title')} onClose={onClose} zIndex={150} rightAction={rightAction}>
        {tl.rows.length > 0 ? (
          <View style={{ paddingHorizontal: 18, paddingTop: 14 }}>
            <ProgressBar theme={theme} done={doneCount} total={tl.rows.length} />
          </View>
        ) : (
          <View style={{ alignItems: 'center', paddingTop: 80, paddingHorizontal: 32 }}>
            <Icon name="edit" color={theme.text3} size={36} />
            <Text style={{ fontSize: 15, fontWeight: '600', color: theme.text2, marginTop: 16 }}>{t('journey.timeline.emptyTitle')}</Text>
            <Text style={{ fontSize: 13, color: theme.text3, marginTop: 6, textAlign: 'center', lineHeight: 20 }}>{t('journey.timeline.emptyHint')}</Text>
          </View>
        )}
        <View style={{ paddingHorizontal: 18, paddingTop: 6, paddingBottom: editing ? 80 : 0 }}>
          {groups.map((g) => (
            <View key={g.key} style={{ marginBottom: 6 }}>
              <Pressable
                onLongPress={() => {
                  Alert.alert(
                    t('journey.timeline.deleteGroupTitle', { name: g.label }),
                    t('journey.timeline.deleteGroupMessage', { count: g.rows.length }),
                    [
                      { text: t('common.cancel'), style: 'cancel' },
                      { text: t('common.delete'), style: 'destructive', onPress: () => tl.removeGroup(g.key) },
                    ],
                  );
                }}
                delayLongPress={500}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10, marginBottom: 10 }}
              >
                <Text style={{ fontSize: 13, fontWeight: '800', color: theme.text, letterSpacing: 0.2 }}>{g.label}</Text>
                <View style={{ flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: theme.hairline }} />
                <Text style={{ fontFamily: MONO, fontSize: 10, color: theme.text3 }}>{t('journey.timeline.itemCount', { count: g.rows.length })}</Text>
              </Pressable>
              {g.rows.map((r, i) => (
                <Row
                  key={r.id}
                  theme={theme}
                  row={r}
                  done={tl.isDone(r.id)}
                  onToggle={editing && r.custom ? () => toggleSelect(r.id) : () => tl.toggle(r.id)}
                  onTap={!editing && !tl.isDone(r.id) ? () => setEditorRow(r) : undefined}
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
      {editorOpen ? (
        <EditorPage
          theme={theme}
          groups={groups}
          editRow={editorRow ?? undefined}
          onClose={() => setEditorRow(undefined)}
          onSave={(it) => {
            if (editorRow) { tl.update(editorRow.id, it); } else { tl.add(it); }
            setEditorRow(undefined);
          }}
          onDeleteGroup={(day) => { tl.removeGroup(day); setEditorRow(undefined); }}
        />
      ) : null}
      {viewer ? <MediaViewer theme={theme} media={viewer.media} index={viewer.index} seedBase={viewer.seedBase} onClose={() => setViewer(null)} /> : null}
    </>
  );
}
