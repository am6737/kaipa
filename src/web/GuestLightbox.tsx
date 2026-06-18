import React, { useEffect } from 'react';
import { View, Text, Pressable, StyleSheet, Platform } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Theme } from '../theme/theme';
import { MONO } from '../theme/fonts';
import { Avatar } from '../components/Avatar';
import { Press } from '../components/Press';
import { PhotoTile } from '../components/PhotoTile';
import { useI18n } from '../i18n';
import type { GuestMoment } from './useGuestData';
import { paletteFor } from '../data/tones';

interface Props {
  theme: Theme;
  moments: GuestMoment[];
  index: number;
  onIndexChange: (i: number) => void;
  onClose: () => void;
  onDelete?: (m: GuestMoment) => void;
  canDelete?: (m: GuestMoment) => boolean;
}

export function GuestLightbox({ theme, moments, index, onIndexChange, onClose, onDelete, canDelete }: Props) {
  const { t } = useI18n();
  const photo = moments[index];

  const go = (d: number) => {
    const n = index + d;
    if (n >= 0 && n < moments.length) onIndexChange(n);
  };

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') go(1);
      else if (e.key === 'ArrowLeft') go(-1);
      else if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [index]);

  if (!photo) return null;

  const p = paletteFor(photo.guest_tone);
  const deletable = canDelete?.(photo);

  return (
    <View style={[StyleSheet.absoluteFill, s.root]}>
      {/* image */}
      <View style={s.imageWrap}>
        {photo.is_text ? (
          <LinearGradient colors={[p[0], '#0e1116']} start={{ x: 0.1, y: 0 }} end={{ x: 0.6, y: 1 }} style={StyleSheet.absoluteFill}>
            <View style={s.textCenter}>
              <Text style={s.textContent}>{photo.caption || '记录了一个瞬间'}</Text>
            </View>
          </LinearGradient>
        ) : photo.uri ? (
          <Image source={{ uri: photo.uri }} contentFit="contain" style={StyleSheet.absoluteFill} />
        ) : (
          <PhotoTile tone={photo.guest_tone} seed={photo.id} style={StyleSheet.absoluteFill} />
        )}
      </View>

      {/* tap zones for navigation */}
      {index > 0 && <Pressable onPress={() => go(-1)} style={s.tapLeft} />}
      {index < moments.length - 1 && <Pressable onPress={() => go(1)} style={s.tapRight} />}

      {/* top bar */}
      <LinearGradient colors={['rgba(0,0,0,0.55)', 'rgba(0,0,0,0)']} style={s.topBar}>
        <Press onPress={onClose} style={s.closeBtn}>
          <Text style={s.closeX}>✕</Text>
        </Press>
        <Text style={s.counter}>{index + 1} / {moments.length}</Text>
        <View style={{ width: 36 }} />
      </LinearGradient>

      {/* bottom info */}
      <LinearGradient colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.72)', 'rgba(0,0,0,0.88)']} locations={[0, 0.55, 1]} style={s.bottomBar}>
        {photo.caption && !photo.is_text && (
          <Text style={s.caption}>{photo.caption}</Text>
        )}
        <Text style={s.dayTime}>Day {photo.day}{photo.created_at ? ` · ${new Date(photo.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ''}</Text>

        <View style={s.authorRow}>
          <View style={s.authorInfo}>
            <Avatar ini={photo.guest_ini || photo.guest_name.slice(0, 1)} tone={photo.guest_tone} size={28} />
            <Text style={s.authorName}>{photo.guest_name}</Text>
          </View>
          {deletable && onDelete && (
            <Press onPress={() => onDelete(photo)} style={s.deleteBtn}>
              <Text style={s.deleteText}>{t('guest.wall.deleteMoment')}</Text>
            </Press>
          )}
        </View>
      </LinearGradient>
    </View>
  );
}

const s = StyleSheet.create({
  root: {
    zIndex: 90,
    backgroundColor: '#000',
  },
  imageWrap: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
  },
  textContent: {
    fontSize: 25,
    fontWeight: '700',
    color: '#fff',
    lineHeight: 36,
    textAlign: 'center',
    letterSpacing: -0.4,
  },
  tapLeft: {
    position: 'absolute',
    left: 0,
    top: 90,
    bottom: 160,
    width: '34%',
    zIndex: 5,
  },
  tapRight: {
    position: 'absolute',
    right: 0,
    top: 90,
    bottom: 160,
    width: '34%',
    zIndex: 5,
  },
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 60,
    paddingHorizontal: 16,
    paddingBottom: 26,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeX: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  counter: {
    fontFamily: 'monospace',
    fontSize: 12.5,
    fontWeight: '600',
    color: '#fff',
    letterSpacing: 0.5,
  },
  bottomBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 10,
    paddingHorizontal: 18,
    paddingTop: 40,
    paddingBottom: 30,
  },
  caption: {
    fontSize: 16.5,
    fontWeight: '600',
    color: '#fff',
    lineHeight: 22,
  },
  dayTime: {
    fontFamily: 'monospace',
    fontSize: 11,
    color: 'rgba(255,255,255,0.6)',
    marginTop: 7,
    letterSpacing: 0.4,
  },
  authorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 16,
  },
  authorInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  authorName: {
    fontSize: 13.5,
    fontWeight: '600',
    color: '#fff',
  },
  deleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
    backgroundColor: 'rgba(255,69,58,0.22)',
  },
  deleteText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#FF6961',
  },
});
