// ProfileOverview.tsx — 概览标签：四宫格入口、装备、年度里程。版式参照 Komoot 的概览页。
// 块与块之间只用留白和 fieldSurface 底色区分，不画分割线。
import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Backpack, ChevronRight, Footprints, Heart, PenLine, Route } from 'lucide-react-native';
import type { Theme } from '../../../theme/theme';
import { layout, radius, space, type } from '../../../design-system';
import { Press } from '../../Press';
import { useI18n } from '../../../i18n';

type LucideGlyph = typeof Route;

export type OverviewTile = {
  key: string;
  icon: 'tracks' | 'footprints' | 'favorites' | 'contributions';
  label: string;
  count: number;
  onPress: () => void;
};

const TILE_ICONS: Record<OverviewTile['icon'], LucideGlyph> = {
  tracks: Route,
  footprints: Footprints,
  favorites: Heart,
  contributions: PenLine,
};

export function ProfileOverview({ theme, tiles, gear, yearDistance }: {
  theme: Theme;
  tiles: OverviewTile[];
  gear: {
    itemCount: number;
    weightLabel: string;
    valueLabel: string;
    sets: { id: string; name: string; detail: string }[];
    onOpenItems: () => void;
    onOpenSets: () => void;
  };
  /** 当年每月里程（米），12 个月。 */
  yearDistance: { year: number; months: number[] };
}) {
  const { t } = useI18n();
  return (
    <View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        {tiles.map((tile) => {
          const Glyph = TILE_ICONS[tile.icon];
          return (
            <Press
              key={tile.key}
              onPress={tile.onPress}
              accessibilityRole="button"
              accessibilityLabel={`${tile.label} ${tile.count}`}
              scaleTo={0.98}
              style={{
                // 固定 48.5% 宽度加 10 的间距，在 360dp 宽的安卓机上放不下两张，会掉成一列；
                // 改成小基准宽度再均分剩余空间，任何屏宽都稳定两列。
                flexBasis: '40%',
                flexGrow: 1,
                minHeight: 96,
                paddingTop: space.sm,
                paddingBottom: space.sm,
                paddingHorizontal: 14,
                borderRadius: radius.card,
                backgroundColor: theme.fieldSurface,
                justifyContent: 'space-between',
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                <Text style={{ fontSize: 30, fontWeight: '800', lineHeight: 36, color: tile.count ? theme.text : theme.text3, fontVariant: ['tabular-nums'] }}>
                  {tile.count}
                </Text>
                <Glyph color={theme.text2} size={20} strokeWidth={1.8} style={{ marginTop: 4 }} />
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.xs }}>
                <Text numberOfLines={1} style={{ flex: 1, fontSize: 14, color: theme.text }}>{tile.label}</Text>
                <View style={{ width: 22, height: 22, borderRadius: 6, backgroundColor: theme.fieldSurface, alignItems: 'center', justifyContent: 'center' }}>
                  <ChevronRight color={theme.text2} size={15} strokeWidth={2.4} />
                </View>
              </View>
            </Press>
          );
        })}
      </View>

      <SectionHead theme={theme} title={t('profile.gear')} count={t('profile.gearSetItems', { count: gear.itemCount })} onPress={gear.onOpenItems} />
      {/* 和头部「粉丝 / 关注」同一种写法：小字标签在上、大数在下，不加底色。 */}
      <View style={{ flexDirection: 'row', gap: space.xxxl }}>
        <GearStat theme={theme} value={gear.valueLabel} label={t('profile.gearValue')} onPress={gear.onOpenItems} />
        <GearStat theme={theme} value={gear.weightLabel} label={t('profile.gearWeight')} onPress={gear.onOpenItems} />
      </View>
      {gear.sets.length ? (
        <>
          <SectionHead theme={theme} title={t('profile.gearSetsTitle')} count={String(gear.sets.length)} onPress={gear.onOpenSets} />
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={{ marginHorizontal: -layout.pagePadding }}
            contentContainerStyle={{ gap: 10, paddingHorizontal: layout.pagePadding }}
          >
            {gear.sets.map((set) => (
              <Press
                key={set.id}
                onPress={gear.onOpenSets}
                accessibilityRole="button"
                scaleTo={0.98}
                style={{ width: 168, height: 132, padding: 14, borderRadius: radius.card, backgroundColor: theme.fieldSurface, justifyContent: 'space-between' }}
              >
                <Backpack color={theme.text2} size={22} strokeWidth={1.8} />
                <View>
                  <Text numberOfLines={2} style={{ fontSize: 15, fontWeight: '700', color: theme.text }}>{set.name}</Text>
                  <Text numberOfLines={1} style={{ fontSize: 12, color: theme.text2, marginTop: 2 }}>{set.detail}</Text>
                </View>
              </Press>
            ))}
          </ScrollView>
        </>
      ) : null}

      <YearChart theme={theme} {...yearDistance} />
    </View>
  );
}

function SectionHead({ theme, title, count, onPress }: { theme: Theme; title: string; count?: string; onPress?: () => void }) {
  return (
    <Press
      disabled={!onPress}
      onPress={onPress}
      accessibilityRole={onPress ? 'button' : 'header'}
      style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: layout.sectionGap, marginBottom: space.sm }}
    >
      <Text style={{ fontSize: 22, fontWeight: '800', color: theme.text }}>
        {title}
        {count != null ? <Text style={{ fontWeight: '600', color: theme.text3 }}>{`  ${count}`}</Text> : null}
      </Text>
      {onPress ? <ChevronRight color={theme.text2} size={22} strokeWidth={2} /> : null}
    </Press>
  );
}

function GearStat({ theme, value, label, onPress }: { theme: Theme; value: string; label: string; onPress: () => void }) {
  return (
    <Press
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${label} ${value}`}
      style={{ flexShrink: 1, alignItems: 'flex-start' }}
    >
      <Text numberOfLines={1} style={[type.small, { color: theme.text2 }]}>{label}</Text>
      <Text numberOfLines={1} adjustsFontSizeToFit style={{ fontSize: 28, fontWeight: '800', letterSpacing: -0.6, color: theme.text, fontVariant: ['tabular-nums'], marginTop: 2 }}>{value}</Text>
    </Press>
  );
}

function YearChart({ theme, year, months }: { theme: Theme; year: number; months: number[] }) {
  const { t } = useI18n();
  const max = Math.max(...months, 1);
  const current = new Date().getFullYear() === year ? new Date().getMonth() : -1;
  const totalKm = months.reduce((sum, value) => sum + value, 0) / 1000;
  return (
    <View>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginTop: layout.sectionGap, marginBottom: space.sm }}>
        <Text style={{ fontSize: 22, fontWeight: '800', color: theme.text }}>{t('profile.yearDistance', { year })}</Text>
        <Text style={{ fontSize: 13, color: theme.text2 }}>
          {t('profile.yearDistanceTotal', { km: totalKm >= 100 ? Math.round(totalKm) : totalKm.toFixed(1) })}
        </Text>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 6, height: 96, paddingHorizontal: 2 }}>
        {months.map((value, index) => (
          <View
            key={index}
            style={{
              flex: 1,
              height: value ? Math.max(6, (value / max) * 96) : 6,
              borderTopLeftRadius: 6,
              borderTopRightRadius: 6,
              borderBottomLeftRadius: 3,
              borderBottomRightRadius: 3,
              backgroundColor: index === current ? theme.accent : value ? theme.text3 : theme.fieldSurface,
            }}
          />
        ))}
      </View>
      <View style={{ flexDirection: 'row', gap: 6, paddingTop: 6, paddingHorizontal: 2 }}>
        {months.map((_, index) => (
          <Text key={index} style={{ flex: 1, textAlign: 'center', fontSize: 10, color: theme.text3 }}>{index + 1}</Text>
        ))}
      </View>
    </View>
  );
}
