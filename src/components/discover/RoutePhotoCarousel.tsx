import React, { useMemo, useState } from 'react';
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
      {hasPhotos ? (
        <FlatList
          data={items}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          bounces={items.length > 1}
          keyExtractor={(uri, i) => `${uri}-${i}`}
          onMomentumScrollEnd={(event) => setIndex(Math.round(event.nativeEvent.contentOffset.x / width))}
          renderItem={({ item, index: itemIndex }) => (
            <Pressable onPress={(event) => openViewer(itemIndex, event)} style={{ width, height }}>
              <Image source={{ uri: item }} contentFit="cover" style={StyleSheet.absoluteFill} />
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

function RoutePhotoViewer({ theme, photos, index, onClose }: { theme: Theme; photos: string[]; index: number; onClose: () => void }) {
  const screenWidth = Dimensions.get('window').width;
  const screenHeight = Dimensions.get('window').height;
  const [current, setCurrent] = useState(index);
  return (
    <Modal visible animationType="fade" presentationStyle="fullScreen" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: '#000' }}>
        <FlatList
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
        <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, bottom: 42, alignItems: 'center' }}>
          <View style={{ paddingHorizontal: 11, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.55)' }}>
            <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>{current + 1} / {photos.length}</Text>
          </View>
        </View>
      </View>
    </Modal>
  );
}
