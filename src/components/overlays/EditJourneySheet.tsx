import React, { useMemo, useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Theme } from '../../theme/theme';
import { Poi } from '../../data/pois';
import { JourneyPatch } from '../../nav/NavContext';
import { Press } from '../Press';
import { Icon } from '../Icon';
import { FullOverlay } from './FullOverlay';
import { useI18n } from '../../i18n';
import { NJWheelPicker, NJDateWheelPicker, njFormatTime } from './NewJourneyParts';

// ── Shared small components ──

function Group({ theme, title, footer, children }: { theme: Theme; title?: string; footer?: string; children: React.ReactNode }) {
  return (
    <View>
      {title ? (
        <Text style={{ fontSize: 12, fontWeight: '700', color: theme.text3, letterSpacing: 0.6, marginBottom: 9, marginLeft: 4 }}>{title}</Text>
      ) : null}
      <View
        style={{
          borderRadius: 16,
          overflow: 'hidden',
          backgroundColor: theme.dark ? '#1c1c1e' : '#fff',
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: theme.hairline,
        }}
      >
        {children}
      </View>
      {footer ? <Text style={{ fontSize: 11.5, color: theme.text3, lineHeight: 17, marginTop: 9, marginLeft: 6 }}>{footer}</Text> : null}
    </View>
  );
}

function Field({
  theme, label, value, onChange, placeholder, multiline, last,
}: {
  theme: Theme; label?: string; value: string; onChange: (v: string) => void;
  placeholder?: string; multiline?: boolean; last?: boolean;
}) {
  return (
    <>
      <View style={{ flexDirection: multiline ? 'column' : 'row', alignItems: multiline ? 'stretch' : 'center', paddingHorizontal: 14, paddingVertical: multiline ? 13 : 0, minHeight: 52 }}>
        {label ? <Text style={{ width: multiline ? undefined : 72, fontSize: 14.5, color: theme.text2 }}>{label}</Text> : null}
        <TextInput
          value={value} onChangeText={onChange} placeholder={placeholder} placeholderTextColor={theme.text3} multiline={multiline}
          style={{ flex: multiline ? undefined : 1, fontSize: 15.5, color: theme.text, padding: 0, minHeight: multiline ? 84 : undefined, lineHeight: multiline ? 22 : undefined, textAlignVertical: multiline ? 'top' : 'center' }}
        />
      </View>
      {!last ? <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: theme.hairline, marginLeft: 14 }} /> : null}
    </>
  );
}

function DateField({ theme, label, value, placeholder, onPress, last }: {
  theme: Theme; label: string; value: string; placeholder: string; onPress: () => void; last?: boolean;
}) {
  return (
    <>
      <Press onPress={onPress}>
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, minHeight: 52 }}>
          <Text style={{ width: 72, fontSize: 14.5, color: theme.text2 }}>{label}</Text>
          <Text style={{ flex: 1, fontSize: 15.5, color: value ? theme.text : theme.text3 }}>{value || placeholder}</Text>
        </View>
      </Press>
      {!last ? <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: theme.hairline, marginLeft: 14 }} /> : null}
    </>
  );
}

// ── Helpers ──

const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

const DAY_MS = 86400000;

function parseRange(str: string): { start: Date | null; end: Date | null } {
  if (!str) return { start: null, end: null };
  const parts = str.split(/[–\-—]/);
  const parse1 = (s: string): Date | null => {
    const ymd = s.match(/(\d{4})\D+(\d{1,2})\D+(\d{1,2})/);
    if (ymd) return new Date(+ymd[1], +ymd[2] - 1, +ymd[3]);
    const md = s.match(/(\d{1,2})\D+(\d{1,2})/);
    if (md) return new Date(new Date().getFullYear(), +md[1] - 1, +md[2]);
    const ym = s.match(/(\d{4})\D+(\d{1,2})/);
    if (ym) return new Date(+ym[1], +ym[2] - 1, 1);
    return null;
  };
  const s = parse1(parts[0]);
  const e = parts.length > 1 ? parse1(parts[1]) : null;
  return { start: s, end: e };
}

// ── Range calendar with capsule highlight ──

function RangeCalendar({ theme, start, end, onSelect, allowPast, onHeaderPress, cursor, setCursor }: {
  theme: Theme; start: Date | null; end: Date | null; onSelect: (d: Date) => void; allowPast?: boolean;
  onHeaderPress: () => void; cursor: Date; setCursor: (d: Date) => void;
}) {
  const { t } = useI18n();
  const today = useMemo(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }, []);

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startOffset = firstDay.getDay();
  const daysInMonth = lastDay.getDate();
  const cells: (number | null)[] = [];
  for (let i = 0; i < startOffset; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  const canPrev = allowPast || !(year === today.getFullYear() && month === today.getMonth());

  return (
    <View>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10, paddingHorizontal: 2 }}>
        <Press onPress={() => canPrev && setCursor(new Date(year, month - 1, 1))} style={{ width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', opacity: canPrev ? 1 : 0.35 }}>
          <Icon name="chevronL" color={theme.accent} size={16} />
        </Press>
        <Press onPress={onHeaderPress} style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
          <Text style={{ fontSize: 16, fontWeight: '700', color: theme.accent, letterSpacing: -0.2 }}>
            {t('journeyEdit.calendar.monthHeader', { year, month: month + 1 })}
          </Text>
          <Text style={{ fontSize: 10, color: theme.accent }}>▼</Text>
        </Press>
        <Press onPress={() => setCursor(new Date(year, month + 1, 1))} style={{ width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="chevronR" color={theme.accent} size={16} />
        </Press>
      </View>

      <View style={{ flexDirection: 'row', marginBottom: 6 }}>
        {[t('journeyEdit.weekday.sun'), t('journeyEdit.weekday.mon'), t('journeyEdit.weekday.tue'), t('journeyEdit.weekday.wed'), t('journeyEdit.weekday.thu'), t('journeyEdit.weekday.fri'), t('journeyEdit.weekday.sat')].map((w, i) => (
          <View key={i} style={{ flex: 1, height: 24, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontSize: 11, fontWeight: '700', color: i === 0 || i === 6 ? '#FF5C3A' : theme.text2, letterSpacing: 0.4 }}>{w}</Text>
          </View>
        ))}
      </View>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
        {cells.map((d, i) => {
          if (d === null) return <View key={i} style={{ width: `${100 / 7}%`, height: 40 }} />;
          const date = new Date(year, month, d);
          const isToday = sameDay(date, today);
          const isPast = !allowPast && date < today;
          const col = i % 7;
          const weekend = col === 0 || col === 6;

          const isStart = start ? sameDay(date, start) : false;
          const isEnd = end ? sameDay(date, end) : false;
          const hasRange = start !== null && end !== null;
          const inRange = hasRange && date > start! && date < end!;
          const inCapsule = isStart || isEnd || inRange;
          const solo = inCapsule && !hasRange;
          const roundL = solo || isStart || (inCapsule && col === 0);
          const roundR = solo || isEnd || (inCapsule && col === 6);
          const R = 20;
          const bleedL = inCapsule && !roundL ? -1 : 0;
          const bleedR = inCapsule && !roundR ? -1 : 0;

          const cell = (
            <View style={{ height: 40, marginLeft: bleedL, marginRight: bleedR, alignItems: 'center', justifyContent: 'center', backgroundColor: inCapsule ? theme.accent : 'transparent', borderTopLeftRadius: roundL ? R : 0, borderBottomLeftRadius: roundL ? R : 0, borderTopRightRadius: roundR ? R : 0, borderBottomRightRadius: roundR ? R : 0, opacity: isPast ? 0.28 : 1 }}>
              <Text style={{ fontSize: 15, fontWeight: inCapsule || isToday ? '700' : '500', color: inCapsule ? '#fff' : isToday ? theme.accent : weekend ? '#FF5C3A' : theme.text }}>{d}</Text>
              {isToday && !inCapsule ? <View style={{ position: 'absolute', bottom: 3, width: 4, height: 4, borderRadius: 2, backgroundColor: theme.accent }} /> : null}
            </View>
          );
          return (
            <View key={i} style={{ width: `${100 / 7}%` }}>
              {isPast ? cell : <Pressable onPress={() => { Haptics.selectionAsync(); onSelect(date); }}>{cell}</Pressable>}
            </View>
          );
        })}
      </View>
    </View>
  );
}

// ── Date range picker sheet ──

type DateView = 'calendar' | 'wheel';
type PickerMode = 'date' | 'time';

function DateRangeSheet({ theme, initStart, initEnd, allowPast, onPick, onClose }: {
  theme: Theme; initStart: Date | null; initEnd: Date | null; allowPast?: boolean;
  onPick: (start: Date, end: Date | null) => void; onClose: () => void;
}) {
  const { t } = useI18n();
  const [start, setStart] = useState<Date | null>(initStart);
  const [end, setEnd] = useState<Date | null>(initEnd);
  const [row, setRow] = useState<'start' | 'end'>('start');
  const [mode, setMode] = useState<PickerMode>('date');
  const [dateView, setDateView] = useState<DateView>('calendar');
  const activeDt = row === 'start' ? start : end;
  const initMonth = activeDt || new Date();
  const [cursor, setCursor] = useState(() => new Date(initMonth.getFullYear(), initMonth.getMonth(), 1));

  const tap = (r: 'start' | 'end', m: PickerMode) => {
    setRow(r);
    setMode(m);
    if (m === 'date') setDateView('calendar');
  };

  const handleCalendarSelect = (d: Date) => {
    const merged = new Date(d);
    if (activeDt) { merged.setHours(activeDt.getHours()); merged.setMinutes(activeDt.getMinutes()); }
    merged.setSeconds(0); merged.setMilliseconds(0);
    if (row === 'start') {
      setStart(merged);
      if (!end) setRow('end');
      else if (end <= merged) setEnd(null);
    } else {
      if (start && merged <= start) return;
      setEnd(merged);
    }
  };

  const handleDateWheelChange = (y: number, m: number, d: number) => {
    const cur = activeDt || new Date();
    const next = new Date(y, m - 1, d, cur.getHours(), cur.getMinutes(), 0, 0);
    if (row === 'start') { setStart(next); if (end && end <= next) setEnd(null); }
    else { if (start && next <= start) return; setEnd(next); }
    setCursor(new Date(y, m - 1, 1));
  };

  const handleTimeChange = (mins: number) => {
    if (!activeDt) return;
    const d = new Date(activeDt); d.setHours(Math.floor(mins / 60)); d.setMinutes(mins % 60); d.setSeconds(0);
    if (row === 'start') { setStart(d); if (end && end <= d) setEnd(null); }
    else { if (start && d <= start) return; setEnd(d); }
  };

  const timeMins = activeDt ? activeDt.getHours() * 60 + activeDt.getMinutes() : 8 * 60;
  const fmtFullDate = (d: Date) => `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
  const canDone = start !== null;

  const RowItem = ({ k, label }: { k: 'start' | 'end'; label: string }) => {
    const dt = k === 'start' ? start : end;
    const isRow = row === k;
    const dateOn = isRow && mode === 'date';
    const timeOn = isRow && mode === 'time';
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', minHeight: 56 }}>
        <Text style={{ width: 50, fontSize: 15, fontWeight: '500', color: theme.text2 }}>{label}</Text>
        <Press onPress={() => tap(k, 'date')} style={{ flex: 1, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: dateOn ? theme.accent : theme.dark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.045)' }}>
          <Text style={{ fontSize: 15.5, fontWeight: '600', color: dateOn ? '#fff' : dt ? theme.text : theme.text3 }}>
            {dt ? fmtFullDate(dt) : '选择日期'}
          </Text>
        </Press>
        <View style={{ width: 10 }} />
        <Press onPress={() => dt ? tap(k, 'time') : undefined} style={{ width: 72, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: timeOn ? theme.accent : 'transparent', borderWidth: StyleSheet.hairlineWidth, borderColor: timeOn ? theme.accent : theme.hairline }}>
          <Text style={{ fontSize: 15.5, fontWeight: '600', color: timeOn ? '#fff' : dt ? theme.text : theme.text3 }}>
            {dt ? njFormatTime(dt) : '--:--'}
          </Text>
        </Press>
      </View>
    );
  };

  return (
    <View style={[StyleSheet.absoluteFill, { justifyContent: 'center', alignItems: 'center', zIndex: 200 }]}>
      <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.4)' }]} onPress={onClose} />
      <View style={{
        width: '88%',
        backgroundColor: theme.bg,
        borderRadius: 24,
        paddingTop: 20,
        paddingBottom: 16,
        paddingHorizontal: 20,
        boxShadow: '0px 8px 40px rgba(0,0,0,0.18)',
      }}>
        <Text style={{ textAlign: 'center', fontSize: 17, fontWeight: '700', color: theme.text, marginBottom: 16 }}>{t('journeyEdit.calendar.rangeTitle')}</Text>

        <RowItem k="start" label={t('journeyEdit.time.start')} />
        <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: theme.hairline, marginVertical: 2 }} />
        <RowItem k="end" label={t('journeyEdit.time.end')} />
        <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: theme.hairline, marginTop: 12, marginBottom: 14 }} />

        <View style={{ height: 320 }}>
          {mode === 'date' ? (
            dateView === 'calendar' ? (
              <RangeCalendar theme={theme} start={start} end={end} onSelect={handleCalendarSelect} allowPast={allowPast} onHeaderPress={() => setDateView('wheel')} cursor={cursor} setCursor={setCursor} />
            ) : (
              <View>
                <Press onPress={() => setDateView('calendar')} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, marginBottom: 12 }}>
                  <Text style={{ fontSize: 16, fontWeight: '700', color: theme.accent }}>
                    {t('journeyEdit.calendar.monthHeader', { year: activeDt ? activeDt.getFullYear() : new Date().getFullYear(), month: activeDt ? activeDt.getMonth() + 1 : new Date().getMonth() + 1 })}
                  </Text>
                  <Text style={{ fontSize: 10, color: theme.accent }}>▲</Text>
                </Press>
                <NJDateWheelPicker theme={theme} year={activeDt ? activeDt.getFullYear() : new Date().getFullYear()} month={activeDt ? activeDt.getMonth() + 1 : new Date().getMonth() + 1} day={activeDt ? activeDt.getDate() : new Date().getDate()} onChange={handleDateWheelChange} />
              </View>
            )
          ) : (
            <NJWheelPicker theme={theme} value={timeMins} onChange={handleTimeChange} />
          )}
        </View>

        <View style={{ flexDirection: 'row', marginTop: 16, borderTopWidth: StyleSheet.hairlineWidth, borderColor: theme.hairline, paddingTop: 12 }}>
          <Press onPress={onClose} style={{ flex: 1, alignItems: 'center', paddingVertical: 6 }}>
            <Text style={{ fontSize: 15.5, fontWeight: '500', color: theme.text2 }}>{t('common.cancel')}</Text>
          </Press>
          <View style={{ width: StyleSheet.hairlineWidth, backgroundColor: theme.hairline }} />
          <Press onPress={() => { if (canDone) { onPick(start!, end); onClose(); } }} style={{ flex: 1, alignItems: 'center', paddingVertical: 6 }}>
            <Text style={{ fontSize: 15.5, fontWeight: '700', color: canDone ? theme.accent : theme.text3 }}>{t('common.done')}</Text>
          </Press>
        </View>
      </View>
    </View>
  );
}

// ── Main edit sheet ──

export function EditJourneySheet({ theme, poi, onClose, onSave }: {
  theme: Theme; poi: Poi; onClose: () => void; onSave: (patch: JourneyPatch) => void;
}) {
  const { t } = useI18n();
  const [name, setName] = useState(poi.name || '');
  const [region, setRegion] = useState(poi.region || '');
  const [date, setDate] = useState(poi.date || '');
  const [planned, setPlanned] = useState(poi.plannedDate || '');
  const [desc, setDesc] = useState(poi.desc || '');
  const [showDatePicker, setShowDatePicker] = useState(false);
  const isPlanning = poi.status === 'planning';

  const fmtRange = (s: Date, e: Date | null) => {
    // 行程跨天，日期只展示到「日」，不带时分
    const fmtD = (d: Date) => `${d.getMonth() + 1}月${d.getDate()}日`;
    if (!e || sameDay(s, e)) return fmtD(s);
    return `${fmtD(s)} – ${fmtD(e)}`;
  };

  const handleDatePick = (s: Date, e: Date | null) => {
    const str = fmtRange(s, e);
    if (isPlanning) setPlanned(str); else setDate(str);
  };

  const currentField = isPlanning ? planned : date;
  const parsed = parseRange(currentField);
  const computedDays = parsed.start && parsed.end ? Math.round((parsed.end.getTime() - parsed.start.getTime()) / DAY_MS) + 1 : null;

  const dirty = name.trim() !== (poi.name || '') || region.trim() !== (poi.region || '') || date.trim() !== (poi.date || '') || planned.trim() !== (poi.plannedDate || '') || desc.trim() !== (poi.desc || '');
  const canSave = name.trim().length > 0 && dirty;

  const save = () => {
    if (!canSave) { onClose(); return; }
    const patch: JourneyPatch = { name: name.trim(), region: region.trim(), days: computedDays ? t('journeyEdit.meta.days', { count: computedDays }) : '', desc: desc.trim() };
    if (isPlanning) patch.plannedDate = planned.trim(); else patch.date = date.trim();
    onSave(patch);
  };

  const rightAction = (
    <Press onPress={save} disabled={!canSave} style={{ paddingHorizontal: 4 }}>
      <Text style={{ fontSize: 16, fontWeight: '700', color: canSave ? theme.accent : theme.text3 }}>{t('common.save')}</Text>
    </Press>
  );

  return (
    <>
      <FullOverlay theme={theme} title={t('journeyEdit.editTitle')} onClose={onClose} rightAction={rightAction} zIndex={160}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={{ padding: 16, gap: 22 }}>
            <Group theme={theme} title={t('journeyEdit.sectionBasic')}>
              <Field theme={theme} label={t('journeyEdit.fieldName')} value={name} onChange={setName} placeholder={t('journeyEdit.placeholderName')} />
              <Field theme={theme} label={t('journeyEdit.fieldRegion')} value={region} onChange={setRegion} placeholder={t('journeyEdit.placeholderRegion')} last />
            </Group>
            <Group theme={theme} title={t('journeyEdit.sectionItinerary')}>
              {isPlanning ? (
                <DateField theme={theme} label={t('journeyEdit.fieldPlannedStart')} value={planned} placeholder={t('journeyEdit.placeholderPlannedStart')} onPress={() => setShowDatePicker(true)} last={!computedDays} />
              ) : (
                <DateField theme={theme} label={t('journeyEdit.fieldDate')} value={date} placeholder={t('journeyEdit.placeholderDate')} onPress={() => setShowDatePicker(true)} last={!computedDays} />
              )}
              {computedDays ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, minHeight: 44 }}>
                  <Text style={{ width: 72, fontSize: 14.5, color: theme.text2 }}>{t('journeyEdit.fieldDays')}</Text>
                  <Text style={{ flex: 1, fontSize: 15.5, color: theme.text3 }}>{t('journeyEdit.meta.days', { count: computedDays })}</Text>
                </View>
              ) : null}
            </Group>
            <Group theme={theme} title={t('journeyEdit.sectionDesc')} footer={t('journeyEdit.descFooter')}>
              <Field theme={theme} value={desc} onChange={setDesc} placeholder={t('journeyEdit.placeholderDesc')} multiline last />
            </Group>
          </View>
        </KeyboardAvoidingView>
      </FullOverlay>
      {showDatePicker ? (
        <DateRangeSheet theme={theme} initStart={parsed.start} initEnd={parsed.end} allowPast={!isPlanning} onPick={handleDatePick} onClose={() => setShowDatePicker(false)} />
      ) : null}
    </>
  );
}
