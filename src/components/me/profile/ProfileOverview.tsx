// ProfileOverview.tsx — 概览标签：四宫格入口、装备、年度里程。版式参照 Komoot 的概览页。
// 块与块之间只用留白和 fieldSurface 底色区分，不画分割线。
import React from 'react';
import { Text, View } from 'react-native';
import { Award, Backpack, ChevronRight, Heart, Route } from 'lucide-react-native';
import type { Theme } from '../../../theme/theme';
import { layout, radius, space, type } from '../../../design-system';
import { Press } from '../../Press';
import { useI18n } from '../../../i18n';

type LucideGlyph = typeof Route;

export type OverviewTile = {
  key: string;
  icon: 'tracks' | 'favorites' | 'checklist' | 'contributions';
  label: string;
  count: number;
  onPress: () => void;
};

const TILE_ICONS: Record<OverviewTile['icon'], LucideGlyph> = {
  tracks: Route,
  favorites: Heart,
  checklist: Backpack,
  contributions: Award,
};

export function ProfileOverview({ theme, tiles, gear, yearDistance }: {
  theme: Theme;
  tiles: OverviewTile[];
  gear: {
    itemCount: number;
    weightLabel: string;
    valueLabel: string;
    onOpenItems: () => void;
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
      {/* 和头部「粉丝 / 关注」同一种写法：小字标签在上、大数在下，不加底色。
          两栏和上面的宫格同宽同间距，第二栏对齐右列，不随数字长短漂移。 */}
      <View style={{ flexDirection: 'row', gap: 10, marginTop: space.xxs, marginBottom: space.xs }}>
        <GearStat theme={theme} value={gear.weightLabel} label={t('profile.gearWeight')} onPress={gear.onOpenItems} />
        <GearStat theme={theme} value={gear.valueLabel} label={t('profile.gearValue')} onPress={gear.onOpenItems} />
      </View>

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
        {count != null ? <Text style={{ fontSize: 15, fontWeight: '500', color: theme.text3 }}>{`  ${count}`}</Text> : null}
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
      style={{ flex: 1, minWidth: 0, alignItems: 'flex-start' }}
    >
      <Text numberOfLines={1} style={[type.small, { color: theme.text2 }]}>{label}</Text>
      <Text numberOfLines={1} adjustsFontSizeToFit style={{ fontSize: 24, fontWeight: '800', color: theme.text, fontVariant: ['tabular-nums'], marginTop: 2 }}>{value}</Text>
    </Press>
  );
}

function formatKm(meters: number) {
  const km = meters / 1000;
  return km >= 100 ? Math.round(km) : km.toFixed(1);
}

function YearChart({ theme, year, months }: { theme: Theme; year: number; months: number[] }) {
  const { t } = useI18n();
  // 点中的月份：标题右侧那行从全年合计换成该月里程；再点一次同一根柱子回到合计。
  const [selected, setSelected] = React.useState<number | null>(null);
  React.useEffect(() => setSelected(null), [year]);
  const max = Math.max(...months, 1);
  const current = new Date().getFullYear() === year ? new Date().getMonth() : -1;
  const total = months.reduce((sum, value) => sum + value, 0);
  const highlighted = selected ?? current;
  return (
    <View>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginTop: layout.sectionGap, marginBottom: space.sm }}>
        <Text style={{ fontSize: 22, fontWeight: '800', color: theme.text }}>{t('profile.yearDistance', { year })}</Text>
        {/* 合计和单月用同一种字样，选中状态由柱子的 accent 色表达，不靠这行字变色加粗。 */}
        <Text style={{ fontSize: 13, color: theme.text2, fontVariant: ['tabular-nums'] }}>
          {selected != null
            ? t('profile.yearDistanceMonth', { month: selected + 1, km: formatKm(months[selected]) })
            : t('profile.yearDistanceTotal', { km: formatKm(total) })}
        </Text>
      </View>
      {/* 每个月整列（柱子区域加月份数字）都是点击区域：柱子窄、没数据的月份只有 6 高，单点柱子很难点中。
          列与列之间不留间距，柱距由列内左右内边距给出，让缝隙也能点。 */}
      <View style={{ flexDirection: 'row' }}>
        {months.map((value, index) => {
          const isSelected = selected === index;
          return (
            <Press
              key={index}
              onPress={() => setSelected(isSelected ? null : index)}
              accessibilityRole="button"
              accessibilityState={{ selected: isSelected }}
              accessibilityLabel={t('profile.yearDistanceMonth', { month: index + 1, km: formatKm(value) })}
              style={{ flex: 1, paddingHorizontal: 3 }}
            >
              <View style={{ height: 96, justifyContent: 'flex-end' }}>
                <View
                  style={{
                    height: value ? Math.max(6, (value / max) * 96) : 6,
                    borderTopLeftRadius: 6,
                    borderTopRightRadius: 6,
                    borderBottomLeftRadius: 3,
                    borderBottomRightRadius: 3,
                    backgroundColor: index === highlighted ? theme.accent : value ? theme.text3 : theme.fieldSurface,
                    opacity: selected != null && !isSelected && value ? 0.5 : 1,
                  }}
                />
              </View>
              <Text style={{ paddingTop: 6, textAlign: 'center', fontSize: 10, color: isSelected ? theme.text : theme.text3, fontWeight: isSelected ? '700' : '400' }}>{index + 1}</Text>
            </Press>
          );
        })}
      </View>
    </View>
  );
}
