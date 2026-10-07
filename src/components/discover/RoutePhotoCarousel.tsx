import React, { useMemo, useRef, useState } from 'react';
import { Dimensions, FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { Theme } from '../../theme/theme';
import { radius } from '../../design-system';
import { Icon } from '../Icon';
import { Press } from '../Press';

type Props = {
  theme: Theme;
  photos?: string[];
  width: number;
  height: number;
  radius?: number;
  fallback?: React.ReactNode;
};

/** A route cover strip with an Apple Maps style count overlay and full screen viewer. */
export function RoutePhotoCarousel({ theme, photos, width, height, radius: corner = radius.card, fallback }: Props) {
  const items = useMemo(() => (photos || []).filter(Boolean), [photos]);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const [index, setIndex] = useState(0);
  const hasPhotos = items.length > 0;
  const pageWidth = items.length > 1 ? Math.max(1, width - 16) : width;

  const openViewer = (photoIndex: number, event?: any) => {
    event?.stopPropagation?.();
    if (!hasPhotos) return;
    setViewerIndex(photoIndex);
  };

  return (
    <View style={{ width, height, borderRadius: corner, overflow: 'hidden' }}>
      {hasPhotos ? (
        <FlatList
          data={items}
          horizontal
          pagingEnabled={false}
          snapToInterval={pageWidth}
          decelerationRate="fast"
          contentContainerStyle={items.length > 1 ? { paddingRight: width - pageWidth } : undefined}
          showsHorizontalScrollIndicator={false}
          bounces={items.length > 1}
          keyExtractor={(uri, i) => `${uri}-${i}`}
          onMomentumScrollEnd={(event) => setIndex(Math.round(event.nativeEvent.contentOffset.x / pageWidth))}
          renderItem={({ item, index: itemIndex }) => (
            <Pressable onPress={(event) => openViewer(itemIndex, event)} style={{ width: pageWidth, height }}>
              <Image source={{ uri: item }} contentFit="cover" style={StyleSheet.absoluteFill} />
            </Pressable>
          )}
        />
      ) : fallback ? fallback : null}
      {items.length > 1 ? (
        <Press
          onPress={(event) => openViewer(index, event)}
          accessibilityRole="button"
          accessibilityLabel={`查看 ${items.length} 张照片`}
          style={{ position: 'absolute', right: 8, bottom: 8, minWidth: 38, height: 26, paddingHorizontal: 8, borderRadius: radius.pill, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, backgroundColor: 'rgba(0,0,0,0.58)' }}
        >
          <Icon name="photo" color="#fff" size={13} />
          <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>{items.length}</Text>
        </Press>
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

function RoutePhotoViewer({ theme, photos, index, onClose }: { theme: Theme; photos: string[]; index: number; onClose: () => void }) {
  const screenWidth = Dimensions.get('window').width;
  const screenHeight = Dimensions.get('window').height;
  const [current, setCurrent] = useState(index);
  const pagerRef = useRef<FlatList<string>>(null);
  return (
    <Modal visible animationType="fade" presentationStyle="fullScreen" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: '#000' }}>
        <FlatList
          ref={pagerRef}
          data={photos}
          horizontal
          pagingEnabled
          initialScrollIndex={index}
          getItemLayout={(_, itemIndex) => ({ length: screenWidth, offset: screenWidth * itemIndex, index: itemIndex })}
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={(event) => setCurrent(Math.round(event.nativeEvent.contentOffset.x / screenWidth))}
          keyExtractor={(uri, i) => `${uri}-${i}`}
          renderItem={({ item }) => (
            <View style={{ width: screenWidth, height: screenHeight, alignItems: 'center', justifyContent: 'center' }}>
              <Image source={{ uri: item }} contentFit="contain" style={{ width: screenWidth, height: screenHeight }} />
            </View>
          )}
        />
        <Press onPress={onClose} accessibilityRole="button" accessibilityLabel="关闭照片" style={{ position: 'absolute', top: 52, right: 18, width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.45)' }}>
          <Icon name="close" color="#fff" size={22} />
        </Press>
        <View style={{ position: 'absolute', left: 0, right: 0, bottom: 34, alignItems: 'center' }}>
          <FlatList
            horizontal
            data={photos}
            keyExtractor={(uri, thumbnailIndex) => `thumbnail-${uri}-${thumbnailIndex}`}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 6, paddingHorizontal: 16 }}
            renderItem={({ item, index: thumbnailIndex }) => (
              <Press
                onPress={() => {
                  setCurrent(thumbnailIndex);
                  pagerRef.current?.scrollToIndex({ index: thumbnailIndex, animated: true });
                }}
                accessibilityRole="button"
                accessibilityLabel={`第 ${thumbnailIndex + 1} 张照片`}
                style={{ width: 48, height: 48, borderRadius: 7, overflow: 'hidden', borderWidth: thumbnailIndex === current ? 2 : 0, borderColor: '#fff', opacity: thumbnailIndex === current ? 1 : 0.58 }}
              >
                <Image source={{ uri: item }} contentFit="cover" style={StyleSheet.absoluteFill} />
              </Press>
            )}
          />
          <View pointerEvents="none" style={{ position: 'absolute', top: -32, paddingHorizontal: 11, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.55)' }}>
            <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>{current + 1} / {photos.length}</Text>
          </View>
        </View>
      </View>
    </Modal>
  );
}
