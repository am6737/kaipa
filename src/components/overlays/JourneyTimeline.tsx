// JourneyTimeline.tsx — the unified 行程 surface, faithfully ported from the
// prototype's journey-timeline.jsx. ONE concept: a checkable, day-grouped list of
// rich records (each row can carry photo/video media). Progress = how many rows
// are checked. Exposes the inline digest (JourneyTimelineCard, shown on the
// journey detail) and the full-screen day-grouped timeline (JourneyTimelineFull,
// opened from the digest's 「全部」). Checks + user-added rows live in journeyStore
// so the two stay in sync. Gear checklist stays separate.
import React, { useState } from 'react';
import { View, Text, TextInput, ScrollView, StyleSheet, Pressable, Platform, KeyboardAvoidingView, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Theme } from '../../theme/theme';
import { MONO } from '../../theme/fonts';
import { Poi, JourneyStatus } from '../../data/pois';
import { buildTimeline, DAY_LABEL, DAY_RANK, DayKey, TLRow, TLMedia, TLGroup } from '../../data/timeline';
import { useJStore } from '../../data/journeyStore';
import { Icon } from '../Icon';
import { Press } from '../Press';
import { PhotoTile } from '../PhotoTile';
import { FullOverlay } from './FullOverlay';
import { useNav } from '../../nav/NavContext';

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
  const pct = total ? Math.round((done / total) * 100) : 0;
  return (
    <View>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 8 }}>
        <Text style={{ fontSize: 13, color: theme.text2 }}>
          <Text style={{ fontWeight: '800', fontSize: 17, color: theme.text }}>{done}</Text>
          <Text style={{ fontWeight: '600' }}> / {total} 完成</Text>
        </Text>
        <Text style={{ fontFamily: MONO, fontSize: 11, color: theme.text3 }}>{pct}%</Text>
      </View>
      <View style={{ height: 6, borderRadius: 3, backgroundColor: theme.dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)', overflow: 'hidden' }}>
        <View style={{ width: `${pct}%`, height: 6, borderRadius: 3, backgroundColor: theme.accent }} />
      </View>
    </View>
  );
}

// A media attachment thumbnail (photo placeholder; video gets a play badge).
function MediaThumb({ theme, m, seed, size = 76, onPress }: { theme: Theme; m: TLMedia; seed: string; size?: number; onPress?: () => void }) {
  const inner = (
    <View style={{ width: size, height: size, borderRadius: 11, overflow: 'hidden' }}>
      <PhotoTile tone={m.tone} seed={seed} radius={11} resWidth={240} style={{ width: size, height: size }} />
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
function Row({ theme, row, done, showDay, onToggle, connector, last, compact, onOpenMedia }: {
  theme: Theme;
  row: TLRow;
  done: boolean;
  showDay?: boolean;
  onToggle: () => void;
  connector: boolean;
  last: boolean;
  compact?: boolean;
  onOpenMedia?: (media: TLMedia[], index: number, id: string) => void;
}) {
  const media = row.media || [];
  return (
    <View style={{ flexDirection: 'row', gap: 11, alignItems: 'stretch' }}>
      {/* gutter: check + connecting line */}
      <View style={{ width: 22, alignItems: 'center' }}>
        {connector ? <View style={{ position: 'absolute', top: 24, bottom: -2, width: 2, backgroundColor: theme.hairline }} /> : null}
        <View style={{ paddingTop: 1 }}>
          <Check theme={theme} state={done ? 'done' : 'todo'} onPress={onToggle} />
        </View>
      </View>
      {/* body */}
      <View style={{ flex: 1, minWidth: 0, paddingTop: 1, paddingBottom: last ? 2 : 14, opacity: done ? 0.5 : 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
          <Text
            style={{ flex: 1, fontSize: 14.5, lineHeight: 20.5, fontWeight: '500', color: done ? theme.text2 : theme.text }}
            numberOfLines={compact ? 2 : undefined}
          >
            {row.title}
          </Text>
          {showDay ? (
            <View style={{ marginTop: 1 }}>
              <DayPill theme={theme} label={DAY_LABEL[row.day] || row.day} />
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
    </View>
  );
}

// Fullscreen media viewer — tap a thumbnail to enlarge; arrows page through the
// entry's attachments. Placeholder art for now; video shows a play affordance.
function MediaViewer({ theme, media, index, seedBase, onClose }: { theme: Theme; media: TLMedia[]; index: number; seedBase: string; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [i, setI] = useState(index || 0);
  const m = media[i] || media[0];
  const go = (d: number) => setI((x) => (x + d + media.length) % media.length);
  const tileW = width - 32;
  const navBtn = { position: 'absolute' as const, top: '50%' as const, marginTop: -18, width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center' as const, justifyContent: 'center' as const };
  return (
    <View style={[StyleSheet.absoluteFill, { zIndex: 210, backgroundColor: 'rgba(0,0,0,0.94)' }]}>
      <View style={{ paddingTop: insets.top + 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 8 }}>
        <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13, fontWeight: '600' }}>{media.length > 1 ? `${i + 1} / ${media.length}` : m.video ? '视频' : '照片'}</Text>
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

// ── Add sheet — bottom-sheet composer for a rich timeline entry ──────────────
function AddSheet({ theme, days, onAdd, onClose }: { theme: Theme; days: TLGroup[]; onAdd: (it: Omit<TLRow, 'id'>) => void; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const [title, setTitle] = useState('');
  const [day, setDay] = useState<DayKey>(days[0] ? days[0].key : 'pre');
  const [media, setMedia] = useState<TLMedia[]>([]);
  const can = title.trim().length > 0;
  const MTONES = ['ridge', 'forest', 'dusk', 'river', 'sand', 'moss'];
  const addMedia = (video: boolean) => setMedia((mm) => [...mm, { tone: MTONES[mm.length % MTONES.length], video }]);
  const dropMedia = (idx: number) => setMedia((mm) => mm.filter((_, x) => x !== idx));
  const submit = () => {
    if (!can) return;
    onAdd({ title: title.trim(), day, media });
  };
  const dayOpts: TLGroup[] = days.length ? days : [{ key: 'pre', label: '出发前', rows: [] }];

  return (
    <View style={[StyleSheet.absoluteFill, { zIndex: 200 }]}>
      <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.45)' }]} onPress={onClose} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, justifyContent: 'flex-end' }} pointerEvents="box-none">
        <View style={{ backgroundColor: theme.bg, borderTopLeftRadius: 26, borderTopRightRadius: 26, paddingHorizontal: 18, paddingTop: 10, paddingBottom: insets.bottom + 18, borderWidth: StyleSheet.hairlineWidth, borderColor: theme.border }}>
          <View style={{ alignItems: 'center', paddingBottom: 14 }}>
            <View style={{ width: 38, height: 5, borderRadius: 3, backgroundColor: theme.dark ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.12)' }} />
          </View>

          <TextInput
            value={title}
            onChangeText={setTitle}
            autoFocus
            multiline
            placeholder="记一条行程… 计划、提醒，或路上的见闻"
            placeholderTextColor={theme.text3}
            style={{
              minHeight: 76,
              borderWidth: 1.5,
              borderColor: can ? theme.accent : 'transparent',
              borderRadius: 14,
              backgroundColor: theme.dark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.035)',
              paddingHorizontal: 14,
              paddingVertical: 12,
              fontSize: 15.5,
              lineHeight: 22,
              color: theme.text,
              textAlignVertical: 'top',
              marginBottom: 12,
            }}
          />

          {media.length > 0 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingTop: 4, paddingBottom: 2 }} style={{ marginBottom: 12 }}>
              {media.map((mm, i) => (
                <View key={i}>
                  <MediaThumb theme={theme} m={mm} seed={'new-' + i} />
                  <Press
                    onPress={() => dropMedia(i)}
                    style={{
                      position: 'absolute',
                      top: -5,
                      right: -5,
                      width: 20,
                      height: 20,
                      borderRadius: 10,
                      backgroundColor: theme.dark ? '#2C2C2E' : '#fff',
                      alignItems: 'center',
                      justifyContent: 'center',
                      shadowColor: '#000',
                      shadowOpacity: 0.3,
                      shadowRadius: 5,
                      shadowOffset: { width: 0, height: 1 },
                      elevation: 3,
                    }}
                  >
                    <Icon name="close" color={theme.text} size={11} />
                  </Press>
                </View>
              ))}
            </ScrollView>
          ) : null}

          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 18 }}>
            <Press onPress={() => addMedia(false)} style={{ flex: 1, height: 44, borderRadius: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, backgroundColor: theme.dark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.035)', borderWidth: StyleSheet.hairlineWidth, borderColor: theme.hairline }}>
              <Icon name="photo" color={theme.text2} size={17} />
              <Text style={{ fontSize: 13.5, fontWeight: '600', color: theme.text2 }}>照片</Text>
            </Press>
            <Press onPress={() => addMedia(true)} style={{ flex: 1, height: 44, borderRadius: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, backgroundColor: theme.dark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.035)', borderWidth: StyleSheet.hairlineWidth, borderColor: theme.hairline }}>
              <Icon name="play" color={theme.text2} size={15} />
              <Text style={{ fontSize: 13.5, fontWeight: '600', color: theme.text2 }}>视频</Text>
            </Press>
          </View>

          <Text style={{ fontSize: 11, fontWeight: '700', color: theme.text2, letterSpacing: 0.6, marginBottom: 9 }}>安排在</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 7, paddingBottom: 2 }} style={{ marginBottom: 20 }}>
            {dayOpts.map((d) => {
              const on = day === d.key;
              return (
                <Press key={d.key} onPress={() => setDay(d.key)} style={{ height: 36, paddingHorizontal: 15, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? theme.accent : theme.dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)', borderWidth: StyleSheet.hairlineWidth, borderColor: on ? theme.accent : theme.hairline }}>
                  <Text style={{ fontSize: 13, fontWeight: '600', color: on ? '#fff' : theme.text2 }}>{d.label}</Text>
                </Press>
              );
            })}
          </ScrollView>

          <Press onPress={submit} disabled={!can} style={{ height: 50, borderRadius: 15, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, backgroundColor: can ? theme.accent : theme.dark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)' }}>
            <Icon name="plus" color={can ? '#fff' : theme.text3} size={16} strokeWidth={2.4} />
            <Text style={{ fontSize: 15, fontWeight: '700', color: can ? '#fff' : theme.text3 }}>添加到行程</Text>
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

// ── INLINE CARD — a focused "接下来" digest on the journey detail ─────────────
export function JourneyTimelineCard({ theme, info }: { theme: Theme; info: Poi }) {
  const nav = useNav();
  const store = useJStore(info.id);
  const status = (info.status || 'completed') as JourneyStatus;
  const tl = buildTimeline(info, status, store.items());
  store.ensureInit(tl.defaults);

  const isDone = (r: TLRow) => store.isDone(r.id);
  const doneCount = tl.rows.filter(isDone).length;
  const pending = tl.rows.filter((r) => !isDone(r));
  const allDone = pending.length === 0;

  // "接下来" = next few actionable items in day order
  const ordered = [...tl.rows].sort((a, b) => (DAY_RANK[a.day] || 0) - (DAY_RANK[b.day] || 0));
  const upNext = ordered.filter((r) => !isDone(r)).slice(0, 3);

  return (
    <View style={{ paddingBottom: 18 }}>
      <CardHeader theme={theme} title="行程" action="全部" onAction={() => nav.openTimeline(info)} />
      <View style={{ borderRadius: 16, backgroundColor: theme.dark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.022)', borderWidth: StyleSheet.hairlineWidth, borderColor: theme.hairline, overflow: 'hidden' }}>
        <View style={{ padding: 14, borderBottomWidth: allDone ? 0 : StyleSheet.hairlineWidth, borderColor: theme.hairline }}>
          <ProgressBar theme={theme} done={doneCount} total={tl.total} />
        </View>
        {!allDone ? (
          <View style={{ paddingHorizontal: 14, paddingTop: 12, paddingBottom: 6 }}>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 12 }}>
              <Text style={{ fontSize: 12, fontWeight: '700', color: theme.text2, letterSpacing: 0.6 }}>接下来</Text>
              <Text style={{ fontSize: 11.5, color: theme.text3 }}>还有 {pending.length} 项</Text>
            </View>
            {upNext.map((r, i, arr) => (
              <Row key={r.id} theme={theme} row={r} done={isDone(r)} showDay compact onToggle={() => store.toggle(r.id)} connector={i < arr.length - 1} last={i === arr.length - 1} />
            ))}
          </View>
        ) : null}
      </View>
    </View>
  );
}

// ── FULL-SCREEN — complete day-grouped checkable timeline ────────────────────
export function JourneyTimelineFull({ theme, info, onClose }: { theme: Theme; info: Poi; onClose: () => void }) {
  const store = useJStore(info.id);
  const status = (info.status || 'completed') as JourneyStatus;
  const [adding, setAdding] = useState(false);
  const [viewer, setViewer] = useState<{ media: TLMedia[]; index: number; seedBase: string } | null>(null);

  const tl = buildTimeline(info, status, store.items());
  store.ensureInit(tl.defaults);
  const isDone = (r: TLRow) => store.isDone(r.id);
  const doneCount = tl.rows.filter(isDone).length;

  const addBtn = (
    <Press onPress={() => setAdding(true)} style={{ flexDirection: 'row', alignItems: 'center', gap: 5, height: 32, paddingLeft: 10, paddingRight: 13, borderRadius: 16, backgroundColor: theme.accent }}>
      <Icon name="plus" color="#fff" size={15} strokeWidth={2.6} />
      <Text style={{ color: '#fff', fontSize: 13.5, fontWeight: '700' }}>添加</Text>
    </Press>
  );

  return (
    <>
      <FullOverlay theme={theme} title="行程" subtitle={`${tl.total} 项安排 · 已完成 ${doneCount}`} onClose={onClose} zIndex={150} rightAction={addBtn}>
        <View style={{ paddingHorizontal: 18, paddingTop: 14 }}>
          <ProgressBar theme={theme} done={doneCount} total={tl.total} />
        </View>
        <View style={{ paddingHorizontal: 18, paddingTop: 6 }}>
          {tl.groups.map((g) => (
            <View key={g.key} style={{ marginBottom: 6 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10, marginBottom: 10 }}>
                <Text style={{ fontSize: 13, fontWeight: '800', color: theme.text, letterSpacing: 0.2 }}>{g.label}</Text>
                <View style={{ flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: theme.hairline }} />
                <Text style={{ fontFamily: MONO, fontSize: 10, color: theme.text3 }}>{g.rows.length} 项</Text>
              </View>
              {g.rows.map((r, i) => (
                <Row
                  key={r.id}
                  theme={theme}
                  row={r}
                  done={isDone(r)}
                  onToggle={() => store.toggle(r.id)}
                  connector={i < g.rows.length - 1}
                  last={i === g.rows.length - 1}
                  onOpenMedia={(media, idx, id) => setViewer({ media, index: idx, seedBase: id })}
                />
              ))}
            </View>
          ))}
        </View>
      </FullOverlay>
      {adding ? <AddSheet theme={theme} days={tl.groups} onClose={() => setAdding(false)} onAdd={(it) => { store.add(it); setAdding(false); }} /> : null}
      {viewer ? <MediaViewer theme={theme} media={viewer.media} index={viewer.index} seedBase={viewer.seedBase} onClose={() => setViewer(null)} /> : null}
    </>
  );
}
