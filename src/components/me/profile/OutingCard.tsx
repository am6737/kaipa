// OutingCard.tsx — 时间线里的「一次出行」：标题、统计、轨迹缩略图、照片。
// 有轨迹时显示 用时 / 距离 / 均速 / 爬升，只有旅程时显示 天数 / 照片 / 同行。
// 条目之间只用留白分隔，不画分割线。
import React, { useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { Image } from 'expo-image';
import Svg, { Circle, Path } from 'react-native-svg';
import { Globe, Lock, Users } from 'lucide-react-native';
import type { Theme } from '../../../theme/theme';
import { radius, space } from '../../../design-system';
import { Icon } from '../../Icon';
import { Press } from '../../Press';
import { useI18n, type TKey } from '../../../i18n';
import { useNav } from '../../../nav/NavContext';
import type { Outing, OutingPhoto, Visibility } from '../../../hooks/useSocial';

const MAP_HEIGHT = 190;
const MAP_PAD = 22;

export function OutingCard({ theme, outing, subject, showVisibility, highlighted, onOpen, onChangeVisibility, reviewPrompt }: {
  theme: Theme;
  outing: Outing;
  /** 「你」或对方昵称，拼进标题行。 */
  subject: string;
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
  const place = [outing.routeName, outing.region].filter(Boolean).join('　');
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
        <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: theme.fieldSurface, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name={outing.kind === 'track' ? 'hiker' : 'journey'} color={theme.text} size={22} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text numberOfLines={1} style={{ fontSize: 15, fontWeight: '600', color: theme.text }}>
            {t(headlineKey, { who: subject })}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 1 }}>
            <Text numberOfLines={1} style={{ flexShrink: 1, fontSize: 13, color: theme.text3 }}>
              {outing.dateLabel || fmtDate(outing.occurredAt, t)}
            </Text>
            {outing.imported ? <ImportedTag theme={theme} /> : null}
          </View>
        </View>
        {showVisibility ? <VisibilityChip theme={theme} visibility={outing.visibility} onChange={onChangeVisibility} /> : null}
      </View>

      <Press disabled={!onOpen} onPress={onOpen} accessibilityRole={onOpen ? 'button' : undefined} accessibilityLabel={outing.title} scaleTo={0.99}>
        <Text numberOfLines={2} style={{ marginTop: space.sm, fontSize: 19, fontWeight: '700', color: theme.text }}>
          {outing.title}
        </Text>
        {place ? <Text numberOfLines={1} style={{ fontSize: 13, color: theme.text2, marginTop: 2 }}>{place}</Text> : null}

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
          <OutingMap theme={theme} coords={outing.coords} endsHidden={outing.endsHidden} hint={t('profile.endsHidden')} />
        ) : null}
        <OutingPhotos theme={theme} photos={outing.photos} total={outing.photoCount} layout={hasTrack ? 'strip' : 'mosaic'} />
      </Press>

      {reviewPrompt ? (
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

      {onOpen ? <View style={{ flexDirection: 'row', marginTop: space.xs }}>
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

// 导入的轨迹不是在 App 里录的，别人看时也照样标出来；点一下说明来源。
function ImportedTag({ theme }: { theme: Theme }) {
  const { t } = useI18n();
  const nav = useNav();
  return (
    <Press onPress={() => nav.showToast(t('profile.importedTagExplain'))} accessibilityRole="button" accessibilityHint={t('profile.importedTagExplain')} hitSlop={8}>
      <View style={{ paddingVertical: 1, paddingHorizontal: 6, borderRadius: 6, backgroundColor: theme.fieldSurface }}>
        <Text style={{ fontSize: 11, color: theme.text2 }}>{t('profile.importedTag')}</Text>
      </View>
    </Press>
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

// 坐标是 [lng, lat]。按纬度缩放经度，避免高纬度的轨迹被横向拉宽。
function OutingMap({ theme, coords, endsHidden, hint }: {
  theme: Theme;
  coords: [number, number][];
  endsHidden: boolean;
  hint: string;
}) {
  const [width, setWidth] = useState(0);
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

  return (
    <View
      onLayout={(event) => setWidth(Math.round(event.nativeEvent.layout.width))}
      style={{ height: MAP_HEIGHT, borderRadius: radius.card + 2, overflow: 'hidden', backgroundColor: theme.fieldSurface }}
    >
      {shape ? (
        <Svg width={width} height={MAP_HEIGHT}>
          <Path d={shape.d} stroke={theme.featureSurface} strokeWidth={7} strokeLinecap="round" strokeLinejoin="round" fill="none" />
          <Path d={shape.d} stroke={theme.accent} strokeWidth={3.5} strokeLinecap="round" strokeLinejoin="round" fill="none" />
          {endsHidden ? null : (
            <>
              <Circle cx={shape.start[0]} cy={shape.start[1]} r={5.5} fill="#34C759" stroke="#fff" strokeWidth={2} />
              <Circle cx={shape.end[0]} cy={shape.end[1]} r={5.5} fill="#FF3B30" stroke="#fff" strokeWidth={2} />
            </>
          )}
        </Svg>
      ) : null}
      {endsHidden ? (
        <View style={{ position: 'absolute', left: 10, bottom: 10, paddingVertical: 4, paddingHorizontal: 8, borderRadius: radius.pill, backgroundColor: theme.controlSurface }}>
          <Text style={{ fontSize: 11, color: theme.text2 }}>{hint}</Text>
        </View>
      ) : null}
    </View>
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
