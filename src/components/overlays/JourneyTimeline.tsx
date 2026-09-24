// JourneyTimeline.tsx — the unified 行程 surface. A user-grouped list of rich
// records (each row can carry photo/video media). Groups are user-defined strings
// — users decide how to organize entries. Exposes the inline digest
// (JourneyTimelineCard) and the bottom-sheet add/edit editor (JourneyEntryEditor):
// tapping a row opens that sheet in edit mode; "+" opens it in add mode.
import React, { useContext, useEffect, useMemo, useRef, useState } from 'react';
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
import ReAnimated, { Easing as ReanimatedEasing, runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { Theme } from '../../theme/theme';
import { Poi } from '../../data/pois';
import { TLRow, TLMedia, TLGroup, TimelineLocation, TimelineTransportMode } from '../../data/timeline';
import { useTimeline } from '../../hooks/useTimeline';
import { useData } from '../../data/DataContext';
import { Icon } from '../Icon';
import { Avatar } from '../Avatar';
import { Press, PressDragGuardContext, useDragCancelledPress } from '../Press';
import { useNav } from '../../nav/NavContext';
import { useI18n } from '../../i18n';
import { uploadMedia } from '../../lib/storage';
import { createMediaLibraryAsset, requestMediaLibraryPermissions } from '../../lib/mediaLibrary';
import WheelPicker from '@quidone/react-native-wheel-picker';
import * as Haptics from 'expo-haptics';
import { AppCard, motion, radius, space, type } from '../../design-system';
import { journeyDayDisplayLabel, journeyDayOrdinal, nextJourneyDayKey } from '../../lib/journeyDays';
import { groupJourneyRows, sortRowsWithinDay } from '../../lib/journeyOrdering';
import { carryPlaceFromPreviousDay } from '../../lib/journeyStops';
import { journeyTracks, trackForId, trackLengthMatches, type JourneyTrack } from '../../lib/journeyTracks';
import { TrackPointPickerSheet } from './TrackPointPicker';
import { searchJourneyLocations, type JourneyLocationValue } from '../../lib/amapGeocoding';

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

// A day group's items are revealed by the pager page itself growing (see
// JourneyCard's animateDayPageCollapse), which is a UI-thread height tween, so
// this only fades them with a compositor-only opacity. Animating the block's own
// height here relaid out every row on the JS thread each frame and dropped the
// opening frames of each expand.
//
// `keepMounted` collapses the block to zero layout height instead of unmounting
// it, so the itinerary thumbnails keep their decoded bitmaps and an expand
// doesn't re-load them. Only the pager's per-day page uses it — one group per
// page — while the 全部 list still unmounts to avoid holding every collapsed
// day's rows in memory.
const DAY_GROUP_COLLAPSE = { duration: 200, easing: ReanimatedEasing.bezier(0.455, 0.03, 0.515, 0.955) };
const DAY_GROUP_EXPAND = { duration: 280, easing: ReanimatedEasing.bezier(0.16, 1, 0.3, 1) };

function DayBody({ open, keepMounted = false, children, onHeightChange }: {
  open: boolean;
  keepMounted?: boolean;
  children: React.ReactNode;
  onHeightChange?: (height: number) => void;
}) {
  const progress = useSharedValue(open ? 1 : 0);
  const [mounted, setMounted] = useState(open);
  const [hidden, setHidden] = useState(!open);
  const applied = useRef(open);
  const fadeStyle = useAnimatedStyle(() => ({ opacity: progress.value }));
  useEffect(() => {
    if (applied.current === open) {
      if (open) setMounted(true);
      return;
    }
    applied.current = open;
    if (open) {
      setMounted(true);
      setHidden(false);
      progress.value = withTiming(1, DAY_GROUP_EXPAND);
      return;
    }
    // The rows stay mounted until the page has finished travelling, so the
    // shrink reads as a wipe instead of an empty page closing.
    progress.value = withTiming(0, DAY_GROUP_COLLAPSE, (finished) => {
      if (!finished) return;
      if (keepMounted) runOnJS(setHidden)(true);
      else runOnJS(setMounted)(false);
    });
  }, [keepMounted, open, progress]);
  if (!mounted) return null;
  return (
    <ReAnimated.View
      onLayout={(event) => {
        const height = Math.ceil(event.nativeEvent.layout.height);
        if (height) onHeightChange?.(height);
      }}
      style={hidden ? [fadeStyle, { height: 0, overflow: 'hidden' }] : fadeStyle}
    >
      {children}
    </ReAnimated.View>
  );
}

// The chevron turns with the same curve as the body/page tween, so the tap
// target and the content read as one motion.
function CollapseChevron({ theme, collapsed }: { theme: Theme; collapsed: boolean }) {
  const spin = useRef(new Animated.Value(collapsed ? 0 : 1)).current;
  useEffect(() => {
    Animated.timing(spin, {
      toValue: collapsed ? 0 : 1,
      duration: collapsed ? 200 : 280,
      easing: collapsed ? Easing.bezier(0.455, 0.03, 0.515, 0.955) : Easing.bezier(0.16, 1, 0.3, 1),
      useNativeDriver: true,
    }).start();
  }, [collapsed, spin]);
  return (
    <Animated.View style={{ transform: [{ rotate: spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '180deg'] }) }] }}>
      <Icon name="chevronDown" color={theme.text2} size={18} />
    </Animated.View>
  );
}

function DayCollapseToggle({ theme, collapsed, onPress, label }: {
  theme: Theme;
  collapsed: boolean;
  onPress: () => void;
  label: string;
}) {
  return (
    <Press
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={8}
      style={{ width: 32, height: 30, alignItems: 'center', justifyContent: 'center' }}
    >
      <CollapseChevron theme={theme} collapsed={collapsed} />
    </Press>
  );
}

const MAX_TL_MEDIA = 10;const fmtMins = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

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
const transportModeLabel = (mode?: TimelineTransportMode) => ({ car: '驾车', taxi: '打车', bus: '巴士', shuttle: '接驳', walk: '步行', unknown: '交通' }[mode ?? 'unknown']);
const transportSummary = (row: TLRow) => {
  if (row.kind !== 'transport' || !row.transport) return null;
  const parts = [transportModeLabel(row.transport.mode), row.transport.from.name && row.transport.to.name ? `${row.transport.from.name} → ${row.transport.to.name}` : null];
  if (row.transport.distanceMeters != null) parts.push(`${(row.transport.distanceMeters / 1000).toFixed(1)} km`);
  if (row.transport.durationMinutes != null) parts.push(`${Math.floor(row.transport.durationMinutes / 60)}小时${row.transport.durationMinutes % 60 ? `${row.transport.durationMinutes % 60}分` : ''}`);
  return parts.filter(Boolean).join('  ');
};

// AMap returns `type` as a semicolon-hierarchy string (e.g. "风景名胜;博物馆").
// Collapse it to the short tag shown above each search result.
const poiCategoryLabel = (category?: string) => {
  const head = (category || '').split(';')[0]?.trim() ?? '';
  if (!head) return '';
  if (head.startsWith('风景名胜') || head.includes('景点')) return '景点';
  if (head.startsWith('住宿服务')) return '住宿';
  if (head.startsWith('餐饮服务')) return '餐饮';
  if (head.startsWith('购物服务')) return '购物';
  if (head.startsWith('交通设施服务')) return '交通';
  if (head.startsWith('体育休闲服务')) return '休闲';
  if (head.startsWith('科教文化服务')) return '文化';
  if (head.startsWith('医疗保健服务')) return '医疗';
  return '其他';
};

// Reference-style result row: the part of the name the user already typed is
// tinted (query 「四川」 → 「四川」博物院), then the plain remainder.
function HighlightedPlaceName({ theme, name, query }: { theme: Theme; name: string; query: string }) {
  const q = query.trim();
  const hit = q && name.toLowerCase().startsWith(q.toLowerCase()) ? name.slice(0, q.length) : '';
  return (
    <Text numberOfLines={1} style={{ color: theme.text, fontSize: 18, fontWeight: '700' }}>
      {hit ? <Text style={{ color: theme.accent }}>{hit}</Text> : null}
      {hit ? name.slice(hit.length) : name}
    </Text>
  );
}

/** The carried-place row docked above the search field — one line, no address.
 *  The results list has to clear it, so this must match the row's own height. */
const CARRY_ROW_HEIGHT = 46;

function PlaceSearchOverlay({ theme, keyboardLift, carryPlace, onSelect, onClose }: {
  theme: Theme;
  keyboardLift: number;
  carryPlace?: JourneyLocationValue;
  onSelect: (location: JourneyLocationValue) => void;
  onClose: () => void;
}) {
  const { t, resolved } = useI18n();
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<JourneyLocationValue[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState(false);
  useEffect(() => {
    if (query.trim().length < 2) { setResults([]); setError(false); return; }
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setSearching(true); setError(false);
      searchJourneyLocations(query.trim(), resolved === 'zh' ? 'zh' : 'en', undefined, controller.signal)
        .then(setResults)
        .catch(() => { if (!controller.signal.aborted) { setResults([]); setError(true); } })
        .finally(() => { if (!controller.signal.aborted) setSearching(false); });
    }, 280);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [query, resolved]);
  const showList = query.trim().length >= 2;
  // Full-bleed stack: the list panel lands directly on top of the search dock,
  // which sits flush on the keyboard — one continuous surface, no gaps. The
  // field never remounts, so toggling the list keeps focus + keyboard.
  return (
    <View style={[StyleSheet.absoluteFill, { zIndex: 120 }]}>
      <Press onPress={onClose} style={StyleSheet.absoluteFill}><View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.35)' }]} /></Press>
      {showList ? (
        <View style={{ position: 'absolute', left: 0, right: 0, top: insets.top + 8, bottom: 0, borderTopLeftRadius: 28, borderTopRightRadius: 28, backgroundColor: theme.surfaceTop, paddingTop: 12 }}>
          <ScrollView style={{ flex: 1 }} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 18, paddingTop: 6, paddingBottom: keyboardLift + 70 + (carryPlace ? 1 : 0) * CARRY_ROW_HEIGHT }}>
            {searching ? <View style={{ paddingVertical: 28, alignItems: 'center' }}><ActivityIndicator color={theme.accent} /><Text style={{ color: theme.text3, fontSize: 13, marginTop: 8 }}>{t('journey.timeline.placeSearchSearching')}</Text></View> : null}
            {!searching && results.map((result, index) => {
              const category = poiCategoryLabel(result.category);
              return (
                <Press key={`${result.lng}-${result.lat}-${index}`} onPress={() => { onSelect(result); onClose(); }} style={{ paddingVertical: 13 }}>
                  <HighlightedPlaceName theme={theme} name={result.name} query={query} />
                  <Text numberOfLines={1} style={{ color: theme.text3, fontSize: 13, marginTop: 5 }}>{category ? `${category}｜` : ''}{result.address || result.region}</Text>
                </Press>
              );
            })}
            {!searching && !results.length ? <View style={{ paddingVertical: 28, alignItems: 'center' }}><Text style={{ color: theme.text2, fontSize: 15 }}>{error ? t('journey.timeline.placeSearchUnavailable') : t('journey.timeline.placeSearchNoMatch')}</Text></View> : null}
          </ScrollView>
        </View>
      ) : null}
      <View style={{
        position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: theme.surfaceTop,
        borderTopLeftRadius: 28, borderTopRightRadius: 28,
        shadowColor: '#000', shadowOpacity: theme.dark ? 0.22 : 0.06, shadowRadius: 6, shadowOffset: { width: 0, height: -2 }, elevation: 4,
      }}>
        {/* The place the day before ends on, one tap from the thumb that is
            already reaching for the keyboard. It rides inside the dock rather
            than floating above it: same surface, no gap, no new chrome. */}
        {carryPlace ? (
          <Press
            accessibilityRole="button"
            onPress={() => { onSelect(carryPlace); onClose(); }}
            style={{ height: CARRY_ROW_HEIGHT, flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 16 }}
          >
            <Text numberOfLines={1} style={{ color: theme.text3, fontSize: 12, fontWeight: '600' }}>{t('journey.timeline.placeCarryHint')}</Text>
            <Text numberOfLines={1} style={{ color: theme.text, fontSize: 16, fontWeight: '700', flexShrink: 1 }}>{carryPlace.name}</Text>
          </Press>
        ) : null}
        <View style={{ height: 54, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, gap: 10 }}>
          <Icon name="search" size={19} color={theme.text2} />
          <TextInput autoFocus value={query} onChangeText={setQuery} placeholder={t('journey.timeline.placeSearchPlaceholder')} placeholderTextColor={theme.text3} style={{ flex: 1, color: theme.text, fontSize: 17, paddingVertical: 0 }} />
          {query ? (
            <Press onPress={() => setQuery('')} hitSlop={8} accessibilityRole="button" accessibilityLabel={t('journey.timeline.placeSearchClear')} style={{ width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.fieldSurface }}>
              <Icon name="close" size={13} color={theme.text2} strokeWidth={2.2} />
            </Press>
          ) : null}
        </View>
        {/* white continues behind the keyboard's rounded corners */}
        <View style={{ height: keyboardLift }} />
      </View>
    </View>
  );
}


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

// ── A collapsible day group: bold label, chevron when collapsible ─────────────
function DaySection({ theme, label, collapsible, collapsed, onToggle, onBodyHeight, children }: {
  theme: Theme;
  label: string;
  collapsible?: boolean;
  collapsed?: boolean;
  onToggle?: () => void;
  onBodyHeight?: (height: number) => void;
  children: React.ReactNode;
}) {
  return (
    <View style={{ marginBottom: space.xl }}>
      <Pressable
        onPress={collapsible ? onToggle : undefined}
        hitSlop={8}
        style={{ minHeight: 60, paddingVertical: space.sm, flexDirection: 'row', alignItems: 'center' }}
      >
        <View style={{ flex: 1 }}>
          <Text style={[type.pageTitle, { color: theme.text, fontSize: 23 }]} numberOfLines={1}>{label.toUpperCase()}</Text>
        </View>
        {collapsible ? (
          <View style={{ width: 32, height: 32, alignItems: 'center', justifyContent: 'center' }}>
            <CollapseChevron theme={theme} collapsed={!!collapsed} />
          </View>
        ) : null}
      </Pressable>
      <DayBody open={!collapsed} onHeightChange={onBodyHeight}>{children}</DayBody>
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
        // Unmounting the whole viewer (Modal teardown, video player dispose) in
        // the animation-complete callback stalls that frame; yield one beat first.
        setTimeout(() => onDismiss(), 0);
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
      // The library always fires a momentum-decay on its inner panAnim at release
      // even when our dismiss handler consumed the gesture; that extra native anim
      // start competes with the dismiss fling on the release frame.
      disableMomentum
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
  // Paging on/off is applied imperatively: the old state flag re-rendered the
  // whole modal tree (pager, zoom views, gradients) at drag start and again on
  // release, and that JS work is what dropped frames around the dismiss fling.
  const pagingEnabledRef = useRef(true);
  const setPagingEnabled = (enabled: boolean) => {
    if (pagingEnabledRef.current === enabled) return;
    pagingEnabledRef.current = enabled;
    const native = scrollRef.current?.getNativeScrollRef?.() ?? scrollRef.current;
    (native as { setNativeProps?: (p: object) => void } | null)?.setNativeProps?.({ scrollEnabled: enabled });
  };
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
          onDismissGestureChange={(active) => setPagingEnabled(!active)}
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
          scrollEnabled={!imageZoomed && !multiTouch}
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
            setPagingEnabled(true);
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

  // This row is the full page width, so a page swipe can end as a press on it.
  const rowPress = useDragCancelledPress(selectionMode ? toggleSelection : onPress, useContext(PressDragGuardContext));

  const placeName = row.location?.name?.trim() || '';
  const hasTitle = row.title.trim().length > 0;
  // The place line keeps its own style even when it's the only content —
  // promoting it into the title slot made a place-only item indistinguishable
  // from a plain text note.
  const headNode = hasTitle ? (
    <Text style={[type.cardTitle, { color: theme.text, marginTop: row.timeStart != null ? space.xxs : 0, lineHeight: 21 }]}>{row.title}</Text>
  ) : null;
  // The place line is a closing note under the main block — it gets a real
  // gap (space.sm) from whatever sits above it, not the 4px intra-text rhythm.
  const placeNode = placeName ? (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: row.timeStart != null || hasTitle || media.length > 0 ? space.sm : 0 }}>
      <Icon name="pin" size={11} color={theme.text2} strokeWidth={1.8} />
      <Text numberOfLines={1} style={[type.caption, { color: theme.text2, flexShrink: 1 }]}>{placeName}</Text>
    </View>
  ) : null;
  const timeNode = row.timeStart != null ? <Text style={[type.eyebrow, { color: theme.text2 }]}>{fmtRange(row.timeStart, row.timeEnd ?? undefined)}</Text> : null;
  const summary = transportSummary(row);
  const transportNode = summary ? <Text style={[type.caption, { color: theme.accent, marginTop: space.xxs }]}>{summary}</Text> : null;

  const hasText = row.timeStart != null || hasTitle || Boolean(summary);
  // B1: the right-hand photo column only exists when the left has text to
  // carry — media-only items keep photos in the full-width grid, place-only
  // items stay a single line. 1–2 media go right, ≥3 fall back to the grid.
  const sideMedia = hasText && media.length > 0 && media.length <= 2;
  const tileBg = dayLayout ? theme.surfaceTop : theme.fieldSurface;

  // ≥3 media (or no text to host the right column): a three-up grid shows the
  // whole set at a glance — the old horizontal strip hid both count and tails,
  // and went blind in selection mode. 7–9 cap out at six cells with a +N
  // badge on the last one; tapping it opens the viewer from there.
  const shownMedia = media.slice(0, 6);
  const hiddenMediaCount = media.length - shownMedia.length;
  const mediaRows: ({ item: TLMedia; index: number } | null)[][] = [];
  for (let i = 0; i < shownMedia.length; i += 3) {
    const cells: ({ item: TLMedia; index: number } | null)[] = [];
    for (let j = i; j < i + 3; j += 1) cells.push(j < shownMedia.length ? { item: shownMedia[j], index: j } : null);
    mediaRows.push(cells);
  }

  const mediaGrid = !sideMedia && media.length > 0 ? (
    <View pointerEvents={selectionMode ? 'none' : 'auto'} style={{ gap: space.xs, paddingTop: space.sm }}>
      {mediaRows.map((cells, rowIndex) => (
        <View key={rowIndex} style={{ flexDirection: 'row', gap: space.xs }}>
          {cells.map((cell, cellIndex) => (cell ? (
            <Pressable
              key={cell.index}
              onPress={onOpenMedia ? () => onOpenMedia(media, cell.index, row) : undefined}
              style={{ flex: 1, aspectRatio: 1, borderRadius: radius.control, overflow: 'hidden', backgroundColor: tileBg }}
            >
              {(() => {
                const uri = cell.item.video ? cell.item.thumb : cell.item.uri;
                return uri ? <Image source={{ uri }} contentFit="cover" transition={160} style={StyleSheet.absoluteFill} /> : null;
              })()}
              {cell.index === 5 && hiddenMediaCount > 0 ? (
                <View pointerEvents="none" style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.42)' }]}>
                  <Text style={{ color: '#fff', fontSize: 13, fontWeight: '700' }}>{`+${hiddenMediaCount}`}</Text>
                </View>
              ) : null}
            </Pressable>
          ) : <View key={`pad-${cellIndex}`} style={{ flex: 1 }} />))}
        </View>
      ))}
    </View>
  ) : null;

  const sideArt = sideMedia ? (
    <View pointerEvents={selectionMode ? 'none' : 'auto'} style={{ width: 92, gap: space.xs, marginLeft: space.md }}>
      {media.map((item, index) => {
        const uri = item.video ? item.thumb : item.uri;
        return (
          <Pressable
            key={index}
            onPress={onOpenMedia ? () => onOpenMedia(media, index, row) : undefined}
            style={{ width: 92, height: media.length === 1 ? 92 : 60, borderRadius: radius.control, overflow: 'hidden', backgroundColor: theme.surfaceTop }}
          >
            {uri ? <Image source={{ uri }} contentFit="cover" transition={160} style={StyleSheet.absoluteFill} /> : null}
          </Pressable>
        );
      })}
    </View>
  ) : null;

  const textBlock = (
    <View style={{ flex: 1, minWidth: 0 }}>
      {timeNode}
      {headNode}
      {transportNode}
      {mediaGrid}
      {sideMedia ? <View style={{ flexGrow: 1 }} /> : null}
      {placeNode}
    </View>
  );

  const content = sideMedia ? (
    <View style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'stretch' }}>
      {textBlock}
      {sideArt}
    </View>
  ) : textBlock;

  return (
    <Pressable
      onPressIn={rowPress.onPressIn}
      onPress={rowPress.onPress}
      hitSlop={selectionMode ? 6 : undefined}
      accessibilityRole={selectionMode ? 'checkbox' : 'button'}
      accessibilityState={selectionMode ? { checked: selected } : undefined}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: dayLayout ? 'flex-start' : 'center',
        gap: space.md,
        // In the day layout this Pressable *is* the card: the inset lives here so
        // the whole tinted area is a tap target, not just the text lines.
        paddingVertical: dayLayout ? space.md : space.sm,
        paddingHorizontal: dayLayout ? space.md : 0,
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

export function JourneyTimelineCard({ theme, info, readOnly, preview, selectedDay, showDayTabs = true, availableDays, selectionMode = false, selectedItemIds, onSelectedItemIdsChange, onGroupLayout, onGroupCollapseChange }: { theme: Theme; info: Poi; readOnly?: boolean; preview?: { rows: Record<string, unknown>[]; groups: Record<string, unknown>[] }; selectedDay?: string; showDayTabs?: boolean; availableDays?: string[]; selectionMode?: boolean; selectedItemIds?: Set<string>; onSelectedItemIdsChange?: (ids: Set<string>) => void; onGroupLayout?: (day: string, y: number) => void; onGroupCollapseChange?: (change: { collapsed: boolean; delta: number }) => void }) {
  const nav = useNav();
  const { t, resolved } = useI18n();
  const { userId } = useData();
  const tl = useTimeline(info.id, userId, preview);
  const [activeDay, setActiveDay] = useState<string>(ALL_DAYS);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const groupBodyHeights = useRef(new Map<string, number>());
  const [viewer, setViewer] = useState<{ rowId: string; media: TLMedia[]; index: number } | null>(null);
  const [chipsEditing, setChipsEditing] = useState(false);
  const [dismissChipsSignal, setDismissChipsSignal] = useState(0);
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
  const groups = groupJourneyRows(tl.rows, [...new Set([...defaultDays, ...tl.knownGroups])]);
  const dayLabel = (g: TLGroup) => g.label.trim() ? journeyDayDisplayLabel(g.label, resolved) : t('journey.timeline.ungrouped');
  const currentDay = selectedDay || activeDay;
  const nextDayName = () => nextJourneyDayKey(groups.map((group) => group.key));
  const addNextDay = () => {
    const day = nextDayName();
    tl.addGroup(day);
    setActiveDay(day);
  };
  const toggleCollapse = (key: string) => {
    const collapsing = collapsed.has(key) ? false : true;
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
    // The detail pager stores page heights that only ever grow, so the parent
    // needs the measured body height to animate the page down/up with the group.
    onGroupCollapseChange?.({ collapsed: collapsing, delta: groupBodyHeights.current.get(key) ?? 0 });
  };
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
  const sortedRows = (g: TLGroup) => sortRowsWithinDay(g.rows);

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
    const dayCollapsed = collapsed.has(g.key);
    return (
      <View key={g.key} onLayout={(event) => onGroupLayout?.(g.key, event.nativeEvent.layout.y)} style={{ paddingBottom: space.xl }}>
        <View style={{ minHeight: 30, marginBottom: space.md, flexDirection: 'row', alignItems: 'center' }}>
          <View style={{ flex: 1, minWidth: 0, justifyContent: 'center' }}>
            <Text numberOfLines={1} style={[type.sectionTitle, { color: theme.text, lineHeight: 24 }]}>
              {dayLabel(g)}
            </Text>
          </View>
          {rows.length ? (
            <DayCollapseToggle
              theme={theme}
              collapsed={dayCollapsed}
              onPress={() => toggleCollapse(g.key)}
              label={t(dayCollapsed ? 'journey.timeline.expandAllGroups' : 'journey.timeline.collapseGroups')}
            />
          ) : null}
        </View>

        {rows.length ? (
          <DayBody
            open={!dayCollapsed}
            keepMounted
            onHeightChange={(height) => { groupBodyHeights.current.set(g.key, height); }}
          >
            <View style={{ gap: space.md }}>
              {rows.map((row) => (
                <AppCard
                  key={row.id}
                  theme={theme}
                  radius={radius.feature}
                  style={{
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
          </DayBody>
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
              collapsible={currentDay === ALL_DAYS}
              collapsed={currentDay === ALL_DAYS && collapsed.has(g.key)}
              onToggle={() => toggleCollapse(g.key)}
              onBodyHeight={(height) => { groupBodyHeights.current.set(g.key, height); }}
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
                          try {
                            await tl.update(row.id, { media: nextMedia.length ? nextMedia : undefined });
                          } catch {
                            Alert.alert(t('journey.timeline.saveFailedTitle'), t('journey.timeline.saveFailedMessage'));
                          }
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
function QuickAddSheet({ theme, initialDay, defaultDay, existingDays, rows, knownGroups, tracks, editRow, zIndex = 80, onSubmit, onClose }: {
  theme: Theme;
  initialDay?: string;
  defaultDay: string;
  existingDays: string[];
  rows: TLRow[];
  knownGroups: string[];
  tracks: JourneyTrack[];
  editRow?: TLRow;
  zIndex?: number;
  onSubmit: (it: Omit<TLRow, 'id'>) => void | Promise<void>;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { t, resolved } = useI18n();
  const initDay = editRow ? (editRow.day || defaultDay) : initialDay?.trim() || defaultDay;
  const [text, setText] = useState(editRow?.title ?? '');
  const [location, setLocation] = useState<TimelineLocation>(editRow?.location ?? { name: '' });
  const [placeOpen, setPlaceOpen] = useState(false);
  const [trackPickerOpen, setTrackPickerOpen] = useState(false);
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
  // The chip mirrors the wheel and the timeline group header: persisted keys
  // stay as `Day 1` but are shown localized (`第一天`).
  const dayDisplayLabel = day.trim() ? journeyDayDisplayLabel(day.trim(), resolved) : t('journey.timeline.ungrouped');
  const [startMins, setStartMins] = useState<number | null>(editRow?.timeStart ?? null);
  const [endMins, setEndMins] = useState<number | null>(editRow?.timeEnd ?? null);
  const [showTime, setShowTime] = useState(false);
  const [keyboardH, setKeyboardH] = useState(0);
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const compactToolbar = windowWidth < 420;
  const titleInputRef = useRef<TextInput>(null);
  const mediaPickerOpenRef = useRef(false);
  const keyboardVisibleRef = useRef(false);

  const slide = useRef(new Animated.Value(600)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;
  // The keyboard offset lives entirely in an Animated.Value tweened by the
  // event handlers (native driver). React state is only committed after the
  // animation settles — a mid-flight setState re-rendered the sheet and its
  // padding, which read as a flicker before the rise.
  const keyboardOffset = useRef(new Animated.Value(0)).current;
  const keyboardHRef = useRef(0);
  const placeOpenRef = useRef(false);
  placeOpenRef.current = placeOpen;
  // Below the toolbar there is one padding constant doing two jobs: at rest it
  // clears the home indicator, and with the keyboard up it used to widen the gap
  // above the keys (iOS measures the keyboard from the bottom of the SCREEN, so
  // its height already spans that indicator region — confirmed on device).
  // The padding stays constant either way — flipping it relayouts the sheet at
  // the END of the rise tween, the flicker-then-rise seen before — so the LIFT
  // absorbs the difference and leaves space.sm of air above the keys.
  const sheetBottomPad = Math.max(insets.bottom, space.sm);
  const sheetBottomPadRef = useRef(sheetBottomPad);
  sheetBottomPadRef.current = sheetBottomPad;
  const sheetLiftFor = (h: number) => (Platform.OS === 'ios' ? Math.max(0, h - sheetBottomPadRef.current + space.sm) : h);
  const entranceStartedRef = useRef(false);
  useEffect(() => {
    Animated.timing(backdropOpacity, { toValue: 1, duration: motion.quick, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    const slideAlone = () => {
      Animated.timing(slide, { toValue: 0, duration: motion.quick, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    };
    if (Platform.OS !== 'ios') {
      entranceStartedRef.current = true;
      slideAlone();
    }
    // On iOS the card deliberately waits for keyboardWillShow so slide-in and
    // keyboard rise fire as ONE motion — sliding in first and lifting later
    // left a visible pause between the two.
    const focusTimer = setTimeout(() => titleInputRef.current?.focus(), 16);
    const fallbackTimer = setTimeout(() => {
      if (entranceStartedRef.current) return;
      entranceStartedRef.current = true;
      slideAlone();
    }, 400);
    return () => {
      clearTimeout(focusTimer);
      clearTimeout(fallbackTimer);
      slide.stopAnimation();
      backdropOpacity.stopAnimation();
      keyboardOffset.stopAnimation();
    };
  }, [backdropOpacity, slide, keyboardOffset]);
  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSub = Keyboard.addListener(showEvent, (e) => {
      const h = Math.max(0, e.endCoordinates.height);
      keyboardHRef.current = h;
      keyboardVisibleRef.current = true;
      if (Platform.OS === 'ios') {
        const dur = e.duration || 250;
        const offsetTarget = placeOpenRef.current ? 0 : -sheetLiftFor(h);
        const rise = Animated.timing(keyboardOffset, { toValue: offsetTarget, duration: dur, easing: Easing.inOut(Easing.ease), useNativeDriver: true });
        if (!entranceStartedRef.current) {
          entranceStartedRef.current = true;
          Animated.parallel([
            rise,
            Animated.timing(slide, { toValue: 0, duration: dur, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          ]).start(() => setKeyboardH(h));
        } else {
          rise.start(() => setKeyboardH(h));
        }
      } else {
        setKeyboardH(h);
        const screenH = Dimensions.get('screen').height;
        const windowResizedByIme = screenH - Dimensions.get('window').height >= h * 0.5;
        keyboardOffset.setValue(windowResizedByIme || placeOpenRef.current ? 0 : -h);
      }
    });
    const hideSub = Keyboard.addListener(hideEvent, (e) => {
      // Opening the system media picker temporarily hides the IME. Keep the
      // previous inset until focus is restored, otherwise the card drops behind
      // the keyboard when the picker closes.
      if (mediaPickerOpenRef.current) return;
      keyboardVisibleRef.current = false;
      if (Platform.OS === 'ios') {
        Animated.timing(keyboardOffset, {
          toValue: 0,
          duration: e.duration || 250,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }).start(() => {
          keyboardHRef.current = 0;
          setKeyboardH(0);
        });
      } else {
        keyboardHRef.current = 0;
        keyboardOffset.setValue(0);
        setKeyboardH(0);
      }
    });
    return () => { showSub.remove(); hideSub.remove(); };
  }, [keyboardOffset]);
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
  const title = text.trim();
  const can = (title.length > 0 || Boolean(location.name) || media.length > 0) && !submitting;
  const pickPlace = (loc: JourneyLocationValue) => {
    setLocation({ name: loc.name, source: 'map', longitude: loc.lng, latitude: loc.lat, address: loc.address });
  };
  // A place picked on a recorded track keeps its distance along that track, which
  // is what lets the chain draw the walk instead of planning a road.
  const pickTrackPlace = (loc: TimelineLocation) => {
    setTrackPickerOpen(false);
    setPlaceOpen(false);
    setLocation(loc);
  };
  // A re-imported track moves every distance on it, and a place measured against
  // the old file would draw a confident wrong line. Say so instead.
  const placedTrack = location.source === 'track' ? trackForId(tracks, location.trackId) : undefined;
  const trackPlaceStale = location.source === 'track'
    && (!placedTrack || !trackLengthMatches(placedTrack, location.trackLengthMeters));
  // Where the previous day group ends, while this group has no place of its own
  // yet. A new day usually starts there, so the place search offers it instead
  // of making the user type it again.
  const carryPlace = useMemo(() => {
    const carried = carryPlaceFromPreviousDay(rows, knownGroups, day.trim() || defaultDay, editRow?.id);
    const lng = carried?.longitude;
    const lat = carried?.latitude;
    if (!carried?.name || lng == null || lat == null) return undefined;
    return {
      name: carried.name,
      address: carried.address ?? '',
      region: '',
      lng,
      lat,
      coord: `${lng.toFixed(6)},${lat.toFixed(6)}`,
    } satisfies JourneyLocationValue;
  }, [day, defaultDay, editRow?.id, knownGroups, rows]);
  const submit = async () => {
    if (!can) return;
    setSubmitting(true);
    try {
      await onSubmit({
        title,
        day: day.trim() || defaultDay,
        media: media.length ? media : undefined,
        timeStart: startMins ?? undefined,
        timeEnd: endMins ?? undefined,
        kind: editRow?.kind ?? 'activity',
        location: location.name ? location : undefined,
      });
      animateClose();
    } catch (error) {
      console.warn('Failed to save journey timeline item', error);
      const detail = error instanceof Error ? error.message : String(error);
      Alert.alert(
        t('journey.timeline.saveFailedTitle'),
        [t('journey.timeline.saveFailedMessage'), detail].filter(Boolean).join('\n'),
      );
    } finally {
      setSubmitting(false);
    }
  };

  const subtle = theme.dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)';
  // Android normally resizes the app window for the IME. Applying the measured
  // keyboard height again moves the editor too far upward; iOS still needs the
  // explicit lift because the keyboard overlays the window.
  // While the place-search overlay is open it owns the keyboard; the form sheet
  // lowers back down behind the dim — tweened, so the two sheets hand the
  // keyboard off without a visible jump.
  const placeOpenFirstRun = useRef(true);
  useEffect(() => {
    // Skip the mount pass — otherwise it stop()s the entrance animation this
    // effect is meant to modulate only on later placeOpen toggles.
    if (placeOpenFirstRun.current) {
      placeOpenFirstRun.current = false;
      return;
    }
    const target = placeOpen || !keyboardVisibleRef.current ? 0 : -sheetLiftFor(keyboardHRef.current);
    if (Platform.OS !== 'ios') {
      keyboardOffset.setValue(target);
      return;
    }
    keyboardOffset.stopAnimation(() => {
      Animated.timing(keyboardOffset, {
        toValue: target,
        duration: 250,
        easing: Easing.inOut(Easing.ease),
        useNativeDriver: true,
      }).start();
    });
  }, [placeOpen, keyboardOffset]);
  const screenHeight = Dimensions.get('screen').height;
  const androidWindowAlreadyResized = keyboardH > 0 && screenHeight - windowHeight >= keyboardH * 0.5;
  const keyboardLift = Platform.OS === 'ios' || !androidWindowAlreadyResized ? keyboardH : 0;
  const keyboardTranslateY = Animated.add(slide, keyboardOffset);

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
            // Constant — must not flip with keyboard state, or the sheet
            // relayouts mid-animation (the flicker-then-rise the user saw).
            paddingBottom: sheetBottomPad,
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
          {/* Invisible strip: the only drag-to-dismiss grab area this sheet has. */}
          <View {...pan.panHandlers} style={{ height: 18 }} />

          <View style={{ paddingHorizontal: 18, paddingTop: 4 }}>
            {/* add-to which day */}
            <View style={{ flexDirection: 'row' }}>
              <Press
                onPress={toggleDayPicker}
                accessibilityRole="button"
                accessibilityLabel={`${t('journey.timeline.addTo')} ${dayDisplayLabel}`}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 6, height: 34, paddingHorizontal: 14, borderRadius: 17, backgroundColor: dayOpen ? theme.fieldSurface : subtle }}
              >
                <Text style={{ fontSize: 13.5, fontWeight: '700', color: theme.text }}>{dayDisplayLabel}</Text>
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
              style={{ marginTop: 12, minHeight: 64, maxHeight: 150, fontSize: 16.5, lineHeight: 24, color: theme.text, padding: 0 }}
            />

            {/* place attachment — a text button until picked, then a removable chip */}
            {location.name ? (
              <Press
                onPress={() => setPlaceOpen(true)}
                style={{ alignSelf: 'flex-start', maxWidth: '100%', marginTop: 6, marginBottom: 4, minHeight: 34, borderRadius: 17, paddingLeft: 12, paddingRight: 6, flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: theme.fieldSurface }}
              >
                <Text numberOfLines={1} style={{ fontSize: 14, fontWeight: '600', color: theme.text, flexShrink: 1 }}>{location.name}</Text>
                {location.source === 'track' && location.trackMeters != null ? (
                  // Where on the path it is, so the reader knows this place is not
                  // a map pin — and can tell a stale one from the hint beside it.
                  <Text numberOfLines={1} style={{ fontSize: 12, fontWeight: '600', color: trackPlaceStale ? theme.danger : theme.text2, flexShrink: 1 }}>
                    {trackPlaceStale
                      ? t('journey.timeline.trackStale')
                      : t('journey.timeline.trackPointName', { km: (location.trackMeters / 1000).toFixed(1) })}
                  </Text>
                ) : null}
                <Press
                  onPress={() => setLocation({ name: '' })}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel={t('common.delete')}
                  style={{ width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.dark ? 'rgba(255,255,255,0.14)' : 'rgba(60,60,67,0.12)' }}
                >
                  <Icon name="close" size={11} color={theme.text2} strokeWidth={2.2} />
                </Press>
              </Press>
            ) : (
              // Two kinds of place, two capsules. They used to sit on one line as
              // identically styled text, which read as a single sentence — and
              // their hitSlop overlapped, so a mis-tap opened the wrong panel.
              // Same 34pt / radius 17 / fieldSurface as the day capsule above, and
              // the second one only exists on a journey that carries a track.
              <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8, minHeight: 34, marginTop: 6, marginBottom: 2 }}>
                <Press
                  onPress={() => setPlaceOpen(true)}
                  accessibilityRole="button"
                  style={{ height: 34, borderRadius: 17, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.fieldSurface }}
                >
                  <Text style={{ fontSize: 13.5, fontWeight: '700', color: theme.text }}>{t('journey.timeline.placeSearchPlaceholder')}</Text>
                </Press>
                {tracks.length ? (
                  <Press
                    onPress={() => setTrackPickerOpen(true)}
                    accessibilityRole="button"
                    style={{ height: 34, borderRadius: 17, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.fieldSurface }}
                  >
                    <Text numberOfLines={1} style={{ fontSize: 13.5, fontWeight: '700', color: theme.text }}>{t('journey.timeline.trackPlaceAction')}</Text>
                  </Press>
                ) : null}
              </View>
            )}

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
      {placeOpen ? (
        <PlaceSearchOverlay
          theme={theme}
          keyboardLift={keyboardLift}
          carryPlace={carryPlace}
          onSelect={pickPlace}
          onClose={() => setPlaceOpen(false)}
        />
      ) : null}
      {trackPickerOpen ? (
        <TrackPointPickerSheet
          theme={theme}
          tracks={tracks}
          onPick={pickTrackPlace}
          onClose={() => setTrackPickerOpen(false)}
        />
      ) : null}
    </View>
  );
}

// ── Direct add — pops the quick-add sheet straight up from the inline 行程 tab ─
export function JourneyEntryEditor({ theme, info, initialDay, availableGroups, editRow, onClose }: { theme: Theme; info: Poi; initialDay?: string; availableGroups?: string[]; editRow?: TLRow; onClose: () => void }) {
  const { userId, routes } = useData();
  const tl = useTimeline(info.id, userId);
  const existingDays = groupJourneyRows(tl.rows, tl.knownGroups).map((g) => g.key).filter(Boolean);
  const sourceGroups = availableGroups?.length ? availableGroups : existingDays;
  const selectableGroupMap = new Map<string, string>();
  sourceGroups.forEach((value) => {
    const index = journeyDayOrdinal(value);
    const identity = index ? `day:${index}` : `group:${value}`;
    if (!selectableGroupMap.has(identity)) selectableGroupMap.set(identity, value);
  });
  const selectableGroups = [...selectableGroupMap.values()];
  const defaultDay = selectableGroups[0] ?? nextJourneyDayKey(existingDays);
  // The tracks this journey already carries — the routes its days link to plus
  // its own bound track. A hiking day puts its places on one of these, because
  // between them there is no road to search for.
  const tracks = useMemo(() => journeyTracks(info, tl.rows, routes), [info, routes, tl.rows]);
  return (
    <QuickAddSheet
      theme={theme}
      initialDay={initialDay}
      defaultDay={defaultDay}
      existingDays={selectableGroups}
      rows={tl.rows}
      knownGroups={tl.knownGroups}
      tracks={tracks}
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
