import React, { useMemo, useState } from 'react';
import { Dimensions, Share, StyleSheet, Text, View } from 'react-native';
import { Theme } from '../../theme/theme';
import { MONO } from '../../theme/fonts';
import { Poi } from '../../data/pois';
import { getRouteDemoGuides, getRouteGuidePlans } from '../../data/routeGuides';
import { radius, space, type } from '../../design-system';
import { useI18n } from '../../i18n';
import { useNav } from '../../nav/NavContext';
import { Icon, IconName } from '../Icon';
import { PhotoTile } from '../PhotoTile';
import { Press } from '../Press';
import { RoutePhotoCarousel } from './RoutePhotoCarousel';
import { RouteGuideRow, RouteGuideSectionHeader, RouteReferencePlanCard, RouteWeatherCard } from './RouteGuideContent';
import { routeGuideCopy } from './routeGuideCopy';
import { getRouteConditionFixtures } from '../../data/routeConditions';
import { RouteConditionCard } from './RouteConditionCard';

export function RoutePreviewPanel({ theme, poi, onClose, showActions = true, onFeedback, onPlanRoute, onNavigate }: { theme: Theme; poi: Poi; onClose?: () => void; showActions?: boolean; onFeedback?: () => void; onPlanRoute?: (route: Poi) => void; onNavigate?: (route: Poi) => void }) {
  const nav = useNav();
  const { t, resolved } = useI18n();
  const c = routeGuideCopy[resolved];
  const route = nav.merged(poi);
  const difficultyLabel = route.diff ? ({ 易: '轻松', 中: '适中', 中高: '进阶', 高: '挑战' } as const)[route.diff] : undefined;
  const plans = useMemo(() => getRouteGuidePlans(route), [route.id, route.name]);
  const guides = useMemo(() => getRouteDemoGuides(plans), [plans]);
  const reports = useMemo(() => getRouteConditionFixtures(route), [route.id, route.tone]);
  const [selectedPlanId, setSelectedPlanId] = useState('day-hike');


  return (
    <View style={{ paddingTop: space.xxs, paddingBottom: showActions ? space.xl : 112 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
        <Text numberOfLines={2} style={[type.pageTitle, { flex: 1, color: theme.text, fontSize: 28, lineHeight: 34 }]}>{route.name}</Text>
        {onClose ? (
          <Press onPress={onClose} accessibilityRole="button" style={{ width: 44, height: 44, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="close" color={theme.text} size={23} />
          </Press>
        ) : null}
      </View>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: space.md }}>
        {difficultyLabel ? <InfoPill theme={theme} text={difficultyLabel} /> : null}
        <InfoPill theme={theme} icon="distance" text={route.dist} mono />
        <InfoPill theme={theme} icon="arrowUp" text={route.asc.replace('+', '')} mono />
        <InfoPill theme={theme} icon="pin" text={route.region.replace(/\s*·\s*/g, ' ')} onPress={onNavigate ? () => onNavigate(route) : undefined} />
      </View>

      {route.bestMonths?.length ? <SeasonStrip theme={theme} months={route.bestMonths} note={route.seasonNote} /> : null}

      <View style={{ marginTop: space.xl }}>
        <RoutePhotoCarousel
          theme={theme}
          photos={route.photoUris}
          width={Dimensions.get('window').width - space.md * 2}
          height={196}
          radius={radius.feature}
          fallback={<PhotoTile tone={route.tone} seed={route.id} radius={radius.feature} resWidth={900} style={StyleSheet.absoluteFill} />}
        />
      </View>

      {route.desc ? (
        <View style={{ marginTop: space.xl }}>
          <Text style={[type.sectionTitle, { color: theme.text }]}>{t('journey.section.routeAbout')}</Text>
          <Text style={[type.body, { color: theme.text2, lineHeight: 23, marginTop: space.sm }]}>{route.desc}</Text>
        </View>
      ) : null}

      <View style={{ marginTop: space.xxxl }}>
        <RouteGuideSectionHeader theme={theme} title={c.weatherDetail} />
        <RouteWeatherCard theme={theme} lng={route.lng} lat={route.lat} onPress={() => nav.openRouteGuide({ route, view: 'weather' })} />
      </View>
      <View style={{ marginTop: space.xxxl }}>
        <RouteGuideSectionHeader theme={theme} title={c.conditions} action={c.allConditions} onAction={() => nav.openRouteGuide({ route, view: 'conditions' })} />
        {reports.slice(0, 2).map((report) => <RouteConditionCard key={report.id} theme={theme} report={report} compact onPress={() => nav.openRouteGuide({ route, view: 'conditions' })} />)}
      </View>
      <View style={{ marginTop: space.xxxl }}>
        <RouteGuideSectionHeader theme={theme} title={c.plans} />
        <RouteReferencePlanCard theme={theme} plans={plans} selectedId={selectedPlanId} onSelect={setSelectedPlanId} onOpen={(plan) => nav.openRouteGuide({ route, view: 'plan', planId: plan.id })} />
      </View>
      <View style={{ marginTop: space.xxxl }}>
        <RouteGuideSectionHeader theme={theme} title={c.guides} action={c.allGuides} onAction={() => nav.openRouteGuide({ route, view: 'guides' })} />
        {guides.slice(0, 2).map((guide, index) => <View key={guide.id} style={{ borderBottomWidth: index === 0 ? StyleSheet.hairlineWidth : 0, borderBottomColor: theme.hairline }}><RouteGuideRow theme={theme} guide={guide} photoUri={route.photoUris?.[index] ?? route.photoUris?.[0]} onPress={() => nav.openRouteGuide({ route, view: 'guide', guideId: guide.id })} /></View>)}
      </View>
      {showActions ? <RoutePreviewActions theme={theme} poi={route} style={{ marginTop: space.xl }} onPlanRoute={onPlanRoute} /> : null}
      {onFeedback ? (
        <Press
          onPress={onFeedback}
          accessibilityRole="button"
          accessibilityLabel={t('discover.routeFeedback')}
          style={{ flexDirection: 'row', alignItems: 'center', minHeight: 44, marginTop: space.md, paddingVertical: space.xxs, borderTopWidth: StyleSheet.hairlineWidth, borderColor: theme.fieldBorder }}
        >
          <View style={{ width: 23, height: 23, borderRadius: 12, borderWidth: 1.5, borderColor: theme.text2, alignItems: 'center', justifyContent: 'center', marginRight: space.sm }}>
            <Text style={{ color: theme.text2, fontSize: 14, lineHeight: 17, fontWeight: '400' }}>?</Text>
          </View>
          <Text style={{ flex: 1, fontSize: 14, fontWeight: '400', color: theme.text2 }}>{t('discover.routeFeedback')}</Text>
          <Icon name="chevronR" color={theme.text3} size={16} strokeWidth={1.5} />
        </Press>
      ) : null}
    </View>
  );
}

export function RoutePreviewActions({ theme, poi, style, onPlanRoute }: { theme: Theme; poi: Poi; style?: object; onPlanRoute?: (route: Poi) => void }) {
  const nav = useNav();
  const { t } = useI18n();
  const route = nav.merged(poi);
  const shareRoute = async () => {
    const message = `${route.name}\n${[route.region, route.dist, route.asc].filter(Boolean).join(' · ')}`;
    try {
      await Share.share({ title: route.name, message });
    } catch (error: any) {
      if (error?.message !== 'User did not share') console.warn('[RoutePreviewPanel] share error:', error);
    }
  };
  return (
    <View style={[{ flexDirection: 'row', justifyContent: 'flex-start', gap: space.xs, marginHorizontal: space.xs }, style]}>
      <ActionPill
        theme={theme}
        icon={route.fav ? 'heartFill' : 'heart'}
        label={t('journey.more.favorite')}
        active={!!route.fav}
        preserveStyle
        onPress={() => nav.toggleFav()}
      />
      <ActionPill theme={theme} icon="share" label={t('common.share')} onPress={() => void shareRoute()} />
      <Press
        hitSlop={3}
        onPress={() => onPlanRoute ? onPlanRoute(route) : nav.openNewJourney(route)}
        accessibilityRole="button"
        style={{ flexShrink: 1, height: 38, paddingHorizontal: space.sm, borderRadius: radius.pill, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, backgroundColor: theme.controlSurface, borderWidth: StyleSheet.hairlineWidth, borderColor: theme.fieldBorder, boxShadow: theme.dark ? '0px 4px 12px rgba(0,0,0,0.38)' : '0px 4px 12px rgba(0,0,0,0.08)' }}
      >
        <Icon name="calendar" color={theme.text} size={16} />
        <Text numberOfLines={1} style={{ fontSize: 13, fontWeight: '700', color: theme.text }}>{t('journey.cta.planRoute')}</Text>
      </Press>
    </View>
  );
}

const MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

// A 12-cell month strip highlighting the route's best season, with the
// free-form note (封山期, 雨季…) below.
function SeasonStrip({ theme, months, note }: { theme: Theme; months: number[]; note?: string }) {
  const { t } = useI18n();
  const best = new Set(months);
  return (
    <View style={{ marginTop: space.md }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 7 }}>
        <Text style={{ fontSize: 13, fontWeight: '800', color: theme.text }}>{t('route.seasonTitle')}</Text>
      </View>
      <View style={{ flexDirection: 'row', gap: 4 }}>
        {MONTHS.map((m) => {
          const isBest = best.has(m);
          return (
            <View
              key={m}
              style={{
                flex: 1,
                height: 30,
                borderRadius: 8,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: isBest ? theme.accent : theme.dark ? theme.fieldSurface : '#F3F3F4',
              }}
            >
              <Text style={{ fontSize: 11, fontFamily: MONO, fontWeight: '700', color: isBest ? '#FFFFFF' : theme.text3 }}>{m}</Text>
            </View>
          );
        })}
      </View>
      {note ? (
        <Text style={{ fontSize: 12, color: theme.text3, lineHeight: 17, marginTop: 7 }}>{note}</Text>
      ) : null}
    </View>
  );
}

function InfoPill({ theme, icon, text, accent, mono, onPress }: { theme: Theme; icon?: IconName; text: string; accent?: boolean; mono?: boolean; onPress?: () => void }) {
  const content = (
    <View style={{ height: 30, maxWidth: '100%', paddingHorizontal: 10, borderRadius: 8, flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: accent ? theme.accent : theme.dark ? theme.fieldSurface : '#F3F3F4' }}>
      {icon ? <Icon name={icon} color={accent ? '#FFFFFF' : theme.text3} size={13} /> : null}
      <Text numberOfLines={1} style={{ fontFamily: mono ? MONO : undefined, fontSize: 11.5, fontWeight: '700', color: accent ? '#FFFFFF' : theme.text2, flexShrink: 1 }}>{text}</Text>
    </View>
  );
  return onPress ? <Press onPress={onPress} accessibilityRole="button" accessibilityLabel={text}>{content}</Press> : content;
}

function ActionPill({ theme, icon, label, active, preserveStyle = false, onPress }: { theme: Theme; icon: IconName; label: string; active?: boolean; preserveStyle?: boolean; onPress: () => void }) {
  const containerActive = active && !preserveStyle;
  return (
    <Press hitSlop={3} onPress={onPress} accessibilityRole="button" style={{ flexShrink: 1, minWidth: 0, height: 38, paddingHorizontal: space.sm, borderRadius: radius.pill, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, backgroundColor: containerActive ? theme.accentSoft : theme.controlSurface, borderWidth: StyleSheet.hairlineWidth, borderColor: containerActive ? theme.accent : theme.fieldBorder, boxShadow: theme.dark ? '0px 4px 12px rgba(0,0,0,0.38)' : '0px 4px 12px rgba(0,0,0,0.08)' }}>
      <Icon name={icon} color={active ? theme.accent : theme.text} size={16} />
      <Text numberOfLines={1} style={{ fontSize: 12, fontWeight: '700', color: active ? theme.accent : theme.text }}>{label}</Text>
    </Press>
  );
}
