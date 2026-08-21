import React, { useMemo, useState } from 'react';
import { FlatList, Modal, StyleSheet, Switch, Text, useWindowDimensions, View } from 'react-native';
import WheelPicker from '@quidone/react-native-wheel-picker';
import { Theme } from '../../theme/theme';
import { ResolvedLang, useI18n } from '../../i18n';
import { radius, space } from '../../design-system';
import { Press } from '../Press';
import { NJBottomSheet, njHapticTick } from './NewJourneyParts';

const DAY_MS = 24 * 60 * 60 * 1000;
const MONTH_RANGE = 1200;
const MONTH_HEIGHT = 344;

export interface JourneyDateRangeSelection {
  start: Date;
  totalDays: number;
  flexible: boolean;
}

function dateOnly(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function calendarDayDiff(start: Date, end: Date): number {
  const startUtc = Date.UTC(start.getFullYear(), start.getMonth(), start.getDate());
  const endUtc = Date.UTC(end.getFullYear(), end.getMonth(), end.getDate());
  return Math.max(1, Math.round((endUtc - startUtc) / DAY_MS));
}

function sameCalendarDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function JourneyRangeMonth({
  theme,
  month,
  start,
  end,
  resolved,
  onSelect,
}: {
  theme: Theme;
  month: Date;
  start: Date;
  end: Date | null;
  resolved: ResolvedLang;
  onSelect: (date: Date) => void;
}) {
  const year = month.getFullYear();
  const monthIndex = month.getMonth();
  const firstWeekday = new Date(year, monthIndex, 1).getDay();
  const dayCount = new Date(year, monthIndex + 1, 0).getDate();
  const cells: (Date | null)[] = Array.from({ length: firstWeekday }, () => null);
  for (let day = 1; day <= dayCount; day += 1) cells.push(new Date(year, monthIndex, day));
  while (cells.length < 42) cells.push(null);

  const startDay = dateOnly(start).getTime();
  const endDay = end ? dateOnly(end).getTime() : null;
  const today = dateOnly(new Date());
  const weekdays = resolved === 'zh' ? ['日', '一', '二', '三', '四', '五', '六'] : ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
  const monthTitle = new Intl.DateTimeFormat(resolved === 'zh' ? 'zh-CN' : 'en-US', {
    year: 'numeric',
    month: 'long',
  }).format(month);

  return (
    <View style={{ height: MONTH_HEIGHT, paddingBottom: space.lg }}>
      <Text style={{ fontSize: 20, fontWeight: '800', letterSpacing: -0.35, color: theme.text, marginBottom: space.sm }}>{monthTitle}</Text>
      <View style={{ flexDirection: 'row', marginBottom: space.xxs }}>
        {weekdays.map((weekday, index) => (
          <Text key={`${weekday}-${index}`} style={{ width: `${100 / 7}%`, textAlign: 'center', fontSize: 12.5, fontWeight: '500', color: theme.text3 }}>{weekday}</Text>
        ))}
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: space.xxs }}>
        {cells.map((date, index) => {
          if (!date) return <View key={`empty-${index}`} style={{ width: `${100 / 7}%`, height: 40 }} />;
          const dayTime = date.getTime();
          const isStart = dayTime === startDay;
          const isEnd = endDay !== null && dayTime === endDay;
          const inRange = endDay !== null && dayTime >= startDay && dayTime <= endDay;
          const isToday = sameCalendarDay(date, today);
          const weekIndex = index % 7;
          return (
            <Press
              key={`${year}-${monthIndex}-${date.getDate()}`}
              onPress={() => onSelect(date)}
              accessibilityRole="button"
              accessibilityState={{ selected: isStart || isEnd }}
              style={{ width: `${100 / 7}%`, height: 40, justifyContent: 'center' }}
            >
              <View style={{ height: 40, alignItems: 'center', justifyContent: 'center' }}>
                {inRange ? (
                  <View
                    pointerEvents="none"
                    style={{
                      position: 'absolute',
                      top: 0,
                      bottom: 0,
                      left: isStart ? '50%' : 0,
                      right: isEnd ? '50%' : 0,
                      borderTopLeftRadius: weekIndex === 0 ? radius.pill : 0,
                      borderBottomLeftRadius: weekIndex === 0 ? radius.pill : 0,
                      borderTopRightRadius: weekIndex === 6 ? radius.pill : 0,
                      borderBottomRightRadius: weekIndex === 6 ? radius.pill : 0,
                      backgroundColor: theme.accentSofter,
                    }}
                  />
                ) : null}
                <View style={{ width: 40, height: 40, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: isStart || isEnd ? theme.accent : 'transparent' }}>
                  <Text style={{ fontSize: 16.5, fontWeight: isStart || isEnd ? '700' : '600', color: isStart || isEnd ? '#FFFFFF' : inRange ? theme.accent : theme.text }}>{date.getDate()}</Text>
                  {isToday && !inRange ? <View style={{ position: 'absolute', bottom: 2, width: 4, height: 4, borderRadius: radius.pill, backgroundColor: theme.accent }} /> : null}
                </View>
              </View>
            </Press>
          );
        })}
      </View>
    </View>
  );
}

export function JourneyDateRangePicker({
  theme,
  initialStart,
  initialDurationDays,
  initialFlexible = false,
  onApply,
  onClose,
}: {
  theme: Theme;
  initialStart: Date;
  initialDurationDays: number;
  initialFlexible?: boolean;
  onApply: (selection: JourneyDateRangeSelection) => void;
  onClose: () => void;
}) {
  const { t, resolved } = useI18n();
  const { width, height } = useWindowDimensions();
  const safeDuration = Math.max(1, Math.round(initialDurationDays));
  const [draftStart, setDraftStart] = useState(initialStart);
  const [draftEnd, setDraftEnd] = useState<Date | null>(() => addDays(initialStart, safeDuration));
  const [flexible, setFlexible] = useState(initialFlexible);
  const [flexibleDays, setFlexibleDays] = useState(safeDuration);
  const visibleMonths = useMemo(() => Array.from(
    { length: MONTH_RANGE * 2 + 1 },
    (_, index) => new Date(initialStart.getFullYear(), initialStart.getMonth() + index - MONTH_RANGE, 1),
  ), [initialStart]);
  const dayOptions = useMemo(() => Array.from({ length: 30 }, (_, index) => ({ value: index + 1, label: String(index + 1) })), []);

  const handleDateSelect = (selectedDate: Date) => {
    const selected = new Date(selectedDate);
    selected.setHours(draftStart.getHours(), draftStart.getMinutes(), 0, 0);
    if (draftEnd) {
      setDraftStart(selected);
      setDraftEnd(null);
      return;
    }
    if (selected <= draftStart) {
      setDraftStart(selected);
      return;
    }
    setDraftEnd(selected);
  };

  const setPickerMode = (nextFlexible: boolean) => {
    setFlexible(nextFlexible);
    if (nextFlexible) setFlexibleDays(draftEnd ? calendarDayDiff(draftStart, draftEnd) : safeDuration);
    else if (!draftEnd) setDraftEnd(addDays(draftStart, flexibleDays));
  };

  const apply = () => {
    const totalDays = flexible ? flexibleDays : draftEnd ? calendarDayDiff(draftStart, draftEnd) : 1;
    onApply({ start: draftStart, totalDays, flexible });
    onClose();
  };

  const sheetHeight = Math.max(480, Math.min(height * 0.66, 620) - space.xxxl - space.xs);
  const wheelWidth = Math.min(width - space.xxxl * 2, 420);

  return (
    <Modal transparent visible animationType="none" onRequestClose={onClose}>
      <NJBottomSheet theme={theme} onClose={onClose} full bodyScrolls backgroundColor={theme.featureSurface} bottomPadding={space.sm}>
        <View style={{ height: sheetHeight, paddingHorizontal: space.lg }}>
          <View style={{ zIndex: 2, flexDirection: 'row', alignItems: 'center', paddingVertical: space.xs, backgroundColor: theme.featureSurface }}>
            <View style={{ flex: 1, paddingRight: space.sm }}>
              <Text style={{ fontSize: 25, fontWeight: '800', letterSpacing: -0.55, color: theme.text }}>{t('journeyEdit.time.durationQuestion')}</Text>
            </View>
            <View style={{ minHeight: 44, paddingLeft: space.sm, flexDirection: 'row', alignItems: 'center', gap: space.xs }}>
              <View style={{ width: 52, height: 32, flexShrink: 0, alignItems: 'center', justifyContent: 'center' }}>
                <Switch value={flexible} onValueChange={setPickerMode} trackColor={{ false: theme.hairline, true: theme.accent }} thumbColor="#FFFFFF" ios_backgroundColor={theme.hairline} style={{ transform: [{ scale: 0.76 }] }} />
              </View>
              <Text pointerEvents="none" style={{ flexShrink: 0, paddingRight: space.xxs, fontSize: 13, fontWeight: '600', color: flexible ? theme.text : theme.text2 }}>{t('journeyEdit.time.flexibleDays')}</Text>
            </View>
          </View>

          {flexible ? (
            <View style={{ flex: 1, minHeight: 0, zIndex: 0, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }}>
              <WheelPicker
                data={dayOptions}
                value={flexibleDays}
                onValueChanging={njHapticTick}
                onValueChanged={({ item }) => setFlexibleDays(item.value)}
                itemHeight={80}
                visibleItemCount={5}
                width={wheelWidth}
                itemTextStyle={{ fontSize: 50, fontWeight: '500', letterSpacing: -1, color: theme.text }}
                overlayItemStyle={{ backgroundColor: theme.fieldSurface, borderRadius: radius.control }}
              />
            </View>
          ) : (
            <FlatList
              data={visibleMonths}
              initialScrollIndex={MONTH_RANGE}
              getItemLayout={(_, index) => ({ length: MONTH_HEIGHT, offset: MONTH_HEIGHT * index, index })}
              keyExtractor={(month) => `${month.getFullYear()}-${month.getMonth()}`}
              renderItem={({ item: month }) => <JourneyRangeMonth theme={theme} month={month} start={draftStart} end={draftEnd} resolved={resolved} onSelect={handleDateSelect} />}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingBottom: 76 }}
              initialNumToRender={3}
              maxToRenderPerBatch={4}
              windowSize={5}
            />
          )}

          <View pointerEvents="box-none" style={{ position: 'absolute', left: 0, right: 0, bottom: space.xs, zIndex: 4, alignItems: 'center' }}>
            <Press
              onPress={apply}
              accessibilityRole="button"
              style={{
                width: Math.min(width - space.xxxl * 2, 360),
                height: 56,
                borderRadius: radius.pill,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: theme.controlSurface,
                borderWidth: StyleSheet.hairlineWidth,
                borderColor: theme.fieldBorder,
                boxShadow: theme.dark ? '0px 4px 12px rgba(0,0,0,0.38)' : '0px 4px 12px rgba(0,0,0,0.08)',
              }}
            >
              <Text style={{ fontSize: 16, fontWeight: '700', color: theme.text }}>{t('journeyEdit.time.durationConfirm')}</Text>
            </Press>
          </View>
        </View>
      </NJBottomSheet>
    </Modal>
  );
}
