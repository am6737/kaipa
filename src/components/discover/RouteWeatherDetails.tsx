import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { CalendarDays, ChevronDown, ChevronUp, Cloud, CloudDrizzle, CloudFog, CloudLightning, CloudRain, CloudSnow, Droplets, Eye, Info, Sunrise, Sunset, Sun, Thermometer, Wind } from 'lucide-react-native';
import { radius, space } from '../../design-system';
import { useI18n } from '../../i18n';
import { weatherDescription, type RouteWeatherForecast } from '../../lib/routeWeather';
import type { Theme } from '../../theme/theme';
import { Press } from '../Press';
import { routeGuideCopy } from './routeGuideCopy';

// Daily forecasts are not current conditions. Keep the date and high/low labels
// visible even when using the large temperature treatment of a weather app.
function WeatherIcon({ code, size = 24, color }: { code: number; size?: number; color: string }) {
  const Glyph = code === 0 ? Sun : [1, 2, 3].includes(code) ? Cloud
    : [45, 48].includes(code) ? CloudFog : [95, 96, 99].includes(code) ? CloudLightning
    : [71, 73, 75, 77, 85, 86].includes(code) ? CloudSnow
    : [51, 53, 55, 56, 57].includes(code) ? CloudDrizzle
    : [61, 63, 65, 66, 67, 80, 81, 82].includes(code) ? CloudRain : Cloud;
  return <Glyph size={size} color={color} strokeWidth={1.6} />;
}

function weatherColor(code: number, dark: boolean) {
  if (code === 0) return dark ? '#FFD45A' : '#F2A51A';
  if ([1, 2, 3, 45, 48].includes(code)) return dark ? '#C8D7E3' : '#66849A';
  if ([71, 73, 75, 77, 85, 86].includes(code)) return dark ? '#C6F0FF' : '#55A7C8';
  if ([95, 96, 99].includes(code)) return dark ? '#D5B6FF' : '#8062B8';
  if ([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return dark ? '#83CFF4' : '#3D91C2';
  return dark ? '#C8D7E3' : '#66849A';
}

function temperatureColor(value: number, dark: boolean) {
  // Keep the scale stable across the forecast so a warm day does not become
  // orange merely because it is the warmest day in this particular response.
  if (value <= 0) return dark ? '#64D2FF' : '#3D91C2';
  if (value <= 10) return dark ? '#5AC8FA' : '#46A9D6';
  if (value <= 18) return dark ? '#63D5C1' : '#43B7A5';
  if (value <= 25) return dark ? '#F4D35E' : '#D9B638';
  if (value <= 32) return dark ? '#FFB340' : '#F28C28';
  return dark ? '#FF6961' : '#D94B42';
}

function temperatureGradient(min: number, max: number, dark: boolean): [string, string, string] {
  const middle = (min + max) / 2;
  return [temperatureColor(min, dark), temperatureColor(middle, dark), temperatureColor(max, dark)];
}

function weatherPalette(code: number, dark: boolean): { gradient: [string, string]; ink: string; muted: string; circle: string } {
  if (code === 0) return dark ? { gradient: ['#493713', '#233B55'], ink: '#FFF7D6', muted: '#E8D59A', circle: '#765E27' } : { gradient: ['#FFF1B8', '#D9EEFF'], ink: '#543B10', muted: '#806A35', circle: '#FFF8D9' };
  if ([95, 96, 99].includes(code)) return dark ? { gradient: ['#2E2647', '#202B43'], ink: '#F3E9FF', muted: '#CDBBE7', circle: '#493B68' } : { gradient: ['#E8E0F5', '#D9EAF4'], ink: '#392D50', muted: '#6F6280', circle: '#F2ECFF' };
  if ([61, 63, 65, 66, 67, 80, 81, 82, 51, 53, 55, 56, 57].includes(code)) return dark ? { gradient: ['#193B57', '#202E44'], ink: '#E6F5FF', muted: '#B4D0E2', circle: '#2C5674' } : { gradient: ['#C9E8F8', '#DCE8F2'], ink: '#193E59', muted: '#527389', circle: '#E9F6FC' };
  if ([71, 73, 75, 77, 85, 86].includes(code)) return dark ? { gradient: ['#293E50', '#25313E'], ink: '#EFFAFF', muted: '#BED8E5', circle: '#3C596C' } : { gradient: ['#E8F5FA', '#D7EAF3'], ink: '#244454', muted: '#5C7886', circle: '#F5FCFF' };
  return dark ? { gradient: ['#263C4D', '#273342'], ink: '#EDF7FC', muted: '#BDD1DC', circle: '#3A5365' } : { gradient: ['#DCECF4', '#E5EDF1'], ink: '#284655', muted: '#607984', circle: '#F4FAFC' };
}

export function RouteWeatherDetails({ theme, forecast, routeName }: { theme: Theme; forecast: RouteWeatherForecast; routeName: string }) {
  const { resolved } = useI18n();
  const c = routeGuideCopy[resolved];
  const [selectedDate, setSelectedDate] = useState(forecast.days[0]?.date);
  const [showAll, setShowAll] = useState(false);
  const selected = forecast.days.find((day) => day.date === selectedDate) ?? forecast.days[0];
  if (!selected) return null;
  const zh = resolved === 'zh';
  const locale = zh ? 'zh-CN' : 'en-US';
  const dateLabel = (date: string) => new Date(`${date}T12:00:00`).toLocaleDateString(locale, { month: 'numeric', day: 'numeric' });
  const weekday = (date: string) => new Date(`${date}T12:00:00`).toLocaleDateString(locale, { weekday: 'short' });
  const floor = Math.min(...forecast.days.map((day) => day.min));
  const ceiling = Math.max(...forecast.days.map((day) => day.max));
  const blue = theme.dark ? '#8CCDF6' : '#337DAC';
  const palette = weatherPalette(selected.code, theme.dark);
  const ink = palette.ink;
  const muted = palette.muted;
  const card = { backgroundColor: theme.dark ? 'rgba(255,255,255,0.11)' : 'rgba(255,255,255,0.58)', borderColor: theme.dark ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.72)' };
  const visibleDays = showAll ? forecast.days : forecast.days.slice(0, 3);
  const currentHour = selected.date === forecast.days[0]?.date && selected.hours.length
    ? selected.hours.reduce((closest, hour) => {
      const targetHour = new Date().getHours();
      const distance = Math.abs(Number(hour.time.slice(11, 13)) - targetHour);
      const closestDistance = Math.abs(Number(closest.time.slice(11, 13)) - targetHour);
      return distance < closestDistance ? hour : closest;
    })
    : null;
  const heroCode = currentHour?.code ?? selected.code;
  const heroTemperature = currentHour?.temperature ?? selected.max;
  const scoreLabel = (score: number | null) => score == null ? (zh ? '暂无' : 'N/A') : score >= 70 ? (zh ? '较高' : 'High') : score >= 40 ? (zh ? '一般' : 'Fair') : (zh ? '较低' : 'Low');
  const scoreColor = (score: number | null) => score == null ? theme.text2 : score >= 70 ? '#2C9A69' : score >= 40 ? '#C18427' : theme.text2;
  const dawnGlow = selected.dawnGlow;
  const duskGlow = selected.duskGlow;
  const cloudSeaScore = selected.lowCloud == null ? null : Math.max(0, Math.min(100, Math.round(selected.lowCloud * 0.65 + (selected.cloudBase != null && selected.cloudBase < 1800 ? 22 : 0) + (selected.dewPointSpread != null && selected.dewPointSpread <= 2 ? 14 : 0) - (selected.rain ?? 0) * 0.45)));
  const stormScore = selected.code >= 95 ? 95 : selected.cape == null || selected.showers == null ? null : Math.max(0, Math.min(100, Math.round((selected.cape / 12) + selected.showers * 1.1 + (selected.gust ?? selected.wind ?? 0) * 0.6)));
  const timeLabel = (value: string | null) => value ? value.slice(11, 16) : '—';

  return <View style={styles.page}>
    <LinearGradient colors={palette.gradient} style={styles.hero}>
      <View pointerEvents="none" style={[styles.skyCircle, { backgroundColor: palette.circle }]} />
      <Text style={[styles.routeName, { color: ink }]}>{routeName}</Text>
      <Text style={[styles.heroDate, { color: muted }]}>{dateLabel(selected.date)}{' '}{weekday(selected.date)}</Text>
      <View style={styles.heroWeather}>
        <Text style={[styles.highLabel, { color: muted }]}>{currentHour ? (zh ? '现在' : 'Now') : (zh ? '当日最高' : 'Daily high')}</Text>
        <Text numberOfLines={1} style={[styles.temperature, { color: ink }]}>{Math.round(heroTemperature)}°</Text>
        <WeatherIcon code={heroCode} size={56} color={weatherColor(heroCode, theme.dark)} />
      </View>
      <Text style={[styles.condition, { color: ink }]}>{weatherDescription(heroCode, resolved)}</Text>
      <Text style={[styles.lowLabel, { color: muted }]}>{zh ? '最低' : 'Low'} {Math.round(selected.min)}° · {zh ? '最高' : 'High'} {Math.round(selected.max)}°</Text>
    </LinearGradient>

    {selected.hours.length ? <View style={[styles.hourly, card]}>
      <View style={[styles.sectionHeading, { borderBottomColor: theme.hairline }]}>
        <Thermometer size={15} color={theme.text2} />
        <Text style={[styles.sectionLabel, { color: theme.text2 }]}>{zh ? '逐小时天气' : 'Hourly forecast'}</Text>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.hourlyContent}>
        {selected.hours.map((hour) => <View key={hour.time} style={styles.hourlyItem}>
          <Text style={[styles.hourLabel, { color: theme.text2 }]}>{currentHour?.time === hour.time ? (zh ? '现在' : 'Now') : hour.time.slice(11, 16)}</Text>
          <WeatherIcon code={hour.code} size={23} color={weatherColor(hour.code, theme.dark)} />
          {hour.rain != null && hour.rain > 0 ? <Text style={[styles.hourRain, { color: blue }]}>{hour.rain}%</Text> : <View style={styles.hourRainPlaceholder} />}
          <Text style={[styles.hourTemperature, { color: theme.text }]}>{Math.round(hour.temperature)}°</Text>
        </View>)}
      </ScrollView>
    </View> : null}

    <View style={[styles.forecast, card]}>
      <View style={[styles.sectionHeading, { borderBottomColor: theme.hairline }]}>
        <CalendarDays size={15} color={theme.text2} />
        <Text style={[styles.sectionLabel, { color: theme.text2 }]}>{zh ? `${forecast.days.length} 日天气预报` : `${forecast.days.length}-day forecast`}</Text>
      </View>
      {visibleDays.map((day, index) => {
        const active = day.date === selected.date;
        return <Press key={day.date} accessibilityRole="button" accessibilityState={{ selected: active }} accessibilityLabel={`${day.date}, ${weatherDescription(day.code, resolved)}, ${Math.round(day.min)}–${Math.round(day.max)}°`} onPress={() => setSelectedDate(day.date)} style={[styles.dayRow, { backgroundColor: active ? theme.fieldSurface : 'transparent' }, index < forecast.days.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.hairline }]}>
          <View style={styles.dayLabel}><Text style={[styles.weekday, { color: theme.text, fontWeight: active ? '700' : '500' }]}>{weekday(day.date)}</Text><Text style={[styles.small, { color: theme.text2 }]}>{dateLabel(day.date)}</Text></View>
          <View style={styles.dayCondition}><WeatherIcon code={day.code} size={22} color={weatherColor(day.code, theme.dark)} /><Text numberOfLines={1} style={[styles.small, { color: theme.text2 }]}>{weatherDescription(day.code, resolved)}</Text></View>
          <View style={styles.range}>
            <Text style={[styles.rangeNumber, { color: theme.text2 }]}>{Math.round(day.min)}°</Text>
            <View style={[styles.rangeTrack, { backgroundColor: theme.progressTrack }]}>
              <LinearGradient colors={temperatureGradient(day.min, day.max, theme.dark)} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={[styles.rangeFill, { left: `${(day.min - floor) / Math.max(ceiling - floor, 1) * 100}%`, width: `${Math.max((day.max - day.min) / Math.max(ceiling - floor, 1) * 100, 3)}%` }]} />
            </View>
            <Text style={[styles.rangeNumber, { color: theme.text }]}>{Math.round(day.max)}°</Text>
          </View>
        </Press>;
      })}
      {forecast.days.length > 3 ? <Press accessibilityRole="button" accessibilityState={{ expanded: showAll }} onPress={() => setShowAll((current) => !current)} style={[styles.moreDays, { borderTopColor: theme.hairline }]}>
        <Text style={[styles.moreDaysLabel, { color: blue }]}>{showAll ? (zh ? '收起预报' : 'Show less') : (zh ? `查看未来 ${forecast.days.length} 天` : `View ${forecast.days.length}-day forecast`)}</Text>
        {showAll ? <ChevronUp color={blue} size={16} /> : <ChevronDown color={blue} size={16} />}
      </Press> : null}
    </View>

    <View>
      <View style={styles.metrics}>
        <View style={[styles.metric, card]}>
          <View style={styles.metricHeading}><Thermometer color={theme.dark ? '#F4C95D' : '#D48D20'} size={17} /><Text style={[styles.small, { color: theme.text2 }]}>{zh ? '体感温度' : 'Feels like'}</Text></View>
          <Text style={[styles.metricValue, { color: theme.text }]}>{selected.feelsMax == null ? '—' : `${Math.round(selected.feelsMax)}°`}</Text>
          <Text style={[styles.small, { color: theme.text2 }]}>{selected.feelsMin == null ? '' : `${zh ? '最低' : 'Low'} ${Math.round(selected.feelsMin)}°`}</Text>
        </View>
        <View style={[styles.metric, card]}>
          <View style={styles.metricHeading}><Droplets color={blue} size={17} /><Text style={[styles.small, { color: theme.text2 }]}>{c.rain}</Text></View>
          <Text style={[styles.metricValue, { color: theme.text }]}>{selected.rain == null ? '—' : `${selected.rain}%`}</Text>
          <View style={[styles.rainTrack, { backgroundColor: theme.progressTrack }]}><View style={[styles.rainFill, { backgroundColor: blue, width: `${selected.rain ?? 0}%` }]} /></View>
          <Text style={[styles.small, { color: theme.text2 }]}>{zh ? '当日最高概率' : 'Daily maximum probability'}</Text>
        </View>
        <View style={[styles.metric, card]}>
          <View style={styles.metricHeading}><Wind color={blue} size={17} /><Text style={[styles.small, { color: theme.text2 }]}>{c.wind}</Text></View>
          <Text style={[styles.metricValue, { color: theme.text }]}>{selected.wind == null ? '—' : Math.round(selected.wind)}</Text>
          <Text style={[styles.windUnit, { color: theme.text2 }]}>km/h</Text>
          <Text style={[styles.small, { color: theme.text2 }]}>{zh ? '当日最大风速' : 'Daily maximum wind'}</Text>
        </View>
        <View style={[styles.metric, card]}>
          <View style={styles.metricHeading}><Eye color={theme.dark ? '#B8D2E3' : '#5C8398'} size={17} /><Text style={[styles.small, { color: theme.text2 }]}>{zh ? '能见度' : 'Visibility'}</Text></View>
          <Text style={[styles.metricValue, { color: theme.text }]}>{selected.visibility == null ? '—' : `${(selected.visibility / 1000).toFixed(1)}`}</Text>
          <Text style={[styles.small, { color: theme.text2 }]}>{selected.visibility == null ? '' : 'km'}</Text>
        </View>
      </View>
    </View>

    <View style={[styles.viewingCard, card]}>
      <Text style={[styles.viewingTitle, { color: theme.text }]}>{zh ? '观景条件' : 'Viewing conditions'}</Text>
      <Text style={[styles.small, { color: theme.text2, marginTop: space.xxs }]}>{zh ? '根据公开预报数据估算，仅供出发前参考' : 'Estimated from public forecast data for planning'}</Text>
      <View style={styles.viewingRow}>
        <Sunrise color={theme.dark ? '#FFD45A' : '#F2A51A' } size={19} /><View style={styles.viewingCopy}><Text style={[styles.viewingLabel, { color: theme.text }]}>{zh ? '朝霞潜力' : 'Sunrise glow'}</Text><View style={styles.viewingMeta}><Text style={[styles.small, { color: theme.text2 }]}>{timeLabel(selected.sunrise)}</Text><Text style={[styles.small, { color: theme.text2 }]}>{zh ? '日出前后云量' : 'Cloud around sunrise'}</Text></View></View><Text style={[styles.viewingValue, { color: scoreColor(dawnGlow) }]}>{scoreLabel(dawnGlow)}</Text>
      </View>
      <View style={styles.viewingRow}>
        <Sunset color={theme.dark ? '#FFB45C' : '#E9782B' } size={19} /><View style={styles.viewingCopy}><Text style={[styles.viewingLabel, { color: theme.text }]}>{zh ? '晚霞潜力' : 'Sunset glow'}</Text><View style={styles.viewingMeta}><Text style={[styles.small, { color: theme.text2 }]}>{timeLabel(selected.sunset)}</Text><Text style={[styles.small, { color: theme.text2 }]}>{zh ? '日落前后云量' : 'Cloud around sunset'}</Text></View></View><Text style={[styles.viewingValue, { color: scoreColor(duskGlow) }]}>{scoreLabel(duskGlow)}</Text>
      </View>
      <View style={styles.viewingRow}>
        <CloudFog color={theme.dark ? '#B8D2E3' : '#6C8FA3' } size={19} /><View style={styles.viewingCopy}><Text style={[styles.viewingLabel, { color: theme.text }]}>{zh ? '云海潜力' : 'Cloud sea potential'}</Text><Text style={[styles.small, { color: theme.text2 }]}>{selected.lowCloud == null ? (zh ? '低云数据暂缺' : 'Low cloud data unavailable') : `${zh ? '低云' : 'Low cloud'} ${Math.round(selected.lowCloud)}%`}</Text></View><Text style={[styles.viewingValue, { color: scoreColor(cloudSeaScore) }]}>{scoreLabel(cloudSeaScore)}</Text>
      </View>
      <View style={styles.viewingRow}>
        <CloudLightning color={theme.dark ? '#D5B6FF' : '#8062B8' } size={19} /><View style={styles.viewingCopy}><Text style={[styles.viewingLabel, { color: theme.text }]}>{zh ? '雷雨风险' : 'Thunderstorm risk'}</Text><Text style={[styles.small, { color: theme.text2 }]}>{selected.rain == null ? '—' : `${zh ? '降水概率' : 'Rain probability'} ${selected.rain}%`}</Text></View><Text style={[styles.viewingValue, { color: scoreColor(stormScore == null ? null : 100 - stormScore) }]}>{stormScore != null && stormScore >= 60 ? (zh ? '较高' : 'High') : stormScore != null && stormScore >= 30 ? (zh ? '留意' : 'Watch') : (zh ? '较低' : 'Low')}</Text>
      </View>
    </View>

    <View style={styles.note}><View style={styles.noteIcon}><Info size={15} color={theme.text2} /></View><Text style={[styles.noteText, { color: theme.text2 }]}>{c.weatherScope}</Text></View>
    <Text style={[styles.source, { color: theme.text2 }]}>{c.weatherSource}{'\n'}{c.updated} {new Date(forecast.fetchedAt).toLocaleString(locale)}</Text>
  </View>;
}

const styles = StyleSheet.create({
  page: { gap: space.lg },
  hero: { borderRadius: radius.showcase, padding: space.xl, overflow: 'hidden' },
  skyCircle: { position: 'absolute', width: 220, height: 220, borderRadius: 110, top: -60, right: -90, opacity: 0.55 },
  routeName: { fontSize: 24, lineHeight: 32, fontWeight: '700', marginTop: space.xs },
  heroDate: { fontSize: 12, marginTop: space.xs },
  heroWeather: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: space.lg, gap: space.md },
  highLabel: { fontSize: 12 },
  temperature: { fontSize: 80, lineHeight: 88, fontWeight: '300', letterSpacing: -3 },
  condition: { fontSize: 20, fontWeight: '600', marginTop: space.xs },
  lowLabel: { fontSize: 13, marginTop: space.xs },
  forecast: { borderRadius: radius.feature, borderWidth: StyleSheet.hairlineWidth, padding: space.sm },
  hourly: { borderRadius: radius.feature, borderWidth: StyleSheet.hairlineWidth, padding: space.sm },
  hourlyContent: { gap: space.lg, paddingHorizontal: space.xs, paddingVertical: space.sm },
  hourlyItem: { width: 40, alignItems: 'center', gap: space.xs },
  hourLabel: { fontSize: 11, fontVariant: ['tabular-nums'] },
  hourRain: { fontSize: 10, lineHeight: 12, fontVariant: ['tabular-nums'] },
  hourRainPlaceholder: { height: 12 },
  hourTemperature: { fontSize: 14, fontWeight: '600', fontVariant: ['tabular-nums'] },
  sectionHeading: { flexDirection: 'row', alignItems: 'center', gap: space.xs, padding: space.xs, paddingBottom: space.md, borderBottomWidth: StyleSheet.hairlineWidth },
  sectionLabel: { fontSize: 12, fontWeight: '600' },
  dayRow: { flexDirection: 'row', alignItems: 'center', gap: space.xs, minHeight: 72, padding: space.xs, borderRadius: radius.control },
  dayLabel: { width: 42, gap: space.xxs },
  weekday: { fontSize: 13 },
  small: { fontSize: 11, lineHeight: 17 },
  dayCondition: { width: 48, alignItems: 'center', gap: space.xxs },
  moreDays: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.xxs, borderTopWidth: StyleSheet.hairlineWidth, marginTop: space.xs },
  moreDaysLabel: { fontSize: 12, fontWeight: '600' },
  range: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: space.xxs },
  rangeNumber: { width: 30, textAlign: 'center', fontSize: 13, fontVariant: ['tabular-nums'] },
  rangeTrack: { flex: 1, height: 5, borderRadius: radius.pill, overflow: 'hidden' },
  rangeFill: { position: 'absolute', height: 5, borderRadius: radius.pill },
  metricsDate: { fontSize: 12, marginBottom: space.sm, marginLeft: space.xxs },
  metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  viewingCard: { borderRadius: radius.feature, borderWidth: StyleSheet.hairlineWidth, padding: space.md },
  viewingTitle: { fontSize: 17, fontWeight: '700' },
  viewingRow: { minHeight: 62, flexDirection: 'row', alignItems: 'center', gap: space.sm },
  viewingCopy: { flex: 1, minWidth: 0 },
  viewingMeta: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  viewingLabel: { fontSize: 13, fontWeight: '600' },
  viewingValue: { fontSize: 13, fontWeight: '700' },
  metric: { flexGrow: 1, flexBasis: '47%', minWidth: 0, borderRadius: radius.feature, borderWidth: StyleSheet.hairlineWidth, padding: space.md },
  metricHeading: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: space.xs },
  metricValue: { fontSize: 32, fontWeight: '500', marginTop: space.md },
  rainTrack: { height: 5, borderRadius: radius.pill, overflow: 'hidden', marginVertical: space.sm },
  rainFill: { height: 5, borderRadius: radius.pill },
  windUnit: { fontSize: 12, marginTop: space.xxs, marginBottom: space.xs },
  note: { flexDirection: 'row', alignItems: 'flex-start', gap: space.xs, paddingHorizontal: space.xxs },
  noteIcon: { marginTop: 3 },
  noteText: { flex: 1, fontSize: 12, lineHeight: 20 },
  source: { fontSize: 11, lineHeight: 19, textAlign: 'center' },
});
