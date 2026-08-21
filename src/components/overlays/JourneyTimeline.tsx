// JourneyTimeline.tsx — the unified 行程 surface. A user-grouped list of rich
// records (each row can carry photo/video media). Groups are user-defined strings
// — users decide how to organize entries. Exposes the inline digest
// (JourneyTimelineCard) and the bottom-sheet add/edit editor (JourneyEntryEditor):
// tapping a row opens that sheet in edit mode; "+" opens it in add mode.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TextInput, ScrollView, StyleSheet, Pressable, ActivityIndicator, Platform, KeyboardAvoidingView, useWindowDimensions, Dimensions, Modal, Alert, Animated, Keyboard, PanResponder, Easing, LayoutAnimation, UIManager, Share, StatusBar as NativeStatusBar } from 'react-native';
import { Image } from 'expo-image';
import { ReactNativeZoomableView } from '@openspacelabs/react-native-zoomable-view';
import * as ImagePicker from 'expo-image-picker';
import * as VideoThumbnails from 'expo-video-thumbnails';
import * as Sharing from 'expo-sharing';
import { File, Paths } from 'expo-file-system';
import { useVideoPlayer, VideoView } from 'expo-video';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Theme } from '../../theme/theme';
import { Poi } from '../../data/pois';
import { TLRow, TLMedia, TLGroup } from '../../data/timeline';
import { useTimeline } from '../../hooks/useTimeline';
import { useData } from '../../data/DataContext';
import { Icon } from '../Icon';
import { Avatar } from '../Avatar';
import { Press } from '../Press';
import { useNav } from '../../nav/NavContext';
import { useI18n } from '../../i18n';
import { uploadMedia } from '../../lib/storage';
import { createMediaLibraryAsset, requestMediaLibraryPermissions } from '../../lib/mediaLibrary';
import WheelPicker from '@quidone/react-native-wheel-picker';
import * as Haptics from 'expo-haptics';
import { AppCard, motion, radius, space, type } from '../../design-system';
import { JOURNEY_SEGMENT_COLORS, measureTrack } from '../../lib/routeSegments';
import { JourneyRouteBoundarySheet } from './JourneyRouteBoundarySheet';
import { journeyDayDisplayLabel, journeyDayOrdinal, nextJourneyDayKey } from '../../lib/journeyDays';

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
function DayGroupPicker({ theme, data, value, onChange }: {
  theme: Theme;
  data: { value: string; label: string }[];
  value: string;
  onChange: (value: string) => void;
}) {
  const { t } = useI18n();
  const selectedIndex = journeyDayOrdinal(value);
  const selected = data.find((item) => item.value === value)?.value
    ?? data.find((item) => selectedIndex != null && journeyDayOrdinal(item.value) === selectedIndex)?.value
    ?? data[0]?.value;
  if (!selected) return null;

  return (
    <View
      style={{
        marginTop: space.xs,
        borderRadius: 18,
        paddingHorizontal: space.sm,
        paddingTop: 10,
        paddingBottom: 6,
        backgroundColor: theme.dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.035)',
      }}
    >
      <Text style={{ paddingHorizontal: space.xxs, fontSize: 13.5, fontWeight: '700', color: theme.text2 }}>
        {t('journey.timeline.addTo')}
      </Text>
      {data.length === 1 ? (
        <View style={{ height: 44, marginTop: space.xs, borderRadius: radius.control, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.fieldSurface }}>
          <Text style={{ fontSize: 13.5, fontWeight: '700', color: theme.text }}>{data[0].label}</Text>
        </View>
      ) : (
        <View style={{ height: 118, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
          <WheelPicker
            data={data}
            value={selected}
            onValueChanging={() => { Haptics.selectionAsync(); }}
            onValueChanged={({ item }) => onChange(String(item.value))}
            itemHeight={38}
            visibleItemCount={3}
            width={220}
            enableScrollByTapOnItem
            itemTextStyle={{ fontSize: 13.5, fontWeight: '700', color: theme.text }}
            overlayItemStyle={{ backgroundColor: theme.fieldSurface, borderRadius: radius.pill }}
          />
        </View>
      )}
    </View>
  );
}

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

const fmtRange = (s?: number, e?: number) => (s == null ? '' : e == null || e === s ? fmtMins(s) : `${fmtMins(s)}-${fmtMins(e)}`);


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
        copy.uri = await uploadMedia(copy.uri, userId, journeyId);
      }
      if (copy.thumb && !copy.thumb.startsWith('http')) {
        copy.thumb = await uploadMedia(copy.thumb, userId, journeyId);
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
      const ai = journeyDayOrdinal(a[0]);
      const bi = journeyDayOrdinal(b[0]);
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
function DaySection({ theme, label, count, collapsible, collapsed, onToggle, routeSummary, routeColor, routePending, onRoutePress, children }: {
  theme: Theme;
  label: string;
  count: string;
  collapsible?: boolean;
  collapsed?: boolean;
  onToggle?: () => void;
  routeSummary?: string;
  routeColor?: string;
  routePending?: boolean;
  onRoutePress?: () => void;
  children: React.ReactNode;
}) {
  const { t } = useI18n();
  return (
    <View style={{ marginBottom: space.xl }}>
      <Pressable
        onPress={collapsible ? onToggle : undefined}
        hitSlop={8}
        style={{ minHeight: 60, paddingVertical: space.sm, flexDirection: 'row', alignItems: 'center' }}
      >
        <View style={{ flex: 1 }}>
          <Text style={[type.pageTitle, { color: theme.text, fontSize: 23 }]} numberOfLines={1}>{label.toUpperCase()}</Text>
          <Text style={[type.caption, { color: theme.text3, marginTop: space.xxs }]}>{count}</Text>
          {onRoutePress ? (
            <Press
              onPress={onRoutePress}
              style={{ alignSelf: 'flex-start', minHeight: 30, marginTop: space.xs, paddingHorizontal: space.sm, borderRadius: radius.pill, flexDirection: 'row', alignItems: 'center', gap: space.xs, backgroundColor: theme.fieldSurface }}
            >
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: routePending ? 'transparent' : routeColor ?? theme.text3, borderWidth: routePending ? 1.5 : 0, borderColor: routeColor ?? theme.text3 }} />
              <Text style={[type.caption, { color: routeSummary ? theme.text2 : theme.accent, fontWeight: '700' }]}>{routeSummary || t('journey.timeline.routeSetDayEnd')}</Text>
              <Icon name="chevronR" color={routeSummary ? theme.text3 : theme.accent} size={13} />
            </Press>
          ) : null}
        </View>
        {collapsible ? (
          <View style={{ width: 32, height: 32, alignItems: 'center', justifyContent: 'center', transform: [{ rotate: collapsed ? '0deg' : '180deg' }] }}>
            <Icon name="chevronDown" color={theme.text2} size={18} />
          </View>
        ) : null}
      </Pressable>
      {collapsed ? null : children}
    </View>
  );
}

// Inline video player for the fullscreen viewer.
function ViewerVideo({ uri, width, height }: { uri: string; width: number; height: number }) {
  const player = useVideoPlayer(uri, (p) => { p.loop = true; p.play(); });
  return <VideoView player={player} style={{ width, height }} nativeControls />;
}

function ZoomableViewerImage({
  uri,
  width,
  height,
  active,
  dragY,
  onSingleTap,
  onDismiss,
  onZoomChange,
  onDismissGestureChange,
  onLongPress,
  onPressRelease,
}: {
  uri?: string;
  width: number;
  height: number;
  active: boolean;
  dragY: Animated.Value;
  onSingleTap: () => void;
  onDismiss: () => void;
  onZoomChange: (zoomed: boolean) => void;
  onDismissGestureChange: (active: boolean) => void;
  onLongPress?: () => void;
  onPressRelease?: () => void;
}) {
  const zoomRef = useRef<ReactNativeZoomableView>(null);
  const zoomCenterRef = useRef({ x: 0, y: 0 });
  const dismissGestureActive = useRef(false);
  const longPressTriggered = useRef(false);

  const finishDismissGesture = (dy: number, vy: number, zoomLevel: number) => {
    const wasDismissing = dismissGestureActive.current;
    dismissGestureActive.current = false;
    if (!wasDismissing || !active || zoomLevel > 1.01) return;
    if (dy > 110 || (dy > 48 && vy > 1.1)) {
      Animated.timing(dragY, {
        toValue: height,
        duration: 180,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }).start(() => {
        onDismissGestureChange(false);
        onDismiss();
      });
      return;
    }
    Animated.spring(dragY, {
      toValue: 0,
      damping: 22,
      stiffness: 240,
      mass: 0.8,
      useNativeDriver: true,
    }).start(() => onDismissGestureChange(false));
  };

  return (
    <ReactNativeZoomableView
      ref={zoomRef}
      style={{ width, height }}
      initialZoom={1}
      minZoom={1}
      maxZoom={4}
      zoomStep={null as any}
      bindToBorders
      disablePanOnInitialZoom
      doubleTapDelay={280}
      animatePin={false}
      visualTouchFeedbackEnabled={false}
      longPressDuration={360}
      onLongPress={() => {
        longPressTriggered.current = true;
        onLongPress?.();
      }}
      onSingleTap={() => {
        if (longPressTriggered.current) {
          longPressTriggered.current = false;
          return;
        }
        onSingleTap();
      }}
      onDoubleTapBefore={(event, info) => {
        if (info.zoomLevel > 1.05) {
          zoomRef.current?.zoomTo(1, zoomCenterRef.current);
          if (active) onZoomChange(false);
          return;
        }
        const center = {
          x: event.nativeEvent.pageX - info.originalPageX,
          y: event.nativeEvent.pageY - info.originalPageY,
        };
        zoomCenterRef.current = center;
        zoomRef.current?.zoomTo(2, center);
        if (active) onZoomChange(true);
      }}
      onZoomAfter={(_, __, { zoomLevel }) => {
        if (active) onZoomChange(zoomLevel > 1.05);
      }}
      onPanResponderMove={(_, gestureState, { zoomLevel }) => {
        if (longPressTriggered.current) return true;
        if (!active || zoomLevel > 1.01 || gestureState.numberActiveTouches !== 1) return false;
        const isDownwardDismiss = gestureState.dy > 0 && Math.abs(gestureState.dy) > Math.abs(gestureState.dx) * 1.15;
        if (!isDownwardDismiss) return false;
        if (!dismissGestureActive.current) {
          dismissGestureActive.current = true;
          onDismissGestureChange(true);
        }
        dragY.setValue(gestureState.dy);
        return true;
      }}
      onPanResponderEnd={(_, gestureState, { zoomLevel }) => {
        finishDismissGesture(gestureState.dy, gestureState.vy, zoomLevel);
        onPressRelease?.();
      }}
      onShouldBlockNativeResponder={(_, gestureState, { zoomLevel }) =>
        zoomLevel > 1.05
        || gestureState.numberActiveTouches >= 2
        || dismissGestureActive.current
        || (gestureState.dy > 6 && Math.abs(gestureState.dy) > Math.abs(gestureState.dx) * 1.05)
      }
      onPanResponderTerminationRequest={(_, gestureState, { zoomLevel }) =>
        !dismissGestureActive.current && zoomLevel <= 1.05 && gestureState.numberActiveTouches < 2
      }
    >
      {uri ? (
        <Image source={{ uri }} contentFit="contain" transition={200} style={{ width, height }} />
      ) : (
        <View style={{ width, height, backgroundColor: 'rgba(255,255,255,0.06)' }} />
      )}
    </ReactNativeZoomableView>
  );
}

function formatMediaPostedAt(value: string, locale: 'zh' | 'en'): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(locale === 'zh' ? 'zh-CN' : 'en-US', {
    year: 'numeric',
    month: locale === 'zh' ? 'numeric' : 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

// Fullscreen media viewer — swipe to page, video plays inline. Rendered through a
// Modal so it covers the whole screen even when launched from a nested card.
export function MediaViewer({
  theme,
  media,
  index,
  onClose,
  onDelete,
  showTypeBadge = true,
}: {
  theme: Theme;
  media: TLMedia[];
  index: number;
  onClose: () => void;
  onDelete?: (index: number) => void;
  showTypeBadge?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const { t, resolved } = useI18n();
  const { width, height } = useWindowDimensions();
  const scrollRef = useRef<ScrollView>(null);
  const [i, setI] = useState(index || 0);
  const [backdropIndex, setBackdropIndex] = useState(index || 0);
  const backdropIndexRef = useRef(index || 0);
  const m = media[i] || media[0];
  const backdropMedia = media[backdropIndex] || m;
  const backdropUri = backdropMedia?.video ? backdropMedia.thumb : backdropMedia?.uri;
  const liveVideoUri = m?.livePhoto ? m.pairedVideoUri ?? null : null;
  const livePlayer = useVideoPlayer(liveVideoUri, (player) => { player.loop = false; });
  const livePressActive = useRef(false);
  const [livePlaying, setLivePlaying] = useState(false);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const chromeAnim = useRef(new Animated.Value(1)).current;
  const dragY = useRef(new Animated.Value(0)).current;
  const [chromeVisible, setChromeVisible] = useState(true);
  const [imageZoomed, setImageZoomed] = useState(false);
  const [multiTouch, setMultiTouch] = useState(false);
  const [verticalDismissing, setVerticalDismissing] = useState(false);
  const multiTouchRef = useRef(false);
  const [activeAction, setActiveAction] = useState<'save' | 'share' | null>(null);
  const [actionNotice, setActionNotice] = useState<{ text: string; danger?: boolean } | null>(null);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    Animated.timing(fadeAnim, { toValue: 1, duration: 250, useNativeDriver: true }).start();
  }, [fadeAnim]);

  useEffect(() => {
    const entry = NativeStatusBar.pushStackEntry({
      animated: true,
      hidden: !chromeVisible,
      barStyle: 'light-content',
      showHideTransition: 'slide',
    });
    return () => NativeStatusBar.popStackEntry(entry);
  }, [chromeVisible]);

  useEffect(() => {
    backdropIndexRef.current = index;
    setBackdropIndex(index);
    if (index > 0) setTimeout(() => scrollRef.current?.scrollTo({ x: index * width, animated: false }), 10);
  }, [index, width]);

  useEffect(() => {
    livePressActive.current = false;
    setLivePlaying(false);
    try { livePlayer?.pause(); } catch {}
  }, [i, livePlayer]);

  useEffect(() => () => {
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    try { livePlayer?.pause(); } catch {}
  }, [livePlayer]);

  const showActionNotice = (text: string, danger = false) => {
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    setActionNotice({ text, danger });
    noticeTimer.current = setTimeout(() => setActionNotice(null), 1800);
  };

  const localMediaUri = async (uri: string) => {
    if (!/^https?:\/\//i.test(uri)) return uri;
    const downloaded = await File.downloadFileAsync(uri, Paths.cache);
    return downloaded.uri;
  };

  const saveCurrent = async () => {
    if (!m?.uri || activeAction) return;
    setActiveAction('save');
    try {
      const { status } = await requestMediaLibraryPermissions(true);
      if (status !== 'granted') {
        showActionNotice(t('journey.photoWall.needLibraryPerm'), true);
        return;
      }
      await createMediaLibraryAsset(await localMediaUri(m.uri));
      showActionNotice(t('journey.photoWall.savedToAlbum'));
    } catch (error) {
      console.warn('[MediaViewer] save failed:', error);
      showActionNotice(t('journey.savePicker.saveFailed'), true);
    } finally {
      setActiveAction(null);
    }
  };

  const shareCurrent = async () => {
    if (!m?.uri || activeAction) return;
    setActiveAction('share');
    try {
      const uri = await localMediaUri(m.uri);
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: m.video ? 'video/mp4' : 'image/jpeg' });
      } else {
        await Share.share({ url: uri });
      }
    } catch (error: any) {
      if (error?.message !== 'User did not share') {
        console.warn('[MediaViewer] share failed:', error);
        showActionNotice(t('journey.photoWall.errorTitle'), true);
      }
    } finally {
      setActiveAction(null);
    }
  };

  const startLivePlayback = () => {
    if (!m?.livePhoto || !m.pairedVideoUri || !livePlayer) return;
    livePressActive.current = true;
    try {
      livePlayer.currentTime = 0;
      livePlayer.play();
      setLivePlaying(true);
    } catch (error) {
      console.warn('[MediaViewer] live photo playback failed:', error);
      livePressActive.current = false;
      setLivePlaying(false);
    }
  };

  const stopLivePlayback = () => {
    if (!livePressActive.current && !livePlaying) return;
    livePressActive.current = false;
    try {
      livePlayer?.pause();
      if (livePlayer) livePlayer.currentTime = 0;
    } catch {}
    setLivePlaying(false);
  };

  const setChrome = (visible: boolean) => {
    setChromeVisible(visible);
    Animated.timing(chromeAnim, {
      toValue: visible ? 1 : 0,
      duration: 180,
      useNativeDriver: true,
    }).start();
  };

  const toggleChrome = () => setChrome(!chromeVisible);
  const viewerOpacity = Animated.multiply(
    fadeAnim,
    dragY.interpolate({
      inputRange: [0, 72, height * 0.42],
      outputRange: [1, 0.58, 0],
      extrapolate: 'clamp',
    }),
  );
  const dragChromeOpacity = Animated.multiply(
    chromeAnim,
    dragY.interpolate({
      inputRange: [0, 96],
      outputRange: [1, 0],
      extrapolate: 'clamp',
    }),
  );

  const syncMultiTouch = (event: { nativeEvent: { touches?: unknown[] } }) => {
    const nextMultiTouch = (event.nativeEvent.touches?.length ?? 0) >= 2;
    if (nextMultiTouch === multiTouchRef.current) return;
    multiTouchRef.current = nextMultiTouch;
    setMultiTouch(nextMultiTouch);
  };

  const renderItem = (mm: TLMedia, idx: number) => {
    const isNear = Math.abs(idx - i) <= 1;
    if (!isNear) return <View key={idx} style={{ width }} />;
    const isActive = idx === i;
    if (mm.video && mm.uri && isActive) {
      return (
        <View key={idx} style={{ width, height, alignItems: 'center', justifyContent: 'center' }}>
          <ViewerVideo uri={mm.uri} width={width} height={height} />
        </View>
      );
    }
    const displayUri = mm.video ? mm.thumb : mm.uri;
    return (
      <View key={idx} style={{ width, height, alignItems: 'center', justifyContent: 'center' }}>
        <ZoomableViewerImage
          uri={displayUri}
          width={width}
          height={height}
          active={isActive}
          dragY={dragY}
          onSingleTap={toggleChrome}
          onDismiss={onClose}
          onZoomChange={setImageZoomed}
          onDismissGestureChange={setVerticalDismissing}
          onLongPress={isActive && mm.livePhoto ? startLivePlayback : undefined}
          onPressRelease={isActive && mm.livePhoto ? stopLivePlayback : undefined}
        />
        {isActive && mm.livePhoto && livePlaying && liveVideoUri ? (
          <View pointerEvents="none" style={StyleSheet.absoluteFill}>
            <VideoView
              player={livePlayer}
              nativeControls={false}
              contentFit="contain"
              style={{ width, height }}
            />
          </View>
        ) : null}
      </View>
    );
  };

  return (
    <Modal visible transparent animationType="none" statusBarTranslucent onRequestClose={onClose}>
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: '#111113', opacity: viewerOpacity }]}>
        {backdropUri ? (
          <Image
            source={{ uri: backdropUri }}
            contentFit="cover"
            blurRadius={42}
            transition={100}
            style={[StyleSheet.absoluteFill, { transform: [{ scale: 1.16 }], opacity: 0.72 }]}
          />
        ) : null}
        <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(10,10,12,0.5)' }]} />
      </Animated.View>
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: fadeAnim, transform: [{ translateY: dragY }] }]}>
        <Animated.View
          pointerEvents={chromeVisible ? 'box-none' : 'none'}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            zIndex: 2,
            paddingTop: insets.top + space.xs,
            paddingHorizontal: space.md,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            opacity: dragChromeOpacity,
          }}
        >
          <LinearGradient
            pointerEvents="none"
            colors={['rgba(0,0,0,0.48)', 'transparent']}
            style={[StyleSheet.absoluteFill, { bottom: -52 }]}
          />
          <Press
            onPress={onClose}
            hitSlop={10}
            style={{
              width: 44,
              height: 44,
              borderRadius: 22,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: 'rgba(22,22,24,0.46)',
            }}
          >
            <Icon name="close" color="#FFFFFF" size={21} strokeWidth={2} />
          </Press>
          <View pointerEvents="none" style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            {showTypeBadge ? (
              <View
                style={{
                  minWidth: 76,
                  height: 36,
                  paddingHorizontal: space.sm,
                  borderRadius: radius.pill,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: space.xxs,
                  backgroundColor: 'rgba(22,22,24,0.42)',
                }}
              >
                {m.livePhoto && !livePlaying ? <Icon name="livePhoto" color="#FFFFFF" size={15} strokeWidth={1.6} /> : null}
                <Text style={{ color: 'rgba(255,255,255,0.92)', fontSize: 12, fontWeight: '700' }}>
                  {media.length > 1 ? `${i + 1} / ${media.length}` : m.video ? t('journey.media.video') : t('journey.media.photo')}
                </Text>
              </View>
            ) : null}
          </View>
          {onDelete ? (
            <Press
              onPress={() => onDelete(i)}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel={t('common.delete')}
              style={{
                width: 44,
                height: 44,
                borderRadius: 22,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: 'rgba(22,22,24,0.46)',
              }}
            >
              <Icon name="trash" color="#FFFFFF" size={21} strokeWidth={2} />
            </Press>
          ) : (
            <View style={{ width: 44, height: 44 }} />
          )}
        </Animated.View>
        <ScrollView
          ref={scrollRef}
          horizontal
          pagingEnabled
          directionalLockEnabled
          scrollEnabled={!imageZoomed && !multiTouch && !verticalDismissing}
          onTouchStart={syncMultiTouch}
          onTouchMove={syncMultiTouch}
          onTouchEnd={syncMultiTouch}
          onTouchCancel={syncMultiTouch}
          showsHorizontalScrollIndicator={false}
          scrollEventThrottle={16}
          onScroll={(e) => {
            const x = e.nativeEvent.contentOffset.x;
            let next = backdropIndexRef.current;
            const threshold = width * 0.28;
            while (next < media.length - 1 && x > next * width + threshold) next += 1;
            while (next > 0 && x < next * width - threshold) next -= 1;
            if (next !== backdropIndexRef.current) {
              backdropIndexRef.current = next;
              setBackdropIndex(next);
            }
          }}
          onMomentumScrollEnd={(e) => {
            const page = Math.round(e.nativeEvent.contentOffset.x / width);
            setI(page);
            backdropIndexRef.current = page;
            setBackdropIndex(page);
            setImageZoomed(false);
            multiTouchRef.current = false;
            setMultiTouch(false);
            setVerticalDismissing(false);
            dragY.setValue(0);
          }}
          style={{ flex: 1 }}
          contentContainerStyle={{ alignItems: 'center' }}
        >
          {media.map(renderItem)}
        </ScrollView>
        {m?.uri ? (
          <Animated.View
            pointerEvents={chromeVisible ? 'box-none' : 'none'}
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              bottom: 0,
              zIndex: 2,
              paddingHorizontal: space.lg,
              paddingTop: 96,
              paddingBottom: Math.max(insets.bottom, space.lg),
              opacity: dragChromeOpacity,
            }}
          >
            <LinearGradient
              pointerEvents="none"
              colors={['transparent', 'rgba(0,0,0,0.74)']}
              locations={[0, 0.7]}
              style={StyleSheet.absoluteFill}
            />
            {m.caption ? (
              <Text style={{ color: '#FFFFFF', fontSize: 16, fontWeight: '500', lineHeight: 23, marginBottom: space.md, textShadowColor: 'rgba(0,0,0,0.5)', textShadowRadius: 6 }}>
                {m.caption}
              </Text>
            ) : null}
            {actionNotice ? (
              <View
                style={{
                  alignSelf: 'flex-end',
                  marginBottom: space.md,
                  paddingHorizontal: space.md,
                  paddingVertical: space.xs,
                  borderRadius: radius.pill,
                  backgroundColor: actionNotice.danger ? 'rgba(255,90,122,0.92)' : 'rgba(44,44,46,0.94)',
                }}
              >
                <Text style={{ color: '#FFFFFF', fontSize: 12.5, fontWeight: '600' }}>{actionNotice.text}</Text>
              </View>
            ) : null}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm }}>
              {m.author ? (
                <View style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
                  <Avatar uri={m.author.avatarUrl} size={38} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text numberOfLines={1} style={[type.cardTitle, { color: '#FFFFFF', textShadowColor: 'rgba(0,0,0,0.45)', textShadowRadius: 5 }]}>
                      {m.author.name}
                    </Text>
                    <Text numberOfLines={1} style={[type.caption, { color: 'rgba(255,255,255,0.7)', marginTop: 2 }]}>
                      {m.createdAt
                        ? t('journey.photoWall.postedAt', { time: formatMediaPostedAt(m.createdAt, resolved) })
                        : t('journey.photoWall.postedAtUnknown')}
                    </Text>
                  </View>
                </View>
              ) : m.createdAt ? (
                <Text numberOfLines={1} style={[type.caption, { flex: 1, color: 'rgba(255,255,255,0.7)' }]}>
                  {t('journey.photoWall.postedAt', { time: formatMediaPostedAt(m.createdAt, resolved) })}
                </Text>
              ) : (
                <View style={{ flex: 1 }} />
              )}
              <View style={{ flexShrink: 0, flexDirection: 'row', alignItems: 'center', gap: space.xs }}>
                <Pressable
                  onPress={shareCurrent}
                  disabled={activeAction != null}
                  accessibilityRole="button"
                  accessibilityLabel={t('common.share')}
                  style={({ pressed }) => ({
                    width: 44,
                    height: 44,
                    borderRadius: 22,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: pressed ? 'rgba(255,255,255,0.26)' : 'rgba(22,22,24,0.48)',
                    opacity: activeAction && activeAction !== 'share' ? 0.45 : 1,
                  })}
                >
                  {activeAction === 'share' ? <ActivityIndicator color="#FFFFFF" size="small" /> : <Icon name="share" color="#FFFFFF" size={21} strokeWidth={2} />}
                </Pressable>
                <Pressable
                  onPress={saveCurrent}
                  disabled={activeAction != null}
                  accessibilityRole="button"
                  accessibilityLabel={t('journey.photoWall.saveToAlbum')}
                  style={({ pressed }) => ({
                    width: 44,
                    height: 44,
                    borderRadius: 22,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: pressed ? 'rgba(255,255,255,0.26)' : 'rgba(22,22,24,0.48)',
                    opacity: activeAction && activeAction !== 'save' ? 0.45 : 1,
                  })}
                >
                  {activeAction === 'save' ? <ActivityIndicator color="#FFFFFF" size="small" /> : <Icon name="download" color="#FFFFFF" size={21} strokeWidth={2} />}
                </Pressable>
              </View>
            </View>
          </Animated.View>
        ) : null}
      </Animated.View>
    </Modal>
  );
}

// ── One itinerary entry — full text + inline tappable photos (no done state) ──
function ItineraryItem({ theme, row, onPress, onOpenMedia, selectionMode, selected, onToggleSelected, dayLayout }: {
  theme: Theme;
  row: TLRow;
  onPress?: () => void;
  onOpenMedia?: (media: TLMedia[], index: number, row: TLRow) => void;
  selectionMode?: boolean;
  selected?: boolean;
  onToggleSelected?: () => void;
  dayLayout?: boolean;
}) {
  const media = row.media || [];
  const selectionProgress = useRef(new Animated.Value(selected ? 1 : 0)).current;

  useEffect(() => {
    selectionProgress.stopAnimation();
    Animated.timing(selectionProgress, {
      toValue: selected ? 1 : 0,
      duration: motion.quick,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [selected, selectionProgress]);

  const toggleSelection = () => {
    if (!onToggleSelected) return;
    selectionProgress.stopAnimation();
    Animated.timing(selectionProgress, {
      toValue: selected ? 0 : 1,
      duration: 110,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
    requestAnimationFrame(() => React.startTransition(onToggleSelected));
  };

  const content = dayLayout ? (
    <View style={{ flex: 1, minWidth: 0 }}>
      {row.timeStart != null ? <Text style={[type.eyebrow, { color: theme.text2 }]}>{fmtRange(row.timeStart, row.timeEnd ?? undefined)}</Text> : null}
      <Text style={[type.cardTitle, { color: theme.text, marginTop: row.timeStart != null ? space.xxs : 0, lineHeight: 21 }]}>{row.title}</Text>
      {media.length > 0 ? (
        <ScrollView pointerEvents={selectionMode ? 'none' : 'auto'} horizontal scrollEnabled={!selectionMode} showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.xs, paddingTop: space.sm }}>
          {media.map((item, index) => {
            const uri = item.video ? item.thumb : item.uri;
            return (
              <Pressable
                key={index}
                onPress={onOpenMedia ? () => onOpenMedia(media, index, row) : undefined}
                style={{ width: 72, height: 60, borderRadius: radius.control, overflow: 'hidden', backgroundColor: theme.surfaceTop }}
              >
                {uri ? <Image source={{ uri }} contentFit="cover" style={StyleSheet.absoluteFill} /> : null}
              </Pressable>
            );
          })}
        </ScrollView>
      ) : null}
    </View>
  ) : (
    <View style={{ flex: 1, minWidth: 0 }}>
      {row.timeStart != null ? <Text style={[type.eyebrow, { color: theme.text2 }]}>{fmtRange(row.timeStart, row.timeEnd ?? undefined)}</Text> : null}
      <Text style={[type.cardTitle, { color: theme.text, marginTop: row.timeStart != null ? space.xxs : 0, lineHeight: 21 }]}>{row.title}</Text>
      {media.length > 0 ? (
        <ScrollView pointerEvents={selectionMode ? 'none' : 'auto'} horizontal scrollEnabled={!selectionMode} showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.xs, paddingTop: space.sm }}>
          {media.map((item, index) => {
            const uri = item.video ? item.thumb : item.uri;
            return (
              <Pressable
                key={index}
                onPress={onOpenMedia ? () => onOpenMedia(media, index, row) : undefined}
                style={{ width: 64, height: 52, borderRadius: radius.control, overflow: 'hidden', backgroundColor: theme.fieldSurface }}
              >
                {uri ? <Image source={{ uri }} contentFit="cover" style={StyleSheet.absoluteFill} /> : null}
              </Pressable>
            );
          })}
        </ScrollView>
      ) : null}
    </View>
  );

  return (
    <Pressable
      onPress={selectionMode ? toggleSelection : onPress}
      hitSlop={selectionMode ? 6 : undefined}
      accessibilityRole={selectionMode ? 'checkbox' : 'button'}
      accessibilityState={selectionMode ? { checked: selected } : undefined}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: dayLayout ? 'flex-start' : 'center',
        gap: space.md,
        paddingVertical: dayLayout ? 0 : space.sm,
        opacity: pressed ? 0.72 : 1,
      })}
    >
      {selectionMode ? (
        <View
          style={{
            width: 24,
            height: 24,
            marginTop: dayLayout ? 1 : 0,
            borderRadius: 12,
            alignItems: 'center',
            justifyContent: 'center',
            borderWidth: 2,
            borderColor: theme.fieldBorder,
            overflow: 'hidden',
          }}
        >
          <Animated.View
            style={{
              position: 'absolute',
              top: 0,
              right: 0,
              bottom: 0,
              left: 0,
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 12,
              backgroundColor: theme.text,
              opacity: selectionProgress,
              transform: [{ scale: selectionProgress.interpolate({ inputRange: [0, 1], outputRange: [0.72, 1] }) }],
            }}
          >
            <Icon name="check" color={theme.featureSurface} size={13} strokeWidth={2.5} />
          </Animated.View>
        </View>
      ) : null}
      {content}
      {!dayLayout && !selectionMode && onPress ? <Icon name="chevronR" color={theme.text3} size={15} /> : null}
    </Pressable>
  );
}

export function JourneyTimelineCard({ theme, info, readOnly, selectedDay, showDayTabs = true, availableDays, selectionMode = false, selectedItemIds, onSelectedItemIdsChange, onGroupLayout, onRouteBoundaryRequest }: { theme: Theme; info: Poi; readOnly?: boolean; selectedDay?: string; showDayTabs?: boolean; availableDays?: string[]; selectionMode?: boolean; selectedItemIds?: Set<string>; onSelectedItemIdsChange?: (ids: Set<string>) => void; onGroupLayout?: (day: string, y: number) => void; onRouteBoundaryRequest?: (groupKey: string) => void }) {
  const nav = useNav();
  const { t, resolved } = useI18n();
  const { userId } = useData();
  const tl = useTimeline(info.id, userId);
  const [activeDay, setActiveDay] = useState<string>(ALL_DAYS);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [viewer, setViewer] = useState<{ rowId: string; media: TLMedia[]; index: number } | null>(null);
  const [chipsEditing, setChipsEditing] = useState(false);
  const [dismissChipsSignal, setDismissChipsSignal] = useState(0);
  const [routeGroupKey, setRouteGroupKey] = useState<string | null>(null);
  const trackMeasure = useMemo(() => measureTrack(info.trackCoords), [info.trackCoords]);
  const selectedIds = selectedItemIds ?? new Set<string>();
  const toggleSelectedItem = (id: string) => {
    if (!onSelectedItemIdsChange) return;
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onSelectedItemIdsChange(next);
  };

  const defaultDayCount = Math.max(1, info.totalDays || Number.parseInt(info.days || '', 10) || 1);
  // When the parent owns the day tabs, preserve its exact group key. The
  // displayed label may be localized (for example `第一天`) while persisted
  // timeline groups still use `Day 1`; regenerating keys here would make the
  // selected-day filter miss every group and render a blank panel.
  const defaultDays = info.kind === 'journey'
    ? selectedDay
      ? (availableDays?.length ? availableDays : [selectedDay])
      : Array.from({ length: defaultDayCount }, (_, index) => `Day ${index + 1}`)
    : [];
  const groups = groupRows(tl.rows, [...new Set([...defaultDays, ...tl.knownGroups])]);
  const dayLabel = (g: TLGroup) => g.label.trim() ? journeyDayDisplayLabel(g.label, resolved) : t('journey.timeline.ungrouped');
  const currentDay = selectedDay || activeDay;
  const nextDayName = () => nextJourneyDayKey(groups.map((group) => group.key));
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
  const openJourneyAgent = () => nav.openAssistant(undefined, info.id);

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
            if (currentDay === g.key) setActiveDay(ALL_DAYS);
          },
        },
      ],
    );
  };

  if (tl.rows.length === 0 && groups.length === 0) {
    return (
      <View style={{ paddingBottom: 18 }}>
        {readOnly ? null : (
          <View style={{ alignItems: 'center', paddingVertical: 24, paddingHorizontal: 14, borderRadius: 16, backgroundColor: theme.dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.03)', borderWidth: StyleSheet.hairlineWidth, borderColor: theme.hairline }}>
            <Icon name="calendar" color={theme.text3} size={24} />
            <Text style={{ fontSize: 13, color: theme.text3, marginTop: 8 }}>{t('journey.empty.timeline')}</Text>
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 14 }}>
              <Press
                onPress={() => nav.openTimelineAdd(info, '', availableDays)}
                style={{ height: 34, paddingHorizontal: 14, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.accent }}
              >
                <Text style={{ fontSize: 12.5, fontWeight: '700', color: '#fff' }}>{t('journey.timeline.addManually')}</Text>
              </Press>
              <Press
                onPress={openJourneyAgent}
                style={{ height: 34, paddingHorizontal: 14, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.dark ? 'rgba(255,255,255,0.09)' : 'rgba(0,0,0,0.06)', borderWidth: StyleSheet.hairlineWidth, borderColor: theme.hairline }}
              >
                <Text style={{ fontSize: 12.5, fontWeight: '700', color: theme.text2 }}>{t('journey.timeline.smartPlan')}</Text>
              </Press>
            </View>
          </View>
        )}
      </View>
    );
  }

  const chips = [{ key: ALL_DAYS, label: t('journey.tab.overview') }, ...groups.map((g) => ({ key: g.key, label: dayLabel(g) }))];
  const shownGroups = selectedDay ? groups : currentDay === ALL_DAYS ? groups : groups.filter((g) => g.key === currentDay);
  const sortedRows = (g: TLGroup) => [...g.rows]
    .map((r, i) => ({ r, i }))
    .sort((a, b) => {
      const ta = a.r.timeStart ?? Infinity, tb = b.r.timeStart ?? Infinity;
      return ta === tb ? a.i - b.i : ta - tb;
    })
    .map((x) => x.r);

  const routePendingFor = (groupKey: string) => {
    const index = groups.findIndex((group) => group.key === groupKey);
    return index > 0 && !!tl.groupRoutes[groupKey] && !tl.groupRoutes[groups[index - 1].key];
  };
  const routeSummaryFor = (groupKey: string) => {
    const route = tl.groupRoutes[groupKey];
    if (!route) return undefined;
    const index = groups.findIndex((group) => group.key === groupKey);
    const previousRoute = index > 0 ? tl.groupRoutes[groups[index - 1].key] : undefined;
    const cumulative = t('journey.timeline.routeCumulative', { distance: `${(route.endDistanceMeters / 1000).toFixed(1)} km` });
    if (index > 0 && !previousRoute) {
      return `${cumulative}  ${t('journey.timeline.routeWaitingFor', { day: dayLabel(groups[index - 1]) })}`;
    }
    const previousMeters = previousRoute?.endDistanceMeters ?? 0;
    return `${t('journey.timeline.routeDayDistance', { distance: `${((route.endDistanceMeters - previousMeters) / 1000).toFixed(1)} km` })}  ${cumulative}`;
  };
  const openRouteBoundary = (groupKey: string) => {
    if (!trackMeasure || readOnly) return;
    if (onRouteBoundaryRequest) onRouteBoundaryRequest(groupKey);
    else setRouteGroupKey(groupKey);
  };

  // a day's entries as a grouped, hairline-separated card + (editable) an add row
  const renderItems = (g: TLGroup) => {
    // within a day, sort by time-of-day (timed first, ascending); untimed keep order
    const rows = sortedRows(g);
    return (
      <View
        style={{
          borderRadius: 0,
          overflow: 'visible',
          backgroundColor: 'transparent',
        }}
      >
        {rows.map((r, i) => (
          <View key={r.id} style={{ paddingHorizontal: 0, marginTop: i === 0 ? 0 : space.md }}>
            <View style={{ paddingHorizontal: 0 }}>
              <ItineraryItem
                theme={theme}
                row={r}
                onPress={readOnly ? undefined : () => nav.openTimelineEdit(info, r, availableDays)}
                onOpenMedia={(media, index, row) => setViewer({ rowId: row.id, media, index })}
              />
            </View>
          </View>
        ))}
        {readOnly ? null : (
          <>
            <View style={{ height: space.sm }} />
            <Press
              onPress={() => nav.openTimelineAdd(info, g.key, availableDays)}
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

  const renderSelectedDay = (g: TLGroup) => {
    const rows = sortedRows(g);
    return (
      <View key={g.key} onLayout={(event) => onGroupLayout?.(g.key, event.nativeEvent.layout.y)} style={{ paddingBottom: space.xl }}>
        <View style={{ minHeight: 30, marginBottom: space.md, flexDirection: 'row', alignItems: 'center' }}>
          <View style={{ flex: 1, minWidth: 0, justifyContent: 'center' }}>
            <Text numberOfLines={1} style={[type.sectionTitle, { color: theme.text, lineHeight: 24 }]}>
              {dayLabel(g)}
            </Text>
          </View>
          {!readOnly && trackMeasure ? (
            <Press
              onPress={() => openRouteBoundary(g.key)}
              style={{ height: 30, marginRight: space.xs, paddingHorizontal: space.sm, borderRadius: radius.pill, flexDirection: 'row', alignItems: 'center', gap: space.xs, backgroundColor: theme.fieldSurface }}
            >
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: routePendingFor(g.key) ? 'transparent' : JOURNEY_SEGMENT_COLORS[Math.max(0, groups.findIndex((group) => group.key === g.key)) % JOURNEY_SEGMENT_COLORS.length], borderWidth: routePendingFor(g.key) ? 1.5 : 0, borderColor: JOURNEY_SEGMENT_COLORS[Math.max(0, groups.findIndex((group) => group.key === g.key)) % JOURNEY_SEGMENT_COLORS.length] }} />
              <Text numberOfLines={1} style={[type.caption, { maxWidth: 180, color: tl.groupRoutes[g.key] ? theme.text2 : theme.accent, fontWeight: '700' }]}>{routeSummaryFor(g.key) || t('journey.timeline.routeSetEnd')}</Text>
            </Press>
          ) : null}
          <View
            style={{
              minWidth: 52,
              height: 30,
              paddingHorizontal: space.sm,
              borderRadius: radius.pill,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: theme.fieldSurface,
            }}
          >
            <Text style={[type.caption, { color: theme.text2, fontWeight: '700' }]}>
              {t('journey.timeline.itemCount', { count: rows.length })}
            </Text>
          </View>
        </View>

        {rows.length ? (
          <View style={{ gap: space.md }}>
            {rows.map((row) => (
              <AppCard
                key={row.id}
                theme={theme}
                radius={radius.feature}
                style={{
                  padding: space.md,
                  overflow: 'hidden',
                  backgroundColor: theme.fieldSurface,
                }}
              >
                <ItineraryItem
                  theme={theme}
                  row={row}
                  onPress={readOnly ? undefined : () => nav.openTimelineEdit(info, row, availableDays)}
                  onOpenMedia={selectionMode ? undefined : (media, mediaIndex, item) => setViewer({ rowId: item.id, media, index: mediaIndex })}
                  selectionMode={selectionMode}
                  selected={selectedIds.has(row.id)}
                  onToggleSelected={() => toggleSelectedItem(row.id)}
                  dayLayout
                />
              </AppCard>
            ))}
          </View>
        ) : (
          <View style={{ alignItems: 'center', paddingVertical: space.xxl }}>
            <Text style={[type.body, { color: theme.text3 }]}>{t('journey.timeline.emptyTitle')}</Text>
          </View>
        )}
      </View>
    );
  };

  return (
    <View style={{ paddingBottom: space.lg, position: 'relative' }}>
      {chipsEditing ? (
        <Pressable
          onPress={() => setDismissChipsSignal((v) => v + 1)}
          style={[StyleSheet.absoluteFill, { zIndex: 1 }]}
        />
      ) : null}
      {showDayTabs ? <View style={{ marginBottom: 14, zIndex: 2 }}>
        <DayChips
          theme={theme}
          items={chips}
          active={currentDay}
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
            if (currentDay === key) setActiveDay(label);
          }}
        />
      </View> : null}
      {readOnly || !showDayTabs ? null : (
        <View style={{ marginBottom: 16, flexDirection: 'row', gap: 10, alignItems: 'center' }}>
          <Press
            onPress={openJourneyAgent}
            style={{ flex: 1, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.accentSofter, borderWidth: StyleSheet.hairlineWidth, borderColor: theme.accentSoft }}
          >
            <Text style={{ fontSize: 14, fontWeight: '700', color: theme.accent }}>{t('journey.timeline.smartPlanFull')}</Text>
          </Press>
        </View>
      )}
      {selectedDay
        ? shownGroups.map(renderSelectedDay)
        : shownGroups.map((g) => (
            <DaySection
              key={g.key}
              theme={theme}
              label={dayLabel(g)}
              count={t('journey.timeline.itemCount', { count: g.rows.length })}
              collapsible={currentDay === ALL_DAYS}
              collapsed={currentDay === ALL_DAYS && collapsed.has(g.key)}
              onToggle={() => toggleCollapse(g.key)}
              routeSummary={routeSummaryFor(g.key)}
              routeColor={JOURNEY_SEGMENT_COLORS[Math.max(0, groups.findIndex((group) => group.key === g.key)) % JOURNEY_SEGMENT_COLORS.length]}
              routePending={routePendingFor(g.key)}
              onRoutePress={!readOnly && trackMeasure ? () => openRouteBoundary(g.key) : undefined}
            >
              {renderItems(g)}
            </DaySection>
          ))}
      {routeGroupKey && trackMeasure ? (() => {
        const index = groups.findIndex((group) => group.key === routeGroupKey);
        let previousMeters = 0;
        for (let previousIndex = index - 1; previousIndex >= 0; previousIndex -= 1) {
          const route = tl.groupRoutes[groups[previousIndex].key];
          if (route) { previousMeters = route.endDistanceMeters; break; }
        }
        let nextMeters: number | undefined;
        for (let nextIndex = index + 1; nextIndex < groups.length; nextIndex += 1) {
          const route = tl.groupRoutes[groups[nextIndex].key];
          if (route) { nextMeters = route.endDistanceMeters; break; }
        }
        return (
          <JourneyRouteBoundarySheet
            theme={theme}
            info={info}
            groupLabel={index >= 0 ? dayLabel(groups[index]) : routeGroupKey}
            minimumMeters={previousMeters}
            maximumMeters={nextMeters}
            current={tl.groupRoutes[routeGroupKey]}
            onClose={() => setRouteGroupKey(null)}
            onSave={(route) => tl.setGroupRoute(routeGroupKey, route)}
          />
        );
      })() : null}
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
  onSubmit: (it: Omit<TLRow, 'id'>) => void | Promise<void>;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { t, resolved } = useI18n();
  const initDay = editRow ? (editRow.day || defaultDay) : initialDay?.trim() || defaultDay;
  const [text, setText] = useState(editRow?.title ?? '');
  const [media, setMedia] = useState<TLMedia[]>(editRow?.media ?? []);
  const [day, setDay] = useState(initDay);
  const [dayOpen, setDayOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const dayChoiceMap = new Map<string, string>();
  const availableGroups = existingDays.length ? existingDays : [day.trim() || defaultDay];
  availableGroups.map((value) => value.trim()).filter(Boolean).forEach((value) => {
    const index = journeyDayOrdinal(value);
    const identity = index ? `day:${index}` : `group:${value}`;
    if (!dayChoiceMap.has(identity)) dayChoiceMap.set(identity, value);
  });
  const dayChoices = [...dayChoiceMap.values()].map((value) => ({ value, label: journeyDayDisplayLabel(value, resolved) }));
  const [startMins, setStartMins] = useState<number | null>(editRow?.timeStart ?? null);
  const [endMins, setEndMins] = useState<number | null>(editRow?.timeEnd ?? null);
  const [showTime, setShowTime] = useState(false);
  const [keyboardH, setKeyboardH] = useState(0);
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const compactToolbar = windowWidth < 420;
  const titleInputRef = useRef<TextInput>(null);
  const mediaPickerOpenRef = useRef(false);

  const slide = useRef(new Animated.Value(600)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.parallel([
      Animated.timing(slide, { toValue: 0, duration: motion.quick, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(backdropOpacity, { toValue: 1, duration: motion.quick, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start();
    const focusTimer = setTimeout(() => titleInputRef.current?.focus(), 90);
    return () => {
      clearTimeout(focusTimer);
      slide.stopAnimation();
      backdropOpacity.stopAnimation();
    };
  }, [backdropOpacity, slide]);
  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSub = Keyboard.addListener(showEvent, (e) => {
      setKeyboardH(Math.max(0, e.endCoordinates.height));
    });
    const hideSub = Keyboard.addListener(hideEvent, () => {
      // Opening the system media picker temporarily hides the IME. Keep the
      // previous inset until focus is restored, otherwise the card drops behind
      // the keyboard when the picker closes.
      if (!mediaPickerOpenRef.current) setKeyboardH(0);
    });
    return () => { showSub.remove(); hideSub.remove(); };
  }, [insets.bottom]);
  const closeRef = useRef(onClose);
  const closingRef = useRef(false);
  const screenHeightRef = useRef(Dimensions.get('screen').height);
  closeRef.current = onClose;
  screenHeightRef.current = Dimensions.get('screen').height;
  const animateClose = () => {
    if (closingRef.current) return;
    closingRef.current = true;
    Keyboard.dismiss();
    Animated.parallel([
      Animated.timing(slide, { toValue: screenHeightRef.current, duration: motion.standard, easing: Easing.in(Easing.cubic), useNativeDriver: true }),
      Animated.timing(backdropOpacity, { toValue: 0, duration: motion.quick, easing: Easing.out(Easing.quad), useNativeDriver: true }),
    ]).start(() => closeRef.current());
  };
  const restoreSheet = () => {
    Animated.parallel([
      Animated.spring(slide, { toValue: 0, useNativeDriver: true, bounciness: 0, speed: 20 }),
      Animated.timing(backdropOpacity, { toValue: 1, duration: motion.quick, easing: Easing.out(Easing.quad), useNativeDriver: true }),
    ]).start();
  };
  const pan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_e, g) => g.dy > 6 && Math.abs(g.dy) > Math.abs(g.dx),
      onPanResponderGrant: () => {
        slide.stopAnimation();
        backdropOpacity.stopAnimation();
      },
      onPanResponderMove: (_e, g) => {
        if (g.dy <= 0) return;
        slide.setValue(g.dy);
        backdropOpacity.setValue(Math.max(0.35, 1 - g.dy / Math.max(1, screenHeightRef.current * 0.7)));
      },
      onPanResponderRelease: (_e, g) => {
        if (g.dy > 80 || g.vy > 0.6) animateClose();
        else restoreSheet();
      },
      onPanResponderTerminate: restoreSheet,
    }),
  ).current;

  const pickFromLibrary = async () => {
    const remaining = MAX_TL_MEDIA - media.length;
    if (remaining <= 0) { Alert.alert(t('journey.timeline.photoLimit')); return; }
    mediaPickerOpenRef.current = true;
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) return;
      const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images', 'videos'], allowsMultipleSelection: true, selectionLimit: remaining, quality: 0.8 });
      if (res.canceled) return;
      const added = await Promise.all(res.assets.slice(0, remaining).map(assetToMedia));
      setMedia((m) => [...m, ...added].slice(0, MAX_TL_MEDIA));
    } finally {
      // The picker may return before Android reports the keyboard again. Restore
      // focus first and keep the previous keyboard inset through that handoff.
      setTimeout(() => titleInputRef.current?.focus(), 60);
      setTimeout(() => { mediaPickerOpenRef.current = false; }, 700);
    }
  };

  // Expand immediately (no waiting on the keyboard) — the Collapsible's own
  // smooth height/opacity tween keeps it from feeling jumpy.
  const toggleDayPicker = () => {
    setShowTime(false);
    setDayOpen((open) => !open);
  };
  const toggleTime = () => {
    if (showTime) { setShowTime(false); return; }
    if (startMins == null) { setStartMins(540); setEndMins(600); }
    setDayOpen(false);
    setShowTime(true);
  };
  const clearTime = () => { setShowTime(false); setStartMins(null); setEndMins(null); };
  const can = text.trim().length > 0 && !submitting;
  const submit = async () => {
    if (!can) return;
    setSubmitting(true);
    try {
      await onSubmit({ title: text.trim(), day: day.trim() || defaultDay, media: media.length ? media : undefined, timeStart: startMins ?? undefined, timeEnd: endMins ?? undefined });
      animateClose();
    } catch (error) {
      console.warn('Failed to save journey timeline media', error);
      Alert.alert(t('journey.timeline.uploadFailedTitle'), t('journey.timeline.uploadFailedMessage'));
    } finally {
      setSubmitting(false);
    }
  };

  const subtle = theme.dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)';
  // Android normally resizes the app window for the IME. Applying the measured
  // keyboard height again moves the editor too far upward; iOS still needs the
  // explicit lift because the keyboard overlays the window.
  const screenHeight = Dimensions.get('screen').height;
  const androidWindowAlreadyResized = keyboardH > 0 && screenHeight - windowHeight >= keyboardH * 0.5;
  const keyboardLift = Platform.OS === 'ios' || !androidWindowAlreadyResized ? keyboardH : 0;
  const keyboardTranslateY = Animated.add(slide, -keyboardLift);

  return (
    <View style={[StyleSheet.absoluteFill, { zIndex }]}>
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: backdropOpacity }]}>
        <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.45)' }]} onPress={animateClose} />
      </Animated.View>
      <View style={[StyleSheet.absoluteFill, { justifyContent: 'flex-end' }]} pointerEvents="box-none">
        <Animated.View
          style={{
            transform: [{ translateY: keyboardTranslateY }],
            marginHorizontal: 0,
            marginBottom: 0,
            backgroundColor: theme.dark ? theme.surfaceTop : '#FFFFFF',
            borderTopLeftRadius: radius.feature,
            borderTopRightRadius: radius.feature,
            paddingBottom: keyboardH > 0 ? space.sm : Math.max(insets.bottom, space.sm),
            overflow: 'visible',
          }}
        >
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              height: windowHeight,
              borderTopLeftRadius: radius.feature,
              borderTopRightRadius: radius.feature,
              backgroundColor: theme.dark ? theme.surfaceTop : '#FFFFFF',
            }}
          />
          <View {...pan.panHandlers} style={{ paddingTop: 10, paddingBottom: 4, alignItems: 'center' }}>
            <View style={{ width: 36, height: 5, borderRadius: 3, backgroundColor: theme.dark ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.12)' }} />
          </View>

          <View style={{ paddingHorizontal: 18, paddingTop: 4 }}>
            {/* add-to which day */}
            <View style={{ flexDirection: 'row' }}>
              <Press
                onPress={toggleDayPicker}
                accessibilityRole="button"
                accessibilityLabel={`${t('journey.timeline.addTo')} ${day.trim() || t('journey.timeline.ungrouped')}`}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 6, height: 34, paddingHorizontal: 14, borderRadius: 17, backgroundColor: dayOpen ? theme.fieldSurface : subtle }}
              >
                <Text style={{ fontSize: 13.5, fontWeight: '700', color: theme.text }}>{day.trim() || t('journey.timeline.ungrouped')}</Text>
                <View style={{ transform: [{ rotate: dayOpen ? '180deg' : '0deg' }] }}>
                  <Icon name="chevronDown" color={theme.text3} size={14} />
                </View>
              </Press>
            </View>
            <Collapsible open={dayOpen}>
              <DayGroupPicker theme={theme} data={dayChoices} value={day} onChange={setDay} />
            </Collapsible>

            {/* the few sentences */}
            <TextInput
              ref={titleInputRef}
              value={text}
              onChangeText={setText}
              onFocus={() => { setShowTime(false); setDayOpen(false); }}
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
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: compactToolbar ? 6 : 8, paddingHorizontal: compactToolbar ? 12 : 14, paddingTop: 10, marginTop: 6 }}>
            <Press
              onPress={toggleTime}
              style={{ flexShrink: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: compactToolbar ? 5 : 6, height: 36, paddingHorizontal: compactToolbar ? 10 : 14, borderRadius: 18, backgroundColor: showTime ? theme.accent : subtle }}
            >
              <Icon name="clock" color={showTime ? '#fff' : startMins != null ? theme.accent : theme.text2} size={17} />
              <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85} style={{ flexShrink: 1, fontSize: compactToolbar ? 13 : 13.5, fontWeight: '600', color: showTime ? '#fff' : startMins != null ? theme.text : theme.text2 }}>
                {startMins != null ? fmtRange(startMins, endMins ?? undefined) : t('journey.timeline.addTime')}
              </Text>
            </Press>
            <Press
              onPress={pickFromLibrary}
              accessibilityLabel={`${t('journey.timeline.addPhoto')} ${media.length}/${MAX_TL_MEDIA}`}
              style={{ flexShrink: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: compactToolbar ? 5 : 6, height: 36, paddingHorizontal: compactToolbar ? 10 : 14, borderRadius: 18, backgroundColor: subtle }}
            >
              <Icon name="photo" color={theme.text2} size={17} />
              <Text numberOfLines={1} style={{ flexShrink: 1, fontSize: compactToolbar ? 13 : 13.5, fontWeight: '600', color: theme.text2 }}>
                {compactToolbar ? `${media.length}/${MAX_TL_MEDIA}` : `${t('journey.timeline.addPhoto')} ${media.length}/${MAX_TL_MEDIA}`}
              </Text>
            </Press>
            <View style={{ flex: 1, minWidth: 0 }} />
            <Press onPress={submit} style={{ flexShrink: 0, height: 36, paddingHorizontal: compactToolbar ? 14 : 18, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: can ? theme.accent : subtle }}>
              <Text numberOfLines={1} style={{ fontSize: compactToolbar ? 14 : 14.5, fontWeight: '700', color: can ? '#fff' : theme.text3 }}>{editRow ? t('common.save') : t('common.done')}</Text>
            </Press>
          </View>
        </Animated.View>
      </View>
    </View>
  );
}

// ── Direct add — pops the quick-add sheet straight up from the inline 行程 tab ─
export function JourneyEntryEditor({ theme, info, initialDay, availableGroups, editRow, onClose }: { theme: Theme; info: Poi; initialDay?: string; availableGroups?: string[]; editRow?: TLRow; onClose: () => void }) {
  const { userId } = useData();
  const tl = useTimeline(info.id, userId);
  const existingDays = groupRows(tl.rows, tl.knownGroups).map((g) => g.key).filter(Boolean);
  const sourceGroups = availableGroups?.length ? availableGroups : existingDays;
  const selectableGroupMap = new Map<string, string>();
  sourceGroups.forEach((value) => {
    const index = journeyDayOrdinal(value);
    const identity = index ? `day:${index}` : `group:${value}`;
    if (!selectableGroupMap.has(identity)) selectableGroupMap.set(identity, value);
  });
  const selectableGroups = [...selectableGroupMap.values()];
  const defaultDay = selectableGroups[0] ?? nextJourneyDayKey(existingDays);
  return (
    <QuickAddSheet
      theme={theme}
      initialDay={initialDay}
      defaultDay={defaultDay}
      existingDays={selectableGroups}
      editRow={editRow}
      onClose={onClose}
      onSubmit={async (it) => {
        if (it.media?.length && userId) {
          it = { ...it, media: await uploadTLMedia(it.media, userId, info.id) };
        }
        if (editRow) await tl.update(editRow.id, it);
        else await tl.add(it);
      }}
    />
  );
}
