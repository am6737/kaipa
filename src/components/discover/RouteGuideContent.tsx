import React from 'react';
import { Image } from 'expo-image';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Backpack, Check, ChevronRight, CloudSun, Heart, ThumbsUp } from 'lucide-react-native';
import type { Theme } from '../../theme/theme';
import { MONO } from '../../theme/fonts';
import { radius, space, type } from '../../design-system';
import { useI18n } from '../../i18n';
import { guideText, type RouteCommunityGuide, type RouteGuidePlan } from '../../data/routeGuides';
import { useRouteWeather } from '../../hooks/useRouteWeather';
import { weatherDescription } from '../../lib/routeWeather';
import { journeyDayDisplayLabel } from '../../lib/journeyDays';
import { Press } from '../Press';
import { Avatar } from '../Avatar';
import { PhotoTile } from '../PhotoTile';
import { routeGuideCopy } from './routeGuideCopy';
import { GuideEquipmentColumns } from './GuideEquipmentColumns';

export function RouteGuideSectionHeader({ theme, title, action, onAction, tight = false }: { theme: Theme; title: string; action?: string; onAction?: () => void; tight?: boolean }) {
  return <View style={[styles.sectionHeader, tight && styles.tightSectionHeader]}>
    <Text style={[type.sectionTitle, { color: theme.text }]}>{title}</Text>
    {action && onAction ? <Press onPress={onAction} accessibilityRole="button" style={styles.sectionAction}>
      <Text style={[type.caption, { color: theme.text2 }]}>{action}</Text><ChevronRight color={theme.text3} size={14} />
    </Press> : null}
  </View>;
}

export function RouteGuideTabs<T extends string>({ theme, value, options, onChange }: { theme: Theme; value: T; options: { id: T; label: string }[]; onChange: (value: T) => void }) {
  return <View style={[styles.tabs, { borderBottomColor: theme.hairline }]}>
    {options.map((option) => <Press key={option.id} accessibilityRole="tab" accessibilityState={{ selected: value === option.id }} onPress={() => onChange(option.id)} style={[styles.tab, { backgroundColor: value === option.id ? theme.controlSurface : 'transparent', borderBottomColor: value === option.id ? theme.text : 'transparent' }]}>
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
      <View style={{ flex: 1 }}><Text style={{ color: theme.text, fontSize: 13, lineHeight: 21, fontWeight: '600' }}>{isGenericDayLabel(guideText(day.title, resolved), index) ? journeyDayDisplayLabel(`Day ${index + 1}`, resolved) : guideText(day.title, resolved)}</Text>{isGenericDayLabel(guideText(day.summary, resolved), index) ? null : <Text style={[styles.caption, { color: theme.text2, marginTop: space.xxs }]}>{guideText(day.summary, resolved)}</Text>}</View>
    </View>)}
    <View style={[styles.gearPeek, { borderTopColor: theme.hairline }]}><Backpack color={theme.text2} size={16} /><Text numberOfLines={2} style={[styles.caption, { color: theme.text2, flex: 1 }]}>{plan.gear.slice(0, 4).map((g) => guideText(g.name, resolved)).join('、')}…</Text></View>
    <Press onPress={() => onOpen(plan)} accessibilityRole="button" style={styles.openPlan}><Text style={{ color: theme.text, fontSize: 13, fontWeight: '700' }}>{c.viewPlan}</Text><ChevronRight color={theme.text2} size={17} /></Press>
    <Text style={[styles.caption, { color: theme.text3 }]}>{c.draftNote}</Text>
  </View>;
}

export function RouteGuideRow({ theme, guide, onPress, photoUri, helpful, compact = false }: { theme: Theme; guide: RouteCommunityGuide; onPress: () => void; photoUri?: string; helpful?: number; compact?: boolean }) {
  const { resolved } = useI18n();
  const c = routeGuideCopy[resolved];
  return <Press onPress={onPress} accessibilityRole="button" style={[styles.guide, compact && styles.compactGuide]}>
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: compact ? space.lg : space.md }}>
      <View style={[{ flex: 1, minWidth: 0 }, compact && styles.compactTextColumn]}>
        <Text numberOfLines={2} style={{ color: theme.text, fontSize: compact ? 14 : 15, lineHeight: compact ? 23 : 24, fontWeight: compact ? '600' : '700' }}>{guideText(guide.title, resolved)}</Text>
        {!compact ? <Text style={[styles.caption, { color: theme.text2, marginTop: space.xs }]}>{guide.plan.days.length}{resolved === 'zh' ? '天' : ' days'}  {c[guide.plan.stay]}  {c[guide.season]}</Text> : null}
        {!compact ? <Text style={[styles.caption, { color: theme.text2, marginTop: space.xxs }]}>{c.includes}</Text> : null}
        {compact ? <View style={styles.compactAuthorRow}>
          <Avatar size={22} uri={guide.authorAvatarUrl || undefined} />
          <Text numberOfLines={1} style={[styles.caption, { color: theme.text3 }]}>{guideText(guide.author, resolved)}</Text>
          <View style={styles.label}><Heart color={theme.text3} size={13} /><Text style={[styles.caption, { color: theme.text3 }]}>{helpful ?? guide.helpful}</Text></View>
        </View> : <Text style={[styles.caption, { color: theme.text2, marginTop: space.sm }]}>{guideText(guide.author, resolved)}</Text>}
      </View>
      <PhotoTile tone={guide.plan.stay === 'camp' ? 'ridge' : 'forest'} seed={guide.id} radius={radius.card} style={{ width: compact ? 64 : 80, height: compact ? 64 : 84, alignSelf: compact ? 'flex-end' : 'auto' }} resWidth={240}>
        {photoUri ? <RouteGuideThumb uri={photoUri} /> : null}
      </PhotoTile>
    </View>
    {!compact ? <View style={styles.guideFooter}><Text style={[styles.caption, { color: theme.text2 }]}>{c.travelDate} {guide.travelDate}</Text><View style={styles.label}><ThumbsUp color={theme.text2} size={12} /><Text style={[styles.caption, { color: theme.text2 }]}>{helpful ?? guide.helpful}</Text></View></View> : null}
  </Press>;
}

function RouteGuideThumb({ uri }: { uri: string }) { return <Image source={{ uri }} contentFit="cover" style={StyleSheet.absoluteFill} />; }

function formatGuideWeight(weightKg: number) {
  if (!Number.isFinite(weightKg) || weightKg <= 0) return '';
  return weightKg < 1 ? `${Math.round(weightKg * 1000)} g` : `${weightKg.toFixed(weightKg >= 10 ? 1 : 2).replace(/0+$/, '').replace(/\.$/, '')} kg`;
}

export function RouteGuideEquipment({ theme, plan }: { theme: Theme; plan: RouteGuidePlan }) {
  const { resolved } = useI18n();
  const c = routeGuideCopy[resolved];
  const categories = [...new Set(plan.gear.map((item) => guideText(item.category, resolved)))];
  const weights = plan.gear.reduce((stats, item) => {
    const weight = (item.weightKg ?? 0) * Math.max(1, item.quantity);
    if (item.carryStatus === 'worn') stats.worn += weight;
    else if (item.carryStatus === 'consumable') stats.consumable += weight;
    else if (item.carryStatus !== 'optional') stats.base += weight;
    return stats;
  }, { base: 0, consumable: 0, worn: 0 });
  return <View>
    <View style={styles.gearTitleRow}><Text style={[type.sectionTitle, { color: theme.text }]}>{c.gearTitle}</Text></View>
    <View style={styles.weightStats}>{[
      [resolved === 'zh' ? '包重' : 'Pack', weights.base + weights.consumable],
      [resolved === 'zh' ? '基础' : 'Base', weights.base],
      [resolved === 'zh' ? '消耗' : 'Consumable', weights.consumable],
      [resolved === 'zh' ? '穿戴' : 'Worn', weights.worn],
    ].map(([label, value]) => <View key={String(label)} style={styles.weightStat}><Text style={[styles.caption, { color: theme.text3 }]}>{label}</Text><Text style={{ color: theme.text, fontSize: 13, fontWeight: '700' }}>{formatGuideWeight(Number(value)) || '—'}</Text></View>)}</View>
    <GuideEquipmentColumns columns={1} groups={categories}
      itemNames={(category) => plan.gear.filter((item) => guideText(item.category, resolved) === category).map((item) => guideText(item.name, resolved))}
      renderGroup={(category) => {
      const items = plan.gear.filter((item) => guideText(item.category, resolved) === category);
      const count = items.reduce((sum, item) => sum + Math.max(1, item.quantity), 0);
      const categoryWeight = items.reduce((sum, item) => sum + (item.weightKg ?? 0) * Math.max(1, item.quantity), 0);
      return <View key={category}>
        <View style={styles.gearCategoryHeader}><Text style={styles.gearCategoryTitle}>{category}</Text><Text style={[styles.gearCategorySummary, { color: theme.text2 }]}>{count}{resolved === 'zh' ? ' 件' : count === 1 ? ' item' : ' items'}{categoryWeight > 0 ? `  ${formatGuideWeight(categoryWeight)}` : ''}</Text></View>
        {items.map((item) => <View key={item.name.zh} style={styles.gearItem}>
          <Text style={[styles.gearName, { color: theme.text2 }]}>{guideText(item.name, resolved)}</Text><Text style={[styles.gearWeight, { color: theme.text2 }]}>{item.weightKg != null && item.weightKg > 0 ? formatGuideWeight(item.weightKg) : ''}</Text><Text style={[styles.gearQuantity, { color: theme.text2 }]}>{`×${item.quantity}`}</Text>
        </View>)}
      </View>;
    }} />
  </View>;
}


export function RouteGuideItinerary({ theme, plan }: { theme: Theme; plan: RouteGuidePlan }) {
  const { resolved } = useI18n();
  return <View>{plan.days.map((day, index) => <View key={index} style={[styles.detailDay, index === 0 && styles.firstDetailDay, { borderBottomColor: theme.hairline }]}>
    <Text style={[styles.dayLabel, { color: theme.text }]}>{journeyDayDisplayLabel(`Day ${index + 1}`, resolved).toUpperCase()}</Text>
    {isGenericDayLabel(guideText(day.summary, resolved), index) ? null : <Text style={{ color: theme.text, fontSize: 15, lineHeight: 25, fontWeight: '600' }}>{guideText(day.summary, resolved)}</Text>}
    <View style={{ gap: space.sm, marginTop: space.lg }}>{day.items.map((item, i) => <View key={i} style={{ flexDirection: 'row', gap: space.sm, alignItems: 'flex-start' }}><Text style={{ color: theme.text3, fontSize: 13, lineHeight: 23 }}>{String(i + 1).padStart(2, '0')}</Text><Text style={{ flex: 1, color: theme.text2, fontSize: 13, lineHeight: 23 }}>{guideText(item, resolved)}</Text></View>)}</View>
  </View>)}</View>;
}

function isGenericDayLabel(value: string, index: number) {
  const day = index + 1;
  return value.trim().toLowerCase() === `day ${day}` || value.trim() === `第${day}天` || value.trim() === `第 ${day} 天` || value.trim() === `第${day}日`;
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

export { RouteWeatherDetails } from './RouteWeatherDetails';

const styles = StyleSheet.create({
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm, marginBottom: space.lg },
  tightSectionHeader: { marginBottom: 0 },
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
  gearTitleRow: { flexDirection: 'row', alignItems: 'baseline', marginBottom: space.xl }, gearCategoryHeader: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: space.sm, marginBottom: space.xs }, gearCategoryTitle: { flex: 1, minWidth: 0, color: '#111111', fontSize: 13, lineHeight: 19, fontWeight: '800' }, gearCategorySummary: { flexShrink: 0, fontSize: 11, lineHeight: 17, textAlign: 'right' },
  openPlan: { minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.md },
  guide: { paddingVertical: space.xl }, compactGuide: { paddingVertical: space.md, paddingTop: space.sm }, compactTextColumn: { minHeight: 64, justifyContent: 'space-between' }, compactAuthorRow: { marginTop: 0, flexDirection: 'row', alignItems: 'center', gap: space.sm }, guideFooter: { marginTop: space.md, flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap', gap: space.xs },
  gearItem: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 1 },
  gearName: { flex: 1, minWidth: 0, fontSize: 12.5, lineHeight: 19 },
  gearWeight: { width: 42, marginLeft: space.xs, fontSize: 11, lineHeight: 19, textAlign: 'right' },
  gearQuantity: { width: 25, marginLeft: space.xs, fontSize: 11, lineHeight: 19, textAlign: 'right' },
  weightStats: { flexDirection: 'row', gap: space.xs, marginTop: 0, marginBottom: space.xxl },
  weightStat: { flex: 1, gap: 3 },
  detailDay: { paddingVertical: space.xl }, firstDetailDay: { paddingTop: 0 }, dayLabel: { marginBottom: space.sm, fontSize: 15, lineHeight: 21, fontWeight: '800' },
  weather: { borderRadius: radius.card, paddingHorizontal: space.md },
  weatherLine: { flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 84, paddingVertical: space.md },
});
