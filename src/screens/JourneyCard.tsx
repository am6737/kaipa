// JourneyCard.tsx — SelectedPoiCard: the rich detail body for a route or journey,
// shown inside the discover sheet and (full-bleed) in the JourneyCardFull overlay.
import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, Share, Platform, Image } from 'react-native';
import Svg, { Path as SvgPath, Circle, Rect } from 'react-native-svg';
import { MONO } from '../theme/fonts';
import { Theme } from '../theme/theme';
import { Poi, STATUS_COLOR, JourneyStatus } from '../data/pois';
import { buildElevation } from '../data/elevation';
import { JourneyTimelineCard } from '../components/overlays/JourneyTimeline';
import { PhotoTile } from '../components/PhotoTile';
import { Avatar, AvatarStack } from '../components/Avatar';
import { Icon, IconName } from '../components/Icon';
import { Press } from '../components/Press';
import { ElevationStrip } from '../components/ElevationStrip';
import { useNav } from '../nav/NavContext';
import { elevAccent } from '../theme/shadow';
import { paletteFor } from '../data/tones';
import { LinearGradient } from 'expo-linear-gradient';
import { useInspo } from '../data/inspoStore';
import { genPhotos } from '../components/overlays/PhotoWall';
import { useI18n, TKey } from '../i18n';

function SectionHeader({ theme, title, action, onAction }: { theme: Theme; title: string; action?: string; onAction?: () => void }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
      <Text style={{ fontSize: 16.5, fontWeight: '700', color: theme.text }}>{title}</Text>
      {action ? (
        <Press onPress={onAction}>
          <Text style={{ fontSize: 13.5, fontWeight: '600', color: theme.accent }}>{action}</Text>
        </Press>
      ) : null}
    </View>
  );
}

function StatCol({ theme, label, value, color }: { theme: Theme; label: string; value: string; color?: string }) {
  return (
    <View style={{ flex: 1, alignItems: 'center' }}>
      <Text style={{ fontFamily: MONO, fontSize: 15, fontWeight: '700', color: color || theme.text }}>{value}</Text>
      <Text style={{ fontSize: 10.5, color: theme.text2, marginTop: 3 }}>{label}</Text>
    </View>
  );
}

function IconButton({ theme, name, onPress, color }: { theme: Theme; name: IconName; onPress?: () => void; color?: string }) {
  return (
    <Press
      onPress={onPress}
      style={{
        width: 42,
        height: 42,
        borderRadius: 13,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: theme.dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)',
      }}
    >
      <Icon name={name} color={color || theme.text} size={21} />
    </Press>
  );
}

// 瞬间 inline card for 计划中 journeys. Tapping opens the full-screen PhotoWall
// detail page where the user can add / remove real photos and videos. This card
// is a preview: it shows up to 6 thumbnails from the inspo store, or an empty
// state that opens the same detail page.
function PlanningMoments({ theme, poi, status }: { theme: Theme; poi: Poi; status: string }) {
  const nav = useNav();
  const { t } = useI18n();
  const inspo = useInspo(poi.id);
  const has = inspo.media.length > 0;

  const openDetail = () => nav.openPhotoWall({ info: poi, mode: 'mine', status });

  const count = inspo.media.length;
  const preview = inspo.media.slice(0, 6);

  return (
    <View style={{ paddingBottom: 18 }}>
      <SectionHeader theme={theme} title={t('journey.moments.title')} action={t('journey.moments.countPhotos', { count })} onAction={openDetail} />
      {has ? (
        <Press onPress={openDetail}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 5 }}>
            {preview.map((m) => (
              <View
                key={m.id}
                style={{ width: '31.7%', aspectRatio: 1, borderRadius: 9, overflow: 'hidden', backgroundColor: theme.dark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)' }}
              >
                {m.kind === 'video' ? (
                  <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.dark ? '#1c1c1e' : '#2a2a2c' }}>
                    <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(255,255,255,0.22)', alignItems: 'center', justifyContent: 'center' }}>
                      <Icon name="play" color="#fff" size={16} />
                    </View>
                  </View>
                ) : (
                  <Image source={{ uri: m.uri }} resizeMode="cover" style={{ width: '100%', height: '100%' }} />
                )}
                {m.kind === 'video' ? (
                  <View style={{ position: 'absolute', left: 5, bottom: 5, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6, backgroundColor: 'rgba(0,0,0,0.5)' }}>
                    <Text style={{ fontSize: 9.5, fontWeight: '700', color: '#fff' }}>{t('journey.media.video')}</Text>
                  </View>
                ) : null}
              </View>
            ))}
          </View>
        </Press>
      ) : (
        <Press
          onPress={openDetail}
          style={{
            borderRadius: 14,
            paddingVertical: 24,
            paddingHorizontal: 16,
            alignItems: 'center',
            gap: 8,
            backgroundColor: theme.dark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.02)',
            borderWidth: 1,
            borderStyle: 'dashed',
            borderColor: theme.dark ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.18)',
          }}
        >
          <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
            <Rect x={3} y={6} width={18} height={14} rx={2.5} stroke={theme.text2} strokeWidth={1.6} />
            <Circle cx={12} cy={13} r={3.5} stroke={theme.text2} strokeWidth={1.6} />
            <SvgPath d="M9 6 10 4h4l1 2" stroke={theme.text2} strokeWidth={1.6} strokeLinejoin="round" />
            <SvgPath d="M17 9.5h2M18 8.5v2" stroke={theme.text2} strokeWidth={1.4} strokeLinecap="round" />
          </Svg>
          <Text style={{ fontSize: 13, fontWeight: '600', color: theme.text }}>{t('journey.moments.planningEmptyTitle')}</Text>
          <Text style={{ fontSize: 11, color: theme.text2 }}>{t('journey.moments.planningEmptyBody')}</Text>
        </Press>
      )}
    </View>
  );
}

export function SelectedPoiCard({ theme, poi, fullBleed }: { theme: Theme; poi: Poi; fullBleed?: boolean }) {
  const nav = useNav();
  const { t } = useI18n();
  const [chartW, setChartW] = useState(320);
  const isJourney = poi.kind === 'journey';
  const status = (poi.status || 'completed') as JourneyStatus;
  const isMine = isJourney;
  const isRecorded = !!poi.photoUris;
  const hasRealElevation = !isRecorded || !!poi.trackElevation;
  const series = useMemo(() => buildElevation(poi), [poi.id, poi.dist, poi.asc, poi.trackElevation]);

  // photo preview — same genPhotos as PhotoWall so thumbnails match the detail
  const wallPhotos = useMemo(() => genPhotos(poi, status), [poi.name, status, poi.totalDays, poi.photoUris]);
  const previewPhotos = wallPhotos.slice(0, status === 'ongoing' ? 6 : 9);

  let ctaLabel = t('journey.cta.startTrip');
  let ctaAction = () => nav.showToast(t('journey.toast.startPlanning'));
  // CTA bg follows the journey status (prototype: `st ? st.color : t.accent`).
  // Only a completed journey diverges from accent — it uses the muted gray.
  let ctaBg = theme.accent;
  if (isJourney) {
    if (status === 'planning') {
      ctaLabel = t('journey.cta.depart');
      ctaAction = () => {
        nav.startJourney();
        nav.showToast(t('journey.toast.journeyStarted'));
      };
    } else if (status === 'ongoing') {
      ctaLabel = t('journey.cta.complete');
      ctaAction = () => {
        nav.completeJourney();
        nav.showToast(t('journey.toast.journeyCompleted'));
      };
    } else {
      ctaLabel = t('journey.cta.departAgain');
      ctaBg = STATUS_COLOR('completed', theme.accent, theme.dark);
      // Clone this finished journey into a fresh planned journey — reuses the
      // new-journey flow, seeded with this route and jumping past route picking.
      ctaAction = () => nav.openNewJourney(poi);
    }
  }

  // Destructive label + confirm copy adapt to the journey's status (a plan is
  // "cancelled", an in-progress trip is "abandoned", a finished one "deleted").
  const removeLabel = status === 'planning' ? t('journey.remove.labelPlanning') : status === 'ongoing' ? t('journey.remove.labelOngoing') : t('journey.remove.labelCompleted');
  const confirmTitle = status === 'planning' ? t('journey.remove.confirmPlanning') : status === 'ongoing' ? t('journey.remove.confirmOngoing') : t('journey.remove.confirmCompleted');
  const confirmRemove = () =>
    nav.openActionSheet({
      title: confirmTitle,
      message: t('journey.remove.confirmMessage'),
      items: [{ label: removeLabel, destructive: true, onPress: () => nav.removeJourney() }],
    });

  // text-only items — the action sheet matches the rest of the app's icon-less,
  // iOS-standard style
  const moreItems = isJourney
    ? [
        { label: t('journey.more.settings'), onPress: () => nav.openJourneySettings(poi) },
        { label: removeLabel, destructive: true, onPress: confirmRemove },
      ]
    : [
        { label: poi.fav ? t('journey.more.unfavorite') : t('journey.more.favorite'), onPress: () => nav.toggleFav() },
        { label: t('journey.more.report'), destructive: true, onPress: () => nav.showToast(t('journey.toast.reported')) },
      ];

  // Share via the native OS share sheet (Messages / WeChat / Copy / …). The link
  // is a stable deep-link slug; the blurb carries the trip's key stats.
  const shareLink = `https://kaipa.app/${isJourney ? 'j' : 'r'}/${poi.id}`;
  const onShare = async () => {
    const stats = [poi.dist, poi.asc, isJourney ? poi.days : poi.diff].filter(Boolean).join(' · ');
    const blurb = `${poi.name} · ${poi.region}\n${stats}`;
    try {
      const result = await Share.share(
        Platform.OS === 'ios'
          ? { message: blurb, url: shareLink, title: poi.name }
          : { title: poi.name, message: `${blurb}\n${shareLink}` }
      );
      if (result.action === Share.sharedAction) nav.showToast(t('journey.toast.shared'));
    } catch {
      nav.showToast(t('journey.toast.shareFailed'));
    }
  };

  return (
    <View onLayout={(e) => setChartW(e.nativeEvent.layout.width - (fullBleed ? 0 : 0))}>
      {/* hero */}
      <View style={{ marginHorizontal: fullBleed ? -10 : -16, marginTop: fullBleed ? 0 : -2, marginBottom: 16 }}>
        <View style={{ height: 224 }}>
          {poi.photoUris?.[0] ? (
            <Image source={{ uri: poi.photoUris[0] }} resizeMode="cover" style={StyleSheet.absoluteFill} />
          ) : (
            <LinearGradient
              colors={[paletteFor(poi.tone)[0], paletteFor(poi.tone)[2]]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={StyleSheet.absoluteFill}
            />
          )}
          {nav.pointSource && (
            <Press
              onPress={() => nav.openPoint(nav.pointSource as Poi)}
              style={{
                position: 'absolute',
                top: 14,
                left: 14,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 5,
                paddingHorizontal: 11,
                height: 32,
                borderRadius: 16,
                backgroundColor: 'rgba(0,0,0,0.35)',
              }}
            >
              <Icon name="chevronL" color="#fff" size={15} />
              <Text style={{ color: '#fff', fontSize: 12.5, fontWeight: '600' }} numberOfLines={1}>
                {nav.pointSource.name}
              </Text>
            </Press>
          )}
          <View style={{ position: 'absolute', left: 16, right: 16, bottom: 16 }}>
            {isJourney && (
              <View
                style={{
                  alignSelf: 'flex-start',
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 5,
                  paddingHorizontal: 8,
                  height: 22,
                  borderRadius: 7,
                  backgroundColor: 'rgba(0,0,0,0.4)',
                  marginBottom: 8,
                }}
              >
                <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: STATUS_COLOR(status, theme.accent, true) }} />
                <Text style={{ color: '#fff', fontSize: 11.5, fontWeight: '600' }}>
                  {t(`common.status.${status}` as TKey)}
                  {status === 'ongoing' && poi.dayIndex ? ` · Day ${poi.dayIndex}/${poi.totalDays}` : ''}
                </Text>
              </View>
            )}
            <Text style={{ color: '#fff', fontSize: 26, fontWeight: '800', textShadowColor: 'rgba(0,0,0,0.4)', textShadowRadius: 6, textShadowOffset: { width: 0, height: 1 } }}>
              {poi.name}
            </Text>
            <Text style={{ color: 'rgba(255,255,255,0.86)', fontSize: 13, marginTop: 3 }}>
              {poi.region}
              {poi.date ? ' · ' + poi.date : ''}
            </Text>
          </View>
        </View>
      </View>

      {/* stats strip */}
      <View
        style={{
          flexDirection: 'row',
          paddingVertical: 12,
          borderTopWidth: StyleSheet.hairlineWidth,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderColor: theme.hairline,
        }}
      >
        <StatCol theme={theme} label={t('journey.stat.distance')} value={poi.dist} />
        <View style={{ width: StyleSheet.hairlineWidth, backgroundColor: theme.hairline }} />
        <StatCol theme={theme} label={t('journey.stat.ascent')} value={poi.asc} />
        <View style={{ width: StyleSheet.hairlineWidth, backgroundColor: theme.hairline }} />
        {isJourney ? (
          <StatCol theme={theme} label={t('journey.stat.days')} value={poi.days || '—'} color={theme.accent} />
        ) : (
          <StatCol theme={theme} label={t('journey.stat.difficulty')} value={poi.diff ? t(`common.diff.${poi.diff}` as TKey) : '—'} color={theme.accent} />
        )}
        <View style={{ width: StyleSheet.hairlineWidth, backgroundColor: theme.hairline }} />
        {isJourney ? (
          <StatCol theme={theme} label={t('journey.stat.companions')} value={t('journey.companions.count', { count: poi.companions ?? 0 })} />
        ) : (
          <StatCol theme={theme} label={t('journey.stat.rating')} value={poi.rating || '—'} />
        )}
      </View>

      {/* primary action row */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 16 }}>
        <Press onPress={ctaAction} style={[{ flex: 1, height: 42, borderRadius: 13, backgroundColor: ctaBg, alignItems: 'center', justifyContent: 'center' }, elevAccent(ctaBg)]}>
          <Text style={{ color: '#fff', fontSize: 15, fontWeight: '700' }}>{ctaLabel}</Text>
        </Press>
        <IconButton theme={theme} name={poi.fav ? 'heartFill' : 'heart'} color={poi.fav ? theme.trailMine : theme.text} onPress={() => nav.toggleFav()} />
        <IconButton theme={theme} name="share" onPress={onShare} />
        <IconButton theme={theme} name="more" onPress={() => nav.openActionSheet({ items: moreItems as any })} />
      </View>

      {/* description */}
      {poi.desc ? (
        <View style={{ paddingBottom: 18 }}>
          <SectionHeader theme={theme} title={t('journey.section.about')} />
          <Text style={{ fontSize: 14.5, lineHeight: 22, color: theme.text2 }}>{poi.desc}</Text>
        </View>
      ) : null}

      {/* elevation / route track */}
      <View style={{ paddingBottom: 18 }}>
        <SectionHeader theme={theme} title={t('journey.section.route')} action={hasRealElevation ? t('journey.section.more') : undefined} onAction={hasRealElevation ? () => nav.openElevation({ info: poi, isMine }) : undefined} />
        {hasRealElevation ? (
        <Press onPress={() => nav.openElevation({ info: poi, isMine })}>
          <View
            style={{
              backgroundColor: theme.dark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.022)',
              borderRadius: 16,
              padding: 12,
              borderWidth: StyleSheet.hairlineWidth,
              borderColor: theme.hairline,
            }}
          >
            <ElevationStrip theme={theme} series={series} width={chartW - 24} color={isMine ? theme.trailMine : theme.accent} gradId={'elev-' + poi.id} />
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 }}>
              <Text style={{ fontFamily: MONO, fontSize: 10.5, color: theme.text2 }}>
                {series.minEle}–{series.maxEle} m
              </Text>
              <Text style={{ fontFamily: MONO, fontSize: 10.5, color: theme.text2 }}>↑ {series.ascent} m</Text>
            </View>
          </View>
        </Press>
        ) : (
        <Press onPress={() => nav.openAddRoute()}>
          <View style={{ alignItems: 'center', paddingVertical: 24, borderRadius: 16, backgroundColor: theme.dark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.018)', borderWidth: StyleSheet.hairlineWidth, borderColor: theme.hairline }}>
            <Icon name="route" color={theme.text3} size={24} />
            <Text style={{ fontSize: 13, color: theme.text3, marginTop: 8 }}>{t('journey.empty.route')}</Text>
            <Text style={{ fontSize: 11.5, color: theme.text3, marginTop: 2 }}>{t('journey.empty.routeHint')}</Text>
          </View>
        </Press>
        )}
      </View>

      {/* companions (journeys) */}
      {isJourney ? (
        poi.companionList && poi.companionList.length > 0 ? (
        <View style={{ paddingBottom: 18 }}>
          <SectionHeader theme={theme} title={t('journey.section.companions')} action={t('journey.section.manage')} onAction={() => nav.openManageCompanions(poi)} />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <AvatarStack people={poi.companionList} size={36} max={6} ringColor={theme.dark ? '#1c1c1e' : '#fff'} />
            <Text style={{ fontSize: 13, color: theme.text2 }}>{t('journey.companions.companionCount', { count: poi.companions ?? 0 })}</Text>
          </View>
        </View>
        ) : (
        <View style={{ paddingBottom: 18 }}>
          <SectionHeader theme={theme} title={t('journey.section.companions')} action={t('journey.section.manage')} onAction={() => nav.openManageCompanions(poi)} />
          <Press onPress={() => nav.openManageCompanions(poi)}>
            <View style={{ alignItems: 'center', paddingVertical: 24, borderRadius: 16, backgroundColor: theme.dark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.018)', borderWidth: StyleSheet.hairlineWidth, borderColor: theme.hairline }}>
              <Icon name="people" color={theme.text3} size={24} />
              <Text style={{ fontSize: 13, color: theme.text3, marginTop: 8 }}>{t('journey.empty.companions')}</Text>
              <Text style={{ fontSize: 11.5, color: theme.text3, marginTop: 2 }}>{t('journey.empty.companionsHint')}</Text>
            </View>
          </Press>
        </View>
        )
      ) : null}

      {/* 行程 timeline */}
      {isJourney ? <JourneyTimelineCard theme={theme} info={poi} /> : null}

      {/* photo grid */}
      {isJourney && status === 'planning' ? (
        <PlanningMoments theme={theme} poi={poi} status={status} />
      ) : previewPhotos.length > 0 ? (
        <View style={{ paddingBottom: 18 }}>
          <SectionHeader theme={theme} title={isJourney ? t('journey.moments.title') : t('journey.moments.userPhotos')} action={t('common.all')} onAction={() => nav.openPhotoWall({ info: poi, mode: 'mine', status })} />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {previewPhotos.map((p) => (
              <Press key={p.id} onPress={() => nav.openPhotoWall({ info: poi, mode: 'mine', status })} style={{ width: '31.7%' }}>
                {p.uri ? (
                  <Image source={{ uri: p.uri }} resizeMode="cover" style={{ aspectRatio: 1, borderRadius: 11, backgroundColor: theme.dark ? '#1a1a1a' : '#e8e8e8' }} />
                ) : (
                  <PhotoTile tone={p.tone} seed={poi.id + p.id} radius={11} style={{ aspectRatio: 1 }} resWidth={420} />
                )}
              </Press>
            ))}
          </View>
        </View>
      ) : isJourney ? (
        <View style={{ paddingBottom: 18 }}>
          <SectionHeader theme={theme} title={t('journey.moments.title')} />
          <Press onPress={() => nav.openPhotoWall({ info: poi, mode: 'mine', status })}>
            <View style={{ alignItems: 'center', paddingVertical: 24, borderRadius: 16, backgroundColor: theme.dark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.018)', borderWidth: StyleSheet.hairlineWidth, borderColor: theme.hairline }}>
              <Icon name="camera" color={theme.text3} size={24} />
              <Text style={{ fontSize: 13, color: theme.text3, marginTop: 8 }}>{t('journey.empty.moments')}</Text>
              <Text style={{ fontSize: 11.5, color: theme.text3, marginTop: 2 }}>{t('journey.empty.momentsHint')}</Text>
            </View>
          </Press>
        </View>
      ) : null}

      {/* author footer (routes) */}
      {!isJourney ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, paddingBottom: 26 }}>
          <Avatar ini="林" tone="forest" size={32} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 13.5, fontWeight: '600', color: theme.text }}>{t('journey.author.uploadedBy', { name: '林深见鹿' })}</Text>
            <Text style={{ fontSize: 11.5, color: theme.text2 }}>{t('journey.author.walkedCount', { count: poi.reviews ?? 0 })}</Text>
          </View>
        </View>
      ) : null}
    </View>
  );
}
