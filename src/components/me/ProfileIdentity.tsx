import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import type { Theme } from '../../theme/theme';
import { AppCard, radius, space, type } from '../../design-system';
import { Icon, type IconName } from '../Icon';
import type { Poi } from '../../data/pois';
import type { Track } from '../../data/tracks';
import { Press } from '../Press';
import { Avatar } from '../Avatar';
import { TrackThumbnail } from '../tracks/TrackThumbnail';

export function ProfileIdentity({ theme, avatarUri, nick, username, bio, label, onPress }: {
  theme: Theme;
  avatarUri: string;
  nick: string;
  username: string;
  bio: string;
  label: string;
  onPress: () => void;
}) {
  return (
    <Press accessibilityRole="button" accessibilityLabel={label} onPress={onPress} scaleTo={0.99}
      style={{ alignItems: 'center', paddingHorizontal: space.xl, paddingTop: space.md, paddingBottom: space.xxl, gap: space.sm }}>
      <View style={{
        width: 100,
        height: 100,
        marginBottom: space.sm,
        backgroundColor: theme.surfaceTop,
        borderRadius: 50,
        overflow: 'hidden',
      }}>
        <Avatar uri={avatarUri} size={100} style={{ backgroundColor: theme.fieldSurface }} />
      </View>
      <Text numberOfLines={2} style={[type.pageTitle, { color: theme.text, textAlign: 'center', letterSpacing: 0 }]}>{nick}</Text>
      {username ? <Text numberOfLines={1} style={[type.caption, { color: theme.text3, textAlign: 'center' }]}>{username}</Text> : null}
      {bio ? <Text numberOfLines={2} style={[type.body, { color: theme.text2, textAlign: 'center', lineHeight: 21 }]}>{bio}</Text> : null}
    </Press>
  );
}

export function ProfileShortcut({ theme, title, detail, items, trackItems, previewRows, icon, variant, onPress, stats, badge }: {
  theme: Theme;
  title: string;
  detail: string;
  items: Pick<Poi, 'id' | 'photoUris'>[];
  trackItems?: Pick<Track, 'id' | 'coords'>[];
  previewRows?: { id?: string; label: string; value: string; inline?: boolean }[];
  icon: IconName;
  variant: 'journeys' | 'favorites' | 'gear' | 'checklist' | 'trash' | 'tracks';
  onPress: () => void;
  stats?: { label: string; value: string; progress?: number }[];
  badge?: string;
}) {
  const previews = items.slice(0, variant === 'journeys' ? 2 : 3);
  const isJourney = variant === 'journeys';
  const isFavorites = variant === 'favorites';
  const isTrash = variant === 'trash';
  const isGear = variant === 'gear';
  const isTracks = variant === 'tracks';
  const surface = theme.fieldSurface;

  if (isTrash) return (
    <AppCard theme={theme} radius={radius.feature} style={{ backgroundColor: surface, boxShadow: 'none' }}>
      <Press onPress={onPress} accessibilityRole="button" accessibilityLabel={`${title}, ${detail}`} scaleTo={0.99}
        style={{ minHeight: 64, flexDirection: 'row', alignItems: 'center', padding: space.md, gap: space.sm }}>
        <View style={{ width: 32, height: 32, borderRadius: radius.control, backgroundColor: theme.surfaceTop, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name={icon} color={theme.text2} size={17} />
        </View>
        <Text style={[type.cardTitle, { color: theme.text, flex: 1 }]}>{title}</Text>
        {badge ? (
          <View style={{ minWidth: 22, height: 22, paddingHorizontal: 7, borderRadius: radius.pill, backgroundColor: theme.surfaceTop, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={[type.caption, { fontWeight: '700', color: theme.text2 }]}>{badge}</Text>
          </View>
        ) : null}
      </Press>
    </AppCard>
  );

  return (
    <AppCard theme={theme} radius={radius.showcase} style={{ aspectRatio: 1, minWidth: 0, borderCurve: 'continuous', overflow: 'hidden', backgroundColor: surface, boxShadow: 'none', borderWidth: isGear ? StyleSheet.hairlineWidth : 0, borderColor: theme.fieldBorder }}>
      <Press onPress={onPress} accessibilityRole="button" scaleTo={0.98} accessibilityLabel={`${title}, ${detail}`}
        style={{ flex: 1, padding: space.lg, flexDirection: 'column', justifyContent: 'space-between', gap: space.sm }}>
        <View style={{ minWidth: 0, alignItems: 'flex-start', gap: space.xs }}>
          <Text numberOfLines={2} style={[isJourney ? type.sectionTitle : type.cardTitle, { color: theme.text, textAlign: 'left' }]}>{title}</Text>
          <Text numberOfLines={2} style={[type.caption, { color: theme.text2, textAlign: 'left' }]}>{detail}</Text>
        </View>
        <View pointerEvents="none" style={{ height: 70, alignItems: 'center', justifyContent: 'center' }}>
          {stats?.length ? (
            <View style={{ width: '100%', flexDirection: 'row', gap: space.sm, alignItems: 'flex-end' }}>
              {stats.slice(0, 2).map((stat) => (
                <View key={stat.label} style={{ flex: 1, minWidth: 0, alignItems: 'center' }}>
                  <Text numberOfLines={1} style={[type.metric, { fontSize: 16, color: theme.text, textAlign: 'center' }]}>{stat.value}</Text>
                  <Text numberOfLines={1} style={[type.caption, { marginTop: 3, fontSize: 12, color: theme.text2, textAlign: 'center' }]}>{stat.label}</Text>
                </View>
              ))}
            </View>
          ) : isFavorites ? (
            <View style={{ width: 88, height: 64, maxWidth: '100%' }}>
              {Array.from({ length: 3 }, (_, index) => previews[index]).map((item, index) => item?.photoUris?.[0] ? (
                <View key={item.id} style={{
                  position: 'absolute', right: index * 18, top: index === 0 ? 6 : 0,
                  width: 48, height: 58, borderRadius: space.xxs, borderWidth: 3, borderColor: theme.surfaceTop,
                  overflow: 'hidden', backgroundColor: theme.surfaceTop,
                  transform: [{ rotate: `${index === 0 ? 9 : -9}deg` }],
                }}>
                  <Image source={{ uri: item.photoUris[0] }} contentFit="cover" cachePolicy="memory-disk" transition={0} style={StyleSheet.absoluteFill} />
                </View>
              ) : (
                <View key={`placeholder-${index}`} style={{
                  position: 'absolute', right: index * 18, top: index === 0 ? 6 : 0,
                  width: 48, height: 58, borderRadius: space.xxs, borderWidth: 2,
                  borderColor: theme.fieldBorder, backgroundColor: theme.surfaceTop,
                  alignItems: 'center', justifyContent: 'center',
                  transform: [{ rotate: `${index === 0 ? 9 : -9}deg` }],
                }}><Icon name="photo" color={theme.text2} size={18} /></View>
              ))}
            </View>
          ) : isTracks && trackItems?.length ? (
            <View style={{ width: 104, height: 66, maxWidth: '100%' }}>
              {Array.from({ length: 3 }, (_, index) => trackItems[index]).map((item, index) => (
                <View key={item?.id ?? `track-placeholder-${index}`} style={{
                  position: 'absolute', right: index * 16, top: index === 0 ? 5 : 0,
                  width: 58, height: 58, borderRadius: space.xxs, borderWidth: 3, borderColor: theme.surfaceTop,
                  overflow: 'hidden', backgroundColor: theme.fieldSurface,
                  alignItems: 'center', justifyContent: 'center',
                  transform: [{ rotate: `${index === 0 ? 8 : -8}deg` }],
                }}>
                  {item ? <TrackThumbnail theme={theme} coords={item.coords} size={52} /> : <Icon name="route" color={theme.text2} size={21} strokeWidth={1.7} />}
                </View>
              ))}
            </View>
          ) : previewRows?.length ? (
            <View style={{ width: '100%', gap: space.xs }}>
              {previewRows.slice(0, 3).map((row) => (
                <View key={row.id ?? row.label} style={{ flexDirection: 'row', alignItems: 'center', gap: space.xs }}>
                  <Text numberOfLines={1} style={[type.caption, { color: theme.text2, flex: row.inline ? undefined : 1 }]}>{row.label}</Text>
                  {row.value ? <Text numberOfLines={1} style={[type.caption, { color: theme.text, textAlign: row.inline ? 'left' : 'right', flex: row.inline ? 1 : undefined }]}>{row.value}</Text> : null}
                </View>
              ))}
            </View>
          ) : previews.length ? (
            <View style={{ width: isJourney ? 118 : 88, height: isJourney ? 78 : 64, maxWidth: '100%' }}>
              {previews.map((item, index) => (
                <Image key={item.id} source={{ uri: item.photoUris![0] }} contentFit={isGear ? 'contain' : 'cover'} cachePolicy="memory-disk" transition={0} style={{
                  position: 'absolute', right: previews.length === 1 ? 8 : index * (isJourney ? 32 : 18), top: index === 0 ? 6 : 0,
                  width: isJourney ? 76 : 48, height: isJourney ? 70 : 58,
                  borderRadius: space.xxs, borderWidth: 3, borderColor: theme.surfaceTop,
                  transform: [{ rotate: `${index === 0 ? 9 : -9}deg` }],
                }} />
              ))}
            </View>
          ) : null}
        </View>
      </Press>
    </AppCard>
  );
}
