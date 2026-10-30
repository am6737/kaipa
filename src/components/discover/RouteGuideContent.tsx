import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { ChevronRight, Heart } from 'lucide-react-native';
import type { Theme } from '../../theme/theme';
import { radius, space, type } from '../../design-system';
import { useI18n } from '../../i18n';
import { guideText, type RouteCommunityGuide, type RouteGuidePlan } from '../../data/routeGuides';
import { useRouteWeather } from '../../hooks/useRouteWeather';
import { weatherDescription } from '../../lib/routeWeather';
import { journeyDayDisplayLabel } from '../../lib/journeyDays';
import { Press } from '../Press';
import { Avatar } from '../Avatar';
import { routeGuideCopy } from './routeGuideCopy';
import { GuideEquipmentColumns } from './GuideEquipmentColumns';
import { WeatherIcon, weatherColor } from './RouteWeatherDetails';

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
      <Text style={{ ...type.tableName, fontWeight: value === option.id ? '700' : '400', color: value === option.id ? theme.text : theme.text2, textAlign: 'center' }}>{option.label}</Text>
    </Press>)}
  </View>;
}

export function MeBadge({ theme }: { theme: Theme }) {
  const { t } = useI18n();
  return <View style={styles.meBadge}>
    <View style={[styles.meBadgeInner, { backgroundColor: theme.fieldSurface }]}>
      <Text style={[styles.meBadgeText, { color: theme.text2 }]}>{t('journey.companions.meBadge')}</Text>
    </View>
  </View>;
}

export function RouteGuideRow({ theme, guide, officialTitle, onPress, helpful, compact = false, showMeBadge = false }: { theme: Theme; guide?: RouteCommunityGuide; officialTitle?: string; onPress: () => void; helpful?: number; compact?: boolean; showMeBadge?: boolean }) {
  const { resolved } = useI18n();
  const c = routeGuideCopy[resolved];
  return <Press onPress={onPress} accessibilityRole="button" style={[styles.guide, compact && styles.compactGuide]}>
    <View>
      <Text numberOfLines={2} style={[compact ? type.guideTitleCompact : type.guideTitle, { color: theme.text }]}>{officialTitle ?? (guide && guideText(guide.title, resolved))}</Text>
      {compact ? <View style={styles.compactAuthorRow}>
        <Avatar size={22} uri={guide?.authorAvatarUrl || undefined} />
        <Text numberOfLines={1} style={[styles.caption, { color: theme.text3 }]}>{officialTitle ? c.officialAuthor : guide && guideText(guide.author, resolved)}</Text>
        {showMeBadge ? <MeBadge theme={theme} /> : null}
        {guide ? <View style={styles.label}><Heart color={theme.text3} size={13} /><Text style={[styles.caption, { color: theme.text3 }]}>{helpful ?? guide.helpful}</Text></View> : null}
      </View> : <View style={styles.authorRow}>
        <View style={styles.authorGroup}>
          <Avatar size={22} uri={guide?.authorAvatarUrl || undefined} />
          <Text numberOfLines={1} style={[styles.metaAuthor, styles.caption, { color: theme.text2 }]}>{officialTitle ? c.officialAuthor : guide && guideText(guide.author, resolved)}</Text>
          {showMeBadge ? <MeBadge theme={theme} /> : null}
        </View>
        {guide ? <Text style={[styles.caption, { color: theme.text3, flexShrink: 0 }]}>{guide.travelDate}</Text> : null}
        {guide ? <View style={styles.label}><Heart color={theme.text3} size={13} /><Text style={[styles.caption, { color: theme.text3 }]}>{helpful ?? guide.helpful}</Text></View> : null}
      </View>}
    </View>
  </Press>;
}

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
    ].map(([label, value]) => <View key={String(label)} style={styles.weightStat}><Text style={[styles.caption, { color: theme.text3 }]}>{label}</Text><Text style={[type.labelStrong, { color: theme.text }]}>{formatGuideWeight(Number(value)) || '—'}</Text></View>)}</View>
    <GuideEquipmentColumns columns={1} groups={categories}
      itemNames={(category) => plan.gear.filter((item) => guideText(item.category, resolved) === category).map((item) => guideText(item.name, resolved))}
      renderGroup={(category) => {
      const items = plan.gear.filter((item) => guideText(item.category, resolved) === category);
      const count = items.reduce((sum, item) => sum + Math.max(1, item.quantity), 0);
      const categoryWeight = items.reduce((sum, item) => sum + (item.weightKg ?? 0) * Math.max(1, item.quantity), 0);
      return <View key={category}>
        <View style={styles.gearCategoryHeader}><Text style={[styles.gearCategoryTitle, { color: theme.text }]}>{category}</Text><Text style={[styles.gearCategorySummary, { color: theme.text2 }]}>{count}{resolved === 'zh' ? ' 件' : count === 1 ? ' item' : ' items'}{categoryWeight > 0 ? `  ${formatGuideWeight(categoryWeight)}` : ''}</Text></View>
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
    {isGenericDayLabel(guideText(day.summary, resolved), index) ? null : <Text style={[type.readingSummary, { color: theme.text }]}>{guideText(day.summary, resolved)}</Text>}
    <View style={{ gap: space.sm, marginTop: space.lg }}>{day.items.map((item, i) => <View key={i} style={{ flexDirection: 'row', gap: space.sm, alignItems: 'flex-start' }}><Text style={[type.step, { color: theme.text3 }]}>{String(i + 1).padStart(2, '0')}</Text><Text style={[type.step, { flex: 1, color: theme.text2 }]}>{guideText(item, resolved)}</Text></View>)}</View>
  </View>)}</View>;
}

function isGenericDayLabel(value: string, index: number) {
  const day = index + 1;
  return value.trim().toLowerCase() === `day ${day}` || value.trim() === `第${day}天` || value.trim() === `第 ${day} 天` || value.trim() === `第${day}日`;
}

export function RouteWeatherCard({ theme, lng, lat, header, onPress }: { theme: Theme; lng: number; lat: number; header: React.ReactNode; onPress: () => void }) {
  const { resolved } = useI18n();
  const c = routeGuideCopy[resolved];
  const { forecast, loading, retry } = useRouteWeather(lng, lat);
  const today = forecast?.days[0];
  const blue = theme.dark ? '#8CCDF6' : '#337DAC';
  const weekday = (date: string) => new Date(`${date}T12:00:00`).toLocaleDateString(resolved === 'zh' ? 'zh-CN' : 'en-US', { weekday: 'short' });
  return <Press onPress={onPress} accessibilityRole="button" accessibilityLabel={c.weatherDetail}>
    {header}
    {loading ? <View style={styles.weatherState}><ActivityIndicator size="small" color={theme.text2} /><Text style={[type.small, { color: theme.text2 }]}>{c.weatherLoading}</Text></View> : today && forecast ? <>
      <View style={styles.weatherToday}>
        <WeatherIcon code={today.code} size={40} color={weatherColor(today.code, theme.dark)} />
        <View style={{ flex: 1, gap: 2 }}>
          <View style={styles.weatherTemps}>
            <Text style={[type.statValue, { color: theme.text }]}>{Math.round(today.min)}–{Math.round(today.max)}</Text>
            <Text style={[type.liveUnit, { color: theme.text2, lineHeight: 28 }]}> °C</Text>
          </View>
          <Text numberOfLines={1} style={[type.cardTitle, { color: theme.text }]}>{weatherDescription(today.code, resolved)}{today.rain != null && today.rain > 0 ? <Text style={[type.small, { color: theme.text2 }]}>  {c.rain} {today.rain}%</Text> : null}</Text>
        </View>
      </View>
      <View style={styles.weatherDays}>{forecast.days.slice(0, 5).map((day, index) => <View key={day.date} style={styles.weatherDay}>
        <Text style={[styles.dayWeekday, { color: index === 0 ? theme.text : theme.text2, fontWeight: index === 0 ? '700' : '600' }]}>{index === 0 ? c.today : weekday(day.date)}</Text>
        <WeatherIcon code={day.code} size={24} color={weatherColor(day.code, theme.dark)} />
        <Text style={[styles.dayRain, { color: blue }]}>{day.rain != null && day.rain > 0 ? `${day.rain}%` : ''}</Text>
        <Text style={[styles.dayMax, { color: theme.text }]}>{Math.round(day.max)}°</Text>
        <Text style={[styles.dayMin, { color: theme.text2 }]}>{Math.round(day.min)}°</Text>
      </View>)}</View>
    </> : <View style={styles.weatherState}>
      <Text style={[type.small, { color: theme.text2 }]}>{c.weatherUnavailable}</Text>
      <Press onPress={retry} accessibilityRole="button" hitSlop={8} style={{ paddingVertical: space.xs, paddingHorizontal: space.xs }}><Text style={[type.small, { color: theme.accent, fontWeight: '600' }]}>{c.retry}</Text></Press>
    </View>}
  </Press>;
}

export { RouteWeatherDetails } from './RouteWeatherDetails';

const styles = StyleSheet.create({
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm, marginBottom: space.lg },
  tightSectionHeader: { marginBottom: 0 },
  sectionAction: { flexDirection: 'row', alignItems: 'center', gap: space.xxs, minHeight: 44 },
  tabs: { flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth, gap: space.sm },
  tab: { flex: 1, minHeight: 44, paddingVertical: space.sm, borderBottomWidth: 2, alignItems: 'center', justifyContent: 'center' },
  label: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  caption: { ...type.meta },
  gearTitleRow: { flexDirection: 'row', alignItems: 'baseline', marginBottom: space.xl }, gearCategoryHeader: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: space.sm, marginBottom: space.xs }, gearCategoryTitle: { flex: 1, minWidth: 0, ...type.gearCategory }, gearCategorySummary: { flexShrink: 0, textAlign: 'right', ...type.gearSummary },
  guide: { paddingVertical: space.xl }, compactGuide: { paddingVertical: space.lg, paddingTop: space.md }, compactAuthorRow: { marginTop: space.sm, flexDirection: 'row', alignItems: 'center', gap: space.sm }, authorRow: { marginTop: space.md, flexDirection: 'row', alignItems: 'center', gap: space.lg }, authorGroup: { flexDirection: 'row', alignItems: 'center', gap: space.xs, flexShrink: 1 }, metaAuthor: { flexShrink: 1 },
  gearItem: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 1 },
  gearName: { flex: 1, minWidth: 0, ...type.tableName },
  gearWeight: { width: 42, marginLeft: space.xs, ...type.tableNumber, textAlign: 'right' },
  gearQuantity: { width: 25, marginLeft: space.xs, ...type.tableNumber, textAlign: 'right' },
  weightStats: { flexDirection: 'row', gap: space.xs, marginTop: 0, marginBottom: space.xxl },
  weightStat: { flex: 1, gap: 3 },
  detailDay: { paddingVertical: space.xl }, firstDetailDay: { paddingTop: 0 }, dayLabel: { marginBottom: space.sm, ...type.dayLabel },
  weatherToday: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: space.md },
  weatherTemps: { flexDirection: 'row', alignItems: 'baseline', gap: 2 },
  weatherDays: { flexDirection: 'row', gap: space.xs, marginTop: space.xl },
  weatherDay: { flex: 1, alignItems: 'center', gap: 6 },
  dayWeekday: { ...type.note },
  dayRain: { height: 14, fontSize: 11, lineHeight: 14, fontWeight: '600', textAlign: 'center', fontVariant: ['tabular-nums'] },
  dayMax: { fontSize: 15, fontWeight: '600', fontVariant: ['tabular-nums'] },
  dayMin: { fontSize: 12, fontVariant: ['tabular-nums'] },
  weatherState: { height: 156, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.xs },
  meBadge: { minHeight: 20, justifyContent: 'center', flexShrink: 0 }, meBadgeInner: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: radius.pill }, meBadgeText: { fontSize: 9.5, lineHeight: 12, fontWeight: '700' },
});
