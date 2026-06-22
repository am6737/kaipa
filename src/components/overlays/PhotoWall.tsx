// PhotoWall.tsx — 瞬间 shared wall.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Alert, ScrollView, Animated, PanResponder, Pressable, ActivityIndicator, StyleSheet, useWindowDimensions, type DimensionValue } from 'react-native';
import { ReactNativeZoomableView } from '@openspacelabs/react-native-zoomable-view';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import * as VideoThumbnails from 'expo-video-thumbnails';
import { LinearGradient } from 'expo-linear-gradient';
import { LivePhotoView, type LivePhotoViewType } from 'expo-live-photo';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useEventListener } from 'expo';
import { requireOptionalNativeModule } from 'expo-modules-core';

const livePhotoAvailable = requireOptionalNativeModule('ExpoLivePhoto') != null;
import { Theme } from '../../theme/theme';
import { MONO } from '../../theme/fonts';
import { Poi, Companion } from '../../data/pois';
import { PhotoTile } from '../PhotoTile';
import { Icon } from '../Icon';
import { Press } from '../Press';
import { CircleBtn } from '../CircleBtn';
import { Avatar, AvatarStack } from '../Avatar';
import { useNav } from '../../nav/NavContext';
import { useInspo } from '../../hooks/useInspo';
import { useData } from '../../data/DataContext';
import { useI18n } from '../../i18n';


interface WallPhoto {
  id: string;
  tone: string;
  ratio: number;
  caption: string;
  day: number;
  time?: string;
  author: Companion;
  uri?: string;
  kind?: 'image' | 'video' | 'livePhoto';
  thumbnail?: string;
  duration?: number;
  pairedVideoUri?: string;
}

// ── Zoomable image with pinch-to-zoom, double-tap to zoom, pan ──
function ZoomableImage({ uri, width, height, onSingleTap, onLongPress }: { uri: string; width: number; height: number | string; onSingleTap: () => void; onLongPress: () => void }) {
  const dim: DimensionValue = typeof width === 'number' ? width : (width as any);
  const dimH: DimensionValue = typeof height === 'number' ? height : (height as any);
  return (
    <ReactNativeZoomableView
      minZoom={1}
      maxZoom={4}
      zoomStep={0.5}
      doubleTapZoomToCenter={false}
      onSingleTap={() => onSingleTap()}
      onLongPress={() => onLongPress()}
      longPressDuration={400}
      style={{ width: dim, height: dimH }}
    >
      <Image source={{ uri }} contentFit="contain" style={{ width: dim, height: dimH }} />
    </ReactNativeZoomableView>
  );
}

// ── Lightbox: tap to close, swipe to navigate, pinch-to-zoom, long-press for actions ──
function Lightbox({ visible, index, setIndex, onClose, onDelete, info, theme, insets, nav }: {
  visible: WallPhoto[]; index: number; setIndex: (i: number) => void; onClose: () => void;
  onDelete?: (id: string) => void;
  info: Poi; theme: Theme; insets: { top: number; bottom: number }; nav: ReturnType<typeof useNav>;
}) {
  const t = theme;
  const { t: tr } = useI18n();
  const { width: W } = useWindowDimensions();
  const photo = visible[index];
  const scrollRef = useRef<ScrollView>(null);
  const idxRef = useRef(index);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const closingRef = useRef(false);
  const [livePlaying, setLivePlaying] = useState(false);
  const liveRef = useRef<LivePhotoViewType>(null);

  const isLivePhoto = photo?.kind === 'livePhoto' && !!photo.pairedVideoUri;
  const isVideo = photo?.kind === 'video';
  const isLocal = !!photo?.uri?.startsWith('file://');
  const useNativeLive = livePhotoAvailable && isLivePhoto && isLocal;

  const videoUri = isVideo ? (photo?.uri ?? null)
    : (isLivePhoto && !isLocal ? (photo?.pairedVideoUri ?? null) : null);
  const videoPlayer = useVideoPlayer(videoUri, (p) => { p.loop = false; });

  useEffect(() => {
    if (!videoPlayer) return;
    const sub = videoPlayer.addListener('playToEnd', () => setLivePlaying(false));
    return () => sub.remove();
  }, [videoPlayer]);

  const [videoCurrentTime, setVideoCurrentTime] = useState(0);
  const [videoDuration, setVideoDuration] = useState(0);

  useEventListener(videoPlayer, 'timeUpdate', (e) => {
    setVideoCurrentTime(e.currentTime);
  });

  useEventListener(videoPlayer, 'sourceLoad', (e) => {
    setVideoDuration(e.duration);
  });

  const progressPct = videoDuration > 0 ? videoCurrentTime / videoDuration : 0;

  const fmt = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const seekVideo = (clientX: number, containerW: number) => {
    if (!videoPlayer || videoDuration <= 0) return;
    const pct = Math.max(0, Math.min(1, clientX / containerW));
    videoPlayer.currentTime = pct * videoDuration;
  };

  useEffect(() => {
    Animated.timing(fadeAnim, { toValue: 1, duration: 0, useNativeDriver: true }).start();
  }, [fadeAnim]);

  useEffect(() => {
    if (idxRef.current !== index) {
      idxRef.current = index;
      scrollRef.current?.scrollTo({ x: index * W, animated: false });
      setLivePlaying(false);
      videoPlayer?.pause();
    }
  }, [index, W]);

  const dismiss = () => {
    if (closingRef.current) return;
    closingRef.current = true;
    Animated.timing(fadeAnim, { toValue: 0, duration: 200, useNativeDriver: true }).start(onClose);
  };

  const longPressedRef = useRef(false);
  const [menu, setMenu] = useState(false);
  const canDel = !!(onDelete && photo);

  const toggleLive = useCallback(() => {
    if (livePlaying) {
      if (useNativeLive) {
        liveRef.current?.stopPlayback();
      } else if (videoPlayer) {
        videoPlayer.pause();
      }
      setLivePlaying(false);
    } else {
      if (useNativeLive) {
        liveRef.current?.startPlayback('full');
      } else if (videoPlayer) {
        videoPlayer.currentTime = 0;
        videoPlayer.play();
      }
      setLivePlaying(true);
    }
  }, [livePlaying, useNativeLive, videoPlayer]);

  const showActions = () => { longPressedRef.current = true; setMenu(true); };
  const act = (fn: () => void) => { setMenu(false); fn(); };
  const handlePress = () => {
    if (longPressedRef.current) { longPressedRef.current = false; return; }
    if (menu) { setMenu(false); return; }
    if (isVideo && livePlaying) return;
    dismiss();
  };

  if (!photo) return null;

  return (
    <Animated.View style={[StyleSheet.absoluteFill, { zIndex: 150, backgroundColor: '#000', opacity: fadeAnim }]}>
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        bounces
        showsHorizontalScrollIndicator={false}
        contentOffset={{ x: index * W, y: 0 }}
        onMomentumScrollEnd={(e) => {
          const page = Math.round(e.nativeEvent.contentOffset.x / W);
          if (page !== idxRef.current && page >= 0 && page < visible.length) {
            idxRef.current = page;
            setIndex(page);
          }
        }}
        style={{ flex: 1 }}
      >
        {visible.map((p) => {
          const isThis = p.id === photo.id;
          const pIsVideo = p.kind === 'video';
          const imgUri = pIsVideo ? (p.thumbnail || p.uri) : p.uri;
          return (
            <View
              key={p.id}
              style={{ width: W, height: '100%', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}
            >
              <View style={{ width: W, height: '100%', alignItems: 'center', justifyContent: 'center' }}>
                {isThis && useNativeLive ? (
                  <LivePhotoView
                    ref={liveRef}
                    source={{ photoUri: p.uri!, pairedVideoUri: p.pairedVideoUri! }}
                    contentFit="contain"
                    useDefaultGestureRecognizer={false}
                    onPlaybackStop={() => setLivePlaying(false)}
                    style={{ width: W, height: '100%' }}
                  />
                ) : isThis && pIsVideo && livePlaying && videoPlayer ? (
                  <VideoView
                    player={videoPlayer}
                    style={{ width: W, height: '100%' }}
                    nativeControls={false}
                  />
                ) : imgUri ? (
                  <>
                    <ZoomableImage uri={imgUri} width={W} height="100%" onSingleTap={handlePress} onLongPress={showActions} />
                    {isThis && !pIsVideo && livePlaying && videoPlayer ? (
                      <VideoView
                        player={videoPlayer}
                        style={[StyleSheet.absoluteFill]}
                        nativeControls={false}
                      />
                    ) : null}
                    {isThis && pIsVideo && !livePlaying ? (
                      <View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]} pointerEvents="box-none">
                        <Pressable onPress={toggleLive} style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' }}>
                          <Icon name="play" color="#fff" size={28} />
                        </Pressable>
                      </View>
                    ) : null}
                  </>
                ) : (
                  <Pressable onPress={handlePress} onLongPress={showActions} delayLongPress={400} style={{ width: W, height: '100%' }}>
                    <PhotoTile tone={p.tone} seed={info.id + p.id} resWidth={1200} style={{ width: W, aspectRatio: Math.max(0.66, p.ratio) }} />
                  </Pressable>
                )}
              </View>
            </View>
          );
        })}
      </ScrollView>

      {/* video progress bar — thin line at bottom edge */}
      {isVideo && livePlaying && videoDuration > 0 ? (
        <View
          onStartShouldSetResponder={() => true}
          onMoveShouldSetResponder={() => true}
          onResponderGrant={(e) => seekVideo(e.nativeEvent.locationX, W)}
          onResponderMove={(e) => seekVideo(e.nativeEvent.locationX, W)}
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 10,
            height: 24,
            justifyContent: 'flex-end',
          }}
        >
          <View style={{ height: 2, backgroundColor: 'rgba(0,0,0,0.15)' }}>
            <View style={{ width: `${progressPct * 100}%`, height: '100%', backgroundColor: '#fff' }} />
          </View>
        </View>
      ) : null}

      {/* bottom info (hidden when menu is open or video is playing) */}
      {!menu && !(isVideo && livePlaying) ? (
        <View pointerEvents="box-none" style={{ position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 18, paddingTop: 40, paddingBottom: insets.bottom + 20 }}>
          {isLivePhoto ? (
            <Press onPress={toggleLive} style={{ alignSelf: 'flex-start', marginBottom: 12 }}>
              <View style={{
                flexDirection: 'row', alignItems: 'center', gap: 4,
                paddingLeft: 6, paddingRight: 9, paddingVertical: 4, borderRadius: 100,
                backgroundColor: livePlaying ? 'rgba(0,0,0,0.45)' : 'rgba(0,0,0,0.25)',
              }}>
                <Icon name="livePhoto" color={livePlaying ? '#FFD60A' : '#fff'} size={20} strokeWidth={1.5} />
                <Text style={{ fontSize: 12, fontWeight: '600', color: livePlaying ? '#FFD60A' : 'rgba(255,255,255,0.9)', letterSpacing: 0.2 }}>LIVE</Text>
              </View>
            </Press>
          ) : null}
          {photo.caption ? <Text style={{ fontSize: 16.5, fontWeight: '600', color: '#fff', lineHeight: 22, textShadowColor: 'rgba(0,0,0,0.5)', textShadowRadius: 6 }}>{photo.caption}</Text> : null}
          {photo.day ? (() => {
            let dateLine = `Day ${photo.day}`;
            if (photo.time) dateLine += ` · ${photo.time}`;
            if (info.date) {
              const m = info.date.match(/(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})/);
              if (m) {
                const base = new Date(+m[1], +m[2] - 1, +m[3]);
                base.setDate(base.getDate() + photo.day - 1);
                const fullDate = tr('journey.photoWall.dateFull', { year: base.getFullYear(), month: base.getMonth() + 1, day: base.getDate() });
                dateLine = `Day ${photo.day} · ${fullDate}${photo.time ? ' ' + photo.time : ''}`;
              }
            }
            return <Text style={{ fontFamily: MONO, fontSize: 11, color: 'rgba(255,255,255,0.6)', marginTop: 7, letterSpacing: 0.4 }}>{dateLine}</Text>;
          })() : null}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9, marginTop: 16 }}>
            <Avatar ini={photo.author.ini} color={photo.author.color} tone={photo.author.tone} size={28} />
            <Text style={{ fontSize: 13.5, fontWeight: '600', color: '#fff' }}>{photo.author.name}{photo.author.host ? ' · ' + tr('journey.companions.host') : ''}</Text>
          </View>
        </View>
      ) : null}

      {/* ── action sheet (themed card, centered content) ── */}
      {menu ? (
        <View style={[StyleSheet.absoluteFill, { zIndex: 10 }]}>
          <Pressable onPress={() => setMenu(false)} style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.5)' }]} />
          <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: t.dark ? '#1c1c1e' : t.bg, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingBottom: Math.max(insets.bottom, 8), boxShadow: t.dark ? '0px -16px 50px rgba(0,0,0,0.5)' : '0px -16px 50px rgba(0,0,0,0.18)' }}>
            <View style={{ alignItems: 'center', paddingTop: 12, paddingBottom: 14 }}>
              <View style={{ width: 38, height: 5, borderRadius: 3, backgroundColor: t.text3 }} />
            </View>
            <View style={{ marginHorizontal: 18, borderRadius: 16, overflow: 'hidden', backgroundColor: t.dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.03)', borderWidth: StyleSheet.hairlineWidth, borderColor: t.hairline }}>
              <Pressable onPress={() => act(() => nav.showToast(tr('journey.photoWall.savedToAlbum')))} style={({ pressed }) => ({ alignItems: 'center', justifyContent: 'center', height: 52, backgroundColor: pressed ? (t.dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)') : 'transparent' })}>
                <Text style={{ fontSize: 16, color: t.accent }}>{tr('journey.photoWall.saveToAlbum')}</Text>
              </Pressable>
              <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: t.hairline }} />
              <Pressable onPress={() => act(() => nav.showToast(tr('journey.photoWall.shared')))} style={({ pressed }) => ({ alignItems: 'center', justifyContent: 'center', height: 52, backgroundColor: pressed ? (t.dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)') : 'transparent' })}>
                <Text style={{ fontSize: 16, color: t.accent }}>{tr('journey.photoWall.share')}</Text>
              </Pressable>
              {canDel ? (
                <>
                  <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: t.hairline }} />
                  <Pressable onPress={() => act(() => { onDelete!(photo.id); dismiss(); })} style={({ pressed }) => ({ alignItems: 'center', justifyContent: 'center', height: 52, backgroundColor: pressed ? (t.dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)') : 'transparent' })}>
                    <Text style={{ fontSize: 16, color: t.danger }}>{tr('common.delete')}</Text>
                  </Pressable>
                </>
              ) : null}
            </View>
          </View>
        </View>
      ) : null}
    </Animated.View>
  );
}

export function genPhotos(info: Poi, status: string | undefined): WallPhoto[] {
  const roster = info.companionList || [];
  // real photos — skip the first one (cover), moments start from the second
  if (info.photoUris) {
    if (info.photoUris.length <= 1) return [];
    const self = roster.find((c) => c.self) || roster[0] || { ini: '我', name: '我', color: '#0A84FF' };
    return info.photoUris.slice(1).map((uri, i) => ({
      id: `real-${i}`,
      tone: info.tone || 'ridge',
      ratio: 1,
      caption: '',
      day: 1,
      time: '',
      author: self,
      uri,
    }));
  }
  return [];
}

function fmtDuration(ms: number): string {
  const totalSec = Math.round(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function PhotoWall({ theme, info, status, onClose }: { theme: Theme; info: Poi; status?: string; onClose: () => void }) {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const nav = useNav();
  const { t: tr } = useI18n();
  const t = theme;
  const { userId } = useData();
  const isPlanning = status === 'planning';
  const inspo = useInspo(info.id, userId);
  const inspoRef = useRef(inspo);
  inspoRef.current = inspo;
  const [filter, setFilter] = useState<Companion | null>(null);
  const [compSheet, setCompSheet] = useState(false);
  const [boxIdx, setBoxIdx] = useState(-1);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [processingAssets, setProcessingAssets] = useState(false);
  const toggleSelect = (id: string) => setSelectedIds(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const exitSelect = () => { setSelectMode(false); setSelectedIds(new Set()); };

  const roster = info.companionList || [];
  const self = roster.find((c) => c.self || c.host) || roster[0];

  // ── entrance + drag-to-dismiss ──
  const translateY = useRef(new Animated.Value(600)).current;
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    Animated.spring(translateY, { toValue: 0, useNativeDriver: true, bounciness: 2, speed: 14 }).start();
  }, [translateY]);
  const pan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_e, g) => g.dy > 4 && Math.abs(g.dy) > Math.abs(g.dx),
      onPanResponderMove: (_e, g) => { if (g.dy > 0) translateY.setValue(g.dy); },
      onPanResponderRelease: (_e, g) => {
        if (g.dy > 110 || g.vy > 0.6) {
          Animated.timing(translateY, { toValue: 700, duration: 200, useNativeDriver: true }).start(() => onCloseRef.current());
        } else {
          Animated.spring(translateY, { toValue: 0, useNativeDriver: true, bounciness: 4, speed: 16 }).start();
        }
      },
    })
  ).current;

  const addAssets = async (assets: ImagePicker.ImagePickerAsset[]) => {
    const items = assets.map((a) => {
      const kind = a.type === 'video' ? 'video' as const : a.type === 'livePhoto' ? 'livePhoto' as const : 'image' as const;
      let thumbnail: string | undefined;
      let duration: number | undefined;
      let pairedVideoUri: string | undefined;
      if (kind === 'video') {
        VideoThumbnails.getThumbnailAsync(a.uri, { time: 500 }).then(r => thumbnail = r.uri).catch(() => {});
        if (a.duration) duration = a.duration;
      }
      if (kind === 'livePhoto' && (a as any).pairedVideoAsset?.uri) {
        pairedVideoUri = (a as any).pairedVideoAsset.uri;
      }
      return { uri: a.uri, kind, thumbnail, duration, pairedVideoUri };
    });
    // addAll creates ALL placeholders synchronously in one batch before any
    // upload begins, then uploads with 4-at-a-time concurrency.
    inspoRef.current.addAll(items).catch(() => nav.showToast(tr('journey.photoWall.errorTitle')));
  };

  // ── picker: call launch directly from event handlers (NOT inside useEffect,
  //     because Android needs the ActivityResultLauncher registered before
  //     the Activity starts, and a delayed effect can miss that window). ──
  const [cameraPerm, requestCameraPerm] = ImagePicker.useCameraPermissions();
  const [libraryPerm, requestLibraryPerm] = ImagePicker.useMediaLibraryPermissions();

  const pickCamera = async () => {
    const perm = cameraPerm?.granted ? cameraPerm : await requestCameraPerm();
    if (!perm.granted) { nav.showToast(tr('journey.photoWall.needCameraPerm')); return; }
    setProcessingAssets(true);
    try {
      const res = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.8 });
      if (!res.canceled && res.assets) await addAssets(res.assets);
    } catch (e) {
      Alert.alert(tr('journey.photoWall.errorTitle'), String(e && typeof e === 'object' && 'message' in e ? (e as any).message : e));
    } finally {
      setProcessingAssets(false);
    }
  };

  const pickLibrary = async () => {
    const perm = libraryPerm?.granted ? libraryPerm : await requestLibraryPerm();
    if (!perm.granted) { nav.showToast(tr('journey.photoWall.needLibraryPerm')); return; }
    // Set processing BEFORE the picker opens — the overlay stays hidden while
    // the system picker is in front, but becomes visible the moment the picker
    // closes (while Android resolves the selected asset URIs).
    setProcessingAssets(true);
    try {
      const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images', 'videos', 'livePhotos'], allowsMultipleSelection: true, quality: 0.8 });
      if (!res.canceled && res.assets) {
        await addAssets(res.assets);
      }
    } catch (e) {
      Alert.alert(tr('journey.photoWall.errorTitle'), String(e && typeof e === 'object' && 'message' in e ? (e as any).message : e));
    } finally {
      setProcessingAssets(false);
    }
  };

  const chooseSource = () =>
    nav.openActionSheet({
      title: tr('journey.photoWall.addMoment'),
      items: [
        { label: tr('journey.photoWall.takePhoto'), onPress: pickCamera },
        { label: tr('journey.photoWall.pickFromLibrary'), onPress: pickLibrary },
      ],
    });

  // ── photos ──
  const fakePhotos = useMemo(() => genPhotos(info, status), [info.name, status, info.totalDays]);
  const selfAuthor = self || { ini: tr('journey.companions.me'), name: tr('journey.companions.me'), color: '#0A84FF' } as Companion;
  const inspoPhotos = useMemo<WallPhoto[]>(
    () => inspo.media.map((m) => ({ id: m.id, tone: 'ridge', ratio: 1, caption: '', day: 0, author: selfAuthor, uri: m.uri, kind: m.kind, thumbnail: m.thumbnail, duration: m.duration, pairedVideoUri: m.pairedVideoUri })),
    [inspo.media, selfAuthor]
  );
  const allPhotos = isPlanning ? inspoPhotos : [...fakePhotos, ...inspoPhotos];

  // per-person counts
  const counts = useMemo(() => {
    const m: Record<string, number> = {};
    allPhotos.forEach((p) => { m[p.author.name] = (m[p.author.name] || 0) + 1; });
    return m;
  }, [allPhotos]);

  const visible = filter ? allPhotos.filter((p) => p.author.name === filter.name) : allPhotos;
  const totalCount = allPhotos.length;
  const myCount = self ? (counts[self.name] || 0) : 0;

  const openCompanionSheet = () => setCompSheet(true);

  // ── masonry ──
  const gap = 7;
  const bodyPad = 16;
  const colW = (width - bodyPad * 2 - gap) / 2;
  const cols: WallPhoto[][] = [[], []];
  const colH = [0, 0];
  visible.forEach((p) => {
    const c = colH[0] <= colH[1] ? 0 : 1;
    cols[c].push(p);
    colH[c] += (p.uri ? colW : colW / p.ratio) + gap;
  });

  // ── progress label ──
  const dayLabel = status === 'ongoing' && info.dayIndex
    ? `${tr('journey.photoWall.recordedTo', { day: info.dayIndex, total: info.totalDays ?? 0 })} · ${info.dist}`
    : info.dist ? `${info.days || ''} · ${info.dist}` : '';

  return (
    <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: t.bg, transform: [{ translateY }], zIndex: 132 }]}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: insets.bottom + 100 }}>
        {/* ── hero cover ── */}
        {!filter ? (
          <View {...pan.panHandlers} style={{ height: 252 }}>
            {info.photoUris?.[0] ? (
              <Image source={{ uri: info.photoUris[0] }} contentFit="cover" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} />
            ) : (
              <PhotoTile tone={info.tone} seed={info.name + 'cover'} resWidth={1200} darken style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} />
            )}
            <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.18)' }} />
            <View style={{ position: 'absolute', top: insets.top + 10, left: 16 }}>
              <CircleBtn theme={t} name="arrowL" onPress={onClose} />
            </View>
            <View style={{ position: 'absolute', left: 18, right: 18, bottom: 12 }}>
              <Text style={{ fontSize: 28, fontWeight: '800', color: '#fff', letterSpacing: -0.6, textShadowColor: 'rgba(0,0,0,0.45)', textShadowRadius: 14, textShadowOffset: { width: 0, height: 2 } }}>
                {info.name}
              </Text>
              {dayLabel ? (
                <Text style={{ fontFamily: MONO, fontSize: 11.5, color: 'rgba(255,255,255,0.78)', marginTop: 8, letterSpacing: 0.3 }}>{dayLabel}</Text>
              ) : null}
            </View>
          </View>
        ) : (
          // ── filter mode header ──
          <View style={{ paddingTop: insets.top + 12, paddingHorizontal: 18, paddingBottom: 14 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 11 }}>
              <Press onPress={() => setFilter(null)} style={{ width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: t.dark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.06)' }}>
                <Icon name="chevronL" color={t.text2} size={16} />
              </Press>
              <Avatar ini={filter.ini} color={filter.color} tone={filter.tone} size={38} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={{ fontSize: 21, fontWeight: '800', color: t.text, letterSpacing: -0.4 }}>{filter.self ? tr('journey.photoWall.myMoments') : filter.name}</Text>
                  {filter.host ? <View style={{ paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, backgroundColor: t.accentSoft }}><Text style={{ fontSize: 9.5, fontWeight: '700', color: t.accent }}>{tr('journey.companions.host')}</Text></View> : null}
                </View>
                <Text style={{ fontSize: 12.5, color: t.text2, marginTop: 2 }}>{tr('journey.moments.countPhotos', { count: visible.length })}</Text>
              </View>
            </View>
          </View>
        )}

        {/* ── section header (hidden in filter mode) ── */}
        {!filter ? (
          <View style={{ paddingHorizontal: 18, paddingTop: 16 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 6 }}>
                <Text style={{ fontSize: 22, fontWeight: '800', color: t.text, letterSpacing: -0.5 }}>{tr('journey.moments.title')}</Text>
                <Text style={{ fontSize: 13, color: t.text2, paddingBottom: 3 }}>
                  <Text style={{ fontFamily: MONO, fontWeight: '700', color: t.text }}>{totalCount}</Text> {tr('journey.photoWall.unitPhotos')}
                </Text>
              </View>
              <Press
                onPress={inspo.uploading ? undefined : chooseSource}
                style={{
                  width: 34, height: 34, borderRadius: 17,
                  backgroundColor: t.dark ? '#2C2C2E' : '#fff', alignItems: 'center', justifyContent: 'center',
                  boxShadow: t.dark ? '0px 2px 8px rgba(0,0,0,0.5)' : '0px 2px 8px rgba(0,0,0,0.10)',
                  borderWidth: t.dark ? StyleSheet.hairlineWidth : 0, borderColor: 'rgba(255,255,255,0.06)',
                }}
              >
                <Icon name="plus" color={t.text} size={17} strokeWidth={2.2} />
              </Press>
            </View>

            {roster.length > 0 ? (
              <Press onPress={openCompanionSheet} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 14 }}>
                <AvatarStack people={roster} size={26} max={5} ringColor={t.dark ? '#1c1c1e' : '#fff'} />
                <Text style={{ fontSize: 12.5, color: t.text2 }}>{tr('journey.photoWall.companionCountChevron', { count: roster.length })}</Text>
                {myCount > 0 ? (
                  <Press onPress={() => self && setFilter(self)} style={{ marginLeft: 'auto', paddingHorizontal: 12, paddingVertical: 5, borderRadius: 16, backgroundColor: t.accentSoft }}>
                    <Text style={{ fontSize: 12, fontWeight: '700', color: t.accent }}>{tr('journey.photoWall.mineCount', { count: myCount })}</Text>
                  </Press>
                ) : null}
              </Press>
            ) : null}
          </View>
        ) : null}

        {/* ── masonry body ── */}
        <View style={{ paddingHorizontal: bodyPad, paddingTop: 18 }}>
          {visible.length === 0 ? (
            <View style={{ alignItems: 'center', paddingTop: 60 }}>
              <Icon name="photo" color={t.text3} size={44} />
              <Text style={{ fontSize: 17, fontWeight: '700', color: t.text, marginTop: 16 }}>
                {filter ? tr('journey.photoWall.emptyFilterTitle') : tr('journey.photoWall.emptyTitle')}
              </Text>
              <Text style={{ fontSize: 13.5, color: t.text2, textAlign: 'center', lineHeight: 20, marginTop: 8, paddingHorizontal: 24 }}>
                {filter
                  ? tr('journey.photoWall.emptyFilterBody')
                  : isPlanning
                    ? tr('journey.photoWall.emptyPlanningBody')
                    : tr('journey.photoWall.emptyBody')}
              </Text>
            </View>
          ) : (
            <View style={{ flexDirection: 'row', gap }}>
              {cols.map((col, ci) => (
                <View key={ci} style={{ flex: 1, gap }}>
                  {col.map((p) => (
                    <Press
                      key={p.id}
                      onPress={() => selectMode ? toggleSelect(p.id) : setBoxIdx(visible.indexOf(p))}
                      onLongPress={!p.id.startsWith('uploading-') ? () => { setSelectMode(true); setSelectedIds(new Set([p.id])); } : undefined}
                    >
                      <View style={{ borderRadius: 12, overflow: 'hidden' }}>
                        {inspo.uploadingIds.has(p.id) || inspo.removingIds.has(p.id) ? (
                          <View style={{ width: '100%', height: colW, backgroundColor: t.dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)', alignItems: 'center', justifyContent: 'center' }}>
                            <ActivityIndicator color={t.text3} size="small" />
                          </View>
                        ) : p.uri ? (
                          <View style={{ backgroundColor: t.dark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)' }}>
                            {p.kind === 'video' ? (
                              <View style={{ width: '100%', height: colW }}>
                                {p.thumbnail ? (
                                  <Image source={{ uri: p.thumbnail }} contentFit="cover" style={{ width: '100%', height: colW }} />
                                ) : (
                                  <View style={{ width: '100%', height: colW, backgroundColor: t.dark ? '#1c1c1e' : '#2a2a2c' }} />
                                )}
                                <LinearGradient colors={['transparent', 'rgba(0,0,0,0.35)']} style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 32, justifyContent: 'flex-end' }}>
                                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 7, paddingBottom: 5 }}>
                                    <Icon name="play" color="#fff" size={8} />
                                    {p.duration ? <Text style={{ fontSize: 10.5, fontWeight: '600', color: '#fff', fontFamily: MONO }}>{fmtDuration(p.duration)}</Text> : null}
                                  </View>
                                </LinearGradient>
                              </View>
                            ) : (
                              <View>
                                <Image source={{ uri: p.uri }} contentFit="cover" style={{ width: '100%', height: colW }} />
                                {p.kind === 'livePhoto' ? (
                                  <LinearGradient colors={['transparent', 'rgba(0,0,0,0.35)']} style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 28, justifyContent: 'flex-end' }}>
                                    <View style={{ paddingHorizontal: 6, paddingBottom: 5 }}>
                                      <Icon name="livePhoto" color="#fff" size={14} strokeWidth={1.6} />
                                    </View>
                                  </LinearGradient>
                                ) : null}
                              </View>
                            )}
                            {selectMode ? (
                              <View style={{ position: 'absolute', right: 7, top: 7, width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: selectedIds.has(p.id) ? t.accent : 'rgba(255,255,255,0.7)', backgroundColor: selectedIds.has(p.id) ? t.accent : 'rgba(0,0,0,0.3)', alignItems: 'center', justifyContent: 'center' }}>
                                {selectedIds.has(p.id) ? <Icon name="check" color="#fff" size={14} strokeWidth={2.6} /> : null}
                              </View>
                            ) : null}
                            {inspo.uploadingIds.has(p.id) || inspo.removingIds.has(p.id) ? (
                              <View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.4)', borderRadius: 12 }]}>
                                <ActivityIndicator color="#fff" size="small" />
                              </View>
                            ) : null}
                          </View>
                        ) : (
                          <PhotoTile tone={p.tone} seed={info.id + p.id} radius={12} style={{ width: '100%', height: colW / p.ratio }} />
                        )}
                      </View>
                    </Press>
                  ))}
                </View>
              ))}
            </View>
          )}
        </View>
      </ScrollView>

      {/* ── Processing overlay (shown while picker resolves assets) ── */}
      {processingAssets ? (
        <View style={[StyleSheet.absoluteFill, { zIndex: 200, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.3)' }]}>
          <View style={{ paddingHorizontal: 24, paddingVertical: 18, borderRadius: 16, backgroundColor: t.surfaceTop, alignItems: 'center', gap: 12 }}>
            <ActivityIndicator color={t.accent} size="large" />
            <Text style={{ fontSize: 14, fontWeight: '600', color: t.text }}>{tr('journey.photoWall.processingAssets')}</Text>
          </View>
        </View>
      ) : null}

      {/* ── Batch delete bar ── */}
      {selectMode ? (
        <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 160, paddingHorizontal: 18, paddingTop: 12, paddingBottom: insets.bottom + 14, backgroundColor: t.bg, borderTopWidth: StyleSheet.hairlineWidth, borderColor: t.hairline }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <Press onPress={exitSelect} style={{ height: 50, paddingHorizontal: 16, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: t.dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)' }}>
              <Text style={{ fontSize: 15, fontWeight: '600', color: t.text }}>{tr('common.cancel')}</Text>
            </Press>
            <Press
              onPress={() => {
                const allSelected = visible.every(p => selectedIds.has(p.id));
                setSelectedIds(allSelected ? new Set() : new Set(visible.map(p => p.id)));
              }}
              style={{ height: 50, paddingHorizontal: 16, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: t.dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)' }}
            >
              <Text style={{ fontSize: 15, fontWeight: '600', color: t.accent }}>
                {visible.every(p => selectedIds.has(p.id)) ? tr('common.deselectAll') : tr('common.selectAll')}
              </Text>
            </Press>
            <Press
              onPress={selectedIds.size > 0 ? () => { selectedIds.forEach((id) => inspo.remove(id)); exitSelect(); } : undefined}
              style={{ flex: 1, height: 50, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: selectedIds.size > 0 ? '#FF3B30' : (t.dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)') }}
            >
              <Text style={{ fontSize: 15, fontWeight: '700', color: selectedIds.size > 0 ? '#fff' : t.text3 }}>
                {selectedIds.size > 0 ? `${tr('common.delete')} (${selectedIds.size})` : tr('common.delete')}
              </Text>
            </Press>
          </View>
        </View>
      ) : null}

      {/* ── Lightbox ── */}
      {boxIdx >= 0 && visible[boxIdx] ? <Lightbox visible={visible} index={boxIdx} setIndex={setBoxIdx} onClose={() => setBoxIdx(-1)} onDelete={(id) => { inspo.remove(id); if (visible.length <= 1) setBoxIdx(-1); }} info={info} theme={t} insets={insets} nav={nav} /> : null}

      {/* ── Companions bottom sheet ── */}
      {compSheet && !filter ? (
        <View style={[StyleSheet.absoluteFill, { zIndex: 140 }]}>
          <Press onPress={() => setCompSheet(false)} style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.5)' }]}><View /></Press>
          <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: t.dark ? '#1c1c1e' : t.bg, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingBottom: insets.bottom + 20, boxShadow: '0px -16px 50px rgba(0,0,0,0.5)' }}>
            <View style={{ alignItems: 'center', paddingTop: 12, paddingBottom: 14 }}>
              <View style={{ width: 38, height: 5, borderRadius: 3, backgroundColor: t.text3 }} />
            </View>
            <Text style={{ fontSize: 21, fontWeight: '800', color: t.text, paddingHorizontal: 18, marginBottom: 4 }}>{tr('journey.companions.sheetTitle')}</Text>
            <Text style={{ fontSize: 12.5, color: t.text2, paddingHorizontal: 18, marginBottom: 14 }}>{tr('journey.companions.sheetSubtitle', { count: roster.length })}</Text>
            <View style={{ marginHorizontal: 18, borderRadius: 16, overflow: 'hidden', backgroundColor: t.dark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.02)', borderWidth: StyleSheet.hairlineWidth, borderColor: t.hairline }}>
              {roster.map((c, i) => {
                const n = counts[c.name] || 0;
                return (
                  <View key={i}>
                    <Press
                      onPress={n > 0 ? () => setFilter(c) : undefined}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 12, opacity: n > 0 ? 1 : 0.55 }}
                    >
                      <Avatar ini={c.ini} color={c.color} tone={c.tone} size={42} />
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
                          <Text style={{ fontSize: 15, fontWeight: '600', color: t.text }}>{c.name}</Text>
                          {c.host ? <View style={{ paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, backgroundColor: t.accentSoft }}><Text style={{ fontSize: 9.5, fontWeight: '700', color: t.accent }}>{tr('journey.companions.host')}</Text></View> : null}
                          {c.self ? <View style={{ paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, backgroundColor: t.dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)' }}><Text style={{ fontSize: 9.5, fontWeight: '700', color: t.text2 }}>{tr('journey.companions.you')}</Text></View> : null}
                        </View>
                        <Text style={{ fontSize: 12, color: t.text2, marginTop: 2 }}>
                          {n > 0 ? <><Text style={{ fontFamily: MONO, fontWeight: '700' }}>{n}</Text> {tr('journey.photoWall.unitMoments')}</> : tr('journey.photoWall.noPhotosYet')}
                        </Text>
                      </View>
                      {n > 0 ? <Icon name="chevronR" color={t.text3} size={15} /> : null}
                    </Press>
                    {i < roster.length - 1 ? <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: t.hairline, marginLeft: 68 }} /> : null}
                  </View>
                );
              })}
            </View>
          </View>
        </View>
      ) : null}
    </Animated.View>
  );
}
