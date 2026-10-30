import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Theme } from '../../theme/theme';
import { layout, radius, space, type } from '../../design-system';
import { useI18n } from '../../i18n';
import { Press } from '../Press';
import type { RouteGalleryPhoto } from '../../lib/routePreview';
import { RoutePhotoViewer } from './RoutePhotoCarousel';

const CARD_WIDTH = 132;
const CARD_HEIGHT = 112;
const HERO_HEIGHT = 160;
const MAX_CARDS = 6;
/** Depth of the fade behind a caption: tall enough for one line to read on a
 *  bright photo, short enough to leave the picture itself alone. */
const SCRIM_HEIGHT = layout.fieldHeight;

type Props = {
  theme: Theme;
  /** The route's gallery: waypoint shots in walking order, then its own photos. */
  photos?: RouteGalleryPhoto[];
  /** Given: the viewer can take the user to the spot a photo was taken at. */
  onOpenWaypoint?: (index: number) => void;
};

/**
 * The horizontal photo band under the headline stats: a few cards edge to
 * edge so the next one peeks past the screen, the last carrying "全部 N 张"
 * when more photos live in the viewer than on screen. One or two photos
 * collapse to a single full-width image; the viewer swipes through all of
 * them either way. A shot taken at a waypoint wears where it was taken, so the
 * band reads as the trail rather than a pile of pictures. Nothing real to show
 * means nothing here: no band, and no stand-in art in its place.
 */
export function RoutePhotoStrip({ theme, photos, onOpenWaypoint }: Props) {
  const { t } = useI18n();
  const items = photos ?? [];
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);

  const openViewer = (index: number) => setViewerIndex(index);
  const viewer = viewerIndex !== null && items.length > 0
    ? <RoutePhotoViewer theme={theme} photos={items} index={viewerIndex} onClose={() => setViewerIndex(null)} onOpenWaypoint={onOpenWaypoint} />
    : null;

  if (!items.length) return null;

  if (items.length <= 2) {
    const photo = items[0];
    return (
      <View>
        <Press
          onPress={() => openViewer(0)}
          accessibilityRole="button"
          accessibilityLabel={t('route.preview.sectionPhotos')}
          style={{ height: HERO_HEIGHT, borderRadius: radius.feature, overflow: 'hidden', backgroundColor: theme.fieldSurface }}
        >
          <Image source={{ uri: photo.uri }} recyclingKey={photo.uri} cachePolicy="memory-disk" contentFit="cover" style={StyleSheet.absoluteFill} />
          <PhotoCaption photo={photo} />
        </Press>
        {viewer}
      </View>
    );
  }

  const shown = items.slice(0, MAX_CARDS);
  const showAllMask = items.length >= 4;
  return (
    <View>
      {/* Bleed to the screen edge so the next card is cut off by the bezel —
          the page padding moves into the scroll content instead. The strip
          sits inside the sheet's `space.md` wrapper, so the margin matches. */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ marginHorizontal: -space.md }}
        contentContainerStyle={{ paddingHorizontal: space.md, gap: space.xs }}
      >
        {shown.map((photo, index) => {
          const masked = showAllMask && index === shown.length - 1;
          return (
            <Press
              key={`${photo.uri}-${index}`}
              onPress={() => openViewer(index)}
              accessibilityRole="button"
              accessibilityLabel={masked ? t('route.preview.photosAll', { n: items.length }) : t('route.preview.sectionPhotos')}
              style={{ width: CARD_WIDTH, height: CARD_HEIGHT, borderRadius: radius.card, overflow: 'hidden', backgroundColor: theme.fieldSurface }}
            >
              <Image source={{ uri: photo.uri }} recyclingKey={photo.uri} cachePolicy="memory-disk" contentFit="cover" style={StyleSheet.absoluteFill} />
              <PhotoCaption photo={photo} />
              {masked ? (
                <View
                  pointerEvents="none"
                  // absoluteFill is a registered style id, so it must be passed
                  // as its own style entry, never spread.
                  style={[StyleSheet.absoluteFill, {
                    alignItems: 'center',
                    justifyContent: 'center',
                    // The wash sits over the photo's own colours, not the app
                    // palette, so a translucent black literal is intended here.
                    backgroundColor: 'rgba(0,0,0,0.42)',
                  }]}
                >
                  <Text style={[type.small, { color: '#FFFFFF', fontWeight: '600' }]}>{t('route.preview.photosAll', { n: items.length })}</Text>
                </View>
              ) : null}
            </Press>
          );
        })}
      </ScrollView>
      {viewer}
    </View>
  );
}

/** The "where on the trail" line a waypoint photo carries, in white over a
 *  scrim that fades up from the bottom edge. The photo behind it is arbitrary,
 *  so `#FFFFFF` is the one literal the palette cannot supply: it is text on
 *  this dark wash, not an app colour. */
function PhotoCaption({ photo }: { photo: RouteGalleryPhoto }) {
  const { t } = useI18n();
  if (!photo.name || photo.km == null) return null;
  return (
    <LinearGradient
      pointerEvents="none"
      colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.55)']}
      start={{ x: 0, y: 0 }}
      end={{ x: 0, y: 1 }}
      style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: SCRIM_HEIGHT, justifyContent: 'flex-end', padding: space.xs }}
    >
      <Text numberOfLines={1} style={[type.caption, { color: '#FFFFFF', fontWeight: '600' }]}>
        {t('route.preview.photoCaption', { name: photo.name, km: photo.km.toFixed(1) })}
      </Text>
    </LinearGradient>
  );
}
