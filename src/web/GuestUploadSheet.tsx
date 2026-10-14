import React, { useState, useCallback, useRef, useEffect } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, StyleSheet, Platform, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { Theme } from '../theme/theme';
import { Press } from '../components/Press';
import { useI18n } from '../i18n';
import { space, type } from '../design-system';
import { loadGuestDraft, saveGuestDraft, clearGuestDraft, durablePhotoUri } from './guestRetryState';
import type { GuestIdentity } from './IdentitySheet';

interface PhotoPick {
  uri: string;
  width: number;
  height: number;
}

interface Props {
  theme: Theme;
  days: number;
  draftScope?: string;
  identity?: GuestIdentity;
  onPost: (photos: PhotoPick[], caption: string, day: number, requestKey: string, identity?: GuestIdentity) => Promise<void>;
  onPostText: (caption: string, day: number, requestKey: string, identity?: GuestIdentity) => Promise<void>;
  onDiscard?: (requestKey: string) => void;
  onClose: () => void;
}

export function GuestUploadSheet({ theme, days, draftScope, identity, onPost, onPostText, onDiscard, onClose }: Props) {
  const { t } = useI18n();
  const { height: winH } = useWindowDimensions();
  const [picks, setPicks] = useState<PhotoPick[]>([]);
  const [caption, setCaption] = useState('');
  const [day, setDay] = useState(Math.max(1, days));
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState('');
  const [hydrating, setHydrating] = useState(!!draftScope);
  const mounted = useRef(true);
  const operation = useRef<{ key: string; identity?: GuestIdentity; inFlight: boolean; discarded?: boolean } | null>(null);
  useEffect(() => {
    mounted.current = true;
    if (draftScope) loadGuestDraft(draftScope).then(draft => {
      if (!mounted.current) return;
      if (draft) {
        setPicks(draft.picks);
        setCaption(draft.caption);
        setDay(draft.day);
        operation.current = { key: draft.key, identity: draft.identity, inFlight: false };
      }
      setHydrating(false);
    }).catch(cause => { if (mounted.current) setError(cause.message); });
    return () => { mounted.current = false; };
  }, [draftScope]);
  // Closing a scoped sheet keeps an unknown operation. Only explicit "new"
  // discards it. Page departure also leaves the persisted draft intact.
  const locked = operation.current !== null;
  const close = () => { if (!operation.current?.inFlight) onClose(); };

  const pickImages = useCallback(async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      quality: 0.8,
    });
    if (result.canceled || operation.current) return;
    try {
      const newPicks = await Promise.all(result.assets.map(async a => ({
        uri: await durablePhotoUri(a.uri), width: a.width || 1, height: a.height || 1,
      })));
      if (mounted.current && !operation.current) setPicks(prev => [...prev, ...newPicks]);
    } catch (cause) { if (mounted.current) setError(cause instanceof Error ? cause.message : '无法保存照片'); }
  }, []);

  const removePick = (idx: number) => {
    if (operation.current) return;
    setPicks((prev) => prev.filter((_, i) => i !== idx));
  };

  const canPost = picks.length > 0 || caption.trim().length > 0;

  const handlePost = async () => {
    if (!mounted.current || !canPost || hydrating || operation.current?.inFlight || operation.current?.discarded) return;
    if (!operation.current) operation.current = { key: crypto.randomUUID(), identity: identity && { ...identity }, inFlight: false };
    const current = operation.current;
    current.inFlight = true;
    setPosting(true);
    setError('');
    try {
      if (identity && !current.identity) throw new Error('无法恢复原访客身份，请放弃此草稿并新建');
      if (draftScope) await saveGuestDraft(draftScope, { key: current.key, identity: current.identity, picks, caption: caption.trim(), day });
      if (!mounted.current) return;
      if (picks.length === 0) {
        await onPostText(caption.trim(), day, current.key, current.identity);
      } else {
        await onPost(picks, caption.trim(), day, current.key, current.identity);
      }
    } catch (cause) {
      if (mounted.current) setError(cause instanceof Error ? cause.message : '操作失败，请稍后重试');
    } finally {
      current.inFlight = false;
      if (mounted.current) setPosting(false);
    }
  };

  const dayCount = Math.max(1, days);
  const dayOpts = Array.from({ length: dayCount }, (_, i) => i + 1);

  return (
    <View style={StyleSheet.absoluteFill}>
      <Pressable style={s.backdrop} onPress={close} />
      <View style={s.sheetWrap}>
        <View style={[s.sheet, { backgroundColor: theme.dark ? '#1c1c1e' : theme.bg, maxHeight: Math.round(winH * 0.85) }]}>
          <View style={s.handle} />

          {/* header */}
          <View style={s.headerRow}>
            <Press onPress={posting ? undefined : close} style={s.headerBtn}>
              <Text style={[s.headerBtnText, { color: theme.text2 }]}>{t('guest.wall.cancel')}</Text>
            </Press>
            <Text style={[s.headerTitle, { color: theme.text }]}>{t('guest.wall.addMoment')}</Text>
            <Press onPress={canPost && !posting && !hydrating ? handlePost : undefined} style={s.headerBtn}>
              <Text style={[s.headerBtnText, { color: canPost && !posting && !hydrating ? theme.accent : theme.text3, fontWeight: '700' }]}>
                {t('guest.wall.post')}
              </Text>
            </Press>
          </View>
          {!!error && (
            <View style={{ marginBottom: space.sm }}>
              <Text accessibilityRole="alert" style={{ ...type.hint, color: theme.danger }}>{error}</Text>
              <Text style={{ ...type.hint, color: theme.text2 }}>再次发布会重试本次内容；关闭后原草稿仍可恢复。</Text>
            </View>
          )}
          {!!draftScope && locked && (
            <View style={{ marginBottom: space.sm }}>
              {!!operation.current?.identity && (
                <Text style={{ ...type.hint, color: theme.text2 }}>本次草稿使用访客身份：{operation.current.identity.name}</Text>
              )}
              <Press onPress={posting || hydrating ? undefined : async () => {
                if (!operation.current || operation.current.inFlight || hydrating) return;
                const current = operation.current;
                current.inFlight = true;
                setPosting(true);
                try {
                  await clearGuestDraft(draftScope, current.key);
                  current.discarded = true;
                  onDiscard?.(current.key);
                  if (mounted.current) onClose();
                } catch (cause) {
                  if (mounted.current) setError(cause instanceof Error ? cause.message : '无法清除草稿');
                } finally {
                  current.inFlight = false;
                  if (mounted.current) setPosting(false);
                }
              }}>
                <Text style={{ ...type.hint, color: theme.accent }}>放弃此草稿并新建（已提交内容会保留）</Text>
              </Press>
            </View>
          )}

          <ScrollView style={s.scrollBody} showsVerticalScrollIndicator={false}>
            {/* photo grid */}
            <View style={s.photoGrid}>
              {picks.map((p, i) => (
                <View key={i} style={s.photoThumb}>
                  <Image source={{ uri: p.uri }} contentFit="cover" style={StyleSheet.absoluteFill} />
                  <Press onPress={locked ? undefined : () => removePick(i)} style={s.removeBtn}>
                    <Text style={s.removeX}>✕</Text>
                  </Press>
                </View>
              ))}
              <Press onPress={locked ? undefined : pickImages} style={[s.addPhotoBtn, { borderColor: theme.dark ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.16)' }]}>
                <Text style={{ fontSize: 22, color: theme.accent }}>＋</Text>
                <Text style={{ fontSize: 10.5, color: theme.text3 }}>{t('guest.wall.selectPhotos')}</Text>
              </Press>
            </View>

            {/* caption */}
            <TextInput
              value={caption}
              editable={!locked}
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
                    onPress={locked ? undefined : () => setDay(d)}
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
