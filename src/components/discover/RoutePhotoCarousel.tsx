import React, { useMemo, useState } from 'react';
import { Dimensions, FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { Theme } from '../../theme/theme';
import { layout, radius, space, type } from '../../design-system';
import { useI18n } from '../../i18n';
import type { RouteGalleryPhoto } from '../../lib/routePreview';
import { Icon } from '../Icon';
import { Press } from '../Press';

/** The page counter's row: where it sits, and how high, so a caption can clear
 *  it instead of running under it. */
const COUNTER_BOTTOM = 42;
const COUNTER_HEIGHT = 26;
const COUNTER_TOP = COUNTER_BOTTOM + COUNTER_HEIGHT;

type Props = {
  theme: Theme;
  photos?: string[];
  width: number;
  height: number;
  radius?: number;
  fallback?: React.ReactNode;
};

/** Full-frame photo pages with a quiet multi-photo indicator. */
export function RoutePhotoCarousel({ theme, photos, width, height, radius: corner = radius.card, fallback }: Props) {
  const items = useMemo(() => (photos || []).filter(Boolean), [photos]);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const [index, setIndex] = useState(0);
  const hasPhotos = items.length > 0;

  const openViewer = (photoIndex: number, event?: any) => {
    event?.stopPropagation?.();
    if (!hasPhotos) return;
    setViewerIndex(photoIndex);
  };

  return (
    <View style={{ width, height, borderRadius: corner, overflow: 'hidden' }}>
      {items.length === 1 ? (
        <Pressable onPress={(event) => openViewer(0, event)} style={StyleSheet.absoluteFill}>
          <Image source={{ uri: items[0] }} recyclingKey={items[0]} cachePolicy="memory-disk" transition={0} contentFit="cover" style={StyleSheet.absoluteFill} />
        </Pressable>
      ) : hasPhotos ? (
        <FlatList
          data={items}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          bounces={items.length > 1}
          keyExtractor={(uri, i) => `${uri}-${i}`}
          // Only the visible page and its neighbour are built; the rest mount on swipe.
          initialNumToRender={1}
          maxToRenderPerBatch={1}
          windowSize={3}
          getItemLayout={(_, itemIndex) => ({ length: width, offset: width * itemIndex, index: itemIndex })}
          onMomentumScrollEnd={(event) => setIndex(Math.round(event.nativeEvent.contentOffset.x / width))}
          renderItem={({ item, index: itemIndex }) => (
            <Pressable onPress={(event) => openViewer(itemIndex, event)} style={{ width, height }}>
              <Image source={{ uri: item }} recyclingKey={item} cachePolicy="memory-disk" transition={0} contentFit="cover" style={StyleSheet.absoluteFill} />
            </Pressable>
          )}
        />
      ) : fallback ? fallback : null}
      {items.length > 1 ? (
        <View pointerEvents="none" style={{ position: 'absolute', right: 8, top: 8, width: 24, height: 24, alignItems: 'center', justifyContent: 'center', borderRadius: 6, backgroundColor: 'rgba(0,0,0,0.25)' }}>
          <Icon name="copy" color="#fff" size={16} />
        </View>
      ) : null}
      {items.length > 1 ? (
        <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, bottom: 8, flexDirection: 'row', justifyContent: 'center', gap: 4 }}>
          {items.map((_, dotIndex) => <View key={dotIndex} style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: dotIndex === index ? '#fff' : 'rgba(255,255,255,0.55)' }} />)}
        </View>
      ) : null}
      {viewerIndex !== null ? (
        <RoutePhotoViewer theme={theme} photos={items} index={viewerIndex} onClose={() => setViewerIndex(null)} />
      ) : null}
    </View>
  );
}

/** Full-screen swipeable photo pages, shared by the carousel and the photo
 *  strip. `index` is where it opens; swiping covers every photo. A page may be
 *  a bare URL or a gallery photo that knows which waypoint it was taken at. */
export function RoutePhotoViewer({ theme, photos, index, onClose, onOpenWaypoint }: {
  theme: Theme;
  photos: (string | RouteGalleryPhoto)[];
  index: number;
  onClose: () => void;
  /** Given: a photo taken at a waypoint offers to open that spot on the map. */
  onOpenWaypoint?: (index: number) => void;
}) {
  const { t } = useI18n();
  const screenWidth = Dimensions.get('window').width;
  const screenHeight = Dimensions.get('window').height;
  const items = useMemo(() => photos.map((photo) => (typeof photo === 'string' ? { uri: photo } : photo)), [photos]);
  const [current, setCurrent] = useState(index);
  const photo = items[Math.min(current, items.length - 1)];
  const caption = photo?.name && photo.km != null ? t('route.preview.photoCaption', { name: photo.name, km: photo.km.toFixed(1) }) : null;
  const waypointIndex = onOpenWaypoint ? photo?.waypointIndex : undefined;
  return (
    <Modal visible animationType="fade" presentationStyle="fullScreen" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: '#000' }}>
        <FlatList
          data={items}
          horizontal
          pagingEnabled
          initialScrollIndex={index}
          getItemLayout={(_, itemIndex) => ({ length: screenWidth, offset: screenWidth * itemIndex, index: itemIndex })}
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={(event) => setCurrent(Math.round(event.nativeEvent.contentOffset.x / screenWidth))}
          keyExtractor={(item, i) => `${item.uri}-${i}`}
          renderItem={({ item: page }) => (
            <View style={{ width: screenWidth, height: screenHeight, alignItems: 'center', justifyContent: 'center' }}>
              <Image source={{ uri: page.uri }} contentFit="contain" style={{ width: screenWidth, height: screenHeight }} />
            </View>
          )}
        />
        <Press onPress={onClose} accessibilityRole="button" accessibilityLabel="关闭照片" style={{ position: 'absolute', top: 52, right: 18, width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.45)' }}>
          <Icon name="close" color="#FFFFFF" size={22} />
        </Press>
        {/* The page counter owns the bottom row, so where the photo came from —
            and the way to that spot — sits above it. Both are white on the
            black page, the one colour the theme cannot supply here. */}
        {caption || waypointIndex != null ? (
          <View pointerEvents="box-none" style={{ position: 'absolute', left: layout.pagePadding, right: layout.pagePadding, bottom: COUNTER_TOP + space.xs, alignItems: 'flex-start', gap: space.xs }}>
            {caption ? (
              <View style={{ maxWidth: '100%', paddingHorizontal: space.sm, minHeight: layout.fieldHeight, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.55)' }}>
                <Text numberOfLines={1} style={[type.caption, { color: '#FFFFFF', fontWeight: '600' }]}>{caption}</Text>
              </View>
            ) : null}
            {waypointIndex != null ? (
              <Press
                onPress={() => { onOpenWaypoint?.(waypointIndex); onClose(); }}
                accessibilityRole="button"
                accessibilityLabel={t('route.preview.photoOnMap')}
                style={{ minHeight: layout.fieldHeight, paddingHorizontal: space.md, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.16)' }}
              >
                <Text style={[type.chip, { color: '#FFFFFF' }]}>{t('route.preview.photoOnMap')}</Text>
              </Press>
            ) : null}
          </View>
        ) : null}
        <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, bottom: COUNTER_BOTTOM, alignItems: 'center' }}>
          <View style={{ paddingHorizontal: 11, height: COUNTER_HEIGHT, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.55)' }}>
            <Text style={{ color: '#FFFFFF', fontSize: 12, fontWeight: '700' }}>{current + 1} / {items.length}</Text>
          </View>
        </View>
      </View>
    </Modal>
  );
}
