// PhotoWall.tsx — 瞬间 shared wall.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TextInput, Alert, ScrollView, Animated, PanResponder, Pressable, ActivityIndicator, StyleSheet, useWindowDimensions, Platform, Share, InteractionManager, Easing, KeyboardAvoidingView, Keyboard, type DimensionValue } from 'react-native';
import { ReactNativeZoomableView } from '@openspacelabs/react-native-zoomable-view';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import * as VideoThumbnails from 'expo-video-thumbnails';
import * as Sharing from 'expo-sharing';
import { File, Paths } from 'expo-file-system';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import ReAnimated, { useSharedValue, useAnimatedStyle, withTiming, runOnJS } from 'react-native-reanimated';
import { LivePhotoView, type LivePhotoViewType } from 'expo-live-photo';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useEventListener } from 'expo';
import { requireOptionalNativeModule } from 'expo-modules-core';

const livePhotoAvailable = requireOptionalNativeModule('ExpoLivePhoto') != null;
import { Theme } from '../../theme/theme';
import { MONO, SERIF } from '../../theme/fonts';
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
import { formatDuration } from '../../lib/time';
import { createMediaLibraryAsset, requestMediaLibraryPermissions } from '../../lib/mediaLibrary';


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

// ── Native-thread seek bar: all animations via scaleX/translateX on UI thread ──
function SeekBar({ progress, duration, onSeek, onSeekStart, onSeekEnd }: {
  progress: number; duration: number;
  onSeek: (t: number) => void; onSeekStart: () => void; onSeekEnd: (t: number) => void;
}) {
  const trackW = useSharedValue(1);
  const stableW = useSharedValue(1);
  const pct = useSharedValue(duration > 0 ? progress / duration : 0);
  const dragging = useSharedValue(false);

  useEffect(() => {
    if (!dragging.value) {
      const target = duration > 0 ? progress / duration : 0;
      pct.value = (target >= 0.99 || target === 0) ? target : withTiming(target, { duration: 200 });
    }
  }, [progress, duration]);

  const pan = Gesture.Pan()
    .hitSlop({ top: 14, bottom: 14 })
    .onStart((e) => { dragging.value = true; pct.value = Math.max(0, Math.min(1, e.x / stableW.value)); runOnJS(onSeekStart)(); })
    .onUpdate((e) => { pct.value = Math.max(0, Math.min(1, e.x / stableW.value)); runOnJS(onSeek)(pct.value * duration); })
    .onEnd(() => { dragging.value = false; runOnJS(onSeekEnd)(pct.value * duration); });

  const tap = Gesture.Tap().onEnd((e) => {
    pct.value = Math.max(0, Math.min(1, e.x / stableW.value));
    runOnJS(onSeek)(pct.value * duration);
    runOnJS(onSeekEnd)(pct.value * duration);
  });

  const fillStyle = useAnimatedStyle(() => ({ transform: [{ scaleX: pct.value }] }));
  const thumbStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: Math.min(pct.value * stableW.value, trackW.value - 5) }],
    opacity: trackW.value >= stableW.value - 1 ? 1 : 0,
  }));

  return (
    <GestureDetector gesture={Gesture.Race(pan, tap)}>
      <ReAnimated.View
        style={{ flex: 1, height: 48, justifyContent: 'center' }}
        onLayout={(e) => {
          const w = e.nativeEvent.layout.width;
          trackW.value = w;
          if (w > stableW.value) stableW.value = w;
        }}
      >
        <View style={{ height: 2, borderRadius: 1, backgroundColor: 'rgba(255,255,255,0.2)', overflow: 'hidden' }}>
          <ReAnimated.View style={[{ width: '100%', height: '100%', borderRadius: 1, backgroundColor: '#fff', transformOrigin: 'left' }, fillStyle]} />
        </View>
        <ReAnimated.View style={[{ position: 'absolute', left: -5, top: 19, width: 10, height: 10, borderRadius: 5, backgroundColor: '#fff' }, thumbStyle]} />
      </ReAnimated.View>
    </GestureDetector>
  );
}

// ── Zoomable image: pinch up to 4×, double-tap toggles 1× ↔ 2× (WeChat-style) ──
function ZoomableImage({ uri, width, height, onSingleTap, onLongPress, onZoomChange }: { uri: string; width: number; height: number | string; onSingleTap: () => void; onLongPress: () => void; onZoomChange?: (zoomed: boolean) => void }) {
  const dim: DimensionValue = typeof width === 'number' ? width : (width as any);
  const dimH: DimensionValue = typeof height === 'number' ? height : (height as any);
  const ref = useRef<ReactNativeZoomableView>(null);
  const zoomCenterRef = useRef({ x: 0, y: 0 });

  const handleDoubleTap = useCallback((e: any, info: any) => {
    const zoom = info?.zoomLevel ?? 1;
    if (zoom > 1.05) {
      ref.current?.zoomTo(1, zoomCenterRef.current);
      onZoomChange?.(false);
    } else {
      const cx = e.nativeEvent.pageX - (info?.originalPageX ?? 0);
      const cy = e.nativeEvent.pageY - (info?.originalPageY ?? 0);
      zoomCenterRef.current = { x: cx, y: cy };
      ref.current?.zoomTo(2, { x: cx, y: cy });
      onZoomChange?.(true);
    }
  }, [onZoomChange]);

  const handleZoomAfter = useCallback((_e: any, _g: any, info: any) => {
    onZoomChange?.(info?.zoomLevel > 1.05);
  }, [onZoomChange]);

  return (
    <ReactNativeZoomableView
      ref={ref}
      minZoom={1}
      maxZoom={4}
      zoomStep={null as any}
      visualTouchFeedbackEnabled={false}
      onDoubleTapBefore={handleDoubleTap}
      onSingleTap={() => onSingleTap()}
      onZoomAfter={handleZoomAfter}
      onLongPress={() => onLongPress()}
      longPressDuration={400}
      // At 1× with a single finger, let the parent paging ScrollView own horizontal
      // swipes (next/prev photo). Keep the gesture here when zoomed in (so panning the
      // zoomed image works) OR while two fingers are down (so a pinch zooms instead of
      // being misread by the pager as a left/right swipe).
      disablePanOnInitialZoom
      onShouldBlockNativeResponder={(_e, g, info) => (info?.zoomLevel ?? 1) > 1.05 || g.numberActiveTouches >= 2}
      onPanResponderTerminationRequest={(_e, g, info) => (info?.zoomLevel ?? 1) <= 1.05 && g.numberActiveTouches < 2}
      style={{ width: dim, height: dimH }}
    >
      <Image source={{ uri }} contentFit="contain" transition={200} style={{ width: dim, height: dimH }} />
    </ReactNativeZoomableView>
  );
}

// ── Lightbox: tap to close, swipe to navigate, pinch-to-zoom, long-press for actions ──
function Lightbox({ visible, index, setIndex, onClose, onDelete, info, theme, insets, nav, thumbCache }: {
  visible: WallPhoto[]; index: number; setIndex: (i: number) => void; onClose: () => void;
  onDelete?: (id: string) => void;
  info: Poi; theme: Theme; insets: { top: number; bottom: number }; nav: ReturnType<typeof useNav>;
  thumbCache: Record<string, string>;
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
  const [zoomed, setZoomed] = useState(false);
  // Disable paging the instant a second finger lands, so a pinch zooms instead of
  // being read as a left/right page swipe. Touch events fire before the gesture
  // system decides an owner, so this beats the scroll view to the gesture.
  const [multiTouch, setMultiTouch] = useState(false);
  const multiRef = useRef(false);
  const syncMultiTouch = useCallback((e: { nativeEvent: { touches?: unknown[] } }) => {
    const v = (e.nativeEvent.touches?.length ?? 0) >= 2;
    if (v !== multiRef.current) { multiRef.current = v; setMultiTouch(v); }
  }, []);
  const liveRef = useRef<LivePhotoViewType>(null);

  const isLivePhoto = photo?.kind === 'livePhoto' && !!photo.pairedVideoUri;
  const isVideo = photo?.kind === 'video';
  const isLocal = !!photo?.uri?.startsWith('file://');
  const useNativeLive = livePhotoAvailable && isLivePhoto && isLocal;

  const videoUri = isVideo ? (photo?.uri ?? null)
    : (isLivePhoto && !isLocal ? (photo?.pairedVideoUri ?? null) : null);
  const isLiveFallback = isLivePhoto && !useNativeLive;
  const videoPlayer = useVideoPlayer(videoUri, (p) => { p.loop = !isLiveFallback; p.timeUpdateEventInterval = 0.1; });

  const [videoCurrentTime, setVideoCurrentTime] = useState(0);
  const [videoDuration, setVideoDuration] = useState(0);

  useEventListener(videoPlayer, 'timeUpdate', (e) => {
    setVideoCurrentTime(e.currentTime);
  });

  useEventListener(videoPlayer, 'sourceLoad', (e) => {
    setVideoDuration(e.duration);
  });

  useEventListener(videoPlayer, 'playToEnd', () => {
    if (isLiveFallback) setLivePlaying(false);
  });

  const fmt = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };


  useEffect(() => {
    Animated.timing(fadeAnim, { toValue: 1, duration: 250, useNativeDriver: true }).start();
  }, [fadeAnim]);

  useEffect(() => {
    if (idxRef.current !== index) {
      idxRef.current = index;
      scrollRef.current?.scrollTo({ x: index * W, animated: false });
      setLivePlaying(false);
      setZoomed(false);
      try { videoPlayer?.pause(); } catch {}
    }
  }, [index, W]);

  const dismiss = () => {
    if (closingRef.current) return;
    closingRef.current = true;
    controlsProg.value = 0;
    clearTimeout(controlsTimerRef.current);
    try { videoPlayer?.pause(); } catch {}
    Animated.timing(fadeAnim, { toValue: 0, duration: 200, useNativeDriver: true }).start(onClose);
  };

  const longPressedRef = useRef(false);
  const [menu, setMenu] = useState(false);
  const [showControls, setShowControls] = useState(false);
  const controlsTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const controlsProg = useSharedValue(0);
  const canDel = !!(onDelete && photo);

  useEffect(() => () => clearTimeout(controlsTimerRef.current), []);

  const stickyRef = useRef(false);

  const showControlsAnim = useCallback((autoHide = false) => {
    setShowControls(true);
    controlsProg.value = withTiming(1, { duration: 600 });
    clearTimeout(controlsTimerRef.current);
    if (autoHide && !stickyRef.current) {
      controlsTimerRef.current = setTimeout(hideControlsAnim, 3000);
    }
  }, []);

  const hideControlsAnim = useCallback(() => {
    clearTimeout(controlsTimerRef.current);
    controlsProg.value = withTiming(0, { duration: 500 });
    setTimeout(() => setShowControls(false), 520);
  }, []);

  const flashControls = useCallback(() => showControlsAnim(true), [showControlsAnim]);

  const barContainerStyle = useAnimatedStyle(() => ({
    left: controlsProg.value * (10 - (W - 58)) + (W - 58),
  }));
  const barContentStyle = useAnimatedStyle(() => ({ opacity: controlsProg.value }));
  const barArrowStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${(1 - controlsProg.value) * 180}deg` }],
  }));

  // Auto-play video when entering a video page
  useEffect(() => {
    if (isVideo && videoPlayer) {
      try { videoPlayer.currentTime = 0; videoPlayer.play(); } catch {}
      setLivePlaying(true);
      flashControls();
    }
  }, [videoUri]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleLive = useCallback(() => {
    if (livePlaying) {
      if (useNativeLive) {
        liveRef.current?.stopPlayback();
      } else if (videoPlayer) {
        try { videoPlayer.pause(); } catch {}
      }
      setLivePlaying(false);
    } else {
      if (useNativeLive) {
        liveRef.current?.startPlayback('full');
      } else if (videoPlayer) {
        try { videoPlayer.currentTime = 0; videoPlayer.play(); } catch {}
      }
      setLivePlaying(true);
    }
  }, [livePlaying, useNativeLive, videoPlayer]);

  const showActions = () => { longPressedRef.current = true; setMenu(true); };
  const act = (fn: () => void) => { setMenu(false); fn(); };
  const handlePress = () => {
    if (longPressedRef.current) { longPressedRef.current = false; return; }
    if (menu) { setMenu(false); return; }
    if (isVideo && livePlaying) try { videoPlayer?.pause(); } catch {}
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
        scrollEnabled={!zoomed && !multiTouch}
        decelerationRate="fast"
        onTouchStart={syncMultiTouch}
        onTouchEnd={syncMultiTouch}
        onTouchCancel={syncMultiTouch}
        showsHorizontalScrollIndicator={false}
        contentOffset={{ x: index * W, y: 0 }}
        onMomentumScrollEnd={(e) => {
          const page = Math.round(e.nativeEvent.contentOffset.x / W);
          if (page !== idxRef.current && page >= 0 && page < visible.length) {
            idxRef.current = page;
            setIndex(page);
            setLivePlaying(false);
            setZoomed(false);
            setShowControls(false);
            stickyRef.current = false;
            clearTimeout(controlsTimerRef.current);
            try { videoPlayer?.pause(); } catch {}
          }
        }}
        style={{ flex: 1 }}
      >
        {visible.map((p, pageIdx) => {
          const isNear = Math.abs(pageIdx - index) <= 1;
          if (!isNear) return <View key={p.id} style={{ width: W, height: '100%' }} />;
          const isThis = p.id === photo.id;
          const pIsVideo = p.kind === 'video';
          const imgUri = pIsVideo ? (p.thumbnail || thumbCache[p.id]) : p.uri;
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
                ) : imgUri ? (
                  <>
                    <ZoomableImage uri={imgUri} width={W} height="100%" onSingleTap={handlePress} onLongPress={showActions} onZoomChange={isThis ? setZoomed : undefined} />
                    {isThis && livePlaying && videoPlayer ? (
                      <View style={[StyleSheet.absoluteFill]} pointerEvents="none">
                        <VideoView
                          player={videoPlayer}
                          style={{ width: W, height: '100%' }}
                          nativeControls={false}
                        />
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

      {/* video controls — frosted glass bar + collapsed button */}
      {isVideo && (livePlaying || videoDuration > 0) ? (
        <>
          {/* bar container: expands from right ˄ button, collapses back to it */}
          <ReAnimated.View
            onStartShouldSetResponder={() => showControls}
            onMoveShouldSetResponder={() => showControls}
            style={[{
              position: 'absolute', right: 10, bottom: insets.bottom + 8, zIndex: 11,
              height: 48, borderRadius: 24, overflow: 'hidden',
            }, barContainerStyle]}
          >
            <BlurView intensity={80} tint="systemMaterialDark" style={{ flex: 1, borderRadius: 24, overflow: 'hidden' }}>
              <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 4 }}>
                <ReAnimated.View style={[{ flex: 1, flexDirection: 'row', alignItems: 'center' }, barContentStyle]}>
                  <Pressable onPress={toggleLive} hitSlop={8} style={{ width: 38, height: 48, alignItems: 'center', justifyContent: 'center' }}>
                    <Icon name="pause" color="#fff" size={20} />
                  </Pressable>
                  <Text style={{ fontFamily: MONO, fontSize: 12, color: 'rgba(255,255,255,0.9)' }}>{fmt(videoCurrentTime)} / {fmt(videoDuration)}</Text>
                  <View style={{ flex: 1, marginLeft: 6, marginRight: 2 }}>
                    <SeekBar
                      progress={videoCurrentTime}
                      duration={videoDuration}
                      onSeekStart={() => { try { videoPlayer?.pause(); } catch {} flashControls(); }}
                      onSeek={(t) => { try { if (videoPlayer) videoPlayer.currentTime = t; } catch {} setVideoCurrentTime(t); }}
                      onSeekEnd={(t) => { try { if (videoPlayer) { videoPlayer.currentTime = t; videoPlayer.play(); } } catch {} }}
                    />
                  </View>
                  <View style={{ width: StyleSheet.hairlineWidth, height: 18, backgroundColor: 'rgba(255,255,255,0.15)', marginLeft: 10, marginRight: 6 }} />
                </ReAnimated.View>
                <Pressable
                  onPress={() => {
                    if (showControls) { hideControlsAnim(); } else { stickyRef.current = true; showControlsAnim(); }
                  }}
                  hitSlop={8}
                  style={{ width: 40, height: 48, alignItems: 'center', justifyContent: 'center' }}
                >
                  <ReAnimated.View style={barArrowStyle}>
                    <Icon name="chevronDown" color="#fff" size={20} />
                  </ReAnimated.View>
                </Pressable>
              </View>
            </BlurView>
          </ReAnimated.View>
        </>
      ) : null}

      {/* bottom info (hidden when menu is open, video is playing, or zoomed in) */}
      {!menu && !zoomed && !(isVideo && livePlaying) ? (
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
          {(() => {
            // Show trip day + the journey's recorded duration ("耗时"), not a calendar date.
            const dayPart = photo.day ? `Day ${photo.day}` : '';
            const dur = info.trackDurationMs ? formatDuration(info.trackDurationMs, tr) : '';
            const line = [dayPart, dur].filter(Boolean).join(' · ');
            return line ? <Text style={{ fontFamily: MONO, fontSize: 11, color: 'rgba(255,255,255,0.6)', marginTop: 7, letterSpacing: 0.4 }}>{line}</Text> : null;
          })()}
        </View>
      ) : null}

      {/* ── action sheet (themed card, centered content) ── */}
      {menu ? (
        <View style={[StyleSheet.absoluteFill, { zIndex: 12 }]}>
          <Pressable onPress={() => setMenu(false)} style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.5)' }]} />
          <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: t.dark ? '#1c1c1e' : t.bg, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingBottom: Math.max(insets.bottom, 8), boxShadow: t.dark ? '0px -16px 50px rgba(0,0,0,0.5)' : '0px -16px 50px rgba(0,0,0,0.18)' }}>
            <View style={{ alignItems: 'center', paddingTop: 12, paddingBottom: 14 }}>
              <View style={{ width: 38, height: 5, borderRadius: 3, backgroundColor: t.text3 }} />
            </View>
            <View style={{ marginHorizontal: 18, borderRadius: 16, overflow: 'hidden', backgroundColor: t.dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.03)', borderWidth: StyleSheet.hairlineWidth, borderColor: t.hairline }}>
              <Pressable onPress={() => act(async () => {
                if (!photo.uri) return;
                try {
                  const { status } = await requestMediaLibraryPermissions();
                  if (status !== 'granted') { nav.showToast(tr('journey.photoWall.needLibraryPerm')); return; }
                  await createMediaLibraryAsset(photo.uri);
                  nav.showToast(tr('journey.photoWall.savedToAlbum'));
                } catch { nav.showToast(tr('journey.photoWall.errorTitle')); }
              })} style={({ pressed }) => ({ alignItems: 'center', justifyContent: 'center', height: 52, backgroundColor: pressed ? (t.dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)') : 'transparent' })}>
                <Text style={{ fontSize: 16, color: t.accent }}>{tr('journey.photoWall.saveToAlbum')}</Text>
              </Pressable>
              <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: t.hairline }} />
              <Pressable onPress={() => act(async () => {
                if (!photo.uri) return;
                try {
                  let shareUri = photo.uri;
                  if (!shareUri.startsWith('file://')) {
                    const downloaded = await File.downloadFileAsync(shareUri, Paths.cache);
                    shareUri = downloaded.uri;
                  }
                  if (await Sharing.isAvailableAsync()) {
                    const mime = photo.kind === 'video' ? 'video/mp4' : 'image/jpeg';
                    await Sharing.shareAsync(shareUri, { mimeType: mime });
                  } else {
                    await Share.share({ url: shareUri });
                  }
                } catch (e: any) {
                  if (e?.message !== 'User did not share') nav.showToast(tr('journey.photoWall.errorTitle'));
                }
              })} style={({ pressed }) => ({ alignItems: 'center', justifyContent: 'center', height: 52, backgroundColor: pressed ? (t.dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)') : 'transparent' })}>
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

export function genPhotos(info: Poi): WallPhoto[] {
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

function SavePickerSheet({ theme: t, allPhotos, saveSelectedIds, setSaveSelectedIds, toggleSaveSelect, mode, savePicker, setSavePicker, saveSheetY, saveBackdrop, saveSheetPan, saveScrollEnabled, saveScrollY, closeSavePicker, inspo, info, width, height, insets, nav, tr }: any) {
  const isDelete = mode === 'delete';
  const savePhotos = useMemo(() => allPhotos.filter((p: any) => p.uri), [allPhotos]);
  const allSaveSelected = savePhotos.length > 0 && savePhotos.every((p: any) => saveSelectedIds.has(p.id));
  const saveCount = saveSelectedIds.size;
  const saveColW = (width - 16 * 2 - 7) / 2;
  const sheetBg = t.dark ? '#1c1c1e' : t.bg;
  const pillBg = t.dark ? 'rgba(255,255,255,0.08)' : '#fff';
  const sheetH = height * 0.8;

  const doSave = async () => {
    if (saveCount === 0) return;
    const { status: permStatus } = await requestMediaLibraryPermissions();
    if (permStatus !== 'granted') { nav.showToast(tr('journey.photoWall.needLibraryPerm')); return; }
    try {
      const uris = savePhotos.filter((p: any) => saveSelectedIds.has(p.id)).map((p: any) => p.uri!);
      for (const uri of uris) {
        let localUri = uri;
        if (!uri.startsWith('file://')) {
          const downloaded = await File.downloadFileAsync(uri, Paths.cache);
          localUri = downloaded.uri;
        }
        await createMediaLibraryAsset(localUri);
      }
      nav.showToast(tr('journey.savePicker.saved'));
      closeSavePicker();
    } catch (e: any) {
      const msg = e?.message || String(e);
      console.warn('Save failed:', msg);
      nav.showToast(`${tr('journey.savePicker.saveFailed')}: ${msg}`);
    }
  };

  const doDelete = () => {
    if (saveCount === 0) return;
    Alert.alert(
      tr('journey.savePicker.deleteTitle', { count: saveCount }),
      tr('journey.savePicker.deleteMessage'),
      [
        { text: tr('common.cancel'), style: 'cancel' },
        {
          text: tr('common.delete'),
          style: 'destructive',
          onPress: () => {
            const realToDelete: string[] = [];
            const inspoToDelete: string[] = [];
            saveSelectedIds.forEach((id: string) => {
              if (id.startsWith('real-')) realToDelete.push(id);
              else inspoToDelete.push(id);
            });
            inspoToDelete.forEach(id => inspo.remove(id));
            if (realToDelete.length > 0 && info.photoUris) {
              const indices = new Set(realToDelete.map(id => parseInt(id.replace('real-', ''), 10) + 1));
              const updated = info.photoUris.filter((_: any, i: number) => !indices.has(i));
              nav.patchCurrent({ photoUris: updated });
            }
            nav.showToast(tr('journey.savePicker.deleted', { count: saveCount }));
            closeSavePicker();
            if (realToDelete.length > 0) {
              nav.closePhotoWall();
            }
          },
        },
      ],
    );
  };

  const doShare = async () => {
    if (saveCount === 0) return;
    const uris = savePhotos.filter((p: any) => saveSelectedIds.has(p.id)).map((p: any) => p.uri!);
    try {
      if (uris.length === 1) { await Sharing.shareAsync(uris[0]); }
      else { await Share.share({ message: uris.join('\n') }); }
    } catch {}
  };

  return (
    <View style={[StyleSheet.absoluteFill, { zIndex: 150 }]} pointerEvents={savePicker ? 'auto' : 'none'}>
      {/* backdrop */}
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.5)', opacity: saveBackdrop }]}>
        <Press onPress={closeSavePicker} style={StyleSheet.absoluteFill}><View /></Press>
      </Animated.View>

      {/* sheet */}
      <Animated.View {...saveSheetPan.panHandlers} style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: sheetH, backgroundColor: sheetBg, borderTopLeftRadius: 24, borderTopRightRadius: 24, transform: [{ translateY: saveSheetY }] }}>
        <View style={{ alignItems: 'center', paddingTop: 10, paddingBottom: 6 }}>
          <View style={{ width: 36, height: 5, borderRadius: 3, backgroundColor: t.text3 }} />
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          scrollEnabled={saveScrollEnabled}
          bounces={false}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 90 }}
          onScroll={(e: any) => { saveScrollY.current = e.nativeEvent.contentOffset.y; }}
          scrollEventThrottle={16}
        >
          <Text style={{ fontSize: 22, fontWeight: '800', color: t.text, marginTop: 6, marginBottom: 16 }}>
            {isDelete ? `${tr('common.delete')}${tr('journey.moments.title')}` : tr('journey.savePicker.title')}
          </Text>
          <Press
            onPress={() => setSaveSelectedIds(allSaveSelected ? new Set() : new Set(savePhotos.map((p: any) => p.id)))}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start', marginBottom: 16, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 9, backgroundColor: pillBg }}
          >
            <View style={{ width: 20, height: 20, borderRadius: 5, borderWidth: 2, borderColor: allSaveSelected ? t.accent : t.text3, backgroundColor: allSaveSelected ? t.accent : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
              {allSaveSelected ? <Icon name="check" color="#fff" size={12} strokeWidth={2.6} /> : null}
            </View>
            <Text style={{ fontSize: 13, fontWeight: '600', color: t.text }}>{tr('journey.savePicker.selectAll')}</Text>
          </Press>

          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7 }}>
            {savePhotos.map((p: any) => {
              const checked = saveSelectedIds.has(p.id);
              const author = p.author as Companion | undefined;
              return (
                <Press key={p.id} onPress={() => toggleSaveSelect(p.id)} style={{ width: saveColW }}>
                  <View style={{ aspectRatio: 0.85, borderRadius: 14, overflow: 'hidden', backgroundColor: t.dark ? '#2c2c2e' : '#e8e8e8' }}>
                    <Image source={{ uri: p.kind === 'video' ? (p.thumbnail || p.uri) : p.uri }} contentFit="cover" style={{ width: '100%', height: '100%' }} />
                    {author ? (
                      <View style={{ position: 'absolute', top: 8, left: 8, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6, backgroundColor: 'rgba(0,0,0,0.4)' }}>
                        <Text style={{ fontSize: 11, fontWeight: '600', color: '#fff' }}>{author.ini}</Text>
                      </View>
                    ) : null}
                    <View style={{ position: 'absolute', top: 8, right: 8, width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: checked ? t.accent : 'rgba(255,255,255,0.6)', backgroundColor: checked ? t.accent : 'rgba(0,0,0,0.3)', alignItems: 'center', justifyContent: 'center' }}>
                      {checked ? <Icon name="check" color="#fff" size={13} strokeWidth={2.6} /> : null}
                    </View>
                  </View>
                </Press>
              );
            })}
          </View>
        </ScrollView>

        <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, paddingHorizontal: 16, paddingTop: 10, paddingBottom: insets.bottom + 12, backgroundColor: sheetBg, borderTopWidth: StyleSheet.hairlineWidth, borderColor: t.hairline }}>
          {isDelete ? (
            <Press
              onPress={saveCount > 0 ? doDelete : undefined}
              style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, height: 46, borderRadius: 13, backgroundColor: saveCount > 0 ? t.danger : pillBg }}
            >
              <Icon name="trash" color={saveCount > 0 ? '#fff' : t.text3} size={15} />
              <Text style={{ fontSize: 14, fontWeight: '600', color: saveCount > 0 ? '#fff' : t.text3 }}>
                {saveCount > 0 ? `${tr('common.delete')} (${saveCount})` : tr('common.delete')}
              </Text>
            </Press>
          ) : (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Press
                onPress={saveCount > 0 ? doShare : undefined}
                style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, height: 46, paddingHorizontal: 18, borderRadius: 13, backgroundColor: pillBg }}
              >
                <Icon name="share" color={t.text} size={15} />
                <Text style={{ fontSize: 14, fontWeight: '600', color: t.text }}>{tr('journey.savePicker.share')}</Text>
              </Press>
              <Press
                onPress={saveCount > 0 ? doSave : undefined}
                style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, height: 46, borderRadius: 13, backgroundColor: saveCount > 0 ? t.accent : pillBg }}
              >
                <Text style={{ fontSize: 14, fontWeight: '600', color: saveCount > 0 ? '#fff' : t.text3 }}>
                  {tr('journey.savePicker.saveMoments', { count: saveCount })}
                </Text>
                <Icon name="download" color={saveCount > 0 ? '#fff' : t.text3} size={15} />
              </Press>
            </View>
          )}
        </View>
      </Animated.View>
    </View>
  );
}

export function PhotoWall({ theme, info, onClose }: { theme: Theme; info: Poi; onClose: () => void }) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const nav = useNav();
  const { t: tr } = useI18n();
  const t = theme;
  const { userId } = useData();
  const [moreMenu, setMoreMenu] = useState(false);
  const inspo = useInspo(info.id, userId);
  const inspoRef = useRef(inspo);
  inspoRef.current = inspo;
  const [filter, setFilter] = useState<Companion | null>(null);
  const [compSheet, setCompSheet] = useState(false);
  const [boxIdx, setBoxIdx] = useState(-1);
  const [processingAssets, setProcessingAssets] = useState(false);
  const [savePicker, setSavePicker] = useState(false);
  const [savePickerMode, setSavePickerMode] = useState<'save' | 'delete'>('save');
  const [saveSelectedIds, setSaveSelectedIds] = useState<Set<string>>(new Set());
  const toggleSaveSelect = (id: string) => setSaveSelectedIds(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  // save picker sheet: always-rendered, animated off-screen when hidden
  const saveSheetY = useRef(new Animated.Value(2000)).current;
  const saveBackdrop = useRef(new Animated.Value(0)).current;
  const saveScrollY = useRef(0);
  const [saveScrollEnabled, setSaveScrollEnabled] = useState(true);
  const openSavePicker = useCallback(() => {
    setSavePicker(true);
    saveBackdrop.setValue(0);
    saveSheetY.setValue(800);
    Animated.parallel([
      Animated.spring(saveSheetY, { toValue: 0, useNativeDriver: true, damping: 22, stiffness: 170, mass: 1 }),
      Animated.timing(saveBackdrop, { toValue: 1, duration: 400, useNativeDriver: true }),
    ]).start();
  }, [saveSheetY, saveBackdrop]);
  const closeSavePicker = useCallback(() => {
    Animated.parallel([
      Animated.timing(saveSheetY, { toValue: 800, duration: 300, easing: Easing.in(Easing.bezier(0.4, 0, 1, 1)), useNativeDriver: true }),
      Animated.timing(saveBackdrop, { toValue: 0, duration: 300, easing: Easing.in(Easing.ease), useNativeDriver: true }),
    ]).start(() => { setSavePicker(false); saveSheetY.setValue(2000); });
  }, [saveSheetY, saveBackdrop]);
  const closeSavePickerRef = useRef(closeSavePicker);
  closeSavePickerRef.current = closeSavePicker;
  const saveSheetPan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_e, g) =>
        saveScrollY.current <= 0 && g.dy > 12 && Math.abs(g.dy) > Math.abs(g.dx) * 1.5,
      onPanResponderGrant: () => { setSaveScrollEnabled(false); },
      onPanResponderMove: (_e, g) => {
        if (g.dy > 0) {
          saveSheetY.setValue(g.dy);
          saveBackdrop.setValue(Math.max(0, 1 - g.dy / 400));
        }
      },
      onPanResponderRelease: (_e, g) => {
        setSaveScrollEnabled(true);
        if (g.dy > 220 || g.vy > 1.2) {
          closeSavePickerRef.current();
        } else {
          Animated.parallel([
            Animated.timing(saveSheetY, { toValue: 0, duration: 220, useNativeDriver: true }),
            Animated.timing(saveBackdrop, { toValue: 1, duration: 220, useNativeDriver: true }),
          ]).start();
        }
      },
    })
  ).current;

  // ── compose sheet: pick assets → optional one-line caption → upload ──
  const [composeSheet, setComposeSheet] = useState(false);
  const [pendingAssets, setPendingAssets] = useState<ImagePicker.ImagePickerAsset[]>([]);
  const [composeCaption, setComposeCaption] = useState('');
  const composeSheetY = useRef(new Animated.Value(800)).current;
  const composeBackdrop = useRef(new Animated.Value(0)).current;
  const openCompose = useCallback((assets: ImagePicker.ImagePickerAsset[]) => {
    setPendingAssets(assets);
    setComposeCaption('');
    setComposeSheet(true);
    composeBackdrop.setValue(0);
    composeSheetY.setValue(800);
    Animated.parallel([
      Animated.spring(composeSheetY, { toValue: 0, useNativeDriver: true, damping: 22, stiffness: 170, mass: 1 }),
      Animated.timing(composeBackdrop, { toValue: 1, duration: 400, useNativeDriver: true }),
    ]).start();
  }, [composeSheetY, composeBackdrop]);
  const closeCompose = useCallback(() => {
    Keyboard.dismiss();
    Animated.parallel([
      Animated.timing(composeSheetY, { toValue: 800, duration: 300, easing: Easing.in(Easing.bezier(0.4, 0, 1, 1)), useNativeDriver: true }),
      Animated.timing(composeBackdrop, { toValue: 0, duration: 300, easing: Easing.in(Easing.ease), useNativeDriver: true }),
    ]).start(() => setComposeSheet(false));
  }, [composeSheetY, composeBackdrop]);

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

  const addAssets = async (assets: ImagePicker.ImagePickerAsset[], caption?: string) => {
    const cap = caption?.trim() || undefined;
    const items = await Promise.all(assets.map(async (a) => {
      const kind = a.type === 'video' ? 'video' as const : a.type === 'livePhoto' ? 'livePhoto' as const : 'image' as const;
      let thumbnail: string | undefined;
      let duration: number | undefined;
      let pairedVideoUri: string | undefined;
      if (kind === 'video') {
        try { thumbnail = (await VideoThumbnails.getThumbnailAsync(a.uri, { time: 500 })).uri; } catch {}
        if (a.duration) duration = a.duration;
      }
      if (kind === 'livePhoto' && (a as any).pairedVideoAsset?.uri) {
        pairedVideoUri = (a as any).pairedVideoAsset.uri;
      }
      return { uri: a.uri, kind, thumbnail, duration, pairedVideoUri, caption: cap };
    }));
    // addAll creates ALL placeholders synchronously in one batch before any
    // upload begins, then uploads with 4-at-a-time concurrency.
    inspoRef.current.addAll(items).catch(() => nav.showToast(tr('journey.photoWall.errorTitle')));
  };

  // Confirm from the compose sheet: snapshot picks + caption, close, then upload.
  const confirmCompose = () => {
    const assets = pendingAssets;
    const caption = composeCaption;
    closeCompose();
    if (assets.length) addAssets(assets, caption);
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
      if (!res.canceled && res.assets?.length) openCompose(res.assets);
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
      if (!res.canceled && res.assets?.length) {
        openCompose(res.assets);
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
  const fakePhotos = useMemo(() => genPhotos(info), [info.name, info.photoUris, info.companionList]);
  const selfAuthor = self || { ini: tr('journey.companions.me'), name: tr('journey.companions.me'), color: '#0A84FF' } as Companion;
  const inspoPhotos = useMemo<WallPhoto[]>(
    () => inspo.media.map((m) => ({ id: m.id, tone: 'ridge', ratio: 1, caption: m.caption || '', day: 0, author: selfAuthor, uri: m.uri, kind: m.kind, thumbnail: m.thumbnail, duration: m.duration, pairedVideoUri: m.pairedVideoUri })),
    [inspo.media, selfAuthor]
  );
  const allPhotos = [...fakePhotos, ...inspoPhotos];

  // Generate missing video thumbnails lazily
  const [thumbCache, setThumbCache] = useState<Record<string, string>>({});
  useEffect(() => {
    allPhotos.forEach((p) => {
      if (p.kind === 'video' && !p.thumbnail && p.uri && !thumbCache[p.id]) {
        VideoThumbnails.getThumbnailAsync(p.uri, { time: 500 })
          .then((r) => setThumbCache((c) => ({ ...c, [p.id]: r.uri })))
          .catch(() => {});
      }
    });
  }, [allPhotos.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // per-person counts
  const counts = useMemo(() => {
    const m: Record<string, number> = {};
    allPhotos.forEach((p) => { m[p.author.name] = (m[p.author.name] || 0) + 1; });
    return m;
  }, [allPhotos]);

  const visible = filter ? allPhotos.filter((p) => p.author.name === filter.name) : allPhotos;
  const totalCount = allPhotos.length;
  const myCount = self ? (counts[self.name] || 0) : 0;

  const compSheetY = useRef(new Animated.Value(800)).current;
  const compBackdrop = useRef(new Animated.Value(0)).current;
  const openCompanionSheet = () => {
    setCompSheet(true);
    compSheetY.setValue(800);
    compBackdrop.setValue(0);
    Animated.parallel([
      Animated.spring(compSheetY, { toValue: 0, useNativeDriver: true, damping: 22, stiffness: 170, mass: 1 }),
      Animated.timing(compBackdrop, { toValue: 1, duration: 400, useNativeDriver: true }),
    ]).start();
  };
  const closeCompanionSheet = useCallback(() => {
    Animated.parallel([
      Animated.timing(compSheetY, { toValue: 800, duration: 300, easing: Easing.in(Easing.bezier(0.4, 0, 1, 1)), useNativeDriver: true }),
      Animated.timing(compBackdrop, { toValue: 0, duration: 300, easing: Easing.in(Easing.ease), useNativeDriver: true }),
    ]).start(() => setCompSheet(false));
  }, [compSheetY, compBackdrop]);

  const bodyPad = 16;

  const dateDisplay = info.date || '—';
  const peopleCount = info.companions ?? 0;
  const gridGap = 7;
  const gridColW = (width - bodyPad * 2 - gridGap) / 2;

  return (
    <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: t.bg, transform: [{ translateY }], zIndex: 132 }]}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: insets.bottom + 100 }}>
        {/* ── hero cover with all text inside ── */}
        {!filter ? (
          <View {...pan.panHandlers}>
            <View style={{ aspectRatio: 1.05, overflow: 'hidden' }}>
              {info.photoUris?.[0] ? (
                <Image source={{ uri: info.photoUris[0] }} contentFit="cover" style={StyleSheet.absoluteFill} />
              ) : (
                <PhotoTile tone={info.tone} seed={info.name + 'cover'} resWidth={1200} darken style={StyleSheet.absoluteFill} />
              )}
              <LinearGradient
                colors={['transparent', 'rgba(0,0,0,0.35)', 'rgba(0,0,0,0.78)']}
                locations={[0.25, 0.6, 1]}
                style={StyleSheet.absoluteFill}
              />

              {/* title + stats + buttons — all overlaid */}
              <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, paddingHorizontal: 20, paddingBottom: 16 }}>
                <Text
                  style={{ fontFamily: SERIF, fontSize: 28, fontWeight: '400', color: '#fff', textAlign: 'center', lineHeight: 36 }}
                  numberOfLines={2}
                >
                  {info.name}
                </Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 14 }}>
                  <View style={{ flex: 1, alignItems: 'center' }}>
                    <Text style={{ fontSize: 18, fontWeight: '700', fontStyle: 'italic', color: '#fff' }}>{String(totalCount)}</Text>
                    <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.65)', marginTop: 2 }}>{tr('journey.stat.moments')}</Text>
                  </View>
                  <View style={{ flex: 1, alignItems: 'center' }}>
                    <Text style={{ fontSize: 18, fontWeight: '700', fontStyle: 'italic', color: '#fff' }}>{dateDisplay}</Text>
                    <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.65)', marginTop: 2 }}>{tr('journey.stat.date')}</Text>
                  </View>
                  <Press onPress={openCompanionSheet} style={{ flex: 1, alignItems: 'center' }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
                      <View style={{ alignItems: 'center' }}>
                        <Text style={{ fontSize: 18, fontWeight: '700', fontStyle: 'italic', color: '#fff' }}>{String(peopleCount)}</Text>
                        <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.65)', marginTop: 2 }}>{tr('journey.stat.people')}</Text>
                      </View>
                      <Icon name="chevronR" color="rgba(255,255,255,0.5)" size={12} />
                    </View>
                  </Press>
                </View>
              </View>
            </View>

            {/* action capsule */}
            <View style={{ marginHorizontal: bodyPad, marginTop: 14, marginBottom: 6, flexDirection: 'row', height: 44, borderRadius: 22, overflow: 'hidden', backgroundColor: t.dark ? 'rgba(255,255,255,0.08)' : '#fff' }}>
              <Press
                onPress={inspo.uploading ? undefined : chooseSource}
                style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }}
              >
                <Icon name="plus" color={t.text} size={15} strokeWidth={2.2} />
                <Text style={{ fontSize: 14, fontWeight: '600', color: t.text }}>{tr('journey.action.add')}</Text>
              </Press>
              <View style={{ width: StyleSheet.hairlineWidth, backgroundColor: t.hairline, marginVertical: 10 }} />
              <Press
                onPress={() => { setSavePickerMode('save'); setSaveSelectedIds(new Set(allPhotos.filter(p => p.uri).map(p => p.id))); openSavePicker(); }}
                style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }}
              >
                <Icon name="download" color={t.text} size={15} />
                <Text style={{ fontSize: 14, fontWeight: '600', color: t.text }}>{tr('journey.action.save')}</Text>
              </Press>
            </View>
          </View>
        ) : (
          // ── filter mode header ──
          <View style={{ paddingTop: insets.top + 12, paddingHorizontal: 18, paddingBottom: 14 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 11 }}>
              <Press onPress={() => setFilter(null)} style={{ width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: t.dark ? '#2C2C2E' : '#fff' }}>
                <Icon name="chevronL" color={t.text} size={20} />
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

        {/* ── photo grid (2 columns) ── */}
        <View style={{ paddingHorizontal: bodyPad, paddingTop: 10 }}>
          {visible.length === 0 ? (
            <View style={{ alignItems: 'center', paddingTop: 60 }}>
              <Icon name="photo" color={t.text3} size={44} />
              <Text style={{ fontSize: 17, fontWeight: '700', color: t.text, marginTop: 16 }}>
                {filter ? tr('journey.photoWall.emptyFilterTitle') : tr('journey.photoWall.emptyTitle')}
              </Text>
              <Text style={{ fontSize: 13.5, color: t.text2, textAlign: 'center', lineHeight: 20, marginTop: 8, paddingHorizontal: 24 }}>
                {filter ? tr('journey.photoWall.emptyFilterBody') : tr('journey.photoWall.emptyBody')}
              </Text>
            </View>
          ) : (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: gridGap }}>
              {visible.map((p) => (
                <Pressable
                  key={p.id}
                  onPress={() => setBoxIdx(visible.indexOf(p))}
                  style={{ width: gridColW }}
                >
                  <View style={{ aspectRatio: 1, borderRadius: 12, overflow: 'hidden' }}>
                    {inspo.uploadingIds.has(p.id) || inspo.removingIds.has(p.id) ? (
                      <View style={{ width: '100%', height: '100%', backgroundColor: t.dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)', alignItems: 'center', justifyContent: 'center' }}>
                        <ActivityIndicator color={t.text3} size="small" />
                      </View>
                    ) : p.uri ? (
                      <View style={{ width: '100%', height: '100%', backgroundColor: t.dark ? '#1a1a1a' : '#e8e8e8' }}>
                        {p.kind === 'video' ? (
                          <View style={{ width: '100%', height: '100%' }}>
                            {(p.thumbnail || thumbCache[p.id]) ? (
                              <Image source={{ uri: (p.thumbnail || thumbCache[p.id])! }} contentFit="cover" style={{ width: '100%', height: '100%' }} />
                            ) : (
                              <View style={{ width: '100%', height: '100%', backgroundColor: t.dark ? '#1c1c1e' : '#d0d0d0' }} />
                            )}
                            <View style={{ position: 'absolute', right: 5, top: 5, flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 5, paddingVertical: 2, borderRadius: 4, backgroundColor: 'rgba(0,0,0,0.5)' }}>
                              <Icon name="play" color="#fff" size={7} />
                              {p.duration ? <Text style={{ fontSize: 9.5, fontWeight: '600', color: '#fff', fontFamily: MONO }}>{fmtDuration(p.duration)}</Text> : null}
                            </View>
                          </View>
                        ) : (
                          <View style={{ width: '100%', height: '100%' }}>
                            <Image source={{ uri: p.uri }} contentFit="cover" style={{ width: '100%', height: '100%' }} />
                            {p.kind === 'livePhoto' ? (
                              <View style={{ position: 'absolute', left: 5, bottom: 5 }}>
                                <Icon name="livePhoto" color="#fff" size={14} strokeWidth={1.6} />
                              </View>
                            ) : null}
                          </View>
                        )}
                        {inspo.uploadingIds.has(p.id) || inspo.removingIds.has(p.id) ? (
                          <View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.4)', borderRadius: 12 }]}>
                            <ActivityIndicator color="#fff" size="small" />
                          </View>
                        ) : null}
                      </View>
                    ) : (
                      <PhotoTile tone={p.tone} seed={info.id + p.id} radius={12} style={{ width: '100%', height: '100%' }} resWidth={420} />
                    )}
                  </View>
                </Pressable>
              ))}
            </View>
          )}
        </View>
      </ScrollView>

      {/* ── back button (hidden in filter mode) ── */}
      {!filter ? (
        <Press
          onPress={onClose}
          style={{
            position: 'absolute',
            top: insets.top + 6,
            left: 14,
            width: 40,
            height: 40,
            borderRadius: 20,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'rgba(0,0,0,0.3)',
          }}
        >
          <Icon name="chevronL" color="#fff" size={20} />
        </Press>
      ) : null}

      {/* ── more button + popover (hidden in filter mode) ── */}
      {!filter ? (
        <Press
          onPress={() => setMoreMenu(v => !v)}
          style={{
            position: 'absolute',
            top: insets.top + 6,
            right: 14,
            width: 40,
            height: 40,
            borderRadius: 20,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'rgba(0,0,0,0.3)',
          }}
        >
          <Icon name="more" color="#fff" size={19} />
        </Press>
      ) : null}
      {moreMenu && !filter ? (
        <View style={[StyleSheet.absoluteFill, { zIndex: 160 }]}>
          <Pressable onPress={() => setMoreMenu(false)} style={StyleSheet.absoluteFill} />
          <View style={{
            position: 'absolute',
            top: insets.top + 50,
            right: 14,
            minWidth: 180,
            borderRadius: 14,
            backgroundColor: t.dark ? '#2c2c2e' : '#fff',
            overflow: 'hidden',
            boxShadow: '0px 8px 30px rgba(0,0,0,0.25)',
          }}>
            <Press
              onPress={() => { setMoreMenu(false); setSavePickerMode('delete'); setSaveSelectedIds(new Set()); openSavePicker(); }}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 13 }}
            >
              <Icon name="trash" color={t.danger} size={17} />
              <Text style={{ fontSize: 15, color: t.danger }}>{`${tr('common.delete')}${tr('journey.moments.title')}`}</Text>
            </Press>
            <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: t.hairline }} />
            <Press
              onPress={() => { setMoreMenu(false); nav.openJourneySettings(info); }}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 13 }}
            >
              <Icon name="gearSettings" color={t.text} size={17} />
              <Text style={{ fontSize: 15, color: t.text }}>{tr('journey.more.settings')}</Text>
            </Press>
          </View>
        </View>
      ) : null}

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
      {/* ── Lightbox ── */}
      {boxIdx >= 0 && visible[boxIdx] ? <Lightbox visible={visible} index={boxIdx} setIndex={setBoxIdx} onClose={() => setBoxIdx(-1)} onDelete={(id) => { inspo.remove(id); if (visible.length <= 1) setBoxIdx(-1); }} info={info} theme={t} insets={insets} nav={nav} thumbCache={thumbCache} /> : null}

      {/* ── Companions bottom sheet ── */}
      {compSheet && !filter ? (() => {
        const csBg = t.dark ? '#1c1c1e' : t.bg;
        const csCard = t.dark ? 'rgba(255,255,255,0.04)' : '#fff';
        return (
          <View style={[StyleSheet.absoluteFill, { zIndex: 140 }]}>
            <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.5)', opacity: compBackdrop }]}>
              <Press onPress={closeCompanionSheet} style={StyleSheet.absoluteFill}><View /></Press>
            </Animated.View>
            <Animated.View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: height * 0.8, backgroundColor: csBg, borderTopLeftRadius: 24, borderTopRightRadius: 24, transform: [{ translateY: compSheetY }] }}>
              <View style={{ alignItems: 'center', paddingTop: 10, paddingBottom: 6 }}>
                <View style={{ width: 36, height: 5, borderRadius: 3, backgroundColor: t.text3 }} />
              </View>
              <Text style={{ fontSize: 22, fontWeight: '800', color: t.text, paddingHorizontal: 16, marginBottom: 4 }}>{tr('journey.companions.sheetTitle')}</Text>
              <Text style={{ fontSize: 12.5, color: t.text2, paddingHorizontal: 16, marginBottom: 14 }}>{tr('journey.companions.sheetSubtitle', { count: roster.length })}</Text>
              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: insets.bottom + 20 }}>
              <View style={{ marginHorizontal: 16, borderRadius: 14, overflow: 'hidden', backgroundColor: csCard, borderWidth: StyleSheet.hairlineWidth, borderColor: t.hairline }}>
                {roster.map((c, i) => {
                  const n = counts[c.name] || 0;
                  return (
                    <View key={i}>
                      <Press
                        onPress={n > 0 ? () => { setFilter(c); setCompSheet(false); } : undefined}
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
              </ScrollView>
            </Animated.View>
          </View>
        );
      })() : null}

      {/* ── Save picker (always rendered, animated off-screen when hidden) ── */}
      <SavePickerSheet
        theme={t}
        allPhotos={allPhotos}
        saveSelectedIds={saveSelectedIds}
        setSaveSelectedIds={setSaveSelectedIds}
        toggleSaveSelect={toggleSaveSelect}
        mode={savePickerMode}
        savePicker={savePicker}
        setSavePicker={setSavePicker}
        saveSheetY={saveSheetY}
        saveBackdrop={saveBackdrop}
        saveSheetPan={saveSheetPan}
        saveScrollEnabled={saveScrollEnabled}
        saveScrollY={saveScrollY}
        closeSavePicker={closeSavePicker}
        inspo={inspo}
        info={info}
        width={width}
        height={height}
        insets={insets}
        nav={nav}
        tr={tr}
      />

      {/* ── Compose sheet: optional one-line caption before upload (always rendered) ── */}
      <View style={[StyleSheet.absoluteFill, { zIndex: 170 }]} pointerEvents={composeSheet ? 'auto' : 'none'}>
        <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.5)', opacity: composeBackdrop }]}>
          <Press onPress={closeCompose} style={StyleSheet.absoluteFill}><View /></Press>
        </Animated.View>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={{ position: 'absolute', left: 0, right: 0, bottom: 0 }}
        >
          <Animated.View style={{
            backgroundColor: t.dark ? '#1c1c1e' : t.bg,
            borderTopLeftRadius: 28,
            borderTopRightRadius: 28,
            paddingHorizontal: 18,
            paddingTop: 12,
            paddingBottom: insets.bottom + 18,
            transform: [{ translateY: composeSheetY }],
          }}>
            <View style={{ width: 38, height: 5, borderRadius: 3, backgroundColor: t.text3, alignSelf: 'center', marginBottom: 14 }} />

            {/* header */}
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
              <Press onPress={closeCompose} style={{ padding: 4 }}>
                <Text style={{ fontSize: 14.5, color: t.text2 }}>{tr('common.cancel')}</Text>
              </Press>
              <Text style={{ flex: 1, textAlign: 'center', fontSize: 16.5, fontWeight: '800', color: t.text }}>{tr('journey.photoWall.addMoment')}</Text>
              <Press onPress={confirmCompose} style={{ padding: 4 }}>
                <Text style={{ fontSize: 14.5, fontWeight: '700', color: t.accent }}>
                  {`${tr('journey.action.add')}${pendingAssets.length > 1 ? ` ${pendingAssets.length}` : ''}`}
                </Text>
              </Press>
            </View>

            {/* picked media strip */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 14 }}>
              {pendingAssets.map((a, i) => (
                <View key={i} style={{ width: 76, height: 76, borderRadius: 12, overflow: 'hidden', backgroundColor: t.dark ? '#2c2c2e' : '#e8e8e8' }}>
                  <Image source={{ uri: a.uri }} contentFit="cover" style={StyleSheet.absoluteFill} />
                  {a.type === 'video' ? (
                    <View style={{ position: 'absolute', right: 5, bottom: 5, width: 18, height: 18, borderRadius: 9, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' }}>
                      <Icon name="play" color="#fff" size={9} />
                    </View>
                  ) : null}
                </View>
              ))}
            </ScrollView>

            {/* optional caption */}
            <TextInput
              value={composeCaption}
              onChangeText={setComposeCaption}
              placeholder={tr('journey.photoWall.captionPlaceholder')}
              placeholderTextColor={t.text3}
              maxLength={40}
              returnKeyType="done"
              onSubmitEditing={confirmCompose}
              style={{
                paddingVertical: 13,
                paddingHorizontal: 15,
                borderRadius: 13,
                borderWidth: 1,
                fontSize: 15,
                backgroundColor: t.dark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)',
                borderColor: t.hairline,
                color: t.text,
              }}
            />
          </Animated.View>
        </KeyboardAvoidingView>
      </View>
    </Animated.View>
  );
}
