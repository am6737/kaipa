import React, { useState, useCallback } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, StyleSheet, Platform, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { Theme } from '../theme/theme';
import { Press } from '../components/Press';
import { useI18n } from '../i18n';

interface PhotoPick {
  uri: string;
  width: number;
  height: number;
}

interface Props {
  theme: Theme;
  days: number;
  onPost: (photos: PhotoPick[], caption: string, day: number) => void;
  onPostText: (caption: string, day: number) => void;
  onClose: () => void;
}

export function GuestUploadSheet({ theme, days, onPost, onPostText, onClose }: Props) {
  const { t } = useI18n();
  const { height: winH } = useWindowDimensions();
  const [picks, setPicks] = useState<PhotoPick[]>([]);
  const [caption, setCaption] = useState('');
  const [day, setDay] = useState(Math.max(1, days));

  const pickImages = useCallback(async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      quality: 0.8,
    });
    if (result.canceled) return;
    const newPicks = result.assets.map((a) => ({
      uri: a.uri,
      width: a.width || 1,
      height: a.height || 1,
    }));
    setPicks((prev) => [...prev, ...newPicks]);
  }, []);

  const removePick = (idx: number) => {
    setPicks((prev) => prev.filter((_, i) => i !== idx));
  };

  const canPost = picks.length > 0 || caption.trim().length > 0;

  const handlePost = () => {
    if (!canPost) return;
    if (picks.length === 0) {
      onPostText(caption.trim(), day);
    } else {
      onPost(picks, caption.trim(), day);
    }
  };

  const dayCount = Math.max(1, days);
  const dayOpts = Array.from({ length: dayCount }, (_, i) => i + 1);

  return (
    <View style={StyleSheet.absoluteFill}>
      <Pressable style={s.backdrop} onPress={onClose} />
      <View style={s.sheetWrap}>
        <View style={[s.sheet, { backgroundColor: theme.dark ? '#1c1c1e' : theme.bg, maxHeight: Math.round(winH * 0.85) }]}>
          <View style={s.handle} />

          {/* header */}
          <View style={s.headerRow}>
            <Press onPress={onClose} style={s.headerBtn}>
              <Text style={[s.headerBtnText, { color: theme.text2 }]}>{t('guest.wall.cancel')}</Text>
            </Press>
            <Text style={[s.headerTitle, { color: theme.text }]}>{t('guest.wall.addMoment')}</Text>
            <Press onPress={canPost ? handlePost : undefined} style={s.headerBtn}>
              <Text style={[s.headerBtnText, { color: canPost ? theme.accent : theme.text3, fontWeight: '700' }]}>
                {t('guest.wall.post')}
              </Text>
            </Press>
          </View>

          <ScrollView style={s.scrollBody} showsVerticalScrollIndicator={false}>
            {/* photo grid */}
            <View style={s.photoGrid}>
              {picks.map((p, i) => (
                <View key={i} style={s.photoThumb}>
                  <Image source={{ uri: p.uri }} contentFit="cover" style={StyleSheet.absoluteFill} />
                  <Press onPress={() => removePick(i)} style={s.removeBtn}>
                    <Text style={s.removeX}>✕</Text>
                  </Press>
                </View>
              ))}
              <Press onPress={pickImages} style={[s.addPhotoBtn, { borderColor: theme.dark ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.16)' }]}>
                <Text style={{ fontSize: 22, color: theme.accent }}>＋</Text>
                <Text style={{ fontSize: 10.5, color: theme.text3 }}>{t('guest.wall.selectPhotos')}</Text>
              </Press>
            </View>

            {/* caption */}
            <TextInput
              value={caption}
              onChangeText={setCaption}
              placeholder={t('guest.wall.captionPlaceholder')}
              placeholderTextColor={theme.text3}
              maxLength={40}
              style={[s.captionInput, {
                backgroundColor: theme.dark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)',
                borderColor: theme.hairline,
                color: theme.text,
              }]}
            />

            {/* day selector */}
            <Text style={[s.dayLabel, { color: theme.text2 }]}>{t('guest.wall.dayLabel')}</Text>
            <View style={[s.dayRow, { backgroundColor: theme.dark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.05)' }]}>
              {dayOpts.map((d) => {
                const on = d === day;
                return (
                  <Press
                    key={d}
                    onPress={() => setDay(d)}
                    style={[s.dayBtn, on && {
                      backgroundColor: theme.dark ? 'rgba(120,120,128,0.5)' : '#fff',
                      shadowColor: '#000',
                      shadowOffset: { width: 0, height: 1 },
                      shadowOpacity: 0.18,
                      shadowRadius: 3,
                    }]}
                  >
                    <Text style={[s.dayBtnText, { color: on ? theme.text : theme.text2, fontWeight: on ? '700' : '500' }]}>
                      Day {d}
                    </Text>
                  </Press>
                );
              })}
            </View>
          </ScrollView>
        </View>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  sheetWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
  },
  sheet: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 18,
    paddingTop: 12,
    paddingBottom: 28,
  },
  handle: {
    width: 38,
    height: 5,
    borderRadius: 3,
    backgroundColor: 'rgba(128,128,128,0.3)',
    alignSelf: 'center',
    marginBottom: 14,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  headerBtn: {
    padding: 4,
  },
  headerBtnText: {
    fontSize: 14.5,
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 16.5,
    fontWeight: '800',
  },
  scrollBody: {
    flexShrink: 1,
  },
  photoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
    marginBottom: 16,
  },
  photoThumb: {
    width: '31%',
    aspectRatio: 1,
    borderRadius: 12,
    overflow: 'hidden',
  },
  removeBtn: {
    position: 'absolute',
    top: 5,
    right: 5,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeX: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '600',
  },
  addPhotoBtn: {
    width: '31%',
    aspectRatio: 1,
    borderRadius: 12,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
  },
  captionInput: {
    width: '100%',
    paddingVertical: 13,
    paddingHorizontal: 15,
    borderRadius: 13,
    borderWidth: 1,
    fontSize: 15,
    marginBottom: 16,
  },
  dayLabel: {
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 8,
  },
  dayRow: {
    flexDirection: 'row',
    borderRadius: 11,
    padding: 3,
    gap: 3,
  },
  dayBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 7,
    borderRadius: 8,
  },
  dayBtnText: {
    fontSize: 13,
  },
});
