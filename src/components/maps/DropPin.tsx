// DropPin.tsx — the white droplet pin the maps share: a companion's live
// position, and the waypoint the detail card is reading.
//
// A companion's live position as an avatar badge — no droplet silhouette at
// all (2026-09-24 用户拍板). The body is a *pure circle*: the photo clipped
// to a full disc with a white ring straddling its edge. The "pin" effect is
// a needle drawn as one silhouette with the disc: its sides are *concave
// Bézier curves that meet the circle tangentially* (±35° from the bottom,
// 25° tip angle — variant A of preview-companion-pin.html; straight-sided
// triangles read as a stuck-on dart, tangent continuity is the 丝滑). The
// needle points at the small grey ground dot, which is the real anchor, so
// the badge hovers over the place. Soft drop shadow behind the whole badge.
//
// A selected waypoint wears the same silhouette (docs/previews/route-waypoint-pin.html):
// its photo in the disc with the walking-order number as a small badge, or the
// number itself on the accent fill when the spot has no photo.
//
// Fixed-size box keeps the dot at the same y whether or not the age pill row
// is used. No onPress — the pin is something you read, not tap.
import { Image } from 'expo-image';
import { useCallback, useEffect, useState } from 'react';
import { Platform, Text, View } from 'react-native';
import Svg, { Circle, ClipPath, Defs, FeDropShadow, Filter, G, Image as SvgImage, Path } from 'react-native-svg';
import type { Theme } from '../../theme/theme';
import { Icon } from '../Icon';
import type { MapCoordinate, NativeMapMarker } from './types';

export const DROP_DISC_CX = 26;
export const DROP_DISC_CY = 24;
// Photo disc grown + ring slimmed (2026-09-24 用户两轮"环再细一点"):
// outer edge stays at 22.5 so the needle tangents still land on it; the
// ring is now a 2px band and the visible avatar radius is 20.5. Going below
// 2px risks a broken hairline in the Android marker snapshot.
export const DROP_PHOTO_R = 21.5;
export const DROP_RING_W = 2; // centred on the photo edge: 1px out, 1px in
// Disc outer edge (r22.5) + concave needle to the tip at (26,53). The 1.5px
// white stroke with round joins softens the needle point.
export const DROP_SIL_PATH = 'M26 53 C23.65 47.96 17.65 45.62 13.09 42.43 A22.5 22.5 0 1 1 38.91 42.43 C34.35 45.62 28.35 47.96 26 53 Z';
export const DROP_DOT_CY = 58; // the small ground dot — this is the position
export const DROP_BOX_W = 52;
export const DROP_SVG_H = 62;
export const DROP_PILL_GAP = 2;
export const DROP_PILL_H = 16;
export const DROP_BOX_H = DROP_SVG_H + DROP_PILL_GAP + DROP_PILL_H; // + gap + reserved pill row

/** What the pin's disc holds. */
export type DropPinContent =
  /** A companion's live position: the avatar, dimmed and stamped when it went stale. */
  | { kind: 'avatar'; avatarUrl?: string; stale: boolean; ageLabel: string }
  /** A waypoint with a photo: the photo in the disc, the number as a corner badge. */
  | { kind: 'photo'; photoUrl: string; number?: number; onPhotoLoad?: () => void }
  /** A waypoint without a photo: the number on the accent fill. */
  | { kind: 'number'; number: number };

const NUMBER_FONT_SIZE = 16;
const BADGE_H = 18;

export function DropPin({ theme, clipId, content }: { theme: Theme; clipId: string; content: DropPinContent }) {
  const boxHeight = content.kind === 'avatar' ? DROP_BOX_H : DROP_SVG_H;
  const stale = content.kind === 'avatar' && content.stale;
  const avatarUrl = content.kind === 'avatar' ? content.avatarUrl : undefined;
  const photoUrl = content.kind === 'photo' ? content.photoUrl : undefined;
  const discImage = photoUrl ?? avatarUrl;
  const number = content.kind === 'avatar' ? undefined : content.number;
  return (
    <View
      pointerEvents="none"
      collapsable={false}
      style={{
        width: DROP_BOX_W,
        height: boxHeight,
        alignItems: 'center',
        opacity: stale ? 0.7 : 1,
        // AMap (expo-gaode-map MarkerBitmapRenderer) sizes the baked bitmap from
        // the views that draw something, and react-native-svg's views don't
        // count, so only the 43px avatar Image did: the crop taken from the
        // frame's top-left cut the avatar's right and bottom edges and dropped
        // the needle and ground dot. A practically invisible fill makes the
        // whole frame count (see docs/map-rendering.md).
        backgroundColor: Platform.OS === 'android' ? 'rgba(255,255,255,0.004)' : undefined,
      }}
    >
      <Svg width={DROP_BOX_W} height={DROP_SVG_H}>
        <Defs>
          <ClipPath id={`${clipId}-disc`}>
            <Circle cx={DROP_DISC_CX} cy={DROP_DISC_CY} r={DROP_PHOTO_R} />
          </ClipPath>
          <Filter id={`${clipId}-shadow`} x="-50%" y="-50%" width="200%" height="200%">
            <FeDropShadow dx="0" dy="2" stdDeviation="2" floodColor="#000000" floodOpacity="0.25" />
          </Filter>
        </Defs>
        <G filter={`url(#${clipId}-shadow)`}>
          <Path d={DROP_SIL_PATH} fill="#FFFFFF" stroke="#FFFFFF" strokeWidth={1.5} strokeLinejoin="round" />
          <G clipPath={`url(#${clipId}-disc)`}>
            {/* Keep a synchronous local surface underneath the network image.
                Native map markers snapshot their children while an avatar may
                still be loading; the position pin must remain visible even
                when that remote image fails or never resolves. A numbered
                waypoint has no image at all: this is the whole disc. */}
            <Circle
              cx={DROP_DISC_CX}
              cy={DROP_DISC_CY}
              r={DROP_PHOTO_R}
              fill={content.kind === 'number' ? theme.accent : theme.fieldSurface}
            />
            {discImage ? (
              <SvgImage
                href={{ uri: discImage }}
                x={DROP_DISC_CX - DROP_PHOTO_R}
                y={DROP_DISC_CY - DROP_PHOTO_R}
                width={DROP_PHOTO_R * 2}
                height={DROP_PHOTO_R * 2}
                preserveAspectRatio="xMidYMid slice"
              />
            ) : null}
          </G>
          {/* The ring is the pin's own white silhouette, not a theme colour. */}
          <Circle cx={DROP_DISC_CX} cy={DROP_DISC_CY} r={DROP_PHOTO_R} fill="none" stroke="#FFFFFF" strokeWidth={DROP_RING_W} />
        </G>
        <Circle cx={DROP_DISC_CX} cy={DROP_DOT_CY} r={2.4} fill="#48484A" stroke="#FFFFFF" strokeWidth={1} />
      </Svg>
      {discImage ? (
        <Image
          source={{ uri: discImage }}
          cachePolicy="memory-disk"
          contentFit="cover"
          transition={0}
          onLoad={content.kind === 'photo' ? content.onPhotoLoad : undefined}
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: DROP_DISC_CX - DROP_PHOTO_R,
            top: DROP_DISC_CY - DROP_PHOTO_R,
            width: DROP_PHOTO_R * 2,
            height: DROP_PHOTO_R * 2,
            borderRadius: DROP_PHOTO_R,
          }}
        />
      ) : null}
      {content.kind === 'number' ? (
        // White over the accent fill, in both appearance modes.
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: DROP_DISC_CX - DROP_PHOTO_R,
            top: DROP_DISC_CY - DROP_PHOTO_R,
            width: DROP_PHOTO_R * 2,
            height: DROP_PHOTO_R * 2,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text style={{ color: '#FFFFFF', fontSize: NUMBER_FONT_SIZE, fontWeight: '700', fontVariant: ['tabular-nums'] }}>{number}</Text>
        </View>
      ) : null}
      {number != null && photoUrl ? (
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: 2,
            top: 0,
            minWidth: BADGE_H,
            height: BADGE_H,
            paddingHorizontal: 5,
            borderRadius: BADGE_H / 2,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: theme.accent,
            borderWidth: 1.5,
            // The badge sits on the pin's white ring, so its edge is the ring.
            borderColor: '#FFFFFF',
          }}
        >
          <Text style={{ color: '#FFFFFF', fontSize: 10.5, lineHeight: 13, fontWeight: '700', fontVariant: ['tabular-nums'] }}>{number}</Text>
        </View>
      ) : null}
      {avatarUrl == null && content.kind === 'avatar' ? (
        <View pointerEvents="none" style={{ position: 'absolute', top: 16 }}>
          <Icon name="user" color={theme.text3} size={16} strokeWidth={1.8} />
        </View>
      ) : null}
      {content.kind === 'avatar' && content.stale ? (
        <View style={{ marginTop: DROP_PILL_GAP, paddingHorizontal: 5, height: DROP_PILL_H, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.55)' }}>
          {/* White over the pill's own dark fill, in both appearance modes. */}
          <Text style={{ color: '#FFFFFF', fontSize: 9.5, lineHeight: 12, fontWeight: '700' }}>{content.ageLabel}</Text>
        </View>
      ) : null}
    </View>
  );
}

/** The pin's height, so a caller can reserve the room the age pill row takes. */
export function dropPinHeight(content: DropPinContent): number {
  return content.kind === 'avatar' ? DROP_BOX_H : DROP_SVG_H;
}

/**
 * The ground dot — not the pin tip — is the position: anchor there, so the pin
 * hovers over the place like Apple's does. Both native maps take a different
 * half of this pair (`anchor` on Android, `centerOffset` on iOS); spread the
 * result over the marker.
 */
export function dropPinPlacement(content: DropPinContent): Pick<NativeMapMarker, 'anchor' | 'centerOffset'> {
  const height = dropPinHeight(content);
  return {
    anchor: { x: 0.5, y: DROP_DOT_CY / height },
    centerOffset: { x: 0, y: height / 2 - DROP_DOT_CY },
  };
}

/** Marker ids end up in Android's content snapshot cache, so anything that
 *  changes what is drawn has to be in the id — including the photo, which is
 *  an arbitrary url here. This keeps the id to path-safe characters. */
function urlToken(value: string): string {
  let hash = 5381;
  for (let index = 0; index < value.length; index += 1) hash = ((hash << 5) + hash + value.charCodeAt(index)) | 0;
  return (hash >>> 0).toString(36);
}

/**
 * A selected waypoint, dropped onto the map in place of its dot.
 *
 * `revision` is the second half of the photo handshake: both native maps bake
 * a marker's children into a bitmap once, so the id has to change when the
 * photo actually arrives. `useDropPinPhoto` bumps it after the first decode.
 */
export function waypointDropPinMarker({
  theme,
  pinKey,
  coordinate,
  number,
  photo,
  photoReady,
  photoRevision = 0,
  onPhotoLoad,
  zIndex = 100,
  title,
  onPress,
}: {
  theme: Theme;
  /** Stable per waypoint: seeds the svg clip ids and the marker id. */
  pinKey: string;
  coordinate: MapCoordinate;
  /** The walking-order number the card wears too. */
  number: number;
  photo?: string;
  /** Draw the photo rather than the numbered disc. */
  photoReady?: boolean;
  photoRevision?: number;
  onPhotoLoad?: () => void;
  zIndex?: number;
  title?: string;
  onPress?: () => void;
}): NativeMapMarker {
  const showPhoto = !!photo && photoReady;
  const content: DropPinContent = showPhoto
    ? { kind: 'photo', photoUrl: photo, number, onPhotoLoad }
    : { kind: 'number', number };
  const drawn = showPhoto ? `photo-${urlToken(photo)}-${photoRevision}` : 'number';
  return {
    id: `wp-pin-${pinKey}-${drawn}-${Math.round(coordinate[0] * 10000)}-${Math.round(coordinate[1] * 10000)}`,
    coordinate,
    ...dropPinPlacement(content),
    zIndex,
    title,
    onPress,
    content: <DropPin theme={theme} clipId={`wp-drop-${pinKey}`} content={content} />,
  };
}

/**
 * Warms the photo a waypoint pin draws, and reports the two things the marker
 * needs: whether the photo can go in the disc yet, and the token that changes
 * once it has really decoded (both native maps bake the marker bitmap by id, so
 * a photo that lands after the bake is invisible until the id changes).
 */
export function useDropPinPhoto(photo: string | undefined): {
  photoReady: boolean;
  photoRevision: number;
  onPhotoLoad: () => void;
} {
  const [state, setState] = useState<{ photo?: string; decoded: boolean; revision: number }>({ decoded: false, revision: 0 });
  useEffect(() => {
    // A local shot is already on the device, so it goes straight in the disc;
    // a remote one waits for the prefetch, and the decode is reported through
    // `onPhotoLoad` either way.
    const remote = !!photo && /^https?:/i.test(photo);
    setState((current) => (current.photo === photo ? current : { photo, decoded: !remote, revision: 0 }));
    if (!remote || !photo) return;
    let cancelled = false;
    void Image.prefetch(photo, 'memory-disk').then((ok) => {
      if (cancelled || !ok) return;
      setState((current) => (current.photo === photo ? { ...current, decoded: true } : current));
    }, () => undefined);
    return () => { cancelled = true; };
  }, [photo]);
  const onPhotoLoad = useCallback(() => {
    setState((current) => (current.photo === photo && current.revision === 0
      ? { ...current, decoded: true, revision: 1 }
      : current));
  }, [photo]);
  return {
    photoReady: !!photo && state.photo === photo && state.decoded,
    photoRevision: state.photo === photo ? state.revision : 0,
    onPhotoLoad,
  };
}
