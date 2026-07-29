import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { Theme } from '../../theme/theme';
import { MONO } from '../../theme/fonts';
import { Poi } from '../../data/pois';
import { AppCard, layout, radius, space, type } from '../../design-system';
import { Icon, IconName } from '../Icon';
import { PhotoTile } from '../PhotoTile';
import { Press } from '../Press';

type Filter = { id: string; label: string };

const ROUTE_TEASERS: Record<string, string> = {
  e1: '沿九溪十八涧慢慢下行，在茶香和溪声里走完一个轻松周末。',
  e2: '把云海、草甸和日出串成三天，是让人一走再走的经典穿越。',
  e3: '贴近贡嘎雪山与冰川行走，留给准备充分的重装徒步者。',
  e4: '沿秦岭主脊穿过石海与冷杉林，在拔仙台等一场云海。',
  e5: '从哈巴村走进杜鹃林和高山牧场，为雪山攀登温柔热身。',
  e6: '穿过原始森林去往神瀑与冰湖，把梅里雪山的清晨留在旅途中。',
  e7: '半日走进高山草甸与雪山倒影，适合和家人一起慢慢逛。',
  e8: '沿火山地貌登向天池，夏季花海和云开见池都值得等待。',
};

export function DiscoverCollectionHeader({
  theme,
  eyebrow,
  title,
  summary,
  filters,
  activeFilter,
  onFilterChange,
  onFilter,
  onSecondary,
  secondaryIcon,
  onAdd,
  onBack,
  showActions = true,
}: {
  theme: Theme;
  eyebrow: string;
  title: string;
  summary: string;
  filters: readonly Filter[];
  activeFilter: number;
  onFilterChange: (index: number) => void;
  onFilter: () => void;
  onSecondary?: () => void;
  secondaryIcon?: IconName;
  onAdd: () => void;
  onBack?: () => void;
  showActions?: boolean;
}) {
  const compactTitle = !eyebrow && !summary && !onBack;
  return (
    <View style={{ paddingHorizontal: space.md, paddingBottom: space.sm }}>
      <View style={{ flexDirection: 'row', alignItems: compactTitle ? 'center' : 'flex-start', gap: space.sm }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          {onBack ? (
            <Press onPress={onBack} style={{ alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: space.xxs, marginBottom: space.xxs }}>
              <Icon name="chevronL" color={theme.accent} size={14} />
              <Text style={[type.eyebrow, { color: theme.accent }]}>{eyebrow}</Text>
            </Press>
          ) : eyebrow ? (
            <Text style={[type.eyebrow, { color: theme.text3, textTransform: 'uppercase', marginBottom: space.xxs }]}>{eyebrow}</Text>
          ) : null}
          <Text numberOfLines={1} style={[compactTitle ? type.pageTitle : type.sectionTitle, { color: theme.text }]}>{title}</Text>
          {summary ? <Text numberOfLines={1} style={[type.caption, { color: theme.text2, marginTop: space.xxs }]}>{summary}</Text> : null}
        </View>
        {showActions ? (
          <View style={{ flexDirection: 'row', gap: space.xs }}>
            <HeaderButton theme={theme} name="filter" onPress={onFilter} />
            {onSecondary && secondaryIcon ? <HeaderButton theme={theme} name={secondaryIcon} onPress={onSecondary} /> : null}
            <HeaderButton theme={theme} name="plus" onPress={onAdd} />
          </View>
        ) : null}
      </View>
      {filters.length ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 6, paddingTop: space.md, paddingRight: space.md }}
        >
          {filters.map((filter, index) => {
            const active = index === activeFilter;
            return (
              <Press
                key={filter.id}
                onPress={() => onFilterChange(index)}
                style={{
                  height: 36,
                  paddingHorizontal: 14,
                  borderRadius: radius.pill,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: active ? theme.accent : theme.surfaceTop,
                  borderWidth: StyleSheet.hairlineWidth,
                  borderColor: active ? theme.accent : theme.fieldBorder,
                }}
              >
                <Text style={{ fontSize: 12.5, fontWeight: active ? '700' : '600', color: active ? '#fff' : theme.text2 }}>{filter.label}</Text>
              </Press>
            );
          })}
        </ScrollView>
      ) : null}
    </View>
  );
}

function HeaderButton({ theme, name, onPress }: { theme: Theme; name: IconName; onPress: () => void }) {
  return (
    <Press
      onPress={onPress}
      accessibilityRole="button"
      style={{
        width: layout.iconButton,
        height: layout.iconButton,
        borderRadius: radius.pill,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: theme.controlSurface,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: theme.fieldBorder,
      }}
    >
      <Icon name={name} color={theme.text} size={19} />
    </Press>
  );
}

export function DiscoverRouteCard({ theme, poi, onPress }: { theme: Theme; poi: Poi; onPress: () => void }) {
  return (
    <Press onPress={onPress} style={{ borderRadius: radius.card }}>
      <View style={{ flexDirection: 'row', minHeight: 100, gap: space.sm, alignItems: 'flex-start' }}>
        <PhotoTile tone={poi.tone} seed={poi.id} radius={radius.card} resWidth={280} style={{ width: 92, height: 92, flexShrink: 0 }}>
          {poi.photoUris?.[0] ? <Image source={{ uri: poi.photoUris[0] }} contentFit="cover" style={StyleSheet.absoluteFill} /> : null}
        </PhotoTile>
        <View style={{ flex: 1, minWidth: 0, minHeight: 92, justifyContent: 'space-between' }}>
          <View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.xs }}>
              <Text numberOfLines={1} style={{ flex: 1, fontSize: 16.5, lineHeight: 21, fontWeight: '800', letterSpacing: -0.2, color: theme.text }}>{poi.name}</Text>
              {poi.mine ? <Icon name="user" color={theme.accent} size={14} /> : null}
            </View>
            <MetaLine theme={theme} icon="pin" text={poi.region.replace(/\s*·\s*/g, ' ')} />
            {poi.desc ? <Text numberOfLines={2} style={{ marginTop: 5, fontSize: 12.5, lineHeight: 16, color: theme.text2 }}>{ROUTE_TEASERS[poi.id] || poi.desc}</Text> : null}
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 6 }}>
            <RouteStatPill theme={theme} text={poi.dist} mono />
            <RouteStatPill theme={theme} text={`↑ ${poi.asc.replace('+', '')}`} mono />
            {poi.diff ? <RouteStatPill theme={theme} text={poi.diff} accent /> : null}
          </View>
        </View>
      </View>
    </Press>
  );
}

export function DiscoverJourneyCard({
  theme,
  poi,
  onPress,
  onLongPress,
  selectMode,
  selected,
}: {
  theme: Theme;
  poi: Poi;
  onPress: () => void;
  onLongPress?: () => void;
  selectMode?: boolean;
  selected?: boolean;
}) {
  return (
    <Press onPress={onPress} onLongPress={onLongPress} delayLongPress={380} style={{ borderRadius: radius.feature }}>
      <AppCard
        theme={theme}
        radius={radius.feature}
        style={{
          overflow: 'hidden',
          borderWidth: selected ? 1.5 : 0,
          borderColor: selected ? theme.accent : 'transparent',
          backgroundColor: selected ? theme.accentSofter : theme.surfaceTop,
        }}
      >
        <View style={{ flexDirection: 'row', minHeight: 118 }}>
          <PhotoTile tone={poi.tone} seed={poi.id} radius={0} resWidth={320} style={{ width: 112, alignSelf: 'stretch' }}>
            {poi.photoUris?.[0] ? <Image source={{ uri: poi.photoUris[0] }} contentFit="cover" style={StyleSheet.absoluteFill} /> : null}
            {selectMode ? <View style={{ position: 'absolute', left: space.xs, top: space.xs }}><SelectionMark theme={theme} selected={!!selected} /></View> : null}
          </PhotoTile>
          <View style={{ flex: 1, minWidth: 0, justifyContent: 'space-between', padding: space.sm }}>
            <View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.xs }}>
                <Text numberOfLines={1} style={[type.cardTitle, { color: theme.text, fontSize: 16, flex: 1 }]}>{poi.name}</Text>
                {poi.fav ? <Icon name="heartFill" color={theme.trailMine} size={13} /> : null}
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, minWidth: 0, marginTop: 6 }}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <CompactMeta theme={theme} icon="pin" text={poi.region.replace(/\s*·\s*/g, ' ')} />
                </View>
                <CompactMeta theme={theme} icon="calendar" text={poi.plannedDate || poi.date || poi.days || '—'} />
              </View>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
              <Metric theme={theme} icon="route" value={poi.dist} />
              <Metric theme={theme} icon="arrowUp" value={poi.asc.replace('+', '')} />
            </View>
          </View>
        </View>
      </AppCard>
    </Press>
  );
}

function MetaLine({ theme, icon, text }: { theme: Theme; icon: IconName; text: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.xxs, marginTop: 6, minWidth: 0 }}>
      <Icon name={icon} color={theme.text3} size={12} />
      <Text numberOfLines={1} style={[type.caption, { color: theme.text2, flexShrink: 1 }]}>{text}</Text>
    </View>
  );
}

function CompactMeta({ theme, icon, text }: { theme: Theme; icon: IconName; text: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, minWidth: 0 }}>
      <Icon name={icon} color={theme.text3} size={12} />
      <Text numberOfLines={1} style={{ fontSize: 10.5, color: theme.text2, flexShrink: 1 }}>{text}</Text>
    </View>
  );
}

function RouteStatPill({ theme, text, mono, accent }: { theme: Theme; text: string; mono?: boolean; accent?: boolean }) {
  return (
    <View style={{ height: 22, paddingHorizontal: 7, borderRadius: 6, alignItems: 'center', justifyContent: 'center', backgroundColor: accent ? theme.accentSoft : theme.fieldSurface }}>
      <Text numberOfLines={1} style={{ fontFamily: mono ? MONO : undefined, fontSize: 10, fontWeight: '700', color: accent ? theme.accent : theme.text2 }}>{text}</Text>
    </View>
  );
}

function Metric({ theme, icon, value, iconColor, mono = true }: { theme: Theme; icon: IconName; value: string; iconColor?: string; mono?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.xxs, minWidth: 0 }}>
      <Icon name={icon} color={iconColor || theme.text3} size={13} />
      <Text numberOfLines={1} style={{ fontFamily: mono ? MONO : undefined, fontSize: 10.5, color: theme.text2, flexShrink: 1 }}>{value}</Text>
    </View>
  );
}

function SelectionMark({ theme, selected }: { theme: Theme; selected: boolean }) {
  return (
    <View style={{ alignSelf: 'center', width: 22, height: 22, borderRadius: radius.pill, borderWidth: 2, borderColor: selected ? theme.accent : 'rgba(255,255,255,0.86)', backgroundColor: selected ? theme.accent : 'rgba(0,0,0,0.28)', alignItems: 'center', justifyContent: 'center' }}>
      {selected ? <Icon name="check" color="#fff" size={13} strokeWidth={3} /> : null}
    </View>
  );
}
