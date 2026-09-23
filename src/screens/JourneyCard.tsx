// JourneyCard.tsx — SelectedPoiCard: the rich detail body for a route or journey,
// shown inside the discover sheet's in-place journey detail panel.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Animated, View, Text, TextInput, StyleSheet, ScrollView, Modal, Pressable } from 'react-native';
import PagerView from '../components/PagerViewCompat';
import { Image } from 'expo-image';
import { Heart, MoreHorizontal, Settings, Share2, type LucideIcon } from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import * as VideoThumbnails from 'expo-video-thumbnails';
import { MONO } from '../theme/fonts';
import { Theme } from '../theme/theme';
import { MAX_JOURNEY_PARTICIPANTS, Poi, type Companion } from '../data/pois';
import { TLRow } from '../data/timeline';
import { JourneyTimelineCard, MediaViewer } from '../components/overlays/JourneyTimeline';
import { PhotoTile } from '../components/PhotoTile';
import { Avatar } from '../components/Avatar';
import { Icon, IconName } from '../components/Icon';
import { Press, PressDragGuardContext } from '../components/Press';
import { Segmented } from '../components/Segmented';
import { useNav } from '../nav/NavContext';
import { useInspo } from '../hooks/useInspo';
import { useTimeline } from '../hooks/useTimeline';
import { useData } from '../data/DataContext';
import { genPhotos } from '../components/overlays/PhotoWall';
import { useI18n, TKey, ResolvedLang } from '../i18n';
import { NJBottomSheet } from '../components/overlays/NewJourneyParts';
import { ElevationStrip } from '../components/overlays/ElevationStrip';
import { JourneyTrackUploadSheet } from '../components/overlays/JourneyTrackUploadSheet';
import { PickDialog } from '../components/tracks/PickDialog';
import { formatTrackAscent, formatTrackDistance } from '../lib/trackParser';
import { JourneyDateRangePicker } from '../components/overlays/JourneyDateRangePicker';
import { journeySchedulePatch } from '../lib/journeySchedule';
import { ParticipantAvatar } from '../components/overlays/ParticipantAvatar';
import { JourneyChecklistTab, type JourneyChecklistFilterMenuController } from '../components/journey/JourneyChecklistTab';
import { MomentFilterBar } from '../components/journey/MomentFilterBar';
import { formatJourneyDetailDate } from '../components/journey/journeyDatePresentation';
import { AppCard, AppSectionHeader, layout, radius, space, type } from '../design-system';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ReAnimated, { Easing, cancelAnimation, interpolate, runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { journeyDayDisplayLabel, journeyDayKey, journeyDayOrdinal, nextJourneyDayKey } from '../lib/journeyDays';
import { useJourneyVersionSummary, type JourneyVersionSnapshot } from '../hooks/useJourneyVersions';
import { formatJourneyVersionTime, journeyVersionActivitySummary } from '../components/journey/journeyVersionPresentation';

function SectionHeader({ theme, title, action, onAction }: { theme: Theme; title: string; action?: string; onAction?: () => void }) {
  const trailing = action ? (
    <Press onPress={onAction} style={{ paddingVertical: space.xxs }}>
      <Text style={[type.body, { fontWeight: '600', color: theme.accent }]}>{action}</Text>
    </Press>
  ) : undefined;
  return <AppSectionHeader theme={theme} text={title} trailing={trailing} variant="title" marginTop={0} />;
}

function FloatingIconButton({ icon: IconComponent, onPress, color, fill }: { icon: LucideIcon; onPress?: () => void; color?: string; fill?: string }) {
  return (
    <Press
      onPress={onPress}
      style={{
        width: 44,
        height: 44,
        borderRadius: 22,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(0,0,0,0.36)',
      }}
    >
      <IconComponent color={color || '#fff'} fill={fill} size={25} strokeWidth={2.2} />
    </Press>
  );
}

function JourneyParticipantButton({
  theme,
  people,
  onOpenParticipants,
  onInvite,
  inviteAtCapacity,
  participantsAccessibilityLabel,
  inviteAccessibilityLabel,
  readOnly = false,
}: {
  theme: Theme;
  people: { ini: string; color?: string; tone?: string; avatarUrl?: string }[];
  onOpenParticipants: () => void;
  onInvite: () => void;
  inviteAtCapacity?: boolean;
  participantsAccessibilityLabel: string;
  inviteAccessibilityLabel: string;
  readOnly?: boolean;
}) {
  const visiblePeople = people.slice(0, 2);
  const hasOverflow = people.length > 2;
  const avatarSize = 36;
  const inviteSize = 36;
  const overlap = -11;
  const separatorWidth = 2;
  const avatarSurface = theme.groupedBg;
  const avatarBorder = theme.progressTrack;
  const overflowStyle = {
    width: avatarSize,
    height: avatarSize,
    borderRadius: avatarSize / 2,
    backgroundColor: avatarSurface,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  };

  return (
    <View style={{ minHeight: 40, flexDirection: 'row', alignItems: 'center' }}>
      <Press
        onPress={readOnly ? undefined : onOpenParticipants}
        accessibilityRole={readOnly ? undefined : 'button'}
        accessibilityLabel={participantsAccessibilityLabel}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 4 }}
        style={{ flexDirection: 'row', alignItems: 'center' }}
      >
        {visiblePeople.map((person, index) => {
          const showOverflow = hasOverflow && index === 1;
          return (
            <View
              key={`${person.ini}-${index}`}
              style={{
                width: avatarSize,
                height: avatarSize,
                marginLeft: index === 0 ? 0 : overlap,
              }}
            >
              {index > 0 ? (
                <View
                  pointerEvents="none"
                  style={{
                    position: 'absolute',
                    top: -separatorWidth,
                    right: -separatorWidth,
                    bottom: -separatorWidth,
                    left: -separatorWidth,
                    borderRadius: (avatarSize + separatorWidth * 2) / 2,
                    backgroundColor: theme.featureSurface,
                  }}
                />
              ) : null}
              {showOverflow ? (
                <View style={overflowStyle}>
                  <Icon name="more" color={theme.text3} size={16} strokeWidth={2.2} />
                </View>
              ) : (
                <ParticipantAvatar
                  theme={theme}
                  uri={person.avatarUrl}
                  size={avatarSize}
                  backgroundColor={avatarSurface}
                />
              )}
            </View>
          );
        })}
      </Press>
      {!readOnly ? <Press
        onPress={onInvite}
        accessibilityRole="button"
        accessibilityLabel={inviteAccessibilityLabel}
        hitSlop={{ top: 8, bottom: 8, left: 4, right: 8 }}
        style={{
          width: inviteSize,
          height: inviteSize,
          marginLeft: overlap,
          borderRadius: inviteSize / 2,
          borderWidth: 2,
          borderColor: theme.progressTrack,
          backgroundColor: theme.controlSurface,
          alignItems: 'center',
          justifyContent: 'center',
          opacity: inviteAtCapacity ? 0.45 : 1,
        }}
      >
        <Icon name="plus" color={theme.text2} size={18} strokeWidth={2.1} />
      </Press> : null}
    </View>
  );
}

// Split a display string like "6.2 km" / "+1,640 m" / "3天" into a big value and
// a small trailing unit. Non-numeric strings (e.g. a difficulty label) pass through.
function splitStat(s?: string): { value: string; unit?: string } {
  if (!s) return { value: '—' };
  const m = s.trim().match(/^([+\-]?[\d.,]+)\s*(.+)?$/);
  if (m) return { value: m[1], unit: m[2]?.trim() || undefined };
  return { value: s.trim() };
}

function parseStatNumber(s?: string): number | undefined {
  const n = Number((s || '').replace(/,/g, '').match(/[\d.]+/)?.[0]);
  return Number.isFinite(n) ? n : undefined;
}

function fmtMeters(n?: number): string {
  if (!Number.isFinite(n)) return '—';
  return `${Math.round(n as number)} m`;
}

function fmtSpeed(distance?: string, durationMs?: number): string {
  const km = parseStatNumber(distance);
  if (!km || !durationMs || durationMs <= 0) return '—';
  return `${(km / (durationMs / 3600000)).toFixed(1)} km/h`;
}

function fmtIntensity(distance?: string, ascent?: string): string {
  const km = parseStatNumber(distance);
  const m = parseStatNumber(ascent);
  if (!km || !m) return '—';
  return `${Math.round(m / km)} m/km`;
}

function StatTile({ theme, value, unit, label, accent, mono = true }: { theme: Theme; value: string; unit?: string; label: string; accent?: boolean; mono?: boolean }) {
  return (
    <View
      style={{
        flex: 1,
        paddingVertical: 6,
      }}
    >
      <Text
        numberOfLines={1}
        adjustsFontSizeToFit
        style={{
          fontFamily: mono ? MONO : undefined,
          fontSize: 23,
          fontWeight: '800',
          color: accent ? theme.accent : theme.text,
          letterSpacing: -0.7,
        }}
      >
        {value}
        {unit ? <Text style={{ fontSize: 11, fontWeight: '700', color: theme.text2 }}> {unit}</Text> : null}
      </Text>
      <Text
        style={{
          fontSize: 11,
          color: theme.text3,
          fontWeight: '600',
          marginTop: 5,
          letterSpacing: 0.2,
        }}
      >
        {label}
      </Text>
    </View>
  );
}

function FactItem({ theme, label, value }: { theme: Theme; label: string; value: string }) {
  return (
    <View style={{ width: '48%', paddingTop: 10, paddingBottom: 8 }}>
      <Text numberOfLines={1} style={{ fontSize: 11.5, color: theme.text3 }}>
        {label}
      </Text>
      <Text
        numberOfLines={1}
        style={{
          fontSize: 14.5,
          color: theme.text,
          fontWeight: '500',
          marginTop: 4,
          letterSpacing: -0.1,
        }}
      >
        {value}
      </Text>
    </View>
  );
}

type TabId = 'overview' | 'moments' | 'checklist' | 'plan' | `day:${string}`;
export type JourneyMomentFilter = 'all' | 'photo' | 'video' | 'livePhoto';
export type JourneyMomentAuthorOption = {
  key: string;
  name: string;
  ini: string;
  color: string;
  avatarUrl?: string;
  count: number;
  countLabel: string;
  host?: boolean;
  self?: boolean;
};

export type JourneyMomentFilterMenuController = {
  participantTitle: string;
  allParticipantsLabel: string;
  hostLabel: string;
  selfLabel: string;
  selectedAuthor: string | null;
  authors: JourneyMomentAuthorOption[];
  selectAuthor: (author: string | null) => void;
};

type MomentFilter = JourneyMomentFilter;
type MomentAuthorOption = JourneyMomentAuthorOption;

type JourneyMomentPreview = {
  id: string;
  uri?: string;
  thumbnail?: string;
  tone: string;
  kind?: 'image' | 'video' | 'livePhoto';
  pairedVideoUri?: string;
  caption?: string;
  createdAt?: string;
  author?: { ini: string; name: string; color: string; avatarUrl?: string };
};

function MomentsSkeleton({ theme }: { theme: Theme }) {
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.timing(pulse, {
        toValue: 1,
        duration: 1200,
        useNativeDriver: true,
      }),
    );
    animation.start();
    return () => animation.stop();
  }, [pulse]);

  const opacity = pulse.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0.52, 1, 0.52],
  });

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ gap: space.sm }}
    >
      {Array.from({ length: 3 }, (_, rowIndex) => (
        <View key={rowIndex} style={{ flexDirection: 'row', gap: space.sm }}>
          {Array.from({ length: 2 }, (_, columnIndex) => (
            <Animated.View
              key={columnIndex}
              style={{
                flex: 1,
                aspectRatio: 1,
                borderRadius: radius.card,
                backgroundColor: theme.progressTrack,
                opacity,
              }}
            />
          ))}
        </View>
      ))}
      <Animated.View
        style={{
          alignSelf: 'center',
          width: 96,
          height: 12,
          marginTop: space.xs,
          borderRadius: radius.pill,
          backgroundColor: theme.progressTrack,
          opacity,
        }}
      />
    </View>
  );
}

function MomentPreview({
  theme,
  moment,
  seed,
  surface,
  selectionMode = false,
  selected = false,
  selectable = true,
  uploading = false,
  onToggle,
  onOpen,
}: {
  theme: Theme;
  moment: JourneyMomentPreview;
  seed: string;
  surface: string;
  selectionMode?: boolean;
  selected?: boolean;
  selectable?: boolean;
  uploading?: boolean;
  onToggle?: () => void;
  onOpen?: () => void;
}) {
  const { t: tr } = useI18n();
  const displayUri = moment.kind === 'video' ? moment.thumbnail || moment.uri : moment.uri;

  const media = (
    <View
      style={{
        aspectRatio: 1,
        borderRadius: radius.card,
        overflow: 'hidden',
        backgroundColor: surface,
        borderWidth: selectionMode ? 0 : StyleSheet.hairlineWidth,
        borderColor: theme.fieldBorder,
      }}
    >
        {displayUri ? (
          <Image source={{ uri: displayUri }} contentFit="cover" style={StyleSheet.absoluteFill} />
        ) : (
          <PhotoTile
            tone={moment.tone}
            seed={seed}
            radius={radius.card}
            style={StyleSheet.absoluteFill}
            resWidth={520}
          />
        )}
      {selectionMode && selected ? (
        <View
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.14)' }]}
        />
      ) : null}
      {moment.kind === 'video' ? (
        <View
          style={{
            position: 'absolute',
            right: space.xs,
            top: space.xs,
            height: 26,
            minWidth: 26,
            paddingHorizontal: space.xs,
            borderRadius: radius.pill,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'rgba(0,0,0,0.48)',
          }}
        >
          <Icon name="play" color="#FFFFFF" size={12} />
        </View>
      ) : null}
      {moment.kind === 'livePhoto' ? (
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: space.sm,
            bottom: space.sm,
          }}
        >
          <Icon name="livePhoto" color="#FFFFFF" size={26} />
        </View>
      ) : null}
      {uploading ? (
        <View
          pointerEvents="none"
          style={{
            ...StyleSheet.absoluteFill,
            alignItems: 'center',
            justifyContent: 'center',
            gap: space.xs,
            backgroundColor: 'rgba(0,0,0,0.55)',
          }}
        >
          <ActivityIndicator color="#FFFFFF" size="small" />
          <Text style={{ fontSize: 11, fontWeight: '700', color: '#FFFFFF' }}>{tr('journey.moments.uploadingBadge')}</Text>
        </View>
      ) : null}
      {selectionMode ? (
        <View
          style={{
            position: 'absolute',
            left: space.xs,
            top: space.xs,
            width: 26,
            height: 26,
            borderRadius: radius.pill,
            alignItems: 'center',
            justifyContent: 'center',
            borderWidth: 2,
            borderColor: '#FFFFFF',
            backgroundColor: selected ? theme.accent : 'rgba(0,0,0,0.24)',
            opacity: selectable ? 1 : 0.45,
          }}
        >
          {selected ? <Icon name="check" color="#FFFFFF" size={14} strokeWidth={3} /> : null}
        </View>
      ) : null}
    </View>
  );

  return (
    <Press
      onPress={selectionMode ? (selectable ? onToggle : undefined) : (uploading ? undefined : onOpen)}
      disabled={selectionMode ? !selectable : uploading}
      accessibilityRole={selectionMode ? 'checkbox' : 'button'}
      accessibilityState={selectionMode ? { checked: selected, disabled: !selectable } : undefined}
      style={{ flex: 1, minWidth: 0 }}
    >
      {media}
    </Press>
  );
}

function addMinutes(d: Date, mins: number): Date {
  return new Date(d.getTime() + mins * 60000);
}

function startOfTodayAtNine(): Date {
  const d = new Date();
  d.setHours(9, 0, 0, 0);
  return d;
}

function parseJourneyStart(poi: Poi): Date {
  const now = new Date();
  const text = [poi.plannedDate, poi.date].filter(Boolean).join(' ');
  const iso = text.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]), 9);
  const y = text.match(/(20\d{2})/);
  const md = text.match(/(\d{1,2})\s*月\s*(\d{1,2})\s*日?/);
  const hm = text.match(/(\d{1,2}):(\d{2})/);
  if (md) {
    const d = new Date(y ? Number(y[1]) : now.getFullYear(), Number(md[1]) - 1, Number(md[2]));
    d.setHours(hm ? Number(hm[1]) : 9, hm ? Number(hm[2]) : 0, 0, 0);
    return d;
  }
  return startOfTodayAtNine();
}

function parseJourneyDurationMins(poi: Poi): number {
  if (poi.trackDurationMs && poi.trackDurationMs > 0) return Math.max(30, Math.round(poi.trackDurationMs / 60000));
  const text = poi.days || '';
  const n = Number((text.match(/[\d.]+/) || [])[0]);
  if (Number.isFinite(n) && n > 0) {
    if (/时|hour|hr|h\b/i.test(text)) return Math.max(30, Math.round(n * 60));
    return Math.max(30, Math.round(n * 24 * 60));
  }
  if (poi.totalDays && poi.totalDays > 0) return poi.totalDays * 24 * 60;
  return 24 * 60;
}

function detailDurationLabel(mins: number): string {
  const safe = Math.max(30, mins);
  if (safe < 24 * 60) {
    const h = Math.max(1, Math.round(safe / 60));
    return `${h}时`;
  }
  const d = Math.max(1, Math.round(safe / (24 * 60)));
  return `${d}天`;
}

function compactDate(d: Date): string {
  return `${d.getFullYear()} · ${d.getMonth() + 1} 月 ${d.getDate()} 日`;
}

function compactPlannedDate(d: Date): string {
  return `${d.getMonth() + 1} 月 ${d.getDate()} 日`;
}

export function nextJourneyDayLabel(labels: string[], _resolved: ResolvedLang, _t: ReturnType<typeof useI18n>['t']): string {
  return nextJourneyDayKey(labels);
}

function JourneyTimePicker({ theme, poi, onApply, onClose }: { theme: Theme; poi: Poi; onApply: (patch: Partial<Poi>) => void; onClose: () => void }) {
  const { t } = useI18n();
  const initialStart = useMemo(() => parseJourneyStart(poi), [poi]);
  const initialDurationDays = useMemo(() => poi.totalDays || (poi.days ? Math.max(1, Math.round(parseJourneyDurationMins({ ...poi, trackDurationMs: undefined }) / (24 * 60))) : undefined), [poi]);
  const initialFlexible = !poi.plannedDate && !poi.date;

  return (
    <JourneyDateRangePicker
      theme={theme}
      initialStart={initialStart}
      initialDurationDays={initialDurationDays}
      initialFlexible={initialFlexible}
      onApply={({ start, totalDays, flexible }) => {
        onApply(journeySchedulePatch({ start, totalDays, flexible }, totalDays == null ? '' : t('journeyEdit.meta.days', { count: totalDays })));
      }}
      onClose={onClose}
    />
  );
}

function JourneyDistanceSheet({
  theme,
  initialValue,
  onSave,
  onClose,
}: {
  theme: Theme;
  initialValue: string;
  onSave: (distance: string) => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const initialNumber = (initialValue.match(/[\d.]+/) || [''])[0];
  const [value, setValue] = useState(initialNumber);
  const normalized = value.trim().replace(',', '.');
  const numericValue = Number(normalized);
  const canSave = normalized.length > 0 && Number.isFinite(numericValue) && numericValue > 0;

  const save = () => {
    if (!canSave) return;
    onSave(`${numericValue} km`);
    onClose();
  };

  return (
    <Modal transparent visible animationType="none" onRequestClose={onClose}>
      <NJBottomSheet theme={theme} onClose={onClose} keyboardAvoiding fillBehindKeyboard borderless backgroundColor={theme.featureSurface}>
        <View style={{ paddingHorizontal: space.lg, paddingBottom: space.md }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: space.lg }}>
            <Press onPress={onClose} style={{ minWidth: 52, paddingVertical: space.xs }}>
              <Text style={[type.body, { color: theme.text2 }]}>{t('common.cancel')}</Text>
            </Press>
            <Text style={[type.sectionTitle, { flex: 1, color: theme.text, textAlign: 'center' }]}>{t('journey.stat.distance')}</Text>
            <Press onPress={save} disabled={!canSave} style={{ minWidth: 52, paddingVertical: space.xs, alignItems: 'flex-end' }}>
              <Text style={[type.body, { color: canSave ? theme.accent : theme.text3, fontWeight: '700' }]}>{t('common.save')}</Text>
            </Press>
          </View>
          <View style={{ height: 52, borderRadius: radius.card, flexDirection: 'row', alignItems: 'center', backgroundColor: theme.fieldSurface }}>
            <TextInput
              autoFocus
              selectTextOnFocus
              value={value}
              onChangeText={setValue}
              keyboardType="decimal-pad"
              returnKeyType="done"
              onSubmitEditing={save}
              placeholder="0.0"
              placeholderTextColor={theme.text3}
              style={{ flex: 1, height: 52, paddingLeft: space.md, color: theme.text, fontSize: 18, fontWeight: '700' }}
            />
            <Text style={{ paddingHorizontal: space.md, color: theme.text2, fontSize: 14, fontWeight: '600' }}>km</Text>
          </View>
        </View>
      </NJBottomSheet>
    </Modal>
  );
}

function JourneyGroupRenameSheet({ theme, initialName, onSave, onClose }: { theme: Theme; initialName: string; onSave: (name: string) => void; onClose: () => void }) {
  const { t } = useI18n();
  const [name, setName] = useState(initialName);
  const trimmed = name.trim();
  return (
    <Modal transparent visible animationType="none" onRequestClose={onClose}>
      <NJBottomSheet theme={theme} onClose={onClose} keyboardAvoiding fillBehindKeyboard>
        <View style={{ paddingHorizontal: space.md, paddingBottom: space.md }}>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              marginBottom: space.lg,
            }}
          >
            <Press onPress={onClose} style={{ minWidth: 52, paddingVertical: space.xs }}>
              <Text style={[type.body, { color: theme.text2 }]}>{t('common.cancel')}</Text>
            </Press>
            <Text style={[type.sectionTitle, { flex: 1, color: theme.text, textAlign: 'center' }]}>{t('journey.timeline.renameGroup')}</Text>
            <Press
              onPress={() => {
                if (trimmed) onSave(trimmed);
              }}
              disabled={!trimmed}
              style={{
                minWidth: 52,
                paddingVertical: space.xs,
                alignItems: 'flex-end',
              }}
            >
              <Text
                style={[
                  type.body,
                  {
                    color: trimmed ? theme.accent : theme.text3,
                    fontWeight: '700',
                  },
                ]}
              >
                {t('common.save')}
              </Text>
            </Press>
          </View>
          <TextInput
            autoFocus
            selectTextOnFocus
            value={name}
            onChangeText={setName}
            maxLength={30}
            placeholder={t('journey.timeline.newGroupPlaceholder')}
            placeholderTextColor={theme.text3}
            returnKeyType="done"
            onSubmitEditing={() => {
              if (trimmed) onSave(trimmed);
            }}
            style={{
              height: 50,
              paddingHorizontal: space.md,
              borderRadius: radius.control,
              backgroundColor: theme.fieldSurface,
              borderWidth: StyleSheet.hairlineWidth,
              borderColor: theme.fieldBorder,
              color: theme.text,
              fontSize: 16,
              fontWeight: '600',
            }}
          />
        </View>
      </NJBottomSheet>
    </Modal>
  );
}

function JourneyPlanEditDayCard({ theme, day, dayRows, selected, onToggle, onRename, label }: {
  theme: Theme;
  day: string;
  dayRows: TLRow[];
  selected: boolean;
  onToggle: (day: string) => void;
  onRename: (day: string) => void;
  label: string;
}) {
  const { t } = useI18n();
  const [visualSelected, setVisualSelected] = useState(selected);
  const selectedProgress = useSharedValue(selected ? 1 : 0);
  const checkStyle = useAnimatedStyle(() => ({
    opacity: selectedProgress.value,
    transform: [{ scale: interpolate(selectedProgress.value, [0, 1], [0.72, 1]) }],
  }));

  useEffect(() => {
    setVisualSelected(selected);
    cancelAnimation(selectedProgress);
    selectedProgress.value = withTiming(selected ? 1 : 0, {
      duration: 140,
      easing: Easing.out(Easing.cubic),
    });
  }, [selected, selectedProgress]);

  const toggle = () => {
    const next = !visualSelected;
    setVisualSelected(next);
    cancelAnimation(selectedProgress);
    selectedProgress.value = withTiming(next ? 1 : 0, {
      duration: 110,
      easing: Easing.out(Easing.cubic),
    });
    requestAnimationFrame(() => React.startTransition(() => onToggle(day)));
  };

  return (
    <View
      style={{
        minHeight: 96,
        borderRadius: radius.feature,
        overflow: 'hidden',
        backgroundColor: visualSelected ? theme.accentSofter : theme.fieldSurface,
      }}
    >
      <Pressable
        onPress={toggle}
        hitSlop={4}
        accessibilityRole="checkbox"
        accessibilityLabel={label}
        accessibilityState={{ checked: visualSelected }}
        style={[StyleSheet.absoluteFill, { zIndex: 1 }]}
      />
      <View
        pointerEvents="none"
        style={{
          zIndex: 3,
          padding: space.md,
          paddingRight: 56,
          flexDirection: 'row',
          alignItems: 'flex-start',
          gap: space.sm,
        }}
      >
        <View
          style={{
            width: 24,
            height: 24,
            marginTop: space.xxs,
            borderRadius: radius.pill,
            borderWidth: 2,
            borderColor: theme.fieldBorder,
            backgroundColor: 'transparent',
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
          }}
        >
          <ReAnimated.View
            style={[
              StyleSheet.absoluteFill,
              {
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: radius.pill,
                backgroundColor: theme.accent,
              },
              checkStyle,
            ]}
          >
            <Icon name="check" color="#FFFFFF" size={13} strokeWidth={3} />
          </ReAnimated.View>
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={{ height: 32, justifyContent: 'center' }}>
            <Text style={[type.sectionTitle, { color: theme.text }]}>{label}</Text>
          </View>
          {dayRows.length ? (
            <Text
              numberOfLines={3}
              style={[type.body, { color: theme.text2, marginTop: space.xxs, lineHeight: 21 }]}
            >
              {dayRows.slice(0, 3).map((row) => row.title).join(' → ')}
            </Text>
          ) : null}
        </View>
      </View>
      <Press
        onPress={() => onRename(day)}
        hitSlop={6}
        scaleTo={0.92}
        accessibilityRole="button"
        accessibilityLabel={t('journey.timeline.renameGroup')}
        style={{
          position: 'absolute',
          top: space.md,
          right: space.md,
          zIndex: 4,
          width: 36,
          height: 36,
          borderRadius: radius.control,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Icon name="edit" color={theme.text3} size={16} />
      </Press>
    </View>
  );
}

function JourneyPlanEditContent({ theme, days, rows, selectedDays, onToggleDay, onRenameDay, getDayLabel }: { theme: Theme; days: string[]; rows: TLRow[]; selectedDays: Set<string>; onToggleDay: (day: string) => void; onRenameDay: (day: string) => void; getDayLabel: (day: string) => string }) {
  return (
    <View style={{ paddingHorizontal: space.md, paddingBottom: space.lg }}>
      <View style={{ gap: space.sm }}>
        {days.map((day) => {
          const dayRows = rows.filter((row) => row.day === day);
          return (
            <JourneyPlanEditDayCard
              key={day}
              theme={theme}
              day={day}
              dayRows={dayRows}
              selected={selectedDays.has(day)}
              onToggle={onToggleDay}
              onRename={onRenameDay}
              label={getDayLabel(day)}
            />
          );
        })}
      </View>
    </View>
  );
}

function SelectedPoiContent({ scrollable, scrollRef, scrollY, bottomPadding, onLayout, children }: {
  scrollable: boolean;
  scrollRef: React.RefObject<ScrollView | null>;
  scrollY: Animated.Value;
  bottomPadding: number;
  onLayout: (y: number) => void;
  children: React.ReactNode;
}) {
  if (scrollable) {
    return (
      <ScrollView
        ref={scrollRef}
        style={{ flex: 1, minHeight: 0 }}
        showsVerticalScrollIndicator={false}
        bounces={false}
        alwaysBounceVertical={false}
        overScrollMode="never"
        scrollEventThrottle={16}
        onLayout={() => onLayout(0)}
        // Keep scroll-driven header/day-tab updates off the JS frame path.
        // Animated.Value listeners still receive native-driver updates when
        // the visible day needs to be synchronized.
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: true })}
        contentContainerStyle={{ paddingBottom: bottomPadding }}
      >
        {children}
      </ScrollView>
    );
  }

  return (
    <View onLayout={(event) => onLayout(event.nativeEvent.layout.y)} style={{ paddingBottom: bottomPadding }}>
      {children}
    </View>
  );
}

export function SelectedPoiCard({ theme, poi, fullBleed, embedded, onTrackSelectionChange, planEditorOpen: controlledPlanEditorOpen, onPlanEditorOpenChange, selectedPlanDays: controlledSelectedPlanDays, onSelectedPlanDaysChange, externalPlanEditorControls = false, onSelectedJourneyDayChange, journeyDaySelectionRequest, onSelectedTabChange, momentAddActionRef, momentDeleteActionRef, momentFilterMenuRef, onMomentFilterMenuOpenChange, checklistAddActionRef, checklistDeleteActionRef, checklistFilterActionRef, checklistFilterMenuRef, checklistFilterMenuOpen = false, checklistPickerProgress, checklistToggleAllActionRef, onChecklistFilterStateChange, onChecklistFilterMenuOpenChange, checklistSelectionMode = false, selectedChecklistItemIds, onSelectedChecklistItemIdsChange, onVisibleChecklistItemIdsChange, onChecklistCanEditChange, momentSelectionMode = false, selectedMomentIds, onSelectedMomentIdsChange, onVisibleMomentIdsChange, onJourneyDaysChange, timelineSelectionMode = false, selectedTimelineItemIds, onSelectedTimelineItemIdsChange, detailScrollY, onRequestDetailScroll, pagerBodyHeight = 0, scrollContent = false, scrollContentBottomPadding = 18, readOnly = false, versionSnapshot }: { theme: Theme; poi: Poi; fullBleed?: boolean; embedded?: boolean; onTrackSelectionChange?: (index: number | null, coord?: [number, number]) => void; planEditorOpen?: boolean; onPlanEditorOpenChange?: (open: boolean) => void; selectedPlanDays?: Set<string>; onSelectedPlanDaysChange?: (days: Set<string>) => void; externalPlanEditorControls?: boolean; onSelectedJourneyDayChange?: (day?: string) => void; journeyDaySelectionRequest?: { day?: string; revision: number }; onSelectedTabChange?: (tab: TabId) => void; momentAddActionRef?: React.MutableRefObject<(() => void) | null>; momentDeleteActionRef?: React.MutableRefObject<(() => Promise<void>) | null>; momentFilterMenuRef?: React.MutableRefObject<JourneyMomentFilterMenuController | null>; onMomentFilterMenuOpenChange?: (open: boolean, anchor?: { x: number; y: number; width: number; height: number }) => void; checklistAddActionRef?: React.MutableRefObject<(() => void) | null>; checklistDeleteActionRef?: React.MutableRefObject<(() => Promise<void>) | null>; checklistFilterActionRef?: React.MutableRefObject<(() => void) | null>; checklistFilterMenuRef?: React.MutableRefObject<JourneyChecklistFilterMenuController | null>; checklistFilterMenuOpen?: boolean; checklistPickerProgress?: Animated.Value; checklistToggleAllActionRef?: React.MutableRefObject<(() => void) | null>; onChecklistFilterStateChange?: (label: string, active: boolean) => void; onChecklistFilterMenuOpenChange?: (open: boolean, anchor?: { x: number; y: number; width: number; height: number }) => void; checklistSelectionMode?: boolean; selectedChecklistItemIds?: Set<string>; onSelectedChecklistItemIdsChange?: (ids: Set<string>) => void; onVisibleChecklistItemIdsChange?: (ids: string[]) => void; onChecklistCanEditChange?: (canEdit: boolean) => void; momentSelectionMode?: boolean; selectedMomentIds?: Set<string>; onSelectedMomentIdsChange?: (ids: Set<string>) => void; onVisibleMomentIdsChange?: (ids: string[]) => void; onJourneyDaysChange?: (days: string[]) => void; timelineSelectionMode?: boolean; selectedTimelineItemIds?: Set<string>; onSelectedTimelineItemIdsChange?: (ids: Set<string>) => void; detailScrollY?: Animated.Value; onRequestDetailScroll?: (y: number) => void; /** Visible height of the host sheet body; the tab pager fills down to it so blank space stays swipeable. */ pagerBodyHeight?: number; scrollContent?: boolean; scrollContentBottomPadding?: number; readOnly?: boolean; versionSnapshot?: JourneyVersionSnapshot }) {
  const nav = useNav();
  const { t, resolved } = useI18n();
  const { userId, profile, sets, items: gearItems, cats: gearCategories, tracks } = useData();
  const isJourney = poi.kind === 'journey';
  const versionSummary = useJourneyVersionSummary(isJourney && !readOnly ? poi.id : undefined);
  const momentFilterAnchorRef = useRef<View>(null);
  const isMine = isJourney && !readOnly;
  const momentAuthor = useMemo(() => {
    const host = isJourney ? poi.companionList?.find((c) => c.self) || poi.companionList?.find((c) => c.host) : undefined;
    if (host) return { ini: host.ini, name: host.name, color: host.color, avatarUrl: host.avatarUrl };
    return {
      ini: profile.nick?.charAt(0) || '?',
      name: profile.nick || t('me.unnamed'),
      color: theme.accent,
    };
  }, [isJourney, poi.companionList, profile.nick, theme.accent, t]);
  const embeddedSurface = embedded && !theme.dark ? theme.featureSurface : theme.fieldSurface;
  const hasTrack = (poi.trackCoords?.length ?? 0) >= 2;

  const inspo = useInspo(poi.id, userId, versionSnapshot?.moments);
  const [libraryPermission, requestLibraryPermission] = ImagePicker.useMediaLibraryPermissions();
  const [processingMoments, setProcessingMoments] = useState(false);
  const [momentViewerIndex, setMomentViewerIndex] = useState<number | null>(null);
  const [momentFilter, setMomentFilter] = useState<MomentFilter>('all');
  const [momentAuthorFilter, setMomentAuthorFilter] = useState<string | null>(null);
  const timelinePreview = useMemo(
    () => versionSnapshot ? { rows: versionSnapshot.timelineRows, groups: versionSnapshot.timelineGroups } : undefined,
    [versionSnapshot],
  );
  const packingPreview = useMemo(
    () => versionSnapshot ? { lists: versionSnapshot.packingLists, items: versionSnapshot.packingItems } : undefined,
    [versionSnapshot],
  );
  const timeline = useTimeline(isJourney ? poi.id : undefined, isJourney ? userId : undefined, timelinePreview);

  const addMomentAssets = async (assets: ImagePicker.ImagePickerAsset[]) => {
    const items = await Promise.all(
      assets.map(async (asset) => {
        const kind = asset.type === 'video' ? 'video' as const : asset.type === 'livePhoto' ? 'livePhoto' as const : 'image' as const;
        let thumbnail: string | undefined;
        if (kind === 'video') {
          try {
            thumbnail = (await VideoThumbnails.getThumbnailAsync(asset.uri, { time: 500 })).uri;
          } catch {}
        }
        return {
          uri: asset.uri,
          kind,
          thumbnail,
          duration: asset.duration || undefined,
          pairedVideoUri: kind === 'livePhoto' ? asset.pairedVideoAsset?.uri : undefined,
          createdAt: new Date().toISOString(),
        };
      }),
    );
    await inspo.addAll(items);
  };

  const pickMomentFromLibrary = async () => {
    if (processingMoments || inspo.uploading) return;
    const permission = libraryPermission?.granted ? libraryPermission : await requestLibraryPermission();
    if (!permission.granted) {
      nav.showToast(t('journey.photoWall.needLibraryPerm'));
      return;
    }
    setProcessingMoments(true);
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images', 'videos', 'livePhotos'],
        allowsMultipleSelection: true,
        quality: 0.8,
      });
      if (!result.canceled && result.assets?.length) await addMomentAssets(result.assets);
    } catch (error) {
      Alert.alert(t('journey.photoWall.errorTitle'), error instanceof Error ? error.message : String(error));
    } finally {
      setProcessingMoments(false);
    }
  };

  const deleteMoments = async (ids: Set<string>) => {
    const uploadedIds = [...ids].filter((id) => !id.startsWith('real-'));
    await Promise.all(uploadedIds.map((id) => inspo.remove(id)));

    const removedPhotoIndexes = new Set(
      [...ids]
        .map((id) => id.match(/^real-(\d+)$/)?.[1])
        .filter((index): index is string => index != null)
        .map(Number),
    );
    if (removedPhotoIndexes.size && poi.photoUris) {
      const nextPhotoUris = poi.photoUris.filter((_, index) => index === 0 || !removedPhotoIndexes.has(index - 1));
      nav.patchCurrent({ photoUris: nextPhotoUris });
    }
  };

  if (momentAddActionRef) momentAddActionRef.current = pickMomentFromLibrary;
  if (momentDeleteActionRef) {
    momentDeleteActionRef.current = () => deleteMoments(selectedMomentIds || new Set<string>());
  }
  const journeyDays = useMemo(() => {
    if (!isJourney) return [];
    const removed = new Set(timeline.removedGroups);
    const removedOrdinals = new Set(timeline.removedGroups.map(journeyDayOrdinal).filter((value): value is number => value != null));
    const labels = new Set<string>();
    timeline.knownGroups.forEach((label) => {
      const next = label.trim();
      if (next && !removed.has(next)) labels.add(next);
    });
    timeline.rows.forEach((row) => {
      const next = row.day.trim();
      if (next && !removed.has(next)) labels.add(next);
    });
    const usedOrdinals = new Set([...labels].map(journeyDayOrdinal).filter((value): value is number => value != null));
    const total = Math.max(1, poi.totalDays || Number.parseInt(poi.days || '', 10) || 1);
    for (let day = 1; day <= total; day += 1) {
      if (!usedOrdinals.has(day) && !removedOrdinals.has(day)) labels.add(journeyDayKey(day));
    }
    return [...labels].sort((a, b) => {
      const ai = journeyDayOrdinal(a) ?? Number.POSITIVE_INFINITY;
      const bi = journeyDayOrdinal(b) ?? Number.POSITIVE_INFINITY;
      return ai === bi ? a.localeCompare(b) : ai - bi;
    });
  }, [isJourney, poi.totalDays, poi.days, timeline.knownGroups, timeline.removedGroups, timeline.rows, resolved, t]);
  useEffect(() => { onJourneyDaysChange?.(journeyDays); }, [journeyDays, onJourneyDaysChange]);

  // photo preview — genPhotos (from poi.photoUris) + inspo (user-uploaded)
  // For routes, show photos from index 1 onwards (index 0 is hero cover);
  // for journeys, genPhotos already skips the cover.
  const wallPhotos = useMemo(
    () =>
      isJourney
      ? genPhotos(poi)
        : poi.routeShowPhotos !== false && poi.photoUris && poi.photoUris.length > 1
          ? poi.photoUris.slice(1).map((uri, i) => ({
              id: `real-${i}`,
              uri,
              tone: poi.tone || 'ridge',
              ratio: 1,
              kind: 'image' as const,
              caption: '',
              day: 1,
              author: { ini: '?', name: '', color: '#888' },
            }))
          : [],
    [isJourney, poi.name, poi.photoUris, poi.tone, poi.routeShowPhotos],
  );
  const companionsByUserId = useMemo(() => {
    const map = new Map<string, Companion>();
    (poi.companionList || []).forEach((c) => {
      if (c.userId) map.set(c.userId, c);
    });
    return map;
  }, [poi.companionList]);
  const inspoAsWall = useMemo(
    () =>
      isJourney || poi.routeShowPhotos !== false
        ? inspo.media.map((m) => ({
            id: m.id,
            uri: m.uri,
            kind: m.kind,
            thumbnail: m.thumbnail,
            pairedVideoUri: m.pairedVideoUri,
            caption: m.caption,
            createdAt: m.createdAt,
            author: (m.userId ? companionsByUserId.get(m.userId) : undefined) || momentAuthor,
            tone: poi.tone || 'ridge',
            ratio: 1,
          }))
        : [],
    [inspo.media, poi.tone, isJourney, poi.routeShowPhotos, companionsByUserId, momentAuthor],
  );
  const allPhotos: JourneyMomentPreview[] = [...wallPhotos, ...inspoAsWall];
  const getMomentAuthorKey = (author?: JourneyMomentPreview['author']) => author?.name || '';
  const momentCountsByAuthor = allPhotos.reduce<Record<string, number>>((counts, moment) => {
    const key = getMomentAuthorKey(moment.author);
    if (key) counts[key] = (counts[key] || 0) + 1;
    return counts;
  }, {});
  const participantRoster: Companion[] = poi.companionList?.length
    ? poi.companionList
    : [{ ...momentAuthor, self: true }];
  const momentAuthorOptions: MomentAuthorOption[] = participantRoster.map((participant) => {
    const count = momentCountsByAuthor[participant.name] || 0;
    return {
      key: participant.name,
      name: participant.name,
      ini: participant.ini,
      color: participant.color,
      avatarUrl: participant.avatarUrl,
      count,
      countLabel: count > 0 ? t('journey.moments.countPhotos', { count }) : '',
      host: participant.host,
      self: participant.self,
    };
  });
  const momentKindOf = (moment: JourneyMomentPreview): Exclude<MomentFilter, 'all'> => (
    moment.kind === 'video' ? 'video' : moment.kind === 'livePhoto' ? 'livePhoto' : 'photo'
  );
  const filteredPhotos = allPhotos.filter((moment) => {
    const typeMatches = momentFilter === 'all' || momentKindOf(moment) === momentFilter;
    const authorMatches = !momentAuthorFilter || getMomentAuthorKey(moment.author) === momentAuthorFilter;
    return typeMatches && authorMatches;
  });
  const visibleMomentIdsKey = filteredPhotos
    .filter((moment) => !inspo.uploadingIds.has(moment.id))
    .map((moment) => moment.id)
    .join(',');
  useEffect(() => {
    onVisibleMomentIdsChange?.(visibleMomentIdsKey ? visibleMomentIdsKey.split(',') : []);
  }, [onVisibleMomentIdsChange, visibleMomentIdsKey]);
  // Type counts follow the person filter, so the numbers on the chips are always
  // the numbers the grid will show.
  const momentTypeCounts: Record<MomentFilter, number> = { all: 0, photo: 0, video: 0, livePhoto: 0 };
  allPhotos.forEach((moment) => {
    if (momentAuthorFilter && getMomentAuthorKey(moment.author) !== momentAuthorFilter) return;
    momentTypeCounts.all += 1;
    momentTypeCounts[momentKindOf(moment)] += 1;
  });
  const momentFilterOptions: { id: MomentFilter; label: string; icon: IconName; count: number }[] = [
    { id: 'all', label: t('common.all'), icon: 'grid', count: momentTypeCounts.all },
    { id: 'photo', label: t('journey.moments.filterPhotos'), icon: 'photo', count: momentTypeCounts.photo },
    { id: 'video', label: t('journey.moments.filterVideos'), icon: 'play', count: momentTypeCounts.video },
    { id: 'livePhoto', label: t('journey.moments.filterLivePhotos'), icon: 'livePhoto', count: momentTypeCounts.livePhoto },
  ];
  useEffect(() => {
    if (momentAuthorFilter && !momentAuthorOptions.some((author) => author.key === momentAuthorFilter)) {
      setMomentAuthorFilter(null);
    }
  }, [momentAuthorFilter, momentAuthorOptions]);
  const clearMomentFilters = () => {
    setMomentViewerIndex(null);
    setMomentFilter('all');
    setMomentAuthorFilter(null);
  };
  if (momentFilterMenuRef) {
    momentFilterMenuRef.current = {
      participantTitle: t('journey.moments.filterParticipant'),
      allParticipantsLabel: t('journey.moments.filterAllParticipants'),
      hostLabel: t('journey.companions.host'),
      selfLabel: t('journey.companions.you'),
      selectedAuthor: momentAuthorFilter,
      authors: momentAuthorOptions,
      selectAuthor: (author) => {
        setMomentViewerIndex(null);
        setMomentAuthorFilter(author);
      },
    };
  }
  useEffect(() => () => {
    if (momentFilterMenuRef) momentFilterMenuRef.current = null;
  }, [momentFilterMenuRef]);
  // Peer tabs: 总览 / 瞬间 / 行程. 轨迹 is no longer a tab — the elevation lives on the
  // map above (a toggle reveals a scrubbable strip), since the map already is the
  // track. 同行 is a facepile inside 总览. Routes tab only what applies.
  const tabOptions = useMemo<{ id: TabId; label: string }[]>(() => {
    if (isJourney) {
      return [
        { id: 'overview', label: t('journey.tab.overview') },
        { id: 'moments', label: t('journey.tab.moments') },
        { id: 'checklist', label: t('journey.tab.checklist') },
        ...journeyDays.map((day) => ({
          id: `day:${day}` as TabId,
          label: journeyDayDisplayLabel(day, resolved),
        })),
      ];
    }
    const opts: { id: TabId; label: string }[] = [{ id: 'overview', label: t('journey.tab.overview') }];
    if (poi.routeShowTimeline !== false) opts.push({ id: 'plan', label: t('journey.tab.plan') });
    if (poi.routeShowPhotos !== false && allPhotos.length > 0) opts.push({ id: 'moments', label: t('journey.moments.userPhotos') });
    return opts;
  }, [isJourney, journeyDays, poi.routeShowTimeline, poi.routeShowPhotos, allPhotos.length, resolved, t]);
  const [seg, setSeg] = useState<TabId>('overview');
  // Each tab page is a full copy of its feature (every 行程 page re-renders the
  // whole timeline), so mounting all of them for the opening frame is what
  // keeps the map camera queued behind the detail tree. A page mounts when it
  // becomes selected, or mid-swipe when the pager reveals it.
  const [mountedTabs, setMountedTabs] = useState<Set<TabId>>(() => new Set<TabId>(['overview']));
  const mountTab = (value: TabId) => {
    setMountedTabs((current) => (current.has(value) ? current : new Set(current).add(value)));
  };
  const segRef = useRef<TabId>('overview');
  const [visualSeg, setVisualSeg] = useState<TabId>('overview');
  const visualSegRef = useRef<TabId>('overview');
  const fixedHeaderHeightRef = useRef(0);
  const contentTopRef = useRef(0);
  const timelineTopRef = useRef(0);
  const groupOffsetsRef = useRef(new Map<string, number>());
  const contentScrollRef = useRef<ScrollView>(null);
  const contentScrollY = useRef(new Animated.Value(0)).current;
  const effectiveDetailScrollY = scrollContent ? contentScrollY : detailScrollY;
  const requestDetailScroll = scrollContent
    ? (y: number) => contentScrollRef.current?.scrollTo({ y, animated: true })
    : onRequestDetailScroll;
  const pendingScrollDayRef = useRef<string | null>(null);
  const programmaticScrollTargetRef = useRef<number | null>(null);
  const programmaticScrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [internalPlanEditorOpen, setInternalPlanEditorOpen] = useState(false);
  const [planOverviewOpen, setPlanOverviewOpen] = useState(false);
  const planOverviewOpenRef = useRef(false);
  const planOverviewAnimatingRef = useRef(false);
  const dayCollapseAnimatingRef = useRef(false);
  const planOverviewCollapsedPagerHeightRef = useRef<number | null>(null);
  const planOverviewProgress = useSharedValue(0);
  const planOverviewExtraHeight = useSharedValue(0);
  const pagerHeight = useSharedValue(600);
  const planOverviewExtraStyle = useAnimatedStyle(() => ({
    height: planOverviewExtraHeight.value * planOverviewProgress.value,
    opacity: interpolate(planOverviewProgress.value, [0, 0.2, 1], [0, 0, 1]),
    transform: [{ translateY: interpolate(planOverviewProgress.value, [0, 1], [-space.xs, 0]) }],
  }));
  const planOverviewCollapsedLabelStyle = useAnimatedStyle(() => ({
    opacity: 1 - planOverviewProgress.value,
  }));
  const planOverviewExpandedLabelStyle = useAnimatedStyle(() => ({
    opacity: planOverviewProgress.value,
  }));
  const planOverviewChevronStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${interpolate(planOverviewProgress.value, [0, 1], [0, 180])}deg` }],
  }));
  const pagerHeightStyle = useAnimatedStyle(() => ({ height: pagerHeight.value }));
  const [internalSelectedPlanDays, setInternalSelectedPlanDays] = useState<Set<string>>(() => new Set());
  const planEditorOpen = controlledPlanEditorOpen ?? internalPlanEditorOpen;
  const selectedPlanDays = controlledSelectedPlanDays ?? internalSelectedPlanDays;
  const setPlanEditorOpen = (open: boolean) => (onPlanEditorOpenChange ? onPlanEditorOpenChange(open) : setInternalPlanEditorOpen(open));
  const setSelectedPlanDays = (days: Set<string>) => (onSelectedPlanDaysChange ? onSelectedPlanDaysChange(days) : setInternalSelectedPlanDays(days));
  const [timePickerOpen, setTimePickerOpen] = useState(false);
  const [distanceEditorOpen, setDistanceEditorOpen] = useState(false);
  const [trackUploadOpen, setTrackUploadOpen] = useState(false);
  const [trackPickOpen, setTrackPickOpen] = useState(false);
  const [renamingPlanDay, setRenamingPlanDay] = useState<string | null>(null);
  // Reuse the same identity for the journey header and moments uploaded here.
  const author = momentAuthor;
  const participantPeople = useMemo(() => {
    const list = poi.companionList?.length
      ? [...poi.companionList]
      : [{ ini: author.ini, name: author.name, color: author.color, self: true, host: true }];
    return list.sort((a, b) => Number(Boolean(b.self)) - Number(Boolean(a.self)) || Number(Boolean(b.host)) - Number(Boolean(a.host)));
  }, [author, poi.companionList]);
  const elevationSummary = useMemo(() => {
    const elevations = (poi.trackElevation || []).map((p) => p.ele).filter((n) => Number.isFinite(n));
    const maxEle = elevations.length ? Math.max(...elevations) : undefined;
    const minEle = elevations.length ? Math.min(...elevations) : undefined;
    return { maxEle, minEle };
  }, [poi.trackElevation]);

  const hasSpecificJourneyDate = Boolean(poi.plannedDate || poi.date);
  const journeyTimingLabel = hasSpecificJourneyDate ? t('journey.stat.date') : t('journey.stat.days');
  const journeyTimingValue = formatJourneyDetailDate(poi, resolved)
    || poi.days
    || (poi.totalDays ? t('journeyEdit.duration.days', { count: poi.totalDays }) : t('journeyEdit.time.decideLater'));

  // Distance + ascent stay as the headline numbers; journeys use highest elevation
  // as the third headline because it is more meaningful here than elapsed time.
  const primaryStats = useMemo<{ label: string; raw: string; mono?: boolean; accent?: boolean }[]>(() => {
    const base: {
      label: string;
      raw: string;
      mono?: boolean;
      accent?: boolean;
    }[] = [
      { label: t('journey.stat.distance'), raw: poi.dist, mono: true },
      { label: t('journey.stat.ascent'), raw: poi.asc, mono: true },
    ];
    if (isJourney)
      base.push({
        label: t('journey.stat.highest'),
        raw: fmtMeters(elevationSummary.maxEle),
        mono: true,
      });
    else
      base.push({
        label: t('journey.stat.difficulty'),
        raw: poi.diff ? t(`common.diff.${poi.diff}` as TKey) : '—',
        mono: false,
      });
    return base;
  }, [isJourney, poi.dist, poi.asc, poi.diff, elevationSummary.maxEle, t]);
  const overviewStats = useMemo<{ label: string; value: string }[]>(() => {
    const { maxEle, minEle } = elevationSummary;
    const stats: { label: string; value: string }[] = [];
    if (isJourney) {
      stats.push(
        {
          label: t('journey.stat.companions'),
          value: t('journey.companions.companionCount', {
            count: poi.companionList?.length || poi.companions || 0,
          }),
        },
        {
          label: t('journey.stat.moments'),
          value: t('journey.moments.countPhotos', { count: allPhotos.length }),
        },
      );
    } else {
      stats.push(
        { label: t('journey.stat.rating'), value: poi.rating || '—' },
        {
          label: t('journey.stat.people'),
          value: t('journey.author.walkedCount', { count: poi.reviews ?? 0 }),
        },
      );
    }
    if (maxEle != null && minEle != null) {
      if (!isJourney)
        stats.push({
          label: t('journey.stat.highest'),
          value: fmtMeters(maxEle),
        });
      stats.push({
        label: t('journey.stat.elevationRange'),
        value: fmtMeters(maxEle - minEle),
      });
    }
    const speed = fmtSpeed(poi.dist, poi.trackDurationMs);
    if (speed !== '—') stats.push({ label: t('journey.stat.avgSpeed'), value: speed });
    const intensity = fmtIntensity(poi.dist, poi.asc);
    if (intensity !== '—') stats.push({ label: t('journey.stat.intensity'), value: intensity });
    return stats;
  }, [isJourney, elevationSummary, poi.companionList, poi.companions, poi.rating, poi.reviews, poi.dist, poi.asc, poi.trackDurationMs, allPhotos.length, t]);
  const selectedJourneyDay = seg.startsWith('day:') ? seg.slice(4) : undefined;
  React.useEffect(() => {
    segRef.current = seg;
    if (visualSegRef.current !== seg) {
      visualSegRef.current = seg;
      setVisualSeg(seg);
    }
    onSelectedJourneyDayChange?.(selectedJourneyDay);
    onSelectedTabChange?.(seg);
  }, [onSelectedJourneyDayChange, onSelectedTabChange, seg, selectedJourneyDay]);
  React.useEffect(
    () => () => onSelectedJourneyDayChange?.(undefined),
    [onSelectedJourneyDayChange],
  );

  const groupScrollY = (day: string) => {
    const groupY = groupOffsetsRef.current.get(day);
    if (groupY == null) return undefined;
    const fixedHeaderHeight = !scrollContent && detailScrollY ? fixedHeaderHeightRef.current : 0;
    return Math.max(0, contentTopRef.current + timelineTopRef.current + groupY - fixedHeaderHeight - space.xs);
  };
  const scrollToPendingDay = () => {
    const day = pendingScrollDayRef.current;
    if (!day) return;
    const y = groupScrollY(day);
    if (y == null) return;
    pendingScrollDayRef.current = null;
    programmaticScrollTargetRef.current = requestDetailScroll ? y : null;
    if (programmaticScrollTimeoutRef.current) clearTimeout(programmaticScrollTimeoutRef.current);
    programmaticScrollTimeoutRef.current = setTimeout(() => {
      programmaticScrollTargetRef.current = null;
      programmaticScrollTimeoutRef.current = null;
    }, 700);
    requestDetailScroll?.(y);
  };
  const selectSegment = (value: TabId) => {
    closePlanEditor();
    mountTab(value);
    segRef.current = value;
    setSeg(value);
    if (value.startsWith('day:')) {
      pendingScrollDayRef.current = value.slice(4);
      requestAnimationFrame(scrollToPendingDay);
    } else {
      pendingScrollDayRef.current = null;
      programmaticScrollTargetRef.current = requestDetailScroll ? 0 : null;
      if (programmaticScrollTimeoutRef.current) clearTimeout(programmaticScrollTimeoutRef.current);
      programmaticScrollTimeoutRef.current = setTimeout(() => {
        programmaticScrollTargetRef.current = null;
        programmaticScrollTimeoutRef.current = null;
      }, 700);
      requestDetailScroll?.(0);
    }
  };

  useEffect(() => () => {
    if (programmaticScrollTimeoutRef.current) clearTimeout(programmaticScrollTimeoutRef.current);
  }, []);

  useEffect(() => {
    if (!effectiveDetailScrollY || !isJourney) return undefined;
    const listener = effectiveDetailScrollY.addListener(({ value }) => {
      if (!segRef.current.startsWith('day:')) return;
      const programmaticTarget = programmaticScrollTargetRef.current;
      if (programmaticTarget != null) {
        if (Math.abs(programmaticTarget - value) > space.xs) return;
        programmaticScrollTargetRef.current = null;
      }
      const positions = journeyDays
        .map((day) => ({ day, y: groupScrollY(day) }))
        .filter((entry): entry is { day: string; y: number } => entry.y != null)
        .sort((a, b) => a.y - b.y);
      if (!positions.length) return;
      const threshold = value + space.sm;
      let visibleDay = positions[0].day;
      for (const position of positions) {
        if (position.y <= threshold) visibleDay = position.day;
        else break;
      }
      const nextSegment = `day:${visibleDay}` as TabId;
      if (segRef.current !== nextSegment) {
        segRef.current = nextSegment;
        setSeg(nextSegment);
      }
    });
    return () => effectiveDetailScrollY.removeListener(listener);
  }, [effectiveDetailScrollY, isJourney, journeyDays]);

  const addJourneyGroup = (select = true) => {
    const label = nextJourneyDayLabel(journeyDays, resolved, t);
    timeline.addGroup(label);
    if (select) selectSegment(`day:${label}`);
  };
  const closePlanEditor = () => {
    setPlanEditorOpen(false);
    setPlanOverviewOpen(false);
    setSelectedPlanDays(new Set());
  };
  const togglePlanEditor = () => {
    if (planEditorOpen) closePlanEditor();
    else setPlanEditorOpen(true);
  };
  const toggleSelectedPlanDay = (day: string) => {
    const next = new Set(selectedPlanDays);
    if (next.has(day)) next.delete(day);
    else next.add(day);
    setSelectedPlanDays(next);
  };

  const pagerRef = useRef<PagerView>(null);
  const pendingPagerSegmentRef = useRef<TabId | null>(null);
  const [tabPageHeights, setTabPageHeights] = useState<Record<string, number>>({});
  const activePagerHeight = tabPageHeights[seg] || 600;
  const [pagerTop, setPagerTop] = useState(0);
  // The clip height tracks the page, so the band under it belongs to the host
  // sheet and not the pager — a horizontal swipe there had no gesture owner.
  // The floor hands that band back: a page shorter than the visible body fills
  // it, and the total the user sees (content + blank) is unchanged.
  const pagerFillMinHeight = Math.max(0, pagerBodyHeight - pagerTop);

  // Stored page heights only ever grow (see the page onLayout, which has to
  // ignore clamped measurements), so a page that genuinely got shorter needs an
  // explicit reset when its content changes size.
  const pageContentSize = `${timeline.rows.length}|${filteredPhotos.length}`;
  useEffect(() => {
    setTabPageHeights({});
  }, [pageContentSize]);

  useEffect(() => {
    if (!planOverviewAnimatingRef.current && !dayCollapseAnimatingRef.current) pagerHeight.value = activePagerHeight;
  }, [activePagerHeight, pagerHeight, seg]);

  const finishPlanOverviewAnimation = (open: boolean, targetPagerHeight: number) => {
    if (planOverviewOpenRef.current !== open) return;
    planOverviewAnimatingRef.current = false;
    setPlanOverviewOpen(open);
    setTabPageHeights((current) => current.overview === targetPagerHeight
      ? current
      : { ...current, overview: targetPagerHeight });
  };

  const togglePlanOverview = () => {
    const next = !planOverviewOpenRef.current;
    planOverviewOpenRef.current = next;
    planOverviewAnimatingRef.current = true;

    const currentOverviewHeight = tabPageHeights.overview || pagerHeight.value;
    if (planOverviewCollapsedPagerHeightRef.current == null) {
      planOverviewCollapsedPagerHeightRef.current = next
        ? currentOverviewHeight
        : Math.max(1, currentOverviewHeight - planOverviewExtraHeight.value);
    }
    const collapsedPagerHeight = planOverviewCollapsedPagerHeightRef.current;
    const targetPagerHeight = collapsedPagerHeight + (next ? planOverviewExtraHeight.value : 0);
    const animation = {
      duration: next ? 460 : 380,
      easing: next ? Easing.bezier(0.16, 1, 0.3, 1) : Easing.bezier(0.4, 0, 0.2, 1),
    };

    cancelAnimation(planOverviewProgress);
    cancelAnimation(pagerHeight);
    planOverviewProgress.value = withTiming(next ? 1 : 0, animation);
    pagerHeight.value = withTiming(targetPagerHeight, animation, (finished) => {
      if (finished) runOnJS(finishPlanOverviewAnimation)(next, targetPagerHeight);
    });
  };

  // A day group tweens its own body inside JourneyTimeline (DayBody), so the
  // page container has to travel the same distance in the same time — otherwise
  // the collapsed day keeps the blank height of the expanded page.
  const finishDayPageCollapse = (page: TabId, targetPagerHeight: number) => {
    dayCollapseAnimatingRef.current = false;
    setTabPageHeights((current) => ({ ...current, [page]: targetPagerHeight }));
  };
  const animateDayPageCollapse = ({ collapsed, delta }: { collapsed: boolean; delta: number }) => {
    if (!isJourney || scrollContent || delta <= 0 || planOverviewAnimatingRef.current) return;
    const page = segRef.current;
    const from = tabPageHeights[page] || pagerHeight.value;
    const targetPagerHeight = Math.max(120, from + (collapsed ? -delta : delta));
    dayCollapseAnimatingRef.current = true;
    cancelAnimation(pagerHeight);
    pagerHeight.value = withTiming(
      targetPagerHeight,
      {
        duration: collapsed ? 200 : 280,
        easing: collapsed ? Easing.bezier(0.455, 0.03, 0.515, 0.955) : Easing.bezier(0.16, 1, 0.3, 1),
      },
      (finished) => {
        if (finished) runOnJS(finishDayPageCollapse)(page, targetPagerHeight);
      },
    );
  };

  const selectPagerSegment = (value: TabId) => {
    const index = tabOptions.findIndex((option) => option.id === value);
    if (index < 0) return;
    pendingPagerSegmentRef.current = value;
    visualSegRef.current = value;
    setVisualSeg(value);
    selectSegment(value);
    pagerRef.current?.setPageWithoutAnimation(index);
  };

  useEffect(() => {
    const request = journeyDaySelectionRequest;
    if (!request) return;
    if (request.day && !journeyDays.includes(request.day)) return;
    // Use the exact same path as a direct tab press so both the selected state
    // and PagerView's rendered page move to the requested itinerary group.
    // A request without a day is the map asking to go back to the overview.
    selectPagerSegment(request.day ? `day:${request.day}` as TabId : 'overview');
  }, [journeyDaySelectionRequest?.revision]);

  const tabSwipeDisabled = !isJourney
    || tabOptions.length < 2
    || planEditorOpen
    || checklistSelectionMode
    || momentSelectionMode
    || timelineSelectionMode
    || momentViewerIndex != null
    || renamingPlanDay != null
    || timePickerOpen
    || distanceEditorOpen
    || trackUploadOpen;

  const renderTabContent = (activeSeg: TabId) => {
    const activeJourneyDay = activeSeg.startsWith('day:') ? activeSeg.slice(4) : undefined;
    return (
      <>
        {/* 总览 overview — stat tiles, meta chips, 同行 facepile, about */}
        {activeSeg === 'overview' ? (
          isJourney ? (
          <>
              {planEditorOpen ? (
                <View style={{ marginHorizontal: -space.md, paddingTop: space.xs }}>
                  <View
                    style={{
                      paddingHorizontal: space.md,
                      marginBottom: space.md,
                      flexDirection: 'row',
                      alignItems: 'center',
                    }}
            >
                    <Text
                      style={[
                        type.pageTitle,
                        {
                          flex: 1,
                          color: theme.text,
                          fontSize: 26,
                          lineHeight: 32,
                        },
                      ]}
                    >
                      {t('journey.timeline.editRoute')}
                    </Text>
                    {!externalPlanEditorControls ? (
                  <Press
                    onPress={togglePlanEditor}
                        accessibilityRole="button"
                        style={{
                          height: 36,
                          paddingHorizontal: space.md,
                          borderRadius: radius.pill,
                          alignItems: 'center',
                          justifyContent: 'center',
                          backgroundColor: theme.controlSurface,
                          borderWidth: StyleSheet.hairlineWidth,
                          borderColor: theme.fieldBorder,
                          boxShadow: theme.dark ? '0px 4px 12px rgba(0,0,0,0.38)' : '0px 4px 12px rgba(0,0,0,0.08)',
                        }}
                  >
                        <Text
                          style={{
                            color: theme.text,
                            fontSize: 13,
                            fontWeight: '700',
                          }}
                        >
                          {t('common.done')}
                        </Text>
                  </Press>
                    ) : null}
                  </View>
                  <JourneyPlanEditContent theme={theme} days={journeyDays} rows={timeline.rows} selectedDays={selectedPlanDays} onToggleDay={toggleSelectedPlanDay} onRenameDay={setRenamingPlanDay} getDayLabel={(day) => journeyDayDisplayLabel(day, resolved)} />
                  {!externalPlanEditorControls ? (
                    <View
                      style={{
                        paddingHorizontal: space.md,
                        alignItems: 'flex-end',
                      }}
                    >
                    <Press
                        onPress={() => addJourneyGroup(false)}
                      accessibilityRole="button"
                        style={{
                          height: 44,
                          paddingHorizontal: space.lg,
                          borderRadius: radius.pill,
                          alignItems: 'center',
                          justifyContent: 'center',
                          backgroundColor: theme.controlSurface,
                          borderWidth: StyleSheet.hairlineWidth,
                          borderColor: theme.fieldBorder,
                          boxShadow: theme.dark ? '0px 4px 12px rgba(0,0,0,0.38)' : '0px 4px 12px rgba(0,0,0,0.08)',
                        }}
                      >
                        <Text
                          style={{
                            color: theme.text,
                            fontSize: 13,
                            fontWeight: '700',
                          }}
                    >
                          {t('common.add')}
                        </Text>
                    </Press>
                    </View>
                  ) : null}
                </View>
              ) : (
                <>
                  <AppCard theme={theme} radius={radius.feature} style={{ marginTop: space.xxl, backgroundColor: theme.surface }}>
                    <View style={{ padding: space.md }}>
                      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: space.sm }}>
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text style={[type.sectionTitle, { color: theme.text }]}>{t('journey.section.trackOverview')}</Text>
                          {!hasTrack ? <Text style={[type.caption, { color: theme.text3, marginTop: space.xxs }]}>{t('journey.track.missing')}</Text> : null}
                        </View>
                        {!readOnly ? (
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.xs, flexShrink: 0 }}>
                            <Press
                              onPress={() => setTrackPickOpen(true)}
                              accessibilityRole="button"
                              style={{ minHeight: 34, paddingHorizontal: space.sm, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.controlSurface, borderWidth: StyleSheet.hairlineWidth, borderColor: theme.fieldBorder }}
                            >
                              <Text numberOfLines={1} style={[type.body, { color: theme.text, fontWeight: '600' }]}>{t('journey.track.pickExisting')}</Text>
                            </Press>
                            <Press
                              onPress={() => setTrackUploadOpen(true)}
                              accessibilityRole="button"
                              style={{ minHeight: 34, paddingHorizontal: space.sm, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.controlSurface, borderWidth: StyleSheet.hairlineWidth, borderColor: theme.fieldBorder }}
                            >
                              <Text numberOfLines={1} style={[type.body, { color: theme.text, fontWeight: '600' }]}>{hasTrack ? t('journey.track.reupload') : t('journey.track.upload')}</Text>
                            </Press>
                          </View>
                        ) : null}
                      </View>

                      {hasTrack ? (
                        <>
                          <View style={{ height: StyleSheet.hairlineWidth, marginVertical: space.md, backgroundColor: theme.hairline }} />
                          <View style={{ flexDirection: 'row' }}>
                            {primaryStats.map((stat) => {
                              const { value, unit } = splitStat(stat.raw);
                              return <StatTile key={stat.label} theme={theme} value={value} unit={unit} label={stat.label} mono={stat.mono} />;
                            })}
                          </View>
                          <View style={{ marginTop: space.sm }}>
                            <ElevationStrip theme={theme} poi={poi} bare onScrub={(index, coord) => onTrackSelectionChange?.(index, coord)} />
                          </View>
                        </>
                      ) : (
                        <Text style={[type.body, { color: theme.text2, lineHeight: 21, marginTop: space.md }]}>{t('journey.track.missingHint')}</Text>
                      )}
                    </View>
                  </AppCard>

                  <AppCard
                    theme={theme}
                    radius={radius.feature}
                    style={{
                      position: 'relative',
                      backgroundColor: theme.surface,
                      marginTop: space.xxl,
                    }}
                  >
                    <View
                      style={{
                        paddingHorizontal: space.md,
                        paddingVertical: space.md,
                      }}
                    >
                      <View
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: space.xs,
                        }}
                      >
                        <Text style={[type.sectionTitle, { flex: 1, color: theme.text }]}>{t('journey.section.planOverview')}</Text>
                        {journeyDays.length > 1 ? (
                          <Press
                            onPress={togglePlanOverview}
                            accessibilityRole="button"
                            accessibilityState={{ expanded: planOverviewOpen }}
                            style={{
                              height: 36,
                              paddingHorizontal: space.sm,
                              borderRadius: radius.pill,
                              flexDirection: 'row',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: space.xxs,
                              backgroundColor: theme.controlSurface,
                            }}
                          >
                            <View style={{ height: 18, alignItems: 'center', justifyContent: 'center' }}>
                              <Text
                                numberOfLines={1}
                                accessibilityElementsHidden
                                importantForAccessibility="no-hide-descendants"
                                style={{ opacity: 0, color: theme.text2, fontSize: 12, fontWeight: '700' }}
                              >
                                {t('journey.timeline.expandAllGroups')}
                              </Text>
                              <ReAnimated.Text
                                numberOfLines={1}
                                style={[
                                  { position: 'absolute', color: theme.text2, fontSize: 12, fontWeight: '700' },
                                  planOverviewCollapsedLabelStyle,
                                ]}
                              >
                                {t('journey.timeline.expandAllGroups')}
                              </ReAnimated.Text>
                              <ReAnimated.Text
                                numberOfLines={1}
                                style={[
                                  { position: 'absolute', color: theme.text2, fontSize: 12, fontWeight: '700' },
                                  planOverviewExpandedLabelStyle,
                                ]}
                              >
                                {t('journey.timeline.collapseGroups')}
                              </ReAnimated.Text>
                            </View>
                            <ReAnimated.View style={planOverviewChevronStyle}>
                              <Icon name="chevronDown" color={theme.text2} size={14} />
                            </ReAnimated.View>
                          </Press>
                        ) : null}
                        {!externalPlanEditorControls ? (
                          <Press
                            onPress={togglePlanEditor}
                            accessibilityRole="button"
                            style={{
                              height: 36,
                              paddingHorizontal: space.md,
                              borderRadius: radius.pill,
                              alignItems: 'center',
                              justifyContent: 'center',
                              backgroundColor: theme.controlSurface,
                              borderWidth: StyleSheet.hairlineWidth,
                              borderColor: theme.fieldBorder,
                              boxShadow: theme.dark ? '0px 4px 12px rgba(0,0,0,0.38)' : '0px 4px 12px rgba(0,0,0,0.08)',
                            }}
                          >
                            <Text
                              style={{
                                color: theme.text,
                                fontSize: 13,
                                fontWeight: '700',
                              }}
                            >
                              {t('common.edit')}
                      </Text>
                  </Press>
                ) : null}
              </View>
                      <View style={{ marginTop: space.xxs }}>
                        {journeyDays.slice(0, 1).map((day) => {
                          const rows = timeline.rows.filter((row) => row.day === day);
                          return (
                            <Press
                              key={day}
                              onPress={() => selectPagerSegment(`day:${day}`)}
                              style={{
                                minHeight: rows.length ? 58 : 48,
                                paddingVertical: space.xs,
                                flexDirection: 'row',
                                alignItems: 'center',
                              }}
                            >
                              <View style={{ flex: 1, minWidth: 0, paddingRight: space.sm }}>
                                <Text style={[type.cardTitle, { color: theme.text, fontSize: 18, lineHeight: 24 }]}>
                                  {journeyDayDisplayLabel(day, resolved)}
                                </Text>
                                {rows.length ? (
                                  <Text
                                    numberOfLines={1}
                                    style={[type.body, { color: theme.text2, marginTop: space.xxs, lineHeight: 21 }]}
                                  >
                                    {rows.slice(0, 2).map((row) => row.title).join(' → ')}
                                  </Text>
                                ) : null}
                              </View>
                              <Icon name="chevronR" color={theme.text3} size={17} />
                            </Press>
                          );
                        })}
                      </View>
                      <ReAnimated.View
                        pointerEvents="auto"
                        style={[{ overflow: 'hidden' }, planOverviewExtraStyle]}
                      >
                        <View
                          onLayout={(event) => {
                            planOverviewExtraHeight.value = event.nativeEvent.layout.height;
                          }}
                          style={{ position: 'absolute', top: 0, left: 0, right: 0 }}
                        >
                          {journeyDays.slice(1).map((day) => {
                            const rows = timeline.rows.filter((row) => row.day === day);
                            return (
                              <Press
                                key={day}
                                onPress={() => selectPagerSegment(`day:${day}`)}
                                style={{
                                  minHeight: rows.length ? 86 : 68,
                                  paddingVertical: space.md,
                                  flexDirection: 'row',
                                  alignItems: 'center',
                                  borderTopWidth: StyleSheet.hairlineWidth,
                                  borderTopColor: theme.hairline,
                                }}
                              >
                                <View style={{ flex: 1, minWidth: 0, paddingRight: space.sm }}>
                                  <Text style={[type.cardTitle, { color: theme.text, fontSize: 18, lineHeight: 24 }]}>
                                    {journeyDayDisplayLabel(day, resolved)}
                                  </Text>
                                  {rows.length ? (
                                    <Text
                                      numberOfLines={2}
                                      style={[type.body, { color: theme.text2, marginTop: space.xs, lineHeight: 21 }]}
                                    >
                                      {rows.slice(0, 3).map((row) => row.title).join(' → ')}
                                    </Text>
                                  ) : null}
                                </View>
                                <Icon name="chevronR" color={theme.text3} size={17} />
                              </Press>
                            );
                          })}
                        </View>
                      </ReAnimated.View>
                    </View>
            </AppCard>
                </>
              )}

            {poi.desc ? (
              <>
                <AppSectionHeader theme={theme} text={t('journey.section.about')} variant="title" marginTop={space.xxl} />
                <Text style={[type.body, { lineHeight: 23, color: theme.text2 }]}>{poi.desc}</Text>
              </>
            ) : null}
            {!readOnly && versionSummary ? (
              <Press
                onPress={() => nav.openJourneyHistory(poi)}
                accessibilityRole="button"
                accessibilityLabel={t('journey.version.open')}
                style={{
                  minHeight: 68,
                  marginTop: space.xxl,
                  paddingVertical: space.md,
                }}
              >
                <Text numberOfLines={2} style={[type.body, { color: theme.text2, lineHeight: 21 }]}>
                  {journeyVersionActivitySummary(
                    versionSummary,
                    versionSummary.changedByName || t('journey.version.unknownEditor'),
                    resolved,
                    t,
                  )}
                </Text>
                <View style={{ marginTop: space.xs, flexDirection: 'row', alignItems: 'center' }}>
                  <Icon name="clock" color={theme.text3} size={14} />
                  <Text
                    numberOfLines={1}
                    style={[type.caption, { flex: 1, color: theme.text3, marginLeft: space.xs }]}
                  >
                    {formatJourneyVersionTime(versionSummary.changedAt, resolved, false)}
                  </Text>
                  <Text style={[type.caption, { color: theme.text2, fontWeight: '600' }]}>
                    {t('journey.version.open')}
                  </Text>
                  <Icon name="chevronR" color={theme.text3} size={15} />
                </View>
              </Press>
            ) : null}
          </>
        ) : (
          <>
            <View style={{ flexDirection: 'row', paddingBottom: space.sm }}>
              {primaryStats.map((s) => {
                const { value, unit } = splitStat(s.raw);
                return <StatTile key={s.label} theme={theme} value={value} unit={unit} label={s.label} mono={s.mono} />;
              })}
            </View>
              <View
                style={{
                  flexDirection: 'row',
                  flexWrap: 'wrap',
                  justifyContent: 'space-between',
                }}
              >
                {overviewStats.map((s) => (
                  <FactItem key={s.label} theme={theme} label={s.label} value={s.value} />
                ))}
            </View>
            {hasTrack ? (
              <View style={{ paddingTop: space.md }}>
                <SectionHeader theme={theme} title={t('journey.stat.elevationProfile')} />
                <ElevationStrip theme={theme} poi={poi} onScrub={(index, coord) => onTrackSelectionChange?.(index, coord)} />
              </View>
            ) : null}
            {poi.desc ? (
              <View style={{ paddingTop: space.lg }}>
                <SectionHeader theme={theme} title={t('journey.section.about')} />
                <Text style={[type.body, { lineHeight: 22, color: theme.text2 }]}>{poi.desc}</Text>
              </View>
            ) : null}
          </>
          )
        ) : null}

        {activeSeg === 'checklist' && isJourney ? (
          <JourneyChecklistTab
            key={versionSnapshot ? 'version-preview' : 'current'}
            theme={theme}
            journey={poi}
            userId={userId}
            sets={sets}
            gearItems={gearItems}
            categories={gearCategories}
            weightUnit={profile.gearWeightUnit || 'kg'}
            addActionRef={checklistAddActionRef}
            deleteActionRef={checklistDeleteActionRef}
            filterActionRef={checklistFilterActionRef}
            filterMenuRef={checklistFilterMenuRef}
            filterMenuOpen={checklistFilterMenuOpen}
            pickerProgress={checklistPickerProgress}
            toggleAllActionRef={checklistToggleAllActionRef}
            onFilterStateChange={onChecklistFilterStateChange}
            onFilterMenuOpenChange={onChecklistFilterMenuOpenChange}
            selectionMode={checklistSelectionMode}
            selectedItemIds={selectedChecklistItemIds ?? new Set<string>()}
            onSelectedItemIdsChange={onSelectedChecklistItemIdsChange ?? (() => {})}
            onVisibleItemIdsChange={onVisibleChecklistItemIdsChange}
            onCanEditChange={onChecklistCanEditChange}
            readOnly={readOnly}
            preview={packingPreview}
          />
        ) : null}

        {/* 行程 timeline */}
        {activeSeg === 'plan' ? <JourneyTimelineCard theme={theme} info={poi} readOnly={!isJourney || readOnly} preview={timelinePreview} availableDays={journeyDays} onGroupCollapseChange={animateDayPageCollapse} /> : null}
        {activeJourneyDay ? (
          <View
            onLayout={(event) => {
              timelineTopRef.current = event.nativeEvent.layout.y;
              scrollToPendingDay();
            }}
          >
            <JourneyTimelineCard
              theme={theme}
              info={poi}
              readOnly={readOnly}
              preview={timelinePreview}
              selectedDay={activeJourneyDay}
              showDayTabs={false}
              availableDays={journeyDays}
              selectionMode={timelineSelectionMode}
              selectedItemIds={selectedTimelineItemIds}
              onSelectedItemIdsChange={onSelectedTimelineItemIdsChange}
              onGroupLayout={(day, y) => {
                groupOffsetsRef.current.set(day, y);
                scrollToPendingDay();
              }}
              onGroupCollapseChange={animateDayPageCollapse}
            />
          </View>
        ) : null}

        {/* 瞬间 moments — a consistent two-column photo wall. */}
        {activeSeg === 'moments' ? (
          <View>
            {allPhotos.length > 0 ? (
              <MomentFilterBar
                theme={theme}
                surface={embeddedSurface}
                typeOptions={momentFilterOptions}
                selectedType={momentFilter}
                onSelectType={(kind) => {
                  setMomentViewerIndex(null);
                  setMomentFilter(kind);
                }}
                authors={momentAuthorOptions}
                selectedAuthor={momentAuthorFilter}
                onSelectAuthor={(author) => {
                  setMomentViewerIndex(null);
                  setMomentAuthorFilter(author);
                }}
                peopleAnchorRef={momentFilterAnchorRef}
                peopleLabel={t('journey.moments.filterParticipant')}
                onOpenPeople={() => {
                  const anchor = momentFilterAnchorRef.current;
                  if (!anchor) {
                    onMomentFilterMenuOpenChange?.(true);
                    return;
                  }
                  anchor.measureInWindow((x, y, width, height) => {
                    onMomentFilterMenuOpenChange?.(true, { x, y, width, height });
                  });
                }}
              />
            ) : null}
            {inspo.loading ? (
              <MomentsSkeleton theme={theme} />
            ) : allPhotos.length > 0 ? (
              <View style={{ gap: space.sm }}>
                {filteredPhotos.length > 0 ? (
                  Array.from({ length: Math.ceil(filteredPhotos.length / 2) }, (_, rowIndex) => {
                    const row = filteredPhotos.slice(rowIndex * 2, rowIndex * 2 + 2);
                    return (
                      <View key={row.map((moment) => moment.id).join('-')} style={{ flexDirection: 'row', gap: space.sm }}>
                        {row.map((moment, columnIndex) => (
                          <MomentPreview
                            key={moment.id}
                            theme={theme}
                            moment={moment}
                            seed={`${poi.id}-${moment.id}`}
                            surface={embeddedSurface}
                            selectionMode={momentSelectionMode}
                            selected={selectedMomentIds?.has(moment.id)}
                            selectable={!inspo.uploadingIds.has(moment.id)}
                            uploading={inspo.uploadingIds.has(moment.id)}
                            onToggle={() => {
                              const next = new Set(selectedMomentIds || []);
                              if (next.has(moment.id)) next.delete(moment.id);
                              else next.add(moment.id);
                              onSelectedMomentIdsChange?.(next);
                            }}
                            onOpen={() => setMomentViewerIndex(rowIndex * 2 + columnIndex)}
                          />
                        ))}
                        {row.length === 1 ? <View style={{ flex: 1 }} /> : null}
                      </View>
                    );
                  })
                ) : (
                  <View style={{ alignItems: 'center', paddingVertical: space.xxxl, gap: space.xxs }}>
                    <Text style={[type.caption, { color: theme.text2 }]}>{t('journey.moments.emptyFilter')}</Text>
                    <Press
                      onPress={clearMomentFilters}
                      accessibilityRole="button"
                      style={{ paddingVertical: space.xxs, paddingHorizontal: space.sm }}
                    >
                      <Text style={[type.body, { color: theme.accent, fontWeight: '700' }]}>{t('journey.moments.clearFilter')}</Text>
                    </Press>
                  </View>
                )}
              </View>
            ) : (
              <View
                style={{
                  alignItems: 'center',
                  paddingHorizontal: space.xl,
                  paddingVertical: space.xxxl,
                }}
              >
                <Icon name="photo" color={theme.text3} size={28} strokeWidth={1.65} />
                <Text style={[type.cardTitle, { color: theme.text, marginTop: space.lg }]}>{t('journey.empty.moments')}</Text>
                <Text style={[type.caption, { color: theme.text2, marginTop: space.xs, textAlign: 'center', lineHeight: 17 }]}>{t('journey.empty.momentsHint')}</Text>
              </View>
            )}
          </View>
        ) : null}

      </>
    );
  };

  const moreItems = [
    {
      label: t('journey.more.report'),
      destructive: true,
      onPress: () => nav.showToast(t('journey.toast.reported')),
    },
  ];

  const onShare = () => {
    nav.openSharePanel(poi);
  };

  const quickActions = readOnly ? null : (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <FloatingIconButton icon={Heart} fill={poi.fav ? theme.trailMine : 'none'} color={poi.fav ? theme.trailMine : '#fff'} onPress={() => nav.toggleFav()} />
      <FloatingIconButton icon={Share2} onPress={onShare} />
      <FloatingIconButton
        icon={isJourney && poi.mine ? Settings : MoreHorizontal}
        onPress={() => {
          if (isJourney && poi.mine) nav.openJourneySettings(poi);
          else nav.openActionSheet({ items: moreItems });
        }}
      />
    </View>
  );

  return (
    <View style={scrollContent ? { flex: 1, minHeight: 0 } : undefined}>
      <Animated.View
        onLayout={(event) => {
          fixedHeaderHeightRef.current = event.nativeEvent.layout.height;
          scrollToPendingDay();
        }}
        style={[
          { flexShrink: 0, zIndex: 10 },
          !scrollContent && detailScrollY
            ? {
                transform: [{ translateY: detailScrollY }],
                backgroundColor: embedded ? theme.featureSurface : theme.bg,
              }
            : null,
        ]}
      >
      {/* identity header — lives in the sheet so the map remains focused on the route */}
      {embedded ? (
        isJourney ? (
        <View style={{ paddingTop: space.xxs, paddingBottom: space.xs }}>
          <Text numberOfLines={2} style={[type.pageTitle, { color: theme.text, fontSize: 28, lineHeight: 34 }]}>
            {poi.name}
          </Text>
          <View style={{ marginTop: space.xxs, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.sm }}>
            <Press
              onPress={readOnly ? undefined : () => setTimePickerOpen(true)}
              accessibilityRole="button"
              accessibilityLabel={`${journeyTimingLabel} ${journeyTimingValue}`}
              style={{ minWidth: 0, maxWidth: '100%', minHeight: 40, flexShrink: 1, flexDirection: 'row', alignItems: 'center', gap: space.xs }}
            >
              <Icon name={hasSpecificJourneyDate ? 'calendar' : 'clock'} color={theme.text3} size={15} />
              <Text style={[type.body, { flexShrink: 1, color: theme.text2, fontWeight: '600' }]}>{journeyTimingValue}</Text>
            </Press>
            <Press
              onPress={readOnly ? undefined : () => setDistanceEditorOpen(true)}
              accessibilityRole="button"
              accessibilityLabel={`${t('journey.stat.distance')} ${poi.dist || '—'}`}
              style={{ minHeight: 40, maxWidth: 108, flexDirection: 'row', alignItems: 'center', gap: space.xs }}
            >
              <Icon name="distance" color={theme.text3} size={15} />
              <Text numberOfLines={1} style={[type.body, { color: theme.text2, fontWeight: '600' }]}>{poi.dist || '—'}</Text>
            </Press>
            <View style={{ marginLeft: 'auto' }}>
              <JourneyParticipantButton
              theme={theme}
              people={participantPeople}
              onOpenParticipants={() => nav.openManageCompanions(poi)}
              onInvite={() => {
                if (participantPeople.length >= MAX_JOURNEY_PARTICIPANTS) {
                  nav.showToast(t('journey.manage.participantLimitReached', { count: MAX_JOURNEY_PARTICIPANTS }));
                  return;
                }
                nav.openManageCompanions(poi, 'invite');
              }}
              inviteAtCapacity={participantPeople.length >= MAX_JOURNEY_PARTICIPANTS}
              participantsAccessibilityLabel={t('journey.manage.pageTitle')}
              inviteAccessibilityLabel={t('journey.manage.inviteParticipant')}
              readOnly={readOnly}
              />
            </View>
          </View>
        </View>
      ) : (
        <View style={{ paddingTop: space.xxs, paddingBottom: space.md }}>
          <Text style={[type.pageTitle, { color: theme.text }]}>{poi.name}</Text>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                marginTop: space.xs,
              }}
            >
              <Text style={[type.body, { color: theme.text2, flex: 1 }]} numberOfLines={1}>
                {poi.region}
              </Text>
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 7,
                  marginLeft: space.sm,
                }}
              >
              <Avatar ini={author.ini} color={author.color} size={22} />
                <Text style={[type.caption, { fontWeight: '600', color: theme.text2 }]} numberOfLines={1}>
                  {author.name}
                </Text>
            </View>
          </View>
        </View>
        )
      ) : null}
      {/* hero — skipped when embedded (the split detail shows the map above) */}
      {!embedded && (
        <View
          style={{
            marginHorizontal: fullBleed ? -10 : -16,
            marginTop: fullBleed ? 0 : -2,
            marginBottom: 16,
          }}
        >
        <View style={{ height: 224 }}>
            {poi.photoUris?.[0] ? <Image source={{ uri: poi.photoUris[0] }} contentFit="cover" style={StyleSheet.absoluteFill} /> : <View style={[StyleSheet.absoluteFill, { backgroundColor: theme.dark ? '#2c2c2e' : '#e5e5ea' }]} />}
          {nav.pointSource && (
            <Press
              onPress={() => nav.openPoint(nav.pointSource as Poi)}
              style={{
                position: 'absolute',
                top: 14,
                left: 14,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 5,
                paddingHorizontal: 11,
                height: 32,
                borderRadius: 16,
                backgroundColor: 'rgba(0,0,0,0.35)',
              }}
            >
              <Icon name="chevronL" color="#fff" size={15} />
              <Text style={{ color: '#fff', fontSize: 12.5, fontWeight: '600' }} numberOfLines={1}>
                {nav.pointSource.name}
              </Text>
            </Press>
          )}
            <View style={{ position: 'absolute', top: 14, right: 14 }}>{quickActions}</View>
          <View style={{ position: 'absolute', left: 16, right: 16, bottom: 16 }}>
              <Text
                style={{
                  color: '#fff',
                  fontSize: 26,
                  fontWeight: '800',
                  textShadowColor: 'rgba(0,0,0,0.4)',
                  textShadowRadius: 6,
                  textShadowOffset: { width: 0, height: 1 },
                }}
              >
              {poi.name}
            </Text>
              <Text
                style={{
                  color: 'rgba(255,255,255,0.86)',
                  fontSize: 13,
                  marginTop: 3,
                }}
              >
              {poi.region}
              {isJourney && journeyTimingValue !== '—' ? ' · ' + journeyTimingValue : ''}
            </Text>
          </View>
        </View>
      </View>
      )}

      {/* Journeys use one clear navigation level: 总览 + each DAY. */}
      {tabOptions.length > 1 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ marginHorizontal: -space.md }}
          contentContainerStyle={{
            paddingHorizontal: space.md,
            paddingTop: space.xxs,
            paddingBottom: space.md,
          }}
            >
          <Segmented
            variant="underline"
            size="compact"
            theme={theme}
            value={visualSeg}
            options={tabOptions}
            onChange={selectPagerSegment}
            animationDuration={180}
            stretch={false}
            trailingAction={
              isJourney && !readOnly
                ? {
                    content: <Icon name="plus" color={theme.text2} size={17} />,
                    onPress: () => addJourneyGroup(!planEditorOpen),
                    accessibilityLabel: t('journey.timeline.newGroup'),
                  }
                : undefined
            }
          />
        </ScrollView>
      ) : null}
      </Animated.View>

      {isJourney && !scrollContent ? (
        <ReAnimated.View
          onLayout={(event) => setPagerTop(Math.round(event.nativeEvent.layout.y))}
          style={[{ overflow: 'hidden', minHeight: pagerFillMinHeight }, pagerHeightStyle]}
        >
          {/* Rows here are page-wide: see PressDragGuardContext. */}
          <PressDragGuardContext.Provider value>
        <PagerView
          ref={pagerRef}
          style={{ flex: 1 }}
          initialPage={Math.max(0, tabOptions.findIndex((option) => option.id === seg))}
          scrollEnabled={!tabSwipeDisabled}
          offscreenPageLimit={1}
          overdrag={false}
          onPageScroll={(event) => {
            if (pendingPagerSegmentRef.current) return;
            const { position, offset } = event.nativeEvent;
            const visualIndex = Math.min(tabOptions.length - 1, position + (offset >= 0.5 ? 1 : 0));
            const visual = tabOptions[visualIndex];
            // Mount the neighbour as the swipe reveals it, so paging never shows
            // an empty page. setState bails out when the tab is already mounted.
            if (visual) mountTab(visual.id);
            if (visual && visual.id !== visualSegRef.current) {
              visualSegRef.current = visual.id;
              setVisualSeg(visual.id);
            }
          }}
          onPageSelected={(event) => {
            const next = tabOptions[event.nativeEvent.position];
            if (!next) return;
            const pendingSegment = pendingPagerSegmentRef.current;
            if (pendingSegment && next.id !== pendingSegment) return;
            pendingPagerSegmentRef.current = null;
            visualSegRef.current = next.id;
            setVisualSeg(next.id);
            if (next.id !== segRef.current) selectSegment(next.id);
          }}
        >
          {tabOptions.map((option) => (
            <View key={option.id} collapsable={false} style={{ width: '100%' }}>
              <View
                onLayout={(event) => {
                  const height = Math.ceil(event.nativeEvent.layout.height);
                  if (height <= 0 || dayCollapseAnimatingRef.current || (option.id === 'overview' && planOverviewAnimatingRef.current)) return;
                  if (option.id === 'overview') {
                    planOverviewCollapsedPagerHeightRef.current = planOverviewOpenRef.current
                      ? Math.max(1, height - planOverviewExtraHeight.value)
                      : height;
                  }
                  setTabPageHeights((current) => {
                    // Monotonic: the page is measured inside the very height this
                    // value sets, so a measurement taken while the container is
                    // short is a clamped number, not the content's height.
                    // Returning it used to park the container at 18pt and re-measure
                    // as 179, forever (18 ↔ 179 at ~250 cycles/2s).
                    const previous = current[option.id] ?? 0;
                    if (height <= previous) return current;
                    return { ...current, [option.id]: height };
                  });
                }}
              >
                <SelectedPoiContent
                  scrollable={false}
                  scrollRef={contentScrollRef}
                  scrollY={contentScrollY}
                  bottomPadding={scrollContentBottomPadding}
                  onLayout={(y) => {
                    if (option.id !== segRef.current) return;
                    contentTopRef.current = y;
                    scrollToPendingDay();
                  }}
                >
                  {mountedTabs.has(option.id) ? renderTabContent(option.id) : null}
                </SelectedPoiContent>
              </View>
            </View>
          ))}
        </PagerView>
          </PressDragGuardContext.Provider>
        </ReAnimated.View>
      ) : (
        <SelectedPoiContent
          scrollable={scrollContent}
          scrollRef={contentScrollRef}
          scrollY={contentScrollY}
          bottomPadding={scrollContentBottomPadding}
          onLayout={(y) => {
            contentTopRef.current = y;
            scrollToPendingDay();
          }}
        >
          {renderTabContent(seg)}
        </SelectedPoiContent>
      )}

      {momentViewerIndex != null ? (
        <MediaViewer
          theme={theme}
          media={filteredPhotos.map((moment) => ({
            tone: moment.tone,
            uri: moment.uri,
            thumb: moment.thumbnail,
            video: moment.kind === 'video' || undefined,
            livePhoto: moment.kind === 'livePhoto' || undefined,
            pairedVideoUri: moment.pairedVideoUri,
            caption: moment.caption,
            createdAt: moment.createdAt,
            author: moment.author,
          }))}
          index={momentViewerIndex}
          onClose={() => setMomentViewerIndex(null)}
          onDelete={readOnly ? undefined : (index) => {
            const moment = filteredPhotos[index];
            if (!moment) return;
            Alert.alert(
              t('common.delete'),
              t('journey.media.deleteConfirm'),
              [
                { text: t('common.cancel'), style: 'cancel' },
                {
                  text: t('common.delete'),
                  style: 'destructive',
                  onPress: () => {
                    void deleteMoments(new Set([moment.id]));
                    setMomentViewerIndex(null);
                  },
                },
              ],
            );
          }}
        />
      ) : null}
      {!readOnly && renamingPlanDay ? (
        <JourneyGroupRenameSheet
          theme={theme}
          initialName={journeyDayDisplayLabel(renamingPlanDay, resolved)}
          onClose={() => setRenamingPlanDay(null)}
          onSave={(name) => {
            const current = renamingPlanDay;
            setRenamingPlanDay(null);
            if (!current || name === journeyDayDisplayLabel(current, resolved)) return;
            void timeline.renameGroup(current, name);
            if (seg === `day:${current}`) setSeg(`day:${name}`);
            if (selectedPlanDays.has(current)) {
              const next = new Set(selectedPlanDays);
              next.delete(current);
              next.add(name);
              setSelectedPlanDays(next);
            }
          }}
        />
      ) : null}
      {!readOnly && timePickerOpen ? <JourneyTimePicker theme={theme} poi={poi} onApply={(patch) => nav.patchCurrent(patch)} onClose={() => setTimePickerOpen(false)} /> : null}
      {!readOnly && distanceEditorOpen ? (
        <JourneyDistanceSheet
          theme={theme}
          initialValue={poi.dist}
          onSave={(dist) => nav.patchCurrent({ dist })}
          onClose={() => setDistanceEditorOpen(false)}
        />
      ) : null}
      {!readOnly && trackUploadOpen ? <JourneyTrackUploadSheet theme={theme} replacing={hasTrack} onClose={() => setTrackUploadOpen(false)} /> : null}
      <PickDialog
        theme={theme}
        visible={!readOnly && trackPickOpen}
        title={t('journey.track.pickTitle')}
        emptyLabel={t('journey.track.pickEmpty')}
        cancelLabel={t('common.cancel')}
        options={tracks.map((track) => ({
          item: track,
          title: track.name || t('tracks.untitled'),
          subtitle: [
            track.distM != null ? formatTrackDistance(track.distM) : null,
            track.ascM ? formatTrackAscent(track.ascM) : null,
            track.pointCount ? t('tracks.meta.points', { count: track.pointCount }) : null,
          ].filter(Boolean).join(' · '),
          selected: track.id === poi.trackId,
        }))}
        onCancel={() => setTrackPickOpen(false)}
        onSelect={(track) => {
          setTrackPickOpen(false);
          if (track.id === poi.trackId) return;
          // The journey's distance and ascent describe the track it follows, so
          // linking one overwrites them with the numbers the file actually holds.
          nav.patchCurrent({
            trackId: track.id,
            ...(track.distM != null ? { dist: formatTrackDistance(track.distM) } : {}),
            ...(track.ascM != null ? { asc: formatTrackAscent(track.ascM) } : {}),
          });
          nav.showToast(t('journey.track.applied'));
        }}
      />
    </View>
  );
}
