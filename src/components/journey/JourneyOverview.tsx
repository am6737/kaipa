// JourneyOverview.tsx — the 总览 tab of a journey, laid out after the v2
// preview (docs/previews/journey-detail-restructure-v2.html).
//
// 简介 on top, then one phase slot, then a fixed run of sections: 计划概览, 轨迹,
// 天气 — and at the foot, links to the source route (where its trail reports
// live) and 版本记录.
// Who is coming is the header's avatar row; 出发准备 says whether they are
// ready. Before departure the slot is the 出发准备 block —
// the countdown plus what is still missing (住宿, 清单, 同行准备, 离线地图); during
// the trip it shows today; after it reports the walk as finished.
//
// Every section is always there. A section with nothing to show says so in a
// plain line and, when the reader can fix it, offers the way in — 上传轨迹,
// 写简介, 设置日期 — so an empty journey reads as a list of next steps rather
// than a page with holes in it.
//
// What the itinerary actually carries is what gets shown, and nothing else is.
// A day's line in words is its group note — the summary the user wrote for
// that day on the 行程 page. A day's mileage and climb come from geometry that
// is already recorded; a day that only has a road plan waiting for it shows no
// numbers. Weather asks for one forecast per distinct coordinate and only
// speaks for the days inside the horizon.
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, Text, TextInput, View } from 'react-native';
import type { Poi } from '../../data/pois';
import type { TLRow } from '../../data/timeline';
import { AppSectionHeader, radius, space, type } from '../../design-system';
import { useI18n } from '../../i18n';
import { MONO } from '../../theme/fonts';
import type { Theme } from '../../theme/theme';
import { useRouteWeather } from '../../hooks/useRouteWeather';
import { ROUTE_WEATHER_FORECAST_DAYS, type RouteWeatherDay, type RouteWeatherForecast } from '../../lib/routeWeather';
import { journeyDayDisplayLabel } from '../../lib/journeyDays';
import { computeJourneyDayFacts, formatDayDistance } from '../../lib/journeyDayFacts';
import type { Coordinate } from '../../lib/routeSegments';
import { durationParts, climbValueMeters, estimateDurationMinutes } from '../../lib/routePreview';
import { useNav } from '../../nav/NavContext';
import { useJourneyPacking } from '../../hooks/useJourneyPacking';
import { WeatherIcon } from '../discover/RouteWeatherDetails';
import { Icon } from '../Icon';
import { OfflineMapRow } from '../maps/OfflineMapRow';
import { formatMeetTime, meetingDate, navigateToPlace } from '../../lib/meetingPoint';
import { ElevationStrip } from '../overlays/ElevationStrip';
import { Press } from '../Press';
import { journeyDatePhase, journeyStartDate } from './journeyDatePresentation';
import type { JourneyTrackSave } from './useJourneyTrackSave';

/** More days than this fold away, because the overview is a summary and the
 *  行程 tab is the way to walk through a long itinerary. */
const MAX_DAYS_SHOWN = 7;

interface DayOverview {
  day: string;
  label: string;
  /** The user's own note for the day group, on one line. */
  note?: string;
  stats?: string;
  /** The day this itinerary group happens on, when the journey has dates. */
  date?: Date;
  /** Where to ask for weather — the day's last place, else the track it walks. */
  weatherAt?: Coordinate;
}

type Props = {
  theme: Theme;
  poi: Poi;
  /** Every day of the itinerary in list order, including days with no rows yet. */
  days: string[];
  rows: TLRow[];
  knownGroups: string[];
  /** Day group notes by group key, as written on the 行程 page. */
  groupNotes: Record<string, string>;
  /** The catalog routes this journey links to — the tracks its places sit on. */
  routes: Poi[];
  onSelectDay: (day: string) => void;
  /** Opens the journey's track detail page; absent means the section is not a button. */
  onOpenTrack?: () => void;
  /** Saving the journey's route track into 「我的轨迹」; absent when there is nothing the reader can save. */
  trackSave?: JourneyTrackSave | null;
  /** The signed-in user, for whose 清单 the 出发准备 block reports. */
  userId: string;
  /** Opens the 清单 tab. */
  onOpenChecklist: () => void;
  /** Opens the journey editor (dates, track, 简介); absent for a reader who cannot edit. */
  onEditJourney?: () => void;
  /** Saves the 简介 written in place on the empty state; absent keeps the empty state a link to the editor. */
  onSaveDesc?: (desc: string) => void;
  /** Opens the date picker; falls back to the journey settings when absent. */
  onEditDate?: () => void;
  /** Opens the version history; absent hides the row. */
  onOpenHistory?: () => void;
  /** True while 总览 is the visible tab, so the packing summary can catch up
   *  with what was ticked off on the 清单 tab. */
  active?: boolean;
};

const dayKey = (coordinate: Coordinate) => `${coordinate[0].toFixed(4)},${coordinate[1].toFixed(4)}`;

const isoDay = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

const atMidnight = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());

const calendarDaysApart = (from: Date, to: Date) => Math.round((atMidnight(to).getTime() - atMidnight(from).getTime()) / 86_400_000);

const formatClock = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

/** Beaufort force from a wind speed in km/h — the scale a hiker reads 阵风 on. */
const beaufortForce = (kmh: number): number => {
  const bounds = [1, 6, 12, 20, 29, 39, 50, 62, 75, 89, 103, 118];
  let force = 0;
  while (force < bounds.length && kmh >= bounds[force]) force += 1;
  return force;
};

/** One forecast per distinct coordinate: the probe renders nothing and reports
 *  what it learned up to the overview, which shares it with every day that asks. */
function WeatherProbe({ coordinate, onResult }: { coordinate: Coordinate; onResult: (key: string, forecast: RouteWeatherForecast | null) => void }) {
  const key = dayKey(coordinate);
  const { forecast, failed } = useRouteWeather(coordinate[0], coordinate[1]);
  useEffect(() => {
    if (!failed) onResult(key, forecast);
  }, [failed, forecast, key, onResult]);
  return null;
}

/** A section title with an optional 「全部 ›」-style action on its right. */
function SectionHeader({ theme, text, action, onAction, marginTop = space.xxl }: { theme: Theme; text: string; action?: string; onAction?: () => void; marginTop?: number }) {
  return (
    <AppSectionHeader
      theme={theme}
      text={text}
      variant="title"
      marginTop={marginTop}
      trailing={action && onAction ? (
        <Press onPress={onAction} accessibilityRole="button" hitSlop={8} style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
          <Text style={[type.small, { color: theme.text2 }]}>{action}</Text>
          <Icon name="chevronR" color={theme.text3} size={14} />
        </Press>
      ) : undefined}
    />
  );
}

/** What an empty section says, and — when the reader can fix it — the way in. */
function EmptyBlock({ theme, title, hint, action, onPress }: { theme: Theme; title: string; hint?: string; action?: string; onPress?: () => void }) {
  const actionable = !!(action && onPress);
  return (
    <Press
      onPress={actionable ? onPress : undefined}
      accessibilityRole={actionable ? 'button' : undefined}
      style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.xs, minHeight: 44 }}
    >
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[type.readingSummary, { color: theme.text2 }]}>{title}</Text>
        {hint ? <Text style={[type.small, { color: theme.text3, marginTop: space.xxs }]}>{hint}</Text> : null}
      </View>
      {actionable ? <Text style={[type.chip, { color: theme.accent, flexShrink: 0 }]}>{action}</Text> : null}
    </Press>
  );
}

/** The empty 简介, written where it will be read: tap, type, and leaving the field saves it. */
function InlineDescInput({ theme, placeholder, onSave }: { theme: Theme; placeholder: string; onSave: (desc: string) => void }) {
  const [draft, setDraft] = useState('');
  return (
    <TextInput
      value={draft}
      onChangeText={setDraft}
      onBlur={() => {
        const next = draft.trim();
        if (next) onSave(next);
      }}
      placeholder={placeholder}
      placeholderTextColor={theme.text3}
      multiline
      maxLength={280}
      textAlignVertical="top"
      style={[type.readingLead, { color: theme.text2, minHeight: 44, paddingVertical: space.xs, paddingHorizontal: 0 }]}
    />
  );
}

/** One row of the 出发准备 block: what it is, where it stands, what to do. */
function PrepRow({ theme, title, note, action, onPress, done }: { theme: Theme; title: string; note?: string; action?: string; onPress?: () => void; done?: boolean }) {
  return (
    <Press
      onPress={onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 56, paddingVertical: space.xs }}
    >
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={[type.readingSummary, { color: done ? theme.text2 : theme.text }]}>{title}</Text>
        {note ? <Text numberOfLines={2} style={[type.small, { color: theme.text2, marginTop: space.xxs }]}>{note}</Text> : null}
      </View>
      {action ? <Text style={[type.chip, { color: theme.accent, flexShrink: 0 }]}>{action}</Text> : onPress ? <Icon name="chevronR" color={theme.text3} size={15} /> : null}
    </Press>
  );
}

const WEEKDAYS_ZH = '日一二三四五六';
const WEEKDAYS_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** 集合: when and where the group meets, with directions in the phone's map app. */
function MeetingCard({ theme, poi, startDate, today }: { theme: Theme; poi: Poi; startDate: Date | null; today: Date }) {
  const { t, resolved } = useI18n();
  const date = meetingDate(startDate, poi.meetDay);
  let when: string;
  if (date) {
    const apart = calendarDaysApart(today, date);
    when = apart === 0
      ? t('journey.meeting.today')
      : apart === 1
        ? t('journey.meeting.tomorrow')
        : resolved === 'en'
          ? `${WEEKDAYS_EN[date.getDay()]}, ${MONTHS_EN[date.getMonth()]} ${date.getDate()}`
          : `${date.getMonth() + 1}月${date.getDate()}日 周${WEEKDAYS_ZH[date.getDay()]}`;
  } else {
    when = (poi.meetDay ?? 0) < 0 ? t('journey.meeting.dayBefore') : t('journey.meeting.dayOf');
  }
  const title = poi.meetTime != null
    ? t('journey.meeting.title', { when: `${when} ${formatMeetTime(poi.meetTime)}` })
    : t('journey.meeting.titleNoTime', { when });
  const place = poi.meetPlace;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, backgroundColor: theme.fieldSurface, borderRadius: radius.feature, paddingHorizontal: space.lg, paddingVertical: space.md, marginTop: space.md }}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[type.readingSummary, { color: theme.text, fontVariant: ['tabular-nums'] }]}>{title}</Text>
        <Text numberOfLines={2} style={[type.small, { color: place ? theme.text2 : theme.text3, marginTop: space.xxs }]}>
          {place ? place.name : t('journey.meeting.noPlace')}
        </Text>
      </View>
      {place ? (
        <Press
          onPress={() => { void navigateToPlace(place).catch(() => {}); }}
          accessibilityRole="button"
          style={{ height: 34, paddingHorizontal: space.md, borderRadius: radius.pill, justifyContent: 'center', backgroundColor: theme.accentSoft, flexShrink: 0 }}
        >
          <Text style={[type.chip, { color: theme.accent }]}>{t('journey.meeting.navigate')}</Text>
        </Press>
      ) : null}
    </View>
  );
}

export function JourneyOverview({ theme, poi, days, rows, knownGroups, groupNotes, routes, onSelectDay, onOpenTrack, trackSave, userId, onOpenChecklist, onEditJourney, onSaveDesc, onEditDate, onOpenHistory, active }: Props) {
  const { t, resolved } = useI18n();
  const join = t('journey.overview.statJoin');
  const wideSpace = resolved === 'en' ? ' ' : '　';
  const nav = useNav();
  const [forecasts, setForecasts] = useState<Record<string, RouteWeatherForecast | null>>({});

  const startDate = useMemo(() => journeyStartDate(poi), [poi]);
  const phase = journeyDatePhase(poi);
  const facts = useMemo(
    () => computeJourneyDayFacts({ poi, days, rows, knownGroups, routes, startDate }),
    [days, knownGroups, poi, routes, rows, startDate],
  );
  // The forecast answers for today onwards, so a day beyond this many days from
  // today has nothing to read yet — and a day already past has no forecast left.
  const today = useMemo(() => atMidnight(new Date()), []);
  const horizon = ROUTE_WEATHER_FORECAST_DAYS - 1;

  const dayOverviews = useMemo<DayOverview[]>(
    () => facts.map((fact) => {
      const parts: string[] = [];
      if (fact.distanceMeters != null) parts.push(formatDayDistance(fact.distanceMeters));
      const climbText = fact.ascentMeters != null && fact.ascentMeters >= 5 ? climbValueMeters(fact.ascentMeters) : null;
      if (climbText) parts.push(t('journey.overview.ascent', { value: climbText }));
      return {
        day: fact.day,
        label: journeyDayDisplayLabel(fact.day, resolved),
        note: groupNotes[fact.day]?.replace(/\s*\n\s*/g, ' ').trim() || undefined,
        stats: parts.length ? parts.join(join) : undefined,
        date: fact.date,
        weatherAt: fact.weatherAt,
      };
    }),
    [facts, groupNotes, join, resolved, t],
  );

  const probes = useMemo(() => {
    const byKey = new Map<string, Coordinate>();
    dayOverviews.forEach((item) => {
      if (!item.date || !item.weatherAt) return;
      const offset = calendarDaysApart(today, item.date);
      if (offset < 0 || offset > horizon) return;
      byKey.set(dayKey(item.weatherAt), item.weatherAt);
    });
    return [...byKey.entries()];
  }, [dayOverviews, horizon, today]);
  const weatherBeyondHorizon = dayOverviews.some((item) => item.date && calendarDaysApart(today, item.date) > horizon);

  const reportForecast = useCallback((key: string, forecast: RouteWeatherForecast | null) => {
    setForecasts((current) => current[key] === forecast ? current : { ...current, [key]: forecast });
  }, []);

  const [expanded, setExpanded] = useState(false);
  const visibleDays = expanded || dayOverviews.length <= MAX_DAYS_SHOWN ? dayOverviews : dayOverviews.slice(0, MAX_DAYS_SHOWN);

  // A day's forecast only warns for risks the numbers actually carry: near-gale
  // gusts, thunder, strong rain, or freezing ground.
  const dayRisk = useCallback((day: RouteWeatherDay): string | null => {
    const risks: string[] = [];
    const wind = day.gust ?? day.wind ?? 0;
    if (wind >= 39) risks.push(t('journey.overview.riskWind', { force: beaufortForce(wind) }));
    if (Math.max(day.code, day.thunderstorm ?? -1) >= 95) risks.push(t('journey.overview.riskThunder'));
    if ((day.showers ?? 0) >= 10) risks.push(t('journey.overview.riskRain', { value: Math.round(day.showers ?? 0) }));
    if (day.min <= 0) risks.push(t('journey.overview.riskIce'));
    return risks.length ? risks.join(t('journey.overview.riskJoin')) : null;
  }, [t]);

  const dayViews = useMemo(
    () => visibleDays.map((item) => {
      const forecast = item.weatherAt ? forecasts[dayKey(item.weatherAt)] : null;
      const day = forecast?.days.find((entry) => item.date && entry.date === isoDay(item.date)) ?? null;
      return { item, day, risk: day ? dayRisk(day) : null, isToday: phase === 'during' && !!item.date && isoDay(item.date) === isoDay(today) };
    }),
    [dayRisk, forecasts, phase, today, visibleDays],
  );

  // The packing summary for 出发准备. 清单 owns the live subscription; this copy
  // reads once and catches up whenever 总览 comes back into view.
  const packing = useJourneyPacking({ journey: poi, userId, realtime: false });
  const refetchPacking = packing.refetch;
  useEffect(() => {
    if (active && phase === 'before') void refetchPacking();
  }, [active, phase, refetchPacking]);
  const isHost = poi.mine === true;
  const myView = packing.views.find((view) => view.kind === 'personal' && view.ownerCompanionId === packing.currentCompanionId);
  const sharedView = packing.views.find((view) => view.kind === 'shared');
  const mySharedItems = sharedView?.items.filter((item) => item.carrierCompanionId === packing.currentCompanionId) ?? [];
  const memberViews = packing.views.filter((view) => view.kind === 'personal');
  const membersReady = memberViews.filter((view) => view.items.length > 0 && view.pendingCount === 0);
  const membersBehind = memberViews.filter((view) => !(view.items.length > 0 && view.pendingCount === 0));

  // The phase slot above the sections. Only what the data honestly carries appears.
  const departIn = startDate ? calendarDaysApart(today, startDate) : null;
  const stayTodos = useMemo(() => {
    if (phase !== 'before' || !startDate) return [];
    const dated = dayOverviews.filter((item) => item.date);
    return dated.slice(0, -1)
      .filter((item) => !rows.some((row) => row.day === item.day && row.kind === 'stay'))
      .map((item) => ({
        day: item.day,
        title: t('journey.overview.stayMissing', { day: item.label }),
        note: item.note,
      }));
  }, [dayOverviews, phase, rows, startDate, t]);

  const todayItem = phase === 'during' && startDate
    ? dayOverviews.find((item) => item.date && isoDay(item.date) === isoDay(today))
    : undefined;
  const nextStop = useMemo(() => {
    if (!todayItem) return null;
    const now = new Date();
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    return rows
      .filter((row) => row.day === todayItem.day && row.timeStart != null && row.timeStart > nowMinutes)
      .sort((a, b) => (a.timeStart ?? 0) - (b.timeStart ?? 0))[0] ?? null;
  }, [rows, todayItem]);

  const afterSummary = useMemo(() => {
    const parts: string[] = [];
    if (days.length) parts.push(t('journey.overview.afterDays', { count: days.length }));
    const measured = facts.length > 0 && facts.every((fact) => fact.distanceMeters != null);
    const distance = measured
      ? formatDayDistance(facts.reduce((total, fact) => total + (fact.distanceMeters ?? 0), 0))
      : poi.dist?.trim();
    if (distance) parts.push(distance);
    return parts.join(wideSpace);
  }, [days.length, facts, poi.dist, t, wideSpace]);

  const hasMeeting = poi.meetTime != null || !!poi.meetPlace;
  const meetDate = meetingDate(startDate, poi.meetDay);
  const meetingToday = hasMeeting && !!meetDate && isoDay(meetDate) === isoDay(today);

  let heroTitle: string | null = null;
  let heroSub: string | null = null;
  let heroBig = false;
  let heroSlot: React.ReactNode = null;
  if (phase === 'after') {
    heroTitle = t('journey.overview.finished');
    heroSub = afterSummary || null;
  } else if (phase === 'during') {
    if (todayItem) {
      heroBig = true;
      heroTitle = todayItem.label;
      heroSub = [todayItem.note, todayItem.stats].filter(Boolean).join(wideSpace) || null;
      heroSlot = (
        <>
        {meetingToday ? <MeetingCard theme={theme} poi={poi} startDate={startDate} today={today} /> : null}
        {nextStop ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 52, paddingVertical: space.xxs }}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text numberOfLines={1} style={[type.readingSummary, { color: theme.text }]}>{nextStop.title}</Text>
          </View>
          <Text style={{ fontFamily: MONO, fontSize: 14, fontWeight: '600', color: theme.text2, fontVariant: ['tabular-nums'] }}>
            {formatClock(nextStop.timeStart as number)}
          </Text>
        </View>
        ) : null}
        </>
      );
    }
  } else {
    // 出发准备: always there before departure. Each row says where one thing
    // stands; the open ones count toward 「还有 N 件事」.
    const prepRows: React.ReactNode[] = [];
    let pending = 0;
    if (!startDate) {
      pending += 1;
      prepRows.push(
        <PrepRow key="date" theme={theme} title={t('journey.overview.prepDate')} note={t('journey.overview.prepDateHint')} action={onEditJourney ? t('journey.overview.set') : undefined} onPress={onEditDate ?? onEditJourney} />,
      );
    }
    if (!hasMeeting) {
      if (onEditJourney) {
        pending += 1;
        prepRows.push(
          <PrepRow key="meeting" theme={theme} title={t('journey.meeting.missing')} note={t('journey.meeting.missingHint')} action={t('journey.overview.set')} onPress={onEditJourney} />,
        );
      } else {
        prepRows.push(<PrepRow key="meeting" theme={theme} done title={t('journey.meeting.missingReader')} />);
      }
    }
    stayTodos.forEach((todo) => {
      pending += 1;
      prepRows.push(
        <PrepRow key={`stay-${todo.day}`} theme={theme} title={todo.title} note={todo.note} action={t('journey.overview.arrange')} onPress={() => onSelectDay(todo.day)} />,
      );
    });
    if (isHost && memberViews.length > 1) {
      const allReady = membersBehind.length === 0;
      if (!allReady) pending += 1;
      prepRows.push(
        <PrepRow
          key="crew"
          theme={theme}
          done={allReady}
          title={t('journey.overview.prepCrew', { ready: membersReady.length, total: memberViews.length })}
          note={allReady
            ? t('journey.overview.prepCrewDone')
            : t('journey.overview.prepCrewBehind', { names: membersBehind.map((view) => view.companion?.name).filter(Boolean).join(t('journey.overview.nameJoin')) })}
          onPress={onOpenChecklist}
        />,
      );
    }
    if (mySharedItems.length) {
      const sharedPending = mySharedItems.filter((item) => !item.packed).length;
      if (sharedPending) pending += 1;
      prepRows.push(
        <PrepRow
          key="shared"
          theme={theme}
          done={!sharedPending}
          title={t('journey.overview.prepShared', { names: mySharedItems.map((item) => item.name).join(t('journey.overview.nameJoin')) })}
          note={sharedPending ? t('journey.overview.prepSharedPending', { count: sharedPending }) : t('journey.overview.prepSharedDone')}
          onPress={onOpenChecklist}
        />,
      );
    }
    const myItems = myView?.items ?? [];
    const myPending = myItems.filter((item) => !item.packed);
    if (!packing.loading || myItems.length) {
      if (!myItems.length) {
        pending += 1;
        prepRows.push(
          <PrepRow key="mine" theme={theme} title={t('journey.overview.prepMineEmpty')} note={t('journey.overview.prepMineEmptyHint')} action={t('journey.overview.add')} onPress={onOpenChecklist} />,
        );
      } else {
        if (myPending.length) pending += 1;
        prepRows.push(
          <PrepRow
            key="mine"
            theme={theme}
            done={!myPending.length}
            title={t('journey.overview.prepMine', { packed: myItems.length - myPending.length, total: myItems.length })}
            note={myPending.length
              ? t('journey.overview.prepMinePending', { names: myPending.slice(0, 3).map((item) => item.name).join(t('journey.overview.nameJoin')), count: myPending.length })
              : t('journey.overview.prepMineDone')}
            onPress={onOpenChecklist}
          />,
        );
      }
    }
    prepRows.push(<OfflineMapRow key="offline" theme={theme} region={poi.region} />);

    if (startDate) {
      const count = departIn ?? 0;
      heroTitle = count <= 0
        ? t('journey.overview.departToday')
        : count === 1
          ? t('journey.overview.departTomorrow')
          : t('journey.overview.departIn', { count });
    } else {
      heroTitle = t('journey.overview.prepTitle');
    }
    heroSub = pending ? t('journey.overview.pendingTodos', { count: pending }) : t('journey.overview.allReady');
    heroSlot = (
      <>
      {hasMeeting ? <MeetingCard theme={theme} poi={poi} startDate={startDate} today={today} /> : null}
      <View style={{ marginTop: space.sm }}>
        {prepRows}
      </View>
      </>
    );
  }

  // 天气: one cell per dated day the forecast reaches; otherwise a sentence on why not.
  const weatherCells = dayViews.filter((view) => view.day);
  let weatherEmpty: { title: string; hint?: string; action?: string; onPress?: () => void } | null = null;
  if (!weatherCells.length) {
    if (!startDate) {
      // 出发准备 already offers 设置日期 right above; this only says why.
      weatherEmpty = { title: t('journey.overview.weatherNoDate') };
    } else if (phase === 'after') {
      weatherEmpty = { title: t('journey.overview.weatherPast') };
    } else if (!dayOverviews.some((item) => item.weatherAt)) {
      weatherEmpty = { title: t('journey.overview.weatherNoPlace'), action: days.length ? t('journey.overview.arrange') : undefined, onPress: days.length ? () => onSelectDay(days[0]) : undefined };
    } else if (probes.length) {
      weatherEmpty = { title: t('journey.overview.loading') };
    } else if (weatherBeyondHorizon) {
      weatherEmpty = { title: t('journey.overview.weatherHorizon', { count: ROUTE_WEATHER_FORECAST_DAYS }) };
    } else {
      weatherEmpty = { title: t('journey.overview.weatherNone') };
    }
  }

  // The catalog route the journey was made from, if any.
  const sourceRoute = useMemo(() => {
    const id = poi.routeId ?? rows.find((row) => row.routeId)?.routeId;
    return id ? routes.find((route) => route.id === id) ?? null : null;
  }, [poi.routeId, routes, rows]);

  const trackStats = useMemo(() => {
    const distance = poi.dist?.trim();
    const parts: string[] = [];
    if (distance) parts.push(distance);
    const climb = poi.asc?.match(/\d+(?:[.,]\d+)?/)?.[0];
    if (climb) parts.push(t('journey.overview.ascent', { value: climb.replace(',', '.') }));
    const minutes = estimateDurationMinutes(poi, climb ? Number(climb.replace(',', '.')) : undefined);
    if (minutes != null) {
      const units = { hours: t('route.preview.unitHours'), minutes: t('route.preview.unitMinutes') };
      const split = durationParts(minutes, units);
      const value = [split.hours ? `${split.hours}${split.hoursUnit ?? ''}` : null, split.minutes ? `${split.minutes}${split.minutesUnit ?? ''}` : null]
        .filter(Boolean)
        .join(' ');
      if (value) parts.push(t('journey.overview.estimatedTime', { value }));
    }
    return parts.length ? parts.join(join) : null;
  }, [join, poi, t]);

  // Lists and the track sit open on the canvas; only the 集合 card and the
  // weather cells, which are acted on or compared, get a surface.
  const hasTrack = (poi.trackCoords?.length ?? 0) >= 2;

  const trackFigures = useMemo(() => {
    const figures: { value: string; label: string }[] = [];
    const distance = poi.dist?.trim();
    if (distance) figures.push({ value: distance, label: t('journey.overview.figureDistance') });
    const climb = poi.asc?.match(/\d+(?:[.,]\d+)?/)?.[0];
    if (climb) figures.push({ value: `${climb.replace(',', '.')} m`, label: t('journey.overview.figureAscent') });
    const minutes = estimateDurationMinutes(poi, climb ? Number(climb.replace(',', '.')) : undefined);
    if (minutes != null) {
      const units = { hours: t('route.preview.unitHours'), minutes: t('route.preview.unitMinutes') };
      const split = durationParts(minutes, units);
      const value = [split.hours ? `${split.hours}${split.hoursUnit ?? ''}` : null, split.minutes ? `${split.minutes}${split.minutesUnit ?? ''}` : null]
        .filter(Boolean)
        .join(' ');
      if (value) figures.push({ value, label: t('journey.overview.figurePace') });
    }
    return figures;
  }, [poi, t]);

  const firstDay = days[0];

  return (
    <>
      <SectionHeader theme={theme} text={t('journey.section.about')} marginTop={space.md} />
      {poi.desc?.trim() ? (
        <Text style={[type.readingLead, { color: theme.text2 }]}>{poi.desc}</Text>
      ) : onSaveDesc ? (
        <InlineDescInput theme={theme} placeholder={t('journey.overview.aboutEmpty')} onSave={onSaveDesc} />
      ) : (
        <EmptyBlock
          theme={theme}
          title={onEditJourney ? t('journey.overview.aboutEmpty') : t('journey.overview.aboutEmptyReader')}
          hint={onEditJourney ? t('journey.overview.aboutEmptyHint') : undefined}
          action={onEditJourney ? t('journey.overview.write') : undefined}
          onPress={onEditJourney}
        />
      )}

      {heroTitle ? (
        <View style={{ marginTop: space.xxl }}>
          {phase === 'during' ? (
            <Text style={[type.lead, { color: theme.text2, marginBottom: 3 }]}>{t('journey.overview.todayLabel')}</Text>
          ) : null}
          <Text style={[{ fontSize: heroBig ? 22 : 18, fontWeight: '800', lineHeight: heroBig ? 29 : 25, color: theme.text }]}>{heroTitle}</Text>
          {heroSub ? (
            <Text style={[type.lead, { color: theme.text2, marginTop: 3 }]}>{heroSub}</Text>
          ) : null}
          {heroSlot}
        </View>
      ) : null}

      <SectionHeader
        theme={theme}
        text={t('journey.overview.days')}
        action={firstDay ? t('journey.overview.allDays') : undefined}
        onAction={firstDay ? () => onSelectDay(firstDay) : undefined}
      />
      {dayViews.length ? (
        <View>
          {dayViews.map(({ item, isToday }) => (
            <Press
              key={item.day}
              onPress={() => onSelectDay(item.day)}
              accessibilityRole="button"
              style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.sm }}
            >
              <View style={{ flex: 1, minWidth: 0 }}>
                {/* The day's name leads its note on one line, the way a heading reads. */}
                <Text numberOfLines={2} style={[type.dayLabel, { color: isToday ? theme.accent : theme.text }]}>
                  {item.label}
                  {item.note ? <Text style={{ fontWeight: '600', color: theme.text }}>{`${wideSpace}${item.note}`}</Text> : null}
                </Text>
                {item.stats ? (
                  <Text numberOfLines={1} style={[type.small, { color: theme.text2, marginTop: space.xxs, fontVariant: ['tabular-nums'] }]}>{item.stats}</Text>
                ) : null}
              </View>
              <Icon name="chevronR" color={theme.text3} size={15} />
            </Press>
          ))}
          {dayOverviews.length > MAX_DAYS_SHOWN ? (
            <Press
              onPress={() => setExpanded((open) => !open)}
              accessibilityRole="button"
              accessibilityState={{ expanded }}
              style={{ minHeight: 44, justifyContent: 'center' }}
            >
              <Text style={[type.small, { color: theme.accent, fontWeight: '600' }]}>
                {expanded ? t('journey.timeline.collapseGroups') : t('journey.timeline.expandAllGroups')}
              </Text>
            </Press>
          ) : null}
        </View>
      ) : (
        <EmptyBlock theme={theme} title={t('journey.overview.daysEmpty')} />
      )}

      <SectionHeader
        theme={theme}
        text={t('journey.overview.track')}
        action={hasTrack && onOpenTrack ? t('journey.overview.details') : undefined}
        onAction={hasTrack ? onOpenTrack : undefined}
      />
      {hasTrack ? (
        <Press onPress={onOpenTrack} accessibilityRole={onOpenTrack ? 'button' : undefined} style={{ paddingTop: space.xxs }}>
          <View pointerEvents="none">
            <ElevationStrip theme={theme} poi={poi} bare interactive={false} />
          </View>
          {trackFigures.length ? (
            <View style={{ flexDirection: 'row', marginTop: space.sm }}>
              {trackFigures.map((figure) => (
                <View key={figure.label} style={{ flex: 1, minWidth: 0 }}>
                  <Text numberOfLines={1} style={{ fontFamily: MONO, fontSize: 17, fontWeight: '700', color: theme.text, fontVariant: ['tabular-nums'] }}>{figure.value}</Text>
                  <Text numberOfLines={1} style={[type.small, { color: theme.text2, marginTop: 2 }]}>{figure.label}</Text>
                </View>
              ))}
            </View>
          ) : trackStats ? (
            <Text style={[type.small, { color: theme.text2, marginTop: space.xs, fontVariant: ['tabular-nums'] }]}>{trackStats}</Text>
          ) : null}
        </Press>
      ) : null}
      {hasTrack && trackSave ? (
        <View style={{ marginTop: space.sm }}>
          {trackSave.saved ? (
            <PrepRow
              theme={theme}
              title={t('journey.track.savedInLibrary')}
              note={t('journey.track.savedInLibraryHint')}
              action={t('journey.track.view')}
              onPress={() => nav.openOwnTrack(trackSave.saved!.id)}
              done
            />
          ) : (
            <PrepRow
              theme={theme}
              title={t('journey.track.saveToLibrary')}
              note={t('journey.track.saveToLibraryHint')}
              action={t('journey.action.save')}
              onPress={trackSave.saving ? undefined : () => { void trackSave.save(); }}
            />
          )}
        </View>
      ) : null}
      {hasTrack ? null : (
        <EmptyBlock
          theme={theme}
          title={t('journey.track.missing')}
          hint={t('journey.track.missingHint')}
          action={onEditJourney ? t('journey.track.upload') : undefined}
          onPress={onEditJourney}
        />
      )}

      <SectionHeader theme={theme} text={t('journey.overview.weather')} />
      {weatherCells.length ? (
        <>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.xs }}>
            {weatherCells.map(({ item, day, risk, isToday }) => (
              <Press
                key={item.day}
                onPress={() => onSelectDay(item.day)}
                accessibilityRole="button"
                style={{ width: 132, backgroundColor: theme.fieldSurface, borderRadius: radius.feature, paddingHorizontal: space.md, paddingVertical: space.md }}
              >
                <Text numberOfLines={1} style={[type.small, { color: isToday ? theme.accent : theme.text2, fontWeight: '600' }]}>{item.label}</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.xxs, marginTop: space.xs }}>
                  <WeatherIcon code={day!.code} size={20} color={theme.text2} />
                  <Text style={{ fontFamily: MONO, fontSize: 16, fontWeight: '700', color: theme.text, fontVariant: ['tabular-nums'] }}>
                    {`${Math.round(day!.min)}–${Math.round(day!.max)}°`}
                  </Text>
                </View>
                {risk ? (
                  <Text numberOfLines={2} style={{ fontSize: 12.5, color: theme.warn, fontWeight: '600', marginTop: space.xs }}>{risk}</Text>
                ) : day!.sunset ? (
                  <Text numberOfLines={1} style={{ fontSize: 12.5, color: theme.text2, marginTop: space.xs }}>
                    {t('journey.overview.sunset', { time: day!.sunset.slice(11, 16) })}
                  </Text>
                ) : null}
              </Press>
            ))}
          </ScrollView>
          <Text style={{ fontSize: 12.5, color: theme.text3, marginTop: space.xs }}>
            {t('journey.overview.weatherCaptionDays', { count: ROUTE_WEATHER_FORECAST_DAYS })}
          </Text>
        </>
      ) : weatherEmpty ? (
        <EmptyBlock theme={theme} {...weatherEmpty} />
      ) : null}

      {/* The page ends on two plain ways out: the catalog route this journey was
          made from (its trail reports, guides and weather live there, and its
          back button returns here), then the version history. */}
      {sourceRoute ? (
        <Press onPress={() => nav.openPoint(sourceRoute, poi)} accessibilityRole="button" style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 44, marginTop: space.xl }}>
          <Text numberOfLines={1} style={[type.small, { flex: 1, minWidth: 0, color: theme.text2 }]}>
            {`${t('journey.overview.fromRoute')}${wideSpace}${sourceRoute.name}`}
          </Text>
          <Icon name="chevronR" color={theme.text3} size={14} />
        </Press>
      ) : null}
      {onOpenHistory ? (
        <Press onPress={onOpenHistory} accessibilityRole="button" style={{ flexDirection: 'row', alignItems: 'center', minHeight: 44, marginTop: sourceRoute ? 0 : space.xl }}>
          <Text style={[type.small, { flex: 1, color: theme.text2 }]}>{t('journey.overview.history')}</Text>
          <Icon name="chevronR" color={theme.text3} size={14} />
        </Press>
      ) : null}

      {probes.map(([key, coordinate]) => (
        <WeatherProbe key={key} coordinate={coordinate} onResult={reportForecast} />
      ))}
    </>
  );
}
