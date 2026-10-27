// ProfilePhotos.tsx — 照片标签：有照片的出行的索引。
// 每组标题点下去回到时间线里的那次出行，所以照片和时间线讲的是同一批内容。
import React, { useState } from 'react';
import { Text, View } from 'react-native';
import type { Theme } from '../../../theme/theme';
import { space } from '../../../design-system';
import { KPState } from '../../State';
import { Press } from '../../Press';
import { useI18n } from '../../../i18n';
import type { Outing } from '../../../hooks/useSocial';
import { Thumb } from './OutingCard';

const GAP = 4;
const MAX_PER_GROUP = 6;

export function ProfilePhotos({ theme, outings, onJump }: {
  theme: Theme;
  outings: Outing[];
  onJump: (outingId: string) => void;
}) {
  const { t } = useI18n();
  const [width, setWidth] = useState(0);
  const groups = outings.filter((outing) => outing.photos.length > 0);
  if (!groups.length) {
    return <KPState theme={theme} icon="photo" title={t('profile.photosEmptyTitle')} body={t('profile.photosEmptyBody')} />;
  }
  const cell = width ? (width - GAP * 2) / 3 : 0;
  return (
    <View onLayout={(event) => setWidth(event.nativeEvent.layout.width)}>
      <Text style={{ fontSize: 13, color: theme.text2, marginBottom: space.lg }}>{t('profile.photosIntro')}</Text>
      {groups.map((outing, index) => {
        const shown = outing.photos.slice(0, MAX_PER_GROUP);
        return (
          <View key={outing.id} style={{ marginTop: index ? space.xxl : 0 }}>
            <Press
              onPress={() => onJump(outing.id)}
              accessibilityRole="button"
              style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: space.sm, marginBottom: 10 }}
            >
              <Text numberOfLines={1} style={{ flex: 1, fontSize: 17, fontWeight: '700', color: theme.text }}>{outing.title}</Text>
              <Text style={{ fontSize: 13, color: theme.text3 }}>{t('profile.photoCount', { count: outing.photoCount })}</Text>
            </Press>
            {cell ? (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: GAP }}>
                {shown.map((photo, photoIndex) => (
                  <Press key={photo.id} onPress={() => onJump(outing.id)} accessibilityRole="imagebutton" accessibilityLabel={outing.title}>
                    <Thumb
                      theme={theme}
                      photo={photo}
                      style={{ width: cell, height: cell }}
                      more={photoIndex === shown.length - 1 ? outing.photoCount - shown.length : 0}
                    />
                  </Press>
                ))}
              </View>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}
