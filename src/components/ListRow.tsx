// ListRow.tsx — a route/journey row used in discover lists & search. Thumbnail +
// title + meta + (rating badge | companions) + chevron.
import React from 'react';
import { View, Text } from 'react-native';
import { Theme } from '../theme/theme';
import { MONO } from '../theme/fonts';
import { Poi, STATUS_LABEL, STATUS_COLOR } from '../data/pois';
import { PhotoTile } from './PhotoTile';
import { Avatar, AvatarStack } from './Avatar';
import { Icon } from './Icon';
import { Press } from './Press';

export function PoiRow({
  theme,
  poi,
  onPress,
  onLongPress,
  selectMode,
  selected,
}: {
  theme: Theme;
  poi: Poi;
  onPress?: () => void;
  onLongPress?: () => void;
  selectMode?: boolean;
  selected?: boolean;
}) {
  const isJourney = poi.kind === 'journey';
  return (
    <Press onPress={onPress} onLongPress={onLongPress} delayLongPress={380} style={{ paddingVertical: 9, backgroundColor: selected ? theme.accentSofter : 'transparent', borderRadius: selected ? 12 : 0 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 2 }}>
        {selectMode ? (
          <View
            style={{
              width: 22,
              height: 22,
              borderRadius: 11,
              borderWidth: 2,
              borderColor: selected ? theme.accent : theme.text3,
              backgroundColor: selected ? theme.accent : 'transparent',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {selected ? <Icon name="check" color="#fff" size={13} strokeWidth={3} /> : null}
          </View>
        ) : null}
        <PhotoTile tone={poi.tone} seed={poi.id} radius={14} style={{ width: 60, height: 60 }} resWidth={240} />
        <View style={{ flex: 1, gap: 3 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            {isJourney && poi.status && (
              <View
                style={{
                  paddingHorizontal: 6,
                  height: 17,
                  borderRadius: 5,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: STATUS_COLOR(poi.status, theme.accent, theme.dark) + '26',
                }}
              >
                <Text style={{ fontSize: 10, fontWeight: '700', color: STATUS_COLOR(poi.status, theme.accent, theme.dark) }}>
                  {STATUS_LABEL[poi.status]}
                </Text>
              </View>
            )}
            <Text numberOfLines={1} style={{ fontSize: 15.5, fontWeight: '700', color: theme.text, flexShrink: 1 }}>
              {poi.name}
            </Text>
            {poi.fav && <Icon name="heartFill" color={theme.trailMine} size={13} />}
          </View>
          <Text numberOfLines={1} style={{ fontSize: 11.5, color: theme.text2 }}>
            {poi.region}
            {isJourney && poi.date ? ' · ' + poi.date : ''}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Text style={{ fontFamily: MONO, fontSize: 10.5, color: theme.text2 }}>{poi.dist}</Text>
            <Text style={{ fontFamily: MONO, fontSize: 10.5, color: theme.text2 }}>↑ {poi.asc.replace('+', '')}</Text>
            {!isJourney && poi.rating ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                <Icon name="starFill" color="#FF9F0A" size={11} />
                <Text style={{ fontFamily: MONO, fontSize: 10.5, color: theme.text2 }}>{poi.rating}</Text>
              </View>
            ) : null}
          </View>
        </View>
        {isJourney && poi.companionList && poi.companionList.length > 0 ? (
          <AvatarStack people={poi.companionList} size={22} max={3} ringColor={theme.dark ? '#1c1c1e' : '#fff'} />
        ) : (
          <Icon name="chevronR" color={theme.text3} size={16} />
        )}
      </View>
    </Press>
  );
}
