import React from 'react';
import { Image } from 'expo-image';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Backpack, Check, ChevronRight, CloudSun, ThumbsUp } from 'lucide-react-native';
import type { Theme } from '../../theme/theme';
import { MONO } from '../../theme/fonts';
import { radius, space, type } from '../../design-system';
import { useI18n } from '../../i18n';
import { guideText, type RouteCommunityGuide, type RouteGuidePlan } from '../../data/routeGuides';
import { useRouteWeather } from '../../hooks/useRouteWeather';
import { weatherDescription, type RouteWeatherForecast } from '../../lib/routeWeather';
import { Press } from '../Press';
import { PhotoTile } from '../PhotoTile';
import { routeGuideCopy } from './routeGuideCopy';

export function RouteGuideSectionHeader({ theme, title, action, onAction }: { theme: Theme; title: string; action?: string; onAction?: () => void }) {
  return <View style={styles.sectionHeader}>
    <Text style={[type.sectionTitle, { color: theme.text }]}>{title}</Text>
    {action && onAction ? <Press onPress={onAction} accessibilityRole="button" style={styles.sectionAction}>
      <Text style={[type.caption, { color: theme.text2 }]}>{action}</Text><ChevronRight color={theme.text3} size={14} />
    </Press> : null}
  </View>;
}

export function RouteGuideTabs<T extends string>({ theme, value, options, onChange }: { theme: Theme; value: T; options: { id: T; label: string }[]; onChange: (value: T) => void }) {
  return <View style={[styles.tabs, { borderBottomColor: theme.hairline }]}>
    {options.map((option) => <Press key={option.id} accessibilityRole="tab" accessibilityState={{ selected: value === option.id }} onPress={() => onChange(option.id)} style={[styles.tab, { borderBottomColor: value === option.id ? theme.text : 'transparent' }]}>
      <Text style={{ fontSize: 12.5, lineHeight: 19, fontWeight: value === option.id ? '700' : '400', color: value === option.id ? theme.text : theme.text2, textAlign: 'center' }}>{option.label}</Text>
    </Press>)}
  </View>;
}

export function RouteReferencePlanCard({ theme, plans, selectedId, onSelect, onOpen }: { theme: Theme; plans: RouteGuidePlan[]; selectedId: string; onSelect: (id: string) => void; onOpen: (plan: RouteGuidePlan) => void }) {
  const { resolved } = useI18n();
  const c = routeGuideCopy[resolved];
  const plan = plans.find((item) => item.id === selectedId) ?? plans[0];
  return <View style={[styles.plan, { backgroundColor: theme.groupedBg }]}>
    <View style={styles.label}><Check color={theme.accent} size={14} /><Text style={[type.caption, { color: theme.text2 }]}>{c.draft}</Text></View>
    <Text style={[styles.planTitle, { color: theme.text }]}>{guideText(plan.title, resolved)}</Text>
    <Text style={[styles.caption, { color: theme.text2 }]}>{guideText(plan.description, resolved)}</Text>
    <View style={{ marginTop: space.lg, marginBottom: space.xl }}><RouteGuideTabs theme={theme} value={plan.id} options={plans.map((p) => ({ id: p.id, label: guideText(p.shortTitle, resolved) }))} onChange={onSelect} /></View>
    {plan.days.map((day, index) => <View key={index} style={[styles.day, index < plan.days.length - 1 && { paddingBottom: space.xl }]}>
      {index < plan.days.length - 1 ? <View style={[styles.dayLine, { backgroundColor: theme.hairline }]} /> : null}
      <View style={[styles.dayNumber, { backgroundColor: theme.progressTrack }]}><Text style={{ color: theme.text2, fontSize: 10, fontFamily: MONO }}>{index + 1}</Text></View>
      <View style={{ flex: 1 }}><Text style={{ color: theme.text, fontSize: 13, lineHeight: 21, fontWeight: '600' }}>{guideText(day.title, resolved)}</Text><Text style={[styles.caption, { color: theme.text2, marginTop: space.xxs }]}>{guideText(day.summary, resolved)}</Text></View>
    </View>)}
    <View style={[styles.gearPeek, { borderTopColor: theme.hairline }]}><Backpack color={theme.text2} size={16} /><Text numberOfLines={2} style={[styles.caption, { color: theme.text2, flex: 1 }]}>{plan.gear.slice(0, 4).map((g) => guideText(g.name, resolved)).join('、')}…</Text></View>
    <Press onPress={() => onOpen(plan)} accessibilityRole="button" style={styles.openPlan}><Text style={{ color: theme.text, fontSize: 13, fontWeight: '700' }}>{c.viewPlan}</Text><ChevronRight color={theme.text2} size={17} /></Press>
    <Text style={[styles.caption, { color: theme.text3 }]}>{c.draftNote}</Text>
  </View>;
}

export function RouteGuideRow({ theme, guide, onPress, photoUri, helpful }: { theme: Theme; guide: RouteCommunityGuide; onPress: () => void; photoUri?: string; helpful?: number }) {
  const { resolved } = useI18n();
  const c = routeGuideCopy[resolved];
  return <Press onPress={onPress} accessibilityRole="button" style={styles.guide}>
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: space.md }}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={2} style={{ color: theme.text, fontSize: 15, lineHeight: 24, fontWeight: '700' }}>{guideText(guide.title, resolved)}</Text>
        <Text style={[styles.caption, { color: theme.text2, marginTop: space.xs }]}>{guide.plan.days.length}{resolved === 'zh' ? '天' : ' days'} · {c[guide.plan.stay]} · {c[guide.season]}</Text>
        <Text style={[styles.caption, { color: theme.text2, marginTop: space.xxs }]}>{c.includes}</Text>
        <Text style={[styles.caption, { color: theme.text2, marginTop: space.sm }]}>{guideText(guide.author, resolved)}</Text>
      </View>
      <PhotoTile tone={guide.plan.stay === 'camp' ? 'ridge' : 'forest'} seed={guide.id} radius={radius.card} style={{ width: 80, height: 84 }} resWidth={240}>
        {photoUri ? <RouteGuideThumb uri={photoUri} /> : null}
      </PhotoTile>
    </View>
    <View style={styles.guideFooter}><Text style={[styles.caption, { color: theme.text2 }]}>{c.travelDate} {guide.travelDate}</Text><View style={styles.label}><ThumbsUp color={theme.text2} size={12} /><Text style={[styles.caption, { color: theme.text2 }]}>{helpful ?? guide.helpful}</Text></View></View>
  </Press>;
}

function RouteGuideThumb({ uri }: { uri: string }) { return <Image source={{ uri }} contentFit="cover" style={StyleSheet.absoluteFill} />; }

export function RouteGuideEquipment({ theme, plan, community = false }: { theme: Theme; plan: RouteGuidePlan; community?: boolean }) {
  const { resolved } = useI18n();
  const c = routeGuideCopy[resolved];
  const categories = [...new Set(plan.gear.map((item) => guideText(item.category, resolved)))];
  return <View>
    <Text style={[type.sectionTitle, { color: theme.text, marginBottom: space.md }]}>{c.gearTitle}</Text>
    <Text style={[styles.body, { color: theme.text2 }]}>{community ? c.communityGearNote : c.gearNote}</Text>
    {categories.map((category) => <View key={category} style={{ marginTop: space.xl }}>
      <Text style={[type.caption, { color: theme.text2, marginBottom: space.xs }]}>{category}</Text>
      {plan.gear.filter((item) => guideText(item.category, resolved) === category).map((item) => <View key={item.name.zh} style={[styles.gearItem, { borderBottomColor: theme.hairline }]}>
        <Backpack color={theme.text3} size={18} /><View style={{ flex: 1 }}><Text style={{ color: theme.text, fontSize: 14, lineHeight: 21, fontWeight: '600' }}>{guideText(item.name, resolved)}</Text><Text style={[styles.caption, { color: theme.text2, marginTop: space.xs }]}>{guideText(item.note, resolved)}</Text></View>
      </View>)}
    </View>)}
  </View>;
}

export function RouteGuideItinerary({ theme, plan }: { theme: Theme; plan: RouteGuidePlan }) {
  const { resolved } = useI18n();
  return <View>{plan.days.map((day, index) => <View key={index} style={[styles.detailDay, { borderBottomColor: theme.hairline }]}>
    <Text style={{ color: theme.text2, fontSize: 11, fontFamily: MONO, marginBottom: space.sm }}>DAY {String(index + 1).padStart(2, '0')}</Text>
    <Text style={{ color: theme.text, fontSize: 15, lineHeight: 25, fontWeight: '700' }}>{guideText(day.title, resolved)}</Text>
    <Text style={[styles.body, { color: theme.text2, marginTop: space.sm }]}>{guideText(day.detail, resolved)}</Text>
    <View style={{ gap: space.sm, marginTop: space.lg }}>{day.items.map((item, i) => <View key={i} style={{ flexDirection: 'row', gap: space.sm, alignItems: 'flex-start' }}><Text style={{ color: theme.text3, fontSize: 13, lineHeight: 23 }}>{String(i + 1).padStart(2, '0')}</Text><Text style={{ flex: 1, color: theme.text2, fontSize: 13, lineHeight: 23 }}>{guideText(item, resolved)}</Text></View>)}</View>
  </View>)}</View>;
}

export function RouteWeatherCard({ theme, lng, lat, onPress }: { theme: Theme; lng: number; lat: number; onPress: () => void }) {
  const { resolved } = useI18n();
  const c = routeGuideCopy[resolved];
  const { forecast, loading, retry } = useRouteWeather(lng, lat);
  const today = forecast?.days[0];
  return <View style={[styles.weather, { backgroundColor: theme.groupedBg }]}>
    {loading ? <View style={styles.weatherLine}><ActivityIndicator color={theme.text2} size="small" /><Text style={{ color: theme.text2, fontSize: 13 }}>{c.weather}</Text></View> : today ? <Press onPress={onPress} accessibilityRole="button" style={styles.weatherLine}>
      <CloudSun color={theme.text2} size={25} /><View style={{ flex: 1 }}><Text style={{ color: theme.text, fontSize: 14, fontWeight: '600', lineHeight: 22 }}>{c.weather} · {weatherDescription(today.code, resolved)}</Text><Text style={[styles.caption, { color: theme.text2, marginTop: space.xxs }]}>{Math.round(today.min)}–{Math.round(today.max)}°{today.rain != null ? ` · ${c.rain} ${today.rain}%` : ''}</Text></View><ChevronRight color={theme.text3} size={15} />
    </Press> : <View style={styles.weatherLine}><CloudSun color={theme.text3} size={25} /><Text style={{ flex: 1, color: theme.text2, fontSize: 13 }}>{c.weatherUnavailable}</Text><Press onPress={retry} style={{ paddingVertical: space.sm, paddingHorizontal: space.xs }}><Text style={{ color: theme.accent, fontSize: 12 }}>{c.retry}</Text></Press></View>}
  </View>;
}

export function RouteWeatherDetails({ theme, forecast }: { theme: Theme; forecast: RouteWeatherForecast }) {
  const { resolved } = useI18n(); const c = routeGuideCopy[resolved];
  return <View>
    <View style={{ gap: space.sm }}>{forecast.days.map((day) => <View key={day.date} style={[styles.weatherDetail, { backgroundColor: theme.groupedBg }]}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: space.sm }}><Text style={{ color: theme.text, fontSize: 13 }}>{day.date}</Text><Text style={{ color: theme.text, fontSize: 13 }}>{weatherDescription(day.code, resolved)} · {Math.round(day.min)}–{Math.round(day.max)}°</Text></View>
      <Text style={[styles.caption, { color: theme.text2, marginTop: space.sm }]}>{c.rain} {day.rain == null ? '—' : `${day.rain}%`} · {c.wind} {day.wind == null ? '—' : `${Math.round(day.wind)} km/h`}</Text>
    </View>)}</View>
    <Text style={[styles.body, { color: theme.text2, marginTop: space.xl }]}>{c.weatherScope}</Text>
    <Text style={[styles.caption, { color: theme.text2, marginTop: space.lg }]}>{c.weatherSource}{'\n'}{c.updated} {new Date(forecast.fetchedAt).toLocaleString(resolved === 'zh' ? 'zh-CN' : 'en-US')}</Text>
  </View>;
}

const styles = StyleSheet.create({
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm, marginBottom: space.lg },
  sectionAction: { flexDirection: 'row', alignItems: 'center', gap: space.xxs, minHeight: 44 },
  tabs: { flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth, gap: space.sm },
  tab: { flex: 1, minHeight: 44, paddingVertical: space.sm, borderBottomWidth: 2, alignItems: 'center', justifyContent: 'center' },
  plan: { padding: space.lg, paddingTop: space.xl, borderRadius: radius.feature },
  label: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  planTitle: { fontSize: 22, lineHeight: 30, fontWeight: '800', letterSpacing: -0.5, marginTop: space.lg, marginBottom: space.xs },
  caption: { fontSize: 11.5, lineHeight: 19 }, body: { fontSize: 14.5, lineHeight: 27 },
  day: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md },
  dayNumber: { width: 24, height: 24, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  dayLine: { position: 'absolute', left: 11.5, top: 26, bottom: 0, width: StyleSheet.hairlineWidth },
  gearPeek: { marginTop: space.xl, paddingTop: space.lg, flexDirection: 'row', alignItems: 'center', gap: space.xs, borderTopWidth: StyleSheet.hairlineWidth },
  openPlan: { minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.md },
  guide: { paddingVertical: space.xl }, guideFooter: { marginTop: space.md, flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap', gap: space.xs },
  gearItem: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md, paddingVertical: space.lg, borderBottomWidth: StyleSheet.hairlineWidth },
  detailDay: { paddingVertical: space.xl, borderBottomWidth: StyleSheet.hairlineWidth },
  weather: { borderRadius: radius.card, paddingHorizontal: space.md },
  weatherLine: { flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 84, paddingVertical: space.md },
  weatherDetail: { padding: space.lg, borderRadius: radius.card },
});
