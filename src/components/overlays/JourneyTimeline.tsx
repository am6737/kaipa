// JourneyTimeline.tsx — the unified 行程 surface. A user-grouped list of rich
// records (each row can carry photo/video media). Groups are user-defined strings
// — users decide how to organize entries. Exposes the inline digest
// (JourneyTimelineCard) and the bottom-sheet add/edit editor (JourneyEntryEditor):
// tapping a row opens that sheet in edit mode; "+" opens it in add mode.
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, ScrollView, StyleSheet, Pressable, Platform, KeyboardAvoidingView, useWindowDimensions, Modal, Alert, Animated, Keyboard, PanResponder, Easing, LayoutAnimation, UIManager } from 'react-native';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import * as VideoThumbnails from 'expo-video-thumbnails';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Theme } from '../../theme/theme';
import { Poi } from '../../data/pois';
import { TLRow, TLMedia, TLGroup } from '../../data/timeline';
import { useTimeline } from '../../hooks/useTimeline';
import { useData } from '../../data/DataContext';
import { Icon } from '../Icon';
import { Press } from '../Press';
import { useNav } from '../../nav/NavContext';
import { useI18n } from '../../i18n';
import { uploadMedia } from '../../lib/storage';
import { generateSmartPlan, parseJourneySchedule, SmartPlanItem } from '../../lib/smartPlan';
import WheelPicker from '@quidone/react-native-wheel-picker';
import * as Haptics from 'expo-haptics';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}
// Silky expand/collapse for content that holds a focusable input (TextInput must
// stay in normal flow — wrapping it in a measured, clipped, animated-height view
// freezes its updates). LayoutAnimation eases the surrounding layout + fades the
// content in/out, matching the time picker's tween without remeasuring.
const GROUP_TOGGLE_ANIM = {
  duration: 260,
  create: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity },
  update: { type: LayoutAnimation.Types.easeInEaseOut },
  delete: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity },
} as const;

// Silky inline expand/collapse — measures the real content height once, then
// interpolates height + opacity (JS driver; height isn't native-drivable).
function Collapsible({ open, children }: { open: boolean; children: React.ReactNode }) {
  const anim = useRef(new Animated.Value(0)).current;
  const [h, setH] = useState<number | null>(null); // null = not yet measured
  const [rendered, setRendered] = useState(open);
  useEffect(() => {
    if (open) { setRendered(true); return; }
    Animated.timing(anim, { toValue: 0, duration: 210, easing: Easing.inOut(Easing.quad), useNativeDriver: false }).start(({ finished }) => { if (finished) setRendered(false); });
  }, [open, anim]);
  useEffect(() => {
    if (rendered && open && h != null) Animated.timing(anim, { toValue: 1, duration: 280, easing: Easing.inOut(Easing.cubic), useNativeDriver: false }).start();
  }, [rendered, open, h, anim]);
  if (!rendered) return null;
  // First open only: measure off-layout (absolute, opacity 0) so the sheet never
  // jumps; height is cached afterwards, so later opens skip the measure entirely.
  return (
    <Animated.View
      onLayout={h == null ? (e) => { const nh = e.nativeEvent.layout.height; if (nh) setH(nh); } : undefined}
      pointerEvents={h == null ? 'none' : 'auto'}
      style={
        h == null
          ? { position: 'absolute', left: 0, right: 0, opacity: 0 }
          : { height: anim.interpolate({ inputRange: [0, 1], outputRange: [0, h] }), opacity: anim, overflow: 'hidden' }
      }
    >
      {children}
    </Animated.View>
  );
}

const MAX_TL_MEDIA = 10;
const fmtMins = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

const HOUR_OPTS = Array.from({ length: 24 }, (_, h) => ({ value: h, label: String(h).padStart(2, '0') }));
const MIN_OPTS = Array.from({ length: 12 }, (_, i) => ({ value: i * 5, label: String(i * 5).padStart(2, '0') }));

// Two-column 24h time-of-day wheel (hour : 5-min), styled like NewJourney's picker.
function TimeWheel({ theme, value, onChange, compact }: { theme: Theme; value: number; onChange: (mins: number) => void; compact?: boolean }) {
  const h = Math.floor(value / 60);
  const m = (Math.round((value % 60) / 5) * 5) % 60;
  const overlay = { backgroundColor: theme.dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.045)', borderRadius: 10 };
  const textStyle = { fontSize: compact ? 19 : 20, fontWeight: '500' as const, color: theme.text };
  const w = compact ? 54 : 88;
  const vic = compact ? 3 : 5;
  const tick = () => Haptics.selectionAsync();
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: compact ? 0 : 6, paddingVertical: 2 }}>
      <WheelPicker data={HOUR_OPTS} value={h} onValueChanging={tick} onValueChanged={({ item }) => onChange(item.value * 60 + m)} itemHeight={40} visibleItemCount={vic} width={w} itemTextStyle={textStyle} overlayItemStyle={overlay} />
      <Text style={{ fontSize: compact ? 18 : 22, fontWeight: '600', color: theme.text2 }}>:</Text>
      <WheelPicker data={MIN_OPTS} value={m} onValueChanging={tick} onValueChanged={({ item }) => onChange(h * 60 + item.value)} itemHeight={40} visibleItemCount={vic} width={w} itemTextStyle={textStyle} overlayItemStyle={overlay} />
    </View>
  );
}

const fmtRange = (s?: number, e?: number) => (s == null ? '' : e == null ? fmtMins(s) : `${fmtMins(s)}-${fmtMins(e)}`);

const defaultDayName = (n: number, t: ReturnType<typeof useI18n>['t']) => t('journey.timeline.defaultDay', { n });
const dayIndexFromName = (name: string) => {
  const m = name.trim().match(/^(?:第\s*)?(\d+)\s*(?:天|日)?$|^Day\s*(\d+)$/i);
  if (m) return Number(m[1] || m[2]);
  const zh = name.trim().match(/^第\s*(\d+)\s*天$/);
  return zh ? Number(zh[1]) : null;
};
const nextDefaultDayName = (days: string[], t: ReturnType<typeof useI18n>['t']) => {
  const used = days.map(dayIndexFromName).filter((n): n is number => !!n && n > 0);
  return defaultDayName(used.length ? Math.max(...used) + 1 : days.length + 1, t);
};

// Start/end time-of-day picker — both wheels side by side (开始 至 结束), with a
// title row + clear action, shown as a contained card.
function TimeRangePicker({ theme, start, end, onChange, onClear }: { theme: Theme; start: number; end: number; onChange: (start: number, end: number) => void; onClear: () => void }) {
  const { t } = useI18n();
  return (
    <View style={{ marginTop: 8, borderRadius: 18, backgroundColor: theme.dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.035)', paddingHorizontal: 8, paddingTop: 10, paddingBottom: 6 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8, marginBottom: 4 }}>
        <Text style={{ fontSize: 15, fontWeight: '700', color: theme.text }}>{t('journey.timeline.setTime')}</Text>
        <Press onPress={onClear} hitSlop={6}>
          <Text style={{ fontSize: 13.5, fontWeight: '600', color: theme.text2 }}>{t('journey.timeline.clearTime')}</Text>
        </Press>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
        <TimeWheel theme={theme} value={start} onChange={(v) => onChange(v, end)} compact />
        <Text style={{ marginHorizontal: 6, fontSize: 14, color: theme.text2 }}>{t('journey.timeline.to')}</Text>
        <TimeWheel theme={theme} value={end} onChange={(v) => onChange(start, v)} compact />
      </View>
    </View>
  );
}

async function uploadTLMedia(items: TLMedia[], userId: string, journeyId: string): Promise<TLMedia[]> {
  return Promise.all(
    items.map(async (m) => {
      const copy = { ...m };
      if (copy.uri && !copy.uri.startsWith('http')) {
        try { copy.uri = await uploadMedia(copy.uri, userId, journeyId); } catch {}
      }
      if (copy.thumb && !copy.thumb.startsWith('http')) {
        try { copy.thumb = await uploadMedia(copy.thumb, userId, journeyId); } catch {}
      }
      return copy;
    }),
  );
}

// ── Group rows by `day`. Default day names sort by day index; custom names keep
//    their first-seen order after numbered days. ───────────────────────────────
function groupRows(rows: TLRow[], knownGroups: string[]): TLGroup[] {
  const map = new Map<string, { rows: TLRow[]; order: number }>();
  let order = 0;
  for (const g of knownGroups) map.set(g, { rows: [], order: order++ });
  for (const r of rows) {
    const key = r.day || '';
    const group = map.get(key);
    if (group) group.rows.push(r);
    else map.set(key, { rows: [r], order: order++ });
  }
  return [...map.entries()]
    .sort((a, b) => {
      const ai = dayIndexFromName(a[0]);
      const bi = dayIndexFromName(b[0]);
      if (ai != null && bi != null) return ai - bi;
      if (ai != null) return -1;
      if (bi != null) return 1;
      return a[1].order - b[1].order;
    })
    .map(([key, group]) => ({ key, label: key, rows: group.rows }));
}

// ── Day selector: 总览 + each day as a capsule chip, plus an optional "+" ─────
const ALL_DAYS = '__all__';
function DayChips({ theme, items, active, onSelect, onAdd, editable, onDeleteItem, onRenameItem, dismissSignal, onEditingChange }: {
  theme: Theme;
  items: { key: string; label: string }[];
  active: string;
  onSelect: (key: string) => void;
  onAdd?: () => void;
  editable?: boolean;
  onDeleteItem?: (key: string) => void;
  onRenameItem?: (key: string, label: string) => void;
  dismissSignal?: number;
  onEditingChange?: (editing: boolean) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const beginEditing = () => { if (editable) { setEditing(true); onEditingChange?.(true); } };
  const finishEditing = () => { setEditing(false); setEditingKey(null); setDraft(''); onEditingChange?.(false); };
  useEffect(() => {
    if (dismissSignal && editing) finishEditing();
  }, [dismissSignal]);
  const startRename = (key: string, label: string) => {
    if (!editing || key === ALL_DAYS) return;
    setEditingKey(key);
    setDraft(label);
  };
  const commitRename = () => {
    if (!editingKey) return;
    const next = draft.trim();
    if (next) onRenameItem?.(editingKey, next);
    finishEditing();
  };

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 7, paddingVertical: 3, paddingHorizontal: 2 }}>
      {items.map((c) => {
        const on = c.key === active;
        const canEdit = editing && c.key !== ALL_DAYS;
        const isRenaming = editingKey === c.key;
        return (
          <View key={c.key} style={{ paddingTop: 4, paddingRight: 4 }}>
            <Press
              onPress={() => {
                if (canEdit) startRename(c.key, c.label);
                else { finishEditing(); onSelect(c.key); }
              }}
              onLongPress={c.key === ALL_DAYS ? undefined : beginEditing}
              delayLongPress={360}
              style={{
                minWidth: isRenaming ? 92 : undefined,
                height: 34,
                paddingHorizontal: isRenaming ? 10 : 14,
                borderRadius: 17,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: on ? theme.accent : theme.dark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.05)',
                borderWidth: canEdit && !on ? StyleSheet.hairlineWidth : 0,
                borderColor: theme.hairline,
              }}
            >
              {isRenaming ? (
                <TextInput
                  value={draft}
                  onChangeText={setDraft}
                  autoFocus
                  selectTextOnFocus
                  returnKeyType="done"
                  onSubmitEditing={commitRename}
                  onBlur={commitRename}
                  maxLength={20}
                  style={{ minWidth: 60, padding: 0, textAlign: 'center', fontSize: 13.5, fontWeight: '700', color: on ? '#fff' : theme.text }}
                />
              ) : (
                <Text style={{ fontSize: 13.2, fontWeight: on ? '700' : '600', color: on ? '#fff' : theme.text2 }} numberOfLines={1}>{c.label}</Text>
              )}
            </Press>
            {canEdit ? (
              <Press
                onPress={() => { finishEditing(); onDeleteItem?.(c.key); }}
                hitSlop={8}
                style={{ position: 'absolute', top: 0, right: 0, width: 16, height: 16, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.danger ?? '#ff3b30' }}
              >
                <Icon name="close" color="#fff" size={8} strokeWidth={3} />
              </Press>
            ) : null}
          </View>
        );
      })}
      {onAdd && !editing ? (
        <View style={{ paddingTop: 4, paddingRight: 4 }}>
          <Press onPress={onAdd} style={{ width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth, borderColor: theme.hairline }}>
            <Icon name="plus" color={theme.text2} size={16} />
          </Press>
        </View>
      ) : null}
    </ScrollView>
  );
}

// ── A collapsible day group: bold label + count, chevron when collapsible ─────
function DaySection({ theme, label, count, collapsible, collapsed, onToggle, children }: {
  theme: Theme;
  label: string;
  count: string;
  collapsible?: boolean;
  collapsed?: boolean;
  onToggle?: () => void;
  children: React.ReactNode;
}) {
  return (
    <View style={{ marginBottom: 14 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 12, minHeight: 52 }}>
        <Pressable
          onPress={collapsible ? onToggle : undefined}
          hitSlop={8}
          style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 }}
        >
          <Text style={{ fontSize: 18, fontWeight: '800', color: theme.text }} numberOfLines={1}>{label}</Text>
          <Text style={{ fontSize: 13.5, color: theme.text3 }}>{count}</Text>
        </Pressable>
        {collapsible ? (
          <Press onPress={onToggle} hitSlop={8} style={{ width: 28, height: 28, alignItems: 'center', justifyContent: 'center', transform: [{ rotate: collapsed ? '0deg' : '180deg' }] }}>
            <Icon name="chevronDown" color={theme.text2} size={18} />
          </Press>
        ) : null}
      </View>
      {collapsed ? null : children}
    </View>
  );
}

// Inline video player for the fullscreen viewer.
function ViewerVideo({ uri, width, height }: { uri: string; width: number; height: number }) {
  const player = useVideoPlayer(uri, (p) => { p.loop = true; p.play(); });
  return <VideoView player={player} style={{ width, height }} nativeControls />;
}

// Fullscreen media viewer — swipe to page, video plays inline. Rendered through a
// Modal so it covers the whole screen even when launched from a nested card.
function MediaViewer({
  theme,
  media,
  index,
  onClose,
  onDelete,
}: {
  theme: Theme;
  media: TLMedia[];
  index: number;
  onClose: () => void;
  onDelete?: (index: number) => void;
}) {
  const insets = useSafeAreaInsets();
  const { t } = useI18n();
  const { width, height } = useWindowDimensions();
  const scrollRef = useRef<ScrollView>(null);
  const [i, setI] = useState(index || 0);
  const m = media[i] || media[0];
  const viewH = height;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fadeAnim, { toValue: 1, duration: 250, useNativeDriver: true }).start();
  }, [fadeAnim]);

  useEffect(() => {
    if (index > 0) setTimeout(() => scrollRef.current?.scrollTo({ x: index * width, animated: false }), 10);
  }, [index, width]);

  const renderItem = (mm: TLMedia, idx: number) => {
    const isNear = Math.abs(idx - i) <= 1;
    if (!isNear) return <View key={idx} style={{ width }} />;
    const isActive = idx === i;
    if (mm.video && mm.uri && isActive) {
      return (
        <View key={idx} style={{ width, height, alignItems: 'center', justifyContent: 'center' }}>
          <ViewerVideo uri={mm.uri} width={width} height={viewH} />
        </View>
      );
    }
    const displayUri = mm.video ? mm.thumb : mm.uri;
    return (
      <Pressable key={idx} onPress={onClose} style={{ width, height, alignItems: 'center', justifyContent: 'center' }}>
        {displayUri ? (
          <Image source={{ uri: displayUri }} contentFit="contain" transition={200} style={{ width, height: viewH }} />
        ) : (
          <View style={{ width, height: viewH, backgroundColor: 'rgba(255,255,255,0.06)' }} />
        )}
      </Pressable>
    );
  };

  return (
    <Modal visible transparent animationType="none" statusBarTranslucent onRequestClose={onClose}>
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.94)', opacity: fadeAnim }]}>
        <View
          pointerEvents="box-none"
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            zIndex: 2,
            paddingTop: insets.top + 8,
            paddingHorizontal: 18,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <Press onPress={onClose} hitSlop={12} style={{ width: 34, height: 34, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: '#fff', fontSize: 34, lineHeight: 34, fontWeight: '200' }}>×</Text>
          </Press>
          <View style={{ minWidth: 44, height: 28, borderRadius: 14, paddingHorizontal: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.2)' }}>
            <Text style={{ color: '#fff', fontSize: 13, fontWeight: '800' }}>{media.length > 1 ? `${i + 1}/${media.length}` : m.video ? t('journey.media.video') : t('journey.media.photo')}</Text>
          </View>
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
        {onDelete ? (
          <View
            pointerEvents="box-none"
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              bottom: 0,
              zIndex: 2,
              paddingHorizontal: 24,
              paddingBottom: Math.max(insets.bottom, 14) + 4,
              alignItems: 'flex-end',
            }}
          >
            <Press
              onPress={() => onDelete(i)}
              style={{
                height: 48,
                minWidth: 96,
                borderRadius: 24,
                paddingHorizontal: 22,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: '#FFF8FB',
              }}
            >
              <Text style={{ fontSize: 17, fontWeight: '800', color: theme.danger ?? '#FF5A7A' }}>{t('common.delete')}</Text>
            </Press>
          </View>
        ) : null}
      </Animated.View>
    </Modal>
  );
}

// ── One itinerary entry — full text + inline tappable photos (no done state) ──
function ItineraryItem({ theme, row, onPress, onOpenMedia }: {
  theme: Theme;
  row: TLRow;
  onPress?: () => void;
  onOpenMedia?: (media: TLMedia[], index: number, row: TLRow) => void;
}) {
  const media = row.media || [];
  return (
    <Pressable
      onPress={onPress}
      style={{
        paddingVertical: 14,
        gap: media.length ? 10 : 8,
      }}
    >
      <View style={{ gap: 7 }}>
        {row.timeStart != null ? (
          <Text style={{ fontSize: 12.5, fontWeight: '600', color: theme.text3 }}>
            {fmtRange(row.timeStart, row.timeEnd ?? undefined)}
          </Text>
        ) : null}
        <Text style={{ fontSize: 17, fontWeight: '800', lineHeight: 24, color: theme.text, letterSpacing: -0.2 }}>
          {row.title}
        </Text>
      </View>
      {media.length ? (
        <View style={{ marginTop: 2, flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
          {media.map((mm, idx) => {
            const uri = mm.video ? mm.thumb : mm.uri;
            return (
              <Pressable
                key={idx}
                onPress={onOpenMedia ? () => onOpenMedia(media, idx, row) : undefined}
                style={{
                  width: 104,
                  height: 104,
                  borderRadius: 18,
                  overflow: 'hidden',
                  backgroundColor: theme.dark ? 'rgba(255,255,255,0.06)' : '#F3F5FA',
                }}
              >
                {uri ? <Image source={{ uri }} contentFit="cover" style={{ width: 104, height: 104 }} /> : null}
                {mm.video ? (
                  <View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.18)' }]}>
                    <Icon name="play" color="#fff" size={16} />
                  </View>
                ) : null}
              </Pressable>
            );
          })}
        </View>
      ) : null}
    </Pressable>
  );
}


function SmartPlanSheet({ theme, info, rows, defaultDays, onApply, onClose }: {
  theme: Theme;
  info: Poi;
  rows: TLRow[];
  defaultDays: number;
  onApply: (items: SmartPlanItem[]) => Promise<void>;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { t } = useI18n();
  const [notes, setNotes] = useState('');
  const [startTime, setStartTime] = useState('');
  const [items, setItems] = useState<SmartPlanItem[]>([]);
  const [meta, setMeta] = useState<{ provider: string; model?: string; warning?: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const subtle = theme.dark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.05)';
  const run = async () => {
    const sched = parseJourneySchedule(info);
    const n = sched.days ?? Math.max(1, Math.min(14, defaultDays || 2));
    const st = startTime.trim();
    setLoading(true);
    try {
      const res = await generateSmartPlan({
        poi: info,
        rows,
        preferences: { days: n, startTime: /^\d{1,2}:\d{2}$/.test(st) ? st : undefined, notes: notes.trim() || undefined },
      });
      setItems(res.items);
      setMeta({ provider: res.provider, model: res.model, warning: res.warning });
    } catch (e) {
      Alert.alert(t('journey.smartPlan.failedTitle'), e instanceof Error ? e.message : t('journey.smartPlan.failedBody'));
    } finally {
      setLoading(false);
    }
  };
  const apply = async () => {
    if (!items.length) return;
    setApplying(true);
    try {
      await onApply(items);
      onClose();
    } catch (e) {
      Alert.alert(t('journey.smartPlan.applyFailed'), e instanceof Error ? e.message : t('journey.smartPlan.failedBody'));
    } finally {
      setApplying(false);
    }
  };
  return (
    <Modal visible transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.28)' }}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={{ maxHeight: items.length ? '88%' : undefined, borderTopLeftRadius: 26, borderTopRightRadius: 26, backgroundColor: theme.bg, paddingTop: 8, paddingBottom: Math.max(insets.bottom, 12), overflow: 'hidden' }}>
          <View style={{ alignItems: 'center', paddingBottom: 6 }}><View style={{ width: 40, height: 5, borderRadius: 3, backgroundColor: theme.text3 }} /></View>
          <View style={{ paddingHorizontal: 18, paddingBottom: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <View style={{ flex: 1, paddingRight: 12 }}>
              <Text style={{ fontSize: 20, fontWeight: '800', color: theme.text }}>{t('journey.smartPlan.title')}</Text>
              <Text style={{ marginTop: 3, fontSize: 12.5, lineHeight: 18, color: theme.text2 }}>{t('journey.smartPlan.subtitle')}</Text>
            </View>
            <Press onPress={onClose} style={{ width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: subtle }}><Icon name="close" color={theme.text2} size={15} /></Press>
          </View>
          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" scrollEnabled={!!items.length} contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: items.length ? 18 : 0 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <Text style={{ fontSize: 13.5, fontWeight: '700', color: theme.text2 }}>{t('journey.smartPlan.startTime')}</Text>
              <TextInput
                value={startTime}
                onChangeText={setStartTime}
                placeholder={t('journey.smartPlan.startTimePlaceholder')}
                placeholderTextColor={theme.text3}
                keyboardType={Platform.OS === 'ios' ? 'numbers-and-punctuation' : 'default'}
                maxLength={5}
                style={{ minWidth: 96, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: subtle, color: theme.text, fontSize: 14 }}
              />
            </View>
            <TextInput
              value={notes}
              onChangeText={setNotes}
              multiline
              placeholder={t('journey.smartPlan.notesPlaceholder')}
              placeholderTextColor={theme.text3}
              style={{ minHeight: 96, borderRadius: 16, padding: 12, backgroundColor: subtle, color: theme.text, fontSize: 14, lineHeight: 20, textAlignVertical: 'top', marginBottom: 12 }}
            />
            <Press onPress={run} disabled={loading} style={{ height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: loading ? subtle : theme.accent, marginBottom: items.length ? 14 : 0 }}>
              <Text style={{ fontSize: 15, fontWeight: '800', color: loading ? theme.text3 : '#fff' }}>{loading ? t('journey.smartPlan.generating') : t('journey.smartPlan.generate')}</Text>
            </Press>
            {meta ? (
              meta.provider === 'fallback' ? (
                <Text style={{ marginBottom: items.length ? 12 : 0, fontSize: 12, lineHeight: 17, color: '#E4A11B', fontWeight: '600' }}>
                  ⚠️ {t('journey.smartPlan.fallbackNotice', { reason: meta.warning || '' })}
                </Text>
              ) : (
                <Text style={{ marginBottom: items.length ? 12 : 0, fontSize: 12, color: theme.text3 }}>
                  {t('journey.smartPlan.generatedBy', { provider: meta.model ? `${meta.provider} · ${meta.model}` : meta.provider })}
                </Text>
              )
            ) : null}
            {items.length ? (
              <View style={{ borderRadius: 16, overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth, borderColor: theme.hairline, backgroundColor: theme.dark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.02)' }}>
                {items.map((it, i) => (
                  <View key={`${it.day}-${i}`} style={{ paddingHorizontal: 14, paddingVertical: 11, borderTopWidth: i === 0 ? 0 : StyleSheet.hairlineWidth, borderColor: theme.hairline }}>
                    <Text style={{ fontSize: 11.5, fontWeight: '800', color: theme.accent }}>{it.day}{it.timeStart != null ? ` · ${fmtRange(it.timeStart, it.timeEnd)}` : ''}</Text>
                    <Text style={{ marginTop: 4, fontSize: 14.5, fontWeight: '600', lineHeight: 20, color: theme.text }}>{it.title}</Text>
                  </View>
                ))}
              </View>
            ) : null}
          </ScrollView>
          {items.length ? (
            <View style={{ paddingHorizontal: 18, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth, borderColor: theme.hairline }}>
              <Press onPress={apply} disabled={applying} style={{ height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center', backgroundColor: applying ? subtle : theme.accent }}>
                <Text style={{ fontSize: 15, fontWeight: '800', color: applying ? theme.text3 : '#fff' }}>{applying ? t('journey.smartPlan.applying') : t('journey.smartPlan.apply', { count: items.length })}</Text>
              </Press>
            </View>
          ) : null}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export function JourneyTimelineCard({ theme, info, readOnly }: { theme: Theme; info: Poi; readOnly?: boolean }) {
  const nav = useNav();
  const { t } = useI18n();
  const { userId } = useData();
  const tl = useTimeline(info.id, userId);
  const [activeDay, setActiveDay] = useState<string>(ALL_DAYS);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [viewer, setViewer] = useState<{ rowId: string; media: TLMedia[]; index: number } | null>(null);
  const [chipsEditing, setChipsEditing] = useState(false);
  const [dismissChipsSignal, setDismissChipsSignal] = useState(0);
  const [smartPlanOpen, setSmartPlanOpen] = useState(false);

  const groups = groupRows(tl.rows, tl.knownGroups);
  const dayLabel = (g: TLGroup) => g.label.trim() || t('journey.timeline.ungrouped');
  const nextDayName = () => {
    const used = new Set(groups.map((g) => g.key));
    let n = 1;
    while (used.has(`Day ${n}`)) n += 1;
    return `Day ${n}`;
  };
  const addNextDay = () => {
    const day = nextDayName();
    tl.addGroup(day);
    setActiveDay(day);
  };
  const toggleCollapse = (key: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  const openSmartPlan = () => setSmartPlanOpen(true);

  const confirmDeleteGroup = (g: TLGroup) => {
    const label = dayLabel(g);
    Alert.alert(
      t('journey.timeline.deleteGroupTitle', { name: label }),
      t('journey.timeline.deleteGroupMessage', { count: g.rows.length }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: () => {
            tl.removeGroup(g.key);
            if (activeDay === g.key) setActiveDay(ALL_DAYS);
          },
        },
      ],
    );
  };

  if (tl.rows.length === 0) {
    return (
      <View style={{ paddingBottom: 18 }}>
        {readOnly ? null : (
          <View style={{ alignItems: 'center', paddingVertical: 24, paddingHorizontal: 14, borderRadius: 16, backgroundColor: theme.dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.03)', borderWidth: StyleSheet.hairlineWidth, borderColor: theme.hairline }}>
            <Icon name="calendar" color={theme.text3} size={24} />
            <Text style={{ fontSize: 13, color: theme.text3, marginTop: 8 }}>{t('journey.empty.timeline')}</Text>
            <Text style={{ fontSize: 11.5, color: theme.text3, marginTop: 2, textAlign: 'center' }}>{t('journey.empty.timelineHint')}</Text>
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 14 }}>
              <Press
                onPress={() => nav.openTimelineAdd(info, '')}
                style={{ height: 34, paddingHorizontal: 14, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.accent }}
              >
                <Text style={{ fontSize: 12.5, fontWeight: '700', color: '#fff' }}>{t('journey.timeline.addManually')}</Text>
              </Press>
              <Press
                onPress={openSmartPlan}
                style={{ height: 34, paddingHorizontal: 14, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.dark ? 'rgba(255,255,255,0.09)' : 'rgba(0,0,0,0.06)', borderWidth: StyleSheet.hairlineWidth, borderColor: theme.hairline }}
              >
                <Text style={{ fontSize: 12.5, fontWeight: '700', color: theme.text2 }}>{t('journey.timeline.smartPlan')}</Text>
              </Press>
            </View>
          </View>
        )}
        {smartPlanOpen ? (
          <SmartPlanSheet
            theme={theme}
            info={info}
            rows={tl.rows}
            defaultDays={Number.parseInt(info.days || '', 10) || 2}
            onClose={() => setSmartPlanOpen(false)}
            onApply={async (items) => {
              for (const it of items) await tl.add({ title: it.title, day: it.day, timeStart: it.timeStart, timeEnd: it.timeEnd });
            }}
          />
        ) : null}
      </View>
    );
  }

  const chips = [{ key: ALL_DAYS, label: t('journey.tab.overview') }, ...groups.map((g) => ({ key: g.key, label: dayLabel(g) }))];
  const shownGroups = activeDay === ALL_DAYS ? groups : groups.filter((g) => g.key === activeDay);

  // a day's entries as a grouped, hairline-separated card + (editable) an add row
  const renderItems = (g: TLGroup) => {
    // within a day, sort by time-of-day (timed first, ascending); untimed keep order
    const rows = [...g.rows]
      .map((r, i) => ({ r, i }))
      .sort((a, b) => {
        const ta = a.r.timeStart ?? Infinity, tb = b.r.timeStart ?? Infinity;
        return ta === tb ? a.i - b.i : ta - tb;
      })
      .map((x) => x.r);
    return (
      <View
        style={{
          borderRadius: 0,
          overflow: 'visible',
          backgroundColor: 'transparent',
        }}
      >
        {rows.map((r, i) => (
          <View key={r.id} style={{ paddingHorizontal: 0, marginTop: i === 0 ? 0 : 14 }}>
            <View style={{ paddingHorizontal: 0 }}>
              <ItineraryItem
                theme={theme}
                row={r}
                onPress={readOnly ? undefined : () => nav.openTimelineEdit(info, r)}
                onOpenMedia={(media, index, row) => setViewer({ rowId: row.id, media, index })}
              />
            </View>
          </View>
        ))}
        {readOnly ? null : (
          <>
            <View style={{ height: 14 }} />
            <Press
              onPress={() => nav.openTimelineAdd(info, g.key)}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 10,
                paddingHorizontal: 0,
                paddingVertical: 16,
              }}
            >
              <View style={{ width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.accentSofter }}>
                <Icon name="plus" color={theme.accent} size={16} />
              </View>
              <Text style={{ fontSize: 14.5, fontWeight: '700', color: theme.accent }}>{t('journey.action.add')}</Text>
            </Press>
          </>
        )}
      </View>
    );
  };

  return (
    <View style={{ paddingBottom: 18, position: 'relative' }}>
      {chipsEditing ? (
        <Pressable
          onPress={() => setDismissChipsSignal((v) => v + 1)}
          style={[StyleSheet.absoluteFill, { zIndex: 1 }]}
        />
      ) : null}
      <View style={{ marginBottom: 14, zIndex: 2 }}>
        <DayChips
          theme={theme}
          items={chips}
          active={activeDay}
          onSelect={setActiveDay}
          onAdd={readOnly ? undefined : addNextDay}
          editable={!readOnly}
          dismissSignal={dismissChipsSignal}
          onEditingChange={setChipsEditing}
          onDeleteItem={(key) => {
            const group = groups.find((g) => g.key === key);
            if (group) confirmDeleteGroup(group);
          }}
          onRenameItem={(key, label) => {
            tl.renameGroup(key, label);
            if (activeDay === key) setActiveDay(label);
          }}
        />
      </View>
      {readOnly ? null : (
        <View style={{ marginBottom: 16, flexDirection: 'row', gap: 10, alignItems: 'center' }}>
          <Press
            onPress={openSmartPlan}
            style={{ flex: 1, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.accentSofter, borderWidth: StyleSheet.hairlineWidth, borderColor: theme.accentSoft }}
          >
            <Text style={{ fontSize: 14, fontWeight: '700', color: theme.accent }}>{t('journey.timeline.smartPlanFull')}</Text>
          </Press>
        </View>
      )}
      {shownGroups.map((g) => (
        <DaySection
          key={g.key}
          theme={theme}
          label={dayLabel(g)}
          count={t('journey.timeline.itemCount', { count: g.rows.length })}
          collapsible={activeDay === ALL_DAYS}
          collapsed={activeDay === ALL_DAYS && collapsed.has(g.key)}
          onToggle={() => toggleCollapse(g.key)}
        >
          {renderItems(g)}
        </DaySection>
      ))}
      {viewer ? (
        <MediaViewer
          theme={theme}
          media={viewer.media}
          index={viewer.index}
          onClose={() => setViewer(null)}
          onDelete={
            readOnly
              ? undefined
              : (deleteIndex) => {
                  const row = tl.rows.find((r) => r.id === viewer.rowId);
                  const mediaItem = row?.media?.[deleteIndex];
                  if (!row || !mediaItem) return;
                  Alert.alert(
                    t('common.delete'),
                    t('journey.media.deleteConfirm'),
                    [
                      { text: t('common.cancel'), style: 'cancel' },
                      {
                        text: t('common.delete'),
                        style: 'destructive',
                        onPress: async () => {
                          const nextMedia = (row.media || []).filter((_, i) => i !== deleteIndex);
                          await tl.update(row.id, { media: nextMedia.length ? nextMedia : undefined });
                          setViewer(null);
                        },
                      },
                    ],
                  );
                }
          }
        />
      ) : null}
      {smartPlanOpen ? (
        <SmartPlanSheet
          theme={theme}
          info={info}
          rows={tl.rows}
          defaultDays={groups.length || Number.parseInt(info.days || '', 10) || 2}
          onClose={() => setSmartPlanOpen(false)}
          onApply={async (items) => {
            for (const it of items) await tl.add({ title: it.title, day: it.day, timeStart: it.timeStart, timeEnd: it.timeEnd });
          }}
        />
      ) : null}
    </View>
  );
}

async function assetToMedia(a: ImagePicker.ImagePickerAsset): Promise<TLMedia> {
  const isVideo = a.type === 'video';
  let thumb: string | undefined;
  if (isVideo) {
    try { const r = await VideoThumbnails.getThumbnailAsync(a.uri, { time: 500 }); thumb = r.uri; } catch {}
  }
  return { tone: 'forest', uri: a.uri, thumb, video: isVideo || undefined };
}

// ── Quick add — a lightweight bottom sheet. Most entries are just a line or two
//    of text (maybe a time + a few photos), so we skip the full-screen editor. ──
function QuickAddSheet({ theme, initialDay, defaultDay, existingDays, editRow, zIndex = 80, onSubmit, onClose }: {
  theme: Theme;
  initialDay?: string;
  defaultDay: string;
  existingDays: string[];
  editRow?: TLRow;
  zIndex?: number;
  onSubmit: (it: Omit<TLRow, 'id'>) => void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { t } = useI18n();
  const initDay = editRow ? (editRow.day || defaultDay) : initialDay?.trim() || defaultDay;
  const [text, setText] = useState(editRow?.title ?? '');
  const [media, setMedia] = useState<TLMedia[]>(editRow?.media ?? []);
  const [day, setDay] = useState(initDay);
  const [dayOpen, setDayOpen] = useState(false);
  const [startMins, setStartMins] = useState<number | null>(editRow?.timeStart ?? null);
  const [endMins, setEndMins] = useState<number | null>(editRow?.timeEnd ?? null);
  const [showTime, setShowTime] = useState(false);
  const [keyboardH, setKeyboardH] = useState(0);

  const slide = useRef(new Animated.Value(600)).current;
  useEffect(() => { Animated.spring(slide, { toValue: 0, useNativeDriver: true, bounciness: 3, speed: 16 }).start(); }, [slide]);
  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSub = Keyboard.addListener(showEvent, (e) => {
      setKeyboardH(Math.max(0, e.endCoordinates.height));
    });
    const hideSub = Keyboard.addListener(hideEvent, () => setKeyboardH(0));
    return () => { showSub.remove(); hideSub.remove(); };
  }, [insets.bottom]);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const animateClose = () => {
    Keyboard.dismiss();
    Animated.timing(slide, { toValue: 700, duration: 200, useNativeDriver: true }).start(() => closeRef.current());
  };
  const pan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_e, g) => g.dy > 6 && Math.abs(g.dy) > Math.abs(g.dx),
      onPanResponderMove: (_e, g) => { if (g.dy > 0) slide.setValue(g.dy); },
      onPanResponderRelease: (_e, g) => {
        if (g.dy > 80 || g.vy > 0.6) animateClose();
        else Animated.spring(slide, { toValue: 0, useNativeDriver: true, bounciness: 4, speed: 16 }).start();
      },
    }),
  ).current;

  const pickFromLibrary = async () => {
    const remaining = MAX_TL_MEDIA - media.length;
    if (remaining <= 0) { Alert.alert(t('journey.timeline.photoLimit')); return; }
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return;
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images', 'videos'], allowsMultipleSelection: true, selectionLimit: remaining, quality: 0.8 });
    if (res.canceled) return;
    const added = await Promise.all(res.assets.slice(0, remaining).map(assetToMedia));
    setMedia((m) => [...m, ...added].slice(0, MAX_TL_MEDIA));
  };

  // Expand immediately (no waiting on the keyboard) — the Collapsible's own
  // smooth height/opacity tween keeps it from feeling jumpy.
  const toggleTime = () => {
    if (showTime) { setShowTime(false); return; }
    if (startMins == null) { setStartMins(540); setEndMins(600); }
    Keyboard.dismiss();
    setShowTime(true);
  };
  const clearTime = () => { setShowTime(false); setStartMins(null); setEndMins(null); };
  const can = text.trim().length > 0;
  const submit = () => {
    if (!can) return;
    onSubmit({ title: text.trim(), day: day.trim() || defaultDay, media: media.length ? media : undefined, timeStart: startMins ?? undefined, timeEnd: endMins ?? undefined });
    animateClose();
  };

  const subtle = theme.dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)';

  return (
    <View style={[StyleSheet.absoluteFill, { zIndex }]}>
      <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.45)' }]} onPress={animateClose} />
      <View style={[StyleSheet.absoluteFill, { justifyContent: 'flex-end' }]} pointerEvents="box-none">
        <Animated.View style={{ transform: [{ translateY: Animated.add(slide, -keyboardH) }], backgroundColor: theme.bg, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingBottom: keyboardH > 0 ? 12 : Math.max(insets.bottom, 12) + 4, borderTopWidth: StyleSheet.hairlineWidth, borderColor: theme.hairline }}>
          <View {...pan.panHandlers} style={{ paddingTop: 10, paddingBottom: 4, alignItems: 'center' }}>
            <View style={{ width: 36, height: 5, borderRadius: 3, backgroundColor: theme.dark ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.12)' }} />
          </View>

          <View style={{ paddingHorizontal: 18, paddingTop: 4 }}>
            {/* add-to which day */}
            <View style={{ flexDirection: 'row' }}>
              <Press onPress={() => { LayoutAnimation.configureNext(GROUP_TOGGLE_ANIM); setDayOpen((o) => !o); }} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, height: 34, paddingHorizontal: 14, borderRadius: 17, backgroundColor: subtle }}>
                <Text style={{ fontSize: 13.5, color: theme.text2 }}>{t('journey.timeline.addTo')}</Text>
                <Text style={{ fontSize: 13.5, fontWeight: '700', color: theme.text }}>{day.trim() || t('journey.timeline.ungrouped')}</Text>
                <View style={{ transform: [{ rotate: dayOpen ? '180deg' : '0deg' }] }}>
                  <Icon name="chevronDown" color={theme.text3} size={14} />
                </View>
              </Press>
            </View>
            {dayOpen ? (
              <View style={{ marginTop: 10, gap: 8 }}>
                {existingDays.length ? (
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                    {existingDays.map((k) => {
                      const on = k === day;
                      return (
                        <Press key={k} onPress={() => { setDay(k); LayoutAnimation.configureNext(GROUP_TOGGLE_ANIM); setDayOpen(false); }} style={{ height: 32, paddingHorizontal: 14, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? theme.accent : subtle }}>
                          <Text style={{ fontSize: 13, fontWeight: on ? '700' : '600', color: on ? '#fff' : theme.text2 }}>{k}</Text>
                        </Press>
                      );
                    })}
                  </View>
                ) : null}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={{ fontSize: 14, color: theme.text3, fontWeight: '600' }}>#</Text>
                  <TextInput value={day} onChangeText={setDay} placeholder={defaultDay} placeholderTextColor={theme.text3} maxLength={20} style={{ flex: 1, height: 38, fontSize: 14, fontWeight: '600', color: theme.accent, padding: 0 }} />
                </View>
              </View>
            ) : null}

            {/* the few sentences */}
            <TextInput
              value={text}
              onChangeText={setText}
              onFocus={() => setShowTime(false)}
              autoFocus
              multiline
              textAlignVertical="top"
              placeholder={t('journey.timeline.addPlaceholder')}
              placeholderTextColor={theme.text3}
              style={{ marginTop: 12, minHeight: 76, maxHeight: 150, fontSize: 16.5, lineHeight: 24, color: theme.text, padding: 0 }}
            />

            {/* photos */}
            {media.length ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 8, paddingVertical: 4 }} style={{ marginTop: 4 }}>
                {media.map((m, i) => {
                  const uri = m.video ? m.thumb : m.uri;
                  return (
                    <View key={i} style={{ width: 64, height: 64, borderRadius: 12, overflow: 'hidden', backgroundColor: subtle }}>
                      {uri ? <Image source={{ uri }} contentFit="cover" style={{ width: 64, height: 64 }} /> : null}
                      {m.video ? (
                        <View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.18)' }]}>
                          <Icon name="play" color="#fff" size={14} />
                        </View>
                      ) : null}
                      <Press onPress={() => setMedia((arr) => arr.filter((_, j) => j !== i))} hitSlop={6} style={{ position: 'absolute', top: 3, right: 3, width: 20, height: 20, borderRadius: 10, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center' }}>
                        <Icon name="close" color="#fff" size={11} />
                      </Press>
                    </View>
                  );
                })}
              </ScrollView>
            ) : null}

            {/* time range */}
            <Collapsible open={showTime && startMins != null}>
              <TimeRangePicker theme={theme} start={startMins ?? 540} end={endMins ?? (startMins ?? 540) + 60} onChange={(s, e) => { setStartMins(s); setEndMins(e); }} onClear={clearTime} />
            </Collapsible>
          </View>

          {/* toolbar — quick pills (time · photos) + done */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingTop: 10, marginTop: 6, borderTopWidth: StyleSheet.hairlineWidth, borderColor: theme.hairline }}>
            <Press onPress={toggleTime} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, height: 36, paddingHorizontal: 14, borderRadius: 18, backgroundColor: showTime ? theme.accent : subtle }}>
              <Icon name="clock" color={showTime ? '#fff' : startMins != null ? theme.accent : theme.text2} size={17} />
              <Text style={{ fontSize: 13.5, fontWeight: '600', color: showTime ? '#fff' : startMins != null ? theme.text : theme.text2 }}>
                {startMins != null ? fmtRange(startMins, endMins ?? undefined) : t('journey.timeline.addTime')}
              </Text>
            </Press>
            <Press onPress={pickFromLibrary} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, height: 36, paddingHorizontal: 14, borderRadius: 18, backgroundColor: subtle }}>
              <Icon name="photo" color={theme.text2} size={17} />
              <Text style={{ fontSize: 13.5, fontWeight: '600', color: theme.text2 }}>{t('journey.timeline.addPhoto')} {media.length}/{MAX_TL_MEDIA}</Text>
            </Press>
            <View style={{ flex: 1 }} />
            <Press onPress={submit} style={{ height: 36, paddingHorizontal: 18, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: can ? theme.accent : subtle }}>
              <Text style={{ fontSize: 14.5, fontWeight: '700', color: can ? '#fff' : theme.text3 }}>{editRow ? t('common.save') : t('common.done')}</Text>
            </Press>
          </View>
        </Animated.View>
      </View>
    </View>
  );
}

// ── Direct add — pops the quick-add sheet straight up from the inline 行程 tab ─
export function JourneyEntryEditor({ theme, info, initialDay, editRow, onClose }: { theme: Theme; info: Poi; initialDay?: string; editRow?: TLRow; onClose: () => void }) {
  const { userId } = useData();
  const tl = useTimeline(info.id, userId);
  const { t } = useI18n();
  const existingDays = groupRows(tl.rows, tl.knownGroups).map((g) => g.key).filter(Boolean);
  const defaultDay = nextDefaultDayName(existingDays, t);
  return (
    <QuickAddSheet
      theme={theme}
      initialDay={initialDay}
      defaultDay={defaultDay}
      existingDays={existingDays}
      editRow={editRow}
      onClose={onClose}
      onSubmit={async (it) => {
        if (it.media?.length && userId) {
          it = { ...it, media: await uploadTLMedia(it.media, userId, info.id) };
        }
        if (editRow) { tl.update(editRow.id, it); } else { tl.add(it); }
      }}
    />
  );
}
