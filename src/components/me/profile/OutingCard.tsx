// OutingCard.tsx — 时间线里的「一次出行」：标题、统计、轨迹缩略图、照片。
// 有轨迹时显示 用时 / 距离 / 均速 / 爬升，只有旅程时显示 天数 / 照片 / 同行。
// 条目之间只用留白分隔，不画分割线。
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Platform, Text, View } from 'react-native';
import { Image } from 'expo-image';
import Svg, { Path } from 'react-native-svg';
import { Globe, Lock, Users } from 'lucide-react-native';
import type { Theme } from '../../../theme/theme';
import { radius, space } from '../../../design-system';
import { Avatar } from '../../Avatar';
import { Icon } from '../../Icon';
import { Press } from '../../Press';
import { useI18n, type TKey } from '../../../i18n';
import type { Outing, OutingPhoto, Visibility } from '../../../hooks/useSocial';
import { regionLabel } from '../../../lib/regionLabel';
import { NATIVE_MAP_AVAILABLE } from '../../maps/NativeMap';
import { useMapPresentation } from '../../maps/MapPresentationContext';
import { TrackMap, type TrackMapHandle } from '../../overlays/TrackMap';
import { EndpointBadge } from '../../discover/routeEndpointMarkers';
import { isLoopTrack } from '../../../lib/routeDirection';
import * as Network from 'expo-network';
import { cachedSnapshot, keepSnapshot, snapshotKey, useNearScreen, useSnapshotTurn, type OutingSnapshot } from './outingMapSnapshots';

const MAP_HEIGHT = 190;
const MAP_PAD = 22;
// 地图一直没报告画好时，最多等这么久就放弃，让队里下一张卡片接着截。
const SNAPSHOT_TIMEOUT_MS = 10_000;
// 截图用的地图每边比卡片多出这么多，卡片只露中间，角上的地图署名落在外面。
// 全屏地图照常显示署名，只有卡片预览不带。
const BLEED = 40;
// 截图存成 2 倍图：卡片上看不出和 3 倍的区别，文件小一半多。
const SNAPSHOT_SCALE = 2;
// 暂时不在时间线卡片里显示「写评论」提示和「查看旅程/轨迹」入口；改成 true 即可恢复。
const SHOW_CARD_ACTIONS = false;

export function OutingCard({ theme, outing, subject, avatarUri, showVisibility, highlighted, onOpen, onChangeVisibility, reviewPrompt }: {
  theme: Theme;
  outing: Outing;
  /** 「你」或对方昵称，拼进标题行。 */
  subject: string;
  /** 这条出行主人的头像；没有时显示通用占位。 */
  avatarUri?: string | null;
  showVisibility?: boolean;
  highlighted?: boolean;
  /** 别人的出行大多打不开（不是同行者），这时不给入口。 */
  onOpen?: () => void;
  /** 只有自己的时间线给这个回调，可见范围标签才可点。 */
  onChangeVisibility?: () => void;
  /** 自己走过、还没评论过的路线，提示写评论。 */
  reviewPrompt?: { route: string; onWrite: () => void };
}) {
  const { t } = useI18n();
  const hasTrack = outing.kind !== 'journey';
  const headlineKey: TKey = outing.kind === 'track'
    ? 'profile.headlineTrack'
    : outing.kind === 'both' ? 'profile.headlineBoth' : 'profile.headlineJourney';
  const when = outing.dateLabel || fmtDate(outing.occurredAt, t);
  const stats = hasTrack
    ? [
        [t('profile.statDuration'), fmtDuration(outing.durationMs)],
        [t('profile.statDistance'), fmtKm(outing.distM)],
        [t('profile.statSpeed'), fmtSpeed(outing.distM, outing.durationMs)],
        [t('profile.statAscent'), outing.ascM != null ? `${Math.round(outing.ascM)} m` : '–'],
      ]
    : [
        [t('profile.statDays'), outing.totalDays ? String(outing.totalDays) : '–'],
        [t('profile.statPhotos'), String(outing.photoCount)],
        [t('profile.statCompanions'), String(outing.companions)],
      ];

  return (
    <View style={{
      marginHorizontal: -10,
      padding: 10,
      borderRadius: radius.feature - 2,
      backgroundColor: highlighted ? theme.fieldSurface : 'transparent',
    }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
        <Avatar uri={avatarUri ?? undefined} size={44} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text numberOfLines={1} style={{ fontSize: 15, fontWeight: '600', color: theme.text }}>
            {t(headlineKey, { who: subject })}
          </Text>
          <Text numberOfLines={1} style={{ fontSize: 13, color: theme.text3, marginTop: 1 }}>
            {outing.region ? `${when}　${regionLabel(outing.region)}` : when}
          </Text>
        </View>
        {showVisibility ? <VisibilityChip theme={theme} visibility={outing.visibility} onChange={onChangeVisibility} /> : null}
      </View>

      <Press disabled={!onOpen} onPress={onOpen} accessibilityRole={onOpen ? 'button' : undefined} accessibilityLabel={outing.title} scaleTo={0.99}>
        <Text numberOfLines={2} style={{ marginTop: space.sm, fontSize: 19, fontWeight: '700', color: theme.text }}>
          {outing.title}
        </Text>
        {outing.routeName ? <Text numberOfLines={1} style={{ fontSize: 13, color: theme.text2, marginTop: 2 }}>{outing.routeName}</Text> : null}

        <View style={{ flexDirection: 'row', columnGap: 10, marginVertical: space.sm }}>
          {stats.map(([label, value]) => (
            <View key={label} style={{ flex: 1, minWidth: 0 }}>
              <Text numberOfLines={1} style={{ fontSize: 12, color: theme.text2 }}>{label}</Text>
              <Text numberOfLines={1} style={{ fontSize: 16, fontWeight: '700', color: theme.text, fontVariant: ['tabular-nums'] }}>{value}</Text>
            </View>
          ))}
          {/* 只有三项时补一个空位，和有轨迹的条目对齐列宽。 */}
          {stats.length < 4 ? <View style={{ flex: 1 }} /> : null}
        </View>

        {hasTrack && outing.coords && outing.coords.length > 1 ? (
          <OutingMap theme={theme} coords={outing.coords} endsHidden={outing.endsHidden} />
        ) : null}
        <OutingPhotos theme={theme} photos={outing.photos} total={outing.photoCount} layout={hasTrack ? 'strip' : 'mosaic'} />
      </Press>

      {SHOW_CARD_ACTIONS && reviewPrompt ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: space.sm, padding: space.sm, paddingLeft: space.md, borderRadius: radius.card, backgroundColor: theme.fieldSurface }}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text numberOfLines={1} style={{ fontSize: 14, fontWeight: '600', color: theme.text }}>
              {t('profile.reviewPromptTitle', { route: reviewPrompt.route })}
            </Text>
            <Text numberOfLines={2} style={{ fontSize: 12, color: theme.text2, marginTop: 1 }}>{t('profile.reviewPromptBody')}</Text>
          </View>
          <Press onPress={reviewPrompt.onWrite} accessibilityRole="button" style={{ paddingVertical: 7, paddingHorizontal: space.md, borderRadius: radius.pill, backgroundColor: theme.accentSofter }}>
            <Text style={{ fontSize: 13, fontWeight: '600', color: theme.accent }}>{t('profile.reviewPromptAction')}</Text>
          </Press>
        </View>
      ) : null}

      {SHOW_CARD_ACTIONS && onOpen ? <View style={{ flexDirection: 'row', marginTop: space.xs }}>
        <Press onPress={onOpen} accessibilityRole="button" style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 6, paddingRight: 10 }}>
          <Icon name={hasTrack ? 'route' : 'journey'} color={theme.text2} size={19} />
          <Text style={{ fontSize: 13, color: theme.text2 }}>
            {t(outing.kind === 'track' ? 'profile.viewTrack' : 'profile.viewJourney')}
          </Text>
        </Press>
      </View> : null}
    </View>
  );
}

export function VisibilityChip({ theme, visibility, onChange }: {
  theme: Theme;
  visibility: Visibility;
  /** 给自己的时间线用；不给就是纯展示，别人主页上的标签不可点。 */
  onChange?: () => void;
}) {
  const { t } = useI18n();
  const Glyph = visibility === 'public' ? Globe : visibility === 'followers' ? Users : Lock;
  const label = t(visibility === 'public' ? 'profile.visPublic' : visibility === 'followers' ? 'profile.visFollowers' : 'profile.visPrivate');
  const chip = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 4, paddingHorizontal: 8, borderRadius: radius.pill, backgroundColor: theme.fieldSurface }}>
      <Glyph color={theme.text2} size={13} strokeWidth={2} />
      <Text style={{ fontSize: 12, color: theme.text2 }}>{label}</Text>
    </View>
  );
  if (!onChange) return chip;
  return <Press onPress={onChange} accessibilityRole="button">{chip}</Press>;
}

// 底图用 App 当前的地图样式截一张图（见 outingMapSnapshots），截好之前和没有原生
// 地图时（网页、Expo Go 的 Android）显示下面的纯轨迹。
// 起终点用路线页的「起」「终」标记，环线只标「起」。别人看时起终点已经在服务端
// 裁掉，不画这两个标记，也不额外提示。
function OutingMap({ theme, coords, endsHidden }: {
  theme: Theme;
  coords: [number, number][];
  endsHidden: boolean;
}) {
  const [width, setWidth] = useState(0);
  const { mapStyle, mapLabelsVisible } = useMapPresentation();
  const key = useMemo(() => (width
    ? snapshotKey([Platform.OS, mapStyle, mapLabelsVisible, theme.dark, theme.accent, endsHidden, width], coords)
    : null), [coords, endsHidden, mapLabelsVisible, mapStyle, theme.accent, theme.dark, width]);
  const cached = useMemo(() => (key ? cachedSnapshot(key) : null), [key]);
  const [fresh, setFresh] = useState<{ key: string; snapshot: OutingSnapshot } | null>(null);
  const [failedKey, setFailedKey] = useState<string | null>(null);
  const snapshot = fresh && fresh.key === key ? fresh.snapshot : cached;
  const network = Network.useNetworkState();
  const online = network.isInternetReachable ?? network.isConnected ?? true;
  const boxRef = useRef<View>(null);
  const pending = NATIVE_MAP_AVAILABLE && !!key && !snapshot && failedKey !== key;
  const near = useNearScreen(boxRef, pending);
  const [myTurn, release] = useSnapshotTurn(pending && online && near);
  // iOS 截图里的标记会带黑底，起终点由卡片自己画，见 outingMapSnapshots。
  const dotsOverImage = Platform.OS === 'ios';
  const loop = useMemo(() => isLoopTrack(coords), [coords]);
  const mapRef = useRef<TrackMapHandle>(null);

  useEffect(() => {
    if (!myTurn || !key) return;
    const timer = setTimeout(() => {
      setFailedKey(key);
      release();
    }, SNAPSHOT_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [key, myTurn, release]);

  // 失败（多半是断网）后等网络回来再试一次。
  useEffect(() => {
    if (online) setFailedKey(null);
  }, [online]);

  const capture = (forKey: string) => {
    const map = mapRef.current;
    if (!map) return;
    const marks = dotsOverImage && !endsHidden ? [coords[0], coords[coords.length - 1]] : undefined;
    // 网络状态的 hook 刚挂上时可能还没结果，截之前再确认一次。
    Network.getNetworkStateAsync()
      .then((state) => {
        if (state.isInternetReachable === false || state.isConnected === false) throw new Error('offline');
        return map.takeSnapshot(marks);
      })
      .then(({ uri, points }) => keepSnapshot(
        forKey,
        uri,
        (width + BLEED * 2) * SNAPSHOT_SCALE,
        // 截图比卡片每边多出 BLEED，换算回卡片坐标。
        points?.map(([x, y]): [number, number] => [x - BLEED, y - BLEED]),
      ))
      .then((kept) => setFresh({ key: forKey, snapshot: kept }))
      .catch((cause) => {
        console.warn('[OutingMap] snapshot failed:', cause);
        setFailedKey(forKey);
      })
      .finally(release);
  };

  const bled = { position: 'absolute' as const, left: -BLEED, top: -BLEED, width: width + BLEED * 2, height: MAP_HEIGHT + BLEED * 2 };
  return (
    <View
      ref={boxRef}
      onLayout={(event) => setWidth(Math.round(event.nativeEvent.layout.width))}
      style={{ height: MAP_HEIGHT, borderRadius: radius.card + 2, overflow: 'hidden', backgroundColor: theme.fieldSurface }}
    >
      {snapshot ? (
        <>
          <Image source={{ uri: snapshot.uri }} contentFit="fill" style={bled} recyclingKey={key ?? undefined} />
          {snapshot.ends ? <EndBadges theme={theme} start={snapshot.ends[0]} end={snapshot.ends[1]} loop={loop} /> : null}
        </>
      ) : myTurn && key ? (
        <View style={bled}>
          <TrackMap
            key={key}
            ref={mapRef}
            coords={coords}
            theme={theme}
            accent={theme.accent}
            fill
            showLegend={false}
            showEndpoints={!endsHidden && !dotsOverImage}
            endpointBadges
            mapStyle={mapStyle}
            showMapLabels={mapLabelsVisible}
            routePadding={[MAP_PAD + BLEED, MAP_PAD + BLEED, MAP_PAD + BLEED, MAP_PAD + BLEED]}
            onReady={() => capture(key)}
          />
        </View>
      ) : (
        <OutingLine theme={theme} coords={coords} endsHidden={endsHidden} loop={loop} width={width} />
      )}
    </View>
  );
}

// 坐标是 [lng, lat]。按纬度缩放经度，避免高纬度的轨迹被横向拉宽。
function OutingLine({ theme, coords, endsHidden, loop, width }: {
  theme: Theme;
  coords: [number, number][];
  endsHidden: boolean;
  loop: boolean;
  width: number;
}) {
  const shape = useMemo(() => {
    if (!width) return null;
    const pts = coords.filter(([lng, lat]) => Number.isFinite(lng) && Number.isFinite(lat));
    if (pts.length < 2) return null;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    const midLat = pts.reduce((sum, [, lat]) => sum + lat, 0) / pts.length;
    const kx = Math.cos((midLat * Math.PI) / 180);
    const projected = pts.map(([lng, lat]) => {
      const x = lng * kx;
      const y = -lat;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      return [x, y] as const;
    });
    const spanX = Math.max(maxX - minX, 1e-9);
    const spanY = Math.max(maxY - minY, 1e-9);
    const scale = Math.min((width - MAP_PAD * 2) / spanX, (MAP_HEIGHT - MAP_PAD * 2) / spanY);
    const offX = (width - spanX * scale) / 2;
    const offY = (MAP_HEIGHT - spanY * scale) / 2;
    const xy = projected.map(([x, y]) => [offX + (x - minX) * scale, offY + (y - minY) * scale] as const);
    const d = xy.map(([x, y], index) => `${index ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
    return { d, start: xy[0], end: xy[xy.length - 1] };
  }, [coords, width]);

  if (!shape) return null;
  return (
    <>
      <Svg width={width} height={MAP_HEIGHT}>
        <Path d={shape.d} stroke={theme.featureSurface} strokeWidth={7} strokeLinecap="round" strokeLinejoin="round" fill="none" />
        <Path d={shape.d} stroke={theme.accent} strokeWidth={3.5} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      </Svg>
      {endsHidden ? null : <EndBadges theme={theme} start={shape.start} end={shape.end} loop={loop} />}
    </>
  );
}

// 和路线页同一个标记：18 的圆，中心落在端点上。终点后画，叠在起点上面。
const BADGE = 18;

function EndBadges({ theme, start, end, loop }: {
  theme: Theme;
  start: readonly [number, number];
  end: readonly [number, number];
  loop: boolean;
}) {
  const { t } = useI18n();
  const at = ([x, y]: readonly [number, number]) => ({ position: 'absolute' as const, left: x - BADGE / 2, top: y - BADGE / 2 });
  return (
    <>
      <View pointerEvents="none" style={at(start)}>
        <EndpointBadge color="#34C759" label={t('route.direction.start')} />
      </View>
      {loop ? null : (
        <View pointerEvents="none" style={at(end)}>
          <EndpointBadge color={theme.danger} label={t('route.direction.finish')} />
        </View>
      )}
    </>
  );
}

function OutingPhotos({ theme, photos, total, layout }: {
  theme: Theme;
  photos: OutingPhoto[];
  total: number;
  layout: 'strip' | 'mosaic';
}) {
  if (!photos.length) return null;
  if (layout === 'mosaic' && photos.length >= 3) {
    const shown = photos.slice(0, 3);
    return (
      <View style={{ flexDirection: 'row', gap: 4, height: 230 }}>
        <Thumb theme={theme} photo={shown[0]} style={{ flex: 2 }} />
        <View style={{ flex: 1, gap: 4 }}>
          <Thumb theme={theme} photo={shown[1]} style={{ flex: 1 }} />
          <Thumb theme={theme} photo={shown[2]} style={{ flex: 1 }} more={total - 3} />
        </View>
      </View>
    );
  }
  const shown = photos.slice(0, 4);
  return (
    <View style={{ flexDirection: 'row', gap: 4, marginTop: 4 }}>
      {shown.map((photo, index) => (
        <Thumb
          key={photo.id}
          theme={theme}
          photo={photo}
          style={{ flex: 1, aspectRatio: 1 }}
          more={index === shown.length - 1 ? total - shown.length : 0}
        />
      ))}
      {Array.from({ length: 4 - shown.length }, (_, index) => <View key={`pad-${index}`} style={{ flex: 1 }} />)}
    </View>
  );
}

export function Thumb({ theme, photo, style, more = 0 }: {
  theme: Theme;
  photo: OutingPhoto;
  style?: object;
  more?: number;
}) {
  return (
    <View style={[{ borderRadius: 10, overflow: 'hidden', backgroundColor: theme.fieldSurface }, style]}>
      <Image source={{ uri: photo.thumbnail || photo.uri }} contentFit="cover" style={{ width: '100%', height: '100%' }} recyclingKey={photo.id} />
      {more > 0 ? (
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.42)' }}>
          <Text style={{ color: '#fff', fontSize: 17, fontWeight: '600' }}>+{more}</Text>
        </View>
      ) : null}
    </View>
  );
}

export function fmtKm(distM: number | null | undefined) {
  if (distM == null) return '–';
  const km = distM / 1000;
  return `${km >= 100 ? Math.round(km) : km.toFixed(1)} km`;
}

function fmtDuration(ms: number | null) {
  if (!ms) return '–';
  const minutes = Math.round(ms / 60000);
  return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}`;
}

function fmtSpeed(distM: number | null, ms: number | null) {
  if (!distM || !ms) return '–';
  return `${(distM / 1000 / (ms / 3600000)).toFixed(1)} km/h`;
}

function fmtDate(iso: string, t: (key: TKey, vars?: Record<string, string | number>) => string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return t('profile.dateFull', { y: date.getFullYear(), m: date.getMonth() + 1, d: date.getDate() });
}
