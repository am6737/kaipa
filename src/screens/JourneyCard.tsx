// JourneyCard.tsx — SelectedPoiCard: the rich detail body for a route or journey,
// shown inside the discover sheet's in-place journey detail panel.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Animated, View, Text, TextInput, StyleSheet, ScrollView, Modal, Pressable } from 'react-native';
import PagerView from 'react-native-pager-view';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import * as VideoThumbnails from 'expo-video-thumbnails';
import { MONO } from '../theme/fonts';
import { Theme } from '../theme/theme';
import { Poi, type Companion } from '../data/pois';
import { TLRow } from '../data/timeline';
import { JourneyTimelineCard, MediaViewer } from '../components/overlays/JourneyTimeline';
import { PhotoTile } from '../components/PhotoTile';
import { Avatar } from '../components/Avatar';
import { Icon, IconName } from '../components/Icon';
import { Press } from '../components/Press';
import { Segmented } from '../components/Segmented';
import { useNav } from '../nav/NavContext';
import { useInspo } from '../hooks/useInspo';
import { useTimeline } from '../hooks/useTimeline';
import { useData } from '../data/DataContext';
import { genPhotos } from '../components/overlays/PhotoWall';
import { useI18n, TKey, ResolvedLang } from '../i18n';
import { NJBottomSheet, NJMiniCalendar, NJWheelPicker, njFormatTime } from '../components/overlays/NewJourneyParts';
import { ElevationStrip } from '../components/overlays/ElevationStrip';
import { JourneyTrackUploadSheet } from '../components/overlays/JourneyTrackUploadSheet';
import { ParticipantAvatar } from '../components/overlays/ParticipantAvatar';
import { JourneyChecklistTab } from '../components/journey/JourneyChecklistTab';
import { AppCard, AppSectionHeader, radius, space, type } from '../design-system';
import { Glass } from '../components/Glass';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

function SectionHeader({ theme, title, action, onAction }: { theme: Theme; title: string; action?: string; onAction?: () => void }) {
  const trailing = action ? (
    <Press onPress={onAction} style={{ paddingVertical: space.xxs }}>
      <Text style={[type.body, { fontWeight: '600', color: theme.accent }]}>{action}</Text>
    </Press>
  ) : undefined;
  return <AppSectionHeader theme={theme} text={title} trailing={trailing} variant="title" marginTop={0} />;
}

function FloatingIconButton({ name, onPress, color }: { name: IconName; onPress?: () => void; color?: string }) {
  return (
    <Press
      onPress={onPress}
      style={{
        width: 38,
        height: 38,
        borderRadius: 19,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(0,0,0,0.36)',
      }}
    >
      <Icon name={name} color={color || '#fff'} size={20} />
    </Press>
  );
}

function JourneyParticipantButton({
  theme,
  people,
  onPress,
  accessibilityLabel,
}: {
  theme: Theme;
  people: { ini: string; color?: string; tone?: string; avatarUrl?: string }[];
  onPress: () => void;
  accessibilityLabel: string;
}) {
  const self = people[0] || { ini: '?' };
  const hasOtherParticipants = people.length > 1;

  return (
    <Press
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      hitSlop={8}
      style={{ width: 56, height: 40, alignItems: 'flex-end', justifyContent: 'center' }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingRight: 1 }}>
        <ParticipantAvatar
          theme={theme}
          uri={self.avatarUrl}
          size={34}
          ring
          ringColor={theme.featureSurface}
        />
        <View
          style={{
            width: 30,
            height: 30,
            marginLeft: -10,
            borderRadius: 15,
            borderWidth: 2,
            borderColor: theme.featureSurface,
            backgroundColor: theme.controlSurface,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon
            name={hasOtherParticipants ? 'more' : 'plus'}
            color={theme.text2}
            size={hasOtherParticipants ? 16 : 14}
            strokeWidth={2.2}
          />
        </View>
      </View>
    </Press>
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
type MomentFilter = 'all' | 'photo' | 'video' | 'livePhoto';
type MomentAuthorOption = {
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

function MomentFilterMenu({
  theme,
  visible,
  typeTitle,
  participantTitle,
  allParticipantsLabel,
  hostLabel,
  selfLabel,
  selectedType,
  selectedAuthor,
  typeOptions,
  authors,
  onSelectType,
  onSelectAuthor,
  onClose,
}: {
  theme: Theme;
  visible: boolean;
  typeTitle: string;
  participantTitle: string;
  allParticipantsLabel: string;
  hostLabel: string;
  selfLabel: string;
  selectedType: MomentFilter;
  selectedAuthor: string | null;
  typeOptions: { id: MomentFilter; label: string; icon: IconName }[];
  authors: MomentAuthorOption[];
  onSelectType: (filter: MomentFilter) => void;
  onSelectAuthor: (author: string | null) => void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} transparent statusBarTranslucent animationType="fade" onRequestClose={onClose}>
      <View style={StyleSheet.absoluteFill}>
        <Pressable onPress={onClose} style={StyleSheet.absoluteFill} />
        <View
          style={{
            position: 'absolute',
            right: space.lg,
            bottom: Math.max(insets.bottom, space.md) + 68,
            width: 240,
            maxHeight: 380,
            borderRadius: radius.feature,
            shadowColor: '#000000',
            shadowOpacity: theme.dark ? 0.42 : 0.16,
            shadowRadius: 24,
            shadowOffset: { width: 0, height: 12 },
            elevation: 12,
          }}
        >
          <Glass theme={theme} radius={radius.feature} intensity={78}>
            <View
              style={{
                maxHeight: '100%',
                paddingVertical: space.sm,
                backgroundColor: theme.dark ? 'rgba(32,32,35,0.64)' : 'rgba(255,255,255,0.74)',
              }}
            >
              <ScrollView showsVerticalScrollIndicator={false} nestedScrollEnabled>
                <Text style={[type.caption, { paddingHorizontal: space.md, paddingTop: space.xxs, paddingBottom: space.xs, color: theme.text2, fontWeight: '600' }]}>
                  {typeTitle}
                </Text>
                {typeOptions.map((option) => {
                  const isSelected = selectedType === option.id;
                  return (
                    <Press
                      key={option.id}
                      onPress={() => onSelectType(option.id)}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: isSelected }}
                      style={{ minHeight: 48, paddingHorizontal: space.md, flexDirection: 'row', alignItems: 'center', gap: space.sm }}
                    >
                      <View style={{ width: 30, height: 30, borderRadius: radius.control, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.fieldSurface }}>
                        <Icon name={option.icon} color={theme.text2} size={15} />
                      </View>
                      <Text numberOfLines={1} style={[type.body, { flex: 1, color: theme.text, fontWeight: isSelected ? '700' : '500' }]}>{option.label}</Text>
                      {isSelected ? <Icon name="check" color={theme.accent} size={16} strokeWidth={2.4} /> : null}
                    </Press>
                  );
                })}

                <Text style={[type.caption, { paddingHorizontal: space.md, paddingTop: space.md, paddingBottom: space.xs, color: theme.text2, fontWeight: '600' }]}>
                  {participantTitle}
                </Text>
                <Press
                  onPress={() => onSelectAuthor(null)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: selectedAuthor == null }}
                  style={{ minHeight: 48, paddingHorizontal: space.md, flexDirection: 'row', alignItems: 'center', gap: space.sm }}
                >
                  <View style={{ width: 30, height: 30, borderRadius: radius.control, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.fieldSurface }}>
                    <Icon name="people" color={theme.text2} size={15} />
                  </View>
                  <Text numberOfLines={1} style={[type.body, { flex: 1, color: theme.text, fontWeight: selectedAuthor == null ? '700' : '500' }]}>{allParticipantsLabel}</Text>
                  {selectedAuthor == null ? <Icon name="check" color={theme.accent} size={16} strokeWidth={2.4} /> : null}
                </Press>
                {authors.map((author) => {
                  const isSelected = selectedAuthor === author.key;
                  return (
                    <Press
                      key={author.key}
                      onPress={author.count > 0 ? () => onSelectAuthor(author.key) : undefined}
                      disabled={author.count === 0}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: isSelected, disabled: author.count === 0 }}
                      style={{ minHeight: 58, paddingHorizontal: space.md, flexDirection: 'row', alignItems: 'center', gap: space.sm, opacity: author.count > 0 ? 1 : 0.5 }}
                    >
                      <Avatar uri={author.avatarUrl} size={32} />
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.xxs }}>
                          <Text numberOfLines={1} style={[type.body, { flexShrink: 1, color: theme.text, fontWeight: isSelected ? '700' : '500' }]}>{author.name}</Text>
                          {author.host ? (
                            <View style={{ paddingHorizontal: 5, paddingVertical: 2, borderRadius: radius.pill, backgroundColor: theme.accentSofter }}>
                              <Text style={{ fontSize: 9, fontWeight: '700', color: theme.accent }}>{hostLabel}</Text>
                            </View>
                          ) : null}
                          {author.self ? (
                            <View style={{ paddingHorizontal: 5, paddingVertical: 2, borderRadius: radius.pill, backgroundColor: theme.fieldSurface }}>
                              <Text style={{ fontSize: 9, fontWeight: '700', color: theme.text2 }}>{selfLabel}</Text>
                            </View>
                          ) : null}
                        </View>
                        {author.countLabel ? (
                          <Text style={[type.caption, { color: theme.text3, marginTop: 2 }]}>{author.countLabel}</Text>
                        ) : null}
                      </View>
                      {isSelected ? <Icon name="check" color={theme.accent} size={16} strokeWidth={2.4} /> : null}
                    </Press>
                  );
                })}
              </ScrollView>
            </View>
          </Glass>
        </View>
      </View>
    </Modal>
  );
}

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

function MomentPreview({
  theme,
  moment,
  seed,
  surface,
  selectionMode = false,
  selected = false,
  selectable = true,
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
  onToggle?: () => void;
  onOpen?: () => void;
}) {
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
      onPress={selectionMode ? (selectable ? onToggle : undefined) : onOpen}
      disabled={selectionMode && !selectable}
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
  return `${d.getMonth() + 1} 月 ${d.getDate()} 日 ${njFormatTime(d)}`;
}

function chineseNumber(value: number): string {
  if (value <= 0 || value > 99) return String(value);
  const digits = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
  if (value < 10) return digits[value];
  const tens = Math.floor(value / 10);
  const ones = value % 10;
  return `${tens === 1 ? '' : digits[tens]}十${ones ? digits[ones] : ''}`;
}

function defaultJourneyDayLabel(index: number, resolved: ResolvedLang, t: ReturnType<typeof useI18n>['t']): string {
  return t('journey.timeline.defaultDay', {
    n: resolved === 'zh' ? chineseNumber(index) : index,
  });
}

function journeyDayOrdinal(label: string, resolved: ResolvedLang, t: ReturnType<typeof useI18n>['t']): number | undefined {
  const english = label.trim().match(/^day\s*(\d+)$/i);
  if (english) return Number(english[1]);
  for (let index = 1; index <= 99; index += 1) {
    if (label.trim() === defaultJourneyDayLabel(index, resolved, t)) return index;
  }
  return undefined;
}

function journeyDayDisplayLabel(label: string, resolved: ResolvedLang, t: ReturnType<typeof useI18n>['t']): string {
  const english = label.trim().match(/^day\s*(\d+)$/i);
  return english ? defaultJourneyDayLabel(Number(english[1]), resolved, t) : label;
}

export function nextJourneyDayLabel(labels: string[], resolved: ResolvedLang, t: ReturnType<typeof useI18n>['t']): string {
  const usedOrdinals = new Set(labels.map((label) => journeyDayOrdinal(label, resolved, t)).filter((value): value is number => value != null));
  let index = 1;
  while (usedOrdinals.has(index)) index += 1;
  return defaultJourneyDayLabel(index, resolved, t);
}

function JourneyTimePicker({ theme, poi, onApply, onClose }: { theme: Theme; poi: Poi; onApply: (patch: Partial<Poi>) => void; onClose: () => void }) {
  const { t } = useI18n();
  const [draftStart, setDraftStart] = useState(() => parseJourneyStart(poi));
  const [draftEnd, setDraftEnd] = useState(() => addMinutes(parseJourneyStart(poi), parseJourneyDurationMins(poi)));
  const [active, setActive] = useState<'start' | 'end'>('start');
  const activeDt = active === 'start' ? draftStart : draftEnd;
  const durationMins = Math.max(30, Math.round((draftEnd.getTime() - draftStart.getTime()) / 60000));

  const setActiveDt = (next: Date) => {
    if (active === 'start') {
      const oldDur = durationMins;
      setDraftStart(next);
      setDraftEnd((end) => (end <= next ? addMinutes(next, oldDur) : end));
    } else {
      setDraftEnd(next <= draftStart ? addMinutes(draftStart, 30) : next);
    }
  };
  const selectDate = (date: Date) => {
    const next = new Date(date);
    next.setHours(activeDt.getHours(), activeDt.getMinutes(), 0, 0);
    setActiveDt(next);
  };
  const selectTime = (mins: number) => {
    const next = new Date(activeDt);
    next.setHours(Math.floor(mins / 60), mins % 60, 0, 0);
    setActiveDt(next);
  };
  const setDuration = (mins: number) => setDraftEnd(addMinutes(draftStart, mins));
  const apply = () => {
    const dur = Math.max(30, Math.round((draftEnd.getTime() - draftStart.getTime()) / 60000));
    const totalDays = Math.max(1, Math.ceil(dur / (24 * 60)));
    onApply({
      date: compactDate(draftStart),
      plannedDate: compactPlannedDate(draftStart),
      days: detailDurationLabel(dur),
      totalDays,
      trackDurationMs: dur * 60000,
    });
    onClose();
  };
  const Tab = ({ k, label, dt }: { k: 'start' | 'end'; label: string; dt: Date }) => {
    const on = active === k;
    return (
      <Press
        onPress={() => setActive(k)}
        style={{
          flex: 1,
          paddingVertical: 8,
          paddingHorizontal: 10,
          borderRadius: 12,
          backgroundColor: on ? theme.bg : 'transparent',
          alignItems: 'center',
        }}
      >
        <Text
          style={{
            fontSize: 10.5,
            fontWeight: '700',
            color: on ? theme.text2 : theme.text3,
            letterSpacing: 0.6,
            textTransform: 'uppercase',
          }}
        >
          {label}
        </Text>
        <Text
          style={{
            fontSize: 15,
            fontWeight: '700',
            color: on ? theme.accent : theme.text2,
            marginTop: 2,
            letterSpacing: -0.2,
          }}
        >{`${dt.getMonth() + 1}/${dt.getDate()} · ${njFormatTime(dt)}`}</Text>
      </Press>
    );
  };
  const quick = [6 * 60, 12 * 60, 24 * 60, 2 * 24 * 60, 3 * 24 * 60, 5 * 24 * 60, 7 * 24 * 60];
  return (
    <Modal transparent visible animationType="none" onRequestClose={onClose}>
      <NJBottomSheet theme={theme} onClose={onClose} full bodyScrolls>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 16 }}>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              marginBottom: 12,
              paddingHorizontal: 2,
            }}
          >
          <Press onPress={onClose} style={{ padding: 4 }}>
              <Text
                style={{
                  fontSize: 14.5,
                  color: theme.text2,
                  fontWeight: '500',
                }}
              >
                {t('common.cancel')}
              </Text>
          </Press>
          <View style={{ flex: 1, alignItems: 'center' }}>
              <Text
                style={{
                  fontSize: 16,
                  fontWeight: '700',
                  color: theme.text,
                  letterSpacing: -0.2,
                }}
              >
                修改时间
              </Text>
            <Text style={{ fontSize: 11, color: theme.text3, marginTop: 2 }}>{detailDurationLabel(durationMins)}</Text>
          </View>
          <Press onPress={apply} style={{ padding: 4 }}>
              <Text
                style={{
                  fontSize: 14.5,
                  color: theme.accent,
                  fontWeight: '700',
                }}
              >
                {t('common.done')}
              </Text>
          </Press>
        </View>

          <View
            style={{
              flexDirection: 'row',
              gap: 4,
              padding: 4,
              marginBottom: 14,
              borderRadius: 14,
              backgroundColor: theme.dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)',
            }}
          >
          <Tab k="start" label="开始" dt={draftStart} />
          <Tab k="end" label="结束" dt={draftEnd} />
        </View>

        <View style={{ marginBottom: 12 }}>
          <NJMiniCalendar theme={theme} selectedDate={activeDt} onSelect={selectDate} allowPast />
        </View>
        <View style={{ alignItems: 'center', marginBottom: 6 }}>
            <Text
              style={{
                fontSize: 10.5,
                fontWeight: '700',
                color: theme.text2,
                letterSpacing: 0.6,
                textTransform: 'uppercase',
              }}
            >
              {active === 'start' ? '开始时间' : '结束时间'}
            </Text>
        </View>
        <NJWheelPicker theme={theme} value={activeDt.getHours() * 60 + activeDt.getMinutes()} onChange={selectTime} />

        <View style={{ marginTop: 14 }}>
            <Text
              style={{
                fontSize: 10.5,
                fontWeight: '700',
                color: theme.text2,
                letterSpacing: 0.6,
                textTransform: 'uppercase',
                marginBottom: 8,
              }}
            >
              快速时长
            </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {quick.map((mins) => {
              const on = Math.abs(durationMins - mins) < 1;
              return (
                <Press
                  key={mins}
                  onPress={() => setDuration(mins)}
                  style={{
                    height: 32,
                    paddingHorizontal: 14,
                    borderRadius: 16,
                    backgroundColor: on ? theme.accent : theme.dark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)',
                    borderWidth: StyleSheet.hairlineWidth,
                    borderColor: on ? theme.accent : theme.hairline,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                    <Text
                      style={{
                        fontSize: 12.5,
                        fontWeight: '600',
                        color: on ? '#fff' : theme.text,
                      }}
                    >
                      {detailDurationLabel(mins)}
                    </Text>
                </Press>
              );
            })}
          </View>
        </View>
      </ScrollView>
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

function JourneyPlanEditContent({ theme, days, rows, selectedDays, onToggleDay, onEditDate, onRenameDay, getDayLabel }: { theme: Theme; days: string[]; rows: TLRow[]; selectedDays: Set<string>; onToggleDay: (day: string) => void; onEditDate: () => void; onRenameDay: (day: string) => void; getDayLabel: (day: string) => string }) {
  const { t } = useI18n();

  return (
    <View style={{ paddingHorizontal: space.md, paddingBottom: space.lg }}>
      <Press
        onPress={onEditDate}
        style={{
          alignSelf: 'flex-start',
          height: 44,
          paddingHorizontal: space.md,
          borderRadius: radius.pill,
          flexDirection: 'row',
          alignItems: 'center',
          gap: space.xs,
          backgroundColor: theme.fieldSurface,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: theme.fieldBorder,
        }}
      >
        <Icon name="calendar" color={theme.text2} size={16} />
        <Text style={[type.body, { color: theme.text2, fontWeight: '600' }]}>{t('journey.timeline.changeDate')}</Text>
      </Press>

      <View style={{ marginTop: space.md, gap: space.sm }}>
        {days.map((day) => {
          const dayRows = rows.filter((row) => row.day === day);
          const selected = selectedDays.has(day);
          return (
            <View
              key={day}
              style={{
                minHeight: 96,
                padding: space.md,
                borderRadius: radius.feature,
                backgroundColor: selected ? theme.accentSofter : theme.fieldSurface,
                borderWidth: selected ? 1.5 : StyleSheet.hairlineWidth,
                borderColor: selected ? theme.accent : theme.fieldBorder,
              }}
            >
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'flex-start',
                  gap: space.xs,
                }}
              >
                <Press
              onPress={() => onToggleDay(day)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: selected }}
                  style={{
                    flex: 1,
                    minWidth: 0,
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
                      borderColor: selected ? theme.accent : theme.fieldBorder,
                      backgroundColor: selected ? theme.accent : 'transparent',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
            >
                  {selected ? <Icon name="check" color="#FFFFFF" size={13} strokeWidth={3} /> : null}
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                    <View style={{ height: 32, justifyContent: 'center' }}>
                      <Text style={[type.sectionTitle, { color: theme.text }]}>{getDayLabel(day)}</Text>
                    </View>
                    {dayRows.length ? (
                      <Text
                        numberOfLines={3}
                        style={[
                          type.body,
                          {
                            color: theme.text2,
                            marginTop: space.xxs,
                            lineHeight: 21,
                          },
                        ]}
                      >
                        {dayRows
                          .slice(0, 3)
                          .map((row) => row.title)
                          .join(' → ')}
                  </Text>
                    ) : null}
                </View>
                </Press>
                <Press
                  onPress={() => onRenameDay(day)}
                  accessibilityRole="button"
                  accessibilityLabel={t('journey.timeline.renameGroup')}
                  style={{
                    width: 42,
                    height: 32,
                    borderRadius: radius.pill,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: theme.controlSurface,
                    borderWidth: StyleSheet.hairlineWidth,
                    borderColor: theme.fieldBorder,
                    boxShadow: theme.dark ? '0px 3px 10px rgba(0,0,0,0.34)' : '0px 3px 10px rgba(0,0,0,0.07)',
                  }}
                >
                  <Icon name="edit" color={theme.text2} size={14} />
                </Press>
                </View>
              </View>
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
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: false })}
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

export function SelectedPoiCard({ theme, poi, fullBleed, embedded, onTrackSelectionChange, planEditorOpen: controlledPlanEditorOpen, onPlanEditorOpenChange, selectedPlanDays: controlledSelectedPlanDays, onSelectedPlanDaysChange, externalPlanEditorControls = false, onSelectedJourneyDayChange, onSelectedTabChange, momentAddActionRef, momentDeleteActionRef, momentFilterActionRef, onMomentFilterStateChange, checklistAddActionRef, checklistDeleteActionRef, checklistFilterActionRef, onChecklistFilterStateChange, checklistSelectionMode = false, selectedChecklistItemIds, onSelectedChecklistItemIdsChange, onVisibleChecklistItemIdsChange, onChecklistCanEditChange, momentSelectionMode = false, selectedMomentIds, onSelectedMomentIdsChange, onVisibleMomentIdsChange, onJourneyDaysChange, timelineSelectionMode = false, selectedTimelineItemIds, onSelectedTimelineItemIdsChange, detailScrollY, onRequestDetailScroll, scrollContent = false, scrollContentBottomPadding = 18 }: { theme: Theme; poi: Poi; fullBleed?: boolean; embedded?: boolean; onTrackSelectionChange?: (index: number | null, coord?: [number, number]) => void; planEditorOpen?: boolean; onPlanEditorOpenChange?: (open: boolean) => void; selectedPlanDays?: Set<string>; onSelectedPlanDaysChange?: (days: Set<string>) => void; externalPlanEditorControls?: boolean; onSelectedJourneyDayChange?: (day?: string) => void; onSelectedTabChange?: (tab: TabId) => void; momentAddActionRef?: React.MutableRefObject<(() => void) | null>; momentDeleteActionRef?: React.MutableRefObject<(() => Promise<void>) | null>; momentFilterActionRef?: React.MutableRefObject<(() => void) | null>; onMomentFilterStateChange?: (label: string, active: boolean) => void; checklistAddActionRef?: React.MutableRefObject<(() => void) | null>; checklistDeleteActionRef?: React.MutableRefObject<(() => Promise<void>) | null>; checklistFilterActionRef?: React.MutableRefObject<(() => void) | null>; onChecklistFilterStateChange?: (label: string, active: boolean) => void; checklistSelectionMode?: boolean; selectedChecklistItemIds?: Set<string>; onSelectedChecklistItemIdsChange?: (ids: Set<string>) => void; onVisibleChecklistItemIdsChange?: (ids: string[]) => void; onChecklistCanEditChange?: (canEdit: boolean) => void; momentSelectionMode?: boolean; selectedMomentIds?: Set<string>; onSelectedMomentIdsChange?: (ids: Set<string>) => void; onVisibleMomentIdsChange?: (ids: string[]) => void; onJourneyDaysChange?: (days: string[]) => void; timelineSelectionMode?: boolean; selectedTimelineItemIds?: Set<string>; onSelectedTimelineItemIdsChange?: (ids: Set<string>) => void; detailScrollY?: Animated.Value; onRequestDetailScroll?: (y: number) => void; scrollContent?: boolean; scrollContentBottomPadding?: number }) {
  const nav = useNav();
  const { t, resolved } = useI18n();
  const { userId, profile, sets, items: gearItems, cats: gearCategories } = useData();
  const isJourney = poi.kind === 'journey';
  const isMine = isJourney;
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

  const inspo = useInspo(poi.id, userId);
  const [libraryPermission, requestLibraryPermission] = ImagePicker.useMediaLibraryPermissions();
  const [processingMoments, setProcessingMoments] = useState(false);
  const [momentViewerIndex, setMomentViewerIndex] = useState<number | null>(null);
  const [momentFilter, setMomentFilter] = useState<MomentFilter>('all');
  const [momentAuthorFilter, setMomentAuthorFilter] = useState<string | null>(null);
  const [momentFilterOpen, setMomentFilterOpen] = useState(false);
  const timeline = useTimeline(isJourney ? poi.id : undefined, isJourney ? userId : undefined);

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
    const removedOrdinals = new Set(timeline.removedGroups.map((label) => journeyDayOrdinal(label, resolved, t)).filter((value): value is number => value != null));
    const labels = new Set<string>();
    timeline.knownGroups.forEach((label) => {
      const next = label.trim();
      if (next && !removed.has(next)) labels.add(next);
    });
    timeline.rows.forEach((row) => {
      const next = row.day.trim();
      if (next && !removed.has(next)) labels.add(next);
    });
    const usedOrdinals = new Set([...labels].map((label) => journeyDayOrdinal(label, resolved, t)).filter((value): value is number => value != null));
    const total = Math.max(1, poi.totalDays || Number.parseInt(poi.days || '', 10) || 1);
    for (let day = 1; day <= total; day += 1) {
      if (!usedOrdinals.has(day) && !removedOrdinals.has(day)) labels.add(defaultJourneyDayLabel(day, resolved, t));
    }
    return [...labels].sort((a, b) => {
      const ai = journeyDayOrdinal(a, resolved, t) ?? Number.POSITIVE_INFINITY;
      const bi = journeyDayOrdinal(b, resolved, t) ?? Number.POSITIVE_INFINITY;
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
            author: momentAuthor,
            tone: poi.tone || 'ridge',
            ratio: 1,
          }))
        : [],
    [inspo.media, poi.tone, isJourney, poi.routeShowPhotos, momentAuthor],
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
  const filteredPhotos = allPhotos.filter((moment) => {
    const typeMatches = momentFilter === 'all'
      || (momentFilter === 'photo' && moment.kind !== 'video' && moment.kind !== 'livePhoto')
      || moment.kind === momentFilter;
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
  const momentFilterOptions: { id: MomentFilter; label: string; icon: IconName }[] = [
    { id: 'all', label: t('common.all'), icon: 'grid' },
    { id: 'photo', label: t('journey.moments.filterPhotos'), icon: 'photo' },
    { id: 'video', label: t('journey.moments.filterVideos'), icon: 'play' },
    { id: 'livePhoto', label: t('journey.moments.filterLivePhotos'), icon: 'livePhoto' },
  ];
  useEffect(() => {
    if (momentAuthorFilter && !momentAuthorOptions.some((author) => author.key === momentAuthorFilter)) {
      setMomentAuthorFilter(null);
    }
  }, [momentAuthorFilter, momentAuthorOptions]);
  const selectedTypeLabel = momentFilterOptions.find((option) => option.id === momentFilter)?.label || t('common.all');
  const selectedAuthorLabel = momentAuthorOptions.find((author) => author.key === momentAuthorFilter)?.name;
  const activeMomentFilterCount = Number(momentFilter !== 'all') + Number(Boolean(momentAuthorFilter));
  const momentFilterLabel = activeMomentFilterCount > 1
    ? t('journey.moments.filterCount', { count: activeMomentFilterCount })
    : selectedAuthorLabel || selectedTypeLabel;
  if (momentFilterActionRef) momentFilterActionRef.current = () => setMomentFilterOpen(true);
  useEffect(() => {
    onMomentFilterStateChange?.(momentFilterLabel, activeMomentFilterCount > 0);
  }, [activeMomentFilterCount, momentFilterLabel, onMomentFilterStateChange]);
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
          label: journeyDayDisplayLabel(day, resolved, t),
        })),
      ];
    }
    const opts: { id: TabId; label: string }[] = [{ id: 'overview', label: t('journey.tab.overview') }];
    if (poi.routeShowTimeline !== false) opts.push({ id: 'plan', label: t('journey.tab.plan') });
    if (poi.routeShowPhotos !== false && allPhotos.length > 0) opts.push({ id: 'moments', label: t('journey.moments.userPhotos') });
    return opts;
  }, [isJourney, journeyDays, poi.routeShowTimeline, poi.routeShowPhotos, allPhotos.length, resolved, t]);
  const [seg, setSeg] = useState<TabId>('overview');
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
  const [internalSelectedPlanDays, setInternalSelectedPlanDays] = useState<Set<string>>(() => new Set());
  const planEditorOpen = controlledPlanEditorOpen ?? internalPlanEditorOpen;
  const selectedPlanDays = controlledSelectedPlanDays ?? internalSelectedPlanDays;
  const setPlanEditorOpen = (open: boolean) => (onPlanEditorOpenChange ? onPlanEditorOpenChange(open) : setInternalPlanEditorOpen(open));
  const setSelectedPlanDays = (days: Set<string>) => (onSelectedPlanDaysChange ? onSelectedPlanDaysChange(days) : setInternalSelectedPlanDays(days));
  const [timePickerOpen, setTimePickerOpen] = useState(false);
  const [trackUploadOpen, setTrackUploadOpen] = useState(false);
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
          label: t('journey.stat.date'),
          value: poi.plannedDate || poi.date || '—',
        },
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
  }, [isJourney, elevationSummary, poi.plannedDate, poi.date, poi.companionList, poi.companions, poi.rating, poi.reviews, poi.dist, poi.asc, poi.trackDurationMs, allPhotos.length, t]);
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
  const [tabPageHeights, setTabPageHeights] = useState<Record<string, number>>({});
  const activePagerHeight = tabPageHeights[seg] || 600;

  const selectPagerSegment = (value: TabId) => {
    const index = tabOptions.findIndex((option) => option.id === value);
    if (index < 0) return;
    visualSegRef.current = value;
    setVisualSeg(value);
    selectSegment(value);
    pagerRef.current?.setPage(index);
  };

  const tabSwipeDisabled = !isJourney
    || tabOptions.length < 2
    || planEditorOpen
    || checklistSelectionMode
    || momentSelectionMode
    || timelineSelectionMode
    || momentViewerIndex != null
    || momentFilterOpen
    || renamingPlanDay != null
    || timePickerOpen
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
                  <JourneyPlanEditContent theme={theme} days={journeyDays} rows={timeline.rows} selectedDays={selectedPlanDays} onToggleDay={toggleSelectedPlanDay} onEditDate={() => setTimePickerOpen(true)} onRenameDay={setRenamingPlanDay} getDayLabel={(day) => journeyDayDisplayLabel(day, resolved, t)} />
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
                  <Press
                    onPress={() => setTimePickerOpen(true)}
                    accessibilityRole="button"
                    accessibilityLabel={`${t('journey.stat.date')} ${poi.plannedDate || poi.date || '—'}`}
                    style={{ alignSelf: 'flex-start', marginTop: space.sm, paddingVertical: space.xs, flexDirection: 'row', alignItems: 'center', gap: space.xs }}
                  >
                    <Icon name="calendar" color={theme.text3} size={15} />
                    <Text style={[type.body, { color: theme.text2, fontWeight: '600' }]}>{poi.plannedDate || poi.date || '—'}</Text>
                  </Press>

                  <AppCard theme={theme} radius={radius.feature} style={{ marginTop: space.xxl, backgroundColor: theme.surface }}>
                    <View style={{ padding: space.md }}>
                      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: space.sm }}>
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text style={[type.sectionTitle, { color: theme.text }]}>{t('journey.section.trackOverview')}</Text>
                          {!hasTrack ? <Text style={[type.caption, { color: theme.text3, marginTop: space.xxs }]}>{t('journey.track.missing')}</Text> : null}
                        </View>
                        <Press
                          onPress={() => setTrackUploadOpen(true)}
                          accessibilityRole="button"
                          style={{ minHeight: 34, paddingHorizontal: space.sm, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.controlSurface, borderWidth: StyleSheet.hairlineWidth, borderColor: theme.fieldBorder }}
                        >
                          <Text style={[type.body, { color: theme.text, fontWeight: '600' }]}>{hasTrack ? t('journey.track.reupload') : t('journey.track.upload')}</Text>
                        </Press>
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
                            onPress={() => setPlanOverviewOpen((open) => !open)}
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
                            <Text
                              style={{
                                color: theme.text2,
                                fontSize: 12,
                                fontWeight: '700',
                              }}
                            >
                              {planOverviewOpen ? t('journey.timeline.collapseGroups') : t('journey.timeline.expandAllGroups')}
                            </Text>
                            <View
                              style={{
                                transform: [
                                  {
                                    rotate: planOverviewOpen ? '180deg' : '0deg',
                                  },
                                ],
                              }}
                            >
                              <Icon name="chevronDown" color={theme.text2} size={14} />
                    </View>
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
                      <View
                        style={{
                          marginTop: planOverviewOpen ? space.sm : space.xxs,
                        }}
                      >
                        {(planOverviewOpen ? journeyDays : journeyDays.slice(0, 1)).map((day, index) => {
                    const rows = timeline.rows.filter((row) => row.day === day);
                    return (
                        <Press
                              key={day}
                          onPress={() => setSeg(`day:${day}`)}
                              style={{
                                minHeight: planOverviewOpen ? (rows.length ? 86 : 68) : rows.length ? 58 : 48,
                                paddingVertical: planOverviewOpen ? space.md : space.xs,
                                flexDirection: 'row',
                                alignItems: 'center',
                                borderTopWidth: index > 0 ? StyleSheet.hairlineWidth : 0,
                                borderTopColor: theme.hairline,
                              }}
                        >
                              <View
                                style={{
                                  flex: 1,
                                  minWidth: 0,
                                  paddingRight: space.sm,
                                }}
                              >
                                <Text
                                  style={[
                                    type.cardTitle,
                                    {
                                      color: theme.text,
                                      fontSize: 18,
                                      lineHeight: 24,
                                    },
                                  ]}
                                >
                                  {journeyDayDisplayLabel(day, resolved, t)}
                                </Text>
                                {rows.length ? (
                                  <Text
                                    numberOfLines={planOverviewOpen ? 2 : 1}
                                    style={[
                                      type.body,
                                      {
                                        color: theme.text2,
                                        marginTop: planOverviewOpen ? space.xs : space.xxs,
                                        lineHeight: 21,
                                      },
                                    ]}
                                  >
                                    {rows
                                      .slice(0, planOverviewOpen ? 3 : 2)
                                      .map((row) => row.title)
                                      .join(' → ')}
                            </Text>
                                ) : null}
                          </View>
                              <Icon name="chevronR" color={theme.text3} size={17} />
                        </Press>
                    );
                  })}
                </View>
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
            onFilterStateChange={onChecklistFilterStateChange}
            selectionMode={checklistSelectionMode}
            selectedItemIds={selectedChecklistItemIds ?? new Set<string>()}
            onSelectedItemIdsChange={onSelectedChecklistItemIdsChange ?? (() => {})}
            onVisibleItemIdsChange={onVisibleChecklistItemIdsChange}
            onCanEditChange={onChecklistCanEditChange}
          />
        ) : null}

        {/* 行程 timeline */}
        {activeSeg === 'plan' ? <JourneyTimelineCard theme={theme} info={poi} readOnly={!isJourney} availableDays={journeyDays} /> : null}
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
            />
          </View>
        ) : null}

        {/* 瞬间 moments — a consistent two-column photo wall. */}
        {activeSeg === 'moments' ? (
          <View>
            {allPhotos.length > 0 ? (
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
                  <AppCard
                    theme={theme}
                    style={{
                      alignItems: 'center',
                      paddingHorizontal: space.xl,
                      paddingVertical: space.xxl,
                      backgroundColor: embeddedSurface,
                      borderWidth: StyleSheet.hairlineWidth,
                      borderColor: theme.fieldBorder,
                    }}
                  >
                    <Icon name="filter" color={theme.text3} size={24} />
                    <Text style={[type.cardTitle, { color: theme.text, marginTop: space.sm }]}>
                      {t('journey.moments.emptyFilter')}
                    </Text>
                    <Press onPress={() => setMomentFilter('all')} style={{ marginTop: space.sm, paddingVertical: space.xxs, paddingHorizontal: space.sm }}>
                      <Text style={[type.body, { color: theme.accent, fontWeight: '700' }]}>{t('journey.moments.clearFilter')}</Text>
                    </Press>
                  </AppCard>
                )}
                <Text
                  style={[
                    type.caption,
                    {
                      marginTop: space.xs,
                      color: theme.text3,
                      fontFamily: MONO,
                      fontWeight: '700',
                      textAlign: 'center',
                    },
                  ]}
                >
                  {t('journey.moments.countPhotos', { count: filteredPhotos.length })}
                </Text>
              </View>
            ) : (
              <AppCard
                theme={theme}
                style={{
                  alignItems: 'center',
                  paddingHorizontal: space.xl,
                  paddingVertical: space.xxl,
                  backgroundColor: embeddedSurface,
                  borderWidth: StyleSheet.hairlineWidth,
                  borderColor: theme.fieldBorder,
                }}
              >
                <View
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: radius.pill,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: theme.accentSofter,
                  }}
                >
                  <Icon name="camera" color={theme.accent} size={22} />
                </View>
                <Text style={[type.cardTitle, { color: theme.text, marginTop: space.md }]}>{t('journey.empty.moments')}</Text>
                <Text style={[type.caption, { color: theme.text2, marginTop: space.xxs, textAlign: 'center', lineHeight: 17 }]}>
                  {t('journey.empty.momentsHint')}
                </Text>
              </AppCard>
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
    if (!isJourney) {
      nav.openSharePanel(poi);
      return;
    }
    nav.openActionSheet({
      title: t('journey.manage.shareMenuTitle'),
      items: [
        { label: t('journey.manage.inviteParticipant'), icon: 'people', onPress: () => nav.openManageCompanions(poi, 'invite') },
        { label: t('journey.manage.shareJourney'), icon: 'share', onPress: () => nav.openSharePanel(poi) },
      ],
    });
  };

  const quickActions = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <FloatingIconButton name={poi.fav ? 'heartFill' : 'heart'} color={poi.fav ? theme.trailMine : '#fff'} onPress={() => nav.toggleFav()} />
      <FloatingIconButton name="share" onPress={onShare} />
      <FloatingIconButton
        name={isJourney ? 'gearSettings' : 'more'}
        onPress={() => {
          if (isJourney) nav.openJourneySettings(poi);
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
        <View style={{ paddingTop: space.xxs, paddingBottom: space.lg, flexDirection: 'row', alignItems: 'flex-start', gap: space.sm }}>
          <Text numberOfLines={2} style={[type.pageTitle, { flex: 1, minWidth: 0, color: theme.text, fontSize: 28, lineHeight: 34 }]}>
            {poi.name}
          </Text>
          <JourneyParticipantButton
            theme={theme}
            people={participantPeople}
            onPress={() => nav.openManageCompanions(poi)}
            accessibilityLabel={t('journey.manage.pageTitle')}
          />
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
              {isJourney && poi.date ? ' · ' + poi.date : ''}
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
              isJourney
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
        <PagerView
          ref={pagerRef}
          style={{ height: activePagerHeight }}
          initialPage={Math.max(0, tabOptions.findIndex((option) => option.id === seg))}
          scrollEnabled={!tabSwipeDisabled}
          offscreenPageLimit={1}
          overdrag={false}
          onPageScroll={(event) => {
            const { position, offset } = event.nativeEvent;
            const visualIndex = Math.min(tabOptions.length - 1, position + (offset >= 0.5 ? 1 : 0));
            const visual = tabOptions[visualIndex];
            if (visual && visual.id !== visualSegRef.current) {
              visualSegRef.current = visual.id;
              setVisualSeg(visual.id);
            }
          }}
          onPageSelected={(event) => {
            const next = tabOptions[event.nativeEvent.position];
            if (!next) return;
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
                  if (height > 0 && tabPageHeights[option.id] !== height) {
                    setTabPageHeights((current) => current[option.id] === height
                      ? current
                      : { ...current, [option.id]: height });
                  }
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
                  {renderTabContent(option.id)}
                </SelectedPoiContent>
              </View>
            </View>
          ))}
        </PagerView>
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
          onDelete={(index) => {
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
      <MomentFilterMenu
        theme={theme}
        visible={momentFilterOpen}
        typeTitle={t('journey.moments.filterType')}
        participantTitle={t('journey.moments.filterParticipant')}
        allParticipantsLabel={t('journey.moments.filterAllParticipants')}
        hostLabel={t('journey.companions.host')}
        selfLabel={t('journey.companions.you')}
        selectedType={momentFilter}
        selectedAuthor={momentAuthorFilter}
        typeOptions={momentFilterOptions}
        authors={momentAuthorOptions}
        onClose={() => setMomentFilterOpen(false)}
        onSelectType={(filter) => {
          setMomentViewerIndex(null);
          setMomentFilter(filter);
        }}
        onSelectAuthor={(author) => {
          setMomentViewerIndex(null);
          setMomentAuthorFilter(author);
        }}
      />
      {renamingPlanDay ? (
        <JourneyGroupRenameSheet
          theme={theme}
          initialName={journeyDayDisplayLabel(renamingPlanDay, resolved, t)}
          onClose={() => setRenamingPlanDay(null)}
          onSave={(name) => {
            const current = renamingPlanDay;
            setRenamingPlanDay(null);
            if (!current || name === journeyDayDisplayLabel(current, resolved, t)) return;
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
      {timePickerOpen ? <JourneyTimePicker theme={theme} poi={poi} onApply={(patch) => nav.patchCurrent(patch)} onClose={() => setTimePickerOpen(false)} /> : null}
      {trackUploadOpen ? <JourneyTrackUploadSheet theme={theme} journeyId={poi.id} replacing={hasTrack} onClose={() => setTrackUploadOpen(false)} /> : null}
    </View>
  );
}
