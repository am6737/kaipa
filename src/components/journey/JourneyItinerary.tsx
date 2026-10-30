// JourneyItinerary.tsx — the 行程 page: every day of the itinerary in one
// continuous scroll, the unplanned group last.
//
// Each day opens with its label and date and a muted line of only the numbers
// its data can support. Places are not summarised here: what the page shows of
// a day is its own rows, each of which opens its editor. The rows under each
// heading are the compact steps owned by the 行程 code path in JourneyTimeline
// (renderContinuousDay), which keep selection and reorder working here exactly
// as they did on the per-day pages.
//
// Above the list, the day jump chips stay pinned while the page scrolls: the
// highlighted chip is the day at the top of the list, and tapping a chip puts
// that day there. The row also owns day management: a trailing "+" adds a day,
// and a long press on a dated chip opens its rename/delete menu.
import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { ScrollView, Text, View } from 'react-native';
import type { Poi } from '../../data/pois';
import type { TLRow } from '../../data/timeline';
import { space, type } from '../../design-system';
import { useI18n, type ResolvedLang } from '../../i18n';
import type { Theme } from '../../theme/theme';
import { computeJourneyDayFacts, formatDayDistance } from '../../lib/journeyDayFacts';
import { journeyDayDisplayLabel } from '../../lib/journeyDays';
import { climbValueMeters, durationParts, estimateDurationMinutes } from '../../lib/routePreview';
import { Icon } from '../Icon';
import { Press } from '../Press';
import { journeyStartDate } from './journeyDatePresentation';

/** `11月14日 周五` — the day's place in the calendar, quieter than its label. */
export function formatItineraryDayDate(date: Date, resolved: ResolvedLang): string {
  const parts = new Intl.DateTimeFormat(resolved === 'zh' ? 'zh-CN' : 'en-US', { month: 'numeric', day: 'numeric' }).formatToParts(date);
  const month = parts.find((part) => part.type === 'month')?.value ?? '';
  const day = parts.find((part) => part.type === 'day')?.value ?? '';
  const dayText = resolved === 'zh' ? `${month}月${day}日` : `${month} ${day}`;
  // The calendar's one-letter headers (日 一 二 / S M T) are too terse here; use the full short name (周五 / Fri).
  const weekday = new Intl.DateTimeFormat(resolved === 'zh' ? 'zh-CN' : 'en-US', { weekday: 'short' }).format(date);
  return `${dayText} ${weekday}`;
}

/** What one day of the page reports above its items. */
export function useJourneyItineraryDays({ poi, days, rows, knownGroups, routes }: {
  poi: Poi;
  days: string[];
  rows: TLRow[];
  knownGroups: string[];
  routes: Poi[];
}) {
  const { t, resolved } = useI18n();
  const startDate = useMemo(() => journeyStartDate(poi), [poi]);
  const facts = useMemo(
    () => computeJourneyDayFacts({ poi, days, rows, knownGroups, routes, startDate }),
    [days, knownGroups, poi, routes, rows, startDate],
  );

  return useMemo(() => facts.map((fact) => {
    // The unplanned group has no place in the calendar: it is what has not been
    // given a day yet. It gets a quieter heading and no summary or numbers.
    const pending = fact.day === '';
    if (pending) return { day: fact.day, pending, label: t('journey.itinerary.pendingDay'), date: undefined, facts: undefined };
    const parts: string[] = [];
    if (fact.distanceMeters != null) parts.push(formatDayDistance(fact.distanceMeters));
    const climbText = fact.ascentMeters != null && fact.ascentMeters >= 5 ? climbValueMeters(fact.ascentMeters) : null;
    if (climbText) parts.push(t('journey.overview.ascent', { value: climbText }));
    // Naismith on the day's own numbers; a day without a measured distance has
    // no honest time to offer.
    const minutes = fact.distanceMeters != null
      ? estimateDurationMinutes({ dist: formatDayDistance(fact.distanceMeters), trackDurationMs: undefined }, fact.ascentMeters)
      : null;
    if (minutes != null) {
      const split = durationParts(minutes, { hours: t('route.preview.unitHours'), minutes: t('route.preview.unitMinutes') });
      const value = [split.hours ? `${split.hours}${split.hoursUnit ?? ''}` : null, split.minutes ? `${split.minutes}${split.minutesUnit ?? ''}` : null]
        .filter(Boolean)
        .join(' ');
      if (value) parts.push(t('journey.overview.estimatedTime', { value }));
    }
    return {
      day: fact.day,
      pending,
      label: journeyDayDisplayLabel(fact.day, resolved),
      date: fact.date ? formatItineraryDayDate(fact.date, resolved) : undefined,
      facts: parts.length ? parts.join('　') : undefined,
    };
  }), [facts, resolved, t]);
}

/** The pinned row of day jumps plus day management. Only the day at the top of
 *  the list is filled; the others stay plain text. */
export function JourneyDayChipRow({ theme, items, activeDay, onSelectDay, editable, onAddDay, onDayMenu }: {
  theme: Theme;
  items: { day: string; label: string }[];
  activeDay: string;
  onSelectDay: (day: string) => void;
  editable?: boolean;
  onAddDay?: () => void;
  onDayMenu?: (day: string) => void;
}) {
  const scrollRef = useRef<ScrollView>(null);
  const { t } = useI18n();
  const chipXs = useRef(new Map<string, number>());
  const recordChip = useCallback((day: string, x: number) => {
    chipXs.current.set(day, x);
  }, []);

  // Keep the highlighted chip on screen: the row is wider than the sheet once a
  // journey has enough days, and a follower the user cannot see is not a follower.
  useEffect(() => {
    const x = chipXs.current.get(activeDay);
    if (x == null) return;
    scrollRef.current?.scrollTo({ x: Math.max(0, x - space.md), animated: true });
  }, [activeDay]);

  return (
    <ScrollView
      ref={scrollRef}
      horizontal
      showsHorizontalScrollIndicator={false}
      style={{ flexGrow: 0 }}
      contentContainerStyle={{ gap: 6, alignItems: 'center', paddingTop: space.xs, paddingBottom: 6 }}
    >
      {items.map((item) => {
        const on = item.day === activeDay;
        return (
          <Press
            key={item.day || 'pending'}
            onPress={() => onSelectDay(item.day)}
            onLongPress={editable && onDayMenu && item.day ? () => onDayMenu(item.day) : undefined}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            onLayout={(event) => recordChip(item.day, event.nativeEvent.layout.x)}
            style={{
              height: 30,
              paddingHorizontal: 13,
              borderRadius: 15,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: on ? theme.fieldSurface : 'transparent',
            }}
          >
            <Text numberOfLines={1} style={[type.small, { fontWeight: '600', color: on ? theme.text : theme.text2 }]}>
              {item.label}
            </Text>
          </Press>
        );
      })}
      {editable && onAddDay ? (
        <Press
          onPress={onAddDay}
          accessibilityRole="button"
          accessibilityLabel={t('common.add')}
          style={{
            width: 30,
            height: 30,
            borderRadius: 15,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon name="plus" size={16} color={theme.text2} />
        </Press>
      ) : null}
    </ScrollView>
  );
}

/** One day's opening block: label and date, what it costs. */
export function JourneyDayHeading({ theme, heading, note }: {
  theme: Theme;
  heading: { label: string; date?: string; facts?: string; pending?: boolean };
  /** The day's note line (tap to edit), rendered by the timeline. */
  note?: React.ReactNode;
}) {
  // The heading owns the gap to the first step, so a day without a numbers line
  // or note keeps the same breathing room.
  return (
    <View style={{ paddingBottom: space.sm }}>
      <Text style={[type.sectionTitle, { color: heading.pending ? theme.text2 : theme.text }]}>
        {heading.label}
        {heading.date ? (
          <Text style={{ fontSize: 13, fontWeight: '500', color: theme.text3 }}>  {heading.date}</Text>
        ) : null}
      </Text>
      {heading.facts ? (
        <Text style={[type.small, { color: theme.text2, marginTop: space.xxs, fontVariant: ['tabular-nums'] }]}>{heading.facts}</Text>
      ) : null}
      {note}
    </View>
  );
}
