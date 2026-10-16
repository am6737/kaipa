import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, Switch, Text, View } from 'react-native';
import * as Crypto from 'expo-crypto';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CalendarDays } from 'lucide-react-native';
import { DetailPage, layout, radius, space, type } from '../../design-system';
import { useI18n } from '../../i18n';
import { useData } from '../../data/DataContext';
import { useOfficialItineraries } from '../../hooks/useOfficialItineraries';
import { assembleItinerary, type AssembledDay } from '../../lib/officialItinerary';
import { supabase } from '../../lib/supabase';
import { useNav, type ItineraryPreviewRequest } from '../../nav/NavContext';
import type { Theme } from '../../theme/theme';
import { Press } from '../Press';
import { NJMiniCalendar } from '../overlays/NewJourneyParts';

const isoDate = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const dateFromIso = (value: string) => { const [year, month, day] = value.split('-').map(Number); return new Date(year, month - 1, day); };

export function OfficialItineraryPreview({ theme, request, onClose }: { theme: Theme; request: ItineraryPreviewRequest; onClose: () => void }) {
  const { t } = useI18n();
  const nav = useNav();
  const { userId, refetchJourneys } = useData();
  const insets = useSafeAreaInsets();
  const { plans, loading, error, refetch } = useOfficialItineraries(request.route.id);
  const [selectedId, setSelectedId] = useState(request.planId ?? '');
  const [trekStartDate, setTrekStartDate] = useState<string | null>(request.trekStartDate ?? null);
  const [includeAccess, setIncludeAccess] = useState(true);
  const [dateOpen, setDateOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const requestId = useRef(Crypto.randomUUID());
  const openedEvent = useRef(false);
  const preferred = request.preferredHikeDays == null ? plans[0] : plans.reduce((best, plan) => {
    const count = plan.payload.days.filter(day => day.kind === 'hike').length;
    const bestCount = best.payload.days.filter(day => day.kind === 'hike').length;
    return Math.abs(count - request.preferredHikeDays!) < Math.abs(bestCount - request.preferredHikeDays!) ? plan : best;
  }, plans[0]);
  const plan = plans.find(item => item.id === selectedId) ?? preferred;
  const assembled = useMemo(() => plan ? assembleItinerary(plan, {
    name: request.route.name,
    bestMonths: request.route.bestMonths ?? null,
    seasonNote: request.route.seasonNote ?? null,
  }, { trekStartDate, includeAccess }) : null, [plan, request.route, trekStartDate, includeAccess]);

  useEffect(() => {
    if (!plan || openedEvent.current) return;
    openedEvent.current = true;
    void supabase.from('itinerary_events').insert({ user_id: userId, event: 'preview_opened', itinerary_id: plan.id, version: plan.version, route_id: plan.routeId, entry: request.entry }).then(() => undefined);
  }, [plan, request.entry, userId]);
  // A request id covers retries of one choice; changing plan, date or access starts a new save.
  useEffect(() => { requestId.current = Crypto.randomUUID(); }, [plan?.id, plan?.version, trekStartDate, includeAccess]);

  const save = async () => {
    if (!plan || savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    try {
      const { data, error: saveError } = await supabase.rpc('create_journey_from_itinerary', {
        p_itinerary_id: plan.id, p_version: plan.version, p_trek_start_date: trekStartDate,
        p_include_access: includeAccess, p_request_id: requestId.current, p_entry: request.entry,
      });
      if (saveError) throw saveError;
      const journeys = await refetchJourneys();
      const saved = journeys.find(item => item.id === data);
      if (!saved) throw new Error(t('officialItinerary.saveError'));
      onClose();
      if (request.entry === 'form') nav.closeNewJourney();
      else if (request.entry === 'chat') nav.closeAssistant();
      else nav.closeRouteGuide();
      nav.openPoint(saved);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : String((caught as { message?: string })?.message ?? '');
      if (message.includes('itinerary_not_published')) {
        Alert.alert(t('officialItinerary.updatedTitle'), t('officialItinerary.updatedMessage'));
        void refetch();
      } else Alert.alert(t('officialItinerary.saveError'), message);
    } finally { savingRef.current = false; setSaving(false); }
  };

  const section = (title: string, children: React.ReactNode) => <View style={{ marginTop: space.xxl }}><Text style={[type.sectionTitle, { color: theme.text, marginBottom: space.md }]}>{title}</Text>{children}</View>;
  const dayRow = (day: AssembledDay) => <View key={day.dayNumber} style={{ paddingVertical: space.xl, borderBottomWidth: 1, borderBottomColor: theme.hairline }}>
    <Text style={[type.dayLabel, { color: theme.text }]}>{t('officialItinerary.day', { count: day.dayNumber })}{day.dateLabel ? `  ${day.dateLabel}` : ''}  {day.kindLabel}</Text>
    <Text style={[type.readingSummary, { color: theme.text, marginTop: space.xs }]}>{day.title}</Text>
    {day.distanceKm != null || day.ascentM != null || day.descentM != null ? <Text style={[type.meta, { color: theme.text2, marginTop: space.xs }]}>{[
      day.distanceKm != null ? t('officialItinerary.distance', { count: day.distanceKm }) : null,
      day.ascentM != null ? t('officialItinerary.ascent', { count: day.ascentM }) : null,
      day.descentM != null ? t('officialItinerary.descent', { count: day.descentM }) : null,
    ].filter(Boolean).join('  ')}</Text> : null}
    {day.transfers.map((transfer, index) => <Text key={index} style={[type.step, { color: theme.text2, marginTop: space.xs }]}>{[`${transfer.from} → ${transfer.to}`, transfer.duration, transfer.costRef, transfer.booking].filter(Boolean).join('，')}</Text>)}
    {day.stay ? <Text style={[type.step, { color: theme.text2, marginTop: space.xs }]}>{t('officialItinerary.stay', { name: day.stay.name })}{[day.stay.altitudeM != null ? `${day.stay.altitudeM} m` : null, day.stay.water, day.stay.costRef, day.stay.signal].filter(Boolean).length ? `，${[day.stay.altitudeM != null ? `${day.stay.altitudeM} m` : null, day.stay.water, day.stay.costRef, day.stay.signal].filter(Boolean).join('，')}` : ''}</Text> : null}
    {day.supply ? <Text style={[type.step, { color: theme.text2, marginTop: space.xs }]}>{day.supply}</Text> : null}
    {day.tip ? <Text style={[type.step, { color: theme.text2, marginTop: space.xs }]}>{t('officialItinerary.tip', { text: day.tip })}</Text> : null}
    {day.bailout ? <Text style={[type.step, { color: theme.text2, marginTop: space.xs }]}>{day.bailout}</Text> : null}
  </View>;

  return <Modal visible animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
    <View style={{ flex: 1, backgroundColor: theme.featureSurface }}>
      <DetailPage theme={theme} title={t('officialItinerary.title')} onBack={onClose} backgroundColor={theme.featureSurface} flatChrome scrollable={false} overlay={assembled ? <View style={{ paddingHorizontal: space.xl, paddingTop: space.md, paddingBottom: Math.max(insets.bottom, space.md), backgroundColor: theme.controlSurface, borderTopWidth: 1, borderColor: theme.hairline, flexDirection: 'row', gap: space.sm }}>
        <Press onPress={() => setDateOpen(true)} accessibilityRole="button" style={{ minHeight: 48, paddingHorizontal: space.md, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: space.xs, backgroundColor: theme.fieldSurface }}><CalendarDays size={18} color={theme.text} /><Text style={[type.cardTitle, { color: theme.text }]}>{t('officialItinerary.changeDate')}</Text></Press>
        <Press disabled={saving} onPress={() => void save()} accessibilityRole="button" style={{ flex: 1, minHeight: 48, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.accent }}><Text style={[type.cardTitle, { color: '#FFFFFF' }]}>{saving ? t('officialItinerary.saving') : t('officialItinerary.save')}</Text></Press>
      </View> : undefined}>
        <ScrollView contentContainerStyle={{ paddingHorizontal: space.xl, paddingTop: space.xl, paddingBottom: insets.bottom + 130 }}>
          {loading && !plan ? <ActivityIndicator color={theme.accent} /> : null}
          {error ? <Press onPress={() => void refetch()}><Text style={[type.body, { color: theme.danger }]}>{t('officialItinerary.loadError')}  {t('officialItinerary.retry')}</Text></Press> : null}
          {assembled ? <>
            <Text style={[type.pageTitle, { color: theme.text }]}>{assembled.header.routeName}</Text>
            <Text style={[type.sectionTitle, { color: theme.text, marginTop: space.xs }]}>{assembled.header.planName}</Text>
            <Text style={[type.meta, { color: theme.text2, marginTop: space.md }]}>{assembled.header.countsLine}  {assembled.header.dateLine}</Text>
            <Text style={[type.meta, { color: theme.text2, marginTop: space.xs }]}>{t('officialItinerary.difficulty')}：{assembled.header.difficulty}  {t('officialItinerary.audience')}：{assembled.header.audience}</Text>
            {assembled.summary ? section(t('officialItinerary.summary'), <Text style={[type.reading, { color: theme.text2 }]}>{assembled.summary}</Text>) : null}
            <View style={{ marginTop: space.md }}>{assembled.days.map(dayRow)}</View>
            {assembled.transportNote ? <Text style={[type.reading, { color: theme.text2, marginTop: space.xl }]}>{assembled.transportNote}</Text> : null}
            {assembled.accessToggle ? <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: space.xl }}><Text style={[type.cardTitle, { color: theme.text, flex: 1 }]}>{assembled.accessToggle.label}</Text><Switch value={includeAccess} onValueChange={setIncludeAccess} trackColor={{ true: theme.accent, false: theme.fieldSurface }} /></View> : null}
            {assembled.season ? section(t('officialItinerary.season'), <><Text style={[type.reading, { color: theme.text2 }]}>{assembled.season.line}</Text>{assembled.season.seasonNote ? <Text style={[type.reading, { color: theme.text2 }]}>{assembled.season.seasonNote}</Text> : null}</>) : null}
            {plans.length > 1 ? section(t('officialItinerary.switchPlan'), plans.map(item => <Press key={item.id} onPress={() => { setSelectedId(item.id); setIncludeAccess(true); }} accessibilityRole="button" accessibilityState={{ selected: item.id === plan?.id }} style={{ minHeight: layout.listRowMinHeight, justifyContent: 'center', paddingVertical: space.sm, borderBottomWidth: 1, borderColor: theme.hairline }}><Text style={[type.cardTitle, { color: item.id === plan?.id ? theme.accent : theme.text }]}>{item.payload.name}</Text><Text style={[type.meta, { color: theme.text2, marginTop: space.xxs }]}>{t('officialItinerary.hikeDays', { count: item.payload.days.filter(day => day.kind === 'hike').length })}  {t('officialItinerary.difficulty')}：{item.payload.difficulty}</Text></Press>)) : null}
            {assembled.notes.length ? section(t('officialItinerary.notes'), assembled.notes.map((note, index) => <Text key={index} style={[type.reading, { color: theme.text2 }]}>{index + 1}. {note}</Text>)) : null}
            <Text style={[type.meta, { color: theme.text3, marginTop: space.xxl }]}>{t('officialItinerary.source')}：{assembled.sourceLabel}</Text>
          </> : null}
        </ScrollView>
      </DetailPage>
      {dateOpen ? <Modal transparent animationType="slide" onRequestClose={() => setDateOpen(false)}><View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: theme.dark ? 'rgba(0,0,0,0.72)' : 'rgba(20,20,24,0.38)' }}><Pressable accessibilityRole="button" accessibilityLabel={t('officialItinerary.confirmDate')} onPress={() => setDateOpen(false)} style={{ flex: 1 }} /><View style={{ maxHeight: '75%', backgroundColor: theme.surfaceTop, borderTopLeftRadius: radius.showcase, borderTopRightRadius: radius.showcase, padding: space.xl }}><Text style={[type.sectionTitle, { color: theme.text, marginBottom: space.md }]}>{t('officialItinerary.trekStart')}</Text><ScrollView><NJMiniCalendar theme={theme} selectedDate={trekStartDate ? dateFromIso(trekStartDate) : new Date()} onSelect={(date) => setTrekStartDate(isoDate(date))} allowPast /></ScrollView><View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: space.md }}><Press onPress={() => { setTrekStartDate(null); setDateOpen(false); }} style={{ minHeight: layout.iconButton, justifyContent: 'center' }}><Text style={[type.cardTitle, { color: theme.text2 }]}>{t('officialItinerary.unsetDate')}</Text></Press><Press onPress={() => setDateOpen(false)} style={{ minHeight: layout.iconButton, justifyContent: 'center' }}><Text style={[type.cardTitle, { color: theme.accent }]}>{t('officialItinerary.confirmDate')}</Text></Press></View></View></View></Modal> : null}
    </View>
  </Modal>;
}
